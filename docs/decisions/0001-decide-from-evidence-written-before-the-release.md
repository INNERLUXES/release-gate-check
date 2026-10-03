# 1. Decide from evidence, against criteria written before the release

## Context

A release is decided once, and the pressure is highest at that moment. The build is late, a customer is waiting, and every red number has an explanation. A decision made then tends to move the threshold to where the numbers are. The ISTQB glossary calls the thing that prevents this exit criteria: "The set of conditions for officially completing a defined task." The condition has to exist before the task is nearly finished, or it is not a condition.

The evidence for a release is already written by the tools of the pipeline: JUnit XML results from the test runner, lcov or Cobertura coverage from the coverage tool, a CSV export from the defect tracker, and files such as a signed test report that a person produced. Today a person reads these, in four places, and says go.

Result files and coverage reports are also a place for an attack on a reader. They come from test code, which may come from an unreviewed branch, and a general XML library that reads a DTD can be made to expand entities without end or read a secret file into its output. A criteria file is a place for a mistake: a misspelled key switches a gate off, a JSON object that names a key twice gives two numbers to two readers, and a percentage rounded the wrong way lets a release through.

## Decision

The tool compares the numbers in the evidence with the numbers in a criteria file and says go or no-go, with the reason for every gate. It has no threshold of its own: every number is in the criteria file, so the decision is the comparison of two sets of numbers that people wrote at different times, and the second set never changes the first. Each gate is met, not met or not checked. Missing data is never met. The run exits with `0` for go, `1` for no-go and `2` when the input cannot be read, and with `--strict` a gate that is not checked is a no-go.

It reads files and never runs a test. It has its own small, strict readers: an XML reader with no DTD support, which refuses a DOCTYPE and reads only the five predefined entities and numeric references; a JSON reader that refuses an object with a repeated key; a CSV reader written from RFC 4180 that refuses bad quoting with its line; and readers for lcov and Cobertura that count from the records themselves. So it needs no dependency, no build and no network, and it opens only the files it is given. It follows no symbolic link inside a folder.

An input that cannot be read stops the run with exit code `2` and no verdict. A gate that cannot be decided because the evidence is absent or cannot show the number is not checked. A gate that is decided because the evidence shows an absence (a critical suite with no result, a changed file with no coverage record, a missing evidence file) is not met. The difference is on purpose: not having data is a gap in the pipeline, and data that shows a hole is a finding.

Every sentence it quotes comes from a page saved with its address in research/sources: the ISTQB glossary, the geninfo manual page of lcov, the Cobertura DTD, the code of coverage.py, the Maven Surefire pages, RFC 4180 and RFC 8259, and three sections of W3C XML 1.0. A test compares the code and the documents with the saved text. Where the tool makes its own choice (the three outcomes, how a flaky test counts, how reports are merged, what happens to a changed file with no coverage record, an unlisted defect status being open), the documents say so.

## Consequences

The decision runs in a second on Linux, macOS or Windows with only Node: no build, no services, no account and no network, and no input can make it run code, expand an entity or reach out to a host. It can be the last step of a pipeline, and its exit code is the gate. The report says which number came from which file and line, so a no-go can be argued with facts, and a go can be audited later.

The cost is that the tool is only as good as the criteria. It cannot see whether the tests are good, whether the threshold is right, or whether a file is true. docs/limits.md lists these. The criteria file is code under review, and docs/secure-defaults.md says how to protect it: a code owner for the file, a separate pull request for every change, and the Git history as the record of how the exit criteria moved.
