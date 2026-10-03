// A small strict XML reader for test result files. It reads the text once, left to right, and never goes back: the XML
// declaration, elements with their attributes, text, CDATA sections, comments and processing instructions. It has no
// DTD support at all: a DOCTYPE is refused with a clear reason, so no external entity is ever fetched and no entity is
// ever expanded. Only the five predefined entities and numeric character references are read, each into one
// character. A file that is not well-formed is refused with the line and column of the first problem.

import { PREDEFINED_ENTITIES } from './data.js';

export const XML_LIMITS = {
  maxDepth: 256,
  maxElements: 500000,
  maxAttributes: 256,
  maxNameLength: 256,
  maxTextKept: 4096
};

const REPLACEMENT = String.fromCharCode(0xfffd);

// The offsets where each line starts. LF, CRLF and a lone CR each end a line.
export function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c === 10) starts.push(i + 1);
    else if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) i += 1;
      starts.push(i + 1);
    }
  }
  return starts;
}

// The line and column (both from 1) of an offset, by binary search in the line starts.
export function positionOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 };
}

// An error of the reader: the reason, and the offset where it was found.
export class XmlError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

// A character a reference may produce: the Char production of XML 1.0.
function legal(n) {
  return n === 0x9 || n === 0xa || n === 0xd || (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff);
}

const REFERENCE = /&(?:#([0-9]{1,8})|#x([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/y;

// Decodes the references of a piece of text or an attribute value, once. An & that does not start one of the five
// predefined references or a numeric reference is an error: an entity named in a DTD is never expanded. A numeric
// reference to a character that XML does not allow becomes the replacement character, and is counted in stats.
export function decodeReferences(text, offset = 0, stats = { replaced: 0 }) {
  let at = text.indexOf('&');
  if (at === -1) return text;
  let out = '';
  let from = 0;
  while (at !== -1) {
    REFERENCE.lastIndex = at;
    const m = REFERENCE.exec(text);
    if (!m) {
      const name = /^&([A-Za-z_][A-Za-z0-9._-]{0,40})/.exec(text.slice(at, at + 44));
      if (name) throw new XmlError(`the entity reference &${name[1]}; is not read: only &amp; &lt; &gt; &quot; &apos; and numeric references are, and no entity is expanded`, offset + at);
      throw new XmlError('an & that does not start a reference; write it as &amp;', offset + at);
    }
    out += text.slice(from, at);
    if (m[3] !== undefined) out += PREDEFINED_ENTITIES[m[3]];
    else {
      const n = m[1] !== undefined ? Number(m[1]) : parseInt(m[2], 16);
      if (legal(n)) out += String.fromCodePoint(n);
      else {
        out += REPLACEMENT;
        stats.replaced += 1;
      }
    }
    from = at + m[0].length;
    at = text.indexOf('&', from);
  }
  return out + text.slice(from);
}

const NAME = /[A-Za-z_:\u00c0-\ufffd][-A-Za-z0-9_:.\u00b7\u00c0-\ufffd]*/y;
const isSpace = (c) => c === 32 || c === 9 || c === 10 || c === 13;

function addText(el, text, limits) {
  if (!text) return;
  if (!el.hasText && /\S/.test(text)) el.hasText = true;
  if (el.text.length < limits.maxTextKept) el.text += text.slice(0, limits.maxTextKept - el.text.length);
}

// Reads the XML declaration at the start: version 1.0 or 1.1, and an encoding of UTF-8 or ASCII when one is named.
function readDeclaration(text) {
  const end = text.indexOf('?>');
  if (end === -1) throw new XmlError('the XML declaration is not closed with ?>', 0);
  const decl = text.slice(0, end);
  if (!/^<\?xml[ \t\r\n]/.test(decl)) throw new XmlError('a processing instruction named xml is only allowed as the declaration at the start', 0);
  const version = /[ \t\r\n]version[ \t\r\n]*=[ \t\r\n]*(?:"([^"]*)"|'([^']*)')/.exec(decl);
  if (!version) throw new XmlError('the XML declaration has no version', 0);
  const v = version[1] ?? version[2];
  if (!/^1\.[0-9]{1,3}$/.test(v)) throw new XmlError(`the XML declaration names version ${v.slice(0, 20)}, not 1.x`, 0);
  const encoding = /[ \t\r\n]encoding[ \t\r\n]*=[ \t\r\n]*(?:"([^"]*)"|'([^']*)')/.exec(decl);
  if (encoding) {
    const e = (encoding[1] ?? encoding[2]).toLowerCase();
    if (!['utf-8', 'utf8', 'us-ascii', 'ascii'].includes(e)) throw new XmlError(`the file declares the encoding ${e.slice(0, 30)}; only UTF-8 is read`, 0);
  }
  return end + 2;
}

// Reads one file of XML into a tree of elements: { name, attrs (a Map), children, text (cut to maxTextKept), hasText,
// offset, line }. Returns { root, elements, replaced }. Throws XmlError for a DOCTYPE, an entity that is not
// predefined, a tag that is not closed or does not match, text outside the root element, or a limit reached.
export function parseXml(text, limits = XML_LIMITS) {
  const lim = { ...XML_LIMITS, ...limits };
  const starts = lineStarts(text);
  const stats = { replaced: 0 };
  const n = text.length;
  let i = 0;
  if (/^<\?xml[ \t\r\n]/.test(text.slice(0, 6))) i = readDeclaration(text);
  const stack = [];
  let root = null;
  let rootClosed = false;
  let elements = 0;

  const readName = (at) => {
    NAME.lastIndex = at;
    const m = NAME.exec(text);
    if (!m) throw new XmlError('a tag with no valid name', at);
    if (m[0].length > lim.maxNameLength) throw new XmlError(`a name longer than ${lim.maxNameLength} characters`, at);
    return m[0];
  };
  const skipSpace = (at) => {
    while (at < n && isSpace(text.charCodeAt(at))) at += 1;
    return at;
  };

  while (i < n) {
    const lt = text.indexOf('<', i);
    const end = lt === -1 ? n : lt;
    if (end > i) {
      const chunk = text.slice(i, end);
      if (!stack.length) {
        if (/\S/.test(chunk)) throw new XmlError(root ? 'text after the root element' : 'text before the root element', i + chunk.search(/\S/));
      } else addText(stack.at(-1), decodeReferences(chunk, i, stats), lim);
    }
    if (lt === -1) break;
    i = lt;
    if (text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      if (close === -1) throw new XmlError('a comment that is not closed with -->', i);
      i = close + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      if (!stack.length) throw new XmlError('a CDATA section outside the root element', i);
      const close = text.indexOf(']]>', i + 9);
      if (close === -1) throw new XmlError('a CDATA section that is not closed with ]]>', i);
      addText(stack.at(-1), text.slice(i + 9, close), lim);
      i = close + 3;
      continue;
    }
    if (text.startsWith('<!DOCTYPE', i)) throw new XmlError('the file has a DOCTYPE; the reader refuses document type declarations, so no DTD is read, no external entity is fetched and no entity is expanded. A JUnit result file needs none: remove the DOCTYPE line', i);
    if (text.startsWith('<!', i)) throw new XmlError('a markup declaration (<!...) outside a DTD; only comments and CDATA sections start with <!', i);
    if (text.startsWith('<?', i)) {
      const close = text.indexOf('?>', i + 2);
      if (close === -1) throw new XmlError('a processing instruction that is not closed with ?>', i);
      if (/^<\?xml(?:[ \t\r\n?]|$)/i.test(text.slice(i, i + 6))) throw new XmlError('an XML declaration that is not at the start of the file', i);
      i = close + 2;
      continue;
    }
    if (text.startsWith('</', i)) {
      const name = readName(i + 2);
      const after = skipSpace(i + 2 + name.length);
      if (text[after] !== '>') throw new XmlError(`the end tag </${name}> is not closed with >`, i);
      const open = stack.pop();
      if (!open) throw new XmlError(`the end tag </${name}> has no start tag`, i);
      if (open.name !== name) throw new XmlError(`the end tag </${name}> does not match the start tag <${open.name}> at line ${open.line}`, i);
      if (!stack.length) rootClosed = true;
      i = after + 1;
      continue;
    }
    // A start tag.
    const start = i;
    const name = readName(i + 1);
    if (rootClosed) throw new XmlError(`a second root element <${name}>; a file has one root element`, start);
    elements += 1;
    if (elements > lim.maxElements) throw new XmlError(`more than ${lim.maxElements.toLocaleString('en-US')} elements`, start);
    const el = { name, attrs: new Map(), children: [], text: '', hasText: false, offset: start, line: positionOf(starts, start).line };
    let at = i + 1 + name.length;
    let selfClosing = false;
    for (;;) {
      const before = at;
      at = skipSpace(at);
      if (at >= n) throw new XmlError(`the start tag <${name}> is not closed with >`, start);
      if (text[at] === '>') {
        at += 1;
        break;
      }
      if (text[at] === '/' && text[at + 1] === '>') {
        selfClosing = true;
        at += 2;
        break;
      }
      if (at === before) throw new XmlError(`an attribute of <${name}> is not separated by white space`, at);
      const attr = readName(at);
      at = skipSpace(at + attr.length);
      if (text[at] !== '=') throw new XmlError(`the attribute ${attr} of <${name}> has no = and value`, at);
      at = skipSpace(at + 1);
      const quote = text[at];
      if (quote !== '"' && quote !== "'") throw new XmlError(`the value of the attribute ${attr} of <${name}> is not in quotes`, at);
      const close = text.indexOf(quote, at + 1);
      if (close === -1) throw new XmlError(`the value of the attribute ${attr} of <${name}> is not closed`, at);
      const raw = text.slice(at + 1, close);
      const lessThan = raw.indexOf('<');
      if (lessThan !== -1) throw new XmlError(`a < inside the value of the attribute ${attr}; write it as &lt;`, at + 1 + lessThan);
      if (el.attrs.has(attr)) throw new XmlError(`the attribute ${attr} appears twice on <${name}>`, at);
      if (el.attrs.size >= lim.maxAttributes) throw new XmlError(`more than ${lim.maxAttributes} attributes on <${name}>`, at);
      el.attrs.set(attr, decodeReferences(raw.replace(/[\t\n\r]/g, ' '), at + 1, stats));
      at = close + 1;
    }
    if (stack.length) stack.at(-1).children.push(el);
    else root = el;
    if (!selfClosing) {
      if (stack.length >= lim.maxDepth) throw new XmlError(`elements nested more than ${lim.maxDepth} deep`, start);
      stack.push(el);
    } else if (!stack.length) rootClosed = true;
    i = at;
  }
  if (stack.length) throw new XmlError(`the element <${stack.at(-1).name}> at line ${stack.at(-1).line} is not closed before the end of the file`, n);
  if (!root) throw new XmlError('no root element', n);
  return { root, elements, replaced: stats.replaced };
}

// The reason of an XmlError with its line and column, for a note.
export function xmlProblem(error, text) {
  if (!(error instanceof XmlError)) return error.message;
  const pos = positionOf(lineStarts(text), Math.min(error.offset, text.length));
  return `line ${pos.line}, column ${pos.column}: ${error.reason}`;
}
