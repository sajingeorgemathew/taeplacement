# TAE Placement

Toronto Academy of Education Placement Management.

Internal placement management application for Toronto Academy of Education.

## Purpose

This is an internal operations tool for a small placement and administrative staff
team. It is not a public SaaS product and it is not a public website.

The application will eventually support:

- student and batch management
- placement document readiness
- placement partner / LTC accounts
- student-to-placement assignment
- placement tracking and active placement monitoring
- ongoing placement check-ins
- internal activity, notes, and requests
- configurable placement areas and small team administration

The product rules that govern all of this work live in
[docs/product/PLACEMENT-PRODUCT-RULES.md](docs/product/PLACEMENT-PRODUCT-RULES.md).

## Technology stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- ESLint
- lucide-react icons
- Supabase (Postgres, Auth, Row Level Security)
- Resend for outbound placement email
- zod for input validation
- npm
- `src` directory with the `@/*` import alias

## Current status

The Students, Placement Documents, Placement Partners, and Placement modules are
real and database backed, Placement includes Batch Planning and the active
placement workspace, and placement-document status emails can now be sent to
students from the application. Everything else is still the foundation shell.

What works today:

- staff email and password sign in at `/login`, with no public registration
- every staff route requires a signed in, admin activated account
- Supabase Postgres with Row Level Security on profiles, batches, students,
  student notes, document requirements, student documents, placement packages,
  placement areas, placement partners, partner contacts, partner notes,
  student placements, and the outbound student email log
- Students page with live counts, batch cards, search, and filters
- batch pages, Previous / Returning students, and single student pages
- Add Student, Edit Student, and internal student notes
- the placement document checklist, with readiness derived from it
- one merged Final Placement Package per student, uploaded to a non-public
  Supabase Storage bucket
- the Placement Partners module: Area Board with drag and drop, List View,
  partner profiles, many contacts per partner, partner comments, and follow-up
  dates
- the Placement module: the Placement Board and List View, Find Placement,
  student-to-partner assignment with planned dates, cancellation that keeps the
  record, On Hold, placement history, and current placements on a partner
- the active placement workspace: an On Placement column on the Board, computed
  Starting Today / Start Date Passed / Ends Today / Planned End Date Passed
  indicators, Start Placement and Finish Placement as controlled actions from a
  card or from the student, and multi-partner placement history with credited
  hours per segment
- Batch Planning: a batch selector, live batch summary, geographic Area cards
  with student and partner-availability breakdowns, Unmapped City and City
  Missing exceptions, and an Area drill-down showing the students in an Area
  beside the placement partners in it
- placement document emails: a Student Message field kept strictly apart from
  the Internal Note, an individual status email behind a preview, batch-scoped
  outstanding-document reminders with a review screen, duplicate protection, an
  append-only per-student Email History that no staff token can rewrite, and a
  signature-verified Resend delivery webhook
- Batch Management, Document Requirements, Placement Areas, and City to Area
  Mapping in Admin
- two one-time local Excel migration scripts, for students and for partners

What is deliberately not built yet:

- check-ins, attendance, timesheets, weekly hour tracking, and evaluations
- placement capacity, slots, and distance
- notifications
- Dashboard redesign

The modules are documented in
[docs/product/students-and-batches.md](docs/product/students-and-batches.md),
[docs/product/student-placement-documents.md](docs/product/student-placement-documents.md),
[docs/product/placement-partners.md](docs/product/placement-partners.md),
[docs/product/student-placement-assignment.md](docs/product/student-placement-assignment.md),
[docs/product/batch-placement-planning.md](docs/product/batch-placement-planning.md),
[docs/product/active-placement.md](docs/product/active-placement.md),
and
[docs/product/student-document-email.md](docs/product/student-document-email.md).

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
npm run dev      # start the development server on http://localhost:3000
npm run build    # production build
npm run start    # run the production build
npm run lint     # ESLint
npm run check:email  # placement email rules. Sends nothing, touches no database
```

### Supabase setup

1. Create a Supabase project.
2. Run the migrations in `supabase/migrations/` in order in the SQL editor:
   `0001_placement_core.sql`, `0002_placement_documents.sql`,
   `0003_final_placement_package.sql`, `0004_placement_partners.sql`,
   `0005_partner_board_refinements.sql`, `0006_student_placements.sql`, then
   `0007_batch_placement_planning.sql`.

   `0008_student_document_email.sql` is **not applied yet**. It is written and
   waiting for review; see the note below.
3. Put the project URL and anon key in `.env.local`.
4. Create the first staff user in the Supabase Auth dashboard, then activate
   their profile (see
   [docs/product/students-and-batches.md](docs/product/students-and-batches.md)).

`0002_placement_documents.sql` also creates the private `placement-documents`
storage bucket and its policies, and `0003_final_placement_package.sql` raises
its limit to 25 MB for the merged package. If your SQL role cannot write to the
`storage` schema either migration raises a warning instead of failing; in that
case create the bucket in the Storage dashboard as **private**, 25 MB,
PDF/JPEG/PNG only, and add the four policies from the bottom of
`0002_placement_documents.sql`.

The 13 placement requirements are a readiness checklist and store no files. The
only file this application stores is one merged Final Placement Package per
student, which an admin prepares outside TAE Placement. It is private: it lives
only in that bucket, is read through short-lived signed URLs, and is never
stored in `public/` or committed to Git.

`0004_placement_partners.sql` is additive: it adds the partner network and seeds
six editable placement areas, and it changes nothing about students, batches,
notes, or documents. `0005_partner_board_refinements.sql` adds Area colours and
Partner Placement Availability on top of it.

`0006_student_placements.sql` is additive in the same way: it adds
`student_placements`, the two placement hold columns on `students`,
`finish_student_placement()`, and the triggers that keep
`students.placement_status` in step with document readiness and with real
placement records. It rewrites no earlier migration, resets nothing, re-imports
no student and no partner, and infers no historical placement from any
spreadsheet. Running it preserves all 86 students and every imported placement
partner.

It keeps two completions deliberately apart. `student_placements.status =
completed` means ONE placement segment finished at ONE partner;
`students.placement_status = placement_completed` means the student's WHOLE
placement requirement is finished. A student may do 120 hours at one LTC, end
there early, and finish the remaining 180 somewhere else, so a placement that
ends is not a cancellation and is not automatically a completion.

It keeps the two endings apart too. An `assigned` placement can be started or
cancelled; a `started` one can only be finished, as `completed` or
`ended_early`. A student who was actually at a partner was never "cancelled",
and their credited hours have to land somewhere.

The active placement workspace is built entirely on this migration and **adds no
schema of its own**. On Placement is `students.placement_status =
'placement_started'` with the student's live `student_placements` row at `status
= 'started'`; there is no second definition anywhere. Starting Today, Start Date
Passed, Ends Today, Ends in N days, and Planned End Date Passed are computed
from the dates a placement already has, at the moment a page renders. They are
observations, never statuses, never fields, and nothing acts on them: **a
placement never starts because its planned date arrived.**

`0007_batch_placement_planning.sql` is additive in the same way. It adds one
table, `placement_area_cities`, which maps a normalized student city to one
operational placement area, plus a guard that stops an area cities point at from
being hard deleted. It rewrites no earlier migration, resets nothing, re-imports
nobody, changes no student city value, and modifies no historical placement.

It seeds **no** mappings. Guessing that "Mississauga" belongs to "Peel" would be
the migration inventing Ontario geography, and a wrong guess would quietly plan
a batch around the wrong partners. Cities are mapped by an admin at
`/admin/city-area-mapping`, from the cities their own students actually have.

There is deliberately no `students.area_id`. A student's placement area is
always derived: `students.city` -> normalized city -> `placement_area_cities` ->
`placement_areas`, which is the same `placement_areas.id` that partners are
grouped by. A city with no mapping is Unmapped, and Unmapped is the absence of a
row rather than a placeholder area.

`0008_student_document_email.sql` is additive in the same way, and is **not
applied yet**. It adds one nullable column,
`student_placement_documents.student_message`, and one table,
`student_email_log`, with its indexes, an `updated_at` trigger, a trigger that
refuses deletion, and its policies. It rewrites no earlier migration, resets
nothing, re-imports nobody, seeds nothing, and backfills nothing. In particular
it does **not** copy existing internal notes into `student_message`: that column
starts null on every row.

That distinction is the whole point of the migration.
`student_placement_documents.note` is INTERNAL and is never emailed;
`student_message` is written on purpose, for the student, and is the only free
text a student ever reads. The application enforces it structurally rather than
by convention - the function that builds an email cannot see `note` at all - and
`npm run check:email` renders a full email from a checklist whose every row
carries an internal note and asserts that none of it appears anywhere.

The two fields have different limits and are deliberately not kept in step.
`student_message` is capped at 500 characters by the Zod schema AND by a CHECK
constraint in 0008, because it is the field whose contents leave the building.
`note` is capped at 300 by the Zod schema only: 0002 created it as plain `note
text` and it has never had a database length constraint.

`student_email_log` is APPEND ONLY. Ordinary authenticated staff, admins
included, are granted `SELECT` on it and nothing else, and there is no write
policy to go with it. Rows are created and advanced only by the server, using
the service role, and only after the Server Action has authenticated the staff
member and checked `canManageDocuments()`. An audit record its own subject can
rewrite is not an audit record, so a placement manager cannot amend a recipient,
a subject, a body, a snapshot, a provider id, or a delivery status from a
browser session. Deletion is refused by a trigger, which stops the service role
too.

Until 0008 is applied the column and the table do not exist, so the placement
document email features cannot work against the database. Concretely: the
Student -> Placement Documents page reads the Email History and will error until
the migration has been run. That is expected while 0008 is under review, and
applying it is the one step that clears it. No code change is needed.

`SUPABASE_SERVICE_ROLE_KEY` is needed for the two one-time migration scripts,
`scripts/import-initial-students.ts` and
`scripts/import-placement-partners.ts`, and by the Resend delivery webhook at
`/api/resend/webhook`, which has no signed in staff member behind it and still
has to advance a delivery status. Those are the only callers. It bypasses Row
Level Security, so it stays in `.env.local` and is never exposed to the browser.

### Outbound email

Placement document emails are sent through Resend. Every Resend value is server
only, none of them is a `NEXT_PUBLIC_` variable, and the modules that read them
start with `import "server-only"` so a Client Component that imported one would
fail the build:

```
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_REPLY_TO
RESEND_WEBHOOK_SECRET   # only once the webhook endpoint is registered
```

The application builds and runs with all of them blank. Only a **send** is
refused, with a plain message.

Nothing sends by itself. There is no trigger, no schedule, and no status change
anywhere that causes an email: a staff member opens a preview, reads it, and
presses Send. The delivery webhook at `/api/resend/webhook` is implemented and
**not registered in Resend yet**; until `RESEND_WEBHOOK_SECRET` is set it
refuses every request rather than trusting an unsigned one.

Production also needs `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and
`RESEND_REPLY_TO` in Vercel, and `RESEND_WEBHOOK_SECRET` after the webhook is
registered. Real values never go in this repository or in the docs.

## Current ticket

PLACEMENT-06A - Student Placement Document Email System
([docs/tickets/PLACEMENT-06A-document-email.md](docs/tickets/PLACEMENT-06A-document-email.md))

## Privacy warning

Student spreadsheets, exports, placement records, credentials, environment
variables, and other private operational data must never be committed to the
public repository.

Specifically:

- the local student workbook in this directory and the cleaned partner workbook
  under `_private/imports/` are private and must not be committed, renamed,
  moved, or served from `public/`
- `*.xlsx`, `*.xls`, and `*.csv` are ignored by Git and must stay ignored
- `.env`, `.env.local`, and `.env.*.local` are ignored by Git, and the local
  `RESEND_API_KEY` is a LIVE key: never paste it into a file, a script, a log,
  or a document
- `_private/` and `_reference/private/` are ignored by Git

Check `git status` before every commit and confirm no private file is staged.
