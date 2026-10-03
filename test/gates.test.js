import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, readDefects } from '../src/index.js';
import { criteriaOf, gatesFor, kase, runOf, storeOf } from './helpers.js';

const status = (gates, id) => gates.find((g) => g.id === id)?.status;
const gateOf = (gates, id) => gates.find((g) => g.id === id);

// ---------- test results ----------

const mixed = () => runOf([
  ...Array.from({ length: 18 }, (_, i) => kase('shop.CartTest', `ok${i}`)),
  kase('shop.CartTest', 'bad', 'failed', { message: 'boom', line: 99 }),
  kase('shop.PayTest', 'skipped one', 'skipped')
]);

test('pass rate: 18 of 19 executed tests is 94.73 percent, below 95 and above 94', () => {
  const run = mixed();
  const g = gatesFor(criteriaOf({ tests: { minPassRate: 95 } }), { junit: { candidate: run, history: [] } });
  assert.equal(g.length, 1);
  assert.equal(g[0].status, 'not-met');
  assert.match(g[0].actual, /^94\.73% \(18 of 19 executed tests passed\)/);
  assert.equal(g[0].facts.at(-1).at, 'results/a.xml:99');
  assert.equal(status(gatesFor(criteriaOf({ tests: { minPassRate: 94 } }), { junit: { candidate: run, history: [] } }), 'pass-rate'), 'met');
});

test('pass rate: a rate that is exactly the minimum is met, and one test below it is not', () => {
  const four = runOf([kase('c', 'a'), kase('c', 'b'), kase('c', 'c'), kase('c', 'd', 'failed')]);
  assert.equal(status(gatesFor(criteriaOf({ tests: { minPassRate: 75 } }), { junit: { candidate: four, history: [] } }), 'pass-rate'), 'met');
  assert.equal(status(gatesFor(criteriaOf({ tests: { minPassRate: 75.0001 } }), { junit: { candidate: four, history: [] } }), 'pass-rate'), 'not-met');
});

test('pass rate: a rate of 94.999 percent never passes a limit of 95, and the report never shows it as 95', () => {
  const cases = [...Array.from({ length: 94999 }, (_, i) => kase('c', `p${i}`)), ...Array.from({ length: 5001 }, (_, i) => kase('c', `f${i}`, 'failed'))];
  const g = gatesFor(criteriaOf({ tests: { minPassRate: 95 } }), { junit: { candidate: runOf(cases), history: [] } })[0];
  assert.equal(g.status, 'not-met');
  assert.match(g.actual, /^94\.99%/);
});

test('pass rate: a flaky test counts as passed, and the report says how many were counted so', () => {
  const run = runOf([kase('c', 'a'), kase('c', 'f', 'passed', { flakyRetries: 1 })]);
  const g = gatesFor(criteriaOf({ tests: { minPassRate: 100 } }), { junit: { candidate: run, history: [] } })[0];
  assert.equal(g.status, 'met');
  assert.match(g.actual, /1 flaky test counted as passed/);
});

test('pass rate: skipped tests are not executed, so they are not in the rate', () => {
  const run = runOf([kase('c', 'a'), kase('c', 's', 'skipped'), kase('c', 't', 'skipped')]);
  const g = gatesFor(criteriaOf({ tests: { minPassRate: 100 } }), { junit: { candidate: run, history: [] } })[0];
  assert.equal(g.status, 'met');
  assert.match(g.actual, /1 of 1 executed/);
});

test('pass rate: no test executed is not checked, whether all were skipped or none was found', () => {
  const c = criteriaOf({ tests: { minPassRate: 50 } });
  const skipped = gatesFor(c, { junit: { candidate: runOf([kase('c', 's', 'skipped')]), history: [] } })[0];
  assert.equal(skipped.status, 'not-checked');
  assert.match(skipped.reason, /all 1 test was skipped/);
  const none = gatesFor(c, { junit: { candidate: runOf([]), history: [] } })[0];
  assert.equal(none.status, 'not-checked');
  assert.match(none.reason, /no testcase/);
});

test('every test gate is not checked when no --junit input was given, never met', () => {
  const c = criteriaOf({ tests: { minPassRate: 1, maxSkippedShare: 100, maxFlaky: 100, criticalSuites: { suites: ['a'], maxFailing: 100 }, noUnexplainedFailures: { lastRuns: 1 } } });
  const g = gatesFor(c, {});
  assert.equal(g.length, 5);
  for (const x of g) {
    assert.equal(x.status, 'not-checked', x.id);
    assert.match(x.reason, /no --junit input was given/);
  }
});

test('critical suites: a failing test in a named suite is not met, a suite named by its class name is found too', () => {
  const run = runOf([kase('shop.PayTest', 'a', 'passed', { suite: 'PaySuite' }), kase('shop.PayTest', 'b', 'error', { suite: 'PaySuite' }), kase('shop.CartTest', 'c')]);
  const byClass = gatesFor(criteriaOf({ tests: { criticalSuites: { suites: ['shop.PayTest'], maxFailing: 0 } } }), { junit: { candidate: run, history: [] } })[0];
  assert.equal(byClass.status, 'not-met');
  assert.match(byClass.actual, /1 failing in 1 suite with results/);
  const bySuite = gatesFor(criteriaOf({ tests: { criticalSuites: { suites: ['PaySuite'], maxFailing: 1 } } }), { junit: { candidate: run, history: [] } })[0];
  assert.equal(bySuite.status, 'met', 'a limit of 1 allows one failing test');
});

test('critical suites: a suite with no result at all is not met, because a suite that did not run did not pass', () => {
  const run = runOf([kase('shop.CartTest', 'c')]);
  const g = gatesFor(criteriaOf({ tests: { criticalSuites: { suites: ['shop.CartTest', 'shop.PayTest'], maxFailing: 0 } } }), { junit: { candidate: run, history: [] } })[0];
  assert.equal(g.status, 'not-met');
  assert.match(g.reason, /no result for 1 critical suite/);
  assert.deepEqual(g.details, ['no result: shop.PayTest']);
});

test('critical suites: a flaky test is not a failing test, and all clean suites are met', () => {
  const run = runOf([kase('s.A', 'a'), kase('s.A', 'b', 'passed', { flakyRetries: 2 }), kase('s.B', 'c')]);
  assert.equal(status(gatesFor(criteriaOf({ tests: { criticalSuites: { suites: ['s.A', 's.B'], maxFailing: 0 } } }), { junit: { candidate: run, history: [] } }), 'critical-suites'), 'met');
});

test('skipped share: 2 of 30 is 6.66 percent; the limit is compared on counts, and exactly the limit is met', () => {
  const cases = [...Array.from({ length: 28 }, (_, i) => kase('c', `t${i}`)), kase('c', 's1', 'skipped'), kase('c', 's2', 'skipped')];
  const run = runOf(cases);
  const over = gatesFor(criteriaOf({ tests: { maxSkippedShare: 5 } }), { junit: { candidate: run, history: [] } })[0];
  assert.equal(over.status, 'not-met');
  assert.match(over.actual, /^6\.66% \(2 of 30 tests skipped\)/);
  assert.deepEqual(over.details, ['s1', 's2'].map((n) => `c > ${n}`));
  assert.equal(status(gatesFor(criteriaOf({ tests: { maxSkippedShare: 6.6667 } }), { junit: { candidate: run, history: [] } }), 'skipped-share'), 'met');
  assert.equal(status(gatesFor(criteriaOf({ tests: { maxSkippedShare: 0 } }), { junit: { candidate: runOf([kase('c', 'a')]), history: [] } }), 'skipped-share'), 'met');
});

test('flaky count: a test that passed and failed in one run, or passed after a retry, is flaky', () => {
  const run = runOf([kase('c', 'a'), kase('c', 'b', 'failed'), kase('c', 'b', 'passed'), kase('c', 'r', 'passed', { flakyRetries: 1 })]);
  const g = gatesFor(criteriaOf({ tests: { maxFlaky: 1 } }), { junit: { candidate: run, history: [] } })[0];
  assert.equal(g.status, 'not-met');
  assert.equal(g.actual, '2 flaky tests');
  assert.equal(status(gatesFor(criteriaOf({ tests: { maxFlaky: 2 } }), { junit: { candidate: run, history: [] } }), 'flaky-count'), 'met');
});

test('flaky count: zero flaky tests with a limit of zero is met', () => {
  assert.equal(status(gatesFor(criteriaOf({ tests: { maxFlaky: 0 } }), { junit: { candidate: runOf([kase('c', 'a')]), history: [] } }), 'flaky-count'), 'met');
});

test('unexplained failures: a failure in an earlier run that nobody explained is not met, an explained one is met', () => {
  const bad = runOf([kase('c', 'a', 'failed'), kase('c', 'b')], 'run-1');
  const ok = runOf([kase('c', 'a'), kase('c', 'b')], 'run-2');
  const now = runOf([kase('c', 'a'), kase('c', 'b')], 'release candidate');
  const c = criteriaOf({ tests: { noUnexplainedFailures: { lastRuns: 3, explained: [] } } });
  const g = gatesFor(c, { junit: { candidate: now, history: [bad, ok] } })[0];
  assert.equal(g.status, 'not-met');
  assert.deepEqual(g.details, ['c > a (failed in run-1)']);
  const explained = criteriaOf({ tests: { noUnexplainedFailures: { lastRuns: 3, explained: ['c > a'] } } });
  assert.equal(gatesFor(explained, { junit: { candidate: now, history: [bad, ok] } })[0].status, 'met');
});

test('unexplained failures: only the last N runs are looked at, and the release candidate is the last of them', () => {
  const old = runOf([kase('c', 'a', 'failed')], 'run-1');
  const mid = runOf([kase('c', 'a')], 'run-2');
  const now = runOf([kase('c', 'a')], 'release candidate');
  assert.equal(gatesFor(criteriaOf({ tests: { noUnexplainedFailures: { lastRuns: 2 } } }), { junit: { candidate: now, history: [old, mid] } })[0].status, 'met');
  assert.equal(gatesFor(criteriaOf({ tests: { noUnexplainedFailures: { lastRuns: 3 } } }), { junit: { candidate: now, history: [old, mid] } })[0].status, 'not-met');
  const failingNow = runOf([kase('c', 'a', 'error')], 'release candidate');
  assert.equal(gatesFor(criteriaOf({ tests: { noUnexplainedFailures: { lastRuns: 1 } } }), { junit: { candidate: failingNow, history: [] } })[0].status, 'not-met');
});

test('unexplained failures: fewer runs than lastRuns is not checked, never met', () => {
  const g = gatesFor(criteriaOf({ tests: { noUnexplainedFailures: { lastRuns: 5 } } }), { junit: { candidate: runOf([kase('c', 'a')]), history: [runOf([kase('c', 'a')], 'run-1')] } })[0];
  assert.equal(g.status, 'not-checked');
  assert.match(g.reason, /the last 5 runs are needed and 2 runs were given/);
});

test('unexplained failures: a flaky test is not a failure here', () => {
  const run = runOf([kase('c', 'a', 'failed'), kase('c', 'a', 'passed')], 'release candidate');
  assert.equal(gatesFor(criteriaOf({ tests: { noUnexplainedFailures: { lastRuns: 1 } } }), { junit: { candidate: run, history: [] } })[0].status, 'met');
});

// ---------- coverage ----------

const store = () => storeOf({
  'src/a.js': { lines: { 1: 1, 2: 1, 3: 0, 4: 1 }, branches: { x: [1, 1], y: [0, 1] } },
  'src/b.js': { lines: { 1: 1, 2: 1, 3: 1, 4: 1 }, branches: { x: [1, 1] } },
  'src/gen/c.js': { lines: { 1: 0, 2: 0 }, branches: { x: [0, 2] } }
});

test('line coverage: 7 of 8 lines is 87.5 percent; the vendored folder is left out by the exclude pattern and counted', () => {
  const g = gatesFor(criteriaOf({ coverage: { minLine: 87.5, exclude: ['src/gen/**'] } }), { coverage: { store: store() } })[0];
  assert.equal(g.status, 'met');
  assert.match(g.actual, /^87\.5% \(7 of 8 lines in 2 files; 1 file left out by coverage\.exclude\)/);
  const without = gatesFor(criteriaOf({ coverage: { minLine: 87.5 } }), { coverage: { store: store() } })[0];
  assert.equal(without.status, 'not-met');
  assert.match(without.actual, /^70% \(7 of 10 lines in 3 files\)/);
});

test('line coverage: the files with the lowest coverage are named when the gate is not met', () => {
  const g = gatesFor(criteriaOf({ coverage: { minLine: 99 } }), { coverage: { store: store() } })[0];
  assert.equal(g.status, 'not-met');
  assert.equal(g.details[0], 'src/gen/c.js: 0 of 2');
  assert.match(g.details[1], /^src\/a\.js: 3 of 4/);
});

test('line coverage: reports with no line are not checked, and an empty store is not 100 percent', () => {
  const g = gatesFor(criteriaOf({ coverage: { minLine: 1 } }), { coverage: { store: storeOf({ 'a.js': {} }) } })[0];
  assert.equal(g.status, 'not-checked');
  assert.match(g.reason, /hold no line to count/);
});

test('branch coverage: 2 of 3 branches in the counted files is 66.66 percent', () => {
  const c = criteriaOf({ coverage: { minBranch: 66.67, exclude: ['src/gen/**'] } });
  const g = gatesFor(c, { coverage: { store: store() } })[0];
  assert.equal(g.status, 'not-met');
  assert.match(g.actual, /^66\.66% \(2 of 3 branches/);
  assert.equal(gatesFor(criteriaOf({ coverage: { minBranch: 66.66, exclude: ['src/gen/**'] } }), { coverage: { store: store() } })[0].status, 'met');
});

test('branch coverage: reports with no branch data are not checked, because the tool may not have been asked for branches', () => {
  const g = gatesFor(criteriaOf({ coverage: { minBranch: 1 } }), { coverage: { store: storeOf({ 'a.js': { lines: { 1: 1 } } }) } })[0];
  assert.equal(g.status, 'not-checked');
  assert.match(g.reason, /hold no branch data/);
});

test('branch coverage: a branch line with no readable counts makes the gate not checked', () => {
  const s = storeOf({ 'a.js': { lines: { 1: 1 }, branches: { x: [1, 1] }, unreadable: [{ line: 3, file: 'c.xml', at: 9 }] } });
  const g = gatesFor(criteriaOf({ coverage: { minBranch: 1 } }), { coverage: { store: s } })[0];
  assert.equal(g.status, 'not-checked');
  assert.match(g.reason, /1 branch line in the reports has no readable condition-coverage/);
});

test('coverage gates are not checked when no --coverage input was given', () => {
  const g = gatesFor(criteriaOf({ coverage: { minLine: 1, minBranch: 1, changedFiles: { minLine: 1, minBranch: 1 } } }), {});
  assert.deepEqual(g.map((x) => x.status), ['not-checked', 'not-checked', 'not-checked', 'not-checked']);
  for (const x of g) assert.match(x.reason, /no --coverage input was given/);
});

const changed = (...paths) => ({ file: 'changed.txt', entries: paths.map((path, i) => ({ path, line: i + 1 })) });

test('changed files: the lines of the changed files are counted, and the others are left out', () => {
  const c = criteriaOf({ coverage: { changedFiles: { minLine: 90 } } });
  const g = gatesFor(c, { coverage: { store: store() }, changed: changed('src/b.js') })[0];
  assert.equal(g.id, 'changed-line-coverage');
  assert.equal(g.status, 'met');
  assert.match(g.actual, /^100% \(4 of 4 lines in 1 changed file\)/);
  const both = gatesFor(c, { coverage: { store: store() }, changed: changed('src/a.js', 'src/b.js') })[0];
  assert.equal(both.status, 'not-met');
  assert.match(both.actual, /^87\.5% \(7 of 8 lines/);
});

test('changed files: a changed file with no coverage record is not met, never counted as covered', () => {
  const c = criteriaOf({ coverage: { changedFiles: { minLine: 10 } } });
  const g = gatesFor(c, { coverage: { store: store() }, changed: changed('src/b.js', 'src/new.js') })[0];
  assert.equal(g.status, 'not-met');
  assert.deepEqual(g.details, ['no coverage record: src/new.js']);
  assert.match(g.facts[1].text, /changed: src\/new\.js -> no coverage record/);
  assert.equal(g.facts[1].at, 'changed.txt:2');
});

test('changed files: a pattern in ignore removes a changed file from the gate, and the count of ignored files is shown', () => {
  const c = criteriaOf({ coverage: { changedFiles: { minLine: 90, ignore: ['docs/**', '*.md'] } } });
  const g = gatesFor(c, { coverage: { store: store() }, changed: changed('src/b.js', 'docs/guide.md', 'README.md') })[0];
  assert.equal(g.status, 'met');
  assert.match(g.actual, /in 1 changed file, 2 ignored/);
});

test('changed files: nothing left after ignore is not checked', () => {
  const c = criteriaOf({ coverage: { changedFiles: { minLine: 90, ignore: ['*.md'] } } });
  const g = gatesFor(c, { coverage: { store: store() }, changed: changed('README.md') })[0];
  assert.equal(g.status, 'not-checked');
  assert.match(g.reason, /no changed file is left to measure \(1 file listed, 1 ignored/);
  const empty = gatesFor(c, { coverage: { store: store() }, changed: changed() })[0];
  assert.equal(empty.status, 'not-checked');
});

test('changed files: no --changed input is not checked, and the reason names the missing input', () => {
  const g = gatesFor(criteriaOf({ coverage: { changedFiles: { minBranch: 1 } } }), { coverage: { store: store() } })[0];
  assert.equal(g.status, 'not-checked');
  assert.match(g.reason, /no --changed input was given/);
});

test('changed files: branches of the changed files are counted the same way', () => {
  const c = criteriaOf({ coverage: { changedFiles: { minBranch: 60 } } });
  const g = gatesFor(c, { coverage: { store: store() }, changed: changed('src/a.js') })[0];
  assert.equal(g.id, 'changed-branch-coverage');
  assert.equal(g.status, 'not-met');
  assert.match(g.actual, /^50% \(1 of 2 branches in 1 changed file\)/);
  const none = gatesFor(c, { coverage: { store: storeOf({ 'src/a.js': { lines: { 1: 1 } } }) }, changed: changed('src/a.js') })[0];
  assert.equal(none.status, 'not-checked');
  assert.match(none.reason, /hold no branch to count/);
});

test('changed files: a changed path that two covered files match is named as ambiguous', () => {
  const s = storeOf({ 'a/index.js': { lines: { 1: 1 } }, 'b/index.js': { lines: { 1: 0 } } });
  const g = gatesFor(criteriaOf({ coverage: { changedFiles: { minLine: 40 } } }), { coverage: { store: s }, changed: changed('index.js') })[0];
  assert.equal(g.status, 'met');
  assert.deepEqual(g.details, ['matches 2 covered files: index.js']);
});

// ---------- defects ----------

const defects = (csv, config) => ({ file: 'defects.csv', ...readDefects(csv, { closedStatuses: ['done', 'closed'], ...config }) });
const CSV = 'id,severity,status\nD-1,Blocker,Open\nD-2,major,Open\nD-3,Major,In Progress\nD-4,Major,Done\nD-5,minor,Open\nD-6,,Open\nD-7,blocker,closed\n';

test('open defects: severities are compared without case, and closed defects are not counted', () => {
  const c = criteriaOf({ defects: { closedStatuses: ['done', 'closed'], maxOpen: { blocker: 0, major: 2 } } });
  const g = gatesFor(c, { defects: defects(CSV) });
  assert.equal(status(g, 'open-defects:blocker'), 'not-met');
  assert.deepEqual(gateOf(g, 'open-defects:blocker').details, ['D-1 (Open)']);
  assert.equal(status(g, 'open-defects:major'), 'met');
  assert.equal(gateOf(g, 'open-defects:major').actual, '2 open major defects in 7 defects');
});

test('open defects: an open defect with no severity is a gate of its own and is not met', () => {
  const g = gatesFor(criteriaOf({ defects: { closedStatuses: ['done'], maxOpen: { blocker: 5 } } }), { defects: defects(CSV) });
  assert.equal(status(g, 'defect-severity'), 'not-met');
  assert.deepEqual(gateOf(g, 'defect-severity').details, ['D-6']);
  const clean = gatesFor(criteriaOf({ defects: { closedStatuses: ['done'], maxOpen: { blocker: 5 } } }), { defects: defects('id,severity,status\nD-1,minor,Open\n') });
  assert.equal(status(clean, 'defect-severity'), 'met');
});

test('open defects: the total limit counts every open defect, with the count by severity', () => {
  const g = gatesFor(criteriaOf({ defects: { closedStatuses: ['done', 'closed'], maxOpenTotal: 4 } }), { defects: defects(CSV) });
  assert.equal(g.length, 1);
  assert.equal(g[0].id, 'open-defects:total');
  assert.equal(g[0].title, 'Maximum open defects in all');
  assert.equal(g[0].status, 'not-met');
  assert.match(g[0].actual, /^5 open defects in 7 defects/);
  assert.match(g[0].reason, /5 defects open, above 4/);
  assert.deepEqual(g[0].details, ['1 Blocker', '2 major', '1 minor', '1 (none)']);
  assert.equal(gatesFor(criteriaOf({ defects: { closedStatuses: ['done', 'closed'], maxOpenTotal: 5 } }), { defects: defects(CSV) })[0].status, 'met', 'exactly the limit is met');
});

test('open defects: a status the criteria do not list as closed means open, and an empty status is open', () => {
  const d = defects('id,severity,status\nD-1,major,Waiting for review\nD-2,major,\nD-3,major,Done\n');
  const g = gatesFor(criteriaOf({ defects: { closedStatuses: ['done'], maxOpen: { major: 1 } } }), { defects: d });
  assert.equal(status(g, 'open-defects:major'), 'not-met');
  assert.equal(gateOf(g, 'open-defects:major').actual, '2 open major defects in 3 defects');
});

test('open defects: a defect id that appears twice counts once, from its first line, and the facts say so', () => {
  const d = defects('id,severity,status\nD-1,major,Open\nD-1,minor,Done\nD-2,major,Open\n');
  assert.equal(d.rows.length, 2);
  assert.deepEqual(d.duplicates, [{ id: 'D-1', line: 3, first: 2 }]);
  const g = gatesFor(criteriaOf({ defects: { closedStatuses: ['done'], maxOpen: { major: 5 } } }), { defects: d });
  assert.ok(gateOf(g, 'open-defects:major').facts.some((f) => /D-1 appears again; the first line \(2\) is used/.test(f.text) && f.at === 'defects.csv:3'));
});

test('open defects: every defect gate is not checked when no --defects input was given', () => {
  const g = gatesFor(criteriaOf({ defects: { closedStatuses: ['done'], maxOpen: { blocker: 0 }, maxOpenTotal: 3 } }), {});
  assert.deepEqual(g.map((x) => x.id), ['open-defects:blocker', 'defect-severity', 'open-defects:total']);
  for (const x of g) assert.equal(x.status, 'not-checked');
});

test('open defects: the facts name the line of the CSV file of every defect they counted', () => {
  const g = gatesFor(criteriaOf({ defects: { closedStatuses: ['done', 'closed'], maxOpen: { major: 0 } } }), { defects: defects(CSV) });
  const facts = gateOf(g, 'open-defects:major').facts;
  assert.deepEqual(facts.map((f) => f.at), ['defects.csv:3', 'defects.csv:4']);
});

// ---------- evidence ----------

const states = (o) => ({ root: '.', states: new Map(Object.entries(o)) });

test('evidence: every file present is met; a missing, empty, linked or non-regular file is not met', () => {
  const c = criteriaOf({ evidence: { required: ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf'] } });
  const g = gatesFor(c, { evidence: states({ 'a.pdf': { state: 'present', size: 10 }, 'b.pdf': { state: 'missing', reason: 'no such file' }, 'c.pdf': { state: 'empty', reason: 'is an empty file' }, 'd.pdf': { state: 'link', reason: 'a symbolic link' }, 'e.pdf': { state: 'not-a-file', reason: 'is not a regular file' } }) })[0];
  assert.equal(g.status, 'not-met');
  assert.equal(g.actual, '1 of 5 present');
  assert.deepEqual(g.details, ['b.pdf: missing', 'c.pdf: empty', 'd.pdf: a symbolic link on the way', 'e.pdf: not a regular file']);
  const ok = gatesFor(criteriaOf({ evidence: { required: ['a.pdf'] } }), { evidence: states({ 'a.pdf': { state: 'present', size: 1 } }) })[0];
  assert.equal(ok.status, 'met');
});

test('evidence: a gate whose folder was not looked at is not checked', () => {
  const g = gatesFor(criteriaOf({ evidence: { required: ['a.pdf'] } }), {})[0];
  assert.equal(g.status, 'not-checked');
});

// ---------- decision ----------

test('decision: go only when no gate is not met; strict also needs no gate that is not checked', () => {
  const met = { status: 'met' };
  const notMet = { status: 'not-met' };
  const unknown = { status: 'not-checked' };
  assert.deepEqual(decide([met, met]), { go: true, verdict: 'go', reasons: [], met: 2, notMet: 0, notChecked: 0 });
  assert.equal(decide([met, notMet]).go, false);
  assert.deepEqual(decide([met, notMet, notMet]).reasons, ['2 gates not met']);
  assert.equal(decide([met, unknown]).go, true);
  const strict = decide([met, unknown, unknown], true);
  assert.equal(strict.go, false);
  assert.deepEqual(strict.reasons, ['2 gates not checked (--strict)']);
  assert.deepEqual(decide([notMet, unknown], true).reasons, ['1 gate not met', '1 gate not checked (--strict)']);
});

test('every gate carries its requirement, what was found, and the sentences of the saved pages it rests on', () => {
  const g = gatesFor(criteriaOf({ tests: { minPassRate: 95, maxFlaky: 0 }, coverage: { minLine: 10 }, evidence: { required: ['a.pdf'] } }), { junit: { candidate: runOf([kase('c', 'a')]), history: [] }, coverage: { store: store() }, evidence: states({ 'a.pdf': { state: 'present', size: 1 } }) });
  assert.equal(g.length, 4);
  for (const x of g) {
    assert.ok(x.requirement.length > 5, x.id);
    assert.ok(x.actual.length > 2, x.id);
    assert.ok(x.basis.length >= 1, x.id);
    for (const b of x.basis) assert.match(b.source, /^https:\/\//);
  }
  assert.match(g[0].basis[0].text, /^The set of conditions for officially completing a defined task\.$/);
});

test('a long list of details is cut and says how many more there are; facts are capped', () => {
  const cases = Array.from({ length: 500 }, (_, i) => kase('c', `t${i}`, 'failed'));
  const g = gatesFor(criteriaOf({ tests: { minPassRate: 50 } }), { junit: { candidate: runOf(cases), history: [] } })[0];
  assert.equal(g.details.length, 9);
  assert.equal(g.details.at(-1), 'and 492 more');
  assert.equal(g.facts.length, 201);
  assert.match(g.facts.at(-1).text, /^and \d+ more facts not listed/);
});
