import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOB_LIMITS, globProblem, matchGlob, matchesAny } from '../src/index.js';

for (const [pattern, path, expected] of [
  ['src/a.js', 'src/a.js', true],
  ['src/a.js', 'src/b.js', false],
  ['src/*.js', 'src/a.js', true],
  ['src/*.js', 'src/deep/a.js', false],
  ['src/**', 'src/a.js', true],
  ['src/**', 'src/deep/er/a.js', true],
  ['src/**', 'src', true],
  ['**/*.md', 'README.md', true],
  ['**/*.md', 'docs/guide/intro.md', true],
  ['**/*.md', 'docs/guide/intro.txt', false],
  ['docs/**', 'docs/guide.md', true],
  ['docs/**', 'doc/guide.md', false],
  ['*.md', 'README.md', true],
  ['*.md', 'docs/README.md', false],
  ['src/?.js', 'src/a.js', true],
  ['src/?.js', 'src/ab.js', false],
  ['a/**/z', 'a/z', true],
  ['a/**/z', 'a/b/c/z', true],
  ['a/**/z', 'a/b/c/y', false],
  ['*', 'a', true],
  ['*', 'a/b', false],
  ['a*b*c', 'aXXbYYc', true],
  ['a*b*c', 'aXXbYY', false],
  ['**/**/x', 'x', true]
]) {
  test(`glob: ${pattern} ${expected ? 'matches' : 'does not match'} ${path}`, () => assert.equal(matchGlob(pattern, path), expected));
}

test('glob: matchesAny is true when one pattern matches', () => {
  assert.equal(matchesAny(['docs/**', '*.md'], 'README.md'), true);
  assert.equal(matchesAny(['docs/**', '*.md'], 'src/a.js'), false);
  assert.equal(matchesAny([], 'src/a.js'), false);
});

test('glob: a pattern that cannot be used says why', () => {
  assert.match(globProblem(''), /is empty/);
  assert.match(globProblem('a'.repeat(GLOB_LIMITS.maxLength + 1)), /longer than 200/);
  assert.match(globProblem('a\\b'), /backslash/);
  assert.match(globProblem('/abs/path'), /starts with a slash/);
  assert.match(globProblem(`a${String.fromCharCode(0)}b`), /control character/);
  assert.match(globProblem(Array.from({ length: 20 }, () => 'x').join('/')), /more than 12 parts/);
  assert.equal(globProblem('src/**/*.js'), null);
  assert.match(globProblem(5), /is empty/);
});

test('glob: a hostile pattern and path take no longer than the sizes of the two', () => {
  const started = Date.now();
  assert.equal(matchGlob('a*a*a*a*a*a*a*a*a*a*b', 'a'.repeat(1000)), false);
  assert.equal(matchGlob('**/**/**/**/**/**/**/**/**/**/**/x', `${'a/'.repeat(60)}y`), false);
  assert.equal(matchesAny(Array.from({ length: 20 }, (_, i) => `src/${i}/**/*.js`), 'src/19/a/b/c.js'), true);
  assert.ok(Date.now() - started < 3000);
});
