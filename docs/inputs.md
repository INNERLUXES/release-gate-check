# Inputs

The tool takes one criteria file and up to five kinds of evidence. Every input is a file or a folder on disk, named on the command line. The tool reads them as text. It never runs a test, never fetches anything a file names, never reads from standard input, and never writes a file.

| Option | What it is | Needed by |
| --- | --- | --- |
| `--criteria <file>` | the criteria, as JSON; required | every run |
| `--junit <path>` | the JUnit XML results of the release candidate: a file, or a folder; repeat for more | the test gates |
| `--history <path>` | an earlier run, oldest first: a file or a folder; repeat for more runs | `unexplained-failures` |
| `--coverage <file>` | an lcov tracefile or a Cobertura XML report; repeat for more | the coverage gates |
| `--changed <file>` | the files changed since the last release, one path a line | the gates on changed files |
| `--defects <file>` | the CSV export of the defects | the defect gates |
| `--evidence-root <dir>` | the folder the required evidence files are below; default: the current folder | `evidence-files` |

A path named on the command line may itself be a symbolic link, because the person who runs the tool named it. A path that looks like an address (`https://...`) is refused. An input that no gate of the criteria uses is not read, and a note says so; an input that a gate needs and that was not given makes that gate not checked, never met.

## The criteria file

One JSON object, written before the release. The reader is strict: RFC 8259 grammar with no comment and no trailing comma, an object that names a key twice is refused (RFC 8259: "When the names within an object are not unique, the behavior of software that receives such an object is unpredictable."), and values nested more than 32 deep, more than 100,000 values or strings over 4,096 characters are refused. The file may be at most 1 MB.

Every gate is optional and every key the tool does not know is an error, with the line and a suggestion for a near miss, so that a typo such as `minPasRate` cannot switch a gate off. A file that states no gate at all is an error: it would always say go. The tool has no threshold of its own; every number below comes from this file.

| Key | Value | Gate |
| --- | --- | --- |
| `name` | a text of up to 120 characters, shown in the report | none |
| `tests.minPassRate` | a percentage, 0 to 100, at most four decimals | `pass-rate` |
| `tests.maxSkippedShare` | a percentage | `skipped-share` |
| `tests.maxFlaky` | a whole number of 0 or more | `flaky-count` |
| `tests.criticalSuites.suites` | a list of suite names or class names | `critical-suites` |
| `tests.criticalSuites.maxFailing` | a whole number of 0 or more; needed with `suites` | `critical-suites` |
| `tests.noUnexplainedFailures.lastRuns` | a whole number from 1 to 100 | `unexplained-failures` |
| `tests.noUnexplainedFailures.explained` | a list of tests that are explained, as `class name > test name`; optional | `unexplained-failures` |
| `coverage.minLine`, `coverage.minBranch` | a percentage | `line-coverage`, `branch-coverage` |
| `coverage.exclude` | a list of file patterns left out of the overall coverage | the two gates above |
| `coverage.changedFiles.minLine`, `.minBranch` | a percentage | `changed-line-coverage`, `changed-branch-coverage` |
| `coverage.changedFiles.ignore` | a list of file patterns of changed files that need no coverage | the two gates above |
| `defects.columns.id`, `.severity`, `.status` | the names of the header columns; the defaults are `id`, `severity` and `status` | the defect gates |
| `defects.delimiter` | `,`, `;` or a tab; default `,` | the defect gates |
| `defects.closedStatuses` | a list of statuses that mean a defect is closed; required | the defect gates |
| `defects.maxOpen` | an object of severity names and the most open defects of each | `open-defects`, `defect-severity` |
| `defects.maxOpenTotal` | a whole number of 0 or more | `open-defects` |
| `evidence.required` | a list of files that must be present, as relative paths | `evidence-files` |

Some rules on the values:

- A percentage has at most four decimals and is compared with whole numbers, so 99.9 is not read as 99.89999999999999 and a ratio of 94.999 percent never meets a limit of 95.
- A file pattern has three wildcards: `*` is a run of characters inside one path part, `?` is one character, and a part that is exactly `**` is any number of parts. Patterns use forward slashes, never start with a slash and never hold a backslash. At most 20 patterns of 200 characters.
- An evidence path is relative, uses forward slashes, may not go up with `..` and may not name a folder. A drive letter, a leading slash and a backslash are refused on every system, so a criteria file means the same thing on Windows, Linux and macOS.
- Severity names are compared without case: `Blocker` and `blocker` are the same severity, and naming both is an error.

A complete example is [examples/criteria.json](../examples/criteria.json).

## The JUnit XML results

`--junit` names the results of the release candidate. A folder is walked with its subfolders and every file that ends in `.xml` is read; a file ending in `.xml` is read as it is; several `--junit` paths are merged into one run. `--history` names earlier runs, oldest first, one run for each path. The release candidate is the last run, so with `lastRuns` of 3 the gate looks at the candidate and the two newest `--history` runs.

- Each file is read with the tool's own strict XML reader (below). From each `testcase` the tool takes its class name (or the name of the nearest suite), its name, the line where it starts, its result and the retries Maven Surefire wrote into it. The time of a test is not read, because no gate uses it.
- A test is its class name and its name together. A test that appears more than once in a run (a runner that writes each retry as its own testcase) has one outcome: flaky when it both passed and failed, or passed after Surefire `flakyFailure` or `flakyError` elements; failed when every attempt failed and one is a failure; error when every attempt is an error; skipped when every attempt was skipped; passed otherwise. A skip next to a pass counts as a pass.
- Every file of a run must be readable. A file that is not well formed, has a DOCTYPE, is not UTF-8, holds binary data, is over the size limit or has another root than `testsuites` or `testsuite` stops the run with exit code `2` and a message that names each such file. The tool does not decide on results it only half read.
- Inside a folder every entry is looked at with `lstat`. A symbolic link or junction is listed in a note and never followed. Folders of tools and caches (`.git`, `.hg`, `.svn`, `node_modules`, `.cache`) are not entered. Files that do not end in `.xml` are counted and never opened. An entry that is not a file, a folder or a link is named in a note and never opened.
- A path whose folder holds no XML file is a run with no result: the gates that need results are not checked, and a note says so.

## The XML reader

The tool has its own small XML reader, written for result files and coverage reports and nothing else. It reads the text once, from left to right, and stops at the first thing that is not well formed, with the line and column:

- **The declaration.** An optional `<?xml ...?>` at the very start, with version 1.x and, when it names an encoding, UTF-8 or ASCII.
- **Elements and attributes.** Start tags, end tags and empty tags. An attribute needs `=` and a value in quotes; the same attribute twice, a `<` inside a value, or an end tag that does not match its start tag is refused.
- **Text and CDATA.** Only the first 4,096 characters of the text of one element are kept.
- **Comments and processing instructions** are skipped.
- **References.** The five predefined entities and numeric references are decoded, once, each into one character. XML says of them: "All XML processors MUST recognize these entities whether they are declared or not." Any other `&name;` is refused. A numeric reference to a character that XML does not allow is read as the replacement character and counted in a note; XML 1.0 asks for more ("Characters referred to using character references MUST match the production for Char."), and the tool is lenient on this one point so that one bad character in a log does not hide a whole suite.
- **No DTD.** A `<!DOCTYPE` anywhere is refused with a clear reason. The standard explains what it can do: "The document type declaration can point to an external subset (a special kind of external entity) containing markup declarations, or can contain the markup declarations directly in an internal subset, or can do both." The tool wants neither, so a DTD is never read, no external entity is fetched, and no entity can expand into another. A Cobertura report that has a DOCTYPE line is refused too; remove that line, because the tool never reads it.
- **Limits.** Elements nested at most 256 deep, at most 500,000 elements and 256 attributes per element, and names of at most 256 characters.

## The coverage files

`--coverage` takes lcov tracefiles and Cobertura XML reports, any number of them, in any mix. A file whose first character is `<` is read as Cobertura XML, every other file as lcov. The reports are merged by source file: a path is compared with forward slashes, without a leading `./` and without doubled slashes, and a line or a branch counts as covered when any report covers it.

- **lcov.** The tool counts from the `DA` records (one per instrumented line, with the count of executions) and the `BRDA` records (one per branch, with a taken value that is `-` when the branch was never evaluated, or a number). `LF`, `LH`, `BRF` and `BRH` are the sums that the writer put in; when they differ from what the records show, a note says so and the records are used. Records of other kinds (`TN`, `VER`, `FN`, `FNDA`, `FNF`, `FNH`, `MCDC` and more) are skipped. The branch of a `BRDA` record may hold commas, so the line and block are read from the front of the record and the taken value from the back. A malformed record, a record outside a section, a section with no `end_of_record` and a path with a control character are refused with the line.
- **Cobertura.** From each `class` the tool takes the `filename` and the `line` elements directly inside the `lines` element of the class; a line is covered when its `hits` are above zero. The `lines` of the methods are left out on purpose, because a class holds both a `methods` element and a `lines` element and the methods repeat lines of the class. A line with `branch="true"` gives its branches in `condition-coverage` as a percentage and the counts in brackets, for example `50% (1/2)`; the counts are what the tool uses. A branch line whose `condition-coverage` has no counts is kept apart, and a branch figure that would rest on it is not given.
- At most 100 coverage files, 100,000 source files in all, 5,000,000 `DA` records and 5,000,000 `BRDA` records.

## The list of changed files

`--changed` is a text file with one path a line, for example the output of `git diff --name-only` between the last release and the candidate. Blank lines and lines that start with `#` are skipped; a path with a control character or over 1,024 characters is refused with the line. A changed path matches a covered path when the two are equal, or when one ends with the other after a slash, so a coverage report that holds absolute paths, or paths below a source folder, still matches. A changed path that matches more than one covered file is named in the details of the gate. At most 100,000 changed files.

## The defect export

`--defects` is a CSV file, read as RFC 4180 describes the format: a header line, records, fields in double quotes that may hold the delimiter, line breaks and doubled quotes. The tool refuses a double quote inside a field that is not in quotes, text after a closing quote, a quote that is never closed and a record with another number of fields than the header, each with its line. LF, CRLF and a lone CR end a record; entirely empty lines are skipped; a leading byte order mark is dropped.

The three columns are found by the names in `defects.columns`, compared without case and without white space around them. A header that lacks one of them, or names one twice, stops the run with exit code `2`. A defect is closed when its status is in `closedStatuses`, compared without case; every other defect, including one with an empty status, is open. A defect id that appears twice counts once, from its first line, and a note says so. At most 1,000,000 records, 1,000 fields in a record and 65,536 characters in a field.

## The evidence folder

For `evidence.required` the tool looks at each path below `--evidence-root` with `lstat`, one part at a time, and never reads the file. A file counts as present when it is a regular file that is not empty and when no part of its path is a symbolic link. A missing file, an empty file, a folder, a file under a file and a symbolic link anywhere on the way are each named in the details of the gate. The evidence folder itself may be a link, because the person who runs the tool named it.

## Reading a file

- Each file is opened once, and its type and size are taken from the open file. A file over 32 MB is refused (1 MB for the criteria file); all the XML files read together may hold at most 512 MB.
- A file that starts with the byte order mark of UTF-16, and a file whose first 8,000 bytes hold a null byte, are refused.
- Text is read as UTF-8, and a leading byte order mark is dropped. LF, CRLF and a lone CR all end a line, so a file written on Windows and one written on Linux give the same report with the same lines.
- At most 100 `--history` runs, 50,000 files and folders in all, folders nested at most 32 deep and 10,000 XML files. Past a limit the input is refused with exit code `2`.
