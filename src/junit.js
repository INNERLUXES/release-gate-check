// Reads the test results out of the tree of one JUnit XML file: every testcase with its class name, name, suite, result,
// retries and the line where it starts, and sums the cases of one run into tests. It reads the shape of the test report
// of Maven Surefire (its schema is saved in research/sources): a testsuites or testsuite root, testsuite elements (nested
// or not), testcase elements with failure, error and skipped, and the flakyFailure, flakyError, rerunFailure and
// rerunError elements of Surefire retries. The time of a test is not read: no gate uses it.

import { safeText } from './text.js';

export const RESULT_KINDS = ['passed', 'failed', 'error', 'skipped'];

// The key of a test: its class name and its name. Two testcases with the same key are the same test.
export const testKey = (classname, name) => `${classname}\u0000${name}`;

// The name of a test as a report shows it.
export const testLabel = (classname, name) => (classname ? `${classname} > ${name}` : name);

const firstLine = (t) => t.trim().split(/\r?\n|\r/)[0] ?? '';

// Reads the results of one file. doc is the tree of src/xml.js; file is the path shown in the report. Returns
// { cases, notes }. Throws an Error with a reason when the root element is not testsuites or testsuite.
export function readJunit(doc, file) {
  const root = doc.root;
  if (root.name !== 'testsuites' && root.name !== 'testsuite') throw new Error(`the root element is <${root.name}>, not <testsuites> or <testsuite>`);
  const cases = [];
  let unnamed = 0;
  // An explicit stack: suites may nest as deep as the reader allows, with no recursion.
  const pending = [{ el: root, suite: root.name === 'testsuite' ? root.attrs.get('name') ?? '' : '' }];
  while (pending.length) {
    const { el, suite } = pending.pop();
    for (let k = el.children.length - 1; k >= 0; k -= 1) {
      const child = el.children[k];
      if (child.name === 'testsuite') pending.push({ el: child, suite: child.attrs.get('name') ?? suite });
      else if (child.name === 'testcase' && (el.name === 'testsuite' || el.name === 'testsuites')) {
        const c = readCase(child, suite, file);
        if (!c) unnamed += 1;
        else cases.push(c);
      }
    }
  }
  // Cases were taken from the end of each element; put them back in file order.
  cases.sort((a, b) => a.offset - b.offset);
  const notes = [];
  if (unnamed) notes.push(`${unnamed} testcase ${unnamed === 1 ? 'element has' : 'elements have'} no name attribute and ${unnamed === 1 ? 'was' : 'were'} not counted`);
  if (doc.replaced) notes.push(`${doc.replaced} numeric ${doc.replaced === 1 ? 'reference names a character' : 'references name characters'} that XML does not allow, read as the replacement character`);
  return { cases, notes };
}

function readCase(el, suite, file) {
  const name = el.attrs.get('name');
  if (name === undefined || name === '') return null;
  const classname = el.attrs.get('classname') ?? suite ?? '';
  const count = { failure: 0, error: 0, skipped: 0, flakyFailure: 0, flakyError: 0, rerunFailure: 0, rerunError: 0 };
  let message = '';
  for (const child of el.children) {
    if (Object.hasOwn(count, child.name)) count[child.name] += 1;
    if ((child.name === 'failure' || child.name === 'error') && !message) message = child.attrs.get('message') || firstLine(child.text);
  }
  const result = count.failure ? 'failed' : count.error ? 'error' : count.skipped ? 'skipped' : 'passed';
  return {
    key: testKey(classname, name),
    classname,
    name,
    label: testLabel(classname, name),
    suite: suite ?? '',
    file,
    line: el.line,
    offset: el.offset,
    result,
    // Retries written into one testcase: Surefire's flakyFailure and flakyError mean that it failed and then passed.
    flakyRetries: count.flakyFailure + count.flakyError,
    message
  };
}

const FAILED = new Set(['failed', 'error']);

// Sums the cases of one run into tests: a test that appears more than once in a run (a retry that was written as a new
// testcase) gets one outcome. flaky: it both passed and failed in the run, or it passed with Surefire flakyFailure or
// flakyError elements; failed: every attempt failed and at least one is a failure; error: every attempt failed and all of
// them are errors; skipped: every attempt was skipped; passed: it passed and never failed. A skip next to a pass counts as
// a pass. Returns { tests: Map(key -> test), counts } with counts of passed, failed, error, skipped and flaky tests.
export function summarizeRun(cases) {
  const tests = new Map();
  for (const c of cases) {
    let t = tests.get(c.key);
    if (!t) {
      t = { key: c.key, label: c.label, classname: c.classname, suites: new Set(), attempts: [], flakyRetries: 0, first: { file: c.file, line: c.line }, failure: null, outcome: 'passed' };
      tests.set(c.key, t);
    }
    t.attempts.push(c.result);
    t.suites.add(c.suite);
    t.flakyRetries += c.flakyRetries;
    if (FAILED.has(c.result) && !t.failure) t.failure = { file: c.file, line: c.line, message: safeText(c.message, 160) };
  }
  const counts = { passed: 0, failed: 0, error: 0, skipped: 0, flaky: 0 };
  for (const t of tests.values()) {
    const passed = t.attempts.includes('passed');
    const failed = t.attempts.some((r) => FAILED.has(r));
    if ((passed && failed) || (passed && t.flakyRetries > 0)) t.outcome = 'flaky';
    else if (failed) t.outcome = t.attempts.includes('failed') ? 'failed' : 'error';
    else if (passed) t.outcome = 'passed';
    else t.outcome = 'skipped';
    counts[t.outcome] += 1;
  }
  return { tests, counts };
}
