// A small strict CSV reader for the defect export, written from RFC 4180 and nothing else. It reads the text once, left to
// right. A field in double quotes may hold the delimiter, line breaks and doubled quotes ("" is one quote). A double quote
// inside a field that is not in quotes is refused, because the RFC does not allow one there (docs/method.md quotes the
// sentence). Text after a closing quote, a quote that is never closed, and a
// record with another number of fields than the header are refused with their line. LF, CRLF and a lone CR all end a
// record. Entirely empty lines are skipped.

export const CSV_LIMITS = { maxRecords: 1000000, maxFields: 1000, maxFieldLength: 65536 };

export class CsvError extends Error {
  constructor(reason, line) {
    super(reason);
    this.reason = reason;
    this.line = line;
  }
}

const DELIMITERS = [',', ';', '\t'];
export const isDelimiter = (d) => DELIMITERS.includes(d);

// Reads the text into { header, records: [{ line, fields }] }; line is where the record starts, counted from 1. The
// first record is the header. Throws CsvError.
export function parseCsv(text, options = {}) {
  const lim = { ...CSV_LIMITS, ...options };
  const delimiter = options.delimiter ?? ',';
  if (!isDelimiter(delimiter)) throw new CsvError(`the delimiter must be one of a comma, a semicolon or a tab`, 1);
  const n = text.length;
  const all = [];
  let i = 0;
  let line = 1;
  let record = [];
  let recordLine = 1;
  let sawQuote = false;

  const endRecord = () => {
    const blank = record.length === 1 && record[0] === '' && !sawQuote;
    if (!blank) {
      if (all.length >= lim.maxRecords) throw new CsvError(`more than ${lim.maxRecords.toLocaleString('en-US')} records`, recordLine);
      all.push({ line: recordLine, fields: record });
    }
    record = [];
    sawQuote = false;
  };
  const addField = (value, at) => {
    if (record.length >= lim.maxFields) throw new CsvError(`more than ${lim.maxFields} fields in one record`, at);
    record.push(value);
  };
  // Counts the line breaks of a piece of text that was inside quotes.
  const countLines = (piece) => {
    for (let k = 0; k < piece.length; k += 1) {
      const c = piece.charCodeAt(k);
      if (c === 10) line += 1;
      else if (c === 13 && piece.charCodeAt(k + 1) !== 10) line += 1;
    }
  };

  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    recordLine = line;
    record = [];
    // One record: fields up to a line break or the end of the text.
    for (;;) {
      let value;
      let quoted = false;
      if (text[i] === '"') {
        quoted = true;
        const open = line;
        i += 1;
        value = '';
        for (;;) {
          const q = text.indexOf('"', i);
          if (q === -1) throw new CsvError(`a field in double quotes that starts on line ${open} is never closed`, open);
          const piece = text.slice(i, q);
          countLines(piece);
          value += piece;
          if (value.length > lim.maxFieldLength) throw new CsvError(`a field longer than ${lim.maxFieldLength.toLocaleString('en-US')} characters`, open);
          if (text[q + 1] === '"') {
            value += '"';
            i = q + 2;
            continue;
          }
          i = q + 1;
          break;
        }
        const next = text[i];
        if (next !== undefined && next !== delimiter && next !== '\n' && next !== '\r') throw new CsvError('text after the closing double quote of a field; write a double quote inside a field as two double quotes', line);
      } else {
        let j = i;
        while (j < n) {
          const c = text[j];
          if (c === delimiter || c === '\n' || c === '\r') break;
          if (c === '"') throw new CsvError('a double quote inside a field that is not in double quotes; put the whole field in double quotes and write each quote inside it as two', line);
          j += 1;
        }
        value = text.slice(i, j);
        if (value.length > lim.maxFieldLength) throw new CsvError(`a field longer than ${lim.maxFieldLength.toLocaleString('en-US')} characters`, line);
        i = j;
      }
      if (quoted) sawQuote = true;
      addField(value, recordLine);
      if (i >= n) break;
      const c = text[i];
      if (c === delimiter) {
        i += 1;
        if (i >= n) {
          addField('', recordLine);
          break;
        }
        continue;
      }
      // A line break ends the record.
      if (c === '\r' && text[i + 1] === '\n') i += 2;
      else i += 1;
      line += 1;
      break;
    }
    endRecord();
  }
  if (!all.length) throw new CsvError('the file holds no header line', 1);
  const header = all[0].fields;
  for (const r of all.slice(1)) {
    if (r.fields.length !== header.length) throw new CsvError(`${r.fields.length} ${r.fields.length === 1 ? 'field' : 'fields'} where the header on line ${all[0].line} has ${header.length}; RFC 4180 says each line should contain the same number of fields throughout the file`, r.line);
  }
  return { header, records: all.slice(1) };
}
