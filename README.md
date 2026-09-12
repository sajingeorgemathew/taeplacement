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

The Students module is real and database backed. Everything else is still the
foundation shell.

What works today:

- staff email and password sign in at `/login`, with no public registration
- every staff route requires a signed in, admin activated account
- Supabase Postgres with Row Level Security on profiles, batches, students, and
  student notes
- Students page with live counts, batch cards, search, and filters
- batch pages, Previous / Returning students, and single student pages
- Add Student, Edit Student, and internal student notes
- Batch Management in Admin
- a one-time local Excel migration script

What is deliberately not built yet:

- the detailed placement document checklist
- placement partner / LTC accounts
- placement assignment, partner matching, and check-ins
- notifications
- Dashboard redesign

The Students module is documented in
[docs/product/students-and-batches.md](docs/product/students-and-batches.md).

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
2. Run `supabase/migrations/0001_placement_core.sql` in the SQL editor.
3. Put the project URL and anon key in `.env.local`.
4. Create the first staff user in the Supabase Auth dashboard, then activate
   their profile (see
   [docs/product/students-and-batches.md](docs/product/students-and-batches.md)).

`SUPABASE_SERVICE_ROLE_KEY` is only needed for the one-time student migration
script. It bypasses Row Level Security, so it stays in `.env.local` and is never
exposed to the browser.

## Current ticket

PLACEMENT-01 - Students, Batches and Initial Migration
([docs/tickets/PLACEMENT-01-students.md](docs/tickets/PLACEMENT-01-students.md))

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
