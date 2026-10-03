import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSING, criteriaText, lcovSection, run, suite } from './helpers.js';

const TESTS = criteriaText({ tests: { minPassRate: 100, noUnexplainedFailures: { lastRuns: 2 } } });
const json = async (files, args) => {
  const r = await run(files, [...args, '--format', 'json']);
  return { ...r, report: r.out ? JSON.parse(r.out) : null };
};

test('inputs: a results folder with no XML file is a run with no result: the gates are not checked and a note says so', async () => {
  const r = await json({ 'criteria.json': TESTS, 'results/readme.txt': 'no results here' }, ['--criteria', 'criteria.json', '--junit', 'results']);
  assert.equal(r.code, 0);
  assert.deepEqual(r.report.gates.map((g) => g.status), ['not-checked', 'not-checked']);
  assert.ok(r.report.notes.some((n) => /no XML file was found, so this run holds no test result/.test(n)));
  assert.ok(r.report.notes.some((n) => /1 file not ending in \.xml was not read/.test(n)));
  assert.match(r.report.gates[0].reason, /the results hold no testcase/);
});

test('inputs: a folder of results with no XML file is a no-go with --strict, never a go', async () => {
  const r = await run({ 'criteria.json': TESTS, 'results/readme.txt': 'x' }, ['--criteria', 'criteria.json', '--junit', 'results', '--strict']);
  assert.equal(r.code, 1);
});

test('inputs: a --history path named twice is an input error, and two runs with the same folder name get their paths as labels', async () => {
  const twice = await run({ 'criteria.json': TESTS, 'results/a.xml': PASSING, 'h/a.xml': PASSING }, ['--criteria', 'criteria.json', '--junit', 'results', '--history', 'h', '--history', 'h']);
  assert.equal(twice.code, 2);
  assert.match(twice.err, /named twice as a --history run/);
  const same = await json({ 'criteria.json': criteriaText({ tests: { noUnexplainedFailures: { lastRuns: 3 } } }), 'results/a.xml': PASSING, 'one/run/a.xml': suite([{ name: 'a', result: 'failed' }]), 'two/run/a.xml': PASSING }, ['--criteria', 'criteria.json', '--junit', 'results', '--history', 'one/run', '--history', 'two/run']);
  assert.equal(same.code, 1);
  assert.deepEqual(same.report.inputs.history.map((h) => h.run), ['one/run', 'two/run']);
  assert.match(same.report.gates[0].details[0], /failed in one\/run/);
});

test('inputs: a file given as --junit may be one XML file, and --history takes a file as a run', async () => {
  const r = await json({ 'criteria.json': TESTS, 'now.xml': PASSING, 'before.xml': suite([{ name: 'a', result: 'error' }]) }, ['--criteria', 'criteria.json', '--junit', 'now.xml', '--history', 'before.xml']);
  assert.equal(r.code, 1);
  assert.equal(r.report.inputs.history[0].run, 'before.xml');
});

test('inputs: a lone lcov file with several test names and sections merges, and a Cobertura file is told by its first character', async () => {
  const criteria = criteriaText({ coverage: { minLine: 50 } });
  const lcov = `TN:one\n${lcovSection({ path: 'a.js', lines: [[1, 1], [2, 0]] })}TN:two\n${lcovSection({ path: 'a.js', lines: [[2, 1]] })}`;
  const cob = '\n  <coverage><packages><package><classes><class filename="b.js"><lines><line number="1" hits="0"/></lines></class></classes></package></packages></coverage>';
  const r = await json({ 'criteria.json': criteria, 'one.info': lcov, 'two.xml': cob }, ['--criteria', 'criteria.json', '--coverage', 'one.info', '--coverage', 'two.xml']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.report.inputs.coverage.reports.map((x) => x.kind), ['lcov', 'Cobertura']);
  assert.match(r.report.gates[0].actual, /^66\.66% \(2 of 3 lines in 2 files\)/);
});

test('inputs: a coverage report that holds no line is not checked, and a note about an lcov sum that differs is kept', async () => {
  const criteria = criteriaText({ coverage: { minLine: 50 } });
  const empty = await json({ 'criteria.json': criteria, 'c.info': '' }, ['--criteria', 'criteria.json', '--coverage', 'c.info']);
  assert.equal(empty.report.gates[0].status, 'not-checked');
  const sums = await json({ 'criteria.json': criteria, 'c.info': lcovSection({ path: 'a.js', lines: [[1, 1]], declared: { LF: 9 } }) }, ['--criteria', 'criteria.json', '--coverage', 'c.info']);
  assert.equal(sums.report.gates[0].status, 'met');
  assert.ok(sums.report.notes.some((n) => /LF says 9 but the DA records of a\.js count 1; the records are used/.test(n)));
});

test('inputs: duplicate defect ids are noted, and a semicolon export is read with the delimiter of the criteria', async () => {
  const criteria = criteriaText({ defects: { delimiter: ';', closedStatuses: ['done'], maxOpenTotal: 5 } });
  const r = await json({ 'criteria.json': criteria, 'd.csv': 'id;severity;status\nA;major;open\nA;major;open\nB;minor;done\n' }, ['--criteria', 'criteria.json', '--defects', 'd.csv']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.report.gates[0].actual, '1 open defect in 2 defects');
  assert.ok(r.report.notes.some((n) => /1 defect id appears on more than one line; the first line of each is used/.test(n)));
});

test('inputs: --evidence-root without an evidence gate is only a note', async () => {
  const r = await json({ 'criteria.json': criteriaText({ tests: { minPassRate: 100 } }), 'results/a.xml': PASSING }, ['--criteria', 'criteria.json', '--junit', 'results', '--evidence-root', 'anywhere']);
  assert.equal(r.code, 0);
  assert.ok(r.report.notes.some((n) => /--evidence-root was given, but the criteria state no evidence gate/.test(n)));
});

test('inputs: the evidence folder defaults to the current folder', async () => {
  const r = await json({ 'criteria.json': criteriaText({ evidence: { required: ['reports/signed.txt'] } }), 'reports/signed.txt': 'signed\n' }, ['--criteria', 'criteria.json']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.report.inputs.evidence.root, '.');
});

test('inputs: a testcase file with Surefire flaky elements gives a flaky test in the release candidate run', async () => {
  const xml = '<testsuite name="s"><testcase name="a" classname="c"><flakyFailure message="x"><stackTrace>t</stackTrace></flakyFailure></testcase></testsuite>';
  const r = await json({ 'criteria.json': criteriaText({ tests: { maxFlaky: 0 } }), 'results/a.xml': xml }, ['--criteria', 'criteria.json', '--junit', 'results']);
  assert.equal(r.code, 1);
  assert.equal(r.report.gates[0].actual, '1 flaky test');
});
