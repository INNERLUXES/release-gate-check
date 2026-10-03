## release-gate-check: no-go

Criteria: examples/criteria.json (Bike rental booking service, release 2.4). Inputs: results: 3 files, 30 testcases, 30 distinct tests; 2 earlier runs; coverage: 1 report, 4 source files; 4 changed files; 15 defects; evidence folder examples/blocked/evidence. Gates: 3 met, 12 not met, 0 not checked.

| Status | Gate | Requirement | Found | Why |
| --- | --- | --- | --- | --- |
| **not met** | pass-rate | at least 98% of the executed tests pass | 96.42% (27 of 28 executed tests passed, 1 flaky test counted as passed) | 1 test failed or had an error |
| **not met** | critical-suites | at most 0 failing tests in rental.booking.BookingTest and rental.payment.DepositTest | 1 failing in 2 suites with results | 1 failing test, above 0 |
| **not met** | skipped-share | at most 5% of the tests skipped | 6.66% (2 of 30 tests skipped) | too many tests were skipped |
| **not met** | flaky-count | at most 0 flaky tests | 1 flaky test | 1 test passed and failed in one run, or passed after a retry |
| **not met** | unexplained-failures | no test failed in the last 3 runs unless it is explained (1 test explained) | 2 unexplained failing tests in 3 runs | a test failed in a recent run and nobody has explained it |
| met | line-coverage | at least 80% of the lines covered | 81.66% (49 of 60 lines in 3 files; 1 file left out by coverage.exclude) |  |
| **not met** | branch-coverage | at least 70% of the branches covered | 66.66% (16 of 24 branches; 1 file left out by coverage.exclude) | too few branches are covered |
| **not met** | changed-line-coverage | at least 90% of the lines of changed files covered | 1 changed file with no coverage record | a changed file with no coverage record is not counted as covered; add it to coverage.changedFiles.ignore only when it holds no code |
| **not met** | changed-branch-coverage | at least 60% of the branches of changed files covered | 1 changed file with no coverage record | a changed file with no coverage record is not counted as covered; add it to coverage.changedFiles.ignore only when it holds no code |
| **not met** | open-defects:blocker | at most 0 open blocker defects | 1 open blocker defect in 15 defects | 1 defect open, above 0 |
| **not met** | open-defects:critical | at most 0 open critical defects | 1 open critical defect in 15 defects | 1 defect open, above 0 |
| **not met** | open-defects:major | at most 3 open major defects | 4 open major defects in 15 defects | 4 defects open, above 3 |
| met | defect-severity | every open defect has a severity | 0 open defects with no severity |  |
| met | open-defects:total | at most 15 open defects in all | 11 open defects in 15 defects |  |
| **not met** | evidence-files | 2 required files present | 1 of 2 present | a required file is missing, empty, not a regular file or behind a symbolic link |

### pass-rate

- failed: rental.booking.BookingTest &gt; createsBookingForTwoBikes
- from examples/blocked/results/TEST-rental.booking.BookingTest.xml: 10 testcases read
- from examples/blocked/results/TEST-rental.fleet.AvailabilityTest.xml: 12 testcases read
- from examples/blocked/results/TEST-rental.payment.DepositTest.xml: 8 testcases read
- from examples/blocked/results/TEST-rental.booking.BookingTest.xml:4: failed: rental.booking.BookingTest &gt; createsBookingForTwoBikes (expected 2 bikes on the booking but found 1)
- basis: "The set of conditions for officially completing a defined task." (exit criteria, https://glossary.istqb.org/en\_US/term/exit-criteria)
- basis: "&lt;xs:element name="testcase" minOccurs="0" maxOccurs="unbounded"&gt;" (testsuite, https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd)

### critical-suites

- failed: rental.booking.BookingTest &gt; createsBookingForTwoBikes
- from examples/blocked/results/TEST-rental.booking.BookingTest.xml:3: rental.booking.BookingTest: 10 tests
- from examples/blocked/results/TEST-rental.booking.BookingTest.xml:4: failed: rental.booking.BookingTest &gt; createsBookingForTwoBikes
- from examples/blocked/results/TEST-rental.payment.DepositTest.xml:3: rental.payment.DepositTest: 8 tests
- basis: "The set of conditions for officially completing a defined task." (exit criteria, https://glossary.istqb.org/en\_US/term/exit-criteria)
- basis: "&lt;xs:attribute name="classname" type="xs:string"/&gt;" (testcase, https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd)

### skipped-share

- rental.fleet.AvailabilityTest &gt; readsTheLiveFeed
- rental.fleet.AvailabilityTest &gt; fallsBackToTheLastFeed
- from examples/blocked/results/TEST-rental.fleet.AvailabilityTest.xml:13: skipped: rental.fleet.AvailabilityTest &gt; readsTheLiveFeed
- from examples/blocked/results/TEST-rental.fleet.AvailabilityTest.xml:16: skipped: rental.fleet.AvailabilityTest &gt; fallsBackToTheLastFeed
- basis: "The set of conditions for officially completing a defined task." (exit criteria, https://glossary.istqb.org/en\_US/term/exit-criteria)
- basis: "&lt;xs:element name="skipped" nillable="true" minOccurs="0" maxOccurs="1"&gt;" (testcase, https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd)

### flaky-count

- rental.payment.DepositTest &gt; refundsDepositAfterReturn
- from examples/blocked/results/TEST-rental.payment.DepositTest.xml:4: flaky: rental.payment.DepositTest &gt; refundsDepositAfterReturn (passed, 1 retry written by the runner)
- basis: "Then this test will be counted as a flaky test." (Output flaky re-run information on the screen, https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html)
- basis: "This will fail the build if more than the specified number of tests are flaky, i.e. if they had a successful run after previously failing." (Re-run and fail the build upon flaky test count, https://maven.apache.org/surefire/maven-surefire-plugin/examples/rerun-failing-tests.html)

### unexplained-failures

- rental.booking.BookingTest &gt; cancelsBookingWithinOneHour (failed in run-1)
- rental.booking.BookingTest &gt; createsBookingForTwoBikes (failed in release candidate)
- from run run-1: 2 failing tests
- from run run-2: 1 failing test
- from run release candidate: 1 failing test
- from examples/blocked/history/run-1/TEST-rental.booking.BookingTest.xml:7: unexplained: rental.booking.BookingTest &gt; cancelsBookingWithinOneHour
- from examples/blocked/results/TEST-rental.booking.BookingTest.xml:4: unexplained: rental.booking.BookingTest &gt; createsBookingForTwoBikes
- basis: "The set of conditions for officially completing a defined task." (exit criteria, https://glossary.istqb.org/en\_US/term/exit-criteria)
- basis: "&lt;xs:element name="testcase" minOccurs="0" maxOccurs="unbounded"&gt;" (testsuite, https://maven.apache.org/surefire/maven-surefire-plugin/xsd/surefire-test-report.xsd)

### line-coverage

- from examples/blocked/coverage/lcov.info:2: src/booking/booking.js: 18 of 20 lines covered
- from examples/blocked/coverage/lcov.info:65: src/fleet/availability.js: 17 of 25 lines covered
- from examples/blocked/coverage/lcov.info:37: src/payment/deposit.js: 14 of 15 lines covered
- basis: "The degree to which specified coverage items are exercised by a test suite, expressed as a percentage." (coverage, https://glossary.istqb.org/en\_US/term/coverage)
- basis: "DA:&lt;line number&gt;,&lt;execution count&gt;\[,&lt;checksum&gt;\]" (TRACEFILE FORMAT, https://manpages.debian.org/testing/lcov/geninfo.1.en.html)

### branch-coverage

- from examples/blocked/coverage/lcov.info:2: src/booking/booking.js: 5 of 8 branches covered
- from examples/blocked/coverage/lcov.info:65: src/fleet/availability.js: 6 of 10 branches covered
- from examples/blocked/coverage/lcov.info:37: src/payment/deposit.js: 5 of 6 branches covered
- basis: "The coverage of branches in a control flow graph." (branch coverage, https://glossary.istqb.org/en\_US/term/branch-coverage)
- basis: "BRDA:&lt;line\_number&gt;,\[&lt;exception&gt;\]&lt;block&gt;,&lt;branch&gt;,&lt;taken&gt;" (TRACEFILE FORMAT, https://manpages.debian.org/testing/lcov/geninfo.1.en.html)

### changed-line-coverage

- no coverage record: src/fleet/new-search.js
- from examples/blocked/changed-files.txt:2: changed: src/booking/booking.js -&gt; src/booking/booking.js
- from examples/blocked/changed-files.txt:3: changed: src/fleet/availability.js -&gt; src/fleet/availability.js
- from examples/blocked/changed-files.txt:4: changed: src/fleet/new-search.js -&gt; no coverage record
- from examples/blocked/coverage/lcov.info:2: src/booking/booking.js: 18 of 20 lines covered
- from examples/blocked/coverage/lcov.info:65: src/fleet/availability.js: 17 of 25 lines covered
- basis: "The degree to which specified coverage items are exercised by a test suite, expressed as a percentage." (coverage, https://glossary.istqb.org/en\_US/term/coverage)
- basis: "SF:&lt;path to the source file&gt;" (TRACEFILE FORMAT, https://manpages.debian.org/testing/lcov/geninfo.1.en.html)

### changed-branch-coverage

- no coverage record: src/fleet/new-search.js
- from examples/blocked/changed-files.txt:2: changed: src/booking/booking.js -&gt; src/booking/booking.js
- from examples/blocked/changed-files.txt:3: changed: src/fleet/availability.js -&gt; src/fleet/availability.js
- from examples/blocked/changed-files.txt:4: changed: src/fleet/new-search.js -&gt; no coverage record
- from examples/blocked/coverage/lcov.info:2: src/booking/booking.js: 5 of 8 branches covered
- from examples/blocked/coverage/lcov.info:65: src/fleet/availability.js: 6 of 10 branches covered
- basis: "The coverage of branches in a control flow graph." (branch coverage, https://glossary.istqb.org/en\_US/term/branch-coverage)
- basis: "SF:&lt;path to the source file&gt;" (TRACEFILE FORMAT, https://manpages.debian.org/testing/lcov/geninfo.1.en.html)

### open-defects:blocker

- BR-101 (Open)
- from examples/blocked/defects.csv:2: BR-101: severity Blocker, status Open
- basis: "The degree of impact that a defect has on the development, testing or operation of a component or system." (severity, https://glossary.istqb.org/en\_US/term/severity)
- basis: "An imperfection or deficiency in a work product where it does not meet its requirements or specifications or impairs its intended use." (defect, https://glossary.istqb.org/en\_US/term/defect)

### open-defects:critical

- BR-102 (In Progress)
- from examples/blocked/defects.csv:3: BR-102: severity Critical, status In Progress
- basis: "The degree of impact that a defect has on the development, testing or operation of a component or system." (severity, https://glossary.istqb.org/en\_US/term/severity)
- basis: "An imperfection or deficiency in a work product where it does not meet its requirements or specifications or impairs its intended use." (defect, https://glossary.istqb.org/en\_US/term/defect)

### open-defects:major

- BR-103 (Open)
- BR-104 (Open)
- BR-105 (In Progress)
- BR-106 (Open)
- from examples/blocked/defects.csv:4: BR-103: severity Major, status Open
- from examples/blocked/defects.csv:5: BR-104: severity Major, status Open
- from examples/blocked/defects.csv:6: BR-105: severity Major, status In Progress
- from examples/blocked/defects.csv:7: BR-106: severity Major, status Open
- basis: "The degree of impact that a defect has on the development, testing or operation of a component or system." (severity, https://glossary.istqb.org/en\_US/term/severity)
- basis: "An imperfection or deficiency in a work product where it does not meet its requirements or specifications or impairs its intended use." (defect, https://glossary.istqb.org/en\_US/term/defect)

### defect-severity

- basis: "The degree of impact that a defect has on the development, testing or operation of a component or system." (severity, https://glossary.istqb.org/en\_US/term/severity)
- basis: "An imperfection or deficiency in a work product where it does not meet its requirements or specifications or impairs its intended use." (defect, https://glossary.istqb.org/en\_US/term/defect)

### open-defects:total

- 1 Blocker
- 1 Critical
- 4 Major
- 5 Minor
- from examples/blocked/defects.csv:2: BR-101: severity Blocker, status Open
- from examples/blocked/defects.csv:3: BR-102: severity Critical, status In Progress
- from examples/blocked/defects.csv:4: BR-103: severity Major, status Open
- from examples/blocked/defects.csv:5: BR-104: severity Major, status Open
- from examples/blocked/defects.csv:6: BR-105: severity Major, status In Progress
- from examples/blocked/defects.csv:7: BR-106: severity Major, status Open
- from examples/blocked/defects.csv:8: BR-107: severity Minor, status Open
- from examples/blocked/defects.csv:9: BR-108: severity Minor, status Open
- from examples/blocked/defects.csv:10: BR-109: severity Minor, status Open
- from examples/blocked/defects.csv:11: BR-110: severity Minor, status Open
- from examples/blocked/defects.csv:12: BR-111: severity Minor, status Open
- basis: "The degree of impact that a defect has on the development, testing or operation of a component or system." (severity, https://glossary.istqb.org/en\_US/term/severity)
- basis: "An imperfection or deficiency in a work product where it does not meet its requirements or specifications or impairs its intended use." (defect, https://glossary.istqb.org/en\_US/term/defect)

### evidence-files

- reports/release-notes-approved.txt: missing
- from examples/blocked/evidence/reports/signed-test-report.txt: reports/signed-test-report.txt: present, 109 bytes
- from examples/blocked/evidence/reports/release-notes-approved.txt: reports/release-notes-approved.txt: missing (no such file)
- basis: "The set of conditions for officially completing a defined task." (exit criteria, https://glossary.istqb.org/en\_US/term/exit-criteria)

**Decision: no-go** - 12 gates not met.
