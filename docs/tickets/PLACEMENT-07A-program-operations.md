# PLACEMENT-07A - Program Operations & ECEA Support

## Status

**Implemented. One additive migration: `0010_batch_placement_tracking.sql`.**

This ticket makes PSW and ECEA two first-class program lanes through the ONE
existing placement lifecycle, and gives every batch an explicit switch that
says whether it belongs to CURRENT placement operations. It deletes nothing,
archives nothing, changes no student, and touches no placement history, email
logic, or authorization rule.

| Area | Where |
| --- | --- |
| Migration | `supabase/migrations/0010_batch_placement_tracking.sql` |
| Row type | `src/lib/supabase/database.types.ts` (`BatchRow.placement_tracking_enabled`) |
| Program vocabulary | `src/lib/placement/constants.ts` (`PROGRAM_OPTIONS`, `Program`, `isProgram`) |
| The inclusion rule, the working scope, batch choices, and the program overview (pure) | `src/lib/placement/operations.ts` |
| Dashboard reads | `src/lib/dashboard/queries.ts` |
| Dashboard page and program card | `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/ProgramOperationsCard.tsx` |
| Tracking setting helpers (pure) and action | `src/lib/batches/tracking.ts`, `src/lib/batches/actions.ts` |
| Batch Management UI | `src/components/admin/BatchAdmin.tsx`, `src/app/(app)/admin/batches/page.tsx` |
| The Current Operations / Show All Students control | `src/components/ui/OperationsScopeSwitch.tsx` |
| Scope and program filter, Students | `src/lib/students/filters.ts`, `src/lib/students/queries.ts`, `src/components/students/StudentToolbar.tsx` |
| Scope and program filter, Placement | `src/lib/placement/filters.ts`, `src/lib/placement/queries.ts`, `src/components/placement/PlacementToolbar.tsx`, `src/app/(app)/placement/page.tsx` |
| Program-first Students overview | `src/app/(app)/students/page.tsx`, `src/components/students/ProgramOverview.tsx` |
| Batch Planning default choices | `src/lib/planning/filters.ts`, `src/components/planning/BatchSelector.tsx`, `src/app/(app)/placement/planning/page.tsx` |
| Checks | `scripts/check-program-operations.ts` (`npm run check:programs`) |

## Why the operational tracking flag exists

TAE Placement grew up as a PSW application. Older PSW batches (April, June)
are still in the database with active student records whose operational data
is no longer current. Nobody is cleaning that up in this ticket, and nothing
should be deleted or archived to make the dashboard honest.

Instead a batch states, explicitly, whether it is part of today's work:

```
batches.placement_tracking_enabled boolean not null default false
```

Old data stays stored and browsable. The dashboard and the operational program
counts read only the batches staff have switched on.

## `batch.status` versus `placement_tracking_enabled`

They answer two different questions and neither replaces the other.

| Field | Question it answers | Who changes it | Effect on students |
| --- | --- | --- | --- |
| `status` (`active` / `archived`) | Is this intake still running? | Admin, Archive / Reactivate | None. Archived batches stay browsable; their students stay as they are. |
| `placement_tracking_enabled` | Is this batch part of CURRENT placement operations, i.e. should the dashboard count it today? | Admin, "Track in Placement Operations" | None. It is an operational visibility flag. |

An active batch may be untracked (the old April batch after this ticket). An
archived batch is never tracked, whatever its flag says. The flag is not an
archive, not a delete, not a soft delete, and not a student status.

## Supported programs

`PROGRAM_OPTIONS` is now `["PSW", "ECEA"]`. Both programs share one placement
lifecycle:

```
Documents -> Ready for Placement -> Placement Assigned -> On Placement -> Placement Completed
```

There is no ECEA engine, no ECEA table, and no ECEA status vocabulary.
`students.program` and `batches.program` remain the free-text columns 0001
created. Student and batch create/edit forms offer both programs. No existing
record is converted; everything that was PSW is still PSW.

**PSW and ECEA are the supported programs for now.** There is no programs
table and no Admin -> Programs screen. The list lives in one constant, and the
Students program overview, the dashboard cards, the program filters, and both
forms all read it. If a third program ever needs placement tracking, adding it
is a separate Admin Programs feature (a `programs` table, a management screen,
and the constant replaced by a read), not a change to this ticket.

## Exact dashboard inclusion rule

Defined once, in `src/lib/placement/operations.ts`, and never restated:

```
batch is operational   <=>  batch.status = 'active'
                            AND batch.placement_tracking_enabled = true

student is tracked     <=>  student.is_active = true
                            AND student.batch_id IS NOT NULL
                            AND that batch is operational
```

Tracked students are grouped by `students.program`, and each program's status
counts are plain tallies of `students.placement_status` as stored. Nothing is
derived from documents or placement records here.

The dashboard query (`getProgramOperationsSummary`) is two small reads, the
batch list and four columns of the active roster, rolled up in memory. No
per-batch or per-program query.

### Why group by the student's program

The program filter on the Students and Placement pages matches
`students.program`. Counting by the same field means a dashboard number and the
list it links to agree on who is PSW and who is ECEA.

## Dashboard

Program first. One card per supported program, PSW and ECEA, rendered through
the same component, each showing:

- program name and total students in current placement operations
- five large clickable stage counts: Documents Pending, Ready, Assigned,
  On Placement, Completed
- a quieter secondary line: Needs Review, On Hold

A program with nothing tracked still renders, with zeros and a one-line note
pointing at Batch Management.

Every count links to the existing Placement List, narrowed to the SAME
population the count was taken from and then filtered:

```
/placement?view=list&operations=current&program=ECEA&status=ready_for_placement
/placement?view=list&operations=current&program=ECEA&status=placement_started
/placement?view=list&operations=current&program=PSW&status=documents_pending
```

### The working scope: `operations`

Current placement operations is the DEFAULT working scope of every operational
screen. One URL parameter, resolved by one helper (`operationsScopeFrom` in
`src/lib/placement/operations.ts`), carries the choice everywhere:

| URL | Scope |
| --- | --- |
| `/placement`, `/students`, `/placement/planning` (no parameter) | current placement operations |
| `?operations=current` (what dashboard links spell out) | current placement operations |
| `?operations=all` | Show All Students: every active student, untracked and archived batches included |
| any other value | current placement operations (the default, never Show All) |

"Current" means exactly the inclusion rule above: active student, in a batch,
batch active, tracking on. `listPlacementStudents` and `listStudents` both
apply it to the joined student row through the same `isTrackedStudentRow`
helper the dashboard rule is built on, so a dashboard count, the Placement
default, and the Students default cannot drift apart. Program, status, batch,
search, document, returning, area, and partner all compose on top of whichever
scope is chosen.

The scope is not a filter. It is which population the filters run over, so:

- Clear filters drops every filter and keeps the scope where staff put it.
- Changing any filter keeps `operations=all` in the URL once it is chosen.
- Switching back to Current Operations simply removes the parameter.

Nothing is deleted, deactivated, archived, or changed by either side of the
switch.

### Placement

`/placement` opened without a parameter is current placement operations, on
the board and the list alike. The toolbar carries the one control, shown on
both views:

```
[ Current Operations ]  [ Show All Students ]
```

with a one-line note under it saying what the current choice includes. Show
All Students opens the broader existing population: every active student,
including untracked and archived batches, exactly the list the page showed
before this ticket.

The five summary blocks at the top of the page (`getPlacementCounts`) are
counted over the same scope the page is showing, and their links keep that
scope, so each block equals the length of the list its link opens. The list
heading reads "Current Placement Operations" or "All Students" accordingly.

Links into Batch Planning from the view switch keep the batch already chosen
and, when staff have chosen Show All, keep that too, so a historical batch
opens rather than an empty page.

Quick Access remains below the program summary. The "Needs Attention" section
now holds the one real attention count that already existed, Partner
Follow-ups Due. The student follow-up system is not built here.

The previous global counts (Ready for Placement, Awaiting Start, On Placement
across all active students) are no longer the main dashboard summary.

## Batch Management

Every batch shows three pills: Program, Status, and Placement Operations
(`Tracking` / `Not Tracking`). "Tracking" is the full rule, status active AND
flag on, so an archived batch with the flag still set reads Not Tracking.

Admins see a checkbox, "Track in Placement Operations", with the helper text:

> When enabled, active students in this batch appear in current placement
> dashboards and operational program counts. Turning this off does not delete,
> archive, or change any student records.

It saves on change through `setBatchPlacementTrackingAction`, which updates
exactly one column on one batch row. It does not change batch status, any
student's `is_active` or `placement_status`, any placement record, or any
document record, and it sends no email. The batch edit form does not carry the
flag, so Save Batch cannot change it either.

Permission is the existing batch rule, unchanged: admin only, enforced by the
0001 `admin update batches` policy. No new role, no new policy.

## Program filtering

`program` is a new URL-backed filter on Students (`/students`,
`/students/returning`, batch pages) and Placement (`/placement`, board and
list). Options: All Programs, PSW, ECEA. It composes with every existing filter
(search, batch, placement status, document status, returning, area, partner,
view). An unrecognised program is ignored, the same way an unrecognised status
is, and the list falls back to All Programs.

When a program is chosen, the batch select offers only that program's batches,
plus whichever batch is already in the URL. This is a pure list filter over
the batches the page already loads, not new client state.

## Students page

### Default scope

`/students` is current-operations-first. The default roster shows only active
students in active batches with `placement_tracking_enabled = true`, through
the same rule and the same `currentOperations` filter the Placement page uses
(`studentRosterFiltersFrom`). The same Current Operations / Show All Students
control sits above the search, and Show All Students restores the broader
existing active-student roster. Search and every filter work inside the chosen
scope, and Clear filters keeps the scope.

The three summary blocks (Total Students, Needing Placement, Placement Ready)
are counted over the scope on screen. `getStudentCounts` reads the roster once
and tallies it twice, `current` and `all`, so both numbers come from one
definition.

`studentFiltersFrom` is deliberately scope-free. It is what the batch page and
Previous / Returning read, and neither is narrowed: a direct link to an old or
archived batch keeps showing that batch's students.

### Program-first overview

The overview above the roster is PROGRAM, not one tall batch card after
another. Two compact sections, PSW and ECEA, side by side on desktop
(`lg:grid-cols-2`), each showing:

- the program code and full name
- the number of students in current placement operations for that program,
  which is the dashboard's own number (`getProgramOperationsSummary`, grouped
  by the student's program)
- the tracked active batches of that program as compact rows: batch name,
  schedule label and start date where present, current student count, and a
  View Batch action

A program with several tracked batches lists them in the same section, in
admin display order. A program with nothing tracked still renders, with zero
and a one-line note pointing at Batch Management, so ECEA is visible before
its first batch is switched on.

The section is built by `buildProgramOverview` in
`src/lib/placement/operations.ts`, which only ever places operational batches
(active AND tracked) under a program. An active batch nobody has switched on is
not shown there, and neither is an archived batch, whatever its flag says.

Previous / Returning is one compact row under the program grid. It is a view
over `is_returning`, never scoped.

### Historical access

Untracked and archived batches are not gone from the Students page:

- Show All Students adds a "Batches not in current operations" list under the
  program grid, the same compact rows, archived batches labelled, each with
  View Batch.
- The batch filter in the roster toolbar still offers every batch.
- `/students/batches/[batchId]` opens any batch by direct URL, tracked or not,
  archived or not, and shows its students normally. Viewing a batch changes
  nothing.
- Batch Management lists every batch with a View Batch link.

The large `BatchCard` component is no longer used by the Students page. It
remains in `src/components/students/BatchCard.tsx` for reuse elsewhere.
`StudentRow.tsx` is untouched; the progress-card redesign is PLACEMENT-07C.

## Batch Planning

Batch Planning is an operational tool, so its batch selector defaults to the
batches staff are actually planning: `status = active AND
placement_tracking_enabled = true`, through the shared `batchChoicesForScope`
helper. April / June-style untracked batches do not appear in the default
list. The default batch, when the URL names none, is the most recent tracked
active batch by start date (`resolveBatch`), falling back to the most recent
active batch when nothing is tracked yet and to the most recent batch of any
status when everything is archived.

Historical access stays:

- "Show all batches" beside the selector (`?operations=all`) lists every
  batch in admin order, archived ones labelled `(Archived)` and untracked ones
  `(Not Tracking)`. "Current batches only" switches back.
- A direct URL to any batch (`?batch=<id>`) still opens that batch whatever
  its status or flag, and that batch is always added to the selector so the
  select shows what the page shows. Existing historical links do not break.
- Choosing a batch keeps the scope in the URL.

The Board and List links from the planning view switch carry the batch being
planned and, for a batch outside current operations, `operations=all`, so a
planner never lands on an empty board for the batch they were just looking at.

No analytics, no new roll-up, and no change to what the page computes for a
batch: that is PLACEMENT-07B.

## What this ticket does NOT do

- No deletion, archiving, deactivation, or cleanup of any student or batch.
- No change to April / June students. Their batches simply receive
  `placement_tracking_enabled = false`, like every other existing batch.
- No change to placement history, document readiness, placement-status
  synchronization, the assignment lifecycle, partner data, city-to-area
  mapping, what Batch Planning computes for a batch, the email system, Resend,
  the webhook, activity polling, or RLS.
- No edit to migrations 0001 through 0009, and 0010 is unchanged since it was
  written.
- No new enum or table for programs, and no Admin -> Programs screen.
- No student progress cards (PLACEMENT-07C) and no Batch Planning analytics
  (PLACEMENT-07B).

## After deployment

1. Apply `0010_batch_placement_tracking.sql`. Every batch starts untracked and
   the dashboard shows zeros.
2. In Admin -> Batches, tick "Track in Placement Operations" on the current
   PSW batch and on the current / new ECEA batch.
3. Old batches stay exactly as they are and remain browsable under Show All
   Students on the Students and Placement pages, from Batch Management, from
   "Show all batches" in Batch Planning, and by direct URL to the batch page.

Until step 2 is done, the default Placement and Students screens show no
students and say so, with a pointer to Batch Management and to Show All
Students. Nothing is hidden for good.

## Consistency

One rule, one resolver, no restatement:

| Surface | Reads |
| --- | --- |
| Dashboard counts | `buildProgramOperationsSummary` over `isTrackedStudent` |
| Dashboard drill-downs | `programOperationsHref` -> `operations=current` -> `isTrackedStudentRow` |
| Default Placement scope | `placementFiltersFrom` -> `operationsScopeFrom` -> `isTrackedStudentRow` |
| Placement summary blocks | `getPlacementCounts` over `isTrackedStudent`, same scope as the page |
| Default Students scope | `studentRosterFiltersFrom` -> `operationsScopeFrom` -> `isTrackedStudentRow` |
| Students summary blocks | `getStudentCounts` over `isTrackedStudent` |
| Students program overview | `buildProgramOverview` over `isOperationalBatch`, counts from `getProgramOperationsSummary` |
| Batch Planning default choices and default batch | `batchChoicesForScope` and `resolveBatch` over `isOperationalBatch` |

## Checks

`npm run check:programs` (193 checks) covers: PSW / ECEA accepted by both
forms with PSW still the default; the operational rule (active + on included,
active + off excluded, archived + on excluded, no batch excluded, inactive
excluded); program totals and status counts that exclude the old untracked
batch; program filtering alone, with status, with batch, with every other
filter, and with an invalid value; `operations` parsing (absent and `current`
are the default scope, only `all` widens it, unknown values are the default
and never Show All), the scope not counting as a filter, and URL round trips;
every dashboard count equalling the length of the list its link opens over the
same fixture roster; the tracking update being exactly one key; and the
migration statements containing no drop, delete, update, insert, policy, or
grant.

The default-scope section proves, over the same fixture roster:

- the default Placement scope excludes untracked active batches, archived +
  tracking true, and no-batch students, and equals the dashboard population
- Show All restores the broader Placement population, April and archived
  included, and program, batch, status, and Clear filters compose inside it
- the default Students scope excludes untracked active batches and equals the
  Placement default; the scope-free filters used by the batch and returning
  pages never carry the scope
- Show All restores the broader Students population and search, status,
  program, batch, and Clear filters compose inside it
- the program overview renders PSW and ECEA in order with code, full name, and
  the dashboard's count, lists only tracked active batches of each program,
  lists several in order, and carries name, schedule label, start date, and
  count on each row
- an active + not tracked batch is not shown in the overview
- an archived + tracking true batch is not shown in the overview
- both programs still render when nothing is tracked, and ECEA renders with
  zero when only PSW is tracked
- Batch Planning default choices contain tracked active batches only, the
  default batch is the most recent tracked one, a direct URL to an untracked
  or archived batch still opens it and adds it to the choices, Show all lists
  every batch, and choosing a batch keeps the scope

`npm run check:email` (118 checks), `npm run lint`, and `npm run build` pass.

## Later tickets

- **PLACEMENT-07B** Batch Planning enhancement.
- **PLACEMENT-07C** Student Progress Cards (the `StudentRow.tsx` redesign).
