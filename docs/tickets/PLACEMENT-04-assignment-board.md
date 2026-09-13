# PLACEMENT-04 - Student Placement Assignment and Placement Board

## Goal

Connect students to Placement Partners and build the operational Placement Board.

This ticket covers:

- student placement assignment
- placement history
- matching a student with a partner
- Placement Board
- assignment dates
- partner/current-placement visibility
- hold behavior
- finishing an individual placement, with its outcome and credited hours
- the separation between finishing ONE placement and finishing the student's
  OVERALL placement requirement

This ticket does NOT build daily attendance, timesheets, check-ins, hour-entry
logs, evaluations, or employer signoff workflows.

Those belong to PLACEMENT-05.

## Existing system

Preserve everything already implemented:

- students and batches
- student document readiness
- final placement package
- Placement Partners
- Areas
- Partner Availability
- Partner Contacts
- Partner Comments
- Admin configuration
- existing security/RLS

Do not reset Supabase.

Latest applied migration before this ticket:

0005_partner_board_refinements.sql

Create a new additive migration:

supabase/migrations/0006_student_placements.sql

Do not rewrite migrations 0001 through 0005.

## Product principle

This is a small internal placement desk for a small team.

Keep the workflow simple.

The main operational question is:

"Which student needs a placement, where can we place them, and what has already been assigned?"

Do not build a complex CRM pipeline.

## Existing student placement summary

students already has placement_status:

- needs_review
- documents_pending
- ready_for_placement
- placement_assigned
- placement_started
- placement_completed
- on_hold

Keep this field as the HIGH-LEVEL student placement summary.

Do not replace it with a second competing summary field.

## Readiness behavior

Before a student has an active placement:

document_status should inform the high-level placement status.

Suggested mapping:

document_status = not_reviewed
-> needs_review

document_status = pending
-> documents_pending

document_status = ready
-> ready_for_placement

BUT:

Do not overwrite students already in:

- placement_assigned
- placement_started
- placement_completed
- on_hold

Historical/manual placement statuses must remain safe.

If implementing database synchronization, only update placement_status automatically when the existing status is one of:

- needs_review
- documents_pending
- ready_for_placement

Do not let document updates accidentally move an assigned or active student backwards.

## Database - student placements

Create:

student_placements

Suggested fields:

- id uuid primary key
- student_id uuid not null references students
- partner_id uuid not null references placement_partners
- status text not null
- assigned_at timestamptz
- assigned_by uuid references profiles
- planned_start_date date nullable
- planned_end_date date nullable
- actual_start_date date nullable
- actual_end_date date nullable
- assignment_note text nullable
- cancelled_at timestamptz nullable
- cancellation_reason text nullable
- created_at
- updated_at

Allowed placement record statuses:

- assigned
- started
- completed
- ended_early
- cancelled

Meaning:

assigned:
partner selected, placement not yet started

started:
student actively at this partner

completed:
this individual placement segment was completed successfully

ended_early:
student actually participated here, but this placement ended before the expected
completion and the student may continue elsewhere

cancelled:
assignment was cancelled before meaningful placement occurred

This table represents the real Student <-> Placement Partner relationship. Each
row is one placement SEGMENT.

A student may have multiple historical placement records over time. A student may
complete part of placement at one LTC and then continue at another LTC.

However, a student should have at most ONE current active placement record where
status is:

- assigned
- started

Use a safe database constraint / partial unique index.

Historical statuses:

- completed
- ended_early
- cancelled

must remain permanently visible.

Do not delete placement history.

Do NOT treat every moved/ended placement as cancelled.

## Placement end fields

Add to student_placements:

- credited_hours numeric nullable
- actual_end_date (already exists; preserved)
- completion_note text nullable
- end_reason text nullable

Keep the model simple.

Do NOT build timesheets or attendance.

credited_hours is only the final number of hours staff accept/credit for that
placement segment.

## Separating cancellation from Finish Placement

Cancellation means:
The assignment never meaningfully started.

Finish Placement means:
The student actually participated at this partner and the placement segment is
now ending.

### assigned status

When student_placements.status = assigned, show:

- Cancel Assignment
- Start Placement

Cancel Assignment should:

- use a clear confirmation flow
- optional cancellation reason
- set placement status = cancelled
- set cancelled_at
- restore the student's high-level placement status from current document
  readiness
- preserve the placement record in history

Do not ask:
"Does this complete the student's placement requirement?"

A cancelled-before-start assignment can never complete the requirement.

### started status

When student_placements.status = started, show:

Finish Placement

## Finish Placement action

The Finish Placement form should contain only:

- Completed at this Partner
- Ended Early / Transferred

"Cancelled Before Start" is NOT part of Finish Placement.

Capture:

- Actual End Date
- Credited Hours optional
- Completion / Transfer Note optional
- End Reason where appropriate

Then ask:

"Does this complete the student's full placement requirement?"

If YES:

- placement record gets the selected historical status
- students.placement_status = placement_completed

If NO:

- placement record gets completed or ended_early
- student returns to the correct pre-placement status
- normally ready_for_placement when documents are currently ready
- otherwise derived from current document_status

This allows another placement to be assigned later.

A student may therefore have:

Placement 1 -> ended_early -> 120 credited hours
Placement 2 -> completed -> 180 credited hours
Overall student -> placement_completed

Do not require a single partner to represent the whole placement.

### Allowed transitions

Database rules must support:

assigned -> cancelled
assigned -> started
started -> completed
started -> ended_early

Do not allow started -> cancelled through the ordinary UI.

Keep historical placement records permanent.

## Overall completion

students.placement_status = placement_completed represents completion of the
student's OVERALL placement requirement.

student_placements.status = completed represents completion of THAT individual
placement segment.

Keep those concepts separate.

## Assignment behavior

When staff assign a student to a Placement Partner:

1. Create student_placements row with status = assigned.
2. Set assigned_at.
3. Set assigned_by.
4. Update students.placement_status = placement_assigned.
5. Preserve optional planned start/end dates.
6. Preserve optional short assignment note.

Do not automatically mark the Partner unavailable.

Do not implement capacity.

Partner availability remains independent operational information.

## Cancellation

Keep cancellation for assignments that did not meaningfully proceed.

Do not use cancellation as the default for transfers after the student has
already worked at the partner.

Ordinary cancellation must not be routed through the Finish Placement UI.

Do not delete the placement row.

Set:

status = cancelled
cancelled_at = now()
cancellation_reason where supplied

Then restore the student's high-level placement status based on current document
readiness:

not_reviewed -> needs_review
pending -> documents_pending
ready -> ready_for_placement

Do not guess another partner.

## Start / complete boundary

PLACEMENT-04 may display existing statuses and dates.

Do not build the full Active Placement/check-in workflow yet.

Starting and completing placements belongs primarily to PLACEMENT-05.

If simple support is required for historical/manual data, keep it minimal.

## Main Placement route

Build / replace:

/placement

This should become the main operational Placement Board.

Heading:

Placement

Subtitle:

Track student readiness and placement assignments.

Primary views:

- Board
- List

Default:

Board

## Placement Board

Use a large horizontal Kanban-style board.

Primary working columns:

1. Needs Review
2. Documents Pending
3. Ready for Placement
4. Placement Assigned
5. On Hold

Do not overload the main working board with completed history.

If a placement is finished but the student's OVERALL requirement is NOT complete,
the student should return to the appropriate working column, usually Ready for
Placement.

If the overall requirement IS complete, the student leaves the working board and
is available through Completed/List/history.

If placement_started records already exist, they may appear in a separate Active Placement summary/section or appropriately represented without building PLACEMENT-05.

Completed students should be accessible through filters/list/history, not dominate the active board.

## Board colors

Use clear soft color coding similar to the Partner Area Board.

Suggested:

Needs Review -> slate
Documents Pending -> amber
Ready for Placement -> green
Placement Assigned -> blue / indigo
On Hold -> coral

Cards remain mostly white/off-white.

Do not make saturated full-color cards.

## Horizontal board drag behavior

Use the same good behavior as the Partner Area Board.

If drag/drop is used:

- board horizontally auto-scrolls when dragging near left/right edge
- scroll the board container, not the entire browser page

However:

Do NOT allow arbitrary drag behavior to create invalid placement states.

Moving a student into Placement Assigned requires an actual partner assignment.

Therefore:

- Ready -> Assigned should open/select a Partner rather than merely changing status
- Assigned -> Ready should require finishing the current placement safely
- On Hold may be entered through a controlled action
- document-derived readiness states should not be manually falsified

Prefer explicit actions over misleading drag behavior where business logic matters.

## Student cards

Placement Board student card should show:

- Student Name
- Student Number
- Batch
- City if known
- Document readiness e.g. 11 / 13
- Document status
- Current Partner if assigned
- Planned start date if assigned
- Comments indicator where practical

Keep cards readable.

Do not show every student field.

Primary card action:

Open Student

For Ready students also show:

Find Placement

For Assigned students show:

View Assignment

## Find Placement

When a Ready student selects:

Find Placement

Open a comfortable drawer/modal/page.

Show student context:

- Student name
- Batch
- City
- Document readiness
- Final placement package status where practical

Then show Placement Partners.

Partner selection should support:

- search by partner name
- Area filter
- Availability filter
- City where available

Partner cards should show:

- Partner Name
- Area
- City
- Availability
- Next Intake Date when upcoming
- primary contact if present
- contact count

Prefer partners marked:

Available Now

visually, but do NOT hide Unknown/Upcoming partners.

Do not automatically choose a partner.

Staff makes the decision.

## Create assignment

After choosing a Partner, show a simple confirmation form:

Student
Partner
Planned Start Date
Planned End Date
Assignment Note

Dates optional.

Button:

Assign Placement

Do not require dates.

After assigning:

- placement record created
- student moves to Placement Assigned
- student page shows current placement
- partner page shows student under Current Placements

## Student detail integration

On:

/students/[studentId]

add a clear section:

Placement

It should show:

Overall Placement Status

Current Placement if one exists

Placement History

For historical placement rows show:

- Partner
- Status
- Assigned Date
- Actual Start
- Actual End
- Credited Hours
- Completion / Transfer Note

Also show:

Total Credited Placement Hours

This can simply sum non-cancelled historical/current placement credited_hours.

Do not create detailed hour tracking.

If no current placement:

Show current readiness state.

Example:

Ready for Placement

button:

Find Placement

If assigned:

Show:

Partner
Area
Partner Availability
Planned Start Date
Planned End Date
Assigned Date
Assigned By
Assignment Note

Actions:

- Open Partner
- View Placement

On the placement page, the action offered follows the placement status:

assigned:
- Start Placement
- Cancel Assignment

started:
- Finish Placement

Do not duplicate the entire Partner profile.

## Student placement page

Create if useful:

/students/[studentId]/placement

or another focused route consistent with the app architecture.

This page may show:

Current Placement

and

Placement History

History should include:

- Partner
- status, labelled clearly as Completed / Ended Early / Cancelled
- assigned date
- actual start / actual end
- credited hours
- completion / transfer note
- cancellation if applicable

Do not delete historical records.

## Partner detail integration

The existing:

Current Placements

placeholder on:

/placement-partners/[partnerId]

should now become functional.

Show students with placement rows at that partner.

Current Placements:

status assigned or started

Show:

- Student Name
- Student Number
- Batch
- Placement Status
- Planned Start
- Open Student

Past Placements:

status completed, ended_early, or cancelled

Show credited hours and outcome where useful.

Do not build check-ins here yet.

## Placement list view

Provide a list view for easier searching.

Search:

- Student Name
- Student Number
- Partner Name

Filters:

- Batch
- Placement Status
- Area
- Partner
- Document Status

Keep it readable.

No dense spreadsheet-style table.

## On Hold

Allow staff to place a student On Hold.

Optional hold reason should be supported if simple.

If adding a database field, prefer:

students.placement_hold_reason text nullable

and optionally:

placement_hold_at timestamptz

Do not build a full hold-history system yet.

When releasing Hold:

restore status based on:

- current active placement if one exists
- otherwise current document readiness

Do not blindly return to Ready.

## Historical students

Do not automatically infer old April/June placement assignments from previous spreadsheets.

Historical correction remains manual.

The application must make it easy for staff to manually add a historical placement record later.

Do not hard-code names or old known exceptions.

## Permissions

Active staff may read placement information.

admin and placement_manager may:

- assign placements
- cancel assignments
- update planned dates
- put students on hold
- release hold

management:

- read placement information
- do not manage assignments

Use existing helper patterns where practical.

Create a helper such as:

can_manage_placements()

if helpful.

RLS is the security boundary.

## Placement comments

Do NOT create a second general Notes system.

Continue using existing student comments for student-level context.

Continue using partner comments for partner-level context.

An assignment may have one short assignment_note field.

PLACEMENT-05 may later add placement-specific activity/check-in history.

## Matching boundaries

Do NOT build:

- automatic distance calculation
- automatic partner recommendation AI
- placement capacity
- slot reservation
- email/SMS
- reminders
- daily attendance
- timesheets
- check-ins
- hour-entry logs
- evaluations
- employer signoff workflows
- completion package

credited_hours is a single accepted total per placement segment, not the start of
an hours system.

Those are later work.

## UI direction

Use the same visual language established in PLACEMENT-03:

- large readable headings
- large cards
- soft colored columns
- rounded surfaces
- obvious back navigation
- off-white workspace
- comfortable spacing
- simple status chips

Functionality first, but the Placement Board should feel visually usable.

## Migration

Create:

supabase/migrations/0006_student_placements.sql

Must be additive.

Do not rewrite earlier migrations.

Preserve all 86 students and all imported Placement Partners.

## Documentation

Create:

docs/product/student-placement-assignment.md

Document:

- relationship model
- placement statuses
- readiness mapping
- assignment behavior
- cancellation behavior
- Board
- Find Placement
- Partner integration
- student placement history
- PLACEMENT-05 boundary

Update:

docs/tickets/PLACEMENT-04-assignment-board.md

Update README current ticket.

## Validation

Run:

npm run lint
npm run build
git status

Confirm no:

- .env files
- private imports
- Excel
- CSV
- reference screenshots
- placement package files

are staged.

## Done criteria

- student_placements table exists
- multiple historical placements supported
- only one current active placement per student
- RLS works
- document readiness safely informs pre-placement status
- assigned/started/completed/on-hold students are not overwritten by document sync
- /placement Board works
- Board has clear colored operational columns
- student cards show document readiness
- Ready student can Find Placement
- partners can be searched and filtered by Area and Availability
- Partner Availability is visible in matching
- assignment creates Student <-> Partner relationship
- student status becomes placement_assigned
- current partner appears on student
- current student appears on partner
- an assigned placement offers Start Placement and Cancel Assignment
- a started placement offers Finish Placement
- Cancel Assignment never asks whether the requirement is complete
- Finish Placement offers only completed / ended_early
- started -> cancelled is not reachable through the ordinary UI
- credited hours, actual end date, and completion note are captured
- a finished placement that does NOT complete the requirement returns the student
  to their document-derived status
- a finished placement that DOES complete the requirement sets placement_completed
- a transfer is never recorded as a cancellation
- total credited placement hours are visible on the student
- finishing preserves history
- On Hold behavior works
- Placement List view works
- historical placements are visible
- no old spreadsheet placement data is guessed
- no check-in system is built
- lint passes
- build passes
- private files are not staged

---

## Status: Done

Implemented on `feat/placement-04-assignment-board`.

Documented in
[docs/product/student-placement-assignment.md](../product/student-placement-assignment.md).

### Migration

`supabase/migrations/0006_student_placements.sql`, purely additive. 0001 through
0005 are untouched. Nothing is reset, no student is re-imported, no partner is
re-imported, and no historical placement is inferred from any spreadsheet.

It adds:

- `can_manage_placements()` - admin and placement_manager
- `students.placement_hold_reason`, `students.placement_hold_at`
- `student_placements` - the real Student <-> Placement Partner relationship,
  one row per placement SEGMENT, with statuses `assigned`, `started`,
  `completed`, `ended_early`, `cancelled`
- `credited_hours`, `completion_note`, and `end_reason` on `student_placements`
- `student_placements_one_active_idx` - a partial unique index allowing at most
  one `assigned` or `started` row per student, which is what lets a student
  finish part of their placement at one partner and continue at another
- `placement_status_for_documents()`, `is_pre_placement_status()`,
  `resolve_student_placement_status()`, `refresh_student_placement_status()`
- `release_student_placement_hold()`
- `finish_student_placement()` - the controlled end of a STARTED placement,
  which writes both the record status and the student summary, and refuses
  anything that is not `started -> completed / ended_early`
- `students_placement_guard()` - authority over placement columns, plus the safe
  readiness mapping
- `student_placements_sync_student_status()` - placement records drive the
  student summary, and never set `placement_completed` on their own
- `student_placements_stamp_ending()` and a `BEFORE DELETE` refusal
- RLS and grants
- a one-time synchronisation of pre-placement students only

### Two completions, kept separate

`student_placements.status = completed` means ONE placement segment finished at
ONE partner. `students.placement_status = placement_completed` means the
student's WHOLE placement requirement is finished. Neither implies the other.

Finish Placement asks staff both questions. Answering "no, there is placement
left" returns the student to the pre-placement status their documents put them
in - normally Ready for Placement - so another placement can be assigned at
another partner. Only "yes" sets `placement_completed`, and only an explicit
`finish_student_placement()` call can set it.

### Two endings, reached from two places

```
assigned  ──► started ──► completed
   │                  └─► ended_early
   └────────────────────► cancelled
```

An **assigned** placement has not happened yet, so it offers **Start Placement**
and **Cancel Assignment**. A **started** one has, so it offers only **Finish
Placement**. A student who was actually at a partner was not "cancelled", and
their hours have to be credited somewhere.

Cancel Assignment is deliberately the smaller flow: a confirmation, one optional
reason, and no question about the placement requirement, because nothing
happened at that partner for a requirement to have been completed by. It is an
ordinary `UPDATE` under RLS filtered on `status = 'assigned'`, so a placement
started in another tab is reported rather than overwritten.

A transfer after the student has already worked somewhere is `ended_early`, with
its credited hours intact. It is never recorded as a cancellation. `started ->
cancelled` is not reachable through the interface at all; the CHECK constraint
still permits the value so a mis-entered record can be corrected in SQL.

`credited_hours` is one accepted total per segment. Total Credited Placement
Hours on a student is a plain sum of the non-cancelled ones. There is no
attendance, no timesheet, and no hour-entry log behind it.

### Readiness synchronisation

`not_reviewed -> needs_review`, `pending -> documents_pending`,
`ready -> ready_for_placement`, and ONLY while the student is still in one of
those three. `placement_assigned`, `placement_started`, `placement_completed`,
and `on_hold` are never overwritten by a document change. The 13-document rules
are not re-implemented: `document_status` still comes from
`sync_student_document_status()` in 0002, and `X of Y ready` still comes from
the `student_document_readiness` view.

### Application

| Route | What it is |
| --- | --- |
| `/placement` | the Placement Board and List View |
| `/placement/find/[studentId]` | Find Placement, then the assignment confirmation |
| `/students/[studentId]` | Overall Placement Status, Current Placement, Placement History, Total Credited Placement Hours |
| `/students/[studentId]/placement` | current placement, planned dates, Start / Cancel or Finish, full history with credited hours |
| `/placement-partners/[partnerId]` | Current Placements, now functional |

Board columns: Needs Review, Documents Pending, Ready for Placement, Placement
Assigned, On Hold, in the Area Board palette with horizontal auto-scroll while
dragging. Drag can only hold, release, or open Find Placement; every other move
is refused with a reason.

A student whose placement finishes without finishing their requirement returns
to the working board. Only a student whose whole requirement is complete leaves
it, reachable through the Placement Completed summary block, List View, and their
own placement history.

### Not built, as specified

Daily attendance, timesheets, check-ins, hour-entry logs, evaluations, employer
signoff workflows, capacity, slots, distance or automatic matching, reminders,
email, SMS, and employer feedback are all PLACEMENT-05 and later.

`credited_hours` is deliberately a single number staff type in when a placement
finishes, not the first row of an hours table.

**Start Placement** is the one thing taken from what the ticket first described
as PLACEMENT-05's workflow, and only because assigned and started must be told
apart for the two endings to mean anything. It is a single status change with an
optional Actual Start Date, nothing more.

### Validation

- `npm run lint` passes
- `npm run build` passes
- `git status` shows only the intended source, migration, and documentation
  changes. No `.env` file, private import, Excel, CSV, reference screenshot, or
  placement package file is staged.
