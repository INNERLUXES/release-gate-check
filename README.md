# release-gate-check

Decides go or no-go for a release against exit criteria that were written before the release, and explains every reason. You write the criteria in one JSON file: the minimum pass rate, no failing test in the critical suites, the largest share of skipped tests, the most flaky tests, the minimum line and branch coverage overall and for the files changed since the last release, the most open defects of each severity, and the evidence files that must be there, such as a signed test report. The tool reads the evidence that the pipeline already writes (JUnit XML results, an lcov or Cobertura coverage report, a CSV export of the open defects, and the evidence folder) and compares it, gate by gate, with the numbers in your file. Each gate is met, not met or not checked, with the file and line each number came from.

A release decision made on the last day bends to the numbers. The build is late, a customer is waiting, and every red figure has an explanation, so the threshold moves to where the result is. Exit criteria exist to stop that: the ISTQB glossary defines them as "The set of conditions for officially completing a defined task." They only work when they are written before the task is nearly finished, in a file that people review, and when the decision on the day is a comparison and not a negotiation. This tool makes it a comparison. It never decides on a gate it has no data for: missing data is not checked, never met, and with `--strict` it is a no-go.

- **No built-in thresholds.** There are no defaults for a pass rate, a coverage figure or a count of defects. Every number comes from your criteria file, and a gate the file does not state is not run. The only defaults are the names of the defect columns (`id`, `severity`, `status`) and the delimiter of the CSV file (a comma).
- **Three outcomes, and missing is never met.** A gate whose input was not given, or cannot show the number, is not checked. A critical suite with no result, a changed file with no coverage record and a missing evidence file are not met. A key that the tool does not know, in your criteria file, is an error, so a typo cannot switch a gate off.
- **Every reason is explained.** Each gate shows its requirement, what was found, why it is not met, and the items behind it. `--explain` adds the facts it used, each with the file and line it came from, and the sentences of the saved pages it rests on.
- **Nothing runs.** The files are read with the tool's own small, strict readers: no test is run, no DTD is read, no entity is expanded beyond the five that XML predefines and numeric references, a file with a DOCTYPE is refused, a JSON object with a repeated key is refused, bad CSV quoting is refused with its line, and no symbolic link inside a folder is followed. [docs/limits.md](docs/limits.md) says what the evidence cannot show, starting with the main thing: the tool cannot see whether your criteria are right or your tests are good.
- Reports as text, Markdown and JSON, with an exit code for a pipeline gate: `0` go, `1` no-go, `2` usage or input error.
- Plain JavaScript, no dependencies; the same files always give the same report, with LF or CRLF line ends.

```
npm test
```

```
tests 398
pass 392
fail 0
skipped 6
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a system other than Windows, or a privilege: a symbolic link out of a result folder and in a loop, a folder or a file named through a link, a device behind a link, an evidence file behind a link, a file name with a control character, and a file name with a backslash. They are guarded with `process.platform`, and run on Linux and macOS; the one test that needs Windows is skipped elsewhere.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/release-gate-check.git
cd release-gate-check
node bin/release-gate-check.js --criteria examples/criteria.json --junit examples/blocked/results --coverage examples/blocked/coverage/lcov.info
```

Or without a clone, on the evidence of your own pipeline:

```
npx --yes github:INNERLUXES/release-gate-check --criteria release/criteria.json --junit reports/junit --coverage reports/lcov.info --defects reports/defects.csv --strict
```

`examples/` holds the made-up evidence of the booking service of a small bike rental shop, release 2.4, and one criteria file for both. `examples/blocked/` is wrong on purpose. A booking test fails, a deposit test passed only after a retry, two fleet tests are skipped, a booking test failed in an earlier run and nobody explained it, the branch coverage is under the limit, a new source file has no coverage record at all, a blocker and a critical defect are open together with four major ones, and one approved evidence file is missing. `examples/ready/` is the same service ready to ship: every gate is met, with one lcov report and one Cobertura report merged.

## Usage

```
node bin/release-gate-check.js --criteria examples/criteria.json --junit examples/blocked/results --history examples/blocked/history/run-1 --history examples/blocked/history/run-2 --coverage examples/blocked/coverage/lcov.info --changed examples/blocked/changed-files.txt --defects examples/blocked/defects.csv --evidence-root examples/blocked/evidence
```

The report starts with what was read and the count of gates, then every gate, grouped by area. The first part of it:

```
release-gate-check: examples/criteria.json (Bike rental booking service, release 2.4)
inputs: results: 3 files, 30 testcases, 30 distinct tests; 2 earlier runs; coverage: 1 report, 4 source files; 4 changed files; 15 defects; evidence folder examples/blocked/evidence
gates: 3 met, 12 not met, 0 not checked

Test results (5 gates)

  NOT MET      pass-rate  Minimum pass rate
               requirement: at least 98% of the executed tests pass
               found: 96.42% (27 of 28 executed tests passed, 1 flaky test counted as passed)
               why: 1 test failed or had an error
               - failed: rental.booking.BookingTest > createsBookingForTwoBikes

  NOT MET      critical-suites  Failing tests in critical suites
               requirement: at most 0 failing tests in rental.booking.BookingTest and rental.payment.DepositTest
               found: 1 failing in 2 suites with results
               why: 1 failing test, above 0
               - failed: rental.booking.BookingTest > createsBookingForTwoBikes

  NOT MET      skipped-share  Maximum skipped share
               requirement: at most 5% of the tests skipped
               found: 6.66% (2 of 30 tests skipped)
               why: too many tests were skipped
               - rental.fleet.AvailabilityTest > readsTheLiveFeed
               - rental.fleet.AvailabilityTest > fallsBackToTheLastFeed

  NOT MET      flaky-count  Maximum flaky tests
               requirement: at most 0 flaky tests
               found: 1 flaky test
               why: 1 test passed and failed in one run, or passed after a retry
               - rental.payment.DepositTest > refundsDepositAfterReturn

  NOT MET      unexplained-failures  No unexplained failure in the last runs
               requirement: no test failed in the last 3 runs unless it is explained (1 test explained)
               found: 2 unexplained failing tests in 3 runs
               why: a test failed in a recent run and nobody has explained it
               - rental.booking.BookingTest > cancelsBookingWithinOneHour (failed in run-1)
               - rental.booking.BookingTest > createsBookingForTwoBikes (failed in release candidate)
```

The whole report is in [examples/output/blocked.txt](examples/output/blocked.txt). It ends with `DECISION: NO-GO - 12 gates not met`, and the exit code is `1`. Three gates are met: the overall line coverage, the total of open defects, and the rule that every open defect has a severity. `--explain` shows where each number came from; for the changed files:

```
  NOT MET      changed-line-coverage  Minimum line coverage of changed files
               requirement: at least 90% of the lines of changed files covered
               found: 1 changed file with no coverage record
               why: a changed file with no coverage record is not counted as covered; add it to coverage.changedFiles.ignore only when it holds no code
               - no coverage record: src/fleet/new-search.js
               from: examples/blocked/changed-files.txt:2  changed: src/booking/booking.js -> src/booking/booking.js
               from: examples/blocked/changed-files.txt:3  changed: src/fleet/availability.js -> src/fleet/availability.js
               from: examples/blocked/changed-files.txt:4  changed: src/fleet/new-search.js -> no coverage record
               from: examples/blocked/coverage/lcov.info:2  src/booking/booking.js: 18 of 20 lines covered
               from: examples/blocked/coverage/lcov.info:65  src/fleet/availability.js: 17 of 25 lines covered
               basis: "The degree to which specified coverage items are exercised by a test suite, expressed as a percentage." (coverage, https://glossary.istqb.org/en_US/term/coverage)
               basis: "SF:<path to the source file>" (TRACEFILE FORMAT, https://manpages.debian.org/testing/lcov/geninfo.1.en.html)
```

The release that is ready to ship passes, and `--strict` changes nothing, because every gate was checked:

```
node bin/release-gate-check.js --criteria examples/criteria.json --junit examples/ready/results --history examples/ready/history/run-1 --history examples/ready/history/run-2 --coverage examples/ready/coverage/lcov.info --coverage examples/ready/coverage/cobertura.xml --changed examples/ready/changed-files.txt --defects examples/ready/defects.csv --evidence-root examples/ready/evidence --strict
```

```
Evidence (1 gate)

  MET          evidence-files  Required evidence files
               requirement: 2 required files present
               found: 2 of 2 present

DECISION: GO
```

Leave an input out and its gates are not checked. Without the defect export the ready release is still a go, with five gates named as not checked; with `--strict` it is a no-go:

```
DECISION: NO-GO - 5 gates not checked (--strict)
```

[examples/output](examples/output) holds the blocked release as text, with `--explain`, as Markdown and as JSON, and the ready release as text.

```
release-gate-check --criteria <file> [inputs] [options]
```

```
--criteria <file>      the criteria file (JSON); required
--junit <path>         JUnit XML results of the release candidate: a file, or a folder; repeat
--history <path>       an earlier run, oldest first; repeat
--coverage <file>      an lcov tracefile or a Cobertura XML report; repeat
--changed <file>       the files changed since the last release, one path a line
--defects <file>       the CSV export of the defects
--evidence-root <dir>  the folder the required evidence files are below (default: the current folder)
--format <name>        text, markdown or json (default: text)
--strict               a gate that is not checked counts as no-go
--explain              show the facts of every gate with the file and line each came from
--help                 show the usage
--version              show the version
```

Every input is a file or a folder on disk. A folder given to `--junit` is read with its subfolders, and several `--junit` paths are one run. `--history` takes earlier runs, oldest first, for the gate on failures in the last runs. Paths in the report are relative to the folder you run the command in, with forward slashes on every system.

## The criteria file

[docs/inputs.md](docs/inputs.md) has every key. A complete example is [examples/criteria.json](examples/criteria.json). Every gate is optional.

```json
{
  "name": "Bike rental booking service, release 2.4",
  "tests": {
    "minPassRate": 98,
    "maxSkippedShare": 5,
    "maxFlaky": 0,
    "criticalSuites": { "suites": ["rental.booking.BookingTest"], "maxFailing": 0 },
    "noUnexplainedFailures": { "lastRuns": 3, "explained": ["rental.fleet.AvailabilityTest > showsBikesNearStation"] }
  },
  "coverage": {
    "minLine": 80,
    "minBranch": 70,
    "exclude": ["src/vendored/**"],
    "changedFiles": { "minLine": 90, "minBranch": 60, "ignore": ["docs/**", "*.md"] }
  },
  "defects": {
    "columns": { "id": "Key", "severity": "Priority", "status": "State" },
    "closedStatuses": ["Done", "Closed", "Rejected"],
    "maxOpen": { "blocker": 0, "critical": 0, "major": 3 },
    "maxOpenTotal": 15
  },
  "evidence": { "required": ["reports/signed-test-report.txt"] }
}
```

| Gate | Key | Met when |
| --- | --- | --- |
| `pass-rate` | `tests.minPassRate` | the share of executed tests that passed is at least the limit |
| `critical-suites` | `tests.criticalSuites` | at most `maxFailing` tests fail in the named suites, and every named suite has a result |
| `skipped-share` | `tests.maxSkippedShare` | the share of skipped tests is at most the limit |
| `flaky-count` | `tests.maxFlaky` | at most that many tests are flaky in the release candidate run |
| `unexplained-failures` | `tests.noUnexplainedFailures` | no test failed in the last runs unless the criteria explain it |
| `line-coverage` | `coverage.minLine` | the covered share of lines, but the excluded files, is at least the limit |
| `branch-coverage` | `coverage.minBranch` | the covered share of branches is at least the limit |
| `changed-line-coverage` | `coverage.changedFiles.minLine` | the covered share of lines in the changed files is at least the limit, and every changed file has a coverage record |
| `changed-branch-coverage` | `coverage.changedFiles.minBranch` | the same for branches |
| `open-defects` | `defects.maxOpen`, `defects.maxOpenTotal` | the open defects of each severity, and in all, are at most their limits |
| `defect-severity` | `defects.maxOpen` | every open defect has a severity |
| `evidence-files` | `evidence.required` | every file is present below the evidence folder, not empty and not behind a link |

[docs/method.md](docs/method.md) gives each gate, its exact rule, when it is not checked, what it can see and what it cannot. [docs/rules-and-sources.md](docs/rules-and-sources.md) lists every quoted sentence with the saved page it comes from.

## What is read

[docs/inputs.md](docs/inputs.md) has the details.

| Input | What the tool takes from it |
| --- | --- |
| JUnit XML (`--junit`, `--history`) | every `testcase` with its class name, name, result and line, and the retries that Maven Surefire writes into one testcase; a folder is walked without following links |
| lcov tracefile (`--coverage`) | the `DA` records for lines and the `BRDA` records for branches, by `SF` file; `LF`, `LH`, `BRF` and `BRH` are compared and a note says when they differ |
| Cobertura XML (`--coverage`) | the `line` elements of each class by `filename`, with `hits` and the counts in `condition-coverage`; the lines of the methods are left out |
| the list of changed files (`--changed`) | one path a line, matched with the covered files by their paths |
| CSV export of defects (`--defects`) | the id, the severity and the status, in the columns the criteria name; RFC 4180 quoting, refused with the line when it is wrong |
| the evidence folder (`--evidence-root`) | whether each required file is a regular file that is not empty, with no link on the way; the files are never read |
| a DOCTYPE, or an entity that is not predefined | refused: the file is named and the run stops |

## Formats

- `text`: for a terminal: the criteria and the inputs, the count of gates, then every gate with its requirement, what was found, why, the items behind it, and the decision. With `--explain` also the facts with their file and line, and the sentences each gate rests on.
- `markdown`: the same for a pull request comment or the job summary, with a table of the gates. Pipes, square brackets, backticks, asterisks, underscores, line breaks and angle brackets from the input are escaped, so a test name cannot break a table, make a link or be read as HTML.
- `json`: the whole report: the criteria file and name, the inputs, every gate with id, area, status, requirement, found, reason, details, facts with their place, and the basis with the address of the saved page, the counts, the decision and the notes. The facts and the basis are always in the JSON.

To put the decision in the job summary of a GitHub Actions run, and stop the pipeline on a no-go:

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  # run the tests and the coverage, and export the open defects, into reports/ here
  - name: Release gate in the job summary
    run: npx --yes github:INNERLUXES/release-gate-check --criteria release/criteria.json --junit reports/junit --coverage reports/lcov.info --defects reports/defects.csv --format markdown >> "$GITHUB_STEP_SUMMARY"
  - name: Release gate
    run: npx --yes github:INNERLUXES/release-gate-check --criteria release/criteria.json --junit reports/junit --coverage reports/lcov.info --defects reports/defects.csv --strict
```

It needs no secrets and no network beyond the download; a Linux runner is enough. [docs/secure-defaults.md](docs/secure-defaults.md) says how to protect the criteria file with a code owner, and how to write criteria that fail closed.

## Exit codes

`0` go: no gate is not met, and with `--strict` every gate was checked. `1` no-go: at least one gate is not met, or with `--strict` is not checked. `2` a usage or input error: no criteria file, a criteria file with an unknown key or no gate, a path that does not exist, an input that is not readable (a result file that is not well formed or has a DOCTYPE, a coverage file with a malformed record, a defect export with bad quoting or without the named column), an input over the limits, an unknown option. With exit code `2` the tool makes no decision and prints the problems on standard error.

## Architecture

Plain ES modules in `src/`, with no dependencies. Each reader is one file, written for its format and nothing else, and `src/check.js` is the only place that puts them together.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the criteria and the inputs, evaluates the gates, builds the report |
| `src/criteria.js` | validates the criteria file against the known keys and builds its normal form |
| `src/gates.js` | the gates: one number from the evidence against one number from the criteria |
| `src/xml.js` | the strict XML reader: no DOCTYPE, no entity but the five predefined ones |
| `src/json.js` | the strict JSON reader: refuses a repeated key, keeps the line of every value |
| `src/csv.js`, `src/defects.js` | the RFC 4180 reader, and the defect rows with open and closed |
| `src/lcov.js`, `src/cobertura.js`, `src/coverage.js` | the two coverage readers, and the store that merges them and matches changed paths |
| `src/junit.js` | the testcases of a result file and the outcome of each test in a run |
| `src/glob.js`, `src/ratio.js` | the file patterns without a regular expression, and exact percentages |
| `src/files.js` | bounded reading, the folder walk with `lstat`, the evidence check |
| `src/report.js`, `src/text.js`, `src/size.js` | the text, Markdown and JSON reports, the cleaning of text from the input, number formats |
| `src/data.js` | the sentences and lists that the gates rest on, compared with the saved pages in `research/sources` |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| What exit criteria, a defect, severity, coverage and branch coverage are | ISTQB Glossary, https://glossary.istqb.org/ |
| The records of a tracefile | lcov, geninfo(1), https://manpages.debian.org/testing/lcov/geninfo.1.en.html |
| The elements of a Cobertura report | Cobertura, https://raw.githubusercontent.com/cobertura/web/master/htdocs/xml/coverage-04.dtd |
| The condition-coverage text with its counts | coverage.py, https://raw.githubusercontent.com/nedbat/coveragepy/master/coverage/xmlreport.py |
| The elements of a test report, and flaky tests | Maven Surefire, https://maven.apache.org/surefire/maven-surefire-plugin/ |
| The CSV format | RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 |
| Repeated names in a JSON object | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |
| The document type declaration, references and the five predefined entities | W3C XML 1.0, https://www.w3.org/TR/xml/ |

## Limits

The tool reads evidence; it never sees the code and never runs a test. It cannot see whether your criteria are right: with a pass rate of 50 percent and nothing else it says go for a release that fails half its tests, so the review of the criteria file, before the release, is the review that matters. It cannot see whether the tests are good, whether a report is true, or whether a severity in the tracker is the right one. Coverage from different tools is counted differently, and changed paths may not line up with covered paths. A clean go is a comparison that came out right, not a proof that the release is good. [docs/limits.md](docs/limits.md) lists these, with the size limits.

## Background

How a QA engagement sets release criteria and release gates, and checks them on every build, is described on the page [Software Quality Assurance Services and QA Consulting](https://innerluxes.dev/software-testing/qa).

## License

MIT
