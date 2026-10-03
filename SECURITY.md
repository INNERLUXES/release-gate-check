# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "release-gate-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up input that shows the problem, what you expected and what happened. Use made-up test names, defect ids and paths, and never a real key, token or password, even a revoked one.

## Scope

In scope:

- an XML file (a result file or a Cobertura report) that makes the tool expand an entity, read a DTD, or fetch or open an external entity, a schema or any other address named in the file
- an input that makes the tool run a test, load a module, or run a program
- a folder that makes the tool follow a symbolic link or a junction inside it, or read a file outside the paths it was given
- a criteria file whose evidence path makes the tool look at a file outside the evidence folder, or count a symbolic link as evidence
- an input that makes the tool hang, take very long, or use unbounded memory, such as a very large file, very many files, runs, records or changed paths, deep folders, elements or JSON values nested very deep, a tag, a comment, a quote or a CDATA section that is never closed, thousands of attributes or fields, a glob pattern or a path that makes matching slow, or a sum written as a number of thousands of digits
- text from a file name, a test name, a suite name, a defect id, a severity or a message that breaks a Markdown table, rewrites the terminal through control or direction characters, or is shown unescaped in a report
- a name such as `__proto__` that changes how objects behave inside the tool
- an input that the tool fails to read and passes over without a note or an error
- a gate that is reported as met when its evidence is missing, or when the number is on the wrong side of the limit in the criteria, or that treats a percentage just under a limit as the limit
- a criteria file with an unknown key, or a key named twice, that the tool accepts
- a sentence in src/data.js that differs from the saved page in research/sources

Out of scope: whether the criteria are good, what the evidence cannot show (docs/limits.md lists it), whether the tests themselves are good, the safety of the test runner or the coverage tool that wrote the files, who may change the criteria file in your repository, and how your pipeline stores the reports.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
