import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { CriteriaError, KEYS, evidencePath, readCriteria, scaledPercent } from '../src/index.js';

const problems = (object, file = 'c.json') => {
  try {
    readCriteria(typeof object === 'string' ? object : JSON.stringify(object), file);
  } catch (error) {
    assert.ok(error instanceof CriteriaError, error.message);
    return error.problems.map((p) => p.text);
  }
  return [];
};
const one = (object, pattern) => {
  const p = problems(object);
  assert.ok(p.length >= 1, 'no problem found');
  assert.ok(p.some((t) => pattern.test(t)), p.join(' | '));
};

test('criteria: every gate is optional; one gate is enough, and the normal form keeps the numbers from the file', () => {
  const c = readCriteria('{"name": "Release", "tests": {"minPassRate": 99.5}}', 'c.json');
  assert.equal(c.name, 'Release');
  assert.deepEqual(c.tests.minPassRate, { scaled: 995000, shown: 99.5 });
  assert.equal(c.coverage, null);
  assert.equal(c.defects, null);
  assert.equal(c.evidence, null);
});

test('criteria: the full set of gates is read', () => {
  const c = readCriteria(JSON.stringify({
    name: 'Full',
    tests: { minPassRate: 95, maxSkippedShare: 4, maxFlaky: 1, criticalSuites: { suites: ['a', 'b'], maxFailing: 0 }, noUnexplainedFailures: { lastRuns: 3, explained: ['a > x'] } },
    coverage: { minLine: 80, minBranch: 70, exclude: ['gen/**'], changedFiles: { minLine: 90, minBranch: 60, ignore: ['*.md'] } },
    defects: { columns: { id: 'Key', severity: 'Priority', status: 'State' }, delimiter: ';', closedStatuses: ['Done'], maxOpen: { Blocker: 0, major: 3 }, maxOpenTotal: 10 },
    evidence: { required: ['reports/a.pdf', './reports//b.pdf'] }
  }), 'c.json');
  assert.equal(c.tests.criticalSuites.suites.length, 2);
  assert.equal(c.tests.noUnexplainedFailures.lastRuns, 3);
  assert.deepEqual(c.coverage.exclude, ['gen/**']);
  assert.deepEqual(c.defects.maxOpen.map((m) => [m.name, m.shown, m.max]), [['blocker', 'Blocker', 0], ['major', 'major', 3]]);
  assert.equal(c.defects.delimiter, ';');
  assert.deepEqual(c.evidence.required, ['reports/a.pdf', 'reports/b.pdf']);
  assert.deepEqual(c.columns, { id: 'Key', severity: 'Priority', status: 'State' });
});

test('criteria: the default names of the defect columns are id, severity and status, and no default threshold exists', () => {
  const c = readCriteria('{"defects": {"closedStatuses": ["closed"], "maxOpenTotal": 0}}', 'c.json');
  assert.deepEqual(c.columns, { id: 'id', severity: 'severity', status: 'status' });
  for (const [key, spec] of Object.entries(KEYS)) {
    if (typeof spec === 'object') for (const [k, kind] of Object.entries(spec)) assert.ok(typeof kind === 'string' || typeof kind === 'object', `${key}.${k}`);
  }
});

test('criteria: a file with no gate is an error, because it would always say go', () => {
  one('{}', /states no gate/);
  one('{"name": "only a name"}', /states no gate/);
  one('{"tests": {}}', /states no gate/);
});

test('criteria: an unknown key is an error with its line, and a near miss is suggested', () => {
  const p = problems('{\n  "tests": {\n    "minPasRate": 95,\n    "maxFlaky": 0\n  }\n}');
  assert.equal(p.length, 1);
  assert.equal(p[0], 'c.json:3: tests.minPasRate: unknown key; did you mean minPassRate?');
  one({ tests: { minPassRate: 95 }, covarage: {} }, /covarage: unknown key; did you mean coverage\?/);
  one({ tests: { minPassRate: 95, zzz: 1 } }, /tests\.zzz: unknown key; the keys here are minPassRate/);
  one({ tests: { criticalSuites: { suites: ['a'], maxFailing: 0, extra: 1 } } }, /unknown key/);
});

test('criteria: every unknown key is listed, not only the first', () => {
  const p = problems({ tests: { minPasRate: 1, maxFlakey: 0 }, defect: {} });
  assert.equal(p.length, 3);
});

test('criteria: a name that appears twice is refused by the JSON reader', () => {
  one('{"tests": {"minPassRate": 90, "minPassRate": 99}}', /appears twice/);
});

for (const [name, object, pattern] of [
  ['a percentage above 100', { tests: { minPassRate: 101 } }, /not a percentage from 0 to 100/],
  ['a negative percentage', { tests: { minPassRate: -1 } }, /not a percentage/],
  ['a percentage with five decimals', { tests: { minPassRate: 99.99999 } }, /at most four decimals/],
  ['a percentage written as a string', { tests: { minPassRate: '95' } }, /must be a number from 0 to 100, not a string/],
  ['a count with a fraction', { tests: { maxFlaky: 1.5 } }, /not a whole number from 0/],
  ['a negative count', { tests: { maxFlaky: -1 } }, /not a whole number from 0/],
  ['a count written as a boolean', { tests: { maxFlaky: true } }, /not a boolean/],
  ['lastRuns of 0', { tests: { noUnexplainedFailures: { lastRuns: 0, explained: [] } } }, /from 1 to 100; 0 runs would check nothing/],
  ['lastRuns above 100', { tests: { noUnexplainedFailures: { lastRuns: 101 } } }, /not a whole number of runs from 1 to 100/],
  ['criticalSuites with no maxFailing', { tests: { criticalSuites: { suites: ['a'] } } }, /needs both suites and maxFailing/],
  ['criticalSuites with no suites', { tests: { criticalSuites: { maxFailing: 0 } } }, /needs both suites and maxFailing/],
  ['criticalSuites with an empty list', { tests: { criticalSuites: { suites: [], maxFailing: 0 } } }, /empty list/],
  ['a suite that is an empty string', { tests: { criticalSuites: { suites: [''], maxFailing: 0 } } }, /must be a string that is not empty/],
  ['noUnexplainedFailures with no lastRuns', { tests: { noUnexplainedFailures: { explained: [] } } }, /needs lastRuns/],
  ['tests that is not an object', { tests: [] }, /must be an object, not an array/],
  ['coverage with only exclude', { coverage: { exclude: ['a/**'] } }, /states no gate/],
  ['coverage with exclude and only changedFiles', { coverage: { exclude: ['a/**'], changedFiles: { minLine: 80 } } }, /leaves files out of the overall coverage/],
  ['changedFiles with no minimum', { coverage: { minLine: 80, changedFiles: { ignore: ['*.md'] } } }, /changedFiles: states no gate/],
  ['a backslash in a pattern', { coverage: { minLine: 80, exclude: ['a\\b'] } }, /backslash/],
  ['an absolute pattern', { coverage: { minLine: 80, exclude: ['/abs/*'] } }, /starts with a slash/],
  ['more than twenty patterns', { coverage: { minLine: 80, exclude: Array.from({ length: 21 }, (_, i) => `d${i}/**`) } }, /more than 20 patterns/],
  ['defects with no closedStatuses', { defects: { maxOpenTotal: 1 } }, /closedStatuses.*is needed/],
  ['defects with no limit', { defects: { closedStatuses: ['done'] } }, /states no limit/],
  ['defects with an empty maxOpen', { defects: { closedStatuses: ['done'], maxOpen: {} } }, /is empty; name at least one severity/],
  ['two severities that differ only in case', { defects: { closedStatuses: ['done'], maxOpen: { Major: 1, major: 2 } } }, /same severity as another key/],
  ['a delimiter that is not allowed', { defects: { closedStatuses: ['done'], maxOpenTotal: 1, delimiter: '|' } }, /must be one of/],
  ['a column name that is empty', { defects: { closedStatuses: ['done'], maxOpenTotal: 1, columns: { id: '' } } }, /must be a string that is not empty/],
  ['evidence with an empty list', { evidence: { required: [] } }, /empty list/],
  ['evidence with a path named twice', { evidence: { required: ['a.pdf', './a.pdf'] } }, /named twice/],
  ['evidence with a number', { evidence: { required: [5] } }, /is empty; write the path of a file/],
  ['evidence with no required', { evidence: {} }, /states no file/]
]) {
  test(`criteria: ${name} is an error`, () => {
    one(object, pattern);
  });
}

test('criteria: evidence paths must be relative, with forward slashes, below the evidence folder', () => {
  assert.deepEqual(evidencePath('reports/a.pdf'), { path: 'reports/a.pdf' });
  assert.deepEqual(evidencePath('./reports//a.pdf'), { path: 'reports/a.pdf' });
  assert.match(evidencePath('/etc/passwd').problem, /absolute path/);
  assert.match(evidencePath('C:/Users/a/report.pdf').problem, /absolute path/);
  assert.match(evidencePath('c:report.pdf').problem, /absolute path/);
  assert.match(evidencePath('..\\x').problem, /backslash/);
  assert.match(evidencePath('reports\\a.pdf').problem, /backslash/);
  assert.match(evidencePath('../a.pdf').problem, /goes up with \.\./);
  assert.match(evidencePath('reports/../../a.pdf').problem, /goes up with \.\./);
  assert.match(evidencePath('reports/').problem, /names a folder/);
  assert.match(evidencePath('').problem, /is empty/);
  assert.match(evidencePath('.').problem, /is empty/);
  assert.match(evidencePath(`a${String.fromCharCode(0)}b`).problem, /control character/);
  assert.match(evidencePath('a'.repeat(301)).problem, /longer than 300/);
});

test('criteria: a path that is absolute on this system is refused whatever the system', () => {
  const absolute = resolve('some', 'report.pdf');
  assert.match(evidencePath(absolute.split('\\').join('/')).problem, /absolute path/);
  one({ evidence: { required: [absolute.split('\\').join('/')] } }, /absolute path/);
});

test('criteria: a path with a drive letter or a UNC start is refused on every system', () => {
  assert.match(evidencePath('D:/x').problem, /absolute path/);
  assert.match(evidencePath('//server/share/x').problem, /absolute path/);
  assert.match(evidencePath('\\\\server\\share\\x').problem, /backslash/);
});

test('criteria: percentages are kept as whole numbers, so 99.9 is not 99.89999999999999', () => {
  assert.equal(scaledPercent(99.9), 999000);
  assert.equal(scaledPercent(0), 0);
  assert.equal(scaledPercent(100), 1000000);
  assert.equal(scaledPercent(33.3333), 333333);
  assert.equal(scaledPercent(0.0001), 1);
  assert.equal(scaledPercent(95.00001), null);
});

test('criteria: the top level must be one object, and a text that is not JSON is an error with its place', () => {
  one('[]', /must be one JSON object, not an array/);
  one('"x"', /must be one JSON object/);
  one('null', /must be one JSON object/);
  one('{"tests": }', /line 1, column \d+/);
  one('', /ends where a value was expected/);
});

test('criteria: a key such as __proto__ is an unknown key and changes nothing', () => {
  one('{"__proto__": {"minPassRate": 1}, "tests": {"maxFlaky": 0}}', /__proto__: unknown key/);
  assert.equal({}.minPassRate, undefined);
});

test('criteria: the name is cleaned of control characters and cut', () => {
  const c = readCriteria(JSON.stringify({ name: `x${String.fromCharCode(0x202e)}y${'z'.repeat(300)}`, tests: { maxFlaky: 0 } }), 'c.json');
  assert.ok(!c.name.includes(String.fromCharCode(0x202e)));
  assert.ok(c.name.length <= 120);
});
