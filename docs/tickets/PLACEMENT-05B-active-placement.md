# PLACEMENT-05B - Active Placement / On Placement Workspace

## Goal

Make active student placements operationally usable.

The system already supports:

- Ready for Placement
- Placement assignment
- assigned placement records
- Start Placement
- started placement records
- Finish Placement
- completed / ended early placement records
- cancellation before start
- credited hours
- planned / actual start and end dates
- placement history

This ticket does NOT redesign that lifecycle.

It surfaces it properly in the Placement workspace so the placement team can answer:

- Who is assigned but has not started?
- Who is currently on placement?
- Who was supposed to start already?
- Who is expected to finish soon?
- Which partner is each student currently with?
- When did the placement actually start?
- When should it end?
- How do I start an assigned placement?
- How do I finish an active placement?
- If a placement ends before the student's full requirement is complete, how do they return to Ready for another placement?
- How many credited hours did that placement segment contribute?

## Existing lifecycle

Preserve the lifecycle implemented in migration 0006.

student_placements.status:

- assigned
- started
- completed
- ended_early
- cancelled

students.placement_status:

- needs_review
- documents_pending
- ready_for_placement
- placement_assigned
- placement_started
- placement_completed
- on_hold

Important distinction:

student_placements.status = completed

means THAT placement segment finished successfully.

students.placement_status = placement_completed

means the student's ENTIRE placement requirement is finished.

A student may complete one meaningful placement segment at Partner A and later continue at Partner B.

Do not collapse these concepts.

## No migration unless genuinely necessary

Migration 0006 already contains the required active-placement fields.

Do NOT create migration 0008 merely for UI behavior.

Do not add columns unless inspection proves a required field does not already exist.

Prefer zero schema change for this ticket.

## Central Placement Board

The Board currently shows:

Needs Review
Documents Pending
Ready for Placement
Placement Assigned
On Hold

Add:

On Placement

Final operational board:

Needs Review
Documents Pending
Ready for Placement
Placement Assigned
On Placement
On Hold

Placement Completed remains outside the working columns as a completed/history summary or List filter.

## On Placement definition

On Placement maps to:

students.placement_status = 'placement_started'

and should correspond to an active student_placements row with:

status = 'started'

Do not create another status.

## Board transition rules

The board remains visually Kanban-style but important lifecycle transitions are controlled actions.

Do NOT allow free drag:

Ready -> Assigned
Assigned -> On Placement
On Placement -> Completed
On Placement -> Ready

These require business actions.

Ready -> Assigned:
existing Find Placement flow

Assigned -> On Placement:
Start Placement action

On Placement -> finished:
Finish Placement action

Started placements do NOT get cancelled through the normal UI.

If meaningful placement already occurred, finishing early is:

ended_early

not:

cancelled

Cancellation is only for an assignment that did not meaningfully start.

## Placement Assigned column

Cards should clearly show:

- student name
- student number
- partner
- city if useful
- planned start date
- planned end date if present
- assignment date where useful

Add computed attention indicators.

If planned_start_date = today:

Starting Today

If planned_start_date < today AND placement status is still assigned:

Start Date Passed

This is informational only.

Do NOT automatically Start Placement because a date arrived.

Provide obvious controlled actions:

Start Placement
Open Student

Where existing permissions allow, preserve the existing Cancel Assignment action through the existing proper workflow.

## Start Placement

Use the existing Start Placement logic.

Do not duplicate state transition logic.

Start Placement confirmation/modal should show:

Student
Partner
Planned Start Date
Actual Start Date

Actual Start Date defaults to today but staff may adjust it where the existing schema/action supports that safely.

Confirming must:

student_placements.status:
assigned -> started

actual_start_date:
set appropriately

students.placement_status:
placement_started

Use existing authorization and concurrency protections.

Do not auto-start from planned_start_date.

## On Placement column

Cards should prioritize current operational information:

- Student Name
- Student Number
- Current Partner
- Actual Start Date
- Planned End Date
- City where useful

Computed attention:

If planned_end_date = today:

Ends Today

If planned_end_date < today and placement is still started:

Planned End Date Passed

Optional:

If planned_end_date is within the next 7 days:

Ending Soon

Only add Ending Soon if it stays visually simple.

These are computed UI indicators.

Do not create statuses or database fields for these labels.

Provide:

Finish Placement
Open Student
Open Partner where practical

## Active Placement detail

On Student detail, improve the current Placement section so an active placement is immediately understandable.

For a started placement show:

Active Placement

Partner
Status
Assigned Date
Planned Start
Actual Start
Planned End
Actual End when applicable
Assignment Note if present

For a started placement, show:

Finish Placement

prominently.

Do not force staff to hunt through placement history to finish the current placement.

## Finish Placement

Reuse the existing PLACEMENT-04 finish lifecycle.

Do not invent another completion mechanism.

The Finish Placement dialog/workflow should collect only fields already supported by the existing data model.

Suggested:

Actual End Date
Credited Hours
Completion / Placement Note

Then ask the critical question clearly:

Did this placement complete the student's full placement requirement?

YES

This placement segment:
status = completed

Student:
placement_status = placement_completed

NO

This placement segment:
status = ended_early

Student returns to the correct document-derived pre-placement state.

If documents are still ready:

ready_for_placement

so another partner may be assigned.

Do not assume ended_early means failure.

It can mean:

- transfer
- partner could not continue
- student needs another placement segment
- only part of required placement was completed

If NO / ended early, allow or require an End Reason using the existing end_reason field.

Use neutral language.

## Credited hours

credited_hours represents:

final accepted placement hours for THAT placement segment

It is NOT:

- a timesheet
- daily attendance
- punch clock
- weekly hour tracking

Allow a non-negative number consistent with the existing database constraint.

Placement history should total credited hours across historical segments where useful.

Do not build detailed hours tracking.

## Completed student

A fully completed student should not remain in the active Board columns.

They should remain accessible through:

Placement List
Student placement history
Partner Past Placements

Preserve historical placement records permanently.

Never delete a placement record to "clean up" the board.

## Ended Early continuation

This is important.

Example:

Student does meaningful placement at LTC A.
Placement ends early after 80 credited hours.
Student still needs another placement.

Result:

LTC A placement:
ended_early
credited_hours = 80

Student:
returns to ready_for_placement if documents are still ready

Later:

Student gets assigned to LTC B.

Both placement records remain in history.

Do not overwrite LTC A with LTC B.

## Assignment cancellation

Assigned but never meaningfully started:

Cancel Assignment

Result:

student_placements.status = cancelled

Student returns to the correct pre-placement state.

Preserve the historical cancelled record.

Do not classify this as ended_early.

## On Hold

Do not redesign Hold in this ticket.

Preserve the existing controlled On Hold / Release Hold behavior.

Release Hold must continue resolving:

active placement first
document state second

Never blindly send a student to Ready.

If an active started placement and Hold interact under existing rules, preserve the existing behavior rather than creating a second implementation.

## Placement List

Ensure List View can clearly filter or identify:

- Placement Assigned
- On Placement
- Placement Completed
- On Hold

If the existing list filter already uses student placement statuses, extend it cleanly rather than creating a parallel filter system.

The user should be able to find all active On Placement students without using the board.

## Dashboard consistency

The Dashboard already has:

Awaiting Start
On Placement

Do not redesign the Dashboard.

Ensure its counts remain consistent with the same lifecycle:

Awaiting Start:
active placement status = assigned

On Placement:
active placement status = started

Do not add duplicate dashboard logic unnecessarily.

## Batch Planning consistency

PLACEMENT-05A already shows:

Awaiting Start
On Placement

Do not redesign Batch Planning.

Make sure the statuses continue to mean the same thing.

## Partner detail consistency

Existing Partner detail already has:

Current Placements
Past Placements

Current:

assigned
started

Past:

completed
ended_early
cancelled

Preserve this.

If active placement information has become richer, display actual start / planned end where useful without redesigning the whole Partner page.

## Permissions

Use existing placement-management permissions.

admin:
manage lifecycle

placement_manager:
manage lifecycle

management:
read only

Do not widen permissions.

Start / Finish / Cancel must be enforced on the server / database path, not just hidden buttons.

## Concurrency

Preserve concurrency protections.

Examples:

Do not Start an assignment that has already been cancelled.

Do not Finish a placement that is not currently started.

Do not allow two simultaneous active placements for the same student.

Do not rely only on stale client state.

Use the existing server actions / RPC / database guards.

## UI direction

This is an internal operational tool.

Prioritize:

large readable status
student name
partner
dates
clear action button
attention state

Use existing TAE shell.

Use existing operational colors.

Suggested:

Assigned:
blue/info

On Placement:
green/active

Starting Today:
soft blue/attention

Start Date Passed:
amber

Ends Today:
amber

Planned End Date Passed:
coral/red attention

Do not globally redesign colors if existing status tokens differ.

Respect current design tokens first.

## Empty states

If no students are currently On Placement:

show a clean empty state such as:

No students are currently on placement.

Do not show a broken/blank column.

## Back navigation

Preserve obvious routing/back behavior.

From Student / Partner / active placement actions, staff should not get trapped.

## No new active-placement subsystems

Do NOT build:

- daily attendance
- clock-in / clock-out
- timesheets
- weekly hours
- automated check-ins
- supervisor evaluations
- incident management
- placement issue tickets
- messaging
- SMS
- email reminders
- push notifications
- calendar automation
- AI placement monitoring
- new placement statuses
- partner capacity
- placement slots

Those can be future tickets if required.

## Documentation

Create:

docs/product/active-placement.md

Document:

- assigned vs started
- On Placement definition
- manual Start Placement
- start-date attention
- finish lifecycle
- full requirement YES vs NO
- completed vs ended_early
- cancelled vs ended_early
- credited hours
- multi-partner placement history
- completed student behavior
- board transition restrictions

Update:

docs/tickets/PLACEMENT-05B-active-placement.md
README.md

## Validation

Run:

npm run lint
npm run build
git status

Test at minimum:

1. Ready student is assigned through existing Find Placement flow.

2. Assigned student appears in Placement Assigned.

3. Planned start today shows Starting Today.

4. Planned start in the past shows Start Date Passed.

5. Student does NOT auto-start because planned date passed.

6. Start Placement changes:
   placement record -> started
   student -> placement_started

7. Student moves from Placement Assigned to On Placement.

8. Dashboard On Placement count changes consistently.

9. Batch Planning On Placement count changes consistently.

10. On Placement card shows correct Partner and dates.

11. Finish Placement with Full Requirement = YES:
    placement -> completed
    student -> placement_completed
    student disappears from active board
    history remains

12. Finish Placement with Full Requirement = NO:
    placement -> ended_early
    credited hours retained
    student returns to document-derived preplacement status
    if docs ready -> ready_for_placement
    student can later receive another placement

13. Multi-segment history displays both placements.

14. Cancel an assigned/non-started placement:
    placement -> cancelled
    student returns appropriately
    history retained

15. Attempting to Finish a non-started placement is rejected.

16. Management/read-only cannot execute Start/Finish/Cancel.

17. No private data/files staged.

## Done criteria

- On Placement column exists
- On Placement uses placement_started
- assigned students remain distinct
- start-date attention works
- no automatic starts
- Start Placement is accessible and controlled
- started students move visibly to On Placement
- active placement cards show current Partner
- active placement dates are readable
- planned end attention works
- Finish Placement is accessible
- credited hours can be recorded
- full requirement YES completes student
- full requirement NO ends segment but allows continuation
- ended early is distinct from cancelled
- placement history preserves all segments
- current / past Partner placements remain accurate
- List view can identify On Placement
- Dashboard counts stay consistent
- Batch Planning counts stay consistent
- permissions remain correct
- no migration unless genuinely required
- lint passes
- build passes
- no private files staged

---

# Implementation

Delivered. Interface and vocabulary only: **no migration was created, and no
schema changed.**

## Migration

**None.** Inspection of `supabase/migrations/0006_student_placements.sql`
confirmed every field this ticket needs already exists and is already enforced:

- `student_placements.status` with all five values
- `planned_start_date`, `planned_end_date`, `actual_start_date`,
  `actual_end_date`
- `credited_hours`, `completion_note`, `end_reason`
- `cancelled_at`, `cancellation_reason`, `assignment_note`
- `students.placement_status` including `placement_started`
- `finish_student_placement()`, `release_student_placement_hold()`,
  `can_manage_placements()`
- `student_placements_one_active_idx`, the stamp trigger, the delete guard, the
  students guard trigger, and RLS

The application already had a working Start Placement action, Finish Placement
through the RPC, Cancel Assignment, Hold, and Find Placement. None of that
lifecycle logic was duplicated, replaced, or bypassed.

## Board

`src/lib/placement/board.ts`

Added the **On Placement** column at `placement_started`, between Placement
Assigned and On Hold. Six working columns:

```
Needs Review | Documents Pending | Ready for Placement
Placement Assigned | On Placement | On Hold
```

Colour comes from the existing controlled Area Board palette: Assigned indigo,
On Placement teal. Placement Completed stays off the board.

Empty state: "No students are currently on placement."

Drag auto-scroll, the drag-to-Hold behaviour, and the Ready to Assigned opens
Find Placement behaviour are all unchanged.

`dropOutcome()` now refuses each lifecycle move separately, naming the action
that performs it:

- Assigned to On Placement: "Starting a placement is a deliberate action, not a
  drag. Use Start Placement..."
- On Placement to anything: "...Use Finish Placement, which records what
  happened at this partner and asks whether it completes their whole placement
  requirement."
- anything to On Placement: assign them first, then start.

## On Placement query / definition

`students.placement_status = 'placement_started'`, with the active
`student_placements` row at `status = 'started'`. The trigger in 0006 keeps the
two in step, so there is one definition, not two.

No new query was written. `listPlacementStudents()` already returned every
active student with their live placement joined, and `getPlacementCounts()`
already exposed `started`.

## Assigned attention states

New `src/lib/placement/attention.ts`, pure functions over the dates the record
already holds:

- `planned_start_date` equals today: **Starting Today** (info/blue)
- `planned_start_date` before today, still assigned: **Start Date Passed**
  (warning/amber)
- no planned start: nothing. A placement with no date is not late.

Computed at render. Not statuses, not fields. **Nothing auto-starts.**

## On Placement attention states

- `planned_end_date` equals today: **Ends Today** (warning/amber)
- `planned_end_date` before today, still started: **Planned End Date Passed**
  (attention/coral)
- `planned_end_date` within 7 days: **Ends in N days** / **Ends tomorrow**
  (neutral, deliberately the quietest)

`today` is computed once per page on the server and passed down, so every card
reads its dates against the same day and server and client can never disagree.

## Start Placement

Existing `startPlacementAction` and `StartPlacementSchema`, untouched.
Presentation improved:

- the confirmation now names **Student + Student Number**, **Placement Partner**
  and **Planned Start Date** explicitly, then asks for **Actual Start Date**
- Actual Start Date now defaults to **today** (it defaulted to the planned start
  date), with the planned date shown beside it
- available from the Placement Assigned board card as well as the student's
  placement page

The existing `.eq("status", "assigned")` concurrency guard is unchanged.
Nothing starts automatically.

## Finish Placement

Existing `finishPlacementAction` calling the `finish_student_placement()` RPC,
untouched. No client-side status write anywhere. Presentation improved:

- the dialog now names Student, Partner, Actual Start and Planned End, so it is
  never ambiguous which segment is being finished
- available from the On Placement board card as well as the student's placement
  page

Fields collected are exactly the ones the model has: `actual_end_date`,
`credited_hours`, `completion_note`, `end_reason` (Ended Early only), plus the
outcome and the requirement question.

## Full Requirement = YES

Segment becomes `completed`. Student becomes `placement_completed`. The student
leaves the working board. Every history row stays.

## Full Requirement = NO

Segment becomes `ended_early`. The student returns to their **document-derived**
pre-placement status via `refresh_student_placement_status(..., true)`, so
`ready_for_placement` when their documents are still ready, and another partner
can be assigned. Credited hours for the segment are retained.

Never inferred from the outcome. The question is a required radio group.

## ended_early

Distinct from cancelled throughout, in neutral language. It covers a transfer, a
partner who could not continue, a student who needs a second segment, or a
partial requirement. `end_reason` is offered, not demanded.

## Cancellation

Unchanged. Only ever offered on an **assigned** placement, through the existing
`CancelAssignmentButton` on the student's placement page, reachable from the
assigned board card via **Assignment Details**. A started placement is never
offered Cancel; the card offers Finish Placement instead.

## Credited hours

`credited_hours` unchanged: one accepted number per segment, non-negative,
optional. Totals come from the existing `totalCreditedHours()`, which excludes
cancelled rows. No timesheet, no attendance, no hour log.

## Multi-segment history

Unchanged and preserved. Assigning a second partner inserts a **second row**;
the first is never edited into it. Partner A `ended_early` 80 hours and Partner
B `completed` 120 hours both remain visible on the student's placement page,
totalling 200 credited hours. Deletion is refused by a trigger and by the
absence of a delete policy.

## Student detail

`src/app/(app)/students/[studentId]/placement/page.tsx`

- the section reads **Active Placement** for a started placement and **Current
  Assignment** for an assigned one, each with a line saying what that means
- a started placement leads with **Actual Start** and **Planned End**,
  highlighted, with Planned Start below them; an assigned one leads with the
  planned dates
- **Actual End Date** is shown when present
- the attention state is spelled out as a tinted sentence
- Finish Placement stays prominent, directly under the placement

`src/components/placement/StudentPlacementSection.tsx`, the panel on the student
page:

- the panel is green and reads "On placement now" for a started placement, blue
  and "Current assignment" for an assigned one
- **Actual Start** added for a started placement
- the attention state is shown here too

## Partner detail

`src/components/placement/PartnerPlacementsSection.tsx`

Current / Past grouping unchanged: `assigned` + `started` current,
`completed` + `ended_early` + `cancelled` past. The date line under each student
now suits the state. A started placement reads "started Oct 6 - planned end
Dec 12", an assigned one "planned start Oct 6", a finished one "ended Dec 12".
No other change to the Partner page.

## Placement List

`placement_started` was already filterable. Rows now show **Started {date}** for
a started placement rather than "Starts", plus **Planned end {date}**, plus the
same attention pill as the board. The On Placement summary block on `/placement`
links straight to `?view=list&status=placement_started`.

## Dashboard consistency

Untouched and already correct. Awaiting Start reads
`student_placements.status = 'assigned'` and On Placement reads
`student_placements.status = 'started'`, both as exact counts.

## Batch Planning consistency

Untouched and already correct. `PLANNING_STATUS_LABELS` already maps
`placement_assigned` to "Awaiting Start" and `placement_started` to
"On Placement", counted from `students.placement_status`, which the database
keeps in step with the placement records.

## Vocabulary

`PLACEMENT_STATUS_LABELS.placement_started` changed from "Placement Started" to
**"On Placement"**, so the board column, the list filter, the status pills, the
Dashboard, and Batch Planning all use one name.

Tones: `placement_assigned` stays info/blue; `placement_started` and the
`started` record status become ready/green, so Assigned and On Placement are
visually distinguishable everywhere.

## Permissions

Unchanged and not widened. admin and placement_manager manage the lifecycle;
management is read only. Enforced in three places that all have to agree: the
interface, every server action, and the database (`can_manage_placements()`
inside the RPCs, RLS on `student_placements`, and the `students_placement_guard`
trigger). The new card buttons are behind `canManage`, and the server would
refuse them regardless.

## On Hold

Not redesigned. No second implementation. Release still resolves the active
placement first and document state second.

## New subsystems

None. No attendance, timesheets, check-ins, evaluations, incidents, messaging,
reminders, notifications, capacity, slots, maps, AI, or new statuses.

## Files

New:

- `src/lib/placement/attention.ts`
- `src/components/ui/ActionDialog.tsx`
- `docs/product/active-placement.md`

Changed:

- `src/lib/placement/board.ts`
- `src/lib/placement/constants.ts`
- `src/components/placement/PlacementBoard.tsx`
- `src/components/placement/PlacementCard.tsx`
- `src/components/placement/PlacementList.tsx`
- `src/components/placement/StartPlacementButton.tsx`
- `src/components/placement/FinishPlacementForm.tsx`
- `src/components/placement/StudentPlacementSection.tsx`
- `src/components/placement/PartnerPlacementsSection.tsx`
- `src/app/(app)/placement/page.tsx`
- `src/app/(app)/students/[studentId]/placement/page.tsx`
- `README.md`

`src/lib/placement/actions.ts`, `src/lib/placement/schema.ts`,
`src/lib/placement/queries.ts`, `src/lib/dashboard/queries.ts`,
`src/lib/planning/*`, `CancelAssignmentButton.tsx`, and `HoldControl.tsx` were
inspected and deliberately left unchanged.

## Validation

`npm run lint` clean. `npx tsc --noEmit` clean. `npm run build` succeeds, all 28
routes. `git status` shows only the intended source and documentation files; no
private file, workbook, or environment file is staged.

45 assertions over the new and changed pure logic all passed: board columns and
ordering, every drag refusal, both sets of attention states and their
boundaries, status-scoped attention, date arithmetic across a month end, and
multi-segment credited hours. The script was temporary and has been removed.

**No test placement or student records were created.** Migration 0006 refuses to
delete a `student_placements` row, by trigger and by the absence of a delete
policy, so a test placement written to the live database could not have been
cleaned up afterwards. Lifecycle behaviour is guaranteed by that migration,
which this ticket did not change, and by the existing actions, which it reuses
unchanged.
