// Shared test helpers: inputs built inline, checked in memory or written into a temporary folder that is removed after the
// test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and Windows.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { addFile, createStore, evaluate, main, readCriteria, summarizeRun, testKey, testLabel } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'release-gate-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// One testcase as XML. t: { name, classname, result: 'passed' | 'failed' | 'error' | 'skipped', flaky: n, message }.
export function testcase(t) {
  const attrs = [`name="${esc(t.name)}"`];
  if (t.classname !== null) attrs.push(`classname="${esc(t.classname ?? 'shop.CartTest')}"`);
  attrs.push('time="0.01"');
  const body = [];
  if (t.result === 'failed') body.push(`<failure message="${esc(t.message ?? 'expected 1 but was 2')}" type="AssertionError">trace</failure>`);
  if (t.result === 'error') body.push(`<error message="${esc(t.message ?? 'timed out')}" type="TimeoutError">trace</error>`);
  if (t.result === 'skipped') body.push('<skipped message="later"/>');
  for (let i = 0; i < (t.flaky ?? 0); i += 1) body.push('<flakyFailure message="x" type="AssertionError"><stackTrace>trace</stackTrace></flakyFailure>');
  return body.length ? `<testcase ${attrs.join(' ')}>${body.join('')}</testcase>` : `<testcase ${attrs.join(' ')}/>`;
}

// A whole result file with one suite holding these testcases (objects for testcase(), or strings as written).
export function suite(cases, { name = 'shop.CartTest' } = {}) {
  const body = cases.map((c) => (typeof c === 'string' ? c : testcase(c))).join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${esc(name)}" tests="${cases.length}">\n  ${body}\n</testsuite>\n`;
}

// A case as the JUnit reader returns it, for tests of the gates that need no files.
let offset = 0;
export function kase(classname, name, result = 'passed', extra = {}) {
  offset += 1;
  return { key: testKey(classname, name), classname, name, label: testLabel(classname, name), suite: extra.suite ?? classname, file: extra.file ?? 'results/a.xml', line: extra.line ?? offset, offset, result, flakyRetries: extra.flakyRetries ?? 0, message: extra.message ?? '' };
}

// A summarized run as src/check.js builds it, from cases.
export function runOf(cases, label = 'release candidate') {
  const { tests, counts } = summarizeRun(cases);
  return { label, paths: 'results', files: [{ file: 'results/a.xml', cases: cases.length }], tests, counts, caseCount: cases.length };
}

// A coverage store from { path: { lines: { 3: 1, 4: 0 }, branches: { 'a': [1, 1] } } }.
export function storeOf(files, report = 'coverage/lcov.info') {
  const store = createStore();
  let n = 0;
  for (const [path, f] of Object.entries(files)) {
    n += 1;
    const lines = new Map(Object.entries(f.lines ?? {}).map(([k, hits]) => [Number(k), { hits, file: report, line: n * 100 + Number(k) }]));
    const branches = new Map(Object.entries(f.branches ?? {}).map(([k, [covered, total]]) => [k, { covered, total, file: report, line: n * 100 }]));
    addFile(store, { path, lines, branches, unreadableBranches: f.unreadable ?? [], at: { file: report, line: n } });
  }
  store.reports.push({ file: report, kind: 'lcov', files: n });
  return store;
}

// Evaluates criteria (already in the normal form of readCriteria) against data pieces.
export function gatesFor(criteria, data) {
  return evaluate(criteria, { junit: null, coverage: null, changed: null, defects: null, evidence: null, ...data });
}

// The normal form of criteria written as an object, through the real reader.
export const criteriaOf = (object) => readCriteria(JSON.stringify(object), 'criteria.json');

// An lcov section as text. s: { path, lines: [[number, hits]], branches: [[line, block, branch, taken]], declared: { LF, LH, BRF, BRH } }.
export function lcovSection(s) {
  const out = ['TN:', `SF:${s.path}`];
  for (const [n, h] of s.lines ?? []) out.push(`DA:${n},${h}`);
  for (const [k, v] of Object.entries(s.declared ?? {})) out.push(`${k}:${v}`);
  for (const [l, b, br, t] of s.branches ?? []) out.push(`BRDA:${l},${b},${br},${t}`);
  out.push('end_of_record');
  return `${out.join('\n')}\n`;
}

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = [], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err };
  });
}

// Runs the command line with exactly these arguments.
export async function cli(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } });
  return { code, out, err };
}

export const gate = (report, id) => report.gates.find((g) => g.id === id);
export const statuses = (report) => Object.fromEntries(report.gates.map((g) => [g.id, g.status]));

// A criteria file text for the command line tests.
export const criteriaText = (object) => `${JSON.stringify(object, null, 2)}\n`;

// A passing set of result files for the command line tests: one suite, three tests, all passed.
export const PASSING = suite([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
