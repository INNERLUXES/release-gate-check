import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { FACTS, GATES, PREDEFINED_ENTITIES, RESULT_ELEMENTS, SKIP_FOLDERS, SOURCES, factPage, flat, source } from '../src/index.js';

// These tests read the saved pages again and compare them with src/data.js: every sentence that a gate or a document
// quotes.

const text = async (id) => readFile(new URL(`../research/sources/${source(id).file}`, import.meta.url), 'utf8');
const has = (page, needle) => flat(page).includes(flat(needle));
// The words of a tool that wrote a text, built from pieces so that this file does not hold them.
const WRITTEN = new RegExp(`\\b(?:${['A', 'I'].join('')}|${['cha', 't'].join('')}|${['clau', 'de'].join('')}|${['anthro', 'pic'].join('')}|${['ope', 'nai'].join('')}|${['gene', 'rated'].join('')}|${['assis', 'tants?'].join('')}|${['g', 'pt'].join('')}|${['l', 'lms?'].join('')})\\b`, 'i');
const YEAR = /\b(?:19|20)\d{2}\b/;

test('sources: every saved page has its address on the first line, as listed in src/data.js, and holds text', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.equal(page.split('\n')[0], `Source: ${s.url}`, s.file);
    assert.ok(page.length > 200, `${s.file} holds the page text`);
    assert.match(s.url, /^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9/._-]*(?:#[a-z-]+)?$/);
  }
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.url)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.file)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.id)).size);
});

test('sources: every file in research/sources is listed in src/data.js, and the other way round', async () => {
  const files = (await readdir(new URL('../research/sources/', import.meta.url))).sort();
  assert.deepEqual(files, SOURCES.map((s) => s.file).sort());
});

test('sources: the ISTQB glossary, lcov, Cobertura, coverage.py, Maven Surefire, RFC 4180 and 8259 and three sections of W3C XML 1.0', () => {
  const hosts = SOURCES.map((s) => new URL(s.url).host);
  assert.deepEqual([...new Set(hosts)].sort(), ['glossary.istqb.org', 'manpages.debian.org', 'maven.apache.org', 'raw.githubusercontent.com', 'www.rfc-editor.org', 'www.w3.org']);
  assert.equal(SOURCES.filter((s) => s.url.startsWith('https://www.w3.org/TR/xml/#')).length, 3);
  assert.equal(SOURCES.filter((s) => s.url.includes('/surefire/')).length, 2);
  assert.equal(SOURCES.filter((s) => s.url.startsWith('https://glossary.istqb.org/')).length, 5);
});

test('sources: no saved page holds a year, a mention of a tool that wrote it, a control byte, a carriage return or a character that is not ASCII', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.doesNotMatch(page, YEAR, s.file);
    assert.doesNotMatch(page, WRITTEN, s.file);
    assert.doesNotMatch(page, new RegExp(`[${String.fromCharCode(1)}-${String.fromCharCode(8)}]`), s.file);
    assert.ok(!page.includes('\r'), s.file);
    assert.ok([...page].every((c) => c.charCodeAt(0) < 128), s.file);
  }
});

test('the saved pages show what the readers rely on: the tracefile records, the Cobertura attributes, the result elements, the five entities, the DOCTYPE', async () => {
  const lcov = await text('lcov');
  for (const record of ['SF:', 'DA:', 'LH:', 'LF:', 'BRDA:', 'BRF:', 'BRH:', 'end_of_record']) assert.ok(lcov.includes(record), record);
  const dtd = await text('cobertura-dtd');
  for (const decl of ['<!ELEMENT class (methods,lines)>', '<!ELEMENT method (lines)>', '<!ELEMENT line (conditions*)>']) assert.ok(has(dtd, decl), decl);
  for (const attr of ['filename', 'number', 'hits', 'branch', 'condition-coverage']) assert.ok(dtd.includes(attr), attr);
  const xsd = await text('surefire-xsd');
  for (const name of RESULT_ELEMENTS) assert.ok(xsd.includes(`<xs:element name="${name}"`), name);
  assert.ok(has(await text('surefire-rerun'), '<flakyFailure message="exception message" type="assertion exception">'));
  const predefined = await text('xml-predefined');
  for (const name of Object.keys(PREDEFINED_ENTITIES)) assert.ok(predefined.includes(`<!ENTITY ${name} `), name);
  assert.ok(has(await text('xml-doctype'), '<!DOCTYPE greeting SYSTEM "hello.dtd">'));
  assert.ok(has(await text('rfc4180'), '"aaa","b""bb","ccc"'));
  assert.ok(has(await text('coveragepy'), 'xline.setAttribute("branch", "true")'));
});

test('facts: every quoted sentence is on its saved page, word for word, with its section, no year and no mention of a tool that wrote it', async () => {
  for (const [key, fact] of Object.entries(FACTS)) {
    assert.ok(SOURCES.some((s) => s.id === fact.source), key);
    assert.ok(has(await text(fact.source), fact.text), `${key}: "${fact.text}"`);
    assert.ok(has(await text(fact.source), fact.section), `${key}: the section ${fact.section} is on the page`);
    assert.doesNotMatch(fact.text, YEAR, key);
    assert.doesNotMatch(fact.text, WRITTEN, key);
    assert.ok(fact.text.length <= 360, `${key} is short`);
    assert.equal(factPage(key), source(fact.source).url);
  }
});

test('facts: every gate rests on one or two sentences of src/data.js, and every source page is quoted at least once', () => {
  for (const g of GATES) {
    assert.match(g.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, g.id);
    assert.ok(['tests', 'coverage', 'defects', 'evidence'].includes(g.area), g.id);
    assert.ok(g.title.length > 10, g.id);
    assert.ok(g.facts.length >= 1 && g.facts.length <= 2, g.id);
    for (const k of g.facts) assert.ok(FACTS[k], `${g.id}: ${k}`);
  }
  const quoted = new Set(Object.values(FACTS).map((f) => f.source));
  for (const s of SOURCES) assert.ok(quoted.has(s.id), s.id);
  assert.deepEqual(GATES.map((g) => g.id), ['pass-rate', 'critical-suites', 'skipped-share', 'flaky-count', 'unexplained-failures', 'line-coverage', 'branch-coverage', 'changed-line-coverage', 'changed-branch-coverage', 'open-defects', 'defect-severity', 'evidence-files']);
});

test('lists: the predefined entities are the five of XML, and the lists have no duplicates', () => {
  assert.deepEqual(PREDEFINED_ENTITIES, { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });
  for (const list of [SKIP_FOLDERS, RESULT_ELEMENTS]) assert.equal(new Set(list).size, list.length);
});

test('src writes no quoted sentence outside src/data.js', async () => {
  for (const file of (await readdir(new URL('../src/', import.meta.url))).filter((f) => f !== 'data.js')) {
    const code = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    for (const fact of Object.values(FACTS)) if (fact.text.length > 40) assert.ok(!code.includes(fact.text.slice(0, 40)), `${file} writes "${fact.text.slice(0, 40)}" itself`);
  }
});

test('docs: every sentence that the documents quote from a saved page is on a saved page', async () => {
  const pages = (await Promise.all(SOURCES.map((s) => text(s.id)))).map(flat).join(' ');
  let checked = 0;
  const files = ['docs/method.md', 'docs/rules-and-sources.md', 'docs/inputs.md', 'docs/limits.md', 'docs/threat-model.md', 'docs/secure-defaults.md', 'docs/decisions/0001-decide-from-evidence-written-before-the-release.md', 'README.md'];
  for (const file of files) {
    const doc = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const prose = file === 'README.md' ? doc.replace(/```[\s\S]*?```/g, '') : doc.replace(/`[^`\n]*`/g, '');
    for (const m of prose.matchAll(/"([^"\n]{40,400})"/g)) {
      assert.ok(pages.includes(flat(m[1])), `${file}: ${m[1]}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 15, `${checked} quotes checked`);
});

test('docs: docs/rules-and-sources.md names every saved page, every quoted sentence and every gate with its sentences', async () => {
  const doc = await readFile(new URL('../docs/rules-and-sources.md', import.meta.url), 'utf8');
  for (const s of SOURCES) {
    assert.ok(doc.includes(s.file), s.file);
    assert.ok(doc.includes(s.url), s.url);
  }
  for (const [key, fact] of Object.entries(FACTS)) assert.ok(doc.includes(`| \`${key}\` |`) && doc.includes(flat(fact.text).replace(/\|/g, '\\|')), key);
  for (const g of GATES) {
    assert.ok(doc.includes(`| \`${g.id}\` | ${g.area} |`), g.id);
    assert.ok(doc.includes(`(method.md#${g.id})`), g.id);
    for (const k of g.facts) assert.ok(new RegExp(`\\| \`${k}\` \\| [^|]*\`${g.id}\``).test(doc), `${k} is used by ${g.id}`);
  }
});
