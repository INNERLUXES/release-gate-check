# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, with `!` for a breaking change.

## Changing a gate

1. Describe the change in docs/method.md first: what the gate checks, the rule, when it is met, not met and not checked, what it can see and what it cannot, and the sentence of a saved page it follows. Where the tool makes its own choice (what a missing input means, how reports are merged, what happens to a changed file with no coverage record), say so and say why.
2. The tool has no threshold of its own, and a change must not add one. Every number a gate compares must come from the criteria file.
3. Missing data is never met. A gate whose input was not given, or cannot show the number, is not checked; a gate that finds the evidence shows a hole is not met. A new gate needs a test for each of the three outcomes, and a near miss on each side of its limit.
4. Add a test with the inputs written inline (`suite()`, `lcovSection()` and `criteriaOf()` in test/helpers.js build them), small enough that the result can be worked out by hand.
5. Text from the input goes through `safeText` before it reaches a gate, a note or an error message, so control characters are removed and the length is capped.
6. A gate id, once released, keeps its meaning: pipelines and other tools read it from the JSON report.

## Changing the criteria file

1. A new key is added to `KEYS` in src/criteria.js with its kind, documented in docs/inputs.md, and tested with a good value and a bad one. Every key the tool does not know stays an error.
2. A number is checked for its range and, for a percentage, for at most four decimals, and is compared with whole numbers. Never compare a percentage as a floating point number.
3. A path in the criteria is relative, uses forward slashes and cannot go up; a change must keep that, on every system.

## Changing a reader

1. The tool reads; it never runs. A change to the XML reader must not read a DTD, expand an entity other than the five predefined ones and numeric references, fetch anything a file names, or follow a link inside a folder. A DOCTYPE stays refused.
2. Keep the work linear: one pass over the text, no pattern with nested repetition, and no loop over all files inside another loop over all files. Keep the limits on nesting, elements, attributes, names, strings, fields, records, sections and files. Add a hostile test with a long input and a time check.
3. Files written with LF and with CRLF line ends must give the same report. The example inputs are stored as written (`.gitattributes`), and a test reads them both ways.
4. Paths are opened with `path.resolve`, never `path.join`, so an absolute path works on every system. Paths shown in a report are relative, with forward slashes. A test that depends on the operating system (a symbolic link, a device, a name with a control character, a backslash in a name) is guarded with `process.platform`, and every other test builds its paths with `resolve()` from names with forward slashes.

## Changing the quoted sentences

The sentences in `src/data.js` come from the pages saved in `research/sources`: five terms of the ISTQB glossary, the tracefile section of the geninfo manual page of lcov, the Cobertura DTD, a part of the coverage.py file that writes Cobertura XML, two pages of Maven Surefire, RFC 4180, RFC 8259 and three sections of W3C XML 1.0. When a page changes, save the new text in `research/sources` (the address on the first line, plain ASCII, no date or year), change `src/data.js` to match, and update docs/rules-and-sources.md. `test/data.test.js` compares every quoted sentence with the saved text, so changing one without the other fails.

Never add a rule or a quoted sentence from memory or from a blog post. A new rule needs the page, opened and saved, and the words of the page that it rests on.

## Rules for the code

- No runtime dependencies. Node 22 or newer and nothing else.
- The tool reads the files it is given and writes only to the screen. It opens no network connection and runs no program.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- Never commit a real secret, even as a fixture. `npm run check` fails on anything that looks like a credential.
- The README and the documents carry no dates or years, the example inputs carry no timestamp, and the examples and tests hold no number that reads like a year. Version numbers (Node 22, XML 1.0, release 2.4) are fine.

## Before you open the pull request

```
npm test
npm run check
npm run example
```
