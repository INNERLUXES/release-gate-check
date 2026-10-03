import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LcovError, MAX_PATH_LENGTH, addFile, createStore, fileSums, matchChanged, normalizePath, parseLcov, sumStore } from '../src/index.js';
import { lcovSection } from './helpers.js';

const fails = (text, pattern, limits) => assert.throws(() => parseLcov(text, 'lcov.info', limits), (e) => e instanceof LcovError && pattern.test(e.reason), text.slice(0, 60));

test('lcov: a section with lines and branches is read from its DA and BRDA records', () => {
  const text = lcovSection({ path: 'src/a.js', lines: [[1, 3], [2, 0], [5, 1]], branches: [[2, 0, 0, 1], [2, 0, 1, 0], [5, 0, 0, '-']] });
  const { files } = parseLcov(text, 'lcov.info');
  assert.equal(files.length, 1);
  const f = files[0];
  assert.equal(f.path, 'src/a.js');
  assert.deepEqual(f.at, { file: 'lcov.info', line: 2 });
  assert.equal(f.lines.size, 3);
  assert.equal(f.lines.get(1).hits, 3);
  assert.equal(f.lines.get(1).line, 3, 'the line of the DA record in the file is kept');
  assert.equal(f.branches.size, 3);
  assert.equal(f.branches.get('2,0,0').covered, 1);
  assert.equal(f.branches.get('2,0,1').covered, 0);
  assert.equal(f.branches.get('5,0,0').covered, 0, 'a dash means the branch was never evaluated');
});

test('lcov: several sections, TN lines, comments, empty lines and unknown records are read or skipped', () => {
  const text = `# a comment\nTN:unit\nSF:a.js\nFN:1,main\nFNDA:3,main\nFNF:1\nFNH:1\nDA:1,1\nVER:7\nMCDC:1,2,t,1,0,x\nend_of_record\n\nTN:\nSF:b.js\nDA:1,0\nend_of_record\n`;
  const { files, records } = parseLcov(text, 'lcov.info');
  assert.deepEqual(files.map((f) => f.path), ['a.js', 'b.js']);
  assert.ok(records >= 10);
});

test('lcov: CRLF, LF and a lone CR end a line, and a byte order mark is skipped', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const text = `\ufeffSF:a.js${nl}DA:1,1${nl}DA:2,0${nl}end_of_record${nl}`;
    assert.equal(parseLcov(text, 'x').files[0].lines.size, 2);
  }
});

test('lcov: the branch of a BRDA record may hold commas, and the block may start with e for an exception', () => {
  const text = lcovSection({ path: 'a.c', lines: [[10, 1]], branches: [[10, 0, 'f(a,b) > 1', 1], [10, 'e1', 'throw', 0]] });
  const f = parseLcov(text, 'x').files[0];
  assert.equal(f.branches.get('10,0,f(a,b) > 1').covered, 1);
  assert.equal(f.branches.get('10,e1,throw').covered, 0);
});

test('lcov: a line that appears twice in one section is counted once, with the larger count', () => {
  const text = lcovSection({ path: 'a.js', lines: [[4, 0], [4, 2], [5, 1]] });
  const f = parseLcov(text, 'x').files[0];
  assert.equal(f.lines.size, 2);
  assert.equal(f.lines.get(4).hits, 2);
});

test('lcov: a checksum after the count is allowed and ignored', () => {
  const f = parseLcov('SF:a.js\nDA:3,2,abcdef0123456789\nend_of_record\n', 'x').files[0];
  assert.equal(f.lines.get(3).hits, 2);
});

test('lcov: sums that disagree with the records make a note, and the records are used', () => {
  const text = lcovSection({ path: 'a.js', lines: [[1, 1], [2, 0]], branches: [[1, 0, 0, 1]], declared: { LF: 5, LH: 1, BRF: 2, BRH: 1 } });
  const { files, notes } = parseLcov(text, 'lcov.info');
  assert.equal(files[0].lines.size, 2);
  assert.equal(notes.length, 2, 'LF and BRF differ; LH and BRH agree');
  assert.match(notes[0], /lcov\.info:\d+: LF says 5 but the DA records of a\.js count 2; the records are used/);
  assert.match(notes[1], /BRF says 2 but the BRDA records of a\.js count 1/);
});

test('lcov: sums that agree with the records make no note', () => {
  const text = lcovSection({ path: 'a.js', lines: [[1, 1], [2, 0]], branches: [[1, 0, 0, 1]], declared: { LF: 2, LH: 1, BRF: 1, BRH: 1 } });
  assert.deepEqual(parseLcov(text, 'x').notes, []);
});

for (const [name, text, pattern] of [
  ['a DA record before any SF', 'DA:1,1\n', /outside a source file section/],
  ['a BRDA record before any SF', 'BRDA:1,0,0,1\n', /outside a source file section/],
  ['an SF before the last section ended', 'SF:a.js\nSF:b.js\n', /before end_of_record closed the last one/],
  ['an end_of_record with no SF', 'end_of_record\n', /no SF record before it/],
  ['an SF with no path', 'SF:\nend_of_record\n', /SF record with no path/],
  ['a file that ends inside a section', 'SF:a.js\nDA:1,1\n', /ends inside the section of a\.js/],
  ['a DA record with a word as the line', 'SF:a.js\nDA:x,1\nend_of_record\n', /line number "x"/],
  ['a DA record with line 0', 'SF:a.js\nDA:0,1\nend_of_record\n', /whole number from 1/],
  ['a DA record with a negative count', 'SF:a.js\nDA:1,-1\nend_of_record\n', /count "-1"/],
  ['a DA record with a fractional count', 'SF:a.js\nDA:1,1.5\nend_of_record\n', /count "1\.5"/],
  ['a DA record with one field', 'SF:a.js\nDA:1\nend_of_record\n', /needs a line number and a count/],
  ['a DA record with four fields', 'SF:a.js\nDA:1,1,x,y\nend_of_record\n', /needs a line number and a count/],
  ['a BRDA record with three fields', 'SF:a.js\nBRDA:1,0,1\nend_of_record\n', /needs four fields/],
  ['a BRDA record with a bad taken value', 'SF:a.js\nBRDA:1,0,0,many\nend_of_record\n', /taken value "many"/],
  ['a BRDA record with a bad block', 'SF:a.js\nBRDA:1,x,0,1\nend_of_record\n', /block "x"/],
  ['a BRDA record with an empty branch', 'SF:a.js\nBRDA:1,0,,1\nend_of_record\n', /empty branch/],
  ['an LF record that is not a number', 'SF:a.js\nLF:many\nend_of_record\n', /LF record with the value "many"/],
  ['an SF path with a control character', `SF:a${String.fromCharCode(7)}.js\nend_of_record\n`, /control character/],
  ['an SF path that is very long', `SF:${'a'.repeat(MAX_PATH_LENGTH + 1)}\nend_of_record\n`, /longer than 1024 characters/]
]) {
  test(`lcov: ${name} is refused with its line`, () => fails(text, pattern));
}

test('lcov: the line of a refusal is the line of the record', () => {
  try {
    parseLcov('SF:a.js\nDA:1,1\nDA:oops,1\nend_of_record\n', 'x');
    assert.fail('not refused');
  } catch (error) {
    assert.equal(error.line, 3);
  }
});

test('lcov: limits on sections, lines and branches refuse the file', () => {
  fails('SF:a\nend_of_record\nSF:b\nend_of_record\n', /more than 1 source files/, { maxFiles: 1 });
  fails('SF:a\nDA:1,1\nDA:2,1\nend_of_record\n', /more than 1 DA records/, { maxLines: 1 });
  fails('SF:a\nBRDA:1,0,0,1\nBRDA:1,0,1,1\nend_of_record\n', /more than 1 BRDA records/, { maxBranches: 1 });
});

test('lcov: a file with a hundred thousand lines is read in a few seconds at most', () => {
  const lines = Array.from({ length: 200000 }, (_, i) => `DA:${i + 1},${i % 3}`).join('\n');
  const started = Date.now();
  const { files } = parseLcov(`SF:big.js\n${lines}\nend_of_record\n`, 'x');
  assert.equal(files[0].lines.size, 200000);
  assert.ok(Date.now() - started < 5000);
});

test('coverage: paths are compared with forward slashes, without ./ and without doubled slashes', () => {
  assert.equal(normalizePath('.\\src\\a.js'), 'src/a.js');
  assert.equal(normalizePath('./src//a.js'), 'src/a.js');
  assert.equal(normalizePath('  src/a.js '), 'src/a.js');
  assert.equal(normalizePath('C:\\work\\src\\a.js'), 'C:/work/src/a.js');
});

test('coverage: the same file in two reports is merged, and a line counts as covered when any report covers it', () => {
  const store = createStore();
  const one = parseLcov(lcovSection({ path: 'src/a.js', lines: [[1, 0], [2, 1]], branches: [[1, 0, 0, 0], [1, 0, 1, 1]] }), 'one.info').files[0];
  const two = parseLcov(lcovSection({ path: './src/a.js', lines: [[1, 4], [3, 0]], branches: [[1, 0, 0, 2]] }), 'two.info').files[0];
  addFile(store, one);
  addFile(store, two);
  assert.equal(store.files.size, 1);
  const s = fileSums(store.files.get('src/a.js'));
  assert.deepEqual(s.lines, { found: 3, hit: 2 });
  assert.deepEqual(s.branches, { found: 2, hit: 2 });
});

test('coverage: sums over the store leave out the files that an exclude pattern names, and say how many', () => {
  const store = createStore();
  for (const [path, hit] of [['src/a.js', 1], ['src/vendored/b.js', 0], ['src/c.js', 0]]) addFile(store, parseLcov(lcovSection({ path, lines: [[1, hit]] }), 'x').files[0]);
  const all = sumStore(store);
  assert.deepEqual(all.lines, { found: 3, hit: 1 });
  const some = sumStore(store, { exclude: ['src/vendored/**'] });
  assert.deepEqual(some.lines, { found: 2, hit: 1 });
  assert.equal(some.excluded, 1);
  assert.deepEqual(some.perFile.map((f) => f.path), ['src/a.js', 'src/c.js']);
});

test('coverage: a changed path matches a covered path that is equal to it, or that ends with it or starts with it after a slash', () => {
  const store = createStore();
  for (const path of ['/work/app/src/a.js', 'src/b.js', 'lib/c.js', 'src/deep/same.js', 'other/same.js']) addFile(store, parseLcov(lcovSection({ path, lines: [[1, 1]] }), 'x').files[0]);
  const m = matchChanged(store, ['src/a.js', 'src/b.js', 'repo/lib/c.js', 'same.js', 'src/none.js', 'a.js']);
  assert.deepEqual(m.get('src/a.js'), ['/work/app/src/a.js']);
  assert.deepEqual(m.get('src/b.js'), ['src/b.js']);
  assert.deepEqual(m.get('repo/lib/c.js'), ['lib/c.js'], 'the coverage path is below a source folder');
  assert.deepEqual(m.get('same.js'), ['other/same.js', 'src/deep/same.js'], 'two matches are both returned');
  assert.deepEqual(m.get('src/none.js'), []);
  assert.deepEqual(m.get('a.js'), ['/work/app/src/a.js']);
});

test('coverage: matching a hundred thousand changed files against a hundred thousand covered files is done in a few seconds at most', () => {
  const store = createStore();
  const changed = [];
  for (let i = 0; i < 100000; i += 1) {
    addFile(store, { path: `src/m${i % 500}/f${i}.js`, lines: new Map([[1, { hits: 1, file: 'x', line: 1 }]]), branches: new Map(), unreadableBranches: [], at: { file: 'x', line: 1 } });
    changed.push(`src/m${i % 500}/f${i}.js`);
  }
  const started = Date.now();
  const m = matchChanged(store, changed);
  assert.equal(m.size, 100000);
  assert.ok(Date.now() - started < 8000);
});
