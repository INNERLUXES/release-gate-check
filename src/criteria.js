// The criteria file: the exit criteria of the release, written before the release as JSON. Every gate is optional, every
// number comes from this file (the tool has no built-in threshold), and every key it does not know is an error, so a typo
// such as minPasRate cannot silently switch a gate off. The file is read with the strict JSON reader of src/json.js, which
// refuses an object that names a key twice. validateCriteria returns the criteria in the form the gates use, or throws a
// CriteriaError that lists every problem with its line.

import { JsonError, jsonProblem, parseJson } from './json.js';
import { scaledPercent } from './ratio.js';
import { GLOB_LIMITS, globProblem } from './glob.js';
import { norm, DEFAULT_COLUMNS } from './defects.js';
import { isDelimiter } from './csv.js';
import { safeText } from './text.js';

export const CRITERIA_LIMITS = { maxSuites: 500, maxExplained: 5000, maxStatuses: 100, maxSeverities: 50, maxEvidence: 200, maxString: 500 };

// The keys of the criteria file, as a tree: what each level may hold. A gate is a key with a number, a count or an object.
export const KEYS = {
  name: 'string',
  tests: {
    minPassRate: 'percent',
    maxSkippedShare: 'percent',
    maxFlaky: 'count',
    criticalSuites: { suites: 'strings', maxFailing: 'count' },
    noUnexplainedFailures: { lastRuns: 'runs', explained: 'strings' }
  },
  coverage: {
    minLine: 'percent',
    minBranch: 'percent',
    exclude: 'globs',
    changedFiles: { minLine: 'percent', minBranch: 'percent', ignore: 'globs' }
  },
  defects: {
    columns: { id: 'string', severity: 'string', status: 'string' },
    delimiter: 'delimiter',
    closedStatuses: 'strings',
    maxOpen: 'counts',
    maxOpenTotal: 'count'
  },
  evidence: { required: 'paths' }
};

export class CriteriaError extends Error {
  constructor(problems) {
    super(problems.map((p) => p.text).join('\n'));
    this.problems = problems;
  }
}

// The edit distance of two short words, for the "did you mean" of an unknown key.
function distance(a, b) {
  if (a.length > 40 || b.length > 40) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v === 'object' ? 'an object' : typeof v === 'string' ? 'a string' : typeof v === 'number' ? 'a number' : 'a boolean');

// An evidence path as written in the criteria: relative, forward slashes, below the evidence root. Returns { path } with
// the path cleaned of ./ and doubled slashes, or { problem }.
export function evidencePath(value) {
  if (typeof value !== 'string' || value.trim() === '') return { problem: 'is empty; write the path of a file' };
  if (value.length > 300) return { problem: 'is longer than 300 characters' };
  if (/[\u0000-\u001f\u007f]/.test(value)) return { problem: 'holds a control character' };
  if (value.includes('\\')) return { problem: 'holds a backslash; write the path with forward slashes' };
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return { problem: 'is an absolute path; write a path below the evidence folder' };
  if (value.endsWith('/')) return { problem: 'names a folder; give the path of a file' };
  const parts = value.split('/').filter((p) => p !== '' && p !== '.');
  if (!parts.length) return { problem: 'is empty; write the path of a file' };
  if (parts.includes('..')) return { problem: 'goes up with ..; evidence is a file below the evidence folder' };
  return { path: parts.join('/') };
}

// Checks the value of the criteria against KEYS and builds the normal form. problems collects { text }.
export function validateCriteria(value, lines = new Map(), file = 'criteria') {
  const problems = [];
  const lim = CRITERIA_LIMITS;
  const at = (path) => (path === '' ? file : `${file}${lines.has(path) ? `:${lines.get(path)}` : ''}: ${path}`);
  const bad = (path, message) => problems.push({ path, text: `${at(path)}: ${message}` });

  const percent = (v, path) => {
    if (typeof v !== 'number') return bad(path, `must be a number from 0 to 100, not ${kindOf(v)}`);
    const s = scaledPercent(v);
    if (s === null) return bad(path, `${safeText(String(v), 30)} is not a percentage from 0 to 100 with at most four decimals`);
    return { scaled: s, shown: v };
  };
  const count = (v, path, max = Number.MAX_SAFE_INTEGER) => {
    if (typeof v !== 'number') return bad(path, `must be a whole number of 0 or more, not ${kindOf(v)}`);
    if (!Number.isSafeInteger(v) || v < 0 || v > max) return bad(path, `${safeText(String(v), 30)} is not a whole number from 0${max < Number.MAX_SAFE_INTEGER ? ` to ${max}` : ''}`);
    return v;
  };
  const runs = (v, path) => {
    if (typeof v !== 'number') return bad(path, `must be a whole number of runs from 1 to 100, not ${kindOf(v)}`);
    if (!Number.isSafeInteger(v) || v < 1 || v > 100) return bad(path, `${safeText(String(v), 30)} is not a whole number of runs from 1 to 100; 0 runs would check nothing`);
    return v;
  };
  const strings = (v, path, max, { nonEmpty = true } = {}) => {
    if (!Array.isArray(v)) return bad(path, `must be a list of strings, not ${kindOf(v)}`);
    if (nonEmpty && v.length === 0) return bad(path, 'is an empty list; name at least one');
    if (v.length > max) return bad(path, `holds more than ${max} entries`);
    let ok = true;
    const out = [];
    v.forEach((s, i) => {
      if (typeof s !== 'string' || s.trim() === '') {
        bad(`${path}[${i}]`, 'must be a string that is not empty');
        ok = false;
      } else if (s.length > lim.maxString || /[\u0000-\u001f\u007f]/.test(s)) {
        bad(`${path}[${i}]`, `must be at most ${lim.maxString} characters with no control character`);
        ok = false;
      } else out.push(s);
    });
    return ok ? out : undefined;
  };
  const globs = (v, path) => {
    if (!Array.isArray(v)) return bad(path, `must be a list of file patterns, not ${kindOf(v)}`);
    if (v.length > GLOB_LIMITS.maxPatterns) return bad(path, `holds more than ${GLOB_LIMITS.maxPatterns} patterns`);
    let ok = true;
    const out = [];
    v.forEach((p, i) => {
      const problem = globProblem(p);
      if (problem) {
        bad(`${path}[${i}]`, `the pattern ${problem}`);
        ok = false;
      } else out.push(p.startsWith('./') ? p.slice(2) : p);
    });
    return ok ? out : undefined;
  };
  const paths = (v, path) => {
    if (!Array.isArray(v)) return bad(path, `must be a list of paths, not ${kindOf(v)}`);
    if (v.length === 0) return bad(path, 'is an empty list; name at least one file');
    if (v.length > lim.maxEvidence) return bad(path, `holds more than ${lim.maxEvidence} entries`);
    let ok = true;
    const out = [];
    v.forEach((p, i) => {
      const r = evidencePath(p);
      if (r.problem) {
        bad(`${path}[${i}]`, `the path ${r.problem}`);
        ok = false;
      } else if (out.includes(r.path)) {
        bad(`${path}[${i}]`, `the path ${safeText(r.path, 80)} is named twice`);
        ok = false;
      } else out.push(r.path);
    });
    return ok ? out : undefined;
  };

  // Walks a level of the criteria against its allowed keys; returns the checked values by key.
  const level = (obj, spec, path) => {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      bad(path, `must be an object, not ${kindOf(obj)}`);
      return null;
    }
    const out = {};
    for (const key of Object.keys(obj)) {
      const p = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(spec, key)) {
        const near = Object.keys(spec).map((k) => [k, distance(k.toLowerCase(), key.toLowerCase())]).sort((a, b) => a[1] - b[1])[0];
        bad(p, `unknown key${near && near[1] <= 3 ? `; did you mean ${near[0]}?` : `; the keys here are ${Object.keys(spec).join(', ')}`}`);
        continue;
      }
      const kind = spec[key];
      const v = obj[key];
      if (typeof kind === 'object') out[key] = level(v, kind, p);
      else if (kind === 'string') {
        if (typeof v !== 'string' || v.trim() === '') bad(p, `must be a string that is not empty, not ${kindOf(v)}`);
        else if (v.length > lim.maxString || /[\u0000-\u001f\u007f]/.test(v)) bad(p, `must be at most ${lim.maxString} characters with no control character`);
        else out[key] = v;
      } else if (kind === 'percent') out[key] = percent(v, p);
      else if (kind === 'count') out[key] = count(v, p);
      else if (kind === 'runs') out[key] = runs(v, p);
      else if (kind === 'strings') out[key] = strings(v, p, key === 'explained' ? lim.maxExplained : key === 'closedStatuses' ? lim.maxStatuses : lim.maxSuites, { nonEmpty: key !== 'explained' });
      else if (kind === 'globs') out[key] = globs(v, p);
      else if (kind === 'paths') out[key] = paths(v, p);
      else if (kind === 'delimiter') {
        if (typeof v !== 'string' || !isDelimiter(v)) bad(p, 'must be one of "," ";" or a tab ("\\t")');
        else out[key] = v;
      } else if (kind === 'counts') {
        if (v === null || typeof v !== 'object' || Array.isArray(v)) bad(p, `must be an object of severity names and counts, not ${kindOf(v)}`);
        else if (Object.keys(v).length === 0) bad(p, 'is empty; name at least one severity');
        else if (Object.keys(v).length > lim.maxSeverities) bad(p, `holds more than ${lim.maxSeverities} severities`);
        else {
          const list = [];
          const seen = new Set();
          for (const sev of Object.keys(v)) {
            const n = count(v[sev], `${p}.${sev}`);
            if (sev.trim() === '' || sev.length > 60) bad(`${p}.${sev.slice(0, 30)}`, 'a severity name is 1 to 60 characters');
            else if (seen.has(norm(sev))) bad(`${p}.${sev}`, 'names the same severity as another key (compared without case)');
            else if (n !== undefined) {
              seen.add(norm(sev));
              list.push({ name: norm(sev), shown: safeText(sev.trim(), 60), max: n });
            }
          }
          out[key] = list;
        }
      }
    }
    return out;
  };

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    bad('', `the criteria must be one JSON object, not ${kindOf(value)}`);
    throw new CriteriaError(problems);
  }
  const top = level(value, KEYS, '');
  const c = { name: typeof top?.name === 'string' ? safeText(top.name, 120) : '', tests: null, coverage: null, defects: null, evidence: null };

  // Gates that need more than one key, and combinations that would state no gate.
  const t = top.tests;
  if (t) {
    if (t.criticalSuites && (t.criticalSuites.suites === undefined || t.criticalSuites.maxFailing === undefined) && !problems.some((p) => p.path.startsWith('tests.criticalSuites'))) bad('tests.criticalSuites', 'needs both suites and maxFailing; no limit is built in');
    if (t.noUnexplainedFailures && t.noUnexplainedFailures.lastRuns === undefined && !problems.some((p) => p.path.startsWith('tests.noUnexplainedFailures'))) bad('tests.noUnexplainedFailures', 'needs lastRuns, the number of runs to look back over');
    if (t.noUnexplainedFailures && t.noUnexplainedFailures.explained === undefined) t.noUnexplainedFailures.explained = [];
    c.tests = t;
  }
  const cv = top.coverage;
  if (cv) {
    const hasGate = cv.minLine !== undefined || cv.minBranch !== undefined || cv.changedFiles;
    if (!hasGate && !problems.some((p) => p.path.startsWith('coverage'))) bad('coverage', 'states no gate: give minLine, minBranch or changedFiles');
    if (cv.changedFiles && cv.changedFiles.minLine === undefined && cv.changedFiles.minBranch === undefined && !problems.some((p) => p.path.startsWith('coverage.changedFiles'))) bad('coverage.changedFiles', 'states no gate: give minLine or minBranch');
    if (cv.exclude && cv.minLine === undefined && cv.minBranch === undefined && !problems.some((p) => p.path.startsWith('coverage.exclude'))) bad('coverage.exclude', 'leaves files out of the overall coverage, but no overall minLine or minBranch is stated');
    c.coverage = cv;
  }
  const d = top.defects;
  if (d) {
    if (d.closedStatuses === undefined && !problems.some((p) => p.path.startsWith('defects.closedStatuses'))) bad('defects.closedStatuses', 'is needed: the statuses that mean a defect is closed; every other status is open');
    if (d.maxOpen === undefined && d.maxOpenTotal === undefined && !problems.some((p) => p.path.startsWith('defects.max'))) bad('defects', 'states no limit: give maxOpen (by severity) or maxOpenTotal');
    c.defects = d;
  }
  if (top.evidence) {
    if (top.evidence.required === undefined && !problems.some((p) => p.path.startsWith('evidence'))) bad('evidence', 'states no file: give required, the list of files that must be present');
    c.evidence = top.evidence;
  }
  if (!problems.length) {
    const has = (o, keys) => o && keys.some((k) => o[k] !== undefined && o[k] !== null);
    const gates = has(c.tests, ['minPassRate', 'maxSkippedShare', 'maxFlaky', 'criticalSuites', 'noUnexplainedFailures']) || has(c.coverage, ['minLine', 'minBranch', 'changedFiles']) || has(c.defects, ['maxOpen', 'maxOpenTotal']) || has(c.evidence, ['required']);
    if (!gates) bad('', 'states no gate; a release gate with no gate would always say go');
  }
  if (problems.length) throw new CriteriaError(problems);
  return c;
}

// Reads the text of a criteria file into the normal form. file is the path shown. Throws CriteriaError with every problem.
export function readCriteria(text, file = 'criteria') {
  let parsed;
  try {
    parsed = parseJson(text);
  } catch (error) {
    if (error instanceof JsonError) throw new CriteriaError([{ path: '', text: `${file}: ${jsonProblem(error, text)}` }]);
    throw error;
  }
  const c = validateCriteria(parsed.value, parsed.lines, file);
  c.columns = { ...DEFAULT_COLUMNS, ...(c.defects?.columns ?? {}) };
  return c;
}
