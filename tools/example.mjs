// Runs the README examples, checks that they report what the README shows, and writes the reports of both example
// releases to examples/output. CI runs it and then fails if those files changed, so the example output in the repository
// is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of one example release; every path is relative to the root of the repository.
const args = (name) => [
  '--criteria', 'examples/criteria.json',
  '--junit', `examples/${name}/results`,
  '--history', `examples/${name}/history/run-1`,
  '--history', `examples/${name}/history/run-2`,
  ...(name === 'ready' ? ['--coverage', 'examples/ready/coverage/lcov.info', '--coverage', 'examples/ready/coverage/cobertura.xml'] : ['--coverage', 'examples/blocked/coverage/lcov.info']),
  '--changed', `examples/${name}/changed-files.txt`,
  '--defects', `examples/${name}/defects.csv`,
  '--evidence-root', `examples/${name}/evidence`
];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
async function run(argv) {
  let out = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => process.stderr.write(t) }, undefined, root);
  return { code, out };
}

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})`);
  }
}

const blocked = await run(args('blocked'));
process.stdout.write(blocked.out);
expect('blocked release', blocked, 1, [
  'gates: 3 met, 12 not met, 0 not checked',
  'NOT MET      pass-rate  Minimum pass rate',
  'found: 96.42% (27 of 28 executed tests passed, 1 flaky test counted as passed)',
  'NOT MET      critical-suites',
  'NOT MET      skipped-share',
  'NOT MET      flaky-count',
  'NOT MET      unexplained-failures',
  'MET          line-coverage',
  'NOT MET      branch-coverage',
  'NOT MET      changed-line-coverage',
  '- no coverage record: src/fleet/new-search.js',
  'NOT MET      open-defects:blocker',
  'NOT MET      open-defects:major',
  'MET          open-defects:total',
  '- reports/release-notes-approved.txt: missing',
  'DECISION: NO-GO - 12 gates not met'
], ['DECISION: GO']);

process.stdout.write('\n');
const ready = await run(args('ready'));
process.stdout.write(ready.out);
expect('ready release', ready, 0, ['gates: 15 met, 0 not met, 0 not checked', 'found: 91.46% (75 of 82 lines in 5 files; 1 file left out by coverage.exclude)', 'DECISION: GO'], ['NOT MET', 'NOT CHECKED', 'NO-GO']);

// Strict mode on the ready release with the evidence folder left out of the run: a gate that is not checked is a no-go.
const noDefects = await run(args('ready').filter((a, i, all) => a !== '--defects' && all[i - 1] !== '--defects'));
expect('ready release without the defect export', noDefects, 0, ['NOT CHECKED  open-defects:major', 'DECISION: GO'], ['NO-GO']);
const strict = await run([...args('ready').filter((a, i, all) => a !== '--defects' && all[i - 1] !== '--defects'), '--strict']);
expect('ready release without the defect export, strict', strict, 1, ['DECISION: NO-GO - 5 gates not checked (--strict)', 'mode: strict'], ['DECISION: GO']);

// The README shows the head of the blocked report and the whole ready report.
const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
const head = blocked.out.split('\n\nCoverage (')[0];
if (!readme.includes(head)) problems.push('README: the first part of the sample output of the blocked release differs from a real run');
const decision = ready.out.split('\n').slice(-2).join('\n');
if (!readme.includes(decision)) problems.push('README: the last line of the sample output of the ready release differs from a real run');

// The blocked release in every format with the facts of every gate, and the ready release as text.
await mkdir(resolve(root, 'examples/output'), { recursive: true });
await writeFile(resolve(root, 'examples/output/blocked.txt'), blocked.out);
const explain = await run([...args('blocked'), '--explain']);
if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
await writeFile(resolve(root, 'examples/output/blocked-explain.txt'), explain.out);
for (const [format, name] of [['markdown', 'blocked.md'], ['json', 'blocked.json']]) {
  const r = await run([...args('blocked'), '--format', format, '--explain']);
  if (r.code !== 1) problems.push(`${format}: exit code ${r.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output', name), r.out);
}
await writeFile(resolve(root, 'examples/output/ready.txt'), ready.out);

if (problems.length) {
  for (const p of problems) console.error(`example: ${p}`);
  process.exit(1);
}
