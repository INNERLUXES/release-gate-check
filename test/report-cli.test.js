import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USAGE, VERSION, mdCell, parseArgs, toJson, toMarkdown, toText } from '../src/index.js';
import { PASSING, cli, criteriaText, gate, lcovSection, run, statuses, suite } from './helpers.js';

const ONE_GATE = criteriaText({ name: 'Smoke', tests: { minPassRate: 100 } });
const FILES = { 'criteria.json': ONE_GATE, 'results/a.xml': PASSING };
const BASE = ['--criteria', 'criteria.json', '--junit', 'results'];

const json = async (files, args) => {
  const r = await run(files, [...args, '--format', 'json']);
  return { ...r, report: r.out ? JSON.parse(r.out) : null };
};

test('cli: a met gate is a go with exit code 0, and the text names the decision', async () => {
  const r = await run(FILES, BASE);
  assert.equal(r.code, 0);
  assert.match(r.out, /^release-gate-check: criteria\.json \(Smoke\)\n/);
  assert.match(r.out, /MET {10}pass-rate {2}Minimum pass rate/);
  assert.match(r.out, /\nDECISION: GO\n$/);
  assert.equal(r.err, '');
});

test('cli: a gate that is not met is a no-go with exit code 1, and the reason is in the text', async () => {
  const bad = { ...FILES, 'results/a.xml': suite([{ name: 'a' }, { name: 'b', result: 'failed' }]) };
  const r = await run(bad, BASE);
  assert.equal(r.code, 1);
  assert.match(r.out, /NOT MET {6}pass-rate/);
  assert.match(r.out, /found: 50% \(1 of 2 executed tests passed\)/);
  assert.match(r.out, /- failed: shop\.CartTest > b/);
  assert.match(r.out, /\nDECISION: NO-GO - 1 gate not met\n$/);
});

test('cli: a gate with no data is not checked, and without --strict the decision is still go', async () => {
  const r = await run({ 'criteria.json': criteriaText({ tests: { minPassRate: 100 }, evidence: { required: ['x.pdf'] } }), 'results/a.xml': PASSING }, [...BASE, '--evidence-root', 'nothing-here']);
  assert.equal(r.code, 2, 'a missing evidence folder is an input error');
  const r2 = await run({ 'criteria.json': criteriaText({ tests: { minPassRate: 100, maxFlaky: 0 }, defects: { closedStatuses: ['done'], maxOpenTotal: 0 } }), 'results/a.xml': PASSING }, BASE);
  assert.equal(r2.code, 0);
  assert.match(r2.out, /NOT CHECKED {2}open-defects:total/);
  assert.match(r2.out, /why: no --defects input was given/);
  assert.match(r2.out, /gates: 2 met, 0 not met, 1 not checked/);
});

test('cli: --strict makes a gate that is not checked a no-go', async () => {
  const files = { 'criteria.json': criteriaText({ tests: { minPassRate: 100 }, defects: { closedStatuses: ['done'], maxOpenTotal: 0 } }), 'results/a.xml': PASSING };
  const r = await run(files, [...BASE, '--strict']);
  assert.equal(r.code, 1);
  assert.match(r.out, /mode: strict, a gate that is not checked is a no-go/);
  assert.match(r.out, /DECISION: NO-GO - 1 gate not checked \(--strict\)/);
});

test('cli: --strict does not change a run in which every gate was checked', async () => {
  const r = await run(FILES, [...BASE, '--strict']);
  assert.equal(r.code, 0);
});

test('cli: the same criteria and inputs give the same report every time', async () => {
  const a = await run(FILES, BASE);
  const b = await run(FILES, BASE);
  assert.equal(a.out, b.out);
});

test('cli: --explain shows the file and line each number came from, and the sentence each gate rests on', async () => {
  const bad = { ...FILES, 'results/a.xml': suite([{ name: 'a' }, { name: 'b', result: 'failed', message: 'wrong total' }]) };
  const plain = await run(bad, BASE);
  assert.ok(!plain.out.includes('from:'));
  assert.ok(!plain.out.includes('basis:'));
  const r = await run(bad, [...BASE, '--explain']);
  assert.equal(r.code, 1);
  assert.match(r.out, /from: results\/a\.xml {2}2 testcases read/);
  assert.match(r.out, /from: results\/a\.xml:4 {2}failed: shop\.CartTest > b \(wrong total\)/);
  assert.match(r.out, /basis: "The set of conditions for officially completing a defined task\." \(exit criteria, https:\/\/glossary\.istqb\.org\/en_US\/term\/exit-criteria\)/);
});

test('cli: --format json holds the gates with their facts and basis, the counts and the decision', async () => {
  const { code, report } = await json(FILES, BASE);
  assert.equal(code, 0);
  assert.equal(report.tool, 'release-gate-check');
  assert.equal(report.version, VERSION);
  assert.deepEqual(report.counts, { met: 1, notMet: 0, notChecked: 0 });
  assert.deepEqual(report.decision, { verdict: 'go', go: true, reasons: [] });
  const g = gate(report, 'pass-rate');
  assert.equal(g.status, 'met');
  assert.ok(g.facts.length >= 1);
  assert.equal(g.basis[0].source, 'https://glossary.istqb.org/en_US/term/exit-criteria');
  assert.deepEqual(report.inputs.results, { paths: 'results', files: 1, testcases: 3, tests: 3 });
});

test('cli: --format markdown has a table of gates, and --explain adds the facts', async () => {
  const bad = { ...FILES, 'results/a.xml': suite([{ name: 'a' }, { name: 'b', result: 'failed' }]) };
  const r = await run(bad, [...BASE, '--format', 'markdown', '--explain']);
  assert.equal(r.code, 1);
  assert.match(r.out, /^## release-gate-check: no-go\n/);
  assert.match(r.out, /\| Status \| Gate \| Requirement \| Found \| Why \|/);
  assert.match(r.out, /\| \*\*not met\*\* \| pass-rate \|/);
  assert.match(r.out, /\n### pass-rate\n/);
  assert.match(r.out, /- from results\/a\.xml:4: failed/);
  assert.match(r.out, /\*\*Decision: no-go\*\* - 1 gate not met\./);
});

test('markdown: text from the input cannot break a table, make a link or be read as HTML', () => {
  assert.equal(mdCell('a|b'), 'a\\|b');
  assert.equal(mdCell('[x](https://evil.example.test)'), '\\[x\\](https://evil.example.test)');
  assert.equal(mdCell('<script>&'), '&lt;script&gt;&amp;');
  assert.equal(mdCell('`code` *em* _u_'), '\\`code\\` \\*em\\* \\_u\\_');
  assert.equal(mdCell('line\nbreak\r\nhere'), 'line break here');
  assert.equal(mdCell('back\\slash'), 'back\\\\slash');
});

test('cli: criteria, results, coverage, changed files, defects and evidence together', async () => {
  const files = {
    'criteria.json': criteriaText({
      tests: { minPassRate: 100 },
      coverage: { minLine: 50, changedFiles: { minLine: 50 } },
      defects: { closedStatuses: ['done'], maxOpen: { blocker: 0 } },
      evidence: { required: ['reports/signed.txt'] }
    }),
    'results/a.xml': PASSING,
    'cov/lcov.info': lcovSection({ path: 'src/a.js', lines: [[1, 1], [2, 0]] }),
    'changed.txt': 'src/a.js\n',
    'defects.csv': 'id,severity,status\nD-1,blocker,done\n',
    'evidence/reports/signed.txt': 'signed\n'
  };
  const r = await json(files, [...BASE, '--coverage', 'cov/lcov.info', '--changed', 'changed.txt', '--defects', 'defects.csv', '--evidence-root', 'evidence']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(Object.values(statuses(r.report)).filter((s) => s !== 'met'), []);
  assert.equal(Object.keys(statuses(r.report)).length, 6);
  assert.deepEqual(r.report.inputs.coverage.reports.map((x) => x.kind), ['lcov']);
  assert.equal(r.report.inputs.changed.files, 1);
  assert.equal(r.report.inputs.defects.defects, 1);
  assert.equal(r.report.inputs.evidence.required, 1);
});

test('cli: an input that no gate uses is not read and is named in a note', async () => {
  const r = await json({ ...FILES, 'cov/lcov.info': 'garbage that is not read\n', 'defects.csv': '"never closed' }, [...BASE, '--coverage', 'cov/lcov.info', '--defects', 'defects.csv', '--changed', 'nope.txt']);
  assert.equal(r.code, 0);
  assert.ok(r.report.notes.some((n) => /--coverage was given, but the criteria state no coverage gate/.test(n)));
  assert.ok(r.report.notes.some((n) => /--defects was given, but the criteria state no defects gate/.test(n)));
  assert.ok(r.report.notes.some((n) => /--changed was given, but the criteria state no coverage\.changedFiles gate/.test(n)));
});

test('cli: --history without --junit says there is no release candidate, and the test gates are not checked', async () => {
  const r = await json({ 'criteria.json': ONE_GATE, 'results/a.xml': PASSING }, ['--criteria', 'criteria.json', '--history', 'results']);
  assert.equal(r.code, 0);
  assert.equal(r.report.gates[0].status, 'not-checked');
  assert.ok(r.report.notes.some((n) => /no release candidate run/.test(n)));
});

test('cli: several --junit paths are one run, merged', async () => {
  const files = { 'criteria.json': criteriaText({ tests: { minPassRate: 100 } }), 'one/a.xml': suite([{ name: 'a' }]), 'two/b.xml': suite([{ name: 'b', classname: 'other.Test' }]), 'three.xml': suite([{ name: 'c', classname: 'third.Test' }]) };
  const r = await json(files, ['--criteria', 'criteria.json', '--junit', 'one', '--junit', 'two', '--junit', 'three.xml']);
  assert.equal(r.report.inputs.results.tests, 3);
  assert.equal(r.report.inputs.results.files, 3);
});

test('cli: --help and --version print and exit with 0', async () => {
  const h = await cli(['--help']);
  assert.equal(h.code, 0);
  assert.equal(h.out, USAGE);
  assert.match(USAGE, /No decision|Exit codes: 0 go, 1 no-go, 2 usage or input error/);
  const v = await cli(['--version']);
  assert.equal(v.code, 0);
  assert.equal(v.out, `${VERSION}\n`);
  assert.equal(VERSION, '1.0.0');
});

test('cli: the usage names every gate and says that the tool has no threshold of its own', () => {
  for (const id of ['pass-rate', 'critical-suites', 'skipped-share', 'flaky-count', 'unexplained-failures', 'line-coverage', 'branch-coverage', 'changed-line-coverage', 'changed-branch-coverage', 'open-defects', 'defect-severity', 'evidence-files']) assert.ok(USAGE.includes(id), id);
  assert.match(USAGE, /the tool has no threshold of its own/);
});

for (const [name, argv, pattern] of [
  ['no arguments', [], /give the criteria file with --criteria/],
  ['an unknown option', ['--criteria', 'c.json', '--nope'], /unknown argument --nope/],
  ['a bare path', ['--criteria', 'c.json', 'results'], /unexpected argument results; give each input with its option/],
  ['an option with no value', ['--criteria'], /--criteria needs a value/],
  ['an option followed by another option', ['--criteria', '--junit', 'x'], /--criteria needs a value/],
  ['a criteria file given twice', ['--criteria', 'a.json', '--criteria', 'b.json'], /--criteria was given twice/],
  ['a changed file given twice', ['--criteria', 'a.json', '--changed', 'x', '--changed', 'y'], /--changed was given twice/],
  ['an unknown format', ['--criteria', 'c.json', '--format', 'csv'], /unknown format csv \(text, markdown or json\)/],
  ['standard input', ['--criteria', '-'], /reading from standard input is not supported/],
  ['a URL as the criteria', ['--criteria', 'https://example.test/c.json'], /never fetches a URL/],
  ['a URL as results', ['--criteria', 'c.json', '--junit', 'http://example.test/r.xml'], /never fetches a URL/],
  ['a URL as the evidence root', ['--criteria', 'c.json', '--evidence-root', 'ftp://example.test/x'], /never fetches a URL/]
]) {
  test(`cli: ${name} is a usage error with exit code 2 and the usage on standard error`, async () => {
    const r = await cli(argv);
    assert.equal(r.code, 2);
    assert.match(r.err, pattern);
    assert.match(r.err, /Usage: release-gate-check/);
    assert.equal(r.out, '');
  });
}

test('cli: parseArgs keeps every input in order', () => {
  const o = parseArgs(['--criteria', 'c.json', '--junit', 'a', '--junit', 'b', '--history', 'h1', '--history', 'h2', '--coverage', 'x.info', '--changed', 'ch', '--defects', 'd.csv', '--evidence-root', 'ev', '--format', 'markdown', '--strict', '--explain']);
  assert.deepEqual(o.junit, ['a', 'b']);
  assert.deepEqual(o.history, ['h1', 'h2']);
  assert.deepEqual(o.coverage, ['x.info']);
  assert.equal(o.changed, 'ch');
  assert.equal(o.defects, 'd.csv');
  assert.equal(o.evidenceRoot, 'ev');
  assert.equal(o.format, 'markdown');
  assert.equal(o.strict, true);
  assert.equal(o.explain, true);
});

test('cli: a criteria file that does not exist, is not JSON, has an unknown key or states no gate is an input error with exit code 2', async () => {
  const missing = await run({}, ['--criteria', 'nope.json']);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /nope\.json: no such file/);
  const bad = await run({ 'c.json': '{"tests": ' }, ['--criteria', 'c.json']);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /c\.json: line 1, column \d+/);
  const unknown = await run({ 'c.json': '{"tests": {"minPasRate": 1}}' }, ['--criteria', 'c.json']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /c\.json:1: tests\.minPasRate: unknown key; did you mean minPassRate\?/);
  const none = await run({ 'c.json': '{}' }, ['--criteria', 'c.json']);
  assert.equal(none.code, 2);
  assert.match(none.err, /states no gate/);
  assert.equal(none.out, '');
});

test('cli: every problem of a criteria file is listed in one run', async () => {
  const r = await run({ 'c.json': '{"tests": {"minPasRate": 1, "maxFlakey": 0}, "cover": {}}' }, ['--criteria', 'c.json']);
  assert.equal(r.code, 2);
  assert.match(r.err, /the input has 3 problems/);
});

test('cli: a result file that cannot be read stops the run with exit code 2, and every such file is named', async () => {
  const r = await run({ 'criteria.json': ONE_GATE, 'results/a.xml': PASSING, 'results/broken.xml': '<testsuite><testcase', 'results/also.xml': '<?xml version="1.0"?><!DOCTYPE x><x/>' }, BASE);
  assert.equal(r.code, 2);
  assert.match(r.err, /no decision, the input has 2 problems/);
  assert.match(r.err, /results\/also\.xml: line 1, column \d+: the file has a DOCTYPE/);
  assert.match(r.err, /results\/broken\.xml: line 1, column \d+/);
  assert.equal(r.out, '');
});

test('cli: a coverage file with a malformed record, a defect export without the named column and a missing file are input errors', async () => {
  const files = { 'criteria.json': criteriaText({ coverage: { minLine: 1 }, defects: { closedStatuses: ['done'], maxOpenTotal: 1 } }), 'cov.info': 'SF:a.js\nDA:x,1\nend_of_record\n', 'd.csv': 'id,priority,status\n1,a,b\n' };
  const r = await run(files, ['--criteria', 'criteria.json', '--coverage', 'cov.info', '--coverage', 'missing.info', '--defects', 'd.csv']);
  assert.equal(r.code, 2);
  assert.match(r.err, /cov\.info:2: a DA record with the line number "x"/);
  assert.match(r.err, /missing\.info: no such file/);
  assert.match(r.err, /d\.csv: the header has no column named "severity"/);
});

test('cli: the report text for a criteria that holds only a name or only text from files has no control character', async () => {
  const r = await run({ 'criteria.json': criteriaText({ name: `x${String.fromCharCode(27)}[31m`, tests: { minPassRate: 100 } }), 'results/a.xml': PASSING }, BASE);
  assert.ok(!r.out.includes(String.fromCharCode(27)));
});

test('report: toText, toMarkdown and toJson work on a report built by the tool and end with a line break', async () => {
  const r = await json(FILES, BASE);
  for (const f of [toText, toMarkdown, toJson]) assert.ok(f(r.report).endsWith('\n'));
});
