# Student Placement Documents

The placement document readiness workflow. Built in PLACEMENT-02 on top of the
students, batches, and notes from PLACEMENT-01.

## Purpose

Staff need to answer six questions about any student, quickly:

- What documents does this student need?
- Which are complete?
- Which are missing?
- Has a document been requested?
- Is this student ready from the document side?
- Has the merged placement package been prepared yet?

That is the whole scope. This is **not** a replacement for the LMS and it is not
a document management system. The LMS stays the primary place students submit
work. TAE Placement keeps a simple internal operational record of readiness.

The 13 requirements are a **readiness checklist**. Staff do **not** upload a
separate Serology, VSC, TB, or CPR file into TAE Placement. Exactly one file is
stored per student: the Final Placement Package, a single merged PDF an admin
prepares outside this application once the documents are ready.

The operational workflow is:

```
Open Student -> View Documents -> Mark each requirement's status
             -> Read the readiness summary
             -> (when ready) Admin merges the documents externally
             -> Admin uploads one merged PDF as the Final Placement Package
```

## The 13 initial requirements

Seeded by `supabase/migrations/0002_placement_documents.sql`:

1. Serology Report
2. Immunization Record
3. Pre-Placement Health Form
4. Blood Report
5. TB Test Report
6. COVID-19 Vaccination Report
7. Standard First Aid & CPR Certificate - Level C
8. N95 Mask Fit Certificate
9. Vulnerable Sector Police Check Certificate
10. WHMIS Certificate
11. AODA Certificate
12. BLS Certificate
13. GPA Certificate

All thirteen start as required and active.

TB is deliberately **one** requirement. Step 1, Step 2, and an X-ray report
where applicable are all handled through the single TB row and its internal
note. There are no separate TB Step 1 and TB Step 2 records.

Nothing in this list is hard-coded in a React component. Every requirement is a
row in `placement_document_requirements`, maintained from Admin.

## Database model

### placement_document_requirements

The configurable checklist definitions.

| Column | Meaning |
| --- | --- |
| `name` | Full name shown on the checklist. Unique, case-insensitive. |
| `short_name` | Compact label for the student summary. |
| `description` | One optional line of guidance for staff. |
| `is_required` | Required requirements form the readiness denominator. |
| `is_active` | Archived requirements stay in the table, off new checklists. |
| `sort_order` | Lower numbers first. |

Requirements are archived, never deleted. A database trigger refuses to delete
one that any student row already points at.

### student_placement_documents

One row per student per requirement, with
`unique (student_id, requirement_id)`. That constraint is what makes every
initialization path safe to run again.

Alongside the status it holds the request and received markers
(`requested_by`, `requested_at`, `received_by`, `received_at`), `updated_by`,
and one short internal `note`. No file is stored per requirement.

The `file_path`, `original_file_name`, `mime_type`, and `file_size_bytes`
columns from the first cut of this workflow are **deprecated**. They still exist
in the database, because dropping them would destroy the reference to anything
uploaded during earlier testing, but the application never reads or writes them
and they are absent from `database.types.ts`.
`supabase/migrations/0003_final_placement_package.sql` carries the `alter table`
that removes them, ready to run once the bucket has been checked for leftover
objects.

### student_placement_packages

One row per student, `unique (student_id)`: the current merged PDF. It holds
`file_path`, `original_file_name`, `mime_type`, `file_size_bytes`,
`uploaded_by`, `uploaded_at`, and `updated_at`.

There is no version history. Replacing a package supersedes the previous one and
deletes the old stored object.

### student_document_readiness

A derived view. It is the single definition of "X of Y ready" and is read by the
student page, the documents page, and the students list. It counts requirement
statuses only; the Final Placement Package is deliberately not part of it.

## Statuses

| Code | Label | Meaning |
| --- | --- | --- |
| `not_reviewed` | Not Reviewed | No action has been taken yet. |
| `requested` | Requested | Placement staff need this document from the student. |
| `received` | Received | The document is considered ready. |
| `needs_update` | Needs Update | Reviewed, but it needs replacing or correcting. |
| `not_applicable` | N/A | The requirement does not apply to this student. |

There are deliberately no other statuses, no review stages, no approval chain,
and no versioning.

## Readiness calculation

A document counts as **ready** when its status is `received` or
`not_applicable`.

- The denominator is every **active required** requirement.
- Optional requirements appear on the checklist but never block readiness.
- The Final Placement Package is **not** part of the calculation. A student can
  be fully ready with no package uploaded, and uploading one never makes a
  student ready.
- The denominator is counted from the requirements table, not from the student's
  rows, so a student who is somehow missing a checklist row can never look ready
  by accident.

The student sees, for example, `11 of 13 ready`.

### Overall document status

`students.document_status` stays the summary field and is **derived**. Staff
never maintain the checklist and the summary separately: a database trigger
recomputes the summary every time a checklist row changes.

| Summary | When |
| --- | --- |
| `not_reviewed` | Nothing on the checklist has been touched yet. |
| `ready` | Every active required requirement is `received` or `not_applicable`. |
| `pending` | Anything else, including any `needs_update`. |

Because it is derived, Document Status is shown read-only on Edit Student, and
`updateStudentAction` never writes it.

## Checklist initialization

Every path is idempotent through the unique constraint. Nothing ever creates a
duplicate row.

| Situation | Mechanism |
| --- | --- |
| The students already in the database | `select public.initialize_all_placement_documents();` runs once inside the migration. |
| A new student is created | `students_initialize_documents` trigger on `students`. |
| A new requirement is added, or an archived one is reactivated | `placement_document_requirements_backfill` trigger. |
| One student is missing rows | `initialize_student_placement_documents(student_id)`, offered as **Add Missing Documents** on the documents page. |

There is no client-side loop over the roster anywhere in this workflow.

Imported students keep `document_status = not_reviewed` after initialization.
Nothing is marked Received from the original workbook. The historical April and
June readiness is entered by hand; August onward uses the normal workflow.

## No per-document files

A requirement carries a status, the request and received markers, and one short
internal note. There is no upload, view, replace, or remove control on a
checklist row, and marking a document Received never asks for a file.

This is the important distinction: the official copies live in the LMS, and the
placement system records readiness rather than demanding a duplicate of every
scan.

## Final Placement Package

The one file TAE Placement stores per student. It sits below the checklist on
`/students/[studentId]/documents`.

The package is prepared **outside** this application. Once the checklist is
ready, an admin merges the student's documents into a single PDF using whatever
tool they already use, then uploads that one file here.

| State | What staff see |
| --- | --- |
| Not Uploaded | The state pill, and **Upload Merged PDF**. |
| Uploaded | The state pill, file name and size, upload date, who uploaded it, and **View**, **Replace**, **Remove**. |

- The package is **optional** the whole time documents are being prepared. It is
  not required to mark anything Received and it never affects the readiness
  count.
- PDF only. A merged package is a document, not a phone photo, so the two image
  formats are not offered for it.
- One current package per student. Replacing swaps the reference and deletes the
  previous stored object. There is no version history.
- Removing deletes the row and the stored object. The checklist is untouched, so
  readiness does not move.

## Private storage

Bucket `placement-documents`, the same private bucket created in
`0002_placement_documents.sql`.

- The bucket is **private**. `public = false`.
- There is no permanent public URL anywhere in the application.
- Viewing goes through `/api/placement-packages/[studentId]`, which verifies the
  staff session and mints a fresh signed URL valid for 60 seconds.
- Paths are `students/{student_id}/final-package/{random}.pdf`. Ids only, never
  a student name.
- The application accepts PDF only. The bucket still allows JPEG and PNG because
  it keeps serving the per-requirement objects uploaded before this workflow
  changed.
- Limit: 25 MB per package, enforced by the bucket and re-checked in the upload
  Server Action. Raised from the earlier 15 MB single-document limit by
  `0003_final_placement_package.sql`, because one merged PDF holds thirteen
  scanned documents. `next.config.ts` allows a 26 MB Server Action body to match.
- Nothing is written to `public/` and no uploaded file is ever committed to Git.
- The service role key is never read by application code. Every request uses the
  anon key plus the staff member's session, so Row Level Security always applies.

## Request behaviour

**Request** sets the status to `requested` and records `requested_by` and
`requested_at`. That is all it does.

There is no student email, no SMS, and no LMS integration in this ticket. The
marker is internal: it tells the next staff member that someone has already
asked. The student is contacted through the normal operational process.

**Mark Received** sets the status to `received` and records `received_by` and
`received_at`. No file is involved.

**Needs Update** sets the status to `needs_update`, which makes the overall
summary `pending`.

**Mark N/A** sets `not_applicable`, which counts as ready.

Moving a document off Received clears the received marker so `received_at`
always means "received right now". The earlier request marker is kept as
context.

## Internal note

Each document row carries one short internal note, up to 300 characters. For
example "VSC applied, expected next week" or "X-ray accepted instead of TB Step
2".

This is not a discussion thread. Broader conversation about a student belongs in
the existing student Comments.

## Admin requirement configuration

`/admin/document-requirements`, reachable from the Admin page.

An admin can:

- add a requirement
- edit its name, short name, description, and order
- reorder with the up and down controls
- switch a requirement between Required and Optional
- archive a requirement
- reactivate an archived requirement

A requirement already attached to students cannot be hard deleted. The database
raises an error if anything tries.

Adding or reactivating a requirement hands it to every active student
automatically.

## Permissions

The database is the security boundary. Row Level Security is enabled on both new
tables and on the storage objects, and no policy is granted to `anon`.

| Role | Documents |
| --- | --- |
| `admin` | View and update statuses, add notes, upload / view / replace / remove the final package, manage requirements. |
| `placement_manager` | View and update statuses, request documents, add notes, upload / view / replace / remove the final package. |
| `management` | View statuses, readiness, and the final package. No status changes, no package changes, no requirement configuration. |

Read access uses `public.is_active_staff()`. Write access uses
`public.can_manage_documents()`, which is admin and placement_manager only.
Requirement configuration uses `public.is_admin()`.
`student_placement_packages` carries the same policies plus a delete policy,
because a superseded package must actually be removable.

The UI hides controls a role cannot use, but that is convenience only. A request
sent straight to the API is refused by the policy, not by the interface.

## Bulk convenience

One bulk action exists: **Mark all as Not Reviewed**, for a single student,
behind a confirmation. It resets statuses and the request and received markers,
and keeps any uploaded Final Placement Package.

There is deliberately no bulk "mark everything Received" and nothing that
changes more than one student, because readiness must never move by accident.

## Routes

| Route | What it is |
| --- | --- |
| `/students/[studentId]` | Placement Documents summary: X of Y ready, progress, outstanding preview, View Documents. |
| `/students/[studentId]/documents` | The full checklist with quick actions, then the Final Placement Package. |
| `/admin/document-requirements` | Requirement configuration. |
| `/api/placement-packages/[studentId]` | Signed, short-lived private view of the merged PDF. |

Every status change happens on the checklist page itself. Nothing opens a
separate edit page for one document.

## What is intentionally not included

- no enterprise document management
- no per-requirement file upload, view, replace, or remove
- no review workflow or approval chain
- no package version history
- no automatic expiry logic
- no student email, SMS, or LMS integration
- no separate TB Step 1 and Step 2 records
- no bulk mass-readiness updates
- no new audit system; the request and received markers are the record
- no Dashboard changes

## Future boundaries

Placement partners and LTC accounts are PLACEMENT-03. Partner matching,
placement assignment, Kanban, active placements, and check-ins come after that.
Document expiry, reminders, and student-facing submission are not planned inside
this workflow.

The one piece of this ticket that stayed out is activity logging. The project
has no activity mechanism yet: `/activity` is still a placeholder. Rather than
build a separate audit system for documents alone, request and received record
who acted and when on the row itself. When a real activity feed is built, it can
read those columns.
