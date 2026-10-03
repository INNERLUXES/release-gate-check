// Command line: release-gate-check --criteria <file> [inputs] [options]

import { readFileSync } from 'node:fs';
import { InputError, checkPaths, GATES } from './check.js';
import { toText, toMarkdown, toJson } from './report.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson };

export const USAGE = `Usage: release-gate-check --criteria <file> [inputs] [options]

Decides go or no-go for a release against exit criteria that were written before the release, and explains every reason.
The criteria file (JSON) states the gates; every number in it is yours, and the tool has no threshold of its own. Each gate
is met, not met or not checked, and a gate whose data is missing is never read as met. The tool reads the files it is
given with its own strict readers: it refuses an XML file with a DOCTYPE, expands no entity, never runs a test, never
follows a symbolic link inside a folder, and opens no network connection.

Options:
  --criteria <file>      the criteria file (JSON); required
  --junit <path>         JUnit XML results of the release candidate: a file, or a folder read with its subfolders; repeat
  --history <path>       an earlier run, oldest first (a file or a folder); repeat. Only the gate for failures in the last
                         runs uses them
  --coverage <file>      an lcov tracefile (lcov.info) or a Cobertura XML report; repeat
  --changed <file>       the files changed since the last release, one path a line
  --defects <file>       the CSV export of the defects
  --evidence-root <dir>  the folder the required evidence files are below (default: the current folder)
  --format <name>        text, markdown or json (default: text)
  --strict               a gate that is not checked counts as no-go
  --explain              show the facts of every gate with the file and line each came from, and the sentences it rests on
  --help                 show this text
  --version              show the version

Gates: ${GATES.map((g) => g.id).join(', ')}.

Exit codes: 0 go, 1 no-go, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

export function parseArgs(argv) {
  const o = { criteria: null, junit: [], history: [], coverage: [], changed: null, defects: null, evidenceRoot: null, format: 'text', strict: false, explain: false, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file or a folder');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--criteria') o.criteria = once(a, o.criteria, next());
    else if (a === '--junit') o.junit.push(next());
    else if (a === '--history') o.history.push(next());
    else if (a === '--coverage') o.coverage.push(next());
    else if (a === '--changed') o.changed = once(a, o.changed, next());
    else if (a === '--defects') o.defects = once(a, o.defects, next());
    else if (a === '--evidence-root') o.evidenceRoot = once(a, o.evidenceRoot, next());
    else if (a === '--format') o.format = next();
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file or a folder');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else throw new Error(`unexpected argument ${a}; give each input with its option, such as --junit ${a}`);
  }
  if (!o.help && !o.version) {
    if (!o.criteria) throw new Error('give the criteria file with --criteria <file>');
    for (const p of [o.criteria, ...o.junit, ...o.history, ...o.coverage, o.changed, o.defects, o.evidenceRoot].filter(Boolean)) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown or json)`);
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 go, 1 no-go, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`release-gate-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkPaths({ criteria: o.criteria, junit: o.junit, history: o.history, coverage: o.coverage, changed: o.changed, defects: o.defects, evidenceRoot: o.evidenceRoot, strict: o.strict, explain: o.explain, version: VERSION, limits, base });
  } catch (error) {
    if (error instanceof InputError) io.err(`release-gate-check: no decision, the input has ${error.problems.length === 1 ? 'a problem' : `${error.problems.length} problems`}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`release-gate-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report, { explain: o.explain }));
  return report.decision.go ? 0 : 1;
}
