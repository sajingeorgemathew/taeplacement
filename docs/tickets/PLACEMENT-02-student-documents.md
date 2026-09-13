# PLACEMENT-02 - Student Placement Documents

## Amendment - revised before final testing

The real operational workflow is simpler than this ticket first described.

The 13 placement requirements are **primarily a readiness checklist**. Staff do
not upload a separate Serology, VSC, TB, CPR, or any other per-document file
into TAE Placement.

Instead there is **one student-level Final Placement Package**: a single merged
PDF an admin prepares outside this application once the documents are ready.

```
Individual requirements -> staff mark each status
                        -> when documents are ready, Admin prepares one merged
                           PDF externally
                        -> Admin uploads that single merged PDF as the student's
                           Final Placement Package
```

What this amendment changes:

- per-document `file_path`, `original_file_name`, `mime_type`, and
  `file_size_bytes` are no longer used by the application; the columns stay in
  the database, deprecated, because dropping them would be destructive
- the per-document Upload / Replace / View / Remove File controls are gone from
  the checklist UI
- a new `student_placement_packages` table holds one merged PDF per student, at
  `students/{student_id}/final-package/{uuid}.pdf` in the existing private
  `placement-documents` bucket
- the package is PDF only, up to 25 MB, and is **optional** while documents are
  being prepared
- `/api/placement-documents/[documentId]` is replaced by
  `/api/placement-packages/[studentId]`
- `student_document_readiness` loses `file_count`

What this amendment does **not** change: requirement configuration, the
checklist, the status workflow, the readiness count, Request / Received / Needs
Update / N/A, the internal notes, RLS, the existing 86 students, and future
student initialization. **Readiness remains based only on the 13 requirement
statuses** and the final package never affects it.

Delivered by `supabase/migrations/0003_final_placement_package.sql`, a
follow-up additive migration. `0002_placement_documents.sql` may already have
been applied to the development database, so it was not rewritten.

The sections below are the original ticket. Where they describe per-document
file upload, replacement, viewing, or storage paths, this amendment supersedes
them.

## Goal

Build the placement document readiness workflow for students.

This ticket should make it very easy for staff to answer:

- What documents does this student need?
- Which documents are complete?
- Which documents are missing?
- Has a document been requested?
- Is there a file attached?
- Is the student ready from the document side?

This is not a replacement for the LMS.

The LMS remains the primary student submission system.

TAE Placement only needs a simple internal operational record of placement readiness, with optional private file storage when staff need the file directly inside the placement system.

## Product principle

Keep this extremely simple.

The main workflow should be:

Open Student
-> View Documents
-> Mark status
-> Optionally request document
-> Optionally upload file
-> See readiness summary

Do not create enterprise document management.

Do not add complicated review workflows.

Do not add versioning systems.

Do not add approval chains.

Do not add automatic expiry logic in this ticket.

## Existing project

Continue from:

PLACEMENT-01 - Students, Batches and Initial Migration

Do not recreate:

- authentication
- students
- batches
- notes
- student import
- admin foundation

Use the existing Supabase and authentication architecture.

## Initial placement document requirements

Seed these 13 requirements:

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

For TB Test Report, staff may use the attached file for:

- Step 1 and Step 2
- or X-ray report where applicable

Do not create separate TB Step 1 and Step 2 database requirements in this ticket.

Keep TB as one checklist requirement.

## Document requirement configuration

Create a database table for document requirement definitions.

Suggested table:

placement_document_requirements

Fields:

- id UUID primary key
- name text
- short_name text nullable
- description text nullable
- is_required boolean
- is_active boolean
- sort_order integer
- created_at
- updated_at

Seed the 13 requirements above.

Do not hard-code document requirements only inside React components.

Future requirements must be manageable from Admin.

## Admin document requirements

Create:

/admin/document-requirements

Add an entry from the main Admin page.

Admin should be able to:

- add requirement
- edit requirement
- change order
- mark required / optional
- archive requirement
- reactivate requirement

Do not permanently delete requirements already connected to students.

Keep the interface simple.

## Student document records

Create a table such as:

student_placement_documents

Suggested fields:

- id UUID primary key
- student_id UUID references students
- requirement_id UUID references placement_document_requirements
- status text
- file_path text nullable
- original_file_name text nullable
- mime_type text nullable
- file_size_bytes bigint nullable
- requested_by UUID nullable references profiles
- requested_at timestamptz nullable
- received_by UUID nullable references profiles
- received_at timestamptz nullable
- updated_by UUID nullable references profiles
- note text nullable
- created_at
- updated_at

Add a unique constraint on:

student_id + requirement_id

Do not create duplicate checklist entries for the same student and document requirement.

## Document statuses

Use these statuses:

- not_reviewed
- requested
- received
- needs_update
- not_applicable

Human labels:

Not Reviewed
Requested
Received
Needs Update
N/A

Do not add more statuses unless technically necessary.

## Status behavior

Not Reviewed:
No action has been taken yet.

Requested:
Placement staff or admin needs the document.

Received:
Document is considered ready.

Needs Update:
A document exists or was reviewed but needs replacement or correction.

N/A:
Requirement does not apply to this student.

## Readiness calculation

A document counts as ready when status is:

- received
- not_applicable

Required active document requirements should be included in the readiness denominator.

Optional requirements should not prevent overall readiness.

Example:

11 of 13 ready

Overall student document status should be derived from detailed document records.

Use the existing students.document_status field as the summary field if practical.

Recommended summary behavior:

not_reviewed:
No detailed requirement has been meaningfully updated.

pending:
At least one required active requirement is not_reviewed, requested, or needs_update.

ready:
Every required active requirement is received or not_applicable.

Do not require staff to manually maintain both the checklist and the summary status independently.

Keep them synchronized automatically or derive the summary from detailed records.

## Initial checklist creation

Existing 86 imported students must receive the current active requirements.

Do not manually create 86 x 13 records through the UI.

Use a safe database migration or initialization function.

New students created in the future must automatically receive active document requirements.

When a new requirement is added later, existing active students should be able to receive it safely without duplicates.

Prefer an idempotent database function or server action.

Do not use fragile client-side loops as the only mechanism.

## Student page

Add a clearly visible Placement Documents section to:

/students/[studentId]

Show:

Placement Documents
X of Y ready

Use a visual progress indicator.

Show a short preview of incomplete items.

Include a clear button:

View Documents

Route to:

/students/[studentId]/documents

Do not display all 13 documents on the main student page if that makes the page crowded.

## Student documents page

Create:

/students/[studentId]/documents

Top area:

- Back to Student
- student name
- student number
- batch
- Placement Documents
- X of Y ready
- overall readiness

Show all active requirements as large comfortable rows/cards.

Each row should show:

- requirement name
- status
- file availability
- simple action control

Possible actions:

- Mark Received
- Request
- Needs Update
- Mark N/A
- Upload / Replace File
- View File
- Remove File if authorized

Do not require opening a separate edit page for every status change.

Status updates should be quick.

## File upload

File upload is optional.

A status may be marked Received even if the actual file remains in the LMS and is not copied into this application.

This distinction is important.

Do not require a file in order to mark a document Received.

If staff want a local placement-system copy, allow private upload.

## Supabase Storage

Create a private storage bucket for placement documents.

Suggested bucket:

placement-documents

The bucket must NOT be public.

Use a structured path such as:

students/{student_id}/{requirement_id}/{generated_filename}

Do not use student names in storage paths.

Do not expose permanent public URLs.

Use authenticated/private access and signed URLs where appropriate.

## File security

Student documents may contain sensitive medical or personal information.

Required:

- private bucket
- authenticated access only
- RLS/storage policies
- no public URLs
- no files committed to Git
- no files stored in public/
- no service-role key exposed to browser
- validate uploaded file size and basic MIME type

Allow common operational formats:

- PDF
- JPG
- JPEG
- PNG

Do not support executable files.

Use a reasonable upload size limit.

Suggested initial limit:

15 MB per file

## File replacement

One current file per student requirement is sufficient for V1.

If staff replace a file:

- update the active file reference
- remove the old storage object safely where practical

Do not build full file version history in this ticket.

## Request workflow

When staff click Request:

- status becomes requested
- requested_by is recorded
- requested_at is recorded

There is no student email automation in this ticket.

There is no SMS automation.

There is no LMS integration.

This is an internal request marker only.

The student can later be contacted using the normal operational process.

## Received workflow

When staff mark Received:

- status becomes received
- received_by is recorded
- received_at is recorded

A file is optional.

## Needs Update workflow

When staff mark Needs Update:

- status becomes needs_update
- readiness becomes pending

Existing file may remain visible until replaced.

## N/A workflow

When staff mark N/A:

- status becomes not_applicable
- it counts as ready for overall readiness

## Internal note

Each document row may have one short internal note.

Examples:

- Waiting for updated CPR
- VSC applied, expected next week
- X-ray accepted instead of TB Step 2

Do not build threaded comments per document.

Student-level Comments already exist for broader discussion.

## Permissions

Authenticated active staff:

admin:
- view/update document statuses
- upload/view/remove files
- manage requirements

placement_manager:
- view/update document statuses
- request documents
- upload/view files
- add document notes

management:
- view documents and readiness
- view files if existing access model permits
- avoid requirement configuration unless already supported by admin rules

The database remains the security boundary.

Use RLS.

Do not rely only on hidden UI controls.

## Existing student document status

PLACEMENT-01 imported students with:

document_status = not_reviewed

That is correct.

After checklist initialization, keep them initially:

not_reviewed

Do not automatically mark anything Received from the old Excel.

The user will manually update historical April and June document readiness.

August onward will use the normal workflow.

## Bulk convenience

Add one simple convenience action where useful:

Mark all as Not Reviewed

Do NOT add:

- bulk mark everything Received
- dangerous multi-student mass updates

We want speed without accidental readiness changes.

## Students page integration

Do not redesign the whole Students page.

Continue displaying the document summary status.

Where practical, add a simple readiness count such as:

9/13

Do not make the Students page visually dense.

## UI direction

Functionality is the priority in this ticket.

Do not perform a full visual redesign.

However:

- maintain large readable text
- use comfortable spacing
- use green for ready/received
- soft red/coral for missing/requested/needs update
- blue for neutral/in-progress
- preserve clear Back navigation
- preserve prominent Comments access on student pages

Do not spend this ticket rebuilding the Dashboard.

## Activity

If the project already has an activity mechanism, record useful actions where easy.

Examples:

- Document requested
- Document marked received
- File uploaded
- File replaced

Do not build a new complicated audit system solely for this ticket.

## Migration

Create a new Supabase migration after the existing placement core migration.

Do not edit previously applied migrations destructively.

Create a new migration file.

Include:

- placement_document_requirements
- student_placement_documents
- indexes
- constraints
- RLS
- storage bucket/policies if appropriate
- seed requirements
- initialization mechanism

Migration must be safe to apply once to the existing database containing the 86 imported students.

## Existing real data

Do not delete or alter:

- the 86 imported students
- batches
- student notes
- profiles
- authentication users

Do not reset the database.

## Excel

The original student Excel migration is complete.

Do not modify PLACEMENT-01 import behavior in this ticket unless fixing a real bug.

Do not re-import students.

## Placement Partners

Do not build LTC/Placement Partner functionality.

That is PLACEMENT-03.

## Placement Assignment

Do not build:

- LTC matching
- placement assignment
- Kanban
- drag and drop
- active placement check-ins

Those belong to later tickets.

## Documentation

Create:

docs/product/student-placement-documents.md

Document:

- purpose
- requirements
- status meanings
- readiness calculation
- optional file behavior
- private storage behavior
- request behavior
- admin requirement configuration
- permissions
- what is intentionally not included
- future boundaries

Update README current ticket to:

PLACEMENT-02 - Student Placement Documents

## Validation

Run:

npm run lint
npm run build
git status

Also validate the new migration SQL carefully.

Confirm no:

- .env files
- student spreadsheets
- uploaded student documents
- reference screenshots
- CSV files

are staged.

## Done criteria

- document requirements table exists
- 13 initial requirements seeded
- requirements are admin configurable
- student document table exists
- unique student + requirement constraint exists
- existing students receive checklist safely
- new students receive checklist safely
- statuses work
- readiness count works
- overall document status is derived/synchronized
- student page shows readiness summary
- dedicated documents page exists
- Request works
- Mark Received works
- Needs Update works
- N/A works
- internal document note works
- optional file upload works
- file is not required for Received status
- private Supabase bucket exists
- files are not publicly accessible
- signed/private viewing works
- replacement works safely
- RLS protects document metadata and files
- Admin document requirements page works
- existing 86 students remain intact
- no LTC module built
- no placement assignment built
- no Dashboard redesign
- npm run lint passes
- npm run build passes
- no private files are staged
