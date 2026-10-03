import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, main, parseCsv } from '../src/index.js';
import { PASSING, criteriaText, lcovSection, run, suite, withFiles } from './helpers.js';

// Hostile input: a file that tries to expand entities, fetch an external entity, exhaust the memory or the time, lead the
// tool out of the folder or round in a loop, rewrite the terminal, break a table or change how objects behave. Each test
// also checks the time, because work that grows faster than the input is a failure even when the answer is right.

const LIMIT = { timeout: 60000 };
const fast = async (fn, ms = 5000) => {
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < ms, `took ${Date.now() - start} ms`);
  return result;
};

const TESTS = criteriaText({ tests: { minPassRate: 100 } });
const BASE = ['--criteria', 'criteria.json', '--junit', 'results'];
const withResults = (files) => ({ 'criteria.json': TESTS, ...files });

test('hostile: the billion laughs never expand; the file is refused at its DOCTYPE, at once, and no decision is made', LIMIT, async () => {
  const lol = ['<?xml version="1.0"?>', '<!DOCTYPE lolz [', '<!ENTITY lol "lol">'];
  for (let i = 1; i < 10; i += 1) lol.push(`<!ENTITY lol${i} "${`&lol${i === 1 ? '' : i - 1};`.repeat(10)}">`);
  lol.push(']>', '<testsuite name="s"><testcase name="&lol9;"/></testsuite>');
  const r = await fast(() => run(withResults({ 'results/lol.xml': lol.join('\n') }), BASE), 1500);
  assert.equal(r.code, 2);
  assert.match(r.err, /results\/lol\.xml: line 2, column 1: the file has a DOCTYPE/);
  assert.ok(r.err.length < 5000);
  assert.equal(r.out, '');
});

test('hostile: an external entity is never fetched or read, in a result file or a Cobertura report', LIMIT, async () => {
  const secret = 'TOP-SECRET-CONTENT';
  await withFiles({ 'secret.txt': secret }, async (dir) => {
    const target = resolve(dir, 'secret.txt').split('\\').join('/');
    const xxe = `<?xml version="1.0"?>\n<!DOCTYPE testsuite [<!ENTITY xxe SYSTEM "file://${target}">]>\n<testsuite name="s"><testcase name="&xxe;"/></testsuite>`;
    const cob = `<?xml version="1.0"?>\n<!DOCTYPE coverage [<!ENTITY xxe SYSTEM "file://${target}">]>\n<coverage><packages><package><classes><class filename="&xxe;"><lines/></class></classes></package></packages></coverage>`;
    await writeFile(resolve(dir, 'criteria.json'), criteriaText({ tests: { minPassRate: 100 }, coverage: { minLine: 1 } }));
    await writeFile(resolve(dir, 'r.xml'), xxe);
    await writeFile(resolve(dir, 'c.xml'), cob);
    await writeFile(resolve(dir, 'undeclared.xml'), '<testsuite name="s"><testcase name="&xxe;"/></testsuite>');
    for (const format of ['text', 'json', 'markdown']) {
      for (const results of ['r.xml', 'undeclared.xml']) {
        let out = '';
        let err = '';
        const code = await main(['--criteria', 'criteria.json', '--junit', results, '--coverage', 'c.xml', '--format', format], { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
        assert.equal(code, 2);
        assert.ok(!out.includes(secret) && !err.includes(secret), `${format} ${results}`);
      }
    }
  });
});

test('hostile: a parameter entity that loads a remote DTD is refused with the DOCTYPE and nothing is fetched', LIMIT, async () => {
  const text = '<!DOCTYPE x [<!ENTITY % remote SYSTEM "https://example.test/evil.dtd"> %remote;]><testsuite name="s"/>';
  const r = await run(withResults({ 'results/a.xml': text }), BASE);
  assert.equal(r.code, 2);
  assert.match(r.err, /the file has a DOCTYPE/);
});

test('hostile: elements nested a hundred thousand deep are refused at 256 levels, in one pass', LIMIT, async () => {
  const deep = `<testsuites>${'<testsuite name="s">'.repeat(100000)}${'</testsuite>'.repeat(100000)}</testsuites>`;
  const r = await fast(() => run(withResults({ 'results/a.xml': deep }), BASE));
  assert.equal(r.code, 2);
  assert.match(r.err, /elements nested more than 256 deep/);
  const ok = `<testsuites>${'<testsuite name="s">'.repeat(200)}<testcase name="t"/>${'</testsuite>'.repeat(200)}</testsuites>`;
  assert.equal((await run(withResults({ 'results/a.xml': ok }), BASE)).code, 0);
});

test('hostile: tags, quotes, comments and CDATA that never end, and long runs of < and &, are refused in one pass', LIMIT, async () => {
  for (const text of [`<testsuite name="${'x'.repeat(300000)}`, `<testsuite><!--${'-'.repeat(300000)}`, `<testsuite><![CDATA[${']'.repeat(300000)}`, '<'.repeat(200000), `<testsuite>${'&'.repeat(200000)}</testsuite>`, `<testsuite>${'<b'.repeat(100000)}`]) {
    const r = await fast(() => run(withResults({ 'results/a.xml': text }), BASE), 4000);
    assert.equal(r.code, 2);
  }
});

test('hostile: a file over the size limit is an input error that names the file; each kind of input has the limit', LIMIT, async () => {
  const small = { ...LIMITS, maxFileBytes: 200, maxCriteriaBytes: 100 };
  const files = {
    'criteria.json': criteriaText({ tests: { minPassRate: 100 }, coverage: { minLine: 1, changedFiles: { minLine: 1 } }, defects: { closedStatuses: ['done'], maxOpenTotal: 0 } }),
    'results/a.xml': suite([{ name: 'a', message: 'x'.repeat(10) }]),
    'big.xml': suite(Array.from({ length: 30 }, (_, i) => ({ name: `t${i}` }))),
    'cov.info': `SF:a.js\n${'DA:1,1\n'.repeat(60)}end_of_record\n`,
    'changed.txt': `${'src/x.js\n'.repeat(40)}`,
    'd.csv': `id,severity,status\n${'1,a,b\n'.repeat(60)}`
  };
  const criteriaOverLimit = await run(files, BASE, small);
  assert.equal(criteriaOverLimit.code, 2);
  assert.match(criteriaOverLimit.err, /criteria\.json: .* bytes is over the 100 byte limit/);
  const bigger = { ...small, maxCriteriaBytes: 100000 };
  const r = await run(files, ['--criteria', 'criteria.json', '--junit', 'big.xml', '--coverage', 'cov.info', '--changed', 'changed.txt', '--defects', 'd.csv'], bigger);
  assert.equal(r.code, 2);
  for (const name of ['big.xml', 'cov.info', 'changed.txt', 'd.csv']) assert.match(r.err, new RegExp(`${name.replace('.', '\\.')}: .* bytes is over the 200 byte limit`));
});

test('hostile: the limits of the input refuse it with exit code 2, rather than reading part of it', LIMIT, async () => {
  const files = withResults({ 'results/a/b/c/d/e.xml': 'x', 'results/f.xml': 'x', 'results/g.xml': 'x' });
  const entries = await run(files, BASE, { ...LIMITS, maxEntries: 3 });
  assert.equal(entries.code, 2);
  assert.match(entries.err, /the runs hold more than 3 files and folders/);
  const depth = await run(files, BASE, { ...LIMITS, maxDepth: 2 });
  assert.match(depth.err, /has folders nested more than 2 deep/);
  const xml = await run(files, BASE, { ...LIMITS, maxXmlFiles: 2 });
  assert.match(xml.err, /more than 2 XML files/);
  const total = await run(files, BASE, { ...LIMITS, maxTotalBytes: 2 });
  assert.match(total.err, /the XML files to read hold more than 2 byte/);
  const history = await run(withResults({ 'results/a.xml': PASSING, 'h1.xml': PASSING, 'h2.xml': PASSING }), [...BASE, '--history', 'h1.xml', '--history', 'h2.xml'], { ...LIMITS, maxRuns: 1 });
  assert.equal(history.code, 2);
  assert.match(history.err, /more than 1 --history runs/);
});

test('hostile: a binary file or a UTF-16 file with an .xml name, or a binary lcov file, is refused and named', LIMIT, async () => {
  await withFiles({ 'criteria.json': criteriaText({ tests: { minPassRate: 100 }, coverage: { minLine: 1 } }), 'results/ok.xml': PASSING }, async (dir) => {
    await writeFile(resolve(dir, 'results/a.xml'), Buffer.from([0x3c, 0x00, 0x01, 0xff]));
    await writeFile(resolve(dir, 'results/c.xml'), Buffer.from([0xff, 0xfe, 0x3c, 0x00, 0x61, 0x00]));
    await writeFile(resolve(dir, 'cov.info'), Buffer.from([0x53, 0x46, 0x3a, 0x00, 0x01]));
    let err = '';
    const code = await main([...BASE, '--coverage', 'cov.info'], { out: () => {}, err: (t) => { err += t; } }, undefined, dir);
    assert.equal(code, 2);
    assert.match(err, /results\/a\.xml: holds binary data \(a null byte\)/);
    assert.match(err, /results\/c\.xml: is UTF-16; only UTF-8 is read/);
    assert.match(err, /cov\.info: holds binary data \(a null byte\)/);
  });
});

test('hostile: bad CSV quoting in the defect export is an input error with its line, never a guess', LIMIT, async () => {
  const criteria = criteriaText({ defects: { closedStatuses: ['done'], maxOpen: { blocker: 0 } } });
  for (const [csv, pattern] of [
    ['id,severity,status\nD-1,blocker,"open\nD-2,minor,done\n', /d\.csv: line 2: a field in double quotes that starts on line 2 is never closed/],
    ['id,severity,status\nD-1,bl"ocker,open\n', /d\.csv: line 2: a double quote inside a field that is not in double quotes/],
    ['id,severity,status\nD-1,"blocker"x,open\n', /d\.csv: line 2: text after the closing double quote/],
    ['id,severity,status\nD-1,blocker\n', /d\.csv: line 2: 2 fields where the header on line 1 has 3/],
    ['', /d\.csv: line 1: the file holds no header line/]
  ]) {
    const r = await run({ 'criteria.json': criteria, 'd.csv': csv }, ['--criteria', 'criteria.json', '--defects', 'd.csv']);
    assert.equal(r.code, 2, csv);
    assert.match(r.err, pattern);
    assert.equal(r.out, '', 'no verdict on a half-read export');
  }
});

test('hostile: a defect export of a hundred thousand rows is read in a few seconds, and the report stays small', LIMIT, async () => {
  const rows = Array.from({ length: 100000 }, (_, i) => `D-${i},minor,${i % 7 === 0 ? 'Open' : 'Done'}`).join('\n');
  const criteria = criteriaText({ defects: { closedStatuses: ['done'], maxOpen: { blocker: 0 }, maxOpenTotal: 1000000 } });
  const r = await fast(() => run({ 'criteria.json': criteria, 'd.csv': `id,severity,status\n${rows}\n` }, ['--criteria', 'criteria.json', '--defects', 'd.csv']), 15000);
  assert.equal(r.code, 0);
  assert.ok(r.out.length < 20000, `the report has ${r.out.length} characters`);
});

test('hostile: a hundred thousand rows in a CSV with one very long quoted field are refused by the field limit', LIMIT, () => {
  assert.throws(() => parseCsv(`a\n"${'x'.repeat(100000)}"\n`), /longer than 65,536 characters/);
});

test('hostile: tens of thousands of tests in several runs are lined up in time and the report stays small', LIMIT, async () => {
  const n = 20000;
  const big = (result) => `<testsuite name="s">${Array.from({ length: n }, (_, i) => `<testcase name="t${i}" classname="c${i % 50}" time="0.01"${result === 'failed' ? '><failure message="m"/></testcase>' : '/>'}`).join('')}</testsuite>`;
  const criteria = criteriaText({ tests: { minPassRate: 99, noUnexplainedFailures: { lastRuns: 3 } } });
  const r = await fast(() => run({ 'criteria.json': criteria, 'now.xml': big('failed'), 'h1.xml': big('failed'), 'h2.xml': big('ok') }, ['--criteria', 'criteria.json', '--junit', 'now.xml', '--history', 'h1.xml', '--history', 'h2.xml']), 20000);
  assert.equal(r.code, 1);
  assert.ok(r.out.length < 20000, `the report has ${r.out.length} characters`);
  assert.match(r.out, /found: 0% \(0 of 20,000 executed tests passed\)/);
});

test('hostile: a coverage report with a hundred thousand files and a pattern list is read in a few seconds', LIMIT, async () => {
  const text = Array.from({ length: 100000 }, (_, i) => `SF:src/m${i % 300}/f${i}.js\nDA:1,${i % 2}\nend_of_record`).join('\n');
  const criteria = criteriaText({ coverage: { minLine: 40, exclude: ['src/m1/**', '**/*.min.js', 'vendor/**'], changedFiles: { minLine: 1, ignore: ['*.md'] } } });
  const changed = Array.from({ length: 5000 }, (_, i) => `src/m${i % 300}/f${i}.js`).join('\n');
  const r = await fast(() => run({ 'criteria.json': criteria, 'cov.info': text, 'changed.txt': changed }, ['--criteria', 'criteria.json', '--coverage', 'cov.info', '--changed', 'changed.txt']), 30000);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.length < 30000);
});

test('hostile: the list of changed files refuses a control character and a very long path with the line, and has a limit', LIMIT, async () => {
  const criteria = criteriaText({ coverage: { changedFiles: { minLine: 1 } } });
  const cov = lcovSection({ path: 'a.js', lines: [[1, 1]] });
  const bad = `ok.js\nbad${String.fromCharCode(27)}[31m.js\n${'a'.repeat(3000)}\n`;
  const r = await run({ 'criteria.json': criteria, 'cov.info': cov, 'changed.txt': bad }, ['--criteria', 'criteria.json', '--coverage', 'cov.info', '--changed', 'changed.txt']);
  assert.equal(r.code, 2);
  assert.match(r.err, /changed\.txt:2: a path with a control character/);
  assert.match(r.err, /changed\.txt:3: a path longer than 1024 characters/);
  assert.ok(!r.err.includes(String.fromCharCode(27)));
  const many = await run({ 'criteria.json': criteria, 'cov.info': cov, 'changed.txt': 'a\nb\nc\n' }, ['--criteria', 'criteria.json', '--coverage', 'cov.info', '--changed', 'changed.txt'], { ...LIMITS, maxChanged: 2 });
  assert.equal(many.code, 2);
  assert.match(many.err, /more than 2 changed files/);
});

test('hostile: a path in a coverage report or a changed list is only text; it is never opened', LIMIT, async () => {
  const criteria = criteriaText({ coverage: { minLine: 1, changedFiles: { minLine: 1 } } });
  const cov = lcovSection({ path: '../../../../etc/passwd', lines: [[1, 1]] }) + lcovSection({ path: 'C:\\Windows\\win.ini', lines: [[1, 1]] });
  const r = await run({ 'criteria.json': criteria, 'cov.info': cov, 'changed.txt': '../../../../etc/passwd\nC:\\Windows\\win.ini\n' }, ['--criteria', 'criteria.json', '--coverage', 'cov.info', '--changed', 'changed.txt', '--explain']);
  assert.equal(r.code, 0);
  assert.ok(r.out.includes('../../../../etc/passwd'));
  assert.ok(r.out.includes('C:/Windows/win.ini'), 'a Windows path is compared with forward slashes on every system');
});

test('hostile: control, direction and line separator characters in names are cleaned in every format', LIMIT, async () => {
  const bad = ['x', String.fromCharCode(27), '[31m', String.fromCharCode(0x202e), 'y', String.fromCharCode(0x2028), 'z', String.fromCharCode(0x85)].join('');
  const xmlBad = bad.replace(String.fromCharCode(27), '&#27;');
  // The criteria refuse a control character of the first block, so the criteria hold the other characters only.
  const inCriteria = bad.replace(String.fromCharCode(27), '');
  const criteria = criteriaText({ name: inCriteria, tests: { minPassRate: 100, criticalSuites: { suites: [inCriteria], maxFailing: 0 } }, defects: { closedStatuses: ['done'], maxOpen: { [inCriteria]: 0 } } });
  const files = { 'criteria.json': criteria, 'results/a.xml': suite([{ name: xmlBad, classname: xmlBad, result: 'failed', message: xmlBad }]), 'd.csv': `id,severity,status\n${bad},${bad},open\n` };
  for (const format of ['text', 'markdown', 'json']) {
    const r = await run(files, [...BASE, '--defects', 'd.csv', '--format', format, '--explain']);
    assert.equal(r.code, 1, r.err);
    for (const code of [27, 0x202e, 0x2028, 0x85]) assert.ok(!r.out.includes(String.fromCharCode(code)), `${format} character ${code}`);
  }
});

test('hostile: test, suite and severity names such as __proto__, constructor and toString are only names', LIMIT, async () => {
  const criteria = criteriaText({ tests: { minPassRate: 100, criticalSuites: { suites: ['__proto__', 'constructor'], maxFailing: 0 } }, defects: { closedStatuses: ['done'], maxOpen: { constructor: 0, toString: 0 } } });
  const files = { 'criteria.json': criteria, 'results/a.xml': suite([{ name: '__proto__', classname: 'constructor', result: 'failed' }, { name: 'toString', classname: '__proto__' }], { name: 'hasOwnProperty' }), 'd.csv': 'id,severity,status\n__proto__,constructor,open\ntoString,toString,done\n' };
  const r = await run(files, [...BASE, '--defects', 'd.csv']);
  assert.equal(r.code, 1);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.match(r.out, /NOT MET {6}open-defects:constructor/);
  assert.match(r.out, /MET {10}open-defects:tostring/);
});

test('hostile: a test name that starts with = or holds a link or a tag cannot break a Markdown table', LIMIT, async () => {
  const evil = '=HYPERLINK("x","y")|a<script>[click](https://evil.example.test)`x`';
  const files = { 'criteria.json': TESTS, 'results/a.xml': suite([{ name: evil, classname: '', result: 'failed' }]) };
  const r = await run(files, [...BASE, '--format', 'markdown', '--explain']);
  assert.ok(!r.out.includes('<script>'));
  assert.ok(!r.out.includes('[click]('));
  for (const row of r.out.split('\n').filter((l) => l.startsWith('| **not met**'))) assert.equal(row.replace(/\\\|/g, '').split('|').length, 7, row.slice(0, 80));
});

test('hostile: no test is ever run, whatever the names: a script in a result is only text', LIMIT, async () => {
  const marker = 'ran-a-test.txt';
  const text = suite([{ name: `require('fs').writeFileSync('${marker}', 'x')`, classname: 'process.exit(3)' }]);
  await withFiles(withResults({ 'results/a.xml': text }), async (dir) => {
    assert.equal(await main(BASE, { out: () => {}, err: () => {} }, undefined, dir), 0);
    assert.deepEqual((await (await import('node:fs/promises')).readdir(dir)).sort(), ['criteria.json', 'results']);
  });
});

test('hostile: a criteria file with a hostile shape is refused: deep nesting, a huge number, a repeated key', LIMIT, async () => {
  for (const [text, pattern] of [
    [`{"tests": ${'['.repeat(5000)}`, /nested more than 32 deep/],
    ['{"tests": {"minPassRate": 1e999}}', /too large/],
    ['{"tests": {"maxFlaky": 1e30}}', /not a whole number from 0/],
    ['{"tests": {"maxFlaky": 0, "maxFlaky": 1}}', /appears twice/],
    [`{"name": "${'x'.repeat(10000)}", "tests": {"maxFlaky": 0}}`, /string longer than 4096/]
  ]) {
    const r = await fast(() => run({ 'c.json': text }, ['--criteria', 'c.json']));
    assert.equal(r.code, 2, text.slice(0, 40));
    assert.match(r.err, pattern);
  }
});

test('hostile: an argument that is a URL, a very long path, or a path with control characters is refused cleanly', LIMIT, async () => {
  const url = await run({}, ['--criteria', 'https://example.test/c.json']);
  assert.equal(url.code, 2);
  assert.match(url.err, /never fetches a URL/);
  const long = await run({}, ['--criteria', `${'a'.repeat(5000)}.json`]);
  assert.equal(long.code, 2);
  assert.ok(long.err.length < 8000);
  const control = await run({}, ['--criteria', `x${String.fromCharCode(27)}[31m.json`]);
  assert.equal(control.code, 2);
  assert.ok(!control.err.includes(String.fromCharCode(27)));
});

test('paths: folders, files and the criteria with spaces in their names are read on every system', LIMIT, async () => {
  const files = {
    'release criteria.json': criteriaText({ tests: { minPassRate: 100 }, coverage: { minLine: 1, changedFiles: { minLine: 1 } }, defects: { closedStatuses: ['done'], maxOpenTotal: 0 }, evidence: { required: ['signed reports/final report.txt'] } }),
    'my results/run 1/TEST a.xml': PASSING,
    'my coverage/lcov file.info': lcovSection({ path: 'src/my file.js', lines: [[1, 1]] }),
    'changed files.txt': 'src/my file.js\n',
    'open defects.csv': 'id,severity,status\nD-1,minor,done\n',
    'proof folder/signed reports/final report.txt': 'signed\n'
  };
  const r = await run(files, ['--criteria', 'release criteria.json', '--junit', 'my results/run 1', '--coverage', 'my coverage/lcov file.info', '--changed', 'changed files.txt', '--defects', 'open defects.csv', '--evidence-root', 'proof folder']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /release-gate-check: release criteria\.json/);
  assert.match(r.out, /evidence folder proof folder/);
});

test('paths: absolute paths work on every system, built with resolve and not join', LIMIT, async () => {
  await withFiles({ 'criteria.json': criteriaText({ tests: { minPassRate: 100 }, evidence: { required: ['proof.txt'] } }), 'results/a.xml': PASSING, 'evidence/proof.txt': 'signed\n' }, async (dir) => {
    let out = '';
    const argv = ['--criteria', resolve(dir, 'criteria.json'), '--junit', resolve(dir, 'results'), '--evidence-root', resolve(dir, 'evidence'), '--format', 'json'];
    const code = await main(argv, { out: (t) => { out += t; }, err: () => {} }, undefined, process.cwd());
    assert.equal(code, 0);
    const report = JSON.parse(out);
    assert.ok(report.criteria.file.endsWith('criteria.json'));
    assert.ok(!report.criteria.file.includes('\\'), 'a path in a report has forward slashes');
    assert.ok(report.inputs.results.paths.includes('/results'));
  });
});

test('paths: an evidence path in the criteria that is absolute here is an input error, not a file that is looked at', LIMIT, async () => {
  await withFiles({ 'outside.txt': 'x\n' }, async (dir) => {
    const absolute = resolve(dir, 'outside.txt').split('\\').join('/');
    const r = await run({ 'criteria.json': criteriaText({ evidence: { required: [absolute] } }) }, ['--criteria', 'criteria.json']);
    assert.equal(r.code, 2);
    assert.match(r.err, /the path is an absolute path; write a path below the evidence folder/);
  });
});

test('paths: an evidence path that goes up with .. is an input error', LIMIT, async () => {
  const r = await run({ 'criteria.json': criteriaText({ evidence: { required: ['../outside.txt'] } }) }, ['--criteria', 'criteria.json']);
  assert.equal(r.code, 2);
  assert.match(r.err, /goes up with \.\./);
});

test('paths: a Windows path written with backslashes in the criteria is an input error on every system', LIMIT, async () => {
  const r = await run({ 'criteria.json': criteriaText({ evidence: { required: ['reports\\signed.pdf'] } }) }, ['--criteria', 'criteria.json']);
  assert.equal(r.code, 2);
  assert.match(r.err, /holds a backslash; write the path with forward slashes/);
});

test('paths: a Windows path with backslashes in a test name or a file attribute is only text, on every system', LIMIT, async () => {
  const xml = '<testsuite name="s"><testcase name="C:\\Users\\ann\\cart" classname="c" file="..\\..\\secret.xml" time="1"><failure message="m"/></testcase></testsuite>';
  const r = await run({ 'criteria.json': TESTS, 'results/a.xml': xml }, [...BASE, '--explain']);
  assert.equal(r.code, 1);
  assert.match(r.out, /failed: c > C:\\Users\\ann\\cart/);
});

test('paths: on Windows a relative path with backslashes names the same folder, and the report shows forward slashes', LIMIT, async (t) => {
  if (process.platform !== 'win32') {
    t.skip('a backslash is a path separator only on Windows');
    return;
  }
  const r = await run({ 'criteria.json': TESTS, 'my results\\run 1\\a.xml': PASSING }, ['--criteria', 'criteria.json', '--junit', 'my results\\run 1', '--format', 'json']);
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(r.out).inputs.results.paths, 'my results/run 1');
});

test('paths: on a system where a backslash is an ordinary character, a file name with one is read and shown as it is', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not allow a backslash in a file name');
    return;
  }
  const r = await run({ 'criteria.json': TESTS, 'results/odd\\name.xml': suite([{ name: 'a', result: 'failed' }]) }, [...BASE, '--explain']);
  assert.equal(r.code, 1);
  assert.match(r.out, /from: results\/odd\\name\.xml:4/);
});

test('links: a symbolic link to a folder outside, a link to a file, and a link loop are listed and never followed', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('creating a symbolic link needs a privilege on Windows');
    return;
  }
  await withFiles(withResults({ 'outside/secret.xml': suite([{ name: 'secret', result: 'failed' }]), 'results/a.xml': suite([{ name: 'a' }]) }), async (dir) => {
    await symlink(resolve(dir, 'outside'), resolve(dir, 'results/escape'));
    await mkdir(resolve(dir, 'results/more'));
    await symlink(resolve(dir, 'outside/secret.xml'), resolve(dir, 'results/more/linked.xml'));
    await symlink(resolve(dir, 'results'), resolve(dir, 'results/loop'));
    let out = '';
    const code = await fast(() => main([...BASE, '--format', 'json'], { out: (x) => { out += x; }, err: () => {} }, undefined, dir));
    assert.equal(code, 0, 'the failing test outside the folder was not read');
    const report = JSON.parse(out);
    assert.equal(report.inputs.results.files, 1);
    assert.ok(report.notes.some((n) => /3 symbolic links were not followed: results\/escape, results\/loop and results\/more\/linked\.xml/.test(n)));
  });
});

test('links: a folder or a file named on the command line may itself be a link, because the person named it', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('creating a symbolic link needs a privilege on Windows');
    return;
  }
  await withFiles({ 'criteria.json': TESTS, 'real/a.xml': suite([{ name: 'a' }]) }, async (dir) => {
    await symlink(resolve(dir, 'real'), resolve(dir, 'named'));
    await symlink(resolve(dir, 'real/a.xml'), resolve(dir, 'one.xml'));
    await symlink(resolve(dir, 'criteria.json'), resolve(dir, 'linked-criteria.json'));
    assert.equal(await main(['--criteria', 'linked-criteria.json', '--junit', 'named', '--junit', 'one.xml'], { out: () => {}, err: () => {} }, undefined, dir), 0);
  });
});

test('links: a device inside the results folder is never opened', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('there is no device file to link to on Windows');
    return;
  }
  await withFiles(withResults({ 'results/a.xml': suite([{ name: 'a' }]) }), async (dir) => {
    await symlink('/dev/zero', resolve(dir, 'results/zero.xml'));
    let out = '';
    const code = await fast(() => main([...BASE, '--format', 'json'], { out: (x) => { out += x; }, err: () => {} }, undefined, dir));
    assert.equal(code, 0);
    assert.ok(JSON.parse(out).notes.some((n) => /1 symbolic link was not followed/.test(n)));
  });
});

test('links: an evidence file behind a symbolic link, on the way or at the end, is not counted as evidence', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('creating a symbolic link needs a privilege on Windows');
    return;
  }
  await withFiles({ 'criteria.json': criteriaText({ evidence: { required: ['linked.pdf', 'dir-link/report.pdf', 'real.pdf'] } }), 'ev/real.pdf': 'signed\n', 'elsewhere/report.pdf': 'x\n', 'elsewhere/target.pdf': 'x\n' }, async (dir) => {
    await symlink(resolve(dir, 'elsewhere/target.pdf'), resolve(dir, 'ev/linked.pdf'));
    await symlink(resolve(dir, 'elsewhere'), resolve(dir, 'ev/dir-link'));
    let out = '';
    const code = await main(['--criteria', 'criteria.json', '--evidence-root', 'ev', '--format', 'json'], { out: (x) => { out += x; }, err: () => {} }, undefined, dir);
    assert.equal(code, 1);
    const g = JSON.parse(out).gates[0];
    assert.equal(g.actual, '1 of 3 present');
    assert.deepEqual(g.details, ['linked.pdf: a symbolic link on the way', 'dir-link/report.pdf: a symbolic link on the way']);
  });
});

test('evidence: an empty file, a folder in place of a file, a missing file and a file under a file are not evidence', LIMIT, async () => {
  const files = { 'criteria.json': criteriaText({ evidence: { required: ['empty.pdf', 'folder', 'missing.pdf', 'file.txt/under.pdf', 'good.pdf'] } }), 'ev/empty.pdf': '', 'ev/folder/x.txt': 'x', 'ev/file.txt': 'x', 'ev/good.pdf': 'signed\n' };
  const r = await run(files, ['--criteria', 'criteria.json', '--evidence-root', 'ev', '--format', 'json']);
  assert.equal(r.code, 1);
  const g = JSON.parse(r.out).gates[0];
  assert.equal(g.actual, '1 of 5 present');
  assert.deepEqual(g.details, ['empty.pdf: empty', 'folder: not a regular file', 'missing.pdf: missing', 'file.txt/under.pdf: not a regular file']);
});

test('evidence: an evidence folder that does not exist, or is a file, is an input error', LIMIT, async () => {
  const files = { 'criteria.json': criteriaText({ evidence: { required: ['a.pdf'] } }), 'afile': 'x' };
  const missing = await run(files, ['--criteria', 'criteria.json', '--evidence-root', 'nope']);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /nope: the evidence folder does not exist/);
  const file = await run(files, ['--criteria', 'criteria.json', '--evidence-root', 'afile']);
  assert.equal(file.code, 2);
  assert.match(file.err, /afile: the evidence folder is not a folder/);
});

test('files: a file name with control characters is cleaned in the report, where the system allows such a name', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not allow a control character in a file name');
    return;
  }
  const name = `results/evil${String.fromCharCode(27)}[31m.xml`;
  let r;
  try {
    r = await run(withResults({ [name]: '<testsuite' }), BASE);
  } catch (error) {
    if (!['EINVAL', 'EILSEQ', 'ENOENT', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    t.skip(`this file system does not allow the name (${error.code})`);
    return;
  }
  assert.equal(r.code, 2);
  assert.ok(!r.err.includes(String.fromCharCode(27)));
});

test('lcov: a very long line and a hundred thousand branches in one record are read in one pass', LIMIT, async () => {
  const criteria = criteriaText({ coverage: { minLine: 1, minBranch: 1 } });
  const branches = Array.from({ length: 100000 }, (_, i) => `BRDA:1,0,${i},${i % 2}`).join('\n');
  const text = `SF:a.js\nDA:1,1\n${branches}\nBRF:${'9'.repeat(5000)}\nend_of_record\n`;
  const r = await fast(() => run({ 'criteria.json': criteria, 'cov.info': text }, ['--criteria', 'criteria.json', '--coverage', 'cov.info']), 15000);
  assert.equal(r.code, 2, 'a sum that is not a number is refused');
  const ok = await fast(() => run({ 'criteria.json': criteria, 'cov.info': `SF:a.js\nDA:1,1\n${branches}\nend_of_record\n` }, ['--criteria', 'criteria.json', '--coverage', 'cov.info']), 15000);
  assert.equal(ok.code, 0);
  assert.match(ok.out, /50% \(50,000 of 100,000 branches/);
});
