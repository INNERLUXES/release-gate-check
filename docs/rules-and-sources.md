# Rules and sources

Every sentence that the tool quotes comes from a page that is saved in [research/sources](../research/sources), with its address on the first line. `src/data.js` holds them, and `test/data.test.js` compares each one with the saved text. Nothing was added from memory. Change a sentence only after saving the new page text and updating this file.

## The saved pages

| File | Address | What it is used for |
| --- | --- | --- |
| `istqb-exit-criteria.txt` | https://glossary.istqb.org/en_US/term/exit-criteria | what exit criteria are |
| `istqb-severity.txt` | https://glossary.istqb.org/en_US/term/severity | what the severity of a defect is |
| `istqb-defect.txt` | https://glossary.istqb.org/en_US/term/defect | what a defect is |
| `istqb-coverage.txt` | https://glossary.istqb.org/en_US/term/coverage | what coverage is |
| `istqb-branch-coverage.txt` | https://glossary.istqb.org/en_US/term/branch-coverage | what branch coverage is |
| `lcov-geninfo-tracefile-format.txt` | https://manpages.debian.org/testing/lcov/geninfo.1.en.html | the records of an lcov tracefile: SF, DA, BRDA, LF, LH, BRF, BRH and end_of_record |
| `cobertura-coverage-04-dtd.txt` | https://raw.githubusercontent.com/cobertura/web/master/htdocs/xml/coverage-04.dtd | the elements and attributes of a Cobertura report: class, method, line, hits, branch, condition-coverage |
| `coveragepy-xmlreport-lines.txt` | https://raw.githubusercontent.com/nedbat/coveragepy/master/coverage/xmlreport.py | the form of the condition-coverage text that coverage.py writes, with the counts in brackets |
| `surefire-test-report-xsd.txt` | https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd | the elements and attributes of a test report: testcase, name, classname, skipped, the flaky and rerun elements |
| `surefire-rerun-failing-tests.txt` | https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html | a test that passes on a rerun is counted as flaky, and the build can fail on the count of flaky tests |
| `rfc4180-csv-definition.txt` | https://www.rfc-editor.org/rfc/rfc4180 | the CSV format: records, quoting, doubled quotes, the same number of fields in every line |
| `rfc8259-json-objects.txt` | https://www.rfc-editor.org/rfc/rfc8259 | the names within a JSON object should be unique, and what happens when they are not |
| `xml-document-type-declaration.txt` | https://www.w3.org/TR/xml/#sec-prolog-dtd | what a document type declaration is and what it can point to |
| `xml-character-and-entity-references.txt` | https://www.w3.org/TR/xml/#sec-references | character references, entity references, no recursion |
| `xml-predefined-entities.txt` | https://www.w3.org/TR/xml/#sec-predefined-ent | the five entities every XML reader knows |

The pages were read once and saved as plain text, from the heading of each kept section to its end, with the navigation, the dates, the byline and the footers left out. The five glossary terms were read through the service that the glossary page itself calls, `api.glossary.istqb.org/v1/terms`, because the page is built in the browser; the text of each is the definition as the service returned it, and the references that the glossary lists for a term, which name years, are not kept. From the geninfo manual page only the section on the tracefile format is kept, without the parts on the version ID, on function coverage and on MC/DC, and without the sentences that use a word the repository checks do not allow; the unused records are skipped by the reader. From the Cobertura DTD the licence comment at the top of the file is left out. From the coverage.py file the function that writes a ratio and the lines that write the line elements of a class are kept, and the lines between them are marked as left out. From RFC 4180 section 2 and RFC 8259 section 4 the page headers and footers are left out. From the Surefire page on rerunning failing tests the whole page is kept but for the sentences that use a word the repository checks do not allow. From the Surefire schema the definition of the testsuite element is kept, without the line of the schema element itself, which names a year in its address. From W3C XML 1.0 the parts of sections 2.8, 4.1 and 4.6 that define the document type declaration, character and entity references and the predefined entities are kept. Typographic quotes and dashes are written as plain ASCII.

The pages say what exit criteria, coverage, defects and severity are, and what the files look like. They do not say how a release should be judged, and the tool does not claim they do. The structure of the criteria file, the three outcomes, the rule that missing data is never met, that a critical suite with no result and a changed file with no coverage record are not met, that an unlisted defect status is open, the merging of reports by source file, the use of the counts in brackets of a Cobertura line, the choice to leave out the lines of Cobertura methods, and the matching of changed paths with covered paths are the tool's own; docs/method.md says so where each is used.

## The sentences that the gates quote

Each sentence is on its saved page word for word. A key used by "docs" is quoted in the documents and in no gate. Lines of a schema, a DTD, a tracefile and code are quoted as written, in code format.

| Key | Used by | Sentence | Page and section |
| --- | --- | --- | --- |
| `exitCriteria` | `pass-rate`, `critical-suites`, `skipped-share`, `unexplained-failures`, `evidence-files` | "The set of conditions for officially completing a defined task." | `istqb-exit-criteria.txt`, exit criteria |
| `severity` | `open-defects`, `defect-severity` | "The degree of impact that a defect has on the development, testing or operation of a component or system." | `istqb-severity.txt`, severity |
| `defect` | `open-defects`, `defect-severity` | "An imperfection or deficiency in a work product where it does not meet its requirements or specifications or impairs its intended use." | `istqb-defect.txt`, defect |
| `coverage` | `line-coverage`, `changed-line-coverage` | "The degree to which specified coverage items are exercised by a test suite, expressed as a percentage." | `istqb-coverage.txt`, coverage |
| `branchCoverage` | `branch-coverage`, `changed-branch-coverage` | "The coverage of branches in a control flow graph." | `istqb-branch-coverage.txt`, branch coverage |
| `lcovSf` | `changed-line-coverage`, `changed-branch-coverage` | `SF:<path to the source file>` | `lcov-geninfo-tracefile-format.txt`, TRACEFILE FORMAT |
| `lcovDa` | `line-coverage` | `DA:<line number>,<execution count>[,<checksum>]` | `lcov-geninfo-tracefile-format.txt`, TRACEFILE FORMAT |
| `lcovLh` | docs | `LH:<number of lines with a non-zero execution count>` | `lcov-geninfo-tracefile-format.txt`, TRACEFILE FORMAT |
| `lcovLf` | docs | `LF:<number of instrumented lines>` | `lcov-geninfo-tracefile-format.txt`, TRACEFILE FORMAT |
| `lcovBrda` | `branch-coverage` | `BRDA:<line_number>,[<exception>]<block>,<branch>,<taken>` | `lcov-geninfo-tracefile-format.txt`, TRACEFILE FORMAT |
| `lcovTaken` | docs | `<taken> is either '-' if the corresponding expression was never evaluated (e.g., the basic block containing the branch was never executed) or a number indicating how often that branch was taken.` | `lcov-geninfo-tracefile-format.txt`, TRACEFILE FORMAT |
| `lcovBrf` | docs | `BRF:<number of branches found>` | `lcov-geninfo-tracefile-format.txt`, TRACEFILE FORMAT |
| `lcovBrh` | docs | `BRH:<number of branches hit>` | `lcov-geninfo-tracefile-format.txt`, TRACEFILE FORMAT |
| `lcovEnd` | docs | `end_of_record` | `lcov-geninfo-tracefile-format.txt`, TRACEFILE FORMAT |
| `coberturaFilename` | docs | `<!ATTLIST class filename CDATA #REQUIRED>` | `cobertura-coverage-04-dtd.txt`, class |
| `coberturaClass` | docs | `<!ELEMENT class (methods,lines)>` | `cobertura-coverage-04-dtd.txt`, class |
| `coberturaMethod` | docs | `<!ELEMENT method (lines)>` | `cobertura-coverage-04-dtd.txt`, method |
| `coberturaLineNumber` | docs | `<!ATTLIST line number CDATA #REQUIRED>` | `cobertura-coverage-04-dtd.txt`, line |
| `coberturaLineHits` | docs | `<!ATTLIST line hits CDATA #REQUIRED>` | `cobertura-coverage-04-dtd.txt`, line |
| `coberturaLineBranch` | docs | `<!ATTLIST line branch CDATA "false">` | `cobertura-coverage-04-dtd.txt`, line |
| `coberturaCondition` | docs | `<!ATTLIST line condition-coverage CDATA "100%">` | `cobertura-coverage-04-dtd.txt`, line |
| `coveragepyCondition` | docs | `f"{100 * taken // total}% ({taken}/{total})",` | `coveragepy-xmlreport-lines.txt`, xmlreport.py |
| `schemaTestcase` | `pass-rate`, `unexplained-failures` | `<xs:element name="testcase" minOccurs="0" maxOccurs="unbounded">` | `surefire-test-report-xsd.txt`, testsuite |
| `schemaName` | docs | `<xs:attribute name="name" type="xs:string" use="required"/>` | `surefire-test-report-xsd.txt`, testcase |
| `schemaClassname` | `critical-suites` | `<xs:attribute name="classname" type="xs:string"/>` | `surefire-test-report-xsd.txt`, testcase |
| `schemaSkipped` | `skipped-share` | `<xs:element name="skipped" nillable="true" minOccurs="0" maxOccurs="1">` | `surefire-test-report-xsd.txt`, testcase |
| `schemaFlakyFailure` | docs | `<xs:element name="flakyFailure" minOccurs="0" maxOccurs="unbounded">` | `surefire-test-report-xsd.txt`, testcase |
| `countedFlaky` | `flaky-count` | "Then this test will be counted as a flaky test." | `surefire-rerun-failing-tests.txt`, Output flaky re-run information on the screen |
| `failOnFlake` | `flaky-count` | "This will fail the build if more than the specified number of tests are flaky, i.e. if they had a successful run after previously failing." | `surefire-rerun-failing-tests.txt`, Re-run and fail the build upon flaky test count |
| `csvQuoting` | docs | "Fields containing line breaks (CRLF), double quotes, and commas should be enclosed in double-quotes." | `rfc4180-csv-definition.txt`, 2. Definition of the CSV Format |
| `csvEscape` | docs | "If double-quotes are used to enclose fields, then a double-quote appearing inside a field must be escaped by preceding it with another double quote." | `rfc4180-csv-definition.txt`, 2. Definition of the CSV Format |
| `csvSpaces` | docs | "Spaces are considered part of a field and should not be ignored." | `rfc4180-csv-definition.txt`, 2. Definition of the CSV Format |
| `csvPlainQuote` | docs | "If fields are not enclosed with double quotes, then double quotes may not appear inside the fields." | `rfc4180-csv-definition.txt`, 2. Definition of the CSV Format |
| `csvSameCount` | docs | "Each line should contain the same number of fields throughout the file." | `rfc4180-csv-definition.txt`, 2. Definition of the CSV Format |
| `jsonUnique` | docs | "The names within an object SHOULD be unique." | `rfc8259-json-objects.txt`, 4. Objects |
| `jsonUnpredictable` | docs | "When the names within an object are not unique, the behavior of software that receives such an object is unpredictable." | `rfc8259-json-objects.txt`, 4. Objects |
| `doctypeFirst` | docs | "The document type declaration MUST appear before the first element in the document." | `xml-document-type-declaration.txt`, 2.8 Prolog and Document Type Declaration |
| `doctypeExternal` | docs | "The document type declaration can point to an external subset (a special kind of external entity) containing markup declarations, or can contain the markup declarations directly in an internal subset, or can do both." | `xml-document-type-declaration.txt`, 2.8 Prolog and Document Type Declaration |
| `legalCharacter` | docs | "Characters referred to using character references MUST match the production for Char." | `xml-character-and-entity-references.txt`, Well-formedness constraint: Legal Character |
| `predefinedKnown` | docs | "All XML processors MUST recognize these entities whether they are declared or not." | `xml-predefined-entities.txt`, 4.6 Predefined Entities |

## The gates

| Id | Area | Sentences | Where the rule is written |
| --- | --- | --- | --- |
| `pass-rate` | tests | `exitCriteria`, `schemaTestcase` | [method.md](method.md#pass-rate) |
| `critical-suites` | tests | `exitCriteria`, `schemaClassname` | [method.md](method.md#critical-suites) |
| `skipped-share` | tests | `exitCriteria`, `schemaSkipped` | [method.md](method.md#skipped-share) |
| `flaky-count` | tests | `countedFlaky`, `failOnFlake` | [method.md](method.md#flaky-count) |
| `unexplained-failures` | tests | `exitCriteria`, `schemaTestcase` | [method.md](method.md#unexplained-failures) |
| `line-coverage` | coverage | `coverage`, `lcovDa` | [method.md](method.md#line-coverage) |
| `branch-coverage` | coverage | `branchCoverage`, `lcovBrda` | [method.md](method.md#branch-coverage) |
| `changed-line-coverage` | coverage | `coverage`, `lcovSf` | [method.md](method.md#changed-line-coverage) |
| `changed-branch-coverage` | coverage | `branchCoverage`, `lcovSf` | [method.md](method.md#changed-branch-coverage) |
| `open-defects` | defects | `severity`, `defect` | [method.md](method.md#open-defects) |
| `defect-severity` | defects | `severity`, `defect` | [method.md](method.md#defect-severity) |
| `evidence-files` | evidence | `exitCriteria` | [method.md](method.md#evidence-files) |
