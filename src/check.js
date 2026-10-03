// Reads the inputs named on the command line, evaluates the gates of the criteria and returns one report. The criteria are
// read first; an input that no gate of the criteria uses is not read and is named in a note. A file that cannot be read, a
// result file that is not well-formed, a coverage file with a malformed record or a defect export without the named columns
// is an input error: the tool does not decide on evidence it only half read. The tool reads the files it is given, runs no
// test and opens no connection.

import { stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { FILE_LIMITS, displayPath, evidenceState, readRunPaths, readTextFile } from './files.js';
import { XML_LIMITS, parseXml, xmlProblem } from './xml.js';
import { readJunit, summarizeRun } from './junit.js';
import { CriteriaError, readCriteria } from './criteria.js';
import { LcovError, parseLcov } from './lcov.js';
import { CoberturaError, readCobertura } from './cobertura.js';
import { MAX_PATH_LENGTH, addFile, createStore, normalizePath } from './coverage.js';
import { readDefects } from './defects.js';
import { decide, evaluate, GATES, AREAS } from './gates.js';
import { safeText } from './text.js';
import { grouped, listText, plural } from './size.js';

export const LIMITS = { ...FILE_LIMITS, ...XML_LIMITS, maxCoverageFiles: 100000, maxChanged: 100000, maxCoverageInputs: 100 };
export { AREAS, GATES };

// An error that stops the run before a decision: every problem is one line of text.
export class InputError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

const shown = (text, max = 400) => safeText(text, max);

// Reads one run of JUnit results from paths: returns { label, files: [{ file, cases }], tests, counts, caseCount } and pushes
// problems and notes. Every file that cannot be read is a problem.
async function readResults(paths, label, base, limits, budget, problems, notes) {
  const run = await readRunPaths(paths, base, limits, budget);
  const cases = [];
  const files = [];
  for (const f of run.files) {
    let reason = f.reason;
    if (reason === null) {
      try {
        const doc = parseXml(f.text, limits);
        const r = readJunit(doc, f.file);
        cases.push(...r.cases);
        files.push({ file: f.file, cases: r.cases.length });
        for (const n of r.notes) notes.push(`${shown(f.file, 200)}: ${n}`);
      } catch (error) {
        reason = xmlProblem(error, f.text);
      }
    }
    if (reason !== null) problems.push(`${shown(f.file, 300)}: ${shown(reason)}`);
  }
  const where = label;
  if (run.links.length) notes.push(`${where}: ${plural(run.links.length, 'symbolic link')} ${run.links.length === 1 ? 'was' : 'were'} not followed: ${listText(run.links.map((l) => shown(l, 160)), 5)}`);
  if (run.skipped.length) notes.push(`${where}: ${plural(run.skipped.length, 'folder')} of tools or caches ${run.skipped.length === 1 ? 'was' : 'were'} not entered: ${listText(run.skipped.map((l) => shown(l, 160)), 5)}`);
  if (run.special.length) notes.push(`${where}: ${plural(run.special.length, 'entry', 'entries')} ${run.special.length === 1 ? 'is' : 'are'} not a regular file or folder, or could not be read: ${listText(run.special.map((u) => `${shown(u.path, 160)} (${shown(u.reason, 80)})`), 5)}`);
  if (run.otherFiles) notes.push(`${where}: ${plural(run.otherFiles, 'file')} not ending in .xml ${run.otherFiles === 1 ? 'was' : 'were'} not read`);
  if (!run.files.length) notes.push(`${where}: no XML file was found, so this run holds no test result`);
  const { tests, counts } = summarizeRun(cases);
  return { label, paths: run.path, files, tests, counts, caseCount: cases.length };
}

// Reads the coverage files into one store. A file that starts with < is read as Cobertura XML, any other as lcov.
async function readCoverage(paths, base, limits, problems, notes) {
  const store = createStore();
  for (const path of paths) {
    let file;
    try {
      file = await readTextFile(path, base, limits.maxFileBytes);
    } catch (error) {
      problems.push(shown(error.message));
      continue;
    }
    const head = file.text.trimStart();
    try {
      if (head.startsWith('<')) {
        const doc = parseXml(file.text, limits);
        const r = readCobertura(doc, file.file);
        for (const c of r.classes) addFile(store, c);
        for (const n of r.notes) notes.push(shown(n, 400));
        store.reports.push({ file: file.file, kind: 'Cobertura', files: r.classes.length });
      } else {
        const r = parseLcov(file.text, file.file);
        for (const s of r.files) addFile(store, s);
        for (const n of r.notes) notes.push(shown(n, 400));
        store.reports.push({ file: file.file, kind: 'lcov', files: r.files.length });
      }
    } catch (error) {
      if (error instanceof LcovError || error instanceof CoberturaError) problems.push(`${shown(file.file, 300)}:${error.line}: ${shown(error.reason)}`);
      else problems.push(`${shown(file.file, 300)}: ${shown(xmlProblem(error, file.text))}`);
    }
    if (store.files.size > limits.maxCoverageFiles) {
      problems.push(`${shown(file.file, 300)}: the coverage reports hold more than ${grouped(limits.maxCoverageFiles)} source files`);
      break;
    }
  }
  return store;
}

// Reads the list of changed files: one path a line, blank lines and lines that start with # skipped.
async function readChanged(path, base, limits, problems) {
  let file;
  try {
    file = await readTextFile(path, base, limits.maxFileBytes);
  } catch (error) {
    problems.push(shown(error.message));
    return null;
  }
  const entries = [];
  const seen = new Set();
  const rows = file.text.split(/\r\n|\n|\r/);
  for (let k = 0; k < rows.length; k += 1) {
    const raw = rows[k].trim();
    if (raw === '' || raw.startsWith('#')) continue;
    if (/[\u0000-\u001f\u007f]/.test(raw)) {
      problems.push(`${shown(file.file, 300)}:${k + 1}: a path with a control character`);
      continue;
    }
    if (raw.length > MAX_PATH_LENGTH) {
      problems.push(`${shown(file.file, 300)}:${k + 1}: a path longer than ${MAX_PATH_LENGTH} characters`);
      continue;
    }
    const p = normalizePath(raw);
    if (seen.has(p)) continue;
    seen.add(p);
    if (entries.length >= limits.maxChanged) {
      problems.push(`${shown(file.file, 300)}: more than ${grouped(limits.maxChanged)} changed files`);
      break;
    }
    entries.push({ path: p, line: k + 1 });
  }
  return { file: file.file, entries };
}

// Reads the inputs and builds the report. options: criteria (the path), junit, history, coverage (lists of paths), changed,
// defects (paths), evidenceRoot, strict, explain, version, base, limits. Throws InputError or CriteriaError text as an
// InputError with one line per problem.
export async function checkPaths(options) {
  const base = options.base ?? process.cwd();
  const limits = { ...LIMITS, ...(options.limits ?? {}) };
  const notes = [];
  const problems = [];

  let criteriaFile;
  try {
    criteriaFile = await readTextFile(options.criteria, base, limits.maxCriteriaBytes);
  } catch (error) {
    throw new InputError([shown(error.message)]);
  }
  let criteria;
  try {
    criteria = readCriteria(criteriaFile.text, criteriaFile.file);
  } catch (error) {
    if (error instanceof CriteriaError) throw new InputError(error.problems.map((p) => shown(p.text, 600)));
    throw error;
  }

  const wantsTests = Boolean(criteria.tests && Object.keys(criteria.tests).some((k) => criteria.tests[k] !== undefined));
  const wantsCoverage = Boolean(criteria.coverage);
  const wantsChanged = Boolean(criteria.coverage?.changedFiles);
  const wantsDefects = Boolean(criteria.defects);
  const wantsEvidence = Boolean(criteria.evidence);
  const given = (list) => list && list.length > 0;
  const budget = { total: 0, entries: 0, xml: 0 };
  const data = { junit: null, coverage: null, changed: null, defects: null, evidence: null };

  if (given(options.junit) || given(options.history)) {
    if (!wantsTests) notes.push('--junit or --history was given, but the criteria state no test gate; the results were not read');
    else {
      if ((options.history ?? []).length > limits.maxRuns) throw new InputError([`more than ${limits.maxRuns} --history runs`]);
      const history = [];
      const seen = new Set();
      for (const path of options.history ?? []) {
        const full = resolve(base, path);
        if (seen.has(full)) {
          problems.push(`${shown(displayPath(full, base), 300)}: named twice as a --history run`);
          continue;
        }
        seen.add(full);
        history.push(await readResults([path], shown(basename(full), 80), base, limits, budget, problems, notes));
      }
      const labels = history.map((h) => h.label);
      const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
      if (dup.length) for (const h of history) if (dup.includes(h.label)) h.label = shown(h.paths, 120);
      let candidate = null;
      if (given(options.junit)) candidate = await readResults(options.junit, 'release candidate', base, limits, budget, problems, notes);
      else notes.push('--history was given without --junit: there is no release candidate run, so the test gates are not checked');
      data.junit = { candidate, history };
    }
  }
  if (given(options.coverage)) {
    if (!wantsCoverage) notes.push('--coverage was given, but the criteria state no coverage gate; the files were not read');
    else if (options.coverage.length > limits.maxCoverageInputs) throw new InputError([`more than ${limits.maxCoverageInputs} --coverage files`]);
    else data.coverage = { store: await readCoverage(options.coverage, base, limits, problems, notes) };
  }
  if (options.changed) {
    if (!wantsChanged) notes.push('--changed was given, but the criteria state no coverage.changedFiles gate; the file was not read');
    else data.changed = await readChanged(options.changed, base, limits, problems);
  }
  if (options.defects) {
    if (!wantsDefects) notes.push('--defects was given, but the criteria state no defects gate; the file was not read');
    else {
      try {
        const file = await readTextFile(options.defects, base, limits.maxFileBytes);
        const r = readDefects(file.text, { columns: criteria.defects.columns, delimiter: criteria.defects.delimiter, closedStatuses: criteria.defects.closedStatuses });
        if (r.problem) problems.push(`${shown(file.file, 300)}: ${shown(r.problem, 500)}`);
        else {
          data.defects = { file: file.file, rows: r.rows, duplicates: r.duplicates };
          if (r.duplicates.length) notes.push(`${file.file}: ${plural(r.duplicates.length, 'defect id')} appear${r.duplicates.length === 1 ? 's' : ''} on more than one line; the first line of each is used`);
        }
      } catch (error) {
        problems.push(shown(error.message));
      }
    }
  }
  if (wantsEvidence) {
    const root = resolve(base, options.evidenceRoot ?? '.');
    let info = null;
    try {
      info = await stat(root);
    } catch (error) {
      problems.push(`${shown(displayPath(root, base), 300)}: the evidence folder ${error.code === 'ENOENT' ? 'does not exist' : `cannot be read (${error.code ?? error.message})`}`);
    }
    if (info && !info.isDirectory()) problems.push(`${shown(displayPath(root, base), 300)}: the evidence folder is not a folder`);
    else if (info) {
      const states = new Map();
      for (const p of criteria.evidence.required) states.set(p, await evidenceState(root, p));
      data.evidence = { root: displayPath(root, base), states };
    }
  } else if (options.evidenceRoot) notes.push('--evidence-root was given, but the criteria state no evidence gate');

  if (problems.length) throw new InputError(problems);

  const gates = evaluate(criteria, data);
  const decision = decide(gates, Boolean(options.strict));

  return {
    tool: 'release-gate-check',
    version: options.version ?? '0.0.0',
    criteria: { file: shown(criteriaFile.file, 300), name: criteria.name },
    strict: Boolean(options.strict),
    inputs: {
      results: data.junit?.candidate ? { paths: shown(data.junit.candidate.paths, 400), files: data.junit.candidate.files.length, testcases: data.junit.candidate.caseCount, tests: data.junit.candidate.tests.size } : null,
      history: data.junit ? data.junit.history.map((h) => ({ run: h.label, files: h.files.length, tests: h.tests.size })) : [],
      coverage: data.coverage ? { reports: data.coverage.store.reports, files: data.coverage.store.files.size } : null,
      changed: data.changed ? { file: shown(data.changed.file, 300), files: data.changed.entries.length } : null,
      defects: data.defects ? { file: shown(data.defects.file, 300), defects: data.defects.rows.length } : null,
      evidence: data.evidence ? { root: shown(data.evidence.root, 300), required: criteria.evidence.required.length } : null
    },
    gates,
    counts: { met: decision.met, notMet: decision.notMet, notChecked: decision.notChecked },
    decision: { verdict: decision.verdict, go: decision.go, reasons: decision.reasons },
    notes: notes.map((n) => shown(n, 1200))
  };
}
