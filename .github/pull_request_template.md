## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a gate, the criteria file or a reader is described in docs/method.md or docs/inputs.md, says what it can and cannot see, and has a test with the inputs written inline and a near miss on each side of the limit
- [ ] No threshold is built in: every number a gate compares comes from the criteria file
- [ ] A thing the tool cannot see is reported as not checked or not met, never as met, and an input that cannot be read stops the run with exit code 2
- [ ] A change to a quoted sentence follows the saved page: the new page text is saved in research/sources, `src/data.js` and docs/rules-and-sources.md match it, and nothing was added from memory
- [ ] Text from the input goes through `safeText` before it reaches a gate, a note or an error message
- [ ] The readers still refuse a DOCTYPE, expand no entity but the five predefined ones and numeric references, fetch nothing, follow no symbolic link inside a folder or on the way to an evidence file, open no connection and run no program or test
- [ ] Work stays linear in the size of the input: no pattern with nested repetition, no loop over all files inside a loop over all files, and a hostile test with a time check
- [ ] A test that depends on the operating system (a path, a backslash, a link, a file name, a line end) is guarded with `process.platform` or builds its path with `resolve()` from forward-slash names
- [ ] No real person, company, address or key in fixtures or examples, no calendar year in the README or the documents, no timestamp in the examples, and no number that reads like a year in the examples or the tests
- [ ] The commit messages of this pull request follow Conventional Commits
