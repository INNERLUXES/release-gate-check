import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atLeast, atMost, norm, percentText, readDefects, scaledPercent, thresholdText } from '../src/index.js';

const closed = ['done', 'closed'];

test('defects: the three columns are taken by the names of the criteria, without case and with white space around them', () => {
  const r = readDefects(' Key ,Summary,PRIORITY,State\nBR-1,Crash,Major,Open\nBR-2,Typo,Minor,Done\n', { columns: { id: 'key', severity: 'priority', status: 'STATE' }, closedStatuses: closed });
  assert.equal(r.problem, null);
  assert.deepEqual(r.rows.map((x) => [x.id, x.severity, x.status, x.open]), [['BR-1', 'major', 'open', true], ['BR-2', 'minor', 'done', false]]);
  assert.deepEqual(r.rows.map((x) => x.line), [2, 3]);
});

test('defects: the default names are id, severity and status', () => {
  const r = readDefects('id,severity,status\n1,major,open\n', { closedStatuses: closed });
  assert.equal(r.rows.length, 1);
});

test('defects: a defect is closed only when its status is listed as closed, compared without case or extra spaces', () => {
  const r = readDefects('id,severity,status\n1,a,  DONE \n2,a,Won\'t   fix\n3,a,\n4,a,Closed\n', { closedStatuses: [...closed, "won't fix"] });
  assert.deepEqual(r.rows.map((x) => x.open), [false, false, true, false]);
});

test('defects: a quoted summary with a comma, doubled quotes and a line break does not shift the columns', () => {
  const r = readDefects('id,summary,severity,status\n1,"Shows ""0"", then\ncrashes",critical,open\n2,plain,major,open\n', { closedStatuses: closed });
  assert.equal(r.problem, null);
  assert.deepEqual(r.rows.map((x) => x.severity), ['critical', 'major']);
  assert.equal(r.rows[1].line, 4, 'the line count follows the line break inside the quotes');
});

test('defects: a header that lacks a named column is a problem that names the columns it has', () => {
  const r = readDefects('id,priority,status\n1,major,open\n', { closedStatuses: closed });
  assert.match(r.problem, /the header has no column named "severity" for the severity; the columns are "id", "priority", "status"/);
  assert.deepEqual(r.rows, []);
});

test('defects: a column named twice in the header is a problem, because the column is not clear', () => {
  const r = readDefects('id,severity,Severity,status\n1,a,b,open\n', { closedStatuses: closed });
  assert.match(r.problem, /names "severity" more than once \(columns 2, 3\)/);
});

test('defects: a CSV that is not well formed is a problem with its line', () => {
  assert.match(readDefects('id,severity,status\n1,major,"open\n', { closedStatuses: closed }).problem, /^line 2: a field in double quotes .* never closed/);
  assert.match(readDefects('id,severity,status\n1,major\n', { closedStatuses: closed }).problem, /^line 2: 2 fields where the header on line 1 has 3/);
  assert.match(readDefects('id,severity,status\n1,ma"jor,open\n', { closedStatuses: closed }).problem, /^line 2: a double quote inside a field/);
});

test('defects: a semicolon delimiter from the criteria is used', () => {
  const r = readDefects('id;severity;status\n1;major;open\n', { delimiter: ';', closedStatuses: closed });
  assert.equal(r.rows.length, 1);
  assert.equal(readDefects('id;severity;status\n1;major;open\n', { closedStatuses: closed }).problem.includes('the header has no column named'), true);
});

test('defects: a repeated id counts once with the first line; rows with no id are all kept', () => {
  const r = readDefects('id,severity,status\nA,major,open\nA,minor,done\n,major,open\n,major,open\n', { closedStatuses: closed });
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.duplicates, [{ id: 'A', line: 3, first: 2 }]);
});

test('defects: text from the file is cleaned before it can reach a report', () => {
  const r = readDefects(`id,severity,status\nX${String.fromCharCode(27)}Y,ma${String.fromCharCode(0x202e)}jor,op${String.fromCharCode(7)}en\n`, { closedStatuses: closed });
  assert.ok(!r.rows[0].severityText.includes(String.fromCharCode(0x202e)));
  assert.ok(!r.rows[0].statusText.includes(String.fromCharCode(7)));
});

test('defects: norm trims, folds case and collapses white space', () => {
  assert.equal(norm('  Major \t Bug '), 'major bug');
});

test('ratio: thresholds are whole numbers of ten-thousandths of a percent, or null', () => {
  assert.equal(scaledPercent(95), 950000);
  assert.equal(scaledPercent(12.3456), 123456);
  assert.equal(scaledPercent(12.34567), null);
  assert.equal(scaledPercent(-0.0001), null);
  assert.equal(scaledPercent(100.0001), null);
  assert.equal(scaledPercent(NaN), null);
  assert.equal(scaledPercent('5'), null);
});

test('ratio: comparisons use whole numbers, so a ratio on the limit is met and one count below is not', () => {
  assert.equal(atLeast(19, 20, 950000), true);
  assert.equal(atLeast(18, 20, 950000), false);
  assert.equal(atMost(1, 20, 50000), true);
  assert.equal(atMost(2, 20, 50000), false);
  assert.equal(atLeast(0, 1, 0), true);
  assert.equal(atMost(0, 1, 0), true);
  assert.equal(atMost(1, 1000000, 1), true, '0.0001 percent of a million is one');
});

test('ratio: percentages are cut down to two decimals and never rounded up', () => {
  assert.equal(percentText(2, 3), '66.66%');
  assert.equal(percentText(1, 3), '33.33%');
  assert.equal(percentText(1, 1), '100%');
  assert.equal(percentText(0, 7), '0%');
  assert.equal(percentText(19, 20), '95%');
  assert.equal(percentText(94999, 100000), '94.99%');
  assert.equal(percentText(1, 0), 'n/a');
  assert.equal(thresholdText(995000), '99.5%');
  assert.equal(thresholdText(950000), '95%');
  assert.equal(thresholdText(1), '0.0001%');
});
