# PLACEMENT-07B.1 - Batch Document Grid

## Status

**Implemented. One additive migration: `0011_student_class_session.sql`.**

The batch page (`/students/batches/[batchId]`) now opens, by default, on an
Excel-like grid of the whole batch: one student per row, one ACTIVE placement
document requirement per column, the stored status in every cell, editable in
place. Staff no longer open students one at a time to review or update
placement documents.

| Area | Where |
| --- | --- |
| Migration: `students.class_session` | `supabase/migrations/0011_student_class_session.sql` |
| Session vocabulary | `src/lib/placement/constants.ts` (`CLASS_SESSIONS`, labels) |
| Session change schema | `src/lib/students/schema.ts` (`ClassSessionChangeSchema`) |
| Session action | `src/lib/students/actions.ts` (`setStudentClassSessionAction`) |
| Matrix builder, view parser (pure) | `src/lib/documents/batch-grid.ts` |
| Bulk reads | `src/lib/documents/batch-grid-queries.ts` (`readBatchGridData`) |
| Page, view switch | `src/app/(app)/students/batches/[batchId]/page.tsx`, `src/components/students/BatchViewSwitch.tsx` |
| Grid | `src/components/documents/BatchDocumentGrid.tsx` |
| Status cell | `src/components/documents/BatchDocumentStatusCell.tsx` |
| Per-requirement internal note | `src/components/documents/DocumentInternalNoteButton.tsx` |
| General notes cell | `src/components/documents/StudentGeneralNotesCell.tsx` |
| Session cell | `src/components/documents/StudentSessionCell.tsx` |
| Cell colours | `src/components/documents/batch-grid-tones.ts` |
| Checks | `scripts/check-batch-document-grid.ts` (`npm run check:batch-grid`) |

## The Excel-style batch workflow

```
Student          Session   Placement        Ready   Serology   Immunization   ...   General Notes              Open
Jane Smith       Morning   Documents Pend.  9 / 13  Received   Requested      ...   "Not responding..."        Open
S-0412                                                [note]                        Sep 26 · Priya
                                                                                    [Add Note] [View Notes (3)]
Amir Khan        Evening   Ready            13 / 13 Received   Received       ...   No notes yet               Open
S-0418                                                                              [Add Note]
```

- The grid is horizontally scrollable and capped at 75% of the viewport
  height with a sticky header, so the requirement names stay visible while
  scrolling down and the Student and Session columns stay visible while
  scrolling across. Visible cell borders, compact selects, row hover.
- The sticky Student cell shows the name (a link to the profile), the
  student number under it, and a Returning badge where relevant. No contact
  or address fields: this is a placement documentation surface.
- Placement status is a compact pill. It is shown, never edited, here.
- Readiness is "9 / 13" from the existing derived
  `student_document_readiness` view, coloured the same three-way as the
  student list. It is never recalculated from the cells.
- Open Student is the last column.
- The grid is not forced onto a phone width. Sideways scrolling is correct.

## Two views, one page

```
[ Document Grid ]  [ Student Cards ]
```

`?view=grid` (default) or `?view=cards` (the original `StudentList`,
unchanged). A missing, empty, or unknown `view` opens the grid. The header,
the three summary tiles, the search, and the reminder link are the same in
both views. `view` is carried in the toolbar's URL values so a search on the
cards view stays on the cards view.

## Student-level Morning / Evening session

### Why `batches.schedule_label` is insufficient

A batch is NOT purely Morning or purely Evening. The August batch holds
Morning students and Evening students; so does September.
`batches.schedule_label` is a free-text description of the batch as a whole
and cannot say which session one student attends. Nothing in this ticket
reads it for that purpose, and the check script asserts that neither the
matrix nor the components mention it.

### Migration 0011

```sql
alter table public.students
  add column if not exists class_session text null;

alter table public.students
  add constraint students_class_session_check
  check (class_session is null or class_session in ('morning', 'evening'));

comment on column public.students.class_session is
  'This identifies the student''s class/session within a batch. A single batch
   may contain both Morning and Evening students. ...';
```

- `null` means Not Set.
- No existing student is inferred, derived, or backfilled. Every student
  starts as Not Set and staff choose Morning or Evening on purpose.
- No default other than null, no index, no trigger, no function, no policy.
  The existing 0001 student policies apply: any active staff member reads
  and updates it.
- The 0006 placement guard watches `placement_status` and the hold columns
  only, so saving a session is never a placement change.
- `StudentRow` gains `class_session: ClassSession | null`; `StudentInsert`
  treats it as optional so the student form and the import script are
  untouched.

### Editing

Session is edited from the grid only (this ticket). The cell is a compact
select: Not Set / Morning / Evening. Saving calls
`setStudentClassSessionAction`, which writes `students.class_session` for one
student and nothing else: not the batch, not the placement status, not the
documents, not the program, no student note. The check script asserts the
update object is exactly `{ class_session }`.

The student profile header now shows the session beside the batch name when
one is set ("PSW - September 2026 - Morning"). The full student form was not
changed.

## Dynamic document columns

Columns are the ACTIVE `placement_document_requirements` rows in `sort_order`
then name, exactly as the single-student checklist orders them. Nothing is
hard-coded. The header shows Admin's short name where set (else the full
name, with the full name as a tooltip) and marks optional requirements.

If a student has no `student_placement_documents` row for an active
requirement, the cell shows **Not Initialized**. It is not a status, it is
not editable here, and viewing the grid creates nothing. A notice above the
grid counts the affected students and points to the existing Add Missing
Documents action on the student's documents page.

## Status editing

Every requirement cell shows the stored status with its label:

| Status | Label | Colour |
| --- | --- | --- |
| `received` | Received | green |
| `requested` | Requested | amber |
| `needs_update` | Needs Update | red |
| `not_reviewed` | Not Reviewed | neutral |
| `not_applicable` | N/A | muted |
| (no row) | Not Initialized | muted, dashed |

Requested and Needs Update are deliberately different colours on the grid,
even though the full checklist pill shows both in coral: across fifty rows
and thirteen columns the difference between "we asked" and "it is wrong" is
what staff scan for. The checklist and everywhere else are unchanged.

Staff with `canManageDocuments` get a compact select. Changing it:

```
select new status -> Saving... -> setDocumentStatusAction -> server re-renders the row
```

- One change updates exactly one `student_placement_documents` row by its
  id, through the existing `setDocumentStatusAction`. The database triggers
  from 0002 and 0006 then recompute `document_status` and, for a
  pre-placement student, `placement_status`, exactly as a click on the full
  checklist does. Nothing is re-implemented.
- The readiness column refreshes with the row, because the action
  revalidates the batch page.
- If the save fails the select falls back to the stored value, shows the
  error, and offers Retry. It never shows the new value as current until the
  server has confirmed it.
- There is no Save Entire Spreadsheet button.

View-only staff (management) see the status as a coloured label with no
controls, the same rule the checklist applies.

## Document-specific internal notes

Every document cell has a note button. A cell with a note shows a marked
icon with the note as its tooltip. The button opens a compact dialog that
reads and writes **`student_placement_documents.note`** through the existing
`saveDocumentNoteAction`.

This is the INTERNAL staff note about that one requirement for that one
student ("Step 1 complete. Step 2 booked Oct 8."). It is never emailed. The
dialog says so. There is no second document-note field.

## General student notes

The last column before Open Student is General Notes, backed by
**`student_notes`**: the student's general internal history ("Not
responding", "Called, no answer", "Will submit documents Friday").

- The cell shows the LATEST note as a two-line preview with its date and
  author, chosen by `created_at`, never by read order.
- Add Note opens a compact dialog whose form posts to the existing
  `addStudentNoteAction`, which INSERTS a new `student_notes` row. Earlier
  notes are never overwritten; the check script asserts the action contains
  no update, upsert, or delete.
- View Notes (with the count) opens the student profile, where the Comments
  panel holds the full history. The history is not loaded into the grid.

## Clear note separation

| | Column | Reader | On the grid |
| --- | --- | --- | --- |
| A | `student_placement_documents.note` | staff | shown and edited through the requirement cell's note button |
| B | `student_placement_documents.student_message` | the student, by email | **not read, not shown, not editable** |
| C | `student_notes` | staff | latest preview in General Notes; Add Note appends |

The bulk checklist read selects `id, student_id, requirement_id, status,
note` and nothing else. The matrix cell type has no field for
`student_message`, so a wider row cannot carry it. The check script feeds
rows that DO contain a student message and asserts the string and the
column name never appear in the output, and that no grid source file names
`student_message` or `saveStudentMessageAction` in code.

## Permissions

| Action | Rule | Enforced by |
| --- | --- | --- |
| Change a document status | `canManageDocuments` (admin, placement manager) | the existing action and `can_manage_documents()` in 0002 |
| Edit a document internal note | `canManageDocuments` | same |
| Add a general note | any active staff member | `addStudentNoteAction` and the 0001 `student_notes` insert policy |
| Set Morning / Evening | any active staff member (the student edit model) | `requireActiveStaff()` and the 0001 `students` update policy |
| View the grid | any active staff member | the page's reads |

The page passes `canManageDocuments(session)` to the status and note
controls and `isActiveStaff(session)` to the session and general-note
controls. The database and its RLS policies remain the security boundary;
the flags only decide what is rendered.

## Privacy

- `student_message` never reaches the grid, by type and by query.
- Requirement descriptions are not read.
- No contact, address, or email data is on the grid.
- The grid sends no email, reads no email log, and changes nothing in email
  history.

## Serology / Blood Report: unchanged

Both are seeded as separate active requirements in 0002. Both appear as
columns under their own names because that is what the database holds.
Nothing here renames, merges, archives, or re-weights either, and readiness
semantics are untouched. Consolidation remains a separate cleanup ticket
(see PLACEMENT-07B for what that would take).

## Query and performance approach

Per page load, a fixed number of reads, never one per student or per cell:

1. batch, filtered students in the batch, readiness view, session (as
   before)
2. active requirements; checklist rows for the student ids (sliced at 200
   ids, selecting five columns); `student_notes` for the same ids;
   profile names for note authors (one small read, only if any)

The matrix is built once in memory (`buildBatchDocumentGrid`):

```
studentId -> requirementId -> { documentId, status, note } | missing
```

Typical batch: 15-50 students, ~13 requirements. The full matrix is
rendered; no pagination or virtualization. The bulk reads happen only when
the grid view is shown.

## Revalidation

| After | Paths |
| --- | --- |
| document status change | `/students/batches/[batchId]` (page), `/students/[id]`, `/students/[id]/documents`, `/students`, `/placement` |
| document internal note | same set (the existing `revalidateStudent`) |
| general student note | `/students/batches/[batchId]` (page), `/students/[id]` |
| class session | `/students/batches/[batchId]` (page), `/students/[id]`, `/students` |

The batch path uses the dynamic form so the student's batch is refreshed
without a second read to find out which batch that is. Email history is
not touched.

## What this ticket does NOT do

- No change to the readiness view, the status triggers, or any placement
  rule.
- No placement status editing on the grid.
- No edit of `student_message` from the grid.
- No change to the full student form.
- No change to Serology or Blood Report.
- No email, no Resend, no webhook change.
- No inference of sessions for existing students.

## Checks

`npm run check:batch-grid` (81 checks, offline, no database, no email):

- A. one student = one row; rows in student order; no ghost rows;
  requirements determine columns; sort_order then name respected; short
  name headers; optional columns; archived requirement rows ignored;
  Serology and Blood both present
- B. correct status at each intersection; cell carries exactly its row id;
  missing row is Not Initialized and counted; the five labels; the colour
  scale
- C. document note is `student_placement_documents.note`; `student_message`
  never appears even from a wider row; General Notes is the latest
  `student_notes` row by `created_at`; date and author; counts; preview
- D. Morning -> `morning`, Evening -> `evening`, Not Set -> `null`,
  whitespace -> `null`, anything else refused; one batch holds both
  sessions and Not Set
- E. readiness is the view's value passed through; placement status as
  stored
- F. PSW and ECEA through one builder; no cross-batch rows; search narrows
  rows only, columns unchanged
- G. view defaults to grid; `cards` opens cards; the toolbar carries `view`
- H. status edit updates one row by id; note button uses the existing note
  action; note and message actions stay separate; no grid code names
  `student_message`; bulk read selects five columns; no mutation in reads;
  general note inserts and never updates; session action updates only
  `class_session` under the student edit permission; document controls
  behind `canManageDocuments`; no placement dropdown; batch-scoped student
  list; no `schedule_label` in grid code; no readiness arithmetic; no email
- I. revalidation paths for each action
- J. migration 0011 adds the column, the CHECK, and the comment; infers
  nothing; touches no other table or policy; leaves Serology and Blood alone

`npm run check:planning`, `npm run check:programs`, `npm run check:email`,
`npm run lint`, and `npm run build` pass. The planning check's "this ticket
adds no migration" assertion now counts migrations up to 0010 only, since
later tickets may add their own.
