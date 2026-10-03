// The defect export: a CSV file read with src/csv.js, then three columns taken by the names the criteria give (id, severity
// and status; the names of the header are compared without case and without white space around them). A defect is closed
// when its status is one of the closed statuses of the criteria; every other defect, including one with an empty status or
// a status the criteria do not list, is open. A defect id that appears twice counts once: the first line is used and the
// others are named in a note.

import { CsvError, parseCsv } from './csv.js';
import { safeText } from './text.js';

export const DEFAULT_COLUMNS = { id: 'id', severity: 'severity', status: 'status' };

// A name or a value compared without case, without white space around it and with runs of white space as one space.
export const norm = (value) => String(value).trim().replace(/\s+/g, ' ').toLowerCase();

// Reads the export. config: { columns, delimiter, closedStatuses }. Returns { rows, duplicates, header, problem }: rows is
// [{ line, id, severity, status, open }] and problem is a reason when the export cannot be used (a bad CSV, a missing
// column, a column named twice) and the rows are empty.
export function readDefects(text, config) {
  const columns = { ...DEFAULT_COLUMNS, ...(config.columns ?? {}) };
  let parsed;
  try {
    parsed = parseCsv(text, { delimiter: config.delimiter ?? ',' });
  } catch (error) {
    if (error instanceof CsvError) return { rows: [], duplicates: [], header: [], problem: `line ${error.line}: ${error.reason}` };
    throw error;
  }
  const names = parsed.header.map(norm);
  const index = {};
  for (const key of ['id', 'severity', 'status']) {
    const want = norm(columns[key]);
    const found = names.reduce((list, name, i) => (name === want ? [...list, i] : list), []);
    if (found.length === 0) return { rows: [], duplicates: [], header: parsed.header, problem: `the header has no column named "${safeText(columns[key], 80)}" for the ${key}; the columns are ${parsed.header.map((h) => `"${safeText(h, 60)}"`).slice(0, 12).join(', ')}` };
    if (found.length > 1) return { rows: [], duplicates: [], header: parsed.header, problem: `the header names "${safeText(columns[key], 80)}" more than once (columns ${found.map((f) => f + 1).join(', ')}), so the ${key} is not clear` };
    index[key] = found[0];
  }
  const closed = new Set((config.closedStatuses ?? []).map(norm));
  const rows = [];
  const duplicates = [];
  const seen = new Map();
  for (const record of parsed.records) {
    const id = record.fields[index.id].trim();
    const row = {
      line: record.line,
      id,
      severity: norm(record.fields[index.severity]),
      severityText: safeText(record.fields[index.severity].trim(), 60),
      status: norm(record.fields[index.status]),
      statusText: safeText(record.fields[index.status].trim(), 60),
      open: !closed.has(norm(record.fields[index.status]))
    };
    if (id !== '' && seen.has(id)) {
      duplicates.push({ id, line: record.line, first: seen.get(id) });
      continue;
    }
    if (id !== '') seen.set(id, record.line);
    rows.push(row);
  }
  return { rows, duplicates, header: parsed.header, problem: null };
}
