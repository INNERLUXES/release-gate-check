// The gates. Each gate compares one number from the inputs with one number from the criteria and says met, not met or not
// checked. Not checked means the data the gate needs was not given or cannot show the number; it is never read as met. The
// tool has no threshold of its own: every limit below comes from the criteria file. Every gate carries the facts it used,
// each with the file and line it came from, for --explain. Nothing in this file opens a file or runs anything.

import { FACTS, factPage } from './data.js';
import { flat, safeText } from './text.js';
import { atLeast, atMost, percentText, thresholdText } from './ratio.js';
import { sumStore, matchChanged } from './coverage.js';
import { matchesAny } from './glob.js';
import { grouped, listText, plural } from './size.js';

export const STATUSES = ['met', 'not-met', 'not-checked'];

// How many entries of a list a gate names in its details, and how many facts it keeps for --explain.
export const MAX_DETAILS = 8;
export const MAX_FACTS = 200;

// Every gate that the criteria can state, in report order, with the sentences of the saved pages it rests on.
export const GATES = [
  { id: 'pass-rate', area: 'tests', title: 'Minimum pass rate', facts: ['exitCriteria', 'schemaTestcase'] },
  { id: 'critical-suites', area: 'tests', title: 'Failing tests in critical suites', facts: ['exitCriteria', 'schemaClassname'] },
  { id: 'skipped-share', area: 'tests', title: 'Maximum skipped share', facts: ['exitCriteria', 'schemaSkipped'] },
  { id: 'flaky-count', area: 'tests', title: 'Maximum flaky tests', facts: ['countedFlaky', 'failOnFlake'] },
  { id: 'unexplained-failures', area: 'tests', title: 'No unexplained failure in the last runs', facts: ['exitCriteria', 'schemaTestcase'] },
  { id: 'line-coverage', area: 'coverage', title: 'Minimum line coverage', facts: ['coverage', 'lcovDa'] },
  { id: 'branch-coverage', area: 'coverage', title: 'Minimum branch coverage', facts: ['branchCoverage', 'lcovBrda'] },
  { id: 'changed-line-coverage', area: 'coverage', title: 'Minimum line coverage of changed files', facts: ['coverage', 'lcovSf'] },
  { id: 'changed-branch-coverage', area: 'coverage', title: 'Minimum branch coverage of changed files', facts: ['branchCoverage', 'lcovSf'] },
  { id: 'open-defects', area: 'defects', title: 'Maximum open defects by severity', facts: ['severity', 'defect'] },
  { id: 'defect-severity', area: 'defects', title: 'Every open defect has a severity', facts: ['severity', 'defect'] },
  { id: 'evidence-files', area: 'evidence', title: 'Required evidence files', facts: ['exitCriteria'] }
];
const BY_ID = Object.fromEntries(GATES.map((g) => [g.id, g]));
export const AREAS = [
  { id: 'tests', title: 'Test results' },
  { id: 'coverage', title: 'Coverage' },
  { id: 'defects', title: 'Open defects' },
  { id: 'evidence', title: 'Evidence' }
];

const basisOf = (keys) => keys.map((k) => ({ text: flat(FACTS[k].text), section: FACTS[k].section, source: factPage(k) }));

// Builds one gate result. facts: [{ text, at }].
function gate(id, status, requirement, actual, reason, details = [], facts = [], idSuffix = '') {
  const base = BY_ID[id];
  return {
    id: idSuffix ? `${id}:${idSuffix}` : id,
    area: base.area,
    title: idSuffix === 'total' ? 'Maximum open defects in all' : base.title,
    status,
    requirement: safeText(requirement, 600),
    actual: safeText(actual, 600),
    reason: safeText(reason, 600),
    details: details.slice(0, MAX_DETAILS).map((d) => safeText(d, 400)).concat(details.length > MAX_DETAILS ? [`and ${grouped(details.length - MAX_DETAILS)} more`] : []),
    facts: facts.slice(0, MAX_FACTS).map((f) => ({ text: safeText(f.text, 400), at: safeText(f.at, 400) })).concat(facts.length > MAX_FACTS ? [{ text: `and ${grouped(facts.length - MAX_FACTS)} more facts not listed`, at: '' }] : []),
    basis: basisOf(base.facts)
  };
}

const where = (x) => (x ? (x.line ? `${x.file}:${x.line}` : x.file) : '');
const FAILING = new Set(['failed', 'error']);

// No result input for the gate: the gate is not checked, and the reason names the missing input.
const notChecked = (id, requirement, why, suffix = '') => gate(id, 'not-checked', requirement, 'no data', why, [], [], suffix);

function testGates(criteria, data) {
  const t = criteria.tests;
  if (!t) return [];
  const out = [];
  const j = data.junit;
  const run = j?.candidate ?? null;
  const missing = 'no --junit input was given, so the test results are not known';
  const empty = run && run.tests.size === 0;
  const emptyWhy = 'the results hold no testcase';

  if (t.minPassRate) {
    const req = `at least ${thresholdText(t.minPassRate.scaled)} of the executed tests pass`;
    if (!run) out.push(notChecked('pass-rate', req, missing));
    else {
      const c = run.counts;
      const executed = c.passed + c.failed + c.error + c.flaky;
      const passed = c.passed + c.flaky;
      if (executed === 0) out.push(notChecked('pass-rate', req, empty ? emptyWhy : `no test was executed: all ${plural(c.skipped, 'test')} ${c.skipped === 1 ? 'was' : 'were'} skipped`));
      else {
        const ok = atLeast(passed, executed, t.minPassRate.scaled);
        const failing = [...run.tests.values()].filter((x) => FAILING.has(x.outcome));
        const facts = [...run.files.map((f) => ({ text: `${plural(f.cases, 'testcase')} read`, at: f.file })), ...failing.map((x) => ({ text: `${x.outcome}: ${x.label}${x.failure?.message ? ` (${x.failure.message})` : ''}`, at: where(x.failure) }))];
        out.push(gate('pass-rate', ok ? 'met' : 'not-met', req, `${percentText(passed, executed)} (${grouped(passed)} of ${grouped(executed)} executed tests passed${c.flaky ? `, ${plural(c.flaky, 'flaky test')} counted as passed` : ''})`, ok ? '' : `${plural(failing.length, 'test')} failed or had an error`, failing.map((x) => `${x.outcome}: ${safeText(x.label, 160)}`), facts));
      }
    }
  }

  if (t.criticalSuites) {
    const { suites, maxFailing } = t.criticalSuites;
    const req = `at most ${maxFailing} failing ${maxFailing === 1 ? 'test' : 'tests'} in ${listText(suites.map((s) => safeText(s, 80)), 4)}`;
    if (!run) out.push(notChecked('critical-suites', req, missing));
    else if (empty) out.push(notChecked('critical-suites', req, emptyWhy));
    else {
      const failing = [];
      const absent = [];
      const facts = [];
      for (const name of suites) {
        const own = [...run.tests.values()].filter((x) => x.suites.has(name) || x.classname === name);
        if (!own.length) {
          absent.push(name);
          facts.push({ text: `no testcase of the suite ${safeText(name, 120)}`, at: '' });
          continue;
        }
        facts.push({ text: `${safeText(name, 120)}: ${plural(own.length, 'test')}`, at: where(own[0].first) });
        for (const x of own) if (FAILING.has(x.outcome)) {
          failing.push(x);
          facts.push({ text: `${x.outcome}: ${x.label}`, at: where(x.failure) });
        }
      }
      const ok = failing.length <= maxFailing && absent.length === 0;
      const why = [];
      if (failing.length > maxFailing) why.push(`${plural(failing.length, 'failing test')}, above ${maxFailing}`);
      if (absent.length) why.push(`no result for ${plural(absent.length, 'critical suite')}: a suite that did not run is not a suite that passed`);
      out.push(gate('critical-suites', ok ? 'met' : 'not-met', req, `${failing.length} failing in ${plural(suites.length - absent.length, 'suite')} with results${absent.length ? `, ${absent.length} with none` : ''}`, why.join('; '), [...failing.map((x) => `${x.outcome}: ${safeText(x.label, 160)}`), ...absent.map((a) => `no result: ${safeText(a, 120)}`)], facts));
    }
  }

  if (t.maxSkippedShare) {
    const req = `at most ${thresholdText(t.maxSkippedShare.scaled)} of the tests skipped`;
    if (!run) out.push(notChecked('skipped-share', req, missing));
    else if (empty) out.push(notChecked('skipped-share', req, emptyWhy));
    else {
      const total = run.tests.size;
      const skipped = run.counts.skipped;
      const ok = atMost(skipped, total, t.maxSkippedShare.scaled);
      const list = [...run.tests.values()].filter((x) => x.outcome === 'skipped');
      out.push(gate('skipped-share', ok ? 'met' : 'not-met', req, `${percentText(skipped, total)} (${grouped(skipped)} of ${grouped(total)} tests skipped)`, ok ? '' : 'too many tests were skipped', list.map((x) => safeText(x.label, 160)), list.map((x) => ({ text: `skipped: ${x.label}`, at: where(x.first) }))));
    }
  }

  if (t.maxFlaky !== undefined) {
    const req = `at most ${t.maxFlaky} flaky ${t.maxFlaky === 1 ? 'test' : 'tests'}`;
    if (!run) out.push(notChecked('flaky-count', req, missing));
    else if (empty) out.push(notChecked('flaky-count', req, emptyWhy));
    else {
      const flaky = [...run.tests.values()].filter((x) => x.outcome === 'flaky');
      const ok = flaky.length <= t.maxFlaky;
      out.push(gate('flaky-count', ok ? 'met' : 'not-met', req, `${plural(flaky.length, 'flaky test')}`, ok ? '' : `${plural(flaky.length, 'test')} passed and failed in one run, or passed after a retry`, flaky.map((x) => safeText(x.label, 160)), flaky.map((x) => ({ text: `flaky: ${x.label} (${x.attempts.join(', ')}${x.flakyRetries ? `, ${plural(x.flakyRetries, 'retry', 'retries')} written by the runner` : ''})`, at: where(x.first) }))));
    }
  }

  if (t.noUnexplainedFailures) {
    const { lastRuns, explained } = t.noUnexplainedFailures;
    const req = `no test failed in the last ${plural(lastRuns, 'run')} unless it is explained${explained.length ? ` (${plural(explained.length, 'test')} explained)` : ''}`;
    if (!run) out.push(notChecked('unexplained-failures', req, missing));
    else {
      const all = [...(j.history ?? []), run];
      if (all.length < lastRuns) out.push(notChecked('unexplained-failures', req, `the last ${plural(lastRuns, 'run')} are needed and ${plural(all.length, 'run')} ${all.length === 1 ? 'was' : 'were'} given (the release candidate and --history runs)`));
      else {
        const window = all.slice(-lastRuns);
        const known = new Set(explained);
        const seen = new Map();
        for (const r of window) {
          for (const x of r.tests.values()) {
            if (!FAILING.has(x.outcome) || known.has(x.label)) continue;
            const e = seen.get(x.label) ?? { label: x.label, runs: [], at: where(x.failure) };
            e.runs.push(r.label);
            seen.set(x.label, e);
          }
        }
        const list = [...seen.values()];
        out.push(gate('unexplained-failures', list.length === 0 ? 'met' : 'not-met', req, `${plural(list.length, 'unexplained failing test')} in ${plural(lastRuns, 'run')}`, list.length ? 'a test failed in a recent run and nobody has explained it' : '', list.map((e) => `${safeText(e.label, 140)} (failed in ${safeText(listText(e.runs, 4), 100)})`), [...window.map((r) => ({ text: `run ${safeText(r.label, 80)}: ${plural(r.counts.failed + r.counts.error, 'failing test')}`, at: '' })), ...list.map((e) => ({ text: `unexplained: ${e.label}`, at: e.at }))]));
      }
    }
  }
  return out;
}

const pct = (x) => percentText(x.hit, x.found);

// Facts of a coverage gate: one per file with its numbers and the line of its SF record.
function coverageFacts(perFile, kind) {
  return perFile.map((f) => ({ text: `${f.path}: ${f[kind].hit} of ${f[kind].found} ${kind === 'lines' ? 'lines' : 'branches'} covered`, at: where(f.entry.at[0]) }));
}

function coverageGates(criteria, data) {
  const c = criteria.coverage;
  if (!c) return [];
  const out = [];
  const store = data.coverage?.store ?? null;
  const missing = 'no --coverage input was given, so the coverage is not known';
  const exclude = c.exclude ?? [];

  const whole = store ? sumStore(store, { exclude }) : null;
  const excluded = whole && whole.excluded ? `; ${plural(whole.excluded, 'file')} left out by coverage.exclude` : '';

  if (c.minLine) {
    const req = `at least ${thresholdText(c.minLine.scaled)} of the lines covered`;
    if (!store) out.push(notChecked('line-coverage', req, missing));
    else if (whole.lines.found === 0) out.push(notChecked('line-coverage', req, `the coverage reports hold no line to count${excluded ? ` (${excluded.slice(2)})` : ''}`));
    else {
      const ok = atLeast(whole.lines.hit, whole.lines.found, c.minLine.scaled);
      const worst = [...whole.perFile].filter((f) => f.lines.found > f.lines.hit).sort((a, b) => (a.lines.hit * b.lines.found) - (b.lines.hit * a.lines.found) || (a.path < b.path ? -1 : 1)).slice(0, MAX_DETAILS);
      out.push(gate('line-coverage', ok ? 'met' : 'not-met', req, `${pct(whole.lines)} (${grouped(whole.lines.hit)} of ${grouped(whole.lines.found)} lines in ${plural(whole.files, 'file')}${excluded})`, ok ? '' : 'too few lines are covered', ok ? [] : worst.map((f) => `${safeText(f.path, 120)}: ${f.lines.hit} of ${f.lines.found}`), coverageFacts(whole.perFile, 'lines')));
    }
  }

  if (c.minBranch) {
    const req = `at least ${thresholdText(c.minBranch.scaled)} of the branches covered`;
    if (!store) out.push(notChecked('branch-coverage', req, missing));
    else if (whole.unreadable > 0) out.push(notChecked('branch-coverage', req, `${plural(whole.unreadable, 'branch line')} in the reports ${whole.unreadable === 1 ? 'has' : 'have'} no readable condition-coverage (as "50% (1/2)"), so the branches cannot be counted`));
    else if (whole.branches.found === 0) out.push(notChecked('branch-coverage', req, `the coverage reports hold no branch data${excluded ? ` (${excluded.slice(2)})` : ''}; the tool that wrote them may not have been asked for branches`));
    else {
      const ok = atLeast(whole.branches.hit, whole.branches.found, c.minBranch.scaled);
      out.push(gate('branch-coverage', ok ? 'met' : 'not-met', req, `${pct(whole.branches)} (${grouped(whole.branches.hit)} of ${grouped(whole.branches.found)} branches${excluded})`, ok ? '' : 'too few branches are covered', [], coverageFacts(whole.perFile.filter((f) => f.branches.found), 'branches')));
    }
  }

  const ch = c.changedFiles;
  if (ch) {
    for (const kind of ['minLine', 'minBranch']) {
      if (!ch[kind]) continue;
      const id = kind === 'minLine' ? 'changed-line-coverage' : 'changed-branch-coverage';
      const unit = kind === 'minLine' ? 'lines' : 'branches';
      const req = `at least ${thresholdText(ch[kind].scaled)} of the ${unit} of changed files covered`;
      if (!store) out.push(notChecked(id, req, missing));
      else if (!data.changed) out.push(notChecked(id, req, 'no --changed input was given, so the changed files are not known'));
      else {
        const ignore = ch.ignore ?? [];
        const entries = data.changed.entries.filter((e) => !(ignore.length && matchesAny(ignore, e.path)));
        const ignored = data.changed.entries.length - entries.length;
        if (!entries.length) out.push(notChecked(id, req, `no changed file is left to measure (${plural(data.changed.entries.length, 'file')} listed${ignored ? `, ${ignored} ignored by coverage.changedFiles.ignore` : ''})`));
        else {
          const matches = matchChanged(store, entries.map((e) => e.path));
          const unmatched = entries.filter((e) => matches.get(e.path).length === 0);
          const paths = new Set();
          for (const e of entries) for (const m of matches.get(e.path)) paths.add(m);
          const sums = sumStore(store, { include: paths });
          const facts = [...entries.map((e) => ({ text: `changed: ${e.path} -> ${matches.get(e.path).length ? listText(matches.get(e.path).map((m) => safeText(m, 100)), 3) : 'no coverage record'}`, at: `${data.changed.file}:${e.line}` })), ...coverageFacts(sums.perFile, unit)];
          const ambiguous = entries.filter((e) => matches.get(e.path).length > 1);
          const details = [...unmatched.map((e) => `no coverage record: ${safeText(e.path, 140)}`), ...ambiguous.map((e) => `matches ${matches.get(e.path).length} covered files: ${safeText(e.path, 120)}`)];
          const base = `${plural(entries.length, 'changed file')}${ignored ? `, ${ignored} ignored` : ''}`;
          if (unmatched.length) out.push(gate(id, 'not-met', req, `${plural(unmatched.length, 'changed file')} with no coverage record`, 'a changed file with no coverage record is not counted as covered; add it to coverage.changedFiles.ignore only when it holds no code', details, facts));
          else if (kind === 'minBranch' && sums.unreadable > 0) out.push(gate(id, 'not-checked', req, 'no data', `${plural(sums.unreadable, 'branch line')} in the changed files ${sums.unreadable === 1 ? 'has' : 'have'} no readable condition-coverage`, details, facts));
          else if (sums[unit].found === 0) out.push(gate(id, 'not-checked', req, 'no data', `the changed files hold no ${unit === 'lines' ? 'line' : 'branch'} to count in the coverage reports`, details, facts));
          else {
            const s = sums[unit];
            const ok = atLeast(s.hit, s.found, ch[kind].scaled);
            out.push(gate(id, ok ? 'met' : 'not-met', req, `${pct(s)} (${grouped(s.hit)} of ${grouped(s.found)} ${unit} in ${base})`, ok ? '' : `too few ${unit} of the changed files are covered`, details.concat(ok ? [] : sums.perFile.filter((f) => f[unit].found > f[unit].hit).slice(0, MAX_DETAILS).map((f) => `${safeText(f.path, 120)}: ${f[unit].hit} of ${f[unit].found}`)), facts));
          }
        }
      }
    }
  }
  return out;
}

function defectGates(criteria, data) {
  const d = criteria.defects;
  if (!d) return [];
  const out = [];
  const x = data.defects;
  const missing = 'no --defects input was given, so the open defects are not known';
  const open = x ? x.rows.filter((r) => r.open) : [];
  const fact = (r) => ({ text: `${safeText(r.id || '(no id)', 60)}: severity ${safeText(r.severityText || '(none)', 40)}, status ${safeText(r.statusText || '(none)', 40)}`, at: `${x.file}:${r.line}` });
  const dupFacts = x ? x.duplicates.map((u) => ({ text: `${safeText(u.id, 60)} appears again; the first line (${u.first}) is used`, at: `${x.file}:${u.line}` })) : [];

  for (const limit of d.maxOpen ?? []) {
    const req = `at most ${limit.max} open ${limit.shown} ${limit.max === 1 ? 'defect' : 'defects'}`;
    if (!x) out.push(notChecked('open-defects', req, missing, safeText(limit.name, 60)));
    else {
      const own = open.filter((r) => r.severity === limit.name);
      const ok = own.length <= limit.max;
      out.push(gate('open-defects', ok ? 'met' : 'not-met', req, `${own.length} open ${limit.shown} ${own.length === 1 ? 'defect' : 'defects'} in ${plural(x.rows.length, 'defect')}`, ok ? '' : `${plural(own.length, 'defect')} open, above ${limit.max}`, own.map((r) => `${safeText(r.id || '(no id)', 60)} (${safeText(r.statusText || 'no status', 40)})`), [...own.map(fact), ...dupFacts], safeText(limit.name, 60)));
    }
  }
  if (d.maxOpen) {
    const req = 'every open defect has a severity';
    if (!x) out.push(notChecked('defect-severity', req, missing));
    else {
      const none = open.filter((r) => r.severity === '');
      out.push(gate('defect-severity', none.length === 0 ? 'met' : 'not-met', req, `${plural(none.length, 'open defect')} with no severity`, none.length ? 'a defect with no severity cannot be shown to be within the limits by severity' : '', none.map((r) => safeText(r.id || '(no id)', 60)), none.map(fact)));
    }
  }
  if (d.maxOpenTotal !== undefined) {
    const req = `at most ${d.maxOpenTotal} open ${d.maxOpenTotal === 1 ? 'defect' : 'defects'} in all`;
    if (!x) out.push(notChecked('open-defects', req, missing, 'total'));
    else {
      const ok = open.length <= d.maxOpenTotal;
      const bySeverity = new Map();
      for (const r of open) {
        const e = bySeverity.get(r.severity) ?? { text: r.severityText || '(none)', n: 0 };
        e.n += 1;
        bySeverity.set(r.severity, e);
      }
      out.push(gate('open-defects', ok ? 'met' : 'not-met', req, `${plural(open.length, 'open defect')} in ${plural(x.rows.length, 'defect')}`, ok ? '' : `${plural(open.length, 'defect')} open, above ${d.maxOpenTotal}`, [...bySeverity.values()].map((e) => `${e.n} ${safeText(e.text, 40)}`), [...open.map(fact), ...dupFacts], 'total'));
    }
  }
  return out;
}

const STATE_TEXT = { present: 'present', missing: 'missing', empty: 'empty', link: 'a symbolic link on the way', 'not-a-file': 'not a regular file', unreadable: 'cannot be looked at' };

function evidenceGates(criteria, data) {
  const e = criteria.evidence;
  if (!e?.required) return [];
  const req = `${plural(e.required.length, 'required file')} present`;
  const states = data.evidence?.states;
  if (!states) return [notChecked('evidence-files', req, 'the evidence folder was not looked at')];
  const bad = e.required.filter((p) => states.get(p)?.state !== 'present');
  const facts = e.required.map((p) => {
    const s = states.get(p);
    return { text: `${safeText(p, 200)}: ${STATE_TEXT[s?.state] ?? 'unknown'}${s?.state === 'present' ? `, ${grouped(s.size)} bytes` : s?.reason ? ` (${s.reason})` : ''}`, at: `${data.evidence.root}/${p}`.replace(/^\.\//, '') };
  });
  return [gate('evidence-files', bad.length === 0 ? 'met' : 'not-met', req, `${e.required.length - bad.length} of ${e.required.length} present`, bad.length ? 'a required file is missing, empty, not a regular file or behind a symbolic link' : '', bad.map((p) => `${safeText(p, 160)}: ${STATE_TEXT[states.get(p)?.state] ?? 'unknown'}`), facts)];
}

// Evaluates every gate that the criteria state. data: { junit, coverage, changed, defects, evidence } as src/check.js builds
// it, each null when the input was not given. Returns the gates in report order.
export function evaluate(criteria, data) {
  return [...testGates(criteria, data), ...coverageGates(criteria, data), ...defectGates(criteria, data), ...evidenceGates(criteria, data)];
}

// The decision from the gates: go when no gate is not met, and with strict also no gate is not checked.
export function decide(gates, strict = false) {
  const count = { met: 0, notMet: 0, notChecked: 0 };
  for (const g of gates) {
    if (g.status === 'met') count.met += 1;
    else if (g.status === 'not-met') count.notMet += 1;
    else count.notChecked += 1;
  }
  const reasons = [];
  if (count.notMet) reasons.push(`${plural(count.notMet, 'gate')} not met`);
  if (strict && count.notChecked) reasons.push(`${plural(count.notChecked, 'gate')} not checked (--strict)`);
  return { go: reasons.length === 0, verdict: reasons.length === 0 ? 'go' : 'no-go', reasons, ...count };
}
