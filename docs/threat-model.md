# Threat model

## What the tool touches

- It reads the criteria file, the files and folders named with `--junit` and `--history`, the files named with `--coverage`, `--changed` and `--defects`, and it looks at the paths that `evidence.required` names below `--evidence-root`. Nothing else is opened.
- Inside a result folder it follows no symbolic link and no junction. On the way to an evidence file it follows none either. A path named on the command line may itself be a link, because the person who runs the tool named it.
- It reads the XML files, the tracefiles, the CSV file, the list of changed files and the JSON file as text. It does not open anything they name: not a DTD, a schema, an external entity, a source file named in a coverage report, a path in a changed list, or an address in a test message. A path in a file is text.
- It never reads an evidence file. It looks at its type and its size.
- It writes only to the screen (standard output and standard error).
- It opens no network connection, runs no program, and never runs a test.

## What the input may hold

The evidence often comes from somewhere else: a pull request from a fork, a build of a branch nobody has reviewed, an artifact downloaded from another job, an export from a tracker, or a folder that a test can write to while it runs. A test that is under the control of an attacker can write anything into its own result file and its own coverage report. The criteria file lives in the repository, so a change to it is a change to the release decision. The tool treats every file as possibly hostile, and the criteria file as a file that must be reviewed.

The XML can try the classic attacks on XML readers. The billion laughs: a DOCTYPE that declares entities that expand into each other, so that a few hundred bytes become gigabytes. An external entity: a DOCTYPE that declares an entity with a `SYSTEM` address, such as a file on the machine or an address on the network, so that a reader puts the content of a secret file into the report, or calls out to a host. A parameter entity that loads a remote DTD. A reference to an entity that was never declared, in the hope that the reader looks it up somewhere. Numbers past the last code point, or references to characters XML forbids. Cobertura reports are XML and carry the same risk.

The structure can try to exhaust a reader: a huge file of gigabytes, elements nested a hundred thousand deep, a start tag with thousands of attributes, hundreds of thousands of elements, a tag, a quote, a comment or a CDATA section that is not closed before the end of the file, long runs of `<` or `&`. A JSON file with values nested thousands deep or a string of megabytes. A CSV file with a quote that is never closed, a field of megabytes, millions of records, thousands of fields in a record, or a quote placed to shift every later column. A tracefile with a hundred thousand sections, millions of lines or branches, a very long line, or a sum written as a number of five thousand digits. A folder can hold symbolic links that point outside it, at a device, or back at a parent folder in a link loop, millions of files, folders nested thousands deep, or a binary file with an `.xml` name. A glob pattern with many stars, or a path with very many parts, can make a careless matcher take a very long time. Hundreds of thousands of changed files and covered files can make a careless match do work that grows with the square of the input.

The data can try to move the decision. A JSON object that names the same key twice, so that two readers keep different numbers. A percentage written as 99.99999999 so that rounding lets it pass. A test or severity named `__proto__`, `constructor` or `toString`. A defect with an empty severity or a status the criteria do not know, so that it falls between the limits. A changed file that is missing from the coverage report. A critical suite that is missing from the results. A required evidence file that is empty, is a folder, or is a symbolic link to a file somewhere else. A criteria file that names an evidence path outside the evidence folder, such as `../../etc/passwd` or an absolute path, to learn whether a file exists.

A test name, a suite name, a defect id, a severity, a path or a message can hold control and direction characters, hold markup that a Markdown table would render, or look like a link.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| The billion laughs expands a few bytes into gigabytes | There is no DTD support: a DOCTYPE is refused at its first byte, before anything is declared. No entity can be declared, so none can expand. A test runs the attack and checks that it is refused in well under a second and that the output stays small |
| An external entity reads a secret file into the report, or calls out to a host | The DOCTYPE that would declare it is refused; a reference to any name but the five predefined entities is refused; no module for the network is imported. A test declares an external entity that points at a secret file, in a result file and in a Cobertura report, and checks that its content is in no output |
| A remote DTD is loaded through a parameter entity | Refused with the DOCTYPE; the reader never fetches anything |
| References to references grow the text with every pass | Every reference is decoded once into one character, and the result is never read again |
| A test in the results runs, or a command in a name is run | Nothing is run or evaluated; names are text. A test puts code in a test name and checks that no file appears |
| A symbolic link leads the tool to files outside the folder | Every entry in a result folder is looked at with `lstat`; a link is listed by name and never followed. A test links to a folder outside with a failing result in it and checks that it is not read |
| A link loop, or a link to a parent, makes the walk run for ever | Links are not followed, so there is no loop. The walk keeps its own list of folders and needs no recursion |
| Folders nested thousands deep, millions of files or thousands of runs exhaust the stack, the memory or the time | The walk is a loop with a list, and more than 32 levels, 50,000 entries, 10,000 XML files or 100 history runs refuse the input with exit code `2` |
| A huge file, or many large files, exhaust memory | A file over 32 MB (1 MB for the criteria) is refused before it is read; all XML files read may hold at most 512 MB. Other files in a result folder are never opened |
| A pipe or a device named like an input makes the tool hang | The type is taken from the open file; anything that is not a regular file is refused. In a result folder the type is looked at with `lstat` first |
| A binary or UTF-16 file is read as text | A null byte in the first 8,000 bytes, or the byte order mark of UTF-16, makes the file refused and named |
| Elements nested a hundred thousand deep overflow a stack | The XML reader keeps an explicit stack and refuses a file past 256 levels; the JUnit and Cobertura readers walk with a loop and a list; the JSON reader refuses values nested more than 32 deep |
| A tag, a quote, a comment, a CDATA section, a string or a quoted CSV field that is not closed makes a reader scan again and again | Each reader reads once and never goes back; each search for an end runs once from where it is, and a file that ends inside one is refused with the place |
| Thousands of attributes, fields or records, or hundreds of thousands of elements, exhaust memory | At most 256 attributes on an element, 500,000 elements in a file, 1,000 fields in a record and 1,000,000 defect records; past any limit the file is refused. Only 4,096 characters of the text of one element are kept |
| A very long line or a crafted near miss makes a pattern run for a very long time | The patterns of the readers are anchored or have bounded repeats, with no nested repetition. The file patterns of the criteria are matched without a regular expression. Tests run long near misses and check the time |
| Tens of thousands of tests, files or changed paths make the work grow with the square of the input | Tests are kept in a map by name; changed paths are matched through an index of path endings, never by a pass over all covered files for each changed file. Tests check the time on twenty thousand tests in three runs, a hundred thousand covered files and five thousand changed files, and a hundred thousand defects |
| Two readers keep different numbers from a JSON object that names a key twice | The JSON reader refuses it. RFC 8259 says that when the names within an object are not unique, the behavior of software that receives such an object is unpredictable |
| A percentage lets a figure under the limit pass through rounding | Percentages are compared with whole numbers; a threshold has at most four decimals; a figure is shown cut down, never rounded up. A test compares 94.999 percent with a limit of 95 |
| A key is misspelled and a gate silently disappears | Every key the tool does not know is an error, with the line and a suggestion; a criteria file that states no gate is an error |
| A test, a severity or a key named `__proto__` or `constructor` changes how objects behave | Attributes and tests are kept in maps; JSON objects are built with own properties, so such a name is an ordinary key, and in the criteria it is an unknown key |
| A defect with an empty severity or an unknown status falls between the limits | A status that the criteria do not list as closed is open; an open defect with no severity makes `defect-severity` not met |
| A changed file that has no coverage record, a critical suite that has no result, or a missing evidence file passes by absence | Each is not met, and named in the details. Missing input is not checked, never met |
| The criteria name an evidence path outside the evidence folder, or an absolute path, to probe the file system | An absolute path, a drive letter, a backslash and `..` are refused when the criteria are read, on every system; the tool then looks at each part below the evidence folder with `lstat` |
| An evidence file is a link to a file somewhere else, or sits behind a linked folder | A link anywhere on the way means the file is not counted as evidence |
| A name or a message rewrites the terminal through escape sequences, or reorders text with direction characters | Control characters (C0 and C1), line and paragraph separators, the byte order mark and Unicode direction controls are replaced by a space before any text reaches a report or an error message, and the length is capped |
| A test name or a defect id breaks the Markdown table in the job summary, makes a link, or hides text as an HTML tag | Pipes, backslashes, square brackets, backticks, asterisks, underscores, line breaks, `<`, `>` and `&` are escaped in every table cell |
| The argument names a URL, so the tool becomes a fetcher | Arguments that look like addresses are refused; reading from standard input is refused |
| A pull request lowers a threshold or removes a gate and the release goes out | The tool cannot see this. The criteria file is code under review: `.github/CODEOWNERS` in this repository shows how, and docs/secure-defaults.md says how to protect the file in yours |

## Out of scope

Whether the criteria are good, the tests are good, or the release is safe ([limits.md](limits.md)). The safety of the test runner and the coverage tool that wrote the files, of the tracker that wrote the export, and of the job that downloads them. Who is allowed to change the criteria file in a repository: that is access control of the repository, and the tool can only say what the file says.
