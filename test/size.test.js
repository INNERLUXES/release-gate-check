import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grouped, listText, parseSize, plural, sizeText } from '../src/index.js';

test('size: numbers are grouped with commas', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(grouped(0), '0');
  assert.equal(grouped('42'), '42');
});

test('size: a size such as 100K, 2M or 0x8000 is read in bytes, and anything else is null', () => {
  assert.equal(parseSize('100'), 100);
  assert.equal(parseSize('3K'), 3072);
  assert.equal(parseSize('1m'), 1048576);
  assert.equal(parseSize('0x8000'), 32768);
  assert.equal(parseSize('12 K'), 12288);
  for (const bad of ['', 'x', '1.5K', '-1', '1G', '99999999999']) assert.equal(parseSize(bad), null, bad);
});

test('size: a size for a report is whole kilobytes or megabytes when it is one, else bytes', () => {
  assert.equal(sizeText(2097152), '2 MB');
  assert.equal(sizeText(4096), '4 KB');
  assert.equal(sizeText(1500), '1,500 bytes');
});

test('size: a list for a sentence is cut after the limit and says how many more', () => {
  assert.equal(listText([]), '');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e']), 'a, b, c and 2 more');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e'], 4), 'a, b, c, d and 1 more');
});

test('size: a count with its noun, singular or plural', () => {
  assert.equal(plural(1, 'gate'), '1 gate');
  assert.equal(plural(2, 'gate'), '2 gates');
  assert.equal(plural(0, 'entry', 'entries'), '0 entries');
  assert.equal(plural(1000, 'file'), '1,000 files');
});
