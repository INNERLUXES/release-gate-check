// The names, lists and sentences the gates rest on. Each sentence comes from a page that is saved, with its address on
// the first line, in research/sources, and test/data.test.js compares this file with the saved text. Change a sentence
// here only after saving the new page text and updating docs/rules-and-sources.md. The gates in src/ use these
// constants and never write a quoted sentence of their own.

const SUREFIRE = 'https://maven.apache.org/surefire/maven-surefire-plugin/';
const XML = 'https://www.w3.org/TR/xml/';
const ISTQB = 'https://glossary.istqb.org/en_US/term/';

export const SOURCES = [
  { id: 'istqb-exit-criteria', file: 'istqb-exit-criteria.txt', url: `${ISTQB}exit-criteria`, label: 'ISTQB Glossary, exit criteria' },
  { id: 'istqb-severity', file: 'istqb-severity.txt', url: `${ISTQB}severity`, label: 'ISTQB Glossary, severity' },
  { id: 'istqb-defect', file: 'istqb-defect.txt', url: `${ISTQB}defect`, label: 'ISTQB Glossary, defect' },
  { id: 'istqb-coverage', file: 'istqb-coverage.txt', url: `${ISTQB}coverage`, label: 'ISTQB Glossary, coverage' },
  { id: 'istqb-branch-coverage', file: 'istqb-branch-coverage.txt', url: `${ISTQB}branch-coverage`, label: 'ISTQB Glossary, branch coverage' },
  { id: 'lcov', file: 'lcov-geninfo-tracefile-format.txt', url: 'https://manpages.debian.org/testing/lcov/geninfo.1.en.html', label: 'lcov, geninfo(1), tracefile format' },
  { id: 'cobertura-dtd', file: 'cobertura-coverage-04-dtd.txt', url: 'https://raw.githubusercontent.com/cobertura/web/master/htdocs/xml/coverage-04.dtd', label: 'Cobertura, coverage-04.dtd' },
  { id: 'coveragepy', file: 'coveragepy-xmlreport-lines.txt', url: 'https://raw.githubusercontent.com/nedbat/coveragepy/master/coverage/xmlreport.py', label: 'coverage.py, xmlreport.py' },
  { id: 'surefire-xsd', file: 'surefire-test-report-xsd.txt', url: `${SUREFIRE}xsd/surefire-test-report.xsd`, label: 'Maven Surefire, XML schema of the test report' },
  { id: 'surefire-rerun', file: 'surefire-rerun-failing-tests.txt', url: `${SUREFIRE}examples/rerun-failing-tests.html`, label: 'Maven Surefire, Rerun Failing Tests' },
  { id: 'rfc4180', file: 'rfc4180-csv-definition.txt', url: 'https://www.rfc-editor.org/rfc/rfc4180', label: 'RFC 4180, Common Format and MIME Type for CSV Files' },
  { id: 'rfc8259', file: 'rfc8259-json-objects.txt', url: 'https://www.rfc-editor.org/rfc/rfc8259', label: 'RFC 8259, The JSON Data Interchange Format' },
  { id: 'xml-doctype', file: 'xml-document-type-declaration.txt', url: `${XML}#sec-prolog-dtd`, label: 'W3C XML 1.0, 2.8 Prolog and Document Type Declaration' },
  { id: 'xml-references', file: 'xml-character-and-entity-references.txt', url: `${XML}#sec-references`, label: 'W3C XML 1.0, 4.1 Character and Entity References' },
  { id: 'xml-predefined', file: 'xml-predefined-entities.txt', url: `${XML}#sec-predefined-ent`, label: 'W3C XML 1.0, 4.6 Predefined Entities' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// Sentences quoted in the gates and the documents. Every text is on its saved page word for word
// (test/data.test.js compares them), and holds no year. Lines of a schema, a DTD and a tracefile are quoted as written.
export const FACTS = {
  exitCriteria: { source: 'istqb-exit-criteria', section: 'exit criteria', text: 'The set of conditions for officially completing a defined task.' },
  severity: { source: 'istqb-severity', section: 'severity', text: 'The degree of impact that a defect has on the development, testing or operation of a component or system.' },
  defect: { source: 'istqb-defect', section: 'defect', text: 'An imperfection or deficiency in a work product where it does not meet its requirements or specifications or impairs its intended use.' },
  coverage: { source: 'istqb-coverage', section: 'coverage', text: 'The degree to which specified coverage items are exercised by a test suite, expressed as a percentage.' },
  branchCoverage: { source: 'istqb-branch-coverage', section: 'branch coverage', text: 'The coverage of branches in a control flow graph.' },
  lcovSf: { source: 'lcov', section: 'TRACEFILE FORMAT', text: 'SF:<path to the source file>' },
  lcovDa: { source: 'lcov', section: 'TRACEFILE FORMAT', text: 'DA:<line number>,<execution count>[,<checksum>]' },
  lcovLh: { source: 'lcov', section: 'TRACEFILE FORMAT', text: 'LH:<number of lines with a non-zero execution count>' },
  lcovLf: { source: 'lcov', section: 'TRACEFILE FORMAT', text: 'LF:<number of instrumented lines>' },
  lcovBrda: { source: 'lcov', section: 'TRACEFILE FORMAT', text: 'BRDA:<line_number>,[<exception>]<block>,<branch>,<taken>' },
  lcovTaken: { source: 'lcov', section: 'TRACEFILE FORMAT', text: "<taken> is either '-' if the corresponding expression was never evaluated (e.g., the basic block containing the branch was never executed) or a number indicating how often that branch was taken." },
  lcovBrf: { source: 'lcov', section: 'TRACEFILE FORMAT', text: 'BRF:<number of branches found>' },
  lcovBrh: { source: 'lcov', section: 'TRACEFILE FORMAT', text: 'BRH:<number of branches hit>' },
  lcovEnd: { source: 'lcov', section: 'TRACEFILE FORMAT', text: 'end_of_record' },
  coberturaFilename: { source: 'cobertura-dtd', section: 'class', text: '<!ATTLIST class filename    CDATA #REQUIRED>' },
  coberturaClass: { source: 'cobertura-dtd', section: 'class', text: '<!ELEMENT class (methods,lines)>' },
  coberturaMethod: { source: 'cobertura-dtd', section: 'method', text: '<!ELEMENT method (lines)>' },
  coberturaLineNumber: { source: 'cobertura-dtd', section: 'line', text: '<!ATTLIST line number CDATA #REQUIRED>' },
  coberturaLineHits: { source: 'cobertura-dtd', section: 'line', text: '<!ATTLIST line hits   CDATA #REQUIRED>' },
  coberturaLineBranch: { source: 'cobertura-dtd', section: 'line', text: '<!ATTLIST line branch CDATA "false">' },
  coberturaCondition: { source: 'cobertura-dtd', section: 'line', text: '<!ATTLIST line condition-coverage CDATA "100%">' },
  coveragepyCondition: { source: 'coveragepy', section: 'xmlreport.py', text: 'f"{100 * taken // total}% ({taken}/{total})",' },
  schemaTestcase: { source: 'surefire-xsd', section: 'testsuite', text: '<xs:element name="testcase" minOccurs="0" maxOccurs="unbounded">' },
  schemaName: { source: 'surefire-xsd', section: 'testcase', text: '<xs:attribute name="name" type="xs:string" use="required"/>' },
  schemaClassname: { source: 'surefire-xsd', section: 'testcase', text: '<xs:attribute name="classname" type="xs:string"/>' },
  schemaSkipped: { source: 'surefire-xsd', section: 'testcase', text: '<xs:element name="skipped" nillable="true" minOccurs="0" maxOccurs="1">' },
  schemaFlakyFailure: { source: 'surefire-xsd', section: 'testcase', text: '<xs:element name="flakyFailure" minOccurs="0" maxOccurs="unbounded">' },
  countedFlaky: { source: 'surefire-rerun', section: 'Output flaky re-run information on the screen', text: 'Then this test will be counted as a flaky test.' },
  failOnFlake: { source: 'surefire-rerun', section: 'Re-run and fail the build upon flaky test count', text: 'This will fail the build if more than the specified number of tests are flaky, i.e. if they had a successful run after previously failing.' },
  csvQuoting: { source: 'rfc4180', section: '2. Definition of the CSV Format', text: 'Fields containing line breaks (CRLF), double quotes, and commas should be enclosed in double-quotes.' },
  csvEscape: { source: 'rfc4180', section: '2. Definition of the CSV Format', text: 'If double-quotes are used to enclose fields, then a double-quote appearing inside a field must be escaped by preceding it with another double quote.' },
  csvSpaces: { source: 'rfc4180', section: '2. Definition of the CSV Format', text: 'Spaces are considered part of a field and should not be ignored.' },
  csvPlainQuote: { source: 'rfc4180', section: '2. Definition of the CSV Format', text: 'If fields are not enclosed with double quotes, then double quotes may not appear inside the fields.' },
  csvSameCount: { source: 'rfc4180', section: '2. Definition of the CSV Format', text: 'Each line should contain the same number of fields throughout the file.' },
  jsonUnique: { source: 'rfc8259', section: '4. Objects', text: 'The names within an object SHOULD be unique.' },
  jsonUnpredictable: { source: 'rfc8259', section: '4. Objects', text: 'When the names within an object are not unique, the behavior of software that receives such an object is unpredictable.' },
  doctypeFirst: { source: 'xml-doctype', section: '2.8 Prolog and Document Type Declaration', text: 'The document type declaration MUST appear before the first element in the document.' },
  doctypeExternal: { source: 'xml-doctype', section: '2.8 Prolog and Document Type Declaration', text: 'The document type declaration can point to an external subset (a special kind of external entity) containing markup declarations, or can contain the markup declarations directly in an internal subset, or can do both.' },
  legalCharacter: { source: 'xml-references', section: 'Well-formedness constraint: Legal Character', text: 'Characters referred to using character references MUST match the production for Char.' },
  predefinedKnown: { source: 'xml-predefined', section: '4.6 Predefined Entities', text: 'All XML processors MUST recognize these entities whether they are declared or not.' }
};

// The page of a quoted sentence.
export const factPage = (key) => source(FACTS[key].source).url;

// The five predefined entities of XML; no other name is ever expanded.
export const PREDEFINED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// Folders that hold tools, caches or copies of packages, not test results. They are not entered; a note names them.
export const SKIP_FOLDERS = ['.git', '.hg', '.svn', 'node_modules', '.cache'];

// The file ending of a JUnit XML file.
export const isXmlName = (name) => /\.xml$/i.test(name);

// The elements of a testcase that the tool reads (Surefire writes the flaky and rerun ones when it retries a test).
export const RESULT_ELEMENTS = ['failure', 'error', 'skipped', 'flakyFailure', 'flakyError', 'rerunFailure', 'rerunError', 'system-out', 'system-err'];
