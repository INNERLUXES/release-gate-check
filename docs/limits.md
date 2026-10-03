# Limits

## Evidence only

The tool reads the files that test runners, coverage tools and trackers write, and compares numbers in them with the numbers in the criteria file. It never runs a test, never reads the code, never opens the tracker and never asks a person. A go means that every gate that was checked is met and, with `--strict`, that every gate was checked. It does not mean the release is good. [decisions/0001-decide-from-evidence-written-before-the-release.md](decisions/0001-decide-from-evidence-written-before-the-release.md) says why the decision is a comparison against criteria written first.

## What the gates cannot see

- **Whether the criteria are right.** The tool has no threshold of its own. A criteria file with a pass rate of 50 percent and no other gate gives a go for a release that fails half its tests. The review of the criteria file, before the release, is the review that matters; the tool refuses a file with no gate and a file with a key it does not know, and nothing more.
- **Whether the tests are good.** A pass rate is a count of tests that passed. A test that checks nothing passes every time, and a line that runs is covered whether or not an assertion looks at it. Pass rate and coverage show that tests ran and code ran, not that the product is right.
- **What is not in the evidence.** A change that no test covers, a risk nobody wrote a defect for, a customer who is waiting for something: none of it is in the files. The tool decides on what it was given.
- **Whether a file is true.** A result file, a coverage report, a defect export and an evidence file are taken as they are. The tool cannot see that a report was edited, that a signature is real, or that a defect marked closed was fixed. `evidence-files` sees that a file is present and not empty, and never reads it.
- **Retries that leave no trace.** A flaky test is seen only when the runner writes it: Surefire's `flakyFailure` and `flakyError` elements, or the same test written twice in one run with different results. A runner that retries a test and writes only the last attempt hides the failure, and the tool sees a pass.
- **Tests across runs by name.** A test is its class name and its name. A test that was renamed is two tests. Tests with a changing value in their name (a seed, a time) never line up across runs, which matters for `unexplained-failures`.
- **The meaning of explained.** `unexplained-failures` takes the list of explained tests from the criteria. It cannot see whether an explanation was written down, or whether it was right.
- **Coverage from different tools.** lcov and Cobertura writers count lines and branches in their own ways: an exception branch, the lines of vendored code. The tool counts what the report contains, merges by source file, and cannot compare one tool with another. Statically true or false branches, and the lines a tool leaves out, are decided by the tool that wrote the report.
- **Paths that do not line up.** Changed files are matched to covered files by their paths: equal, or one ending with the other after a slash. Coverage reports from a container with another folder layout, or a changed list from a repository with a prefix, can still fail to match, and then `changed-line-coverage` is not met, with the files named. Two covered files that both match one changed path are both counted, and the details say so.
- **Branch data that is not there.** A coverage run that was not asked for branches has none, and `branch-coverage` is not checked, which is not the same as no branches. A Cobertura line marked as a branch with no counts in brackets makes the branch gates not checked.
- **Severity and status in the tracker.** The tool trusts the severity and the status in the export. A defect with no severity is reported, and a status the criteria do not list as closed counts as open, but a wrong severity is not seen.
- **A DOCTYPE in a coverage report.** A Cobertura report that has a DOCTYPE line is refused, because the tool reads no DTD; remove the line first.

## Not met and not checked

A gate that is not checked is a gate the tool could not decide: the input was not given, or the input cannot show the number. Without `--strict` it does not stop a go, so that a pipeline can start with the gates it has the data for. With `--strict` it does. A team that wants every gate decided on every release runs with `--strict` from the first day, and a team that is adding evidence step by step starts without it and moves to it when the evidence is complete. Either way the report names every gate that was not checked and why.

## Size and counts

- A criteria file over 1 MB, a coverage file, a defect export or a result file over 32 MB, or XML files that together hold more than 512 MB, is refused.
- More than 100 `--history` runs, 100 coverage files, 50,000 files and folders in all, folders nested more than 32 deep, or more than 10,000 XML files is refused with exit code `2`.
- Elements nested more than 256 deep, more than 500,000 elements in one file, more than 256 attributes on one element, or a name longer than 256 characters make an XML file unreadable.
- More than 100,000 source files in the coverage reports, 5,000,000 `DA` records, 5,000,000 `BRDA` records, 100,000 changed files, 1,000,000 defect records, 1,000 fields in a defect record or a field over 65,536 characters is refused.
- JSON nested more than 32 deep, with more than 100,000 values or a string over 4,096 characters is refused.
- A gate names its first 8 items in the details and keeps its first 200 facts for `--explain`; the report says how many more there are.
- Text from the input shown in a report is cut to a fixed length: 160 characters for a test name in a detail, 400 for a fact, 600 for a requirement or a reason.

Every limit is reported as an input error with exit code `2` or as a count in the report, so a cut is never silent.
