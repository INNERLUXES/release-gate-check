// A reader for Cobertura XML coverage reports, written from the DTD of Cobertura (coverage-04.dtd) and the code of
// coverage.py that writes the same shape; both are saved in research/sources. The tree comes from the strict XML reader of
// src/xml.js, so a DOCTYPE is refused. From each class the tool takes the filename and the line elements directly inside
// the lines element of the class. The lines of the methods are left out on purpose: the DTD gives a class both a methods
// element and a lines element, and the methods repeat lines of the class, so counting both would count a line twice.
// A line is covered when its hits are above zero. A line with branch="true" gives its branches in condition-coverage as
// "50% (1/2)"; a branch line whose condition-coverage has no such counts is kept apart, and a branch figure is not given
// for it.

import { MAX_PATH_LENGTH } from './coverage.js';

export class CoberturaError extends Error {
  constructor(reason, line) {
    super(reason);
    this.reason = reason;
    this.line = line;
  }
}

const COUNT = /^[0-9]{1,15}$/;
const CONDITION = /^[0-9]{1,3}%\s{0,3}\(([0-9]{1,9})\/([0-9]{1,9})\)$/;

// Reads the tree of one report. file is the path shown. Returns { classes: [{ path, at, lines, branches,
// unreadableBranches }], notes }. Throws CoberturaError.
export function readCobertura(doc, file) {
  const root = doc.root;
  if (root.name !== 'coverage') throw new CoberturaError(`the root element is <${root.name}>, not <coverage>`, root.line);
  const classes = [];
  const notes = [];
  const pending = [root];
  let linesRead = 0;
  while (pending.length) {
    const el = pending.pop();
    for (let k = el.children.length - 1; k >= 0; k -= 1) {
      const child = el.children[k];
      if (child.name === 'class') classes.push(child);
      else if (child.name === 'packages' || child.name === 'package' || child.name === 'classes') pending.push(child);
    }
  }
  classes.sort((a, b) => a.offset - b.offset);
  const out = [];
  for (const c of classes) {
    const path = c.attrs.get('filename');
    if (path === undefined || path.trim() === '') throw new CoberturaError('a <class> with no filename attribute', c.line);
    if (path.length > MAX_PATH_LENGTH) throw new CoberturaError(`a filename longer than ${MAX_PATH_LENGTH} characters`, c.line);
    if (/[\u0000-\u001f\u007f]/.test(path)) throw new CoberturaError('a filename with a control character', c.line);
    const lines = new Map();
    const branches = new Map();
    const unreadableBranches = [];
    for (const group of c.children) {
      if (group.name !== 'lines') continue;
      for (const l of group.children) {
        if (l.name !== 'line') continue;
        linesRead += 1;
        const number = l.attrs.get('number');
        const hits = l.attrs.get('hits');
        if (number === undefined || !COUNT.test(number) || Number(number) < 1 || !Number.isSafeInteger(Number(number))) throw new CoberturaError(`a <line> whose number is ${number === undefined ? 'missing' : `"${number.slice(0, 20)}"`}; the DTD requires it, and it is a whole number from 1`, l.line);
        if (hits === undefined || !COUNT.test(hits) || !Number.isSafeInteger(Number(hits))) throw new CoberturaError(`a <line> whose hits is ${hits === undefined ? 'missing' : `"${hits.slice(0, 20)}"`}; the DTD requires it, and it is a whole number from 0`, l.line);
        const n = Number(number);
        const h = Number(hits);
        const have = lines.get(n);
        if (!have || h > have.hits) lines.set(n, { hits: h, file, line: l.line });
        if (l.attrs.get('branch') === 'true') {
          const cond = CONDITION.exec((l.attrs.get('condition-coverage') ?? '').trim());
          if (!cond) unreadableBranches.push({ line: n, file, at: l.line });
          else {
            const covered = Number(cond[1]);
            const total = Number(cond[2]);
            if (total < 1 || covered > total) unreadableBranches.push({ line: n, file, at: l.line });
            else {
              const key = `line:${n}`;
              const prev = branches.get(key);
              if (!prev) branches.set(key, { covered, total, file, line: l.line });
              else branches.set(key, { covered: Math.max(prev.covered, covered), total: Math.max(prev.total, total), file, line: l.line });
            }
          }
        }
      }
    }
    out.push({ path, at: { file, line: c.line }, lines, branches, unreadableBranches });
  }
  if (!out.length) notes.push(`${file}: the report holds no <class> element, so it holds no coverage`);
  else if (!linesRead) notes.push(`${file}: the report holds classes but no <line> element, so it holds no coverage`);
  return { classes: out, notes };
}
