import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

const args = (name, extra = []) => [
  '--criteria', 'examples/criteria.json',
  '--junit', `examples/${name}/results`,
  '--history', `examples/${name}/history/run-1`,
  '--history', `examples/${name}/history/run-2`,
  ...(name === 'ready' ? ['--coverage', 'examples/ready/coverage/lcov.info', '--coverage', 'examples/ready/coverage/cobertura.xml'] : ['--coverage', 'examples/blocked/coverage/lcov.info']),
  '--changed', `examples/${name}/changed-files.txt`,
  '--defects', `examples/${name}/defects.csv`,
  '--evidence-root', `examples/${name}/evidence`,
  ...extra
];

async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');

test('examples: the blocked release is a no-go with the report that is saved in examples/output', async () => {
  const r = await run(args('blocked'));
  assert.equal(r.code, 1);
  assert.equal(r.out, await saved('blocked.txt'));
  assert.match(r.out, /gates: 3 met, 12 not met, 0 not checked/);
  assert.match(r.out, /DECISION: NO-GO - 12 gates not met\n$/);
});

test('examples: the blocked release with --explain, as Markdown and as JSON, is the report that is saved', async () => {
  assert.equal((await run(args('blocked', ['--explain']))).out, await saved('blocked-explain.txt'));
  assert.equal((await run(args('blocked', ['--format', 'markdown', '--explain']))).out, await saved('blocked.md'));
  assert.equal((await run(args('blocked', ['--format', 'json', '--explain']))).out, await saved('blocked.json'));
});

test('examples: the ready release is a go, also with --strict, and is the report that is saved', async () => {
  const r = await run(args('ready'));
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('ready.txt'));
  assert.equal((await run(args('ready', ['--strict']))).code, 0);
});

test('examples: each gate of the blocked release is the one that the README says', async () => {
  const report = JSON.parse((await run(args('blocked', ['--format', 'json']))).out);
  const status = Object.fromEntries(report.gates.map((g) => [g.id, g.status]));
  assert.deepEqual(status, {
    'pass-rate': 'not-met',
    'critical-suites': 'not-met',
    'skipped-share': 'not-met',
    'flaky-count': 'not-met',
    'unexplained-failures': 'not-met',
    'line-coverage': 'met',
    'branch-coverage': 'not-met',
    'changed-line-coverage': 'not-met',
    'changed-branch-coverage': 'not-met',
    'open-defects:blocker': 'not-met',
    'open-defects:critical': 'not-met',
    'open-defects:major': 'not-met',
    'defect-severity': 'met',
    'open-defects:total': 'met',
    'evidence-files': 'not-met'
  });
});

test('examples: the numbers of the blocked release can be worked out from the files', async () => {
  const report = JSON.parse((await run(args('blocked', ['--format', 'json']))).out);
  const found = (id) => report.gates.find((g) => g.id === id).actual;
  assert.match(found('pass-rate'), /^96\.42% \(27 of 28 executed tests passed/);
  assert.match(found('skipped-share'), /^6\.66% \(2 of 30/);
  assert.match(found('line-coverage'), /^81\.66% \(49 of 60 lines in 3 files; 1 file left out/);
  assert.match(found('branch-coverage'), /^66\.66% \(16 of 24 branches/);
  assert.match(found('open-defects:major'), /^4 open major defects in 15 defects/);
  assert.match(found('open-defects:total'), /^11 open defects in 15 defects/);
});

test('examples: the ready release merges an lcov report and a Cobertura report', async () => {
  const report = JSON.parse((await run(args('ready', ['--format', 'json']))).out);
  assert.deepEqual(report.inputs.coverage.reports.map((r) => r.kind), ['lcov', 'Cobertura']);
  assert.equal(report.inputs.coverage.files, 6);
  assert.match(report.gates.find((g) => g.id === 'line-coverage').actual, /^91\.46% \(75 of 82 lines in 5 files/);
});

test('examples: without the defect export the ready release is a go with five gates not checked, and a no-go with --strict', async () => {
  const without = args('ready').filter((a, i, all) => a !== '--defects' && all[i - 1] !== '--defects');
  const loose = await run(without);
  assert.equal(loose.code, 0);
  assert.match(loose.out, /gates: 10 met, 0 not met, 5 not checked/);
  const strict = await run([...without, '--strict']);
  assert.equal(strict.code, 1);
  assert.match(strict.out, /DECISION: NO-GO - 5 gates not checked \(--strict\)/);
});

test('examples: the same files written with CRLF line ends give the same reports, with the same lines', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'release-gate-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    const walk = async (rel) => {
      for (const e of await readdir(resolve(dir, rel), { withFileTypes: true })) {
        const r = `${rel}/${e.name}`;
        if (e.isDirectory()) await walk(r);
        else if (!r.startsWith('examples/output/') && !r.includes('/evidence/')) {
          const text = (await readFile(resolve(dir, r), 'utf8')).split('\r\n').join('\n');
          await writeFile(resolve(dir, r), text.split('\n').join('\r\n'));
        }
      }
    };
    await walk('examples');
    const blocked = await run(args('blocked', ['--explain']), dir);
    assert.equal(blocked.code, 1);
    assert.equal(blocked.out, await saved('blocked-explain.txt'));
    const ready = await run(args('ready'), dir);
    assert.equal(ready.code, 0);
    assert.equal(ready.out, await saved('ready.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
