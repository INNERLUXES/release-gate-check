import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, decodeText, displayPath, evidenceState, fileError, isBinary, readBounded, readRunPaths, readTextFile } from '../src/index.js';
import { PASSING, withFiles } from './helpers.js';

test('files: the limits are the ones the documents state', () => {
  assert.equal(FILE_LIMITS.maxFileBytes, 32 * 1024 * 1024);
  assert.equal(FILE_LIMITS.maxCriteriaBytes, 1024 * 1024);
  assert.equal(FILE_LIMITS.maxTotalBytes, 512 * 1024 * 1024);
  assert.equal(FILE_LIMITS.maxEntries, 50000);
  assert.equal(FILE_LIMITS.maxDepth, 32);
  assert.equal(FILE_LIMITS.maxXmlFiles, 10000);
  assert.equal(FILE_LIMITS.maxRuns, 100);
});

test('files: an error has the path in its message and the reason alone in .reason', () => {
  const e = fileError('a/b.xml', 'no such file');
  assert.equal(e.message, 'a/b.xml: no such file');
  assert.equal(e.reason, 'no such file');
});

test('files: readBounded reads a regular file, refuses a missing one, a folder and a file over the limit', async () => {
  await withFiles({ 'a.txt': 'hello', 'dir/x.txt': 'x' }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a.txt'))).toString(), 'hello');
    await assert.rejects(readBounded(resolve(dir, 'missing.txt')), /no such file/);
    await assert.rejects(readBounded(resolve(dir, 'dir')), /not a regular file|cannot be read/);
    await assert.rejects(readBounded(resolve(dir, 'a.txt'), 3), /5 bytes is over the 3 byte limit/);
  });
});

test('files: readTextFile gives the text without a byte order mark, with the path shown relative to the base with forward slashes', async () => {
  const bom = String.fromCharCode(0xfeff);
  await withFiles({ 'sub dir/a b.txt': `${bom}text\r\nmore` }, async (dir) => {
    const f = await readTextFile('sub dir/a b.txt', dir);
    assert.equal(f.file, 'sub dir/a b.txt');
    assert.equal(f.text, 'text\r\nmore');
    assert.equal(f.size, Buffer.byteLength(`${bom}text\r\nmore`));
    const abs = await readTextFile(resolve(dir, 'sub dir/a b.txt'), process.cwd());
    assert.ok(!abs.file.includes('\\'), 'forward slashes');
    assert.ok(abs.file.endsWith('sub dir/a b.txt'));
  });
});

test('files: readTextFile refuses binary data, UTF-16 and a missing file with the path shown', async () => {
  await withFiles({ 'ok.txt': 'x' }, async (dir) => {
    await writeFile(resolve(dir, 'bin'), Buffer.from([1, 0, 2]));
    await writeFile(resolve(dir, 'u16'), Buffer.from([0xfe, 0xff, 0, 97]));
    await assert.rejects(readTextFile('bin', dir), /^Error: bin: holds binary data \(a null byte\)$/);
    await assert.rejects(readTextFile('u16', dir), /^Error: u16: is UTF-16; only UTF-8 is read$/);
    await assert.rejects(readTextFile('missing', dir), /^Error: missing: no such file$/);
    await assert.rejects(readTextFile('ok.txt', dir, 0), /over the 0 byte limit/);
  });
});

test('files: isBinary looks at the first 8,000 bytes only, and decodeText drops the byte order mark and refuses UTF-16', () => {
  assert.equal(isBinary(Buffer.from('plain')), false);
  assert.equal(isBinary(Buffer.from([65, 0, 66])), true);
  assert.equal(isBinary(Buffer.concat([Buffer.alloc(9000, 65), Buffer.from([0])])), false);
  assert.equal(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), 'a');
  assert.throws(() => decodeText(Buffer.from([0xff, 0xfe, 0x61, 0])), /is UTF-16/);
});

test('files: displayPath shows a path below the base as a relative path and others as absolute, with forward slashes', () => {
  const base = resolve('some', 'base');
  assert.equal(displayPath(resolve(base, 'a', 'b.xml'), base), 'a/b.xml');
  assert.equal(displayPath(base, base), '.');
  const outside = resolve('some', 'other', 'c.xml');
  assert.ok(!displayPath(outside, base).includes('\\'));
  assert.ok(displayPath(outside, base).endsWith('other/c.xml'));
  assert.ok(displayPath(outside, base).length > 'other/c.xml'.length, 'a path outside the base is not shown relative');
});

test('files: readRunPaths merges the files of several paths into one run, sorted by name, and counts what it did not read', async () => {
  await withFiles({ 'one/b.xml': PASSING, 'one/a.xml': PASSING, 'one/notes.txt': 'x', 'one/.git/config.xml': 'x', 'two.xml': PASSING }, async (dir) => {
    const run = await readRunPaths(['one', 'two.xml'], dir);
    assert.deepEqual(run.files.map((f) => f.file), ['one/a.xml', 'one/b.xml', 'two.xml']);
    assert.equal(run.otherFiles, 1);
    assert.deepEqual(run.skipped, ['one/.git']);
    assert.equal(run.name, 'one+two.xml');
    assert.equal(run.path, 'one, two.xml');
    assert.ok(run.files.every((f) => f.reason === null && typeof f.text === 'string'));
  });
});

test('files: readRunPaths refuses a path that does not exist and a file that does not end in .xml', async () => {
  await withFiles({ 'a.txt': 'x' }, async (dir) => {
    await assert.rejects(readRunPaths(['missing'], dir), /missing: no such file or folder/);
    await assert.rejects(readRunPaths(['a.txt'], dir), /a\.txt: not an XML file/);
  });
});

test('files: a folder with an empty subfolder and files in deep folders is walked in name order', async () => {
  await withFiles({ 'r/b/2.xml': PASSING, 'r/a/1.xml': PASSING, 'r/c/d/3.xml': PASSING }, async (dir) => {
    await mkdir(resolve(dir, 'r/empty'));
    const run = await readRunPaths(['r'], dir);
    assert.deepEqual(run.files.map((f) => f.file), ['r/a/1.xml', 'r/b/2.xml', 'r/c/d/3.xml']);
  });
});

test('files: evidenceState looks at each part of a path below the root and says what it found', async () => {
  await withFiles({ 'ev/a/real.pdf': 'signed', 'ev/empty.pdf': '', 'ev/file.txt': 'x', 'ev/dir/x': 'x' }, async (dir) => {
    const root = resolve(dir, 'ev');
    assert.deepEqual(await evidenceState(root, 'a/real.pdf'), { state: 'present', size: 6, reason: '' });
    assert.equal((await evidenceState(root, 'empty.pdf')).state, 'empty');
    assert.equal((await evidenceState(root, 'missing.pdf')).state, 'missing');
    assert.equal((await evidenceState(root, 'nodir/x.pdf')).state, 'missing');
    assert.equal((await evidenceState(root, 'dir')).state, 'not-a-file');
    assert.equal((await evidenceState(root, 'file.txt/under.pdf')).state, 'not-a-file');
  });
});
