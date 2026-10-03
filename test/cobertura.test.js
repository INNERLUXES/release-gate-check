import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoberturaError, XmlError, parseXml, readCobertura, sumStore, createStore, addFile } from '../src/index.js';

const read = (xml) => readCobertura(parseXml(xml), 'coverage.xml');
const fails = (xml, pattern) => assert.throws(() => read(xml), (e) => e instanceof CoberturaError && pattern.test(e.reason), xml.slice(0, 60));
const report = (inner) => `<?xml version="1.0"?>\n<coverage>\n<packages><package name="p"><classes>${inner}</classes></package></packages>\n</coverage>\n`;
const klass = (filename, lines, methods = '<methods/>') => `<class name="n" filename="${filename}">${methods}<lines>${lines}</lines></class>`;

test('cobertura: lines and branches are read from the lines of a class', () => {
  const r = read(report(klass('src/a.js', '<line number="1" hits="3"/><line number="2" hits="0" branch="true" condition-coverage="50% (1/2)"/><line number="3" hits="1" branch="false"/>')));
  assert.equal(r.classes.length, 1);
  const c = r.classes[0];
  assert.equal(c.path, 'src/a.js');
  assert.equal(c.lines.size, 3);
  assert.equal(c.lines.get(1).hits, 3);
  assert.equal(c.lines.get(2).hits, 0);
  assert.deepEqual(c.branches.get('line:2'), { covered: 1, total: 2, file: 'coverage.xml', line: 3 });
  assert.equal(c.unreadableBranches.length, 0);
});

test('cobertura: the lines of the methods are left out, because they repeat the lines of the class', () => {
  const methods = '<methods><method name="m" signature="()V"><lines><line number="1" hits="9"/><line number="2" hits="9"/></lines></method></methods>';
  const r = read(report(klass('src/a.js', '<line number="1" hits="0"/>', methods)));
  assert.equal(r.classes[0].lines.size, 1);
  assert.equal(r.classes[0].lines.get(1).hits, 0);
});

test('cobertura: classes of the same file are merged by the store, a line is covered when any class covers it', () => {
  const r = read(report(klass('src/a.js', '<line number="1" hits="0"/><line number="2" hits="1"/>') + klass('src/a.js', '<line number="1" hits="5"/>')));
  const store = createStore();
  for (const c of r.classes) addFile(store, c);
  const sums = sumStore(store);
  assert.deepEqual(sums.lines, { found: 2, hit: 2 });
});

test('cobertura: a branch line with no counts, a missing condition-coverage or counts that do not fit is kept apart', () => {
  const r = read(report(klass('src/a.js', '<line number="1" hits="1" branch="true"/><line number="2" hits="1" branch="true" condition-coverage="50%"/><line number="3" hits="1" branch="true" condition-coverage="100% (3/2)"/><line number="4" hits="1" branch="true" condition-coverage="0% (0/0)"/>')));
  assert.equal(r.classes[0].branches.size, 0);
  assert.deepEqual(r.classes[0].unreadableBranches.map((u) => u.line), [1, 2, 3, 4]);
});

test('cobertura: the condition-coverage text that coverage.py writes, with its percent and its counts, is read', () => {
  const r = read(report(klass('a.py', '<line number="7" hits="1" branch="true" condition-coverage="66% (2/3)"/>')));
  assert.deepEqual([r.classes[0].branches.get('line:7').covered, r.classes[0].branches.get('line:7').total], [2, 3]);
});

test('cobertura: classes are found in packages, in nested classes elements and straight under the root', () => {
  const xml = `<coverage><packages><package name="a"><classes>${klass('a.js', '<line number="1" hits="1"/>')}</classes></package></packages><class name="x" filename="b.js"><lines><line number="1" hits="0"/></lines></class></coverage>`;
  assert.deepEqual(read(xml).classes.map((c) => c.path).sort(), ['a.js', 'b.js']);
});

test('cobertura: a report with no class, or with classes and no line, is read and says so in a note', () => {
  assert.match(read('<coverage><packages/></coverage>').notes[0], /holds no <class> element/);
  assert.match(read(report('<class name="n" filename="a.js"><lines/></class>')).notes[0], /holds classes but no <line> element/);
});

for (const [name, xml, pattern] of [
  ['a root that is not coverage', '<report/>', /root element is <report>, not <coverage>/],
  ['a class with no filename', report('<class name="n"><lines/></class>'), /no filename attribute/],
  ['a class with an empty filename', report('<class name="n" filename=" "><lines/></class>'), /no filename attribute/],
  ['a line with no number', report(klass('a.js', '<line hits="1"/>')), /whose number is missing/],
  ['a line with a number that is not a whole number', report(klass('a.js', '<line number="x" hits="1"/>')), /whose number is "x"/],
  ['a line with number 0', report(klass('a.js', '<line number="0" hits="1"/>')), /whole number from 1/],
  ['a line with no hits', report(klass('a.js', '<line number="1"/>')), /whose hits is missing/],
  ['a line with negative hits', report(klass('a.js', '<line number="1" hits="-2"/>')), /whose hits is "-2"/],
  ['a filename with a control character', report(klass(`a${String.fromCharCode(7)}.js`, '')), /filename with a control character/],
  ['a filename that is very long', report(klass('a'.repeat(1100), '')), /longer than 1024 characters/]
]) {
  test(`cobertura: ${name} is refused`, () => fails(xml, pattern));
}

test('cobertura: the old report with a DOCTYPE is refused by the XML reader, so no DTD is read', () => {
  const xml = '<?xml version="1.0"?>\n<!DOCTYPE coverage SYSTEM "http://cobertura.example.test/xml/coverage-04.dtd">\n<coverage/>\n';
  assert.throws(() => parseXml(xml), (e) => e instanceof XmlError && /the file has a DOCTYPE/.test(e.reason));
});
