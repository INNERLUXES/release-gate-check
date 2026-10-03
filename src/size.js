// Numbers and sizes as the reports show them, and sizes as the command line takes them.

export const grouped = (n) => Number(n).toLocaleString('en-US');

// A size such as 100000, 100K, 2M or 0x8000, in bytes; null when it is not one. K and M are 1,024 and 1,048,576.
export function parseSize(text) {
  const m = /^(0x[0-9a-fA-F]{1,8}|[0-9]{1,10})\s{0,2}([KkMm]?)$/.exec(String(text).trim());
  if (!m) return null;
  const n = m[1].startsWith('0x') ? parseInt(m[1], 16) : Number(m[1]);
  const factor = { '': 1, k: 1024, m: 1048576 }[m[2].toLowerCase()];
  const bytes = n * factor;
  return Number.isSafeInteger(bytes) ? bytes : null;
}

// A size for a report: whole kilobytes or megabytes when it is one, else bytes.
export function sizeText(bytes) {
  if (bytes >= 1048576 && bytes % 1048576 === 0) return `${grouped(bytes / 1048576)} MB`;
  if (bytes >= 1024 && bytes % 1024 === 0) return `${grouped(bytes / 1024)} KB`;
  return `${grouped(bytes)} bytes`;
}

// A list for a sentence: "a", "a and b", "a, b and c", and "a, b, c and 4 more" past the limit.
export function listText(items, max = 3) {
  const list = items.slice(0, max);
  const more = items.length - list.length;
  if (more > 0) return `${list.join(', ')} and ${grouped(more)} more`;
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

export function plural(count, one, many = `${one}s`) {
  return `${grouped(count)} ${count === 1 ? one : many}`;
}
