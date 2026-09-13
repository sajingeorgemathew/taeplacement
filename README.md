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

The Students and Placement Documents modules are real and database backed.
Everything else is still the foundation shell.

What works today:

- staff email and password sign in at `/login`, with no public registration
- every staff route requires a signed in, admin activated account
- Supabase Postgres with Row Level Security on profiles, batches, students,
  student notes, document requirements, student documents, and placement
  packages
- Students page with live counts, batch cards, search, and filters
- batch pages, Previous / Returning students, and single student pages
- Add Student, Edit Student, and internal student notes
- the placement document checklist, with readiness derived from it
- one merged Final Placement Package per student, uploaded to a non-public
  Supabase Storage bucket
- Batch Management and Document Requirements in Admin
- a one-time local Excel migration script

What is deliberately not built yet:

- placement partner / LTC accounts
- placement assignment, partner matching, and check-ins
- notifications
- Dashboard redesign

The modules are documented in
[docs/product/students-and-batches.md](docs/product/students-and-batches.md) and
[docs/product/student-placement-documents.md](docs/product/student-placement-documents.md).

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
   `0001_placement_core.sql`, `0002_placement_documents.sql`, then
   `0003_final_placement_package.sql`.
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

`SUPABASE_SERVICE_ROLE_KEY` is only needed for the one-time student migration
script. It bypasses Row Level Security, so it stays in `.env.local` and is never
exposed to the browser.

## Current ticket

PLACEMENT-02 - Student Placement Documents
([docs/tickets/PLACEMENT-02-student-documents.md](docs/tickets/PLACEMENT-02-student-documents.md))

## Privacy warning

Student spreadsheets, exports, placement records, credentials, environment
variables, and other private operational data must never be committed to the
public repository.

Specifically:

- the local student workbook in this directory is private and must not be
  committed, renamed, moved, or served from `public/`
- `*.xlsx`, `*.xls`, and `*.csv` are ignored by Git and must stay ignored
- `.env`, `.env.local`, and `.env.*.local` are ignored by Git
- `_private/` and `_reference/private/` are ignored by Git

Check `git status` before every commit and confirm no private file is staged.
