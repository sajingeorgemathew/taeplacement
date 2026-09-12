# PLACEMENT-00 - Application Foundation and Operations Shell

## Goal

Create the technical and visual foundation for the Toronto Academy of Education internal placement management application.

This ticket establishes:

- Next.js application foundation
- TypeScript
- Tailwind CSS
- App Router
- src directory
- ESLint
- reusable application shell
- simple internal navigation
- responsive layout
- visual design rules
- placeholder operational dashboard
- project documentation

This is an internal operations application for a very small staff team.

The primary product goal is ease of use.

Do not design this like a SaaS dashboard.

## Product principle

The application must feel extremely simple to operate.

A staff member should be able to understand what to click without training.

Prioritize:

- large readable text
- large clickable areas
- obvious navigation
- clear visual hierarchy
- very few clicks
- simple routes
- visual statuses
- spacious layouts
- clear relationships between Students, Placement Partners, Placements, Documents, and Check-ins
- desktop-first usability while remaining responsive
- minimal data entry
- minimal technical language in the UI

Avoid:

- dense CRM layouts
- tiny text
- excessive tables
- excessive dropdowns
- unnecessary charts
- nested settings everywhere
- overly compact interfaces
- SaaS-style billing or workspace concepts
- fake complexity
- excessive animations

## Important project context

The final application will eventually manage:

1. Students and batches
2. Placement document readiness
3. Placement Partners / LTC accounts
4. Placement assignments
5. Placement workflow
6. Active placement monitoring
7. Check-ins
8. Internal notes and requests
9. Configurable placement areas
10. Small-team administration

Do not implement those business features in this ticket.

This ticket only creates the application foundation and visual shell.

## Existing repository

Project location:

C:\Users\USER\Desktop\taeplacement

The Git repository is already initialized.

Do not remove or recreate the .git directory.

Preserve the existing README.md and .gitignore where possible.

There is a private Excel workbook in the local project directory.

IMPORTANT:

- Do not modify the Excel workbook.
- Do not import the workbook in this ticket.
- Do not commit the workbook.
- Do not rename the workbook.
- Do not move the workbook.
- Keep *.xlsx, *.xls, and *.csv ignored by Git.

## Framework setup

Bootstrap the project using the current stable create-next-app setup.

Use:

- Next.js
- App Router
- TypeScript
- Tailwind CSS
- ESLint
- src directory
- npm
- import alias @/*

Use the current versions produced by create-next-app.

Do not manually pin an older Next.js version.

Install:

- lucide-react

Do not add a large UI framework.

Do not add shadcn/ui in this ticket.

Do not add Material UI.

Do not add Bootstrap.

Do not add a state-management library.

## Existing-directory bootstrap safety

The repository already contains Git files, README.md, .gitignore, docs, and a private Excel workbook.

Do not delete existing repository content to make create-next-app work.

If create-next-app cannot safely scaffold directly into the existing directory because files already exist:

1. Create the Next.js scaffold in a temporary directory outside the repository.
2. Copy only the required application files into the taeplacement repository.
3. Do not copy a temporary .git directory.
4. Preserve the existing repository .git directory.
5. Preserve docs/tickets.
6. Preserve the private Excel workbook.
7. Merge .gitignore rules safely.
8. Remove the temporary scaffold directory when finished.

Do not initialize another Git repository inside taeplacement.

## Application name

Use:

TAE Placement

Full descriptive name:

Toronto Academy of Education Placement Management

Do not use marketing language.

Do not make the interface look like a public website.

## Root behavior

Visiting:

/

should redirect to:

/dashboard

There is no public landing page required.

## Application shell

Create a reusable application shell.

Desktop layout:

- left sidebar
- main content area
- top page header

The sidebar should remain visually simple.

Do not create a narrow icon-only sidebar.

Staff should immediately understand the navigation labels.

## Primary navigation

Create these top-level navigation items:

Dashboard
Students
Placement
Placement Partners
Activity
Admin

Use suitable Lucide icons.

Recommended concepts:

Dashboard - LayoutDashboard
Students - Users
Placement - BriefcaseBusiness or similar
Placement Partners - Building2
Activity - Activity
Admin - Settings

Exact icon choice may vary if a more appropriate Lucide icon exists.

## Routes

Create these routes:

/dashboard
/students
/placement
/placement-partners
/activity
/admin

Each route should load successfully.

Only Dashboard needs meaningful placeholder content in this ticket.

Other routes should use a consistent simple placeholder page showing:

- page title
- short description
- clear note that the module will be built in a later ticket

Do not build fake functionality.

## Mobile behavior

On smaller screens:

- sidebar can become a slide-out navigation drawer
- provide an obvious menu button
- maintain large touch targets
- content must not overflow horizontally

Do not prioritize mobile over desktop, but the layout must remain usable.

## Visual direction

Overall feeling:

- calm
- clean
- professional
- operational
- approachable
- spacious
- easy to scan

Use a light interface.

Suggested foundation:

- white or near-white main background
- soft neutral page background
- dark readable text
- one restrained blue primary accent
- soft borders
- subtle shadows only where useful
- rounded corners, but not excessively rounded

Do not use gradients.

Do not use glassmorphism.

Do not use flashy visual effects.

Do not create a dark theme in this ticket.

## Typography

Readability is a major requirement.

Use a modern system or Next.js-supported font.

Keep normal body text comfortably readable.

Do not use tiny 12px text for operational information.

Prefer approximately:

- page title: 28px to 34px
- section title: 20px to 24px
- important card numbers: 30px+
- body text: 15px to 17px
- buttons: 15px to 16px

These are guidelines, not rigid pixel requirements.

## Dashboard

Create an initial operational dashboard.

Title:

Placement Dashboard

Subtitle:

A simple view of student placement operations and what needs attention.

Create three large summary cards:

1. Students Needing Placement
2. Active Placements
3. Follow-ups Due

Since no database exists yet, use neutral placeholder values such as:

-

Do not invent real student numbers.

Do not use fake operational statistics.

## Dashboard primary actions

Below the summary cards create a section:

Quick Access

Use three large clickable cards:

Students

Description:
View students, batches, and placement readiness.

Placement Partners

Description:
View LTCs and other placement partner accounts.

Placement Board

Description:
Manage students through the placement process.

Each should route to the appropriate placeholder page.

The whole card should be easy to click.

## Needs Attention area

Create a simple empty-state section:

Needs Attention

Text:

Important placement tasks and follow-ups will appear here.

Do not create fake alerts.

Do not create fake student names.

## Header

Create a clean page header.

Include:

- current page title
- simple TAE identifier on the right

Do not build user accounts or authentication yet.

A static TAE badge or initials are sufficient.

## Components

Use reusable components where appropriate.

Suggested structure:

src/components/layout/AppShell.tsx
src/components/layout/AppSidebar.tsx
src/components/layout/AppHeader.tsx
src/components/ui/PageHeader.tsx
src/components/ui/StatCard.tsx
src/components/ui/QuickAccessCard.tsx

Exact filenames may change if there is a good architectural reason.

Do not over-componentize.

## Navigation configuration

Prefer storing primary navigation information in one reusable location such as:

src/lib/navigation.ts

Avoid duplicating navigation definitions between desktop and mobile navigation.

## Project rules document

Create:

docs/product/PLACEMENT-PRODUCT-RULES.md

Document these permanent principles:

1. Internal tool, not SaaS
2. Ease of use before feature count
3. Large readable interface
4. Minimal clicks
5. Visual status before dense text
6. Student and Placement Partner are primary records
7. Placement connects the student and partner
8. Configuration belongs in Admin
9. Do not hard-code business categories that should be configurable
10. Avoid duplicate work for staff
11. Never expose private student information publicly
12. Private local source files must not be committed
13. Build one operational workflow at a time
14. Do not add features without an identified operational purpose

Also record the intended high-level workflow:

Student
-> Placement Readiness
-> Partner Matching
-> Placement Assignment
-> Active Placement
-> Check-ins
-> Completion

## README

Update the main README.md.

Include:

- project name
- purpose
- current status
- technology stack
- local development commands
- current ticket
- privacy warning

Privacy warning should clearly state:

Student spreadsheets, exports, placement records, credentials, environment variables, and other private operational data must never be committed to the public repository.

## Git ignore protection

Confirm .gitignore includes protection for:

*.xlsx
*.xls
*.csv
.env
.env.local
.env.*.local
node_modules/
.next/
.vercel/
_private/
_reference/private/

Do not remove useful create-next-app ignore entries.

Merge the rules instead.

## Privacy

This application will eventually contain student information.

For this foundation ticket:

- use no real student data
- use no real health data
- use no real document information
- use no real LTC contacts
- use no real addresses
- do not read the private Excel workbook
- do not expose private files through public/
- do not create sample personal records

## Supabase

Do not configure Supabase in this ticket.

Do not create:

- Supabase project configuration
- database schema
- migrations
- tables
- authentication
- storage buckets
- environment variables

Supabase will be handled in a separate ticket.

## Data

No database.

No API.

No localStorage.

No hard-coded real student records.

No Excel import.

No Zoho import.

Use only static UI placeholders where necessary.

## Authentication

Do not implement authentication in this ticket.

Authentication will be handled later.

## Placement logic

Do not implement:

- placement stages
- drag and drop
- student assignment
- LTC matching
- document checklist logic
- check-ins
- notifications
- internal messaging
- tasks
- geographic matching

Those belong to later tickets.

## Accessibility and interaction

Ensure:

- buttons and links have clear labels
- navigation is keyboard accessible
- focus states are visible
- text contrast is readable
- mobile menu can be opened and closed clearly
- clickable cards are actual links where appropriate

## Style rules

Use normal hyphens only.

Do not use em dashes.

Do not use long hyphens.

Use straight quotes where practical.

Keep UI copy concise and human.

Avoid generic AI-style motivational copy.

## Validation

Run:

npm run lint
npm run build

Also run:

git status

Confirm no Excel, CSV, environment file, or private data is staged.

## Done criteria

- Next.js application successfully created
- TypeScript configured
- Tailwind configured
- ESLint configured
- App Router used
- src directory used
- lucide-react installed
- root redirects to /dashboard
- reusable application shell exists
- desktop sidebar works
- responsive mobile navigation works
- Dashboard route works
- Students route works
- Placement route works
- Placement Partners route works
- Activity route works
- Admin route works
- Dashboard has three large placeholder summary cards
- Dashboard has three Quick Access cards
- Dashboard has Needs Attention empty state
- no fake student records
- no fake placement statistics
- no Supabase configuration
- no authentication
- no database
- no Excel import
- private spreadsheet remains untouched
- spreadsheet is ignored by Git
- product rules document created
- README updated
- npm run lint passes
- npm run build passes
- git status confirms private files are not staged
