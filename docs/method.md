# Method

The tool compares numbers read from evidence with numbers written in the criteria file, and says go or no-go. Every gate says what it checks, the rule it applies, what it can see and what it cannot, and the sentences of a saved page that it rests on. The pages are saved in [research/sources](../research/sources), and a test compares every quoted sentence with the saved text. Where the tool makes a choice that the pages do not state (how a flaky test counts, what happens to a changed file with no coverage record, how two reports are merged), the text says so.

The idea behind the whole tool is the definition in the ISTQB glossary: exit criteria are "The set of conditions for officially completing a defined task." The criteria are written before the release, in a file under review, so that the decision on the day is a comparison and not a negotiation. The tool has no threshold of its own: not a pass rate, not a coverage figure, not a count of defects. A number that the criteria do not state is not checked.

## Three outcomes, and what is never read as met

Each gate is one of:

- **met**: the evidence was given, the tool could read the number, and the number is on the right side of the limit in the criteria. A number exactly at the limit is met.
- **not met**: the evidence was given and the number is on the wrong side, or the evidence shows that something the criteria require is absent (a critical suite with no result, a changed file with no coverage record, a missing evidence file).
- **not checked**: the data the gate needs was not given, or cannot show the number (no test was executed, the coverage reports hold no branch data, fewer runs than the criteria ask for). The reason is in the report.

Missing data is never read as met. The decision is go when no gate is not met. With `--strict` a gate that is not checked is a no-go too. An input that cannot be read at all (a result file that is not well formed, a coverage file with a malformed record, a defect export without the named column) is not a gate at all: the run stops with exit code `2` and no verdict, because a decision on half-read evidence would be a guess.

Percentages are computed with whole numbers and shown cut down to two decimals, never rounded up, so a figure just under a limit is never shown as the limit.

`--explain` adds to every gate the facts it used, each with the file and line it came from, and the sentences it rests on. The same facts are always in the JSON report.

## Test results

The results are the JUnit XML files of the release candidate ([inputs.md](inputs.md) lists what is read). A test is its class name and its name together, and has one outcome per run: passed, failed, error, skipped or flaky. The Maven Surefire schema has the elements the reader relies on: `<xs:element name="testcase" minOccurs="0" maxOccurs="unbounded">` for the testcases of a suite, and `<xs:element name="skipped" nillable="true" minOccurs="0" maxOccurs="1">` for a skipped test.

### `pass-rate`

The share of executed tests that passed is at least `tests.minPassRate`. Executed tests are all distinct tests but the skipped ones; a flaky test counts as passed, because it did pass in the end, and the report says how many were counted so. It is not met when the share is below the limit, with the failed tests named. It is not checked when no `--junit` input was given, when the results hold no testcase, or when every test was skipped (a run in which nothing executed has no pass rate). The basis is the ISTQB definition of exit criteria and the testcase element of the Surefire schema. The tool cannot see whether the tests are good: a suite of tests that check nothing passes every time.

### `critical-suites`

At most `tests.criticalSuites.maxFailing` tests fail in the suites named in `tests.criticalSuites.suites`. A suite is found by the name of its `testsuite` element or by the class name of its tests, because many runners use the class as the suite. Failed and error tests are failing tests; a flaky test is not. It is not met when more tests fail than the limit allows, and also when a named suite has no result at all: a suite that did not run is not a suite that passed, and the report says so. It is not checked when there is no result input or the results are empty. The basis is the ISTQB definition and the `classname` attribute, `<xs:attribute name="classname" type="xs:string"/>`.

### `skipped-share`

The share of all distinct tests that were skipped is at most `tests.maxSkippedShare`. A skipped test did not check anything, so a release with many skips is a release with less evidence than it looks. It is not met when the share is above the limit, with the skipped tests named; it is not checked when the results hold no test. The tool cannot see why a test was skipped or for how long.

### `flaky-count`

At most `tests.maxFlaky` tests are flaky in the release candidate run. A test is flaky when it passed and failed within the run (a runner that retries and writes each attempt as a testcase), or when it passed with Surefire `flakyFailure` or `flakyError` elements. The Surefire page says of such a test: "Then this test will be counted as a flaky test." and offers the same limit as an option: "This will fail the build if more than the specified number of tests are flaky, i.e. if they had a successful run after previously failing." The tool reads the results of one run, so it sees only the flakiness the runner wrote down; a runner that retries and keeps only the last attempt hides it. Recognizing a flaky test across several runs of the same code needs those runs, and is outside this tool.

### `unexplained-failures`

No test failed in the last `tests.noUnexplainedFailures.lastRuns` runs unless it is named in `explained`. The runs are the release candidate and the newest `--history` runs, so with 3 the gate looks at the candidate and two earlier runs. A test counts as failed in a run when its outcome is failed or error; a flaky test does not. A test is explained by its label, `class name > test name`, exactly as the report shows it. The point is a failure that appeared and went away without anyone saying why. It is not met when such a test exists, with the runs in which it failed; it is not checked when there is no result input, or when fewer runs than `lastRuns` were given, because a window that is not full cannot show that nothing failed in it. The meaning of explained is the team's: the criteria file lists the tests, and the review of that list is the review of the criteria. The tool cannot see whether an explanation is true.

## Coverage

The coverage files are lcov tracefiles and Cobertura XML reports ([inputs.md](inputs.md)). The ISTQB glossary defines coverage as "The degree to which specified coverage items are exercised by a test suite, expressed as a percentage." and branch coverage as "The coverage of branches in a control flow graph." What a coverage item is comes from the report: a line with a count of executions, and a branch.

A line is covered when its count of executions is above zero in any report. In lcov a line is a `DA` record, `DA:<line number>,<execution count>[,<checksum>]`; a branch is a `BRDA` record, `BRDA:<line_number>,[<exception>]<block>,<branch>,<taken>`, where `<taken>` is "either '-' if the corresponding expression was never evaluated (e.g., the basic block containing the branch was never executed) or a number indicating how often that branch was taken." A branch is covered when its taken value is a number above zero. In Cobertura a line is a `line` element, with `<!ATTLIST line number CDATA #REQUIRED>` and `<!ATTLIST line hits CDATA #REQUIRED>` in the DTD, and the branches of a line are in `condition-coverage`, for example `50% (1/2)`, the form coverage.py writes: `f"{100 * taken // total}% ({taken}/{total})",`. A report that holds no line gives no line coverage; the tool never reads an empty report as complete.

Choices of the tool: reports are merged by source file and a line or branch is covered when any report covers it (the same file can come from a unit run and an integration run); the sums are counted from the records and not from `LF`, `LH`, `BRF` and `BRH`; and the lines of Cobertura methods are left out so that no line is counted twice.

### `line-coverage`

The share of covered lines over all files of the reports, but the files that match `coverage.exclude`, is at least `coverage.minLine`. The report shows how many files the exclude patterns removed, so a gate that is made easy by a wide pattern is visible. It is not met when the share is below the limit, with the files of lowest coverage named; it is not checked when no `--coverage` input was given or the reports hold no line. The tool cannot see whether the covered lines are checked by an assertion: a line that runs is covered, whether or not a test asserts anything about it.

### `branch-coverage`

The share of covered branches over the same files is at least `coverage.minBranch`. It is not checked when no coverage was given; when the reports hold no branch data (the tool that wrote them may not have been asked for branches, and a report with no branch data is not a report with no branches); and when a Cobertura line is marked as a branch but has no readable counts, because the figure would then rest on a guess.

### `changed-line-coverage`

The share of covered lines in the changed files is at least `coverage.changedFiles.minLine`. The changed files come from `--changed`, and each is matched with a covered file by its path ([inputs.md](inputs.md)); the files that match `coverage.changedFiles.ignore` are removed first, and the report counts them. Two choices of the tool: a changed file with no coverage record is not counted as covered and is not skipped either, it makes the gate not met, because new code that no test ever loaded is the case this gate is for (list a file that holds no code in `ignore`); and a changed path that two covered files match is named in the details, with both files counted. The gate is not checked when no `--coverage` or no `--changed` input was given, when nothing is left after `ignore`, and when the changed files hold no line to count in the reports.

### `changed-branch-coverage`

The same for branches, with `coverage.changedFiles.minBranch`: the share of covered branches in the changed files is at least the limit, a changed file with no coverage record makes the gate not met, and the gate is not checked when no coverage or no changed list was given, when nothing is left after `ignore`, when the changed files hold no branch data, and when a Cobertura line of a changed file is marked as a branch but has no readable counts.

## Open defects

The defects are the rows of the CSV export. The ISTQB glossary defines a defect as "An imperfection or deficiency in a work product where it does not meet its requirements or specifications or impairs its intended use." and severity as "The degree of impact that a defect has on the development, testing or operation of a component or system." The export carries the severity and the status; which statuses mean closed is stated in the criteria, because every tracker has its own.

### `open-defects`

One gate for each severity in `defects.maxOpen` (shown as `open-defects:blocker`), and one for the total in `defects.maxOpenTotal` (`open-defects:total`). A gate is met when the number of open defects of that severity, or in all, is at most its limit. Severities are compared without case. A defect is open unless its status is in `closedStatuses`, so a status the criteria do not know, or an empty one, is open: the gate errs toward the open side. A severity that is not named in `maxOpen` has no limit of its own, and its defects count only in the total. The gates are not checked when no `--defects` input was given. The tool cannot see whether the severity in the export is the right one, or whether a defect marked closed is really fixed.

### `defect-severity`

When `defects.maxOpen` is stated, every open defect has a severity. A defect with no severity cannot be shown to be within the limits by severity, so the gate is not met and the defects are named. This gate is added by the tool because the limits by severity would otherwise pass over a defect with an empty severity; it states no number.

## Evidence

### `evidence-files`

Every file in `evidence.required` is present below the evidence folder: a regular file that is not empty, with no symbolic link on the way. The ISTQB definition of exit criteria is the basis, and a signed test report or an approved release note is a condition in that set. The tool looks at the file and never reads it, so it cannot see whether a report is signed, current or true; it sees that the file the criteria name is there. It is met when every file is present, and not met when any one is missing, empty, not a regular file or behind a link, with each named in the details.

## The text of a report

Every text that comes from a file (a test name, a suite name, a path, a defect id, a severity, a message, a name in the criteria) has control characters, line and paragraph separators and Unicode direction controls replaced by a space, and its length capped, before it reaches a report or an error message. Markdown cells escape pipes, backslashes, square brackets, backticks, asterisks, underscores, line breaks and `<`, `>` and `&`.
