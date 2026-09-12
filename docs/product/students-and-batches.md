# Students and Batches

How the Students module works, what the database holds, and what the one-time
Excel migration does. Built in PLACEMENT-01.

## Purpose

Students are one of the two primary records in TAE Placement. This module lets a
very small staff team:

- see the whole roster and the state it is in
- browse students by batch
- open one student and understand them in a single screen
- keep internal notes against a student
- add and edit students without touching a spreadsheet

After the one-time migration, the workbook is no longer part of normal
operation. Every new student and batch is created in the application.

## Security and access

Real student names, phone numbers, emails, and addresses are stored here, so
nothing in this module is public.

- Staff sign in with email and password at `/login` using Supabase Auth.
- There is no public registration, no student login, and no partner login.
  Staff accounts are created by an admin in the Supabase dashboard.
- `src/proxy.ts` refreshes the session on every request and redirects signed out
  visitors to `/login`.
- Every page and Server Action in the staff area calls `requireActiveStaff()`
  before reading or writing anything.
- Row Level Security is the real boundary. No policy grants anything to the
  `anon` role, and all privileges are revoked from `anon` on every table, so an
  anonymous request reads nothing even if the application is bypassed.
- The service role key is used only by the local migration script. It is never
  referenced by application code and never put in a `NEXT_PUBLIC_` variable.

### Staff profiles and activation

A row in `profiles` is created automatically for every new auth user by the
`handle_new_auth_user` trigger, but it starts with `is_active = false`. An
inactive account can sign in and sees `/account-pending`, and RLS returns no
student data to it.

An admin activates a staff member from the Supabase SQL editor:

```sql
update public.profiles
set full_name = 'Staff Name', role = 'admin', is_active = true
where id = '<auth user id>';
```

Roles are `admin`, `placement_manager`, and `management`. Batch create, edit,
archive, and reactivate are admin only, in the database and in the UI. All
active staff can read students and update student information.

## Database model

Migration: `supabase/migrations/0001_placement_core.sql`.

### profiles

`id` (references `auth.users`), `full_name`, `role`, `is_active`, `created_at`,
`updated_at`.

### batches

`id`, `name`, `program`, `start_date`, `schedule_label`, `status`, `sort_order`,
`created_at`, `updated_at`.

Batch names are unique (case insensitive), which is what makes the migration
safe to run more than once. `status` is `active` or `archived`.

### students

`id`, `student_number` (unique), `first_name`, `middle_name`, `last_name`,
`program`, `batch_id`, `phone`, `email`, `address_line`, `city`, `province`,
`postal_code`, `is_returning`, `placement_status`, `document_status`,
`is_active`, `migration_source`, `created_at`, `updated_at`.

Date of birth and immigration status are deliberately not columns. They are not
needed for placement operations, so they are not stored.

### student_notes

`id`, `student_id`, `body`, `created_by` (references `auth.users`),
`created_at`, `updated_at`.

## Batch behaviour

Batches are database records. Nothing in the application hard-codes a batch.

- Admin creates and edits batches at `/admin/batches`.
- Archiving hides a batch from the Students page batch cards and from the batch
  picker on new students, while keeping every existing record intact.
- Reactivating brings it back.
- Batches are never hard deleted. There is no delete policy on the table, and a
  database trigger refuses to delete a batch that still holds students.

## Previous / Returning students

Returning students are marked with `is_returning = true`. There is no fake
"Previous Students" batch record, and a returning student keeps their real
batch when it is known.

`/students/returning` is a view over that flag. Any staff member can mark or
unmark a student as returning from Edit Student.

## Placement status

Operational codes, matching the CHECK constraint on `students`:

`needs_review`, `documents_pending`, `ready_for_placement`,
`placement_assigned`, `placement_started`, `placement_completed`, `on_hold`.

The Students page counts "Students Needing Placement" as `needs_review`,
`documents_pending`, or `ready_for_placement`. "Placement Ready" is
`ready_for_placement` only. These are early operational groupings, not final
placement metrics. Richer placement stages come in a later Placement ticket.

## Document status

`not_reviewed`, `pending`, `ready`.

The student page shows the current document status and nothing more. The
detailed document checklist belongs to a later Documents ticket.

## Notes behaviour

Notes are internal, contextual, and always attached to one student.

- The Comments button sits at the top of the student page with the current
  count.
- It opens a right-side panel over the page, so staff never navigate away and
  never lose their scroll position.
- The author is the signed in staff member. RLS requires
  `created_by = auth.uid()` on insert, so a note cannot be attributed to
  someone else.
- Editing and deleting are conservative: the database allows it only for the
  author, and the application does not expose it yet.

This is not a messaging system and not a chat application.

## Routes

| Route | What it does |
| --- | --- |
| `/login` | Staff email and password sign in |
| `/account-pending` | Signed in but not yet activated by an admin |
| `/students` | Summary blocks, batch cards, search, filters, full roster |
| `/students/batches/[batchId]` | One batch, its counts, and its students |
| `/students/returning` | Previous / Returning students |
| `/students/new` | Add Student |
| `/students/[studentId]` | Single student overview |
| `/students/[studentId]/edit` | Edit Student |
| `/admin/batches` | Batch Management |

Every deeper page has a visible Back action pointing at a logical parent route,
not browser history.

## One-time Excel migration

The workbook is migration material only. There is no Excel import screen, and
Excel is not in the navigation.

Script: `scripts/import-initial-students.ts`.

```bash
# inspect only, no database writes
npx tsx scripts/import-initial-students.ts "<path to workbook.xlsx>" --dry-run

# create or reuse batches and insert new students
npx tsx scripts/import-initial-students.ts "<path to workbook.xlsx>" --apply
```

The workbook path is always explicit. The script never searches the disk for
spreadsheets.

Extra options:

- `--update-existing` also refreshes workbook fields on students that already
  exist. Off by default so corrections made in the application are never
  overwritten by a repeat run.
- `--verbose` lists student numbers and names. Off by default to keep personal
  information out of terminal scrollback.

### Workbook shape

One sheet per batch. Row 1 holds the batch title, for example
`PSW Morning Batch - April 27, 2026`. Row 2 holds the headers. Students follow
from row 3.

The batch name, program, schedule, and start date are read from the row 1
title. A title that cannot be read stops the run rather than being guessed.
Batches are matched by name, so a second run reuses them instead of creating
duplicates.

### Fields imported

| Workbook column | Student field |
| --- | --- |
| Student ID | `student_number` |
| First Name | `first_name` |
| Middle Name | `middle_name` |
| Last Name / Last name | `last_name` |
| Contact No. | `phone` |
| Email | `email` |
| Address | `address_line` (plus parsed `city`, `province`, `postal_code`) |
| Sheet title | `batch_id` |

### Fields intentionally not imported

`Sr. No.`, `YYYY/MM/DD` (date of birth), `Status` (immigration status),
`Transcripts`, `College Cert`, `NACC`, `VENUE`, `START DATE`, `FINISH DATE`,
legacy `STATUS` (placement), legacy `Doc Status`, `GRADUATED`, and blank working
columns.

Historical placement and document state is not inferred from the workbook. Staff
correct April and June records by hand in the application after the import.

### Imported defaults

Every imported student starts at:

- `placement_status = needs_review`
- `document_status = not_reviewed`
- `is_returning = false`
- `is_active = true`
- `migration_source = psw-master-list-workbook`

No individual student exception is hard-coded.

### Idempotency

`student_number` is the uniqueness key. Before inserting, the script looks for
an existing student with that number. If one exists it is left alone, or
refreshed when `--update-existing` is passed. Placement status, document status,
and the returning flag are never touched by a repeat run.

Running the script twice does not create duplicate students or duplicate
batches.

### Address parsing

`src/lib/students/address.ts` is shared by the migration and the application.

- The entire address is always kept in `address_line`.
- A postal code is taken only when exactly one is found.
- A province is taken only when a comma segment is a province, or when the last
  word of a segment is a province.
- A city is taken only when it sits between the street and the province.
- Anything uncertain is left null and reported as a warning row, with the sheet,
  the row number, and the student number.

No city is ever invented. Values keep the spelling and casing used in the
workbook rather than being silently rewritten.

### Rows the migration skips

- Fully blank rows and roster placeholder rows that only carry a Sr. No.
- The header row the workbook repeats part way down each sheet.
- Rows with a name but no Student ID. These are reported so they can be added by
  hand.
- A student number that appears on more than one sheet. Only the first is
  imported and the duplicate is reported.

## Admin workflow

1. An admin creates a staff auth user in Supabase and activates their profile.
2. An admin creates batches at `/admin/batches`, or the migration creates them.
3. Staff work the roster from `/students`.
4. Staff open a student, review readiness, update status, and leave notes.
5. Batches that are finished are archived, never deleted.

## Future boundaries

Not built in this ticket, and not to be partially implemented here:

- the detailed placement document checklist (Documents ticket)
- placement partner / LTC accounts (PLACEMENT-02)
- placement assignment, partner matching, Kanban, capacity
- active placement monitoring and check-ins
- notifications
- Dashboard redesign

## Known wart

`xlsx` (SheetJS) on the npm registry is pinned at 0.18.5 and carries open
advisories. It is used only by the local one-time migration script, against one
trusted local file, and is never imported by application code or the browser
bundle. Once the migration is done the dependency can be removed.
