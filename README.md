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
- zod for input validation
- npm
- `src` directory with the `@/*` import alias

## Current status

The Students, Placement Documents, Placement Partners, and Placement modules are
real and database backed. Everything else is still the foundation shell.

What works today:

- staff email and password sign in at `/login`, with no public registration
- every staff route requires a signed in, admin activated account
- Supabase Postgres with Row Level Security on profiles, batches, students,
  student notes, document requirements, student documents, placement packages,
  placement areas, placement partners, partner contacts, partner notes, and
  student placements
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
- Batch Management, Document Requirements, and Placement Areas in Admin
- two one-time local Excel migration scripts, for students and for partners

What is deliberately not built yet:

- check-ins, attendance, placement hours, and evaluations
- the placement start and completion workflow
- placement capacity, slots, and distance
- notifications
- Dashboard redesign

The modules are documented in
[docs/product/students-and-batches.md](docs/product/students-and-batches.md),
[docs/product/student-placement-documents.md](docs/product/student-placement-documents.md),
[docs/product/placement-partners.md](docs/product/placement-partners.md), and
[docs/product/student-placement-assignment.md](docs/product/student-placement-assignment.md).

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
npm run dev      # start the development server on http://localhost:3000
npm run build    # production build
npm run start    # run the production build
npm run lint     # ESLint
```

### Supabase setup

1. Create a Supabase project.
2. Run the migrations in `supabase/migrations/` in order in the SQL editor:
   `0001_placement_core.sql`, `0002_placement_documents.sql`,
   `0003_final_placement_package.sql`, `0004_placement_partners.sql`,
   `0005_partner_board_refinements.sql`, then `0006_student_placements.sql`.
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

`SUPABASE_SERVICE_ROLE_KEY` is only needed for the two one-time migration
scripts, `scripts/import-initial-students.ts` and
`scripts/import-placement-partners.ts`. It bypasses Row Level Security, so it
stays in `.env.local` and is never exposed to the browser.

## Current ticket

PLACEMENT-04 - Student Placement Assignment and Placement Board
([docs/tickets/PLACEMENT-04-assignment-board.md](docs/tickets/PLACEMENT-04-assignment-board.md))

## Privacy warning

Student spreadsheets, exports, placement records, credentials, environment
variables, and other private operational data must never be committed to the
public repository.

Specifically:

- the local student workbook in this directory and the cleaned partner workbook
  under `_private/imports/` are private and must not be committed, renamed,
  moved, or served from `public/`
- `*.xlsx`, `*.xls`, and `*.csv` are ignored by Git and must stay ignored
- `.env`, `.env.local`, and `.env.*.local` are ignored by Git
- `_private/` and `_reference/private/` are ignored by Git

Check `git status` before every commit and confirm no private file is staged.
