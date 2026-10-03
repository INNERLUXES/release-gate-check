import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CsvError, isDelimiter, parseCsv } from '../src/index.js';

const fails = (text, pattern, options) => assert.throws(() => parseCsv(text, options), (e) => e instanceof CsvError && pattern.test(e.reason), text.slice(0, 60));

test('csv: a header and records with LF, CRLF and a lone CR as the line break', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const { header, records } = parseCsv(`id,severity${nl}1,major${nl}2,minor${nl}`);
    assert.deepEqual(header, ['id', 'severity']);
    assert.deepEqual(records.map((r) => r.fields), [['1', 'major'], ['2', 'minor']]);
    assert.deepEqual(records.map((r) => r.line), [2, 3]);
  }
});

test('csv: the last record needs no line break, and empty lines are skipped', () => {
  assert.equal(parseCsv('a,b\n1,2').records.length, 1);
  assert.equal(parseCsv('a,b\n1,2\n\n\n').records.length, 1);
  assert.equal(parseCsv('a,b\n\n1,2\n').records.length, 1, 'an empty line between records is skipped');
});

test('csv: a field in double quotes holds the delimiter, line breaks and doubled quotes', () => {
  const { records } = parseCsv('a,b\n"x, y","say ""hi""\nsecond line"\n3,4\n');
  assert.equal(records[0].fields[0], 'x, y');
  assert.equal(records[0].fields[1], 'say "hi"\nsecond line');
  assert.equal(records[1].line, 4, 'the line count follows the line break inside the quotes');
});

test('csv: spaces are part of a field and are not removed', () => {
  assert.deepEqual(parseCsv('a,b\n x , y \n').records[0].fields, [' x ', ' y ']);
});

test('csv: an empty field, a trailing delimiter and a field that is only quotes', () => {
  assert.deepEqual(parseCsv('a,b,c\n,,\n').records[0].fields, ['', '', '']);
  assert.deepEqual(parseCsv('a,b\n1,').records[0].fields, ['1', '']);
  assert.deepEqual(parseCsv('a,b\n"",""\n').records[0].fields, ['', '']);
});

test('csv: a semicolon or a tab as the delimiter, and only those', () => {
  assert.deepEqual(parseCsv('a;b\n1;"2;3"\n', { delimiter: ';' }).records[0].fields, ['1', '2;3']);
  assert.deepEqual(parseCsv('a\tb\n1\t2\n', { delimiter: '\t' }).records[0].fields, ['1', '2']);
  fails('a|b\n1|2\n', /delimiter must be one of/, { delimiter: '|' });
  assert.equal(isDelimiter(','), true);
  assert.equal(isDelimiter('|'), false);
});

test('csv: a byte order mark at the start is skipped', () => {
  const bom = String.fromCharCode(0xfeff);
  assert.deepEqual(parseCsv(`${bom}id,state\n1,open\n`).header, ['id', 'state']);
});

for (const [name, text, pattern] of [
  ['a quote inside a field that is not in quotes', 'a,b\n1,x"y\n', /double quote inside a field that is not in double quotes/],
  ['a quote after a space in front of a field', 'a,b\n1, "x"\n', /double quote inside a field that is not in double quotes/],
  ['text after the closing quote', 'a,b\n"x"y,2\n', /text after the closing double quote/],
  ['a quoted field that is never closed', 'a,b\n"x,2\n3,4\n', /never closed/],
  ['a record with too few fields', 'a,b,c\n1,2\n', /2 fields where the header on line 1 has 3/],
  ['a record with too many fields', 'a,b\n1,2,3\n', /3 fields where the header on line 1 has 2/],
  ['a file with no header', '', /holds no header line/],
  ['a file with only empty lines', '\n\n', /holds no header line/]
]) {
  test(`csv: ${name} is refused with the line`, () => fails(text, pattern));
}

test('csv: the line of a refusal is the line where the problem is, counted through quoted line breaks', () => {
  try {
    parseCsv('a,b\n"one\ntwo",2\n3,x"y\n');
    assert.fail('not refused');
  } catch (error) {
    assert.equal(error.line, 4);
  }
  try {
    parseCsv('a,b\n1,2\n3\n');
    assert.fail('not refused');
  } catch (error) {
    assert.equal(error.line, 3);
  }
});

test('csv: limits on records, fields and the length of a field refuse the file, in one pass', () => {
  fails(`a\n${'1\n'.repeat(20)}`, /more than 10 records/, { maxRecords: 10 });
  fails(`${Array.from({ length: 30 }, (_, i) => `c${i}`).join(',')}\n`, /more than 10 fields/, { maxFields: 10 });
  fails(`a\n"${'x'.repeat(200)}"\n`, /longer than 100 characters/, { maxFieldLength: 100 });
  fails(`a\n${'x'.repeat(200)}\n`, /longer than 100 characters/, { maxFieldLength: 100 });
  const started = Date.now();
  fails(`a,b\n"${'x'.repeat(500000)}`, /never closed/);
  fails(`a\n${'"" '.repeat(100000)}`, /double quote inside a field|text after the closing/);
  assert.ok(Date.now() - started < 5000);
});

test('csv: a hundred thousand records are read in a few seconds at most', () => {
  const rows = Array.from({ length: 100000 }, (_, i) => `D-${i},major,Open`).join('\n');
  const started = Date.now();
  const { records } = parseCsv(`id,severity,status\n${rows}\n`);
  assert.equal(records.length, 100000);
  assert.ok(Date.now() - started < 5000);
});
