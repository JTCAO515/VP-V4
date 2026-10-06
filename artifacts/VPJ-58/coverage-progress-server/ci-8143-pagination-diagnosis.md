# PR666 pagination CI failure diagnosis

Exact original head8143a0c5, job112019703820/run37386088996 failed at owned PG test107. Original FAIL excerpt retained without reclassifying it as PASS.

The negative cursor uses `ids[0]` from random creation order. Preview sends `[...ids].sort()` and returns the sorted `r.objectIds`. In the actual returned page, index4 is `a9a17f47-06a7-4d0f-926a-0eabecb61e2d`; the returned last two items are exactly indices5..6, with pageNumber2/hasMorefalse. The second negative uses digest `a` repeated64, distinct from the actual digest beginning0b767b. Since the previous page was page1 with null last_cursor, only the legitimate expected next cursor can successfully advance. Therefore this failed negative accidentally supplied the valid continuation anchor. The exact incoming request was not logged; that equality is derived from the source branches and actual returned fields.

WIRE125 and SQL page branch permit an expected continuation and an exact last-page retry without recounting. Both existing positive assertions remain required. The smallest fixture correction is `ids[0]`→`r.objectIds[0]`: canonical first element necessarily differs from the canonical fifth element under the unique7-ID selection. A precondition can prove that distinction. Keep denial/nonzero/CURSOR_CONFLICT, snapshot equality, wrong-digest, wrong-limit, final-page retry, rewind denial and complete proof assertions.

No runtime change, blind CI retry, new matrix or second writer. The original SQL owner owns the fixed test commit; sole integrator consumes it normally. PR666 MERGEHOLD remains until new-head review/required CI succeeds. This evidence does not identify a SQL behavior defect.
