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
- npm
- `src` directory with the `@/*` import alias

## Current status

Foundation only. The application shell, navigation, routing, and visual direction
exist. No business functionality has been built yet.

What works today:

- `/` redirects to `/dashboard`
- routes for Dashboard, Students, Placement, Placement Partners, Activity, Admin
- reusable application shell with a desktop sidebar and a mobile navigation drawer
- dashboard with placeholder summary cards, Quick Access cards, and a Needs
  Attention empty state

What is deliberately not built yet:

- database, Supabase, or any API
- authentication
- placement workflow, document logic, partner matching, and check-ins
- any import of student data

## Local development

```bash
npm install
npm run dev      # start the development server on http://localhost:3000
npm run build    # production build
npm run start    # run the production build
npm run lint     # ESLint
```

## Current ticket

PLACEMENT-00 - Application Foundation and Operations Shell
([docs/tickets/PLACEMENT-00-foundation.md](docs/tickets/PLACEMENT-00-foundation.md))

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
