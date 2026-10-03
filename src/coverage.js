// The coverage store: what the lcov and Cobertura readers found, merged by source file, and the sums the gates compare with
// the criteria. A line is covered when its count of executions is above zero in any report; a branch unit is covered the
// same way. Nothing is guessed: a file with no lines adds nothing, and a branch that a report does not say how to count is
// kept apart, so a branch figure that would rest on it is not given.

import { matchesAny } from './glob.js';

// A path as compared: backslashes as forward slashes, no leading ./ and no doubled slash.
export function normalizePath(path) {
  let p = String(path).trim().replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  return p.replace(/\/{2,}/g, '/');
}

export function createStore() {
  return { files: new Map(), reports: [] };
}

// Adds one file of a report. data: { path, lines: Map(number -> { hits, file, line }), branches: Map(key -> { covered, total,
// file, line }), unreadableBranches: [{ line, file, at }], at: { file, line } }.
export function addFile(store, data) {
  const key = normalizePath(data.path);
  let entry = store.files.get(key);
  if (!entry) {
    entry = { path: key, lines: new Map(), branches: new Map(), unreadableBranches: [], at: [] };
    store.files.set(key, entry);
  }
  entry.at.push(data.at);
  for (const [number, l] of data.lines) {
    const have = entry.lines.get(number);
    if (!have) entry.lines.set(number, { ...l });
    else if (l.hits > have.hits) entry.lines.set(number, { ...l });
  }
  for (const [k, b] of data.branches) {
    const have = entry.branches.get(k);
    if (!have) entry.branches.set(k, { ...b });
    else entry.branches.set(k, { ...(b.covered > have.covered ? b : have), covered: Math.max(b.covered, have.covered), total: Math.max(b.total, have.total) });
  }
  entry.unreadableBranches.push(...data.unreadableBranches);
}

// The numbers of one file: { found, hit } for lines and for branches, and the count of branch lines that cannot be read.
export function fileSums(entry) {
  let linesHit = 0;
  for (const l of entry.lines.values()) if (l.hits > 0) linesHit += 1;
  let branchesFound = 0;
  let branchesHit = 0;
  for (const b of entry.branches.values()) {
    branchesFound += b.total;
    branchesHit += Math.min(b.covered, b.total);
  }
  return { lines: { found: entry.lines.size, hit: linesHit }, branches: { found: branchesFound, hit: branchesHit }, unreadable: entry.unreadableBranches.length };
}

// The sums over the files that a filter keeps. exclude: patterns of files left out. Returns { lines, branches, files,
// excluded, unreadable, perFile } where perFile lists each kept file with its numbers, in path order.
export function sumStore(store, { include = null, exclude = [] } = {}) {
  const perFile = [];
  let excluded = 0;
  const total = { lines: { found: 0, hit: 0 }, branches: { found: 0, hit: 0 }, unreadable: 0 };
  for (const path of [...store.files.keys()].sort()) {
    const entry = store.files.get(path);
    if (include && !include.has(path)) continue;
    if (exclude.length && matchesAny(exclude, path)) {
      excluded += 1;
      continue;
    }
    const s = fileSums(entry);
    perFile.push({ path, entry, ...s });
    total.lines.found += s.lines.found;
    total.lines.hit += s.lines.hit;
    total.branches.found += s.branches.found;
    total.branches.hit += s.branches.hit;
    total.unreadable += s.unreadable;
  }
  return { ...total, files: perFile.length, excluded, perFile };
}

export const MAX_PATH_LENGTH = 1024;
const MAX_SUFFIXES = 32;

// The suffixes of a path after a slash, longest first, at most MAX_SUFFIXES of them.
function suffixes(path) {
  const out = [];
  let at = path.indexOf('/');
  while (at !== -1 && out.length < MAX_SUFFIXES) {
    out.push(path.slice(at + 1));
    at = path.indexOf('/', at + 1);
  }
  return out;
}

// The files of the store that a changed file names. A changed path matches a covered path when the two are equal, or when
// one ends with the other after a slash: a coverage report may hold absolute paths, or paths below a source folder. The
// work is one lookup per part of each path, never a pass over all files for each changed file. Returns a Map from each
// changed path to the list of covered paths it matches.
export function matchChanged(store, changed) {
  const bySuffix = new Map();
  for (const key of store.files.keys()) {
    for (const suffix of suffixes(key)) {
      const list = bySuffix.get(suffix);
      if (list) list.push(key);
      else bySuffix.set(suffix, [key]);
    }
  }
  const matches = new Map();
  for (const c of changed) {
    const found = new Set();
    if (store.files.has(c)) found.add(c);
    for (const k of bySuffix.get(c) ?? []) found.add(k);
    for (const suffix of suffixes(c)) if (store.files.has(suffix)) found.add(suffix);
    matches.set(c, [...found].sort());
  }
  return matches;
}
