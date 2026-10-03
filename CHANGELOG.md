# Changes

## 1.0.1

- A test on Linux and macOS looked for the failing test on line 4 of its result file; the test case is on line 3. The tool itself is unchanged.

## 1.0.0

First release.

- Decides go or no-go for a release against exit criteria written in a JSON criteria file, and explains every reason. Every gate is met, not met or not checked; missing data is never read as met. The tool has no threshold of its own: every number comes from the criteria file. Every key it does not know is an error, a file that states no gate is an error, and an object that names a key twice is refused.
- Test gates: `pass-rate` (minimum share of executed tests that pass), `critical-suites` (failing tests in named suites; a suite with no result is not met), `skipped-share`, `flaky-count` (Surefire `flakyFailure` and `flakyError`, and a test that passed and failed in one run), and `unexplained-failures` (no test failed in the last runs unless the criteria explain it).
- Coverage gates: `line-coverage` and `branch-coverage` over all files with `coverage.exclude`, and `changed-line-coverage` and `changed-branch-coverage` for the files listed with `--changed`, with `coverage.changedFiles.ignore`. A changed file with no coverage record is not met. Reads lcov tracefiles and Cobertura XML reports, merged by source file; counts from the `DA` and `BRDA` records and from the lines of the classes of Cobertura, and says in a note when the sums of an lcov file disagree.
- Defect gates: `open-defects` by severity and in all, and `defect-severity` for open defects with no severity. Reads a CSV export with the columns, the delimiter and the closed statuses named in the criteria; a status that is not listed as closed is open.
- Evidence gate: `evidence-files`, the files that must be present below `--evidence-root`, as a regular file that is not empty with no symbolic link on the way. The files are never read.
- Reports as text, Markdown and JSON. `--explain` shows the facts of every gate with the file and line each came from, and the sentences of the saved pages it rests on. `--strict` makes a gate that is not checked a no-go. Exit code `0` for go, `1` for no-go and `2` for a usage or input error; an input that cannot be read stops the run with no verdict.
- Own small strict readers: an XML reader that refuses a DOCTYPE and expands no entity (only the five predefined entities and numeric references are read), a JSON reader that refuses a repeated key, a CSV reader written from RFC 4180 that refuses bad quoting with its line, a tracefile reader and a Cobertura reader. A file pattern matcher with `*`, `?` and `**` and no regular expression.
- Exact arithmetic: percentages have at most four decimals and are compared with whole numbers; a figure is shown cut down, never rounded up.
- Safe input: no link inside a result folder is followed, and none on the way to an evidence file; limits on files, folders, depth, bytes, elements, attributes, JSON values, CSV fields, records, tracefile sections and patterns; control, direction and line separator characters are removed from every text shown.
- Every quoted sentence comes from the ISTQB glossary, the geninfo manual page of lcov, the Cobertura DTD, the code of coverage.py, the Maven Surefire pages, RFC 4180, RFC 8259 and W3C XML 1.0, saved in `research/sources`; a test compares `src/data.js` and the documents with the saved text.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation.
