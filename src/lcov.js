// A reader for lcov tracefiles (lcov.info), written from the tracefile format in the geninfo manual page (saved in
// research/sources). A tracefile is lines of text in sections: SF names a source file, DA gives the count of executions of
// one line, BRDA gives one branch, LF, LH, BRF and BRH are the sums that geninfo writes, and end_of_record closes the
// section. The tool counts from the DA and BRDA records themselves and compares them with the sums; when they differ it
// uses the records and says so in a note. Records it does not use (TN, VER, FN, FNDA, FNL, FNA, FNF, FNH, MCDC, MRF, MRH
// and others) are skipped. A malformed record is refused with its line.

import { MAX_PATH_LENGTH } from './coverage.js';

export const LCOV_LIMITS = { maxFiles: 100000, maxLines: 5000000, maxBranches: 5000000, maxNotes: 100 };

export class LcovError extends Error {
  constructor(reason, line) {
    super(reason);
    this.reason = reason;
    this.line = line;
  }
}

const COUNT = /^[0-9]{1,15}$/;

// Reads one tracefile. file is the path shown in the report. Returns { files: [{ path, at, lines, branches,
// unreadableBranches }], notes, records } where each file is a section, lines is a Map from line number to { hits, file,
// line }, and branches is a Map from "line,block,branch" to { covered, total, file, line }. Throws LcovError.
export function parseLcov(text, file, limits = LCOV_LIMITS) {
  const lim = { ...LCOV_LIMITS, ...limits };
  const rows = text.charCodeAt(0) === 0xfeff ? text.slice(1).split(/\r\n|\n|\r/) : text.split(/\r\n|\n|\r/);
  const files = [];
  const notes = [];
  let current = null;
  let totalLines = 0;
  let totalBranches = 0;
  let records = 0;
  const note = (message) => {
    if (notes.length < lim.maxNotes) notes.push(message);
  };

  for (let k = 0; k < rows.length; k += 1) {
    const lineNo = k + 1;
    const row = rows[k].trim();
    if (row === '' || row[0] === '#') continue;
    const colon = row.indexOf(':');
    const kind = colon === -1 ? row : row.slice(0, colon);
    const rest = colon === -1 ? '' : row.slice(colon + 1);
    records += 1;
    if (kind === 'SF') {
      if (current) throw new LcovError('an SF record starts a new source file before end_of_record closed the last one', lineNo);
      if (rest === '') throw new LcovError('an SF record with no path', lineNo);
      if (rest.length > MAX_PATH_LENGTH) throw new LcovError(`an SF path longer than ${MAX_PATH_LENGTH} characters`, lineNo);
      if (/[\u0000-\u001f\u007f]/.test(rest)) throw new LcovError('an SF path with a control character', lineNo);
      if (files.length >= lim.maxFiles) throw new LcovError(`more than ${lim.maxFiles.toLocaleString('en-US')} source files`, lineNo);
      current = { path: rest, at: { file, line: lineNo }, lines: new Map(), branches: new Map(), unreadableBranches: [], declared: {} };
      continue;
    }
    if (kind === 'end_of_record') {
      if (!current) throw new LcovError('end_of_record with no SF record before it', lineNo);
      compare(current, file, note);
      delete current.declared;
      files.push(current);
      current = null;
      continue;
    }
    if (kind === 'DA' || kind === 'BRDA' || kind === 'LF' || kind === 'LH' || kind === 'BRF' || kind === 'BRH') {
      if (!current) throw new LcovError(`a ${kind} record outside a source file section (no SF record before it)`, lineNo);
    } else continue;

    if (kind === 'DA') {
      const parts = rest.split(',');
      if (parts.length < 2 || parts.length > 3) throw new LcovError('a DA record needs a line number and a count of executions, and may have a checksum after them', lineNo);
      const [number, hits] = parts;
      if (!COUNT.test(number) || Number(number) < 1 || !Number.isSafeInteger(Number(number))) throw new LcovError(`a DA record with the line number "${number.slice(0, 20)}"; a line number is a whole number from 1`, lineNo);
      if (!COUNT.test(hits) || !Number.isSafeInteger(Number(hits))) throw new LcovError(`a DA record with the count "${hits.slice(0, 20)}"; a count of executions is a whole number from 0`, lineNo);
      const n = Number(number);
      const h = Number(hits);
      const have = current.lines.get(n);
      if (!have) {
        totalLines += 1;
        if (totalLines > lim.maxLines) throw new LcovError(`more than ${lim.maxLines.toLocaleString('en-US')} DA records`, lineNo);
        current.lines.set(n, { hits: h, file, line: lineNo });
      } else if (h > have.hits) current.lines.set(n, { hits: h, file, line: lineNo });
    } else if (kind === 'BRDA') {
      // The branch may hold commas, so the line and the block are read from the front and the count from the back.
      const first = rest.indexOf(',');
      const second = first === -1 ? -1 : rest.indexOf(',', first + 1);
      const last = rest.lastIndexOf(',');
      if (first === -1 || second === -1 || last <= second) throw new LcovError('a BRDA record needs four fields: the line, the block, the branch and the taken value', lineNo);
      const number = rest.slice(0, first);
      const block = rest.slice(first + 1, second);
      const branch = rest.slice(second + 1, last);
      const taken = rest.slice(last + 1);
      if (!COUNT.test(number) || Number(number) < 1 || !Number.isSafeInteger(Number(number))) throw new LcovError(`a BRDA record with the line number "${number.slice(0, 20)}"; a line number is a whole number from 1`, lineNo);
      if (!/^e?[0-9]{1,15}$/.test(block)) throw new LcovError(`a BRDA record with the block "${block.slice(0, 20)}"; a block is a whole number, with an e in front for an exception branch`, lineNo);
      if (branch === '') throw new LcovError('a BRDA record with an empty branch', lineNo);
      if (taken !== '-' && (!COUNT.test(taken) || !Number.isSafeInteger(Number(taken)))) throw new LcovError(`a BRDA record with the taken value "${taken.slice(0, 20)}"; it is - when the branch was never evaluated, or a whole number`, lineNo);
      const key = `${number},${block},${branch}`;
      const covered = taken !== '-' && Number(taken) > 0 ? 1 : 0;
      const have = current.branches.get(key);
      if (!have) {
        totalBranches += 1;
        if (totalBranches > lim.maxBranches) throw new LcovError(`more than ${lim.maxBranches.toLocaleString('en-US')} BRDA records`, lineNo);
        current.branches.set(key, { covered, total: 1, file, line: lineNo });
      } else if (covered > have.covered) current.branches.set(key, { covered, total: 1, file, line: lineNo });
    } else {
      if (!COUNT.test(rest) || !Number.isSafeInteger(Number(rest))) throw new LcovError(`a ${kind} record with the value "${rest.slice(0, 20)}"; it is a whole number`, lineNo);
      current.declared[kind] = { value: Number(rest), line: lineNo };
    }
  }
  if (current) throw new LcovError(`the file ends inside the section of ${current.path.slice(0, 120)} (no end_of_record)`, rows.length);
  return { files, notes, records };
}

// Compares the sums written by geninfo with what the records show, for one section.
function compare(section, file, note) {
  const found = section.lines.size;
  let hit = 0;
  for (const l of section.lines.values()) if (l.hits > 0) hit += 1;
  let bFound = 0;
  let bHit = 0;
  for (const b of section.branches.values()) {
    bFound += b.total;
    bHit += b.covered;
  }
  const check = (kind, actual, what) => {
    const d = section.declared[kind];
    if (d && d.value !== actual) note(`${file}:${d.line}: ${kind} says ${d.value} but the ${what} of ${section.path.slice(0, 100)} count ${actual}; the records are used`);
  };
  check('LF', found, 'DA records');
  check('LH', hit, 'DA records with a count above zero');
  check('BRF', bFound, 'BRDA records');
  check('BRH', bHit, 'BRDA records with a count above zero');
}
