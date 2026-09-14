# Active Placement

How a placement gets from "arranged" to "finished", and what the Placement
workspace shows while it is happening.

This document describes PLACEMENT-05B. It adds no status, no table, and no
column: the whole lifecycle it surfaces was built in PLACEMENT-04 and lives in
`supabase/migrations/0006_student_placements.sql`. 05B is the operational
interface over it.

## The two vocabularies

These are the most important sentences in this document, and confusing them is
the one mistake this module is designed to prevent.

| Column | What it describes |
| --- | --- |
| `student_placements.status` | ONE placement segment at ONE partner |
| `students.placement_status` | the student's WHOLE placement requirement |

So:

- `student_placements.status = 'completed'` means **that placement finished**.
- `students.placement_status = 'placement_completed'` means **the student is
  finished with placement altogether**.

One does not imply the other. A student may do part of their placement at one
partner and the rest at another.

## Assigned vs Started

A placement has two ACTIVE states, and they are different questions.

**assigned** - the student has been matched with a partner and has not begun.
The operational question is *when are they supposed to start, and have they?*
An assigned placement can still be **cancelled**, because nothing has happened
at that partner yet.

**started** - the student is at that partner right now. The operational question
is *when did they actually begin, and when should this end?* A started placement
can no longer be cancelled. It is **finished**, as completed or ended early,
because a student who was actually there was never "cancelled" and their hours
have to be credited somewhere.

The database enforces which endings are reachable from which state.
`finish_student_placement()` refuses an assigned placement outright, and the
Cancel Assignment action is scoped `.eq("status", "assigned")`.

## On Placement

**On Placement** means:

```
students.placement_status = 'placement_started'
```

with the student's active placement record at:

```
student_placements.status = 'started'
```

There is no third value and no derived flag. The trigger
`student_placements_sync_student_status()` in 0006 writes `placement_started`
onto the student the moment a placement row becomes `started`, so the two can
never disagree, and the whole application reads On Placement from one of those
two columns depending on whether it is asking about students or about
placements.

The same meaning is used everywhere:

| Surface | Reads |
| --- | --- |
| Placement Board, On Placement column | `students.placement_status = 'placement_started'` |
| Placement List, On Placement filter | the same |
| Placement page, On Placement summary | the same |
| Dashboard, On Placement | `student_placements.status = 'started'` |
| Dashboard, Awaiting Start | `student_placements.status = 'assigned'` |
| Batch Planning, On Placement | `students.placement_status = 'placement_started'` |
| Batch Planning, Awaiting Start | `students.placement_status = 'placement_assigned'` |

## The Placement Board

Six working columns:

```
Needs Review
Documents Pending
Ready for Placement
Placement Assigned
On Placement
On Hold
```

Placement Completed is deliberately **not** a column. A student whose whole
requirement is finished is history: they stay reachable through List View, their
own placement history, and a partner's Past Placements, and they do not crowd
the students who still need work.

A student whose placement ends **without** finishing their requirement comes
straight back to a working column, usually Ready for Placement, so they can be
placed at another partner.

### Board transition restrictions

The board is Kanban-shaped but the lifecycle is not a card position. Only three
drags do anything, and none of them is a lifecycle transition:

| Drag | Result |
| --- | --- |
| any column -> On Hold | puts the student on hold |
| On Hold -> any column | releases the hold, resolved from the facts |
| Ready for Placement -> Placement Assigned | opens Find Placement |

Every other drag is refused **with a reason naming the action that does it**:

| Attempted drag | Refused, because |
| --- | --- |
| Assigned -> On Placement | Start Placement. A placement never starts because a date arrived. |
| On Placement -> anything | Finish Placement, which asks whether the requirement is complete. |
| anything -> On Placement | a student has to be assigned and then started. |
| within the first three columns | those come from the document checklist. |

Every action a drag can take is also a plain button on the card, so the board
works on a tablet and for keyboard users.

## Placement Assigned cards

Show the student, their student number, the partner, the planned start date and
the planned end date.

Two computed attention indicators, from `src/lib/placement/attention.ts`:

| When | Shows |
| --- | --- |
| `planned_start_date` is today | **Starting Today** (blue) |
| `planned_start_date` has gone by, still assigned | **Start Date Passed** (amber) |

Both are **observations**, never events. Nothing acts on them. A placement whose
planned start date has gone by is still waiting for a staff member to confirm
that the student actually turned up.

Actions: **Start Placement**, Open Student, Open Partner, and Assignment
Details, where Cancel Assignment lives with the full explanation of what
cancelling means.

## On Placement cards

Show the student, their student number, the partner, the **actual** start date
and the planned end date. Green, where an assigned card is blue, because one
placement is arranged and the other is happening.

Three computed attention indicators:

| When | Shows |
| --- | --- |
| `planned_end_date` is today | **Ends Today** (amber) |
| `planned_end_date` has gone by, still started | **Planned End Date Passed** (coral) |
| `planned_end_date` is within 7 days | **Ends in N days** (quiet grey) |

Actions: **Finish Placement**, Open Student, Open Partner, Placement Details.

These labels are computed at render time from dates the placement already has.
None of them is a status, a column, or a stored field.

## Start Placement

Manual, always. There is no automatic start anywhere in this application.

The confirmation names the three facts staff are confirming - Student, Placement
Partner, Planned Start Date - and then asks for the **Actual Start Date**, which
defaults to today and can be changed, because students often begin on a
different day from the one that was planned. Showing the planned date beside the
actual one is the point: the difference between them is visible while the
decision is being made.

Confirming performs one guarded update:

```
student_placements.status      assigned -> started
student_placements.actual_start_date   set
students.placement_status      -> placement_started   (by trigger)
```

The update is scoped `.eq("status", "assigned")`. If the placement was cancelled
or started elsewhere between the page rendering and the action running, no row
matches and staff are told to reload rather than overwriting a newer fact.

The same action runs from a board card and from the student's placement page.
Two presentations, one action.

## Finish Placement

Only a **started** placement can be finished. It calls
`finish_student_placement()`, the SECURITY DEFINER function in 0006, and never
writes the status from the client.

The form collects only fields the data model already has:

- Outcome: **Completed at this Partner** or **Ended Early / Transferred**
- `actual_end_date` (required)
- `credited_hours` (optional)
- `completion_note` (optional)
- `end_reason` (optional, and only offered on Ended Early)

Then the question that matters:

> **Does this complete the student's full placement requirement?**

### YES

```
student_placements.status   -> completed
students.placement_status   -> placement_completed
```

The student leaves the working board. Their history stays.

### NO

```
student_placements.status   -> ended_early
students.placement_status   -> back to their document-derived pre-placement
                               status, so ready_for_placement when their
                               documents are still ready
```

The student returns to the board and can be assigned to another partner.

The answer is never inferred from the outcome. A student may finish cleanly at
one partner and still owe hours; a student may end one early and have nothing
left to do. Only staff know which, so the form asks, and an unanswered form
cannot be submitted.

## Completed vs ended early vs cancelled

Three different facts, kept apart on purpose.

| Status | Means | Hours |
| --- | --- | --- |
| `completed` | the student finished this placement at this partner | credited |
| `ended_early` | the student really worked here, and it stopped before it was finished | credited |
| `cancelled` | the assignment never meaningfully started | none, and the database nulls them |

`ended_early` is **not** a failure. It covers a transfer, a partner who could
not continue, a student who needs a second placement segment, and a placement
where only part of the requirement was done. The interface uses neutral
language throughout, and an End Reason is offered rather than demanded.

Cancellation is only for an assignment nothing happened under. A student who
attended and then moved had a real placement that ended early, not a cancelled
one. The application never offers Cancel on a started placement; the CHECK
constraint still permits the value so a mis-entered row can be corrected in SQL.

## Credited hours

`credited_hours` is the final number of hours staff **accept** for one placement
segment. One number, entered once, when the placement is finished.

It is not a timesheet, not attendance, not a punch clock, and not weekly hour
tracking. None of those exists in this application.

Empty is a legitimate answer: staff often finish a placement before the hours
have been confirmed, and defaulting to zero would be a claim nobody made.

A student's total is the sum across every non-cancelled segment
(`src/lib/placement/hours.ts`), shown on their placement page and in the
Placement section of their student page.

## Multi-partner placement history

The example this module is built around:

```
LTC A    ended_early   80 credited hours
LTC B    completed    120 credited hours
Student  placement_completed
Total    200 credited hours
```

Both rows exist, permanently. Assigning LTC B never edits, replaces, or
overwrites the LTC A row - it is a second `student_placements` row, and the
partial unique index `student_placements_one_active_idx` is what allows any
number of historical rows while refusing a second ACTIVE one.

Placement records are never deleted. A trigger in 0006 refuses `DELETE` at the
table itself, and there is no delete policy, so the API cannot remove one
either. Nothing is ever deleted to "clean up" the board.

## A completed student

`students.placement_status = 'placement_completed'` takes a student off the
working board. They stay reachable through:

- Placement List View, filtered to Placement Completed
- their own placement history
- the partner's Past Placements

Their status is a deliberate staff decision, so nothing undoes it
automatically - not a document edit, not a later correction to a history row.

## On Hold

Unchanged by this ticket, and deliberately so.

A hold is a deliberate pause with an optional one-line reason. Releasing one is
`release_student_placement_hold()`, which resolves where the student belongs
from the facts: **their live placement record first, their document readiness
second**. A student released from hold who still has a started placement goes
back to On Placement. Nobody is ever blindly sent to Ready.

While a student is On Hold their card sits in the On Hold column even if their
placement record is still `started`, which is how holds have always worked. The
Dashboard's On Placement count reads placement records rather than students, so
it still counts that placement.

## Permissions

Unchanged, and enforced by the database rather than by hidden buttons.

| Role | Start / Finish / Cancel / Hold |
| --- | --- |
| admin | yes |
| placement_manager | yes |
| management | no, read only |

Three layers, all of which have to agree:

1. `canManagePlacements()` decides what the interface renders.
2. Every server action re-checks it before touching anything.
3. The database has the last word: `can_manage_placements()` inside
   `finish_student_placement()` and `release_student_placement_hold()`, the RLS
   policies on `student_placements`, and the `students_placement_guard` trigger,
   which refuses a `placement_status` change from anyone else even though the
   students UPDATE policy from 0001 is open to all active staff.

## Concurrency

- Start Placement is scoped to a row still `assigned`.
- Cancel Assignment is scoped to a row still `assigned`.
- `finish_student_placement()` takes `FOR UPDATE`, refuses an assigned
  placement, and refuses one that is already finished.
- `student_placements_one_active_idx` refuses a second active placement for one
  student, whatever two concurrent requests believe.

Stale client state can never produce a wrong write. It produces a plain message
asking staff to reload.

## What this module deliberately does not do

No attendance, clock-in, timesheets, weekly hours, automated check-ins,
supervisor evaluations, incident management, placement issue tickets, messaging,
SMS, email reminders, push notifications, calendar automation, AI monitoring,
new placement statuses, partner capacity, or placement slots.

This module is the active placement lifecycle and the interface over it. Nothing
more.
