# PLACEMENT-07B - Batch Planning Visibility Enhancement

## Status

**Implemented. No migration.**

Batch Planning now answers, for one selected PSW or ECEA batch and at a
single glance: how many students there are, where they live, which Placement
Areas those cities map into, where each student is in the placement
lifecycle, what placement-document work is still outstanding, who has to act
on it (the student or staff), what partners exist in those Areas, and where to
focus next.

Everything is derived at read time. This ticket adds no table, no column, no
cached total, no analytics table, and no stored area on a student. It changes
no placement status rule, no document readiness rule, no email, no Resend or
webhook behaviour, and no historical batch or student.

| Area | Where |
| --- | --- |
| Batch grouping, city rows, Find Placement rule (pure) | `src/lib/planning/batch.ts` |
| Document needs summary (pure) | `src/lib/planning/needs.ts` |
| URL state, the three new parameters, the view resolver (pure) | `src/lib/planning/filters.ts` |
| Planning vocabulary | `src/lib/planning/constants.ts` |
| The bulk checklist read | `src/lib/planning/queries.ts` (`readBatchChecklist`) |
| Page | `src/app/(app)/placement/planning/page.tsx` |
| Executive summary | `src/components/planning/BatchSummary.tsx` |
| Where Students Live | `src/components/planning/CityBreakdown.tsx` |
| What This Batch Needs | `src/components/planning/BatchNeeds.tsx` |
| Compact planning student rows | `src/components/planning/PlanningStudentList.tsx` |
| Area cards | `src/components/planning/AreaCard.tsx` |
| Checks | `scripts/check-batch-planning.ts` (`npm run check:planning`) |

## Purpose

PLACEMENT-05A built the city to area bridge and PLACEMENT-07A made the batch
selector operational. What was still missing was the operational picture of
the batch itself. A planner opening a batch could see Area cards, but not, on
one screen, which documents the batch was waiting on or whether the waiting
was on the student or on staff. This ticket adds that picture without changing
what any of the underlying numbers mean.

## No migration

Every number on the page already existed in the database:

| Question | Source |
| --- | --- |
| How many students, in which stage | `students.placement_status`, taken as stored |
| Where they live | `students.city`, normalized the PLACEMENT-05A way |
| Which Area a city is in | `placement_area_cities` and `placement_areas` |
| What documents are outstanding | `student_placement_documents.status` per requirement |
| Document readiness X of Y | the existing `student_document_readiness` view |
| Current partner | the existing live `student_placements` record |
| Partners in an Area, their availability | `placement_partners` |

Nothing was impossible without schema work, so no migration was written.

## Page hierarchy

```
Batch (selector, PLACEMENT-07A defaults)
  -> Batch summary            name, program, total, five stages, two exceptions
  -> Where Students Live      city, count, Placement Area
  -> What This Batch Needs    Student Action Needed / Staff Review Needed
  -> Placement Areas          one card per Area holding a student
  -> Unmapped City / City Missing cards (unchanged, only when non-zero)
  -> drill-downs              students + partners
```

## Batch summary

The header shows the batch name, the program, the start date, and the total
number of active students in the batch. Under it, five large tiles in
lifecycle order and two smaller ones:

```
Documents Pending   Ready   Assigned   On Placement   Completed
Needs Review   On Hold
```

The labels are the same five primary stages the program dashboard uses. Each
count is a plain tally of `students.placement_status` for the active students
of the batch. Nothing is re-derived from documents or placement records, and
the seven always add up to the total.

Every tile is a link to the students in this batch with that status
(`?batch=<id>&status=<placement_status>`). That batch-wide status drill-down
is new; before this ticket `status` only filtered inside an Area.

## Where Students Live

One row per normalized city across the whole batch, largest first, with the
student count and the Placement Area the city maps to:

```
Mississauga     5     Peel
Brampton        3     Peel
Etobicoke       1     Unmapped
Oshawa          1     Needs Area Review - mapped to Durham, which is archived
City Missing    1     Needs attention
```

Rules, all inherited from PLACEMENT-05A and not restated anywhere:

- Grouping uses `normalizeCityName` (trim, collapse whitespace, lowercase).
  The row label is the spelling staff used most often. No student's city is
  rewritten.
- A mapped city shows its active Area in the Area's own colour.
- An unmapped city says Unmapped. No Area is guessed.
- A city mapped to an archived Area says Needs Area Review and names the
  archived Area.
- City Missing is its own row, always last, for students with no city.
- The counts add back to the batch total; every student is in exactly one
  row.

Each city row opens the students from that city (`?city=<normalized>`). The
City Missing row opens the existing `exception=missing` view.

## Area summary

Area cards keep their PLACEMENT-05A shape and now show:

- total students in this Area from this batch
- the five lifecycle counts: Documents Pending, Ready, Assigned, On
  Placement, Completed
- Needs Review and On Hold as pills, only when non-zero
- the cities represented, with counts
- "N partners, M available now", plus the availability breakdown
- partner follow-ups due, where any
- the neutral observation

Partner count is still never capacity, and the observation still never
subtracts one count from the other.

## What This Batch Needs

Counted from the actual `student_placement_documents` rows of the students in
the batch, against the ACTIVE requirement definitions. Two sides, kept apart:

### Student Action Needed

Checklist status `requested` or `needs_update`. Grouped by requirement,
largest first, with the number of distinct students:

```
Vulnerable Sector Police Check Certificate    5 students
Standard First Aid & CPR Certificate - Level C 3 students
Serology Report                               2 students
WHMIS Certificate                             1 student
```

### Staff Review Needed

Checklist status `not_reviewed`. Headline first, requirement rows under it:

```
4 students have checklist items not yet reviewed.
```

Not Reviewed is a staff state. It is never described as a missing student
document, and the drill-down says so in words: the student may already have
sent it.

### Rules

| Status | Where it appears |
| --- | --- |
| `requested` | Student Action Needed |
| `needs_update` | Student Action Needed |
| `not_reviewed` | Staff Review Needed |
| `received` | nowhere: complete |
| `not_applicable` | nowhere: exempt |

- The split is `EMAIL_ACTION_NEEDED_STATUSES` from the email work, reused,
  so a requirement Batch Planning calls a student action is exactly one a
  reminder email would ask the student for.
- Only active requirements count, the same rule the reminder email and the
  readiness view apply. An archived requirement's old rows are never listed.
- An optional requirement is listed when a student needs something on it and
  is labelled Optional. It never blocks readiness and the page does not claim
  it does.
- Rows for students outside the batch are ignored even if a read returned
  them.

Each requirement row and each headline count opens the matching students
(`?need=action|review&requirement=<id>`, requirement optional).

## Requirement privacy

- The checklist read selects `student_id, requirement_id, status` and
  nothing else. The internal `note` and the student-facing `student_message`
  are never selected, never passed to the summary, and never rendered.
- The requirement read selects `id, name, short_name, is_required,
  is_active, sort_order`. Descriptions are not read.
- The summary is requirement names and counts. The per-student line on a
  drill-down row is counts only: "2 student actions", "3 items not
  reviewed".
- The check script feeds the summary rows that DO carry a note and a student
  message and asserts neither string, and neither column name, appears in
  the output.

## Drill-downs

All URL-backed, nothing in client state:

| URL | Opens |
| --- | --- |
| `?batch=<id>` | overview |
| `?batch=<id>&status=<placement_status>` | every student in the batch with that status |
| `?batch=<id>&city=<normalized city>` | the students from that city, with status chips |
| `?batch=<id>&need=action` | every student with a requested / needs-update item |
| `?batch=<id>&need=action&requirement=<uuid>` | the students who need that requirement |
| `?batch=<id>&need=review` | every student with a not-reviewed item |
| `?batch=<id>&need=review&requirement=<uuid>` | the students whose item on that requirement is not reviewed |
| `?batch=<id>&area=<id>` (+ `status`, `availability`) | unchanged Area drill-down |
| `?batch=<id>&exception=unmapped|missing` | unchanged exception views |
| `?operations=all` | unchanged: every batch in the selector |

Resolution order when several are present: exception, area, city, need,
status, overview (`planningView`). Every link from the overview resets the
other drill-down keys and keeps the batch and the scope
(`planningDrilldownHref`).

Validation:

- `city` is normalized the same way a student city is, and blank or
  over-long values open nothing.
- `need` is only "action" or "review".
- `requirement` is accepted only as a well-formed UUID, and then only if it
  is an active requirement; otherwise the page says so and lists nobody.
- `status` is only a real placement status.

### Student rows

Every drill-down lists students through one compact row
(`PlanningStudentList`): name and number, program, city, current partner when
Assigned or On Placement, the attention line, the placement status pill, and
document readiness X of Y (the existing derived readiness, never
recomputed). A ready student with no live placement still gets Find
Placement, under the existing `canManagePlacements` permission, as a link
to the existing flow. This is not the PLACEMENT-07C progress card.

### Partners

The Area partner list is unchanged in content: partner, type, location,
contacts, follow-up, primary contact, availability pill, next intake where
upcoming. Available Now sorts first and is outlined green. The Area title now
also reads "N partners, M marked Available Now", and the neutral observation
now reads, for example:

> 4 students are ready for placement. No partner in this Area is currently
> marked Available Now.

## PSW and ECEA

One page, one grouping, one needs summary, one student row. `batch.program`
is displayed in the header; every count comes from the batch's own students
and checklist rows. The check script runs a PSW fixture and an ECEA fixture
through the same functions.

## Historical batches

Unchanged from PLACEMENT-07A: the selector defaults to tracked active
batches, "Show all batches" lists every batch, and a direct URL to any batch
opens it. Every new drill-down keeps the batch and the scope in the URL, so
a historical link stays historical when a city or a requirement is clicked.

## Performance

Reads per page load, in three hops and never per student:

1. batches, areas, city mappings, session
2. the batch's students (readiness and the live placement already joined by
   `listPlacementStudents`), partners, primary contacts
3. the active requirement list and the checklist rows for the batch's
   student ids, in one bulk `.in()` read sliced at 200 ids
   (`readBatchChecklist`)

Grouping, city rows, and the needs summary are computed in memory. No
client-side request, no request waterfall in the browser.

## Serology and Blood Report: inspection only

Nothing about either requirement was changed. Findings from the code and
the migrations (the live database was not queried):

- Both exist as separate rows, seeded by `0002_placement_documents.sql`:
  `Serology Report` (short name Serology, sort 10) and `Blood Report` (short
  name Blood, sort 40). Both are required and active as seeded.
- No later migration renames, archives, merges, or deletes either. The check
  script asserts this.
- Both have checklist rows for every student: `0002` runs
  `initialize_all_placement_documents()` and the backfill trigger creates a
  row per student per active requirement, so every student has a row for
  each. Whether staff have actually set statuses on both in the live
  database cannot be known offline.
- Neither carries files. `0003` retired per-document file columns; only the
  merged Final Placement Package holds a file.
- Both are part of the readiness denominator (active AND required). Neither
  row carries a description, and no document in the repository says what
  distinguishes them, so whether they are one operational concept or two is
  a decision for staff, not something the code can infer.

What a future consolidation would take:

- Archiving one requirement in Admin (`is_active = false`) needs no
  migration, but it changes readiness for EVERY student immediately: the
  denominator drops by one and a student whose only outstanding item was
  the archived one becomes ready. That is a readiness change, so it must be
  a deliberate, announced decision, not a tidy-up.
- Merging statuses (carrying a `received` on one row over to the other) is a
  data migration on `student_placement_documents` and must not be done
  casually.
- A read-only query for whoever makes the decision:

```sql
select r.name, d.status, count(*)
from public.student_placement_documents d
join public.placement_document_requirements r on r.id = d.requirement_id
where r.name in ('Serology Report', 'Blood Report')
group by r.name, d.status
order by r.name, d.status;
```

## What this ticket does NOT do

- No migration, no cached totals, no analytics table.
- No change to `students.placement_status` rules, the readiness view, or
  any placement or document mutation. The planning surface imports no server
  action, and the check script asserts it.
- No email, no Resend, no webhook change.
- No placement follow-up tracking.
- No change to either Serology or Blood Report.
- No PLACEMENT-07C Students-page progress card. The compact planning row is
  a planning view only.
- No deletion or modification of any batch or student.

## Checks

`npm run check:planning` (104 checks, offline, no database, no email):

- A. status totals sum for PSW and ECEA; the five primary and two secondary
  stages cover every status
- B. city normalization, most-common-spelling label, counts adding back to
  the total, mapped / unmapped / needs-review / missing all explicit
- C. Area student count, stage counts, city breakdown, partner count,
  available-now count, follow-up due, the neutral observation text
- D. requested and needs_update as student action, not_reviewed as staff
  review, received and not_applicable omitted, archived requirement omitted,
  optional requirement labelled, one student across many requirements, one
  requirement across many students, no note / student message / description
  in the output, the attention line, id slicing
- E. requirement, city, and status drill-downs return the expected students;
  URL parsing, validation, priority order, reset-on-drill-down, round trips
- F. default choices remain tracked + active, direct historical URLs still
  open, Show all lists every batch, one code path for PSW and ECEA
- G. Find Placement only for a ready student with no live placement and
  behind the existing permission; the planning surface imports no action,
  performs no insert / update / upsert / delete / rpc, sends no email, and
  the checklist read selects only the three safe columns
- H. Serology and Blood Report are both seeded, untouched by later
  migrations, and this ticket adds none

`npm run check:programs` (193), `npm run check:email` (118), `npm run lint`,
and `npm run build` pass.

## Later tickets

- **PLACEMENT-07C** Student Progress Cards: the Students page `StudentRow`
  redesign. The per-student attention line here is a planning summary, not
  that card.
