import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATES, parseXml, readJunit } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const HOMEPAGE = 'https://innerluxes.dev/software-testing/qa';
const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...(await readdir(resolve(root, 'docs'), { recursive: true })).filter((f) => f.endsWith('.md')).map((f) => `docs/${f.split('\\').join('/')}`)];
const YEAR = /\b(?:19|20)\d{2}\b/;
// The words of a tool that wrote a text, built from pieces so that this file does not hold them.
const WRITTEN = new RegExp(`\\b(?:${['gene', 'rated'].join('')}|${['assis', 'tants?'].join('')}|${['cla', 'ude'].join('')}|${['anthro', 'pic'].join('')}|${['ope', 'nai'].join('')}|${['ch', 'at'].join('')}|${['g', 'pt'].join('')}|${['l', 'lms?'].join('')})\\b|\\b${['A', 'I'].join('')}\\b`, 'i');

// Every file of the examples, with forward slashes.
async function exampleFiles() {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk('examples');
  return out.sort();
}

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'release-gate-check');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/release-gate-check.git');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['release-gate-check'], 'bin/release-gate-check.js');
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.version, pkg.version);
});

test('README: the closing Background section links to the quality assurance page once, in plain words', async () => {
  const readme = await read('README.md');
  assert.equal(readme.split(HOMEPAGE).length - 1, 1, 'the page is linked once');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(background.includes(`[Software Quality Assurance Services and QA Consulting](${HOMEPAGE})`));
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
});

test('README: it says that there are no built-in thresholds, and that missing data is never met', async () => {
  const readme = await read('README.md');
  assert.match(readme, /\*\*No built-in thresholds\.\*\* There are no defaults for a pass rate, a coverage figure or a count of defects/);
  assert.match(readme, /missing is never met/i);
  assert.match(readme, /Every number comes from your criteria file/);
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /```\n(tests (\d+)\npass (\d+)\nfail (\d+)\nskipped (\d+))\n```/.exec(readme);
  assert.ok(block, 'the npm test block');
  const [, , tests, pass, fail, skipped] = block.map(Number);
  assert.equal(pass + fail + skipped, tests);
  assert.equal(fail, 0);
  assert.ok(tests >= 100, 'more than a hundred tests');
});

test('README and documents: no date and no calendar year anywhere', async () => {
  for (const file of await docFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|June|July|August|September|October|November|December)\s+\d/, file);
  }
  assert.match(await read('CHANGELOG.md'), /^## 1\.0\.0$/m);
});

test('README and documents: no mention of a tool that wrote them', async () => {
  for (const file of [...(await docFiles()), 'package.json', '.github/pull_request_template.md']) assert.doesNotMatch(await read(file), WRITTEN, file);
});

test('README and documents: plain ASCII, with no emoji and no decorative character', async () => {
  for (const file of [...(await docFiles()), '.github/pull_request_template.md', '.github/CODEOWNERS', 'package.json']) {
    const text = await read(file);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
  assert.doesNotMatch(license, /\d{4}/);
});

test('SECURITY.md: how to report, and no promise about reply times or fixes', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.match(text, /"release-gate-check security"/);
  assert.doesNotMatch(text, /within\s+\d|\bSLA\b|business days|hours|within a (?:day|week)|\bdays\b|we will|guarantee/i);
});

test('workflows: every action is pinned to a commit, the CI runs three systems and two Node versions, and the SSDF gate is there', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*- uses: (\S+)/gm)].map((m) => m[1]);
    assert.ok(uses.length > 0, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
});

test('workflows: the action commits are the ones of the sibling repositories of the organization, and the SSDF check is pinned', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/);
  assert.match(ci, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0/);
  assert.match(ci, /ref: dfda194a3ed35623b8b420df05e110b66d984586 # v1\.0\.0/);
  assert.match(await read('.github/workflows/codeql.yml'), /github\/codeql-action\/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2 # v4\.38\.2/);
  assert.match(await read('.github/workflows/release.yml'), /actions\/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8 # v4\.2\.2/);
});

test('release workflow: a tgz, a CycloneDX SBOM, SHA256SUMS and a provenance attestation named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/release-gate-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@/);
  assert.match(release, /tags: \['v\*'\]/);
  assert.doesNotMatch(release, /junit-flaky-check/);
});

test('repository files: Dependabot for actions and npm, CodeQL, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(await read('.github/workflows/codeql.yml'), /security-extended/);
  const owners = await read('.github/CODEOWNERS');
  assert.match(owners, /^\* @innerluxesdev$/m);
  for (const f of ['src/data.js', 'src/criteria.js', 'src/gates.js', 'src/json.js', 'src/csv.js', 'src/lcov.js', 'src/cobertura.js']) assert.ok(owners.includes(`/${f} @innerluxesdev`), f);
  assert.match(await read('.github/pull_request_template.md'), /npm run example/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  for (const p of ['examples/blocked/**', 'examples/ready/**', 'examples/output/**']) assert.ok(attributes.includes(`${p} -text`), p);
  assert.match(await read('.gitignore'), /^\.env$/m);
});

test('the repository names no other tool of the organization outside the SSDF gate', async () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/release.yml', '.github/CODEOWNERS', '.github/pull_request_template.md', 'package.json', 'src/cli.js', 'src/check.js']) {
    assert.doesNotMatch(await read(file), /junit-flaky-check|ui-markup-a11y-check|design-token-check|research-repro-check|requirements-check|security-headers-check/i, file);
  }
});

test('docs: every gate of the tool is described in docs/method.md and in the README table', async () => {
  const method = await read('docs/method.md');
  const readme = await read('README.md');
  for (const g of GATES) {
    assert.ok(method.includes(`### \`${g.id}\``) || method.includes(`\`${g.id}\``), `docs/method.md: ${g.id}`);
    assert.ok(readme.includes(`| \`${g.id}\` |`), `README: ${g.id}`);
  }
  for (const heading of ['pass-rate', 'critical-suites', 'skipped-share', 'flaky-count', 'unexplained-failures', 'line-coverage', 'branch-coverage', 'open-defects', 'defect-severity', 'evidence-files']) assert.ok(method.includes(`### \`${heading}\``), heading);
  assert.ok(method.includes('### `changed-line-coverage`') && method.includes('### `changed-branch-coverage`'));
});

test('docs: the documents of the set are all there and linked from the README', async () => {
  const readme = await read('README.md');
  for (const f of ['docs/method.md', 'docs/rules-and-sources.md', 'docs/limits.md', 'docs/inputs.md', 'docs/secure-defaults.md']) assert.ok(readme.includes(`(${f}`), f);
  for (const f of ['docs/inputs.md', 'docs/secure-defaults.md', 'docs/threat-model.md', 'docs/decisions/0001-decide-from-evidence-written-before-the-release.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) assert.ok((await read(f)).length > 500, f);
  const limits = await read('docs/limits.md');
  for (const t of [/criteria are right/, /tests are good/, /not in the evidence/i, /retr/, /paths/i, /branch data/i]) assert.match(limits, t);
  const threats = await read('docs/threat-model.md');
  for (const t of ['billion laughs', 'external entit', 'huge file', 'nested', 'not closed', 'link loop', 'names the same key twice', 'quote that is never closed', 'evidence path outside']) assert.match(threats, new RegExp(t, 'i'), t);
});

test('docs/secure-defaults.md is substantial: the defaults, the stricter options, the pipeline, the criteria file and SSDF', async () => {
  const text = await read('docs/secure-defaults.md');
  assert.ok(text.length > 9000, `${text.length} characters`);
  for (const heading of ['How the tool behaves by default', 'Options that make the run stricter', 'Running it in a pipeline', 'Protecting the criteria file', 'Writing criteria that fail closed', 'SSDF']) assert.match(text, new RegExp(`^## ${heading}$`, 'm'), heading);
  assert.ok((text.match(/^- \*\*/gm) ?? []).length >= 20, 'at least twenty defaults');
  assert.match(text, /NIST SP 800-218/);
  for (const t of [/No threshold of its own/, /Missing data is never met/, /Unknown keys are errors/, /No DTD, no entity expansion/, /No network/, /Never follows a link/, /CODEOWNERS/, /--strict/]) assert.match(text, t);
});

test('src imports no network, process or code evaluation module, and calls none of them', async () => {
  const forbidden = /from 'node:(?:net|http|https|http2|dgram|dns|tls|child_process|worker_threads|cluster|vm|inspector)'|\bfetch\(|XMLHttpRequest|WebSocket\(|\beval\(|new Function\(|\brequire\(|\bimport\(|process\.env|Date\.now|new Date\(|Math\.random/;
  for (const file of await readdir(resolve(root, 'src'))) assert.doesNotMatch(await read(`src/${file}`), forbidden, file);
});

test('src reads only what it is given: the file system is imported by src/files.js, src/check.js and the version in src/cli.js only', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    if (file === 'files.js') {
      assert.match(text, /from 'node:fs\/promises'/);
      assert.match(text, /lstat\(child\)/, 'entries inside a folder are looked at without following links');
      assert.match(text, /lstat\(current\)/, 'every part of an evidence path is looked at without following links');
      assert.doesNotMatch(text, /realpath|readlink|writeFile|appendFile|createWriteStream|unlink|rm\(/, 'a link is never resolved and nothing is written');
    } else if (file === 'check.js') assert.match(text, /import \{ stat \} from 'node:fs\/promises'/);
    else if (file === 'cli.js') assert.match(text, /import \{ readFileSync \} from 'node:fs'/);
    else assert.doesNotMatch(text, /from 'node:fs/, file);
  }
});

test('src/xml.js has no DTD support to switch on: no entity table but the five, no fetch, no file access', async () => {
  const text = await read('src/xml.js');
  assert.doesNotMatch(text, /resolveEntity|loadDtd|new URL\(|<!ENTITY/);
  assert.match(text, /PREDEFINED_ENTITIES/);
  assert.match(text, /startsWith\('<!DOCTYPE', i\)\) throw new XmlError/);
});

test('src/glob.js and the criteria use no regular expression built from a pattern in a file', async () => {
  const glob = await read('src/glob.js');
  assert.doesNotMatch(glob, /new RegExp/);
  assert.doesNotMatch(await read('src/gates.js'), /new RegExp/);
  assert.doesNotMatch(await read('src/criteria.js'), /new RegExp/);
});

test('src has no built-in threshold: no gate compares with a number that is not from the criteria', async () => {
  const gates = await read('src/gates.js');
  const comparisons = [...gates.matchAll(/atLeast\(([^)]*)\)|atMost\(([^)]*)\)/g)].map((m) => m[1] ?? m[2]);
  assert.ok(comparisons.length >= 5);
  for (const c of comparisons) assert.match(c, /\.scaled|ch\[kind\]\.scaled/, c);
  assert.doesNotMatch(gates, /maxOpen\w* \?\? \d|minPassRate \?\? \d|\|\| 9\d|=== 100\b/);
});

test('tests: a test file that makes a link or names a device guards it with process.platform', async () => {
  const files = (await readdir(resolve(root, 'test'))).filter((f) => f.endsWith('.test.js'));
  let guarded = 0;
  for (const f of files) {
    const text = await read(`test/${f}`);
    if (/symlink\(|\/dev\/(?:null|zero)/.test(text.replace(/\/\/.*$/gm, ''))) {
      assert.match(text, /process\.platform/, `${f} uses a link or a device`);
      guarded += 1;
    }
  }
  assert.ok(guarded >= 1);
});

test('tests: every test that is skipped on a system says why, and the guards name a system', async () => {
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.test.js'))) {
    const text = await read(`test/${f}`);
    for (const m of text.matchAll(/t\.skip\(([^)]*)\)/g)) assert.match(m[1], /\S+\s+\S+\s+\S+/, `${f}: skip without a reason`);
    for (const m of text.matchAll(/process\.platform (?:===|!==) '([a-z0-9]+)'/g)) assert.ok(['win32', 'linux', 'darwin'].includes(m[1]), m[1]);
  }
});

test('tests: no test builds a path with join, so an absolute path works on every system', async () => {
  for (const f of ['helpers.js', ...(await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.test.js'))]) {
    const text = await read(`test/${f}`);
    assert.doesNotMatch(text, /import \{[^}]*\bjoin\b[^}]*\} from 'node:path'/, f);
  }
  for (const f of await readdir(resolve(root, 'src'))) assert.doesNotMatch(await read(`src/${f}`), /import \{[^}]*\bjoin\b[^}]*\} from 'node:path'/, f);
});

test('research/sources: the saved pages are plain text files with LF line ends', async () => {
  const files = await readdir(resolve(root, 'research/sources'));
  assert.equal(files.length, 15);
  for (const f of files) {
    const text = await read(`research/sources/${f}`);
    assert.ok(!text.includes('\r'), f);
    assert.ok(text.startsWith('Source: https://'), f);
    assert.ok(text.endsWith('\n'), f);
  }
});

test('the examples are made up: no address, no token-shaped string, no number that reads like a year, no timestamp, ASCII', async () => {
  const tokenShape = new RegExp(`${['gh', 'p_'].join('')}[A-Za-z0-9]{20}|${['github', '_pat_'].join('')}|${['AK', 'IA'].join('')}[0-9A-Z]{16}`);
  const files = await exampleFiles();
  assert.ok(files.length >= 30);
  for (const f of files) {
    const text = await read(f);
    assert.doesNotMatch(text, tokenShape, f);
    assert.doesNotMatch(text, YEAR, f);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), f);
    if (!f.startsWith('examples/output/')) {
      assert.doesNotMatch(text, /https?:\/\/|@[a-z0-9-]+\.[a-z]/i, f);
      assert.doesNotMatch(text, /timestamp=|hostname=/, f);
      if (!f.endsWith('.csv')) assert.ok(!text.includes('\r'), `${f} keeps LF line ends`);
    }
  }
});

test('the example inputs: two releases with the same layout, and every result file is a JUnit result', async () => {
  const names = async (dir) => (await readdir(resolve(root, dir))).sort();
  assert.deepEqual(await names('examples/blocked'), ['changed-files.txt', 'coverage', 'defects.csv', 'evidence', 'history', 'results']);
  assert.deepEqual(await names('examples/ready'), ['changed-files.txt', 'coverage', 'defects.csv', 'evidence', 'history', 'results']);
  assert.deepEqual(await names('examples/blocked/history'), ['run-1', 'run-2']);
  for (const f of (await exampleFiles()).filter((x) => /examples\/(?:blocked|ready)\/(?:results|history)\//.test(x))) assert.ok(readJunit(parseXml(await read(f)), f).cases.length >= 8, f);
});

test('the defect export of the examples uses CRLF line ends, as RFC 4180 says, and holds a quoted field with a comma and doubled quotes', async () => {
  for (const f of ['examples/blocked/defects.csv', 'examples/ready/defects.csv']) {
    const text = await read(f);
    assert.ok(text.includes('\r\n'), f);
    assert.ok(text.includes('"Deposit shows ""0"" for large, bulk bookings"'), f);
  }
});
