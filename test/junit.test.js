import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXml, readJunit, summarizeRun, testKey, testLabel } from '../src/index.js';
import { suite } from './helpers.js';

const read = (text, file = 'a.xml') => readJunit(parseXml(text), file);

test('junit: testcases with name, class name, result, line and the message of the first failure', () => {
  const r = read('<testsuite name="s">\n<testcase name="a" classname="c"/>\n<testcase name="b" classname="c"><failure message="boom">trace</failure></testcase>\n<testcase name="d" classname="c"><error>first line\nsecond</error></testcase>\n<testcase name="e" classname="c"><skipped/></testcase>\n</testsuite>');
  assert.deepEqual(r.cases.map((c) => [c.name, c.result, c.line]), [['a', 'passed', 2], ['b', 'failed', 3], ['d', 'error', 4], ['e', 'skipped', 6]]);
  assert.equal(r.cases[1].message, 'boom');
  assert.equal(r.cases[2].message, 'first line');
  assert.equal(r.cases[0].label, 'c > a');
});

test('junit: the class name falls back to the name of the nearest suite, and a testcase may sit under testsuites', () => {
  const r = read('<testsuites><testcase name="top"/><testsuite name="outer"><testsuite name="inner"><testcase name="x"/></testsuite><testcase name="y"/></testsuite></testsuites>');
  assert.deepEqual(r.cases.map((c) => [c.name, c.classname, c.suite]), [['top', '', ''], ['x', 'inner', 'inner'], ['y', 'outer', 'outer']]);
});

test('junit: the root must be testsuites or testsuite', () => {
  assert.throws(() => read('<report/>'), /root element is <report>, not <testsuites> or <testsuite>/);
});

test('junit: a testcase with no name is left out and counted in a note', () => {
  const r = read('<testsuite name="s"><testcase classname="c"/><testcase name="" classname="c"/><testcase name="ok"/></testsuite>');
  assert.equal(r.cases.length, 1);
  assert.deepEqual(r.notes, ['2 testcase elements have no name attribute and were not counted']);
});

test('junit: a numeric reference to a character that XML does not allow is counted in a note', () => {
  const r = read('<testsuite name="s"><testcase name="a&#27;b"/></testsuite>');
  assert.match(r.notes[0], /1 numeric reference names a character that XML does not allow/);
});

test('junit: suites nested very deep are read without recursion', () => {
  const text = `<testsuites>${'<testsuite name="s">'.repeat(200)}<testcase name="t"/>${'</testsuite>'.repeat(200)}</testsuites>`;
  assert.equal(read(text).cases.length, 1);
});

test('junit: the flakyFailure and flakyError elements of Surefire are counted as retries of the test', () => {
  const r = read('<testsuite name="s"><testcase name="a" classname="c"><flakyFailure message="x"><stackTrace>t</stackTrace></flakyFailure><flakyError message="y"/></testcase></testsuite>');
  assert.equal(r.cases[0].flakyRetries, 2);
  assert.equal(r.cases[0].result, 'passed');
});

test('junit: rerunFailure elements do not make a passing test flaky; the test failed on every retry', () => {
  const r = read('<testsuite name="s"><testcase name="a" classname="c"><failure message="x"/><rerunFailure message="x"/></testcase></testsuite>');
  assert.equal(r.cases[0].result, 'failed');
  assert.equal(r.cases[0].flakyRetries, 0);
});

test('junit: the key of a test is its class name and its name, and its label shows both', () => {
  assert.equal(testKey('c', 'n'), 'c\u0000n');
  assert.notEqual(testKey('a', 'b'), testKey('', 'a\u0000b'.slice(2)));
  assert.equal(testLabel('c', 'n'), 'c > n');
  assert.equal(testLabel('', 'n'), 'n');
});

const cases = (...rows) => rows.map(([classname, name, result, flakyRetries = 0], i) => ({ key: testKey(classname, name), classname, name, label: testLabel(classname, name), suite: classname, file: 'a.xml', line: i + 1, offset: i, result, flakyRetries, message: 'm' }));

test('summary: passed, failed, error and skipped tests are counted once each', () => {
  const { counts } = summarizeRun(cases(['c', 'a', 'passed'], ['c', 'b', 'failed'], ['c', 'd', 'error'], ['c', 'e', 'skipped']));
  assert.deepEqual(counts, { passed: 1, failed: 1, error: 1, skipped: 1, flaky: 0 });
});

test('summary: a test that passed and failed in one run is flaky, and so is a pass with Surefire retries', () => {
  const { tests, counts } = summarizeRun(cases(['c', 'a', 'failed'], ['c', 'a', 'passed'], ['c', 'b', 'passed', 1], ['c', 'd', 'passed']));
  assert.equal(counts.flaky, 2);
  assert.equal(tests.get(testKey('c', 'a')).outcome, 'flaky');
  assert.equal(tests.get(testKey('c', 'b')).outcome, 'flaky');
  assert.equal(tests.get(testKey('c', 'd')).outcome, 'passed');
});

test('summary: a test that failed every attempt is failed, or error when every failure is an error, and a skip next to a pass is a pass', () => {
  const { tests } = summarizeRun(cases(['c', 'a', 'failed'], ['c', 'a', 'error'], ['c', 'b', 'error'], ['c', 'b', 'error'], ['c', 'd', 'skipped'], ['c', 'd', 'passed'], ['c', 'e', 'skipped'], ['c', 'e', 'skipped']));
  assert.equal(tests.get(testKey('c', 'a')).outcome, 'failed');
  assert.equal(tests.get(testKey('c', 'b')).outcome, 'error');
  assert.equal(tests.get(testKey('c', 'd')).outcome, 'passed');
  assert.equal(tests.get(testKey('c', 'e')).outcome, 'skipped');
});

test('summary: the first failure of a test is kept with its file, line and a cleaned message', () => {
  const rows = cases(['c', 'a', 'failed']);
  rows[0].message = `bad${String.fromCharCode(27)}[31m message`;
  const t = summarizeRun(rows).tests.get(testKey('c', 'a'));
  assert.deepEqual(t.failure, { file: 'a.xml', line: 1, message: 'bad [31m message' });
  assert.deepEqual(t.first, { file: 'a.xml', line: 1 });
});

test('summary: tests named __proto__ and constructor are only names', () => {
  const { tests, counts } = summarizeRun(cases(['__proto__', 'constructor', 'failed'], ['toString', '__proto__', 'passed']));
  assert.equal(tests.size, 2);
  assert.equal(counts.failed, 1);
  assert.equal({}.failed, undefined);
});

test('summary: a result file written with CRLF line ends gives the same cases and the same lines', () => {
  const lf = suite([{ name: 'a' }, { name: 'b', result: 'failed' }]);
  const crlf = lf.split('\n').join('\r\n');
  assert.deepEqual(read(lf).cases.map((c) => [c.name, c.result, c.line]), read(crlf).cases.map((c) => [c.name, c.result, c.line]));
});
