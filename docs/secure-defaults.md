# Secure defaults

The default run is the safe run. Nothing in the first two sections needs a flag, and none of it can be switched off. The rest of the document is about the parts that the tool cannot do for you: running it in a pipeline, protecting the criteria file, and writing criteria that fail closed.

## How the tool behaves by default

- **No threshold of its own.** Every number comes from the criteria file. The tool cannot be talked into a pass rate, a coverage figure or a count of defects that the criteria do not state, and a gate the criteria do not state is not run. There is no mode that relaxes a gate, no flag that raises a limit and no environment variable that changes a number.
- **Missing data is never met.** A gate whose input was not given, or cannot show the number, is not checked and says why. A critical suite with no result, a changed file with no coverage record and a missing evidence file are not met. An empty report is never read as complete. There is no option to treat missing data as met.
- **Unknown keys are errors.** A key in the criteria file that the tool does not know stops the run, with its line and a suggestion, so a typo cannot switch a gate off. A criteria file with no gate stops the run too. A key named twice stops the run.
- **Evidence that cannot be read stops the run.** A result file that is not well formed, a coverage file with a malformed record, a defect export that lacks the named column or has bad quoting, a file over the size limit: each is exit code `2` with the files named and no verdict. A decision on half-read evidence is a guess, and the tool does not guess.
- **Never runs a test.** The tool reads files as text. It never runs a test, a build or a script, never evaluates anything it reads, and never puts a test name, a path or a message on a command line.
- **No DTD, no entity expansion.** The XML reader, used for results and for Cobertura reports, refuses a DOCTYPE, so no DTD is read, no external entity is fetched or opened, and no entity can expand into another. Only the five predefined entities and numeric references are read, once each, into one character each. There is no option to turn DTD support on, because there is no DTD support.
- **No network.** The tool reads the files it is given and sends nothing anywhere. It never fetches a schema, a DTD or an address named in a file, does not check for updates, and refuses an argument that looks like an address. It can run in a job with no outbound access at all.
- **No dependencies.** Node 22 or newer and nothing else, so a release gate does not add a supply chain of its own. There is no XML, JSON, CSV or glob library and no `node_modules` to install before it runs.
- **Never follows a link.** Inside a result folder every entry is looked at with `lstat`; a symbolic link or a junction is listed and never followed. On the way to an evidence file every part of the path is looked at the same way, and a link means the file does not count.
- **Reads only what it needs.** Only files that end in `.xml` are read from a result folder; other files are counted and never opened. An evidence file is looked at and never read. A path in a coverage report, a changed list or a result file is text; it is never opened.
- **Regular files only, bounded.** Each file is opened once, its type and size are taken from the open file, and anything that is not a regular file or is over the limit is refused. The number of runs, entries, folder levels and XML files, and the total bytes read, are capped, and past a cap the input is refused.
- **Bounded readers.** The XML, JSON, CSV and tracefile readers each read the text once, from left to right, and never go back. Nesting, elements, attributes, names, strings, fields, records, sections and the text kept per element are capped, and past a cap the file is refused, not read in part.
- **Patterns without a regular expression.** The file patterns of the criteria (`coverage.exclude`, `coverage.changedFiles.ignore`) are matched by a small matcher whose work is bounded by the number of parts of the pattern and of the path, so a pattern from a file cannot make it run for a very long time. At most 20 patterns of 200 characters.
- **Exact arithmetic.** Percentages are compared with whole numbers. A limit has at most four decimals. A figure is shown cut down to two decimals, never rounded up, so a figure just under a limit is never shown as the limit.
- **Paths that mean the same everywhere.** Evidence paths in the criteria are relative, with forward slashes, with no `..`, no drive letter and no leading slash, and are refused otherwise on every system. Paths in a report are relative with forward slashes. Coverage and changed paths are compared with forward slashes on every system.
- **Clean output.** Text from the input has control characters, line separators and direction controls removed and its length capped before it reaches a report or an error message, so a hostile file name, test name, defect id or message cannot rewrite the terminal or reorder what a reader sees. Markdown cells escape pipes, backslashes, square brackets, backticks, asterisks, underscores, line breaks and `<`, `>` and `&`.
- **No prototype tricks.** Attributes are kept in maps, tests in a map keyed by text, and JSON objects are built with own properties, so a test, a severity or a key named `__proto__` is just data.
- **The same input gives the same report.** The tool reads no clock, no environment variable and no random number. The report holds no time, so two runs of the same files give the same bytes, with LF or CRLF line ends in the inputs.
- **Writes nothing to disk.** The report goes to the screen. Redirect it to a file or the job summary only when you need to keep it.

## Options that make the run stricter

- **`--strict`.** A gate that is not checked is a no-go. Use it when every gate in the criteria has its evidence in the pipeline; it turns a missing input, a coverage report with no branch data or a short history into a stop instead of a quiet pass.
- **`defects.maxOpen` with `defect-severity`.** Naming the severities makes every open defect with no severity a no-go, so a defect cannot slip between the limits.
- **`evidence.required`.** A signed test report or an approved release note that must be present, not empty and not a link.
- **`noUnexplainedFailures`.** A window of the last runs in which a failure must be explained in the criteria file, in a reviewed commit.
- **`criticalSuites`.** A suite that has no result is not met, so a suite that is renamed, moved or never run stops the release.

## Running it in a pipeline

Run it as the last step of the job that decides the release, on a Linux runner, with the evidence downloaded or built in the same workflow. It needs no secret and no network beyond the download of the evidence:

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

- Give the job read access to the contents and nothing more. The tool does not need to write to the repository, to comment on a pull request or to read a secret.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because `npx` runs what it downloads.
- Run it on the results of the branch you are about to release. Results from a fork or an unreviewed branch are data the tool treats as hostile, but the fork also controls the tests that wrote them; the gate says what the evidence says, and the evidence must come from a job that you trust.
- Keep the two steps separate. The first writes the report where people read it; the second decides, and its exit code stops the pipeline. Do not hide the exit code with a trailing `|| true`.
- Do not post a report in a public place without reading it. It quotes test names, defect ids, paths and failure messages, which can hold data from your environment.

## Protecting the criteria file

The criteria file is the release decision written down, so a change to it is a change of the decision. The tool cannot see who changed it or why; the repository can.

- Keep the criteria in the repository, in its own path, and put the path in `CODEOWNERS` with the people who own the release: this repository does it for the files that decide a verdict. Require their review in branch protection.
- Change the criteria in their own pull request, with the reason in the description, and not in the same change as the code they judge. A threshold lowered on the day of the release is a pull request that says so.
- Do not let the pipeline edit the file, and do not produce it from the evidence: criteria written after the evidence are a description of the evidence, not a gate.
- Read the report header. It shows the path and the name of the criteria file, so a run on a copy in another folder is visible.
- Use the Git history of the file as the record of how the exit criteria of the product moved. A gate that is added is a promise; a gate that is removed needs a reason.

## Writing criteria that fail closed

1. State a gate for each kind of evidence you collect, and run with `--strict` once all of them are in the pipeline.
2. Name the critical suites by the class names in the results, so a renamed class makes the gate not met instead of silently empty.
3. List every closed status of your tracker in `closedStatuses`, and nothing else. Every status you forget counts as open, which errs toward the safe side.
4. Put `maxOpen` for the severities that matter and `maxOpenTotal` for the rest; the gate for defects with no severity then comes with them.
5. Exclude from coverage only what has no hand-written code, name it in `coverage.exclude`, and read the number of excluded files in the report.
6. Ask for the changed-file gates, and give them a smaller list of ignored patterns than you think you need.
7. Keep the explained tests in `noUnexplainedFailures.explained` short, and remove a test from the list when its failure is fixed.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline, with `ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS, with hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
