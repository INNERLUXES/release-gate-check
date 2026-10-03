import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XmlError, decodeReferences, lineStarts, parseXml, positionOf, xmlProblem } from '../src/index.js';

const fails = (text, pattern) => {
  assert.throws(() => parseXml(text), (e) => e instanceof XmlError && pattern.test(e.reason), text.slice(0, 60));
};

test('xml: elements, attributes in both quotes, text, CDATA, comments and processing instructions', () => {
  const doc = parseXml(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- results -->\n<?app hint?>\n<a x="1" y='two'>\n  <b>t&amp;x</b><c/><d><![CDATA[<raw> & text]]></d>\n</a>\n<!-- end -->\n`);
  assert.equal(doc.root.name, 'a');
  assert.equal(doc.root.attrs.get('x'), '1');
  assert.equal(doc.root.attrs.get('y'), 'two');
  assert.deepEqual(doc.root.children.map((c) => c.name), ['b', 'c', 'd']);
  assert.equal(doc.root.children[0].text, 't&x');
  assert.equal(doc.root.children[1].hasText, false);
  assert.equal(doc.root.children[2].text, '<raw> & text');
  assert.equal(doc.root.line, 4);
  assert.equal(doc.elements, 4);
});

test('xml: the five predefined entities and numeric references decode once, into one character each', () => {
  assert.equal(decodeReferences('&lt;&gt;&amp;&quot;&apos;'), `<>&"'`);
  assert.equal(decodeReferences('&#65;&#x42;&#x63;'), 'ABc');
  assert.equal(decodeReferences('&amp;lt;'), '&lt;');
  assert.equal(decodeReferences('no reference'), 'no reference');
  assert.equal(parseXml('<a v="&#x3C;b&#62;">&#x1F600;</a>').root.attrs.get('v'), '<b>');
  assert.equal(parseXml('<a>&#x1F600;</a>').root.text.codePointAt(0), 0x1f600);
});

test('xml: a reference to a character XML does not allow becomes the replacement character, and is counted', () => {
  const doc = parseXml('<a>colour &#27;[31m and &#0; and &#xFFFF;</a>');
  assert.equal(doc.replaced, 3);
  assert.ok(!doc.root.text.includes(String.fromCharCode(27)));
  assert.ok(doc.root.text.includes(String.fromCharCode(0xfffd)));
});

test('xml: an entity that is not predefined, and an & that starts nothing, are refused', () => {
  fails('<a>&nbsp;</a>', /entity reference &nbsp; is not read/);
  fails('<a v="&copy;"/>', /&copy; is not read/);
  fails('<a>fish & chips</a>', /an & that does not start a reference/);
  fails('<a>&#;</a>', /an & that does not start a reference/);
  fails('<a>&#99999999999;</a>', /an & that does not start a reference/);
});

test('xml: a DOCTYPE is refused with a clear reason, with or without an internal subset', () => {
  fails('<!DOCTYPE testsuite SYSTEM "junit.dtd"><testsuite/>', /the file has a DOCTYPE; the reader refuses document type declarations/);
  fails('<?xml version="1.0"?>\n<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>', /DOCTYPE/);
  fails('<a><!ENTITY x "y"></a>', /a markup declaration/);
});

test('xml: tags that do not match, are not closed, or are written wrong are refused with the place', () => {
  fails('<a><b></a>', /the end tag <\/a> does not match the start tag <b> at line 1/);
  fails('<a>', /the element <a> at line 1 is not closed before the end of the file/);
  fails('</a>', /the end tag <\/a> has no start tag/);
  fails('<a></a><b/>', /a second root element <b>/);
  fails('text<a/>', /text before the root element/);
  fails('<a/>text', /text after the root element/);
  fails('', /no root element/);
  fails('<a x=1/>', /is not in quotes/);
  fails('<a x/>', /has no = and value/);
  fails('<a x="1"y="2"/>', /not separated by white space/);
  fails('<a x="1" x="2"/>', /appears twice/);
  fails('<a x="<"/>', /a < inside the value/);
  fails('<a x="1', /is not closed/);
  fails('<a', /is not closed with >/);
  fails('<1a/>', /a tag with no valid name/);
  fails('<a><!-- open </a>', /a comment that is not closed/);
  fails('<a><![CDATA[ open </a>', /a CDATA section that is not closed/);
  fails('<a><?pi </a>', /a processing instruction that is not closed/);
  fails('<a/><?xml version="1.0"?>', /an XML declaration that is not at the start/);
});

test('xml: the declaration must name version 1.x, and only UTF-8 or ASCII as the encoding', () => {
  assert.equal(parseXml('<?xml version="1.0" encoding="utf-8" standalone="yes"?><a/>').root.name, 'a');
  assert.equal(parseXml("<?xml version='1.1'?><a/>").root.name, 'a');
  fails('<?xml version="2.0"?><a/>', /names version 2\.0/);
  fails('<?xml encoding="UTF-8"?><a/>', /has no version/);
  fails('<?xml version="1.0" encoding="ISO-8859-1"?><a/>', /declares the encoding iso-8859-1; only UTF-8 is read/);
  fails('<?xml version="1.0"<a/>', /not closed with \?>/);
});

test('xml: line and column of a problem, with LF, CRLF and a lone CR', () => {
  assert.deepEqual(lineStarts('a\nb\r\nc\rd'), [0, 2, 5, 7]);
  assert.deepEqual(positionOf(lineStarts('ab\ncd'), 4), { line: 2, column: 2 });
  for (const nl of ['\n', '\r\n', '\r']) {
    const text = `<a>${nl}<b>${nl}</a>`;
    try {
      parseXml(text);
      assert.fail('not refused');
    } catch (error) {
      assert.equal(xmlProblem(error, text), 'line 3, column 1: the end tag </a> does not match the start tag <b> at line 2');
    }
  }
  assert.equal(xmlProblem(new Error('plain'), ''), 'plain');
});

test('xml: attribute values have their tabs and line breaks read as spaces, and text keeps its length capped', () => {
  const doc = parseXml('<a v="x\ty\nz"><b>' + 'x'.repeat(10000) + '</b></a>');
  assert.equal(doc.root.attrs.get('v'), 'x y z');
  assert.equal(doc.root.children[0].text.length, 4096);
  assert.equal(doc.root.children[0].hasText, true);
  assert.equal(parseXml('<a>   \n </a>').root.hasText, false);
});

test('xml: names with dots, dashes, colons and letters past ASCII are read', () => {
  const name = `caf${String.fromCharCode(0xe9)}`;
  const doc = parseXml(`<ns:a system-out.x="1"><${name}/></ns:a>`);
  assert.equal(doc.root.name, 'ns:a');
  assert.equal(doc.root.children[0].name, name);
});
