// A small glob for the file patterns of the criteria (files left out of the coverage, changed files that need no coverage).
// It has three wildcards and nothing else: * is any run of characters inside one path part, ? is one character inside a
// part, and a part that is exactly ** is any number of parts, none included. Patterns and paths are written with forward
// slashes. It is written without a regular expression, so a pattern from a file cannot make it run for a very long time:
// the work of one match is at most the number of parts of the pattern times the number of parts of the path.

export const GLOB_LIMITS = { maxPatterns: 20, maxLength: 200, maxParts: 12 };

// A reason when the pattern cannot be used, else null.
export function globProblem(pattern) {
  if (typeof pattern !== 'string' || pattern === '') return 'is empty; write a path or a pattern';
  if (pattern.length > GLOB_LIMITS.maxLength) return `is longer than ${GLOB_LIMITS.maxLength} characters`;
  if (/[\u0000-\u001f\u007f]/.test(pattern)) return 'holds a control character';
  if (pattern.includes('\\')) return 'holds a backslash; write the path with forward slashes';
  if (pattern.startsWith('/')) return 'starts with a slash; write the path below the project folder';
  if (pattern.split('/').length > GLOB_LIMITS.maxParts) return `has more than ${GLOB_LIMITS.maxParts} parts`;
  return null;
}

// One path part against one pattern part, with * and ? only. Linear for the usual patterns; the loop never goes back
// further than the last * it has seen.
function matchPart(pat, text) {
  let p = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (p < pat.length && (pat[p] === '?' || pat[p] === text[t]) && pat[p] !== '*') {
      p += 1;
      t += 1;
    } else if (p < pat.length && pat[p] === '*') {
      star = p;
      mark = t;
      p += 1;
    } else if (star !== -1) {
      p = star + 1;
      mark += 1;
      t = mark;
    } else return false;
  }
  while (p < pat.length && pat[p] === '*') p += 1;
  return p === pat.length;
}

export function matchGlob(pattern, path) {
  const ps = pattern.split('/');
  const ss = path.split('/');
  // reach[j] is true when the pattern parts read so far can end after j parts of the path.
  let reach = new Array(ss.length + 1).fill(false);
  reach[0] = true;
  for (const part of ps) {
    const next = new Array(ss.length + 1).fill(false);
    if (part === '**') {
      let any = false;
      for (let j = 0; j <= ss.length; j += 1) {
        any = any || reach[j];
        next[j] = any;
      }
    } else {
      for (let j = 0; j < ss.length; j += 1) if (reach[j] && matchPart(part, ss[j])) next[j + 1] = true;
    }
    reach = next;
  }
  return reach[ss.length];
}

export const matchesAny = (patterns, path) => patterns.some((p) => matchGlob(p, path));
