# Student Placement Assignment and the Placement Board

How a student gets connected to a placement partner, and the board staff run
that work from. Built in PLACEMENT-04 on top of the students and batches of
PLACEMENT-01, the document readiness of PLACEMENT-02, and the partner network of
PLACEMENT-03.

## Purpose

The Placement Board answers one operational question:

> Which student needs a placement, where can we place them, and what has already
> been assigned?

and, once someone is placed:

> Did that finish their placement, or only part of it?

That is the whole scope. This is not a pipeline CRM. There are no stages beyond
the five columns, no automated matching, and nothing that happens on its own.

## Relationship model

A **placement** is one row in `student_placements`: this student, at this
partner, from this date, assigned by this person. It is the link the product
rules call for, and it is the only place that link lives.

```
students  1 ────< student_placements >──── 1  placement_partners
```

A student may have **many** placement rows over time. At most **one** of them
may be active at any moment. Rows are never deleted.

Each row is one placement **segment**: this student, at this partner, for this
stretch of time. A student is not required to do their whole placement at one
partner.

### Two different completions

This is the distinction the whole model turns on, and the two are deliberately
kept apart:

| Field | Lives on | Means |
| --- | --- | --- |
| `students.placement_status` | the student | the ONE high-level summary of the student's WHOLE placement requirement |
| `student_placements.status` | one placement row | what happened to THAT segment, at THAT partner |

So:

- `student_placements.status = completed` - this placement finished
- `students.placement_status = placement_completed` - the student's placement
  requirement is finished

Neither implies the other. A real example the system has to hold without
flinching:

```
Placement 1   Bayview LTC     ended_early   120 credited hours
Placement 2   Riverside LTC   completed     180 credited hours
------------------------------------------------------------
Student       placement_completed           300 credited hours
```

PLACEMENT-04 adds no second summary field on the student. It only makes the
existing one follow the facts.

## Data model

Created by `supabase/migrations/0006_student_placements.sql`, which is purely
additive: it rewrites nothing in 0001 through 0005, drops, renames, and retypes
no column, re-imports no student and no partner, and infers no historical
placement from any previous spreadsheet.

### student_placements

| Column | Notes |
| --- | --- |
| `id` | uuid primary key |
| `student_id` | references `students`, `on delete restrict` |
| `partner_id` | references `placement_partners`, `on delete restrict` |
| `status` | `assigned`, `started`, `completed`, `ended_early`, `cancelled` |
| `assigned_at` | when the assignment was made |
| `assigned_by` | references `profiles`; kept even after the placement ends |
| `planned_start_date`, `planned_end_date` | `DATE`, both optional |
| `actual_start_date`, `actual_end_date` | `DATE`, both optional |
| `assignment_note` | one short line about THIS assignment |
| `credited_hours` | `numeric(7,2)`, the final hours staff accept for this segment |
| `completion_note` | the Completion / Transfer note |
| `end_reason` | why an `ended_early` segment stopped |
| `cancelled_at`, `cancellation_reason` | set when an assignment is cancelled |
| `created_at`, `updated_at` | timestamps |

Dates are real `DATE` columns, not timestamps. A placement start is a **day**,
and widening it into a moment is how a placement starting on the 27th ends up
displayed as the evening of the 26th.

`actual_end_date` is captured by Finish Placement. `actual_start_date` exists so
a historical placement can be recorded by hand without another migration.

`credited_hours` is **one number, entered once**: the total staff accept for that
segment. It is not a timesheet, not attendance, and not the start of an hours
system. Nothing accrues into it and nothing reads back out of it except a plain
sum.

The three reason fields never overlap, and a trigger enforces it:

| Status | Reason lives in | Hours |
| --- | --- | --- |
| `completed` | `completion_note` | credited |
| `ended_early` | `end_reason`, plus `completion_note` | credited |
| `cancelled` | `cancellation_reason` | always null |

An `assigned` or `started` row has no ending at all, so every ending field on it
is cleared.

### At most one active placement

```sql
create unique index student_placements_one_active_idx
  on public.student_placements (student_id)
  where status in ('assigned', 'started');
```

A partial unique index, so a student may accumulate any number of completed,
ended-early, and cancelled rows while the database still refuses a second live
one. That is exactly what lets a student finish part of their placement at one
partner and continue at another.

This is a **constraint**, not an application convention: no server action, drag
gesture, or concurrent request can create a double placement. The application
turns the resulting unique violation into a plain sentence.

### Placement hold

Two additive columns on `students`:

- `placement_hold_reason` - one short optional line
- `placement_hold_at` - when the current hold started

A hold is a pause, not a stage, and not a history. PLACEMENT-04 deliberately
does not build a hold-history table.

## Placement record statuses

| Status | Means | Who sets it |
| --- | --- | --- |
| `assigned` | matched with a partner, not started yet | assigning a placement |
| `started` | the student is actively on placement at this partner | PLACEMENT-05, or a historical record entered by hand |
| `completed` | THIS placement segment finished successfully | Finish Placement |
| `ended_early` | the student really worked here, but the placement ended before its expected completion. They may continue elsewhere | Finish Placement |
| `cancelled` | the assignment was withdrawn before any meaningful placement happened | Finish Placement |

`assigned` and `started` are the two **active** statuses; only one of them may
exist per student at a time. `completed`, `ended_early`, and `cancelled` are
**historical** and stay permanently visible.

The two active statuses are **not** interchangeable to the interface, and this
is the line the whole ending model is drawn on:

```
assigned  ──► started ──► completed
   │                  └─► ended_early
   └────────────────────► cancelled
```

An **assigned** placement has not happened yet, so it can be started or
cancelled. A **started** placement has, so it can only be finished. A student
who was actually at a partner was not "cancelled", and their hours have to be
credited somewhere.

`started -> cancelled` is not offered anywhere in the application. The CHECK
constraint still permits the value so a mis-entered record can be corrected in
SQL, but no ordinary path produces it.

### ended_early is not a cancellation

This is the rule staff care about most. A student who worked 120 hours at a
partner and then moved has **not** had a cancelled placement. They had a real
one that ended early, their hours still count, and the record should say so a
year later.

Cancellation is reserved for an assignment that never meaningfully proceeded -
the partner postponed their intake, the student never attended, the assignment
was recorded in error. A cancelled row credits no hours, and the database nulls
`credited_hours` on it rather than trusting a caller not to set them.

The interface enforces the distinction by never putting the two in the same
place. Cancel Assignment lives on an assigned placement and Finish Placement
lives on a started one, so a transfer can never be recorded as a cancellation by
picking the wrong item in a list.

## Readiness mapping

`students.document_status` is itself derived from the 13-requirement checklist by
`sync_student_document_status()` in 0002. PLACEMENT-04 never re-implements those
rules, in SQL or in React. It only maps the summary:

| `document_status` | `placement_status` |
| --- | --- |
| `not_reviewed` | `needs_review` |
| `pending` | `documents_pending` |
| `ready` | `ready_for_placement` |

That mapping is `public.placement_status_for_documents()`, and it applies **only
while a student is still pre-placement**.

### What is never overwritten

A student in any of these is left exactly where staff left them when their
documents change:

- `placement_assigned`
- `placement_started`
- `placement_completed`
- `on_hold`

The rule is enforced in one `BEFORE INSERT OR UPDATE` trigger on `students`,
`students_placement_guard()`:

1. **Authority.** Setting or changing `placement_status` or the hold columns by
   hand requires `can_manage_placements()`. It fires only for a real change, so
   an ordinary student edit by any staff member passes untouched.
2. **Readiness.** When `document_status` changes and the caller did not set a
   `placement_status` of their own, a pre-placement student follows their
   documents. Everyone else is left alone.

Doing it in a `BEFORE` trigger rather than a second `UPDATE` means no recursion
and no extra write.

`placement_completed` is protected twice over. The document guard never moves it,
and the placement trigger refuses to reset a student who already holds it, so no
later edit to a history row can quietly undo staff saying a student had finished.
Only an explicit `finish_student_placement()` call sets it in the first place.

The migration also runs a one-time synchronisation over existing students. It
touches only students who are still pre-placement, and only where the mapped
value actually differs, so no historical or manually corrected record is
regressed. It creates no placement rows and guesses no partner.

## Assignment behaviour

From a Ready student, **Find Placement** opens `/placement/find/[studentId]`.

1. Student context is shown first: name, batch, city, document readiness, and
   whether a Final Placement Package has been uploaded.
2. The partner network is searched and filtered by **Area** and
   **Availability**. Partners marked Available Now are visually preferred, but
   Unknown and Upcoming partners are never hidden: an unverified partner is not
   a closed one.
3. Staff **choose** a partner. Nothing is matched automatically. There is no
   distance calculation, no recommendation, and no AI.
4. A short confirmation form collects Planned Start Date, Planned End Date, and
   an Assignment Note. **All three are optional.** A placement that is real
   today should never wait on a date nobody has agreed yet.

Assigning is a single INSERT. `students.placement_status` becomes
`placement_assigned` through a trigger on `student_placements` rather than a
second write from the application, so the summary cannot drift out of step with
the real relationship. The same trigger releases any hold the student was under,
because a live placement and a hold are contradictory states.

That trigger deliberately **never** sets `placement_completed`. Finishing a
placement at one partner is not the same as finishing the requirement, and only
a staff member can say which just happened - so only
`finish_student_placement()` writes that status, and only when they say yes.

Partner availability is **not** touched. It stays independent operational
information about the organization. There is no capacity, no slot count, and
nothing is reserved.

## Starting a placement

**Start Placement**, on `/students/[studentId]/placement`, is the one step
between assigning a student and finishing their placement. It sets
`status = started`, records an optional **Actual Start Date**, and moves the
student to `placement_started` through the same trigger that handles every other
placement fact.

That is all it does. It is not a check-in, not attendance, and not the start of
an activity log - what happens *during* a placement is PLACEMENT-05. It exists
because it is the moment the two endings diverge, and staff have to be able to
say when it happened.

## Cancelling an assignment

**Cancel Assignment** is offered only on an **assigned** placement, because
cancelling means the placement never meaningfully started.

It is deliberately much smaller than Finish Placement:

- one optional **cancellation reason**
- `status = cancelled`, `cancelled_at = now()`
- no outcome to choose, and no hours - the database nulls `credited_hours`
- **it never asks whether this completes the placement requirement.** Nothing
  happened at that partner, so there is nothing to have completed

A trigger then restores the student's high-level status from their **current
document readiness**, which is the only honest answer: cancelling says nothing
about where else the student should go, so no other partner is guessed.

It is an ordinary `UPDATE` under RLS, guarded with `status = 'assigned'` so a
placement started in another tab is never written over. The row is kept as
history, and the confirmation says in plain words what to do instead if the
student has already been at the partner.

## Finishing a placement

**Finish Placement** is offered only on a **started** placement - one the
student actually participated in. It asks two questions, in the order staff
actually think about them.

### 1. What happened at this partner?

| Outcome | Record status | Meaning |
| --- | --- | --- |
| Completed at this Partner | `completed` | the student finished this placement |
| Ended Early / Transferred | `ended_early` | the student really worked here, but it ended before completion |

Cancellation is **not** one of the outcomes, and
`finish_student_placement()` refuses both a `cancelled` status and a placement
that has not started.

Then the form captures:

- **Actual End Date** - required
- **Credited Hours** - optional; the one number staff accept for this segment
- **Completion / Transfer Note** - optional
- **why it ended early** - shown for Ended Early only, and stored in
  `end_reason`

### 2. Does this complete the student's full placement requirement?

The important question, and the one the application refuses to answer on the
student's behalf. Staff must pick.

**Yes** - `students.placement_status` becomes `placement_completed`. The student
leaves the working board and is reachable through the Placement Completed
summary, List View, and their own placement history.

**No** - the student returns to the pre-placement status their **current
document readiness** puts them in: normally `ready_for_placement`, otherwise
`documents_pending` or `needs_review`. They come straight back to the board and
another placement can be assigned at another partner.

The question is not asked at all when an assignment is cancelled, because a
cancellation can never answer yes.

### One function, both writes

Both writes happen inside `finish_student_placement()` in 0006, so a placement
can never end without the student summary following it:

```sql
select public.finish_student_placement(
  p_placement_id          => ...,
  p_status                => 'ended_early',
  p_actual_end_date       => '2026-06-19',
  p_credited_hours        => 120,
  p_completion_note       => 'Transferring closer to home',
  p_end_reason            => 'Family relocation',
  p_completes_requirement => false
);
```

Cancellation does **not** go through this function. It has neither of these
decisions to make, so routing it here would mean asking staff two questions that
do not apply to it.

The row is **never deleted**. It stays in the student's placement history and in
the partner's past placements, with its dates, its credited hours, and its note,
where a year later they are usually the most useful lines on the page.

## Credited placement hours

`credited_hours` is the whole hours model and it is deliberately tiny: one
accepted total per placement segment, entered once when the placement is
finished.

**Total Credited Placement Hours** on a student is a plain sum of
`credited_hours` across every placement that was not cancelled, the current one
included. That is all it is. There is no accrual, no target, no remaining-hours
calculation, and no hour tracking behind it.

`None credited yet` and `0 hours` are different facts and are shown
differently.

## On Hold

Staff may put any student On Hold, with an optional one-line reason. It is the
one board column a card may simply be dragged into, because it is the one state
that is purely a staff decision.

Releasing a hold is **never blindly "Ready"**. `release_student_placement_hold()`
resolves where the student belongs from the facts, in one statement so the status
and the hold columns can never disagree:

1. their live placement record if they still have one, which restores
   `placement_assigned` or `placement_started`
2. otherwise their current document readiness

A student who is already `placement_completed` is left there: that answer was a
deliberate staff decision and nothing automatic undoes it.

## The Placement Board

`/placement`, heading **Placement**, subtitle *Track student readiness and
placement assignments.* Two views: **Board** (the default) and **List**.

### Working columns

| Column | Colour |
| --- | --- |
| Needs Review | slate |
| Documents Pending | amber |
| Ready for Placement | green |
| Placement Assigned | indigo |
| On Hold | coral |

The same controlled palette as the Partner Area Board, rendered by the same
module, so the two boards read as one product. Columns are softly tinted; the
student cards on them stay white.

A student whose placement finishes **without** finishing their requirement comes
straight back to one of these columns - normally Ready for Placement - so they
can be placed at another partner. That return is the trigger's doing, not the
board's: the student's status genuinely is what their documents say again.

Only a student whose **whole requirement** is complete leaves the board. They
are history, reachable through the Placement Completed summary block, List View,
and their own placement history, and they must not crowd out the students who
still need work.

Students whose placement has already **started** get a small "Placements Already
Started" summary below the board rather than a column. Finishing one of those is
done on the student's own placement page.

### Student cards

Name, student number, batch, city, `X of Y ready` document readiness, document
status, the current partner and planned start when assigned, the hold reason when
on hold, and a comments count. Actions: **Open Student**, **View Assignment**,
**Find Placement**, **Put On Hold** / **Release Hold**.

The readiness numbers come from the `student_document_readiness` view - the same
source the checklist and the student page use.

### Drag never fakes a placement

Placement state is business logic, not a card position. Dragging a card towards
either edge auto-scrolls the **board**, never the page, exactly like the Area
Board. But only the moves that are honestly a staff decision do anything:

| Drag | Result |
| --- | --- |
| any column -> On Hold | puts the student on hold |
| On Hold -> any column | releases the hold, back to whatever the facts say |
| Ready -> Placement Assigned | opens **Find Placement** |
| Assigned -> anywhere | refused: cancel the assignment or finish the placement first |
| between the three document columns | refused: change the documents |

A refused drag says **why**, so staff learn the rule instead of wondering why the
card sprang back. Every action a drag can take is also a plain button on the
card, which is how the board works on a tablet and for keyboard users.

Four summary blocks sit above the board: Ready for Placement, Placement
Assigned, On Hold, and Placement Completed. Each is a link into List View
filtered to that status, which is how a completed student is found again.

### List View

Search by student name, student number, or partner name. Filters for Batch,
Placement Status, Document Status, Area of the current placement partner, and
Partner. Comfortable rows, not a spreadsheet. Students whose placement
requirement is complete are visible here, because this is where history
belongs.

## Student integration

`/students/[studentId]` gains a **Placement** section with three clearly
separate parts, because these are the three things that get confused:

1. **Overall Placement Status** - where the student is on their whole placement
   requirement, with their total credited hours beside it.
2. **Current Placement**, if there is one - partner, area, partner availability,
   assigned date, assigned by, planned start, planned end, and the assignment
   note, with **Open Partner** and **View Placement**. The partner's full
   profile is never duplicated here.
3. **Placement History** - one line per finished placement: partner, outcome,
   end date, and credited hours, under a **Total Credited Placement Hours**
   line.

Putting a student on or off hold is done from this section.

`/students/[studentId]/placement` is the focused page: the current placement in
full, an editable planned start / planned end / assignment note, the complete
**Placement History**, and the action that matches where the placement actually
is:

| Placement status | Actions offered |
| --- | --- |
| `assigned` | **Start Placement**, **Cancel Assignment** |
| `started` | **Finish Placement** |

Each historical row shows partner, status, assigned date, actual start, actual
end, credited hours, and the completion or transfer note, with the total
underneath. History labels the three endings plainly: **Completed**, **Ended
Early**, **Cancelled**.

The partner on a placement is never edited. Moving a student somewhere else is
finishing this placement and assigning a new one, so the history keeps saying
what actually happened at each partner.

## Partner integration

The **Current Placements** placeholder on `/placement-partners/[partnerId]` is
now real.

**Current Placements** - `assigned` and `started`: student name, student number,
batch, placement status, planned start, and **Open Student**.

**Past Placements** - `completed`, `ended_early`, and `cancelled`: the same, plus
the end date, the credited hours, and the outcome line. A transfer reads as
*Ended early: family relocation*, never as a cancellation, so the partner's own
record says what actually happened there, and a cancellation reads as an
assignment that never began rather than a student who left.

No check-ins, no attendance, no timesheets. `credited_hours` is one accepted
total per placement; what happens during a placement is PLACEMENT-05.

## Comments

There is no second notes system. Student context stays in student comments,
partner context stays in partner comments, and a placement carries exactly one
short `assignment_note`. Placement-specific activity history is PLACEMENT-05.

## Permissions

| Role | Placement |
| --- | --- |
| `admin` | assign, start, cancel, finish, change planned dates, hold and release |
| `placement_manager` | the same |
| `management` | read only |

The database is the security boundary, in two layers:

- **RLS on `student_placements`**: every active staff member may read; only
  `can_manage_placements()` may insert or update. There is no delete policy, and
  a `BEFORE DELETE` trigger refuses a delete at the table itself.
- **`finish_student_placement()`**: `SECURITY DEFINER`, but it checks
  `can_manage_placements()` itself and says so in plain language, and it refuses
  anything that is not a started placement being completed or ended early.
- **Starting and cancelling** are ordinary `UPDATE`s under the same RLS policy,
  each filtered on `status = 'assigned'` so a concurrent change is reported
  rather than overwritten.
- **The students guard trigger**: the `students` UPDATE policy from 0001 is open
  to every active staff member and 0001 is not rewritten, so the trigger is what
  keeps management read-only over `placement_status` and the hold columns.

Nothing is granted to `anon`.

## Historical placements

Old placements are **not** inferred from previous spreadsheets. No name and no
exception is hard-coded anywhere. `actual_start_date` and `actual_end_date`, the
five record statuses, `credited_hours`, and the fact that a student may hold many
rows are all present so staff can enter a historical placement by hand when they
choose to - including a student who split their placement between two partners
before this system existed.

## The PLACEMENT-05 boundary

PLACEMENT-04 stops at the assignment and its controlled ending. It deliberately
does **not** build:

- daily attendance, timesheets, check-ins, hour-entry logs
- evaluations, employer signoff workflows
- capacity, slot reservation, distance, or automatic matching
- reminders, email, SMS, employer feedback
- a completion package

`credited_hours` is the clearest boundary line in the ticket: one number staff
type in when a placement finishes, and nothing else. It is deliberately **not**
the first row of an hours table.

**Start Placement** is the one thing PLACEMENT-04 takes from what used to be
described as PLACEMENT-05's workflow, and only because the two endings cannot be
told apart without it. It is a single status change with an optional date. The
check-ins, attendance, and activity history that surround a real placement
remain untouched.
