// Report formats: text for a terminal, Markdown for a pull request or job summary, JSON for other tools. Every gate shows
// its requirement, what was found and, when it is not met or not checked, why. With explain, every gate also shows the facts
// it used with the file and line each came from, and the sentences of the saved pages it rests on.

import { AREAS } from './gates.js';
import { plural } from './size.js';

const LABEL = { met: 'MET', 'not-met': 'NOT MET', 'not-checked': 'NOT CHECKED' };

const countsLine = (r) => `${r.counts.met} met, ${r.counts.notMet} not met, ${r.counts.notChecked} not checked`;

function inputsLine(r) {
  const i = r.inputs;
  const parts = [];
  if (i.results) parts.push(`results: ${plural(i.results.files, 'file')}, ${plural(i.results.testcases, 'testcase')}, ${plural(i.results.tests, 'distinct test')}`);
  if (i.history.length) parts.push(`${plural(i.history.length, 'earlier run')}`);
  if (i.coverage) parts.push(`coverage: ${plural(i.coverage.reports.length, 'report')}, ${plural(i.coverage.files, 'source file')}`);
  if (i.changed) parts.push(`${plural(i.changed.files, 'changed file')}`);
  if (i.defects) parts.push(`${plural(i.defects.defects, 'defect')}`);
  if (i.evidence) parts.push(`evidence folder ${i.evidence.root}`);
  return parts.length ? parts.join('; ') : 'no input was given besides the criteria';
}

function decisionLine(r) {
  return r.decision.go ? 'DECISION: GO' : `DECISION: NO-GO - ${r.decision.reasons.join(', ')}`;
}

const head = (r) => `${r.criteria.file}${r.criteria.name ? ` (${r.criteria.name})` : ''}`;

export function toText(r, { explain = false } = {}) {
  const lines = [`release-gate-check: ${head(r)}`, `inputs: ${inputsLine(r)}`];
  if (r.strict) lines.push('mode: strict, a gate that is not checked is a no-go');
  lines.push(`gates: ${countsLine(r)}`);
  for (const a of AREAS) {
    const own = r.gates.filter((g) => g.area === a.id);
    if (!own.length) continue;
    lines.push('', `${a.title} (${plural(own.length, 'gate')})`);
    for (const g of own) {
      lines.push('', `  ${LABEL[g.status].padEnd(11)}  ${g.id}  ${g.title}`, `               requirement: ${g.requirement}`, `               found: ${g.actual}`);
      if (g.reason) lines.push(`               why: ${g.reason}`);
      for (const d of g.details) lines.push(`               - ${d}`);
      if (explain) {
        for (const f of g.facts) lines.push(`               from: ${f.at ? `${f.at}  ` : ''}${f.text}`);
        for (const b of g.basis) lines.push(`               basis: "${b.text}" (${b.section}, ${b.source})`);
      }
    }
  }
  if (r.notes.length) lines.push('');
  for (const n of r.notes) lines.push(`note: ${n}`);
  lines.push('', decisionLine(r));
  return lines.join('\n') + '\n';
}

// A Markdown table cell: backslashes, pipes, square brackets, backticks, asterisks and underscores escaped, line breaks
// flattened, and <, > and & written as entities, so text from the input cannot break the table, make a link or be read as
// HTML.
export function mdCell(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[[\]`*_]/g, (c) => `\\${c}`)
    .replace(/\r?\n|\r/g, ' ');
}

export function toMarkdown(r, { explain = false } = {}) {
  const lines = [`## release-gate-check: ${r.decision.go ? 'go' : 'no-go'}`, '', `Criteria: ${mdCell(head(r))}. Inputs: ${mdCell(inputsLine(r))}.${r.strict ? ' Strict: a gate that is not checked is a no-go.' : ''} Gates: ${countsLine(r)}.`];
  lines.push('', '| Status | Gate | Requirement | Found | Why |', '| --- | --- | --- | --- | --- |');
  for (const g of r.gates) lines.push(`| ${g.status === 'met' ? 'met' : `**${LABEL[g.status].toLowerCase()}**`} | ${mdCell(g.id)} | ${mdCell(g.requirement)} | ${mdCell(g.actual)} | ${mdCell(g.reason)} |`);
  for (const g of r.gates) {
    if (!g.details.length && !(explain && (g.facts.length || g.basis.length))) continue;
    lines.push('', `### ${mdCell(g.id)}`, '');
    for (const d of g.details) lines.push(`- ${mdCell(d)}`);
    if (explain) {
      for (const f of g.facts) lines.push(`- from ${f.at ? `${mdCell(f.at)}: ` : ''}${mdCell(f.text)}`);
      for (const b of g.basis) lines.push(`- basis: ${mdCell(`"${b.text}" (${b.section}, ${b.source})`)}`);
    }
  }
  if (r.notes.length) lines.push('');
  for (const n of r.notes) lines.push(`- ${mdCell(n)}`);
  lines.push('', r.decision.go ? '**Decision: go.**' : `**Decision: no-go** - ${mdCell(r.decision.reasons.join(', '))}.`);
  return lines.join('\n') + '\n';
}

// The whole report, with the facts and the basis of every gate.
export function toJson(r) {
  return JSON.stringify(r, null, 2) + '\n';
}
