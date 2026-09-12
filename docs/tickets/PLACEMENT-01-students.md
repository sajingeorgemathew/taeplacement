# PLACEMENT-01 - Students, Batches and Initial Migration

## Goal

Build the first real operational module of TAE Placement:

Students.

This ticket establishes:

- minimal private staff authentication
- Supabase connection
- database foundation for staff profiles, batches, students, and student notes
- Supabase Row Level Security
- Students main page
- batch browsing
- individual student page
- Previous / Returning Students view
- Add Student
- Edit Student
- Admin batch management
- internal student notes/comments
- one-time initial Excel migration script

The existing Excel workbook is migration material only.

The finished application must not depend on Excel for normal operation.

After the initial import, all new students and batches are managed from the application.

## Product priority

This is an internal placement operations tool.

It is not SaaS.

Ease of use is more important than feature count.

The Students experience must feel:

- large
- readable
- spacious
- comfortable
- visually clear
- quick to navigate
- forgiving
- easy for non-technical staff

Do not create a dense CRM.

Do not recreate an Excel spreadsheet in the browser.

## Permanent navigation rule

Every deeper operational page must give staff an obvious way back.

Examples:

- Back to Students
- Back to August 2026
- Back to Previous / Returning Students

Do not rely only on browser history.

Use a logical parent route.

Breadcrumbs may also be used, but a visible Back action is required.

## Notes rule

Internal notes are important.

On the individual student page, Notes / Comments must be visible near the top of the page.

Use a button such as:

Comments 3

Clicking it should open a right-side drawer or panel without navigating away from the student page.

Closing the panel must return the user to the same student screen and scroll position.

Do not create a full chat application.

This is contextual internal commenting.

## Private visual references

Private design references are stored locally at:

_reference/private/placement-ui/

Use:

- student-roster-reference.png
- student-detail-reference.png

These are design references only.

Important:

- do not import these images into the application
- do not copy them into public/
- do not commit them
- do not reproduce them pixel for pixel
- do not copy fake data or fake functionality from the screenshots
- use them only to understand visual hierarchy, spacing, card structure, navigation, and interaction ideas

## What to take from the references

Students page:

- very large page heading
- large comfortable search
- blue, red/coral, and green operational summary blocks
- large batch cards
- large student rows rather than a dense table
- rounded filter controls
- obvious Open Student action
- lots of whitespace
- comfortable section spacing

Student page:

- strong student identity header
- obvious Back action
- Comments visible near the top
- placement/document status clearly visible
- large content blocks
- readable contact details
- notes accessible without leaving the screen
- obvious next actions
- connected single-page overview

## What NOT to copy from the references

Do not add:

- fake matching percentages
- automated LTC matching claims
- fake clinical workflow
- fake emergency contacts
- fake data
- excessive small chips
- tiny text
- excessive academic registry terminology
- complicated healthcare compliance wording
- unnecessary controls
- functionality that is not implemented

Simplify the references.

## Typography

The application should deliberately use larger typography than a typical SaaS dashboard.

Suggested scale:

- primary page heading: 36px to 42px
- student name: 32px to 38px
- section headings: 22px to 26px
- summary metric: 32px to 40px
- normal operational body text: 16px to 18px
- secondary text: 14px to 16px
- buttons: 15px to 17px

Avoid tiny operational text.

Do not use 11px or 12px text for important student information.

## Visual language

Main interface:

- soft off-white page background
- white primary surfaces
- generous whitespace
- rounded cards
- rounded controls
- restrained borders
- subtle shadows only where useful

Use color intentionally:

Blue:
- primary actions
- navigation
- informational state
- in-progress state

Green:
- ready
- clear
- complete
- active placement

Soft red / coral:
- needs attention
- missing
- pending
- unassigned
- overdue

Do not make every card colorful.

Use colored blocks primarily for important summaries and statuses.

## Current project

Repository:

C:\Users\USER\Desktop\taeplacement

The project already contains PLACEMENT-00.

Do not rebuild the foundation.

Do not redesign the Dashboard in this ticket.

Only make small shared-shell changes if necessary for the Students module or authentication.

## Framework

Continue using the existing:

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- src directory
- npm
- lucide-react

Install:

- @supabase/supabase-js
- @supabase/ssr
- zod
- xlsx

Install tsx as a development dependency if useful for the one-time migration script.

Do not add a large UI framework.

## Security requirement

This ticket introduces real student information.

The application must not expose student data publicly.

Implement minimal Supabase email/password authentication.

There is no public registration.

There is no student login.

There is no partner login.

This is staff-only.

Unauthenticated users attempting to access protected application routes must be redirected to:

/login

Use the appropriate current Next.js 16 server/proxy pattern.

Do not use deprecated authentication patterns if the current installed framework provides a newer mechanism.

## Login screen

Create:

/login

Keep it extremely simple.

Show:

TAE Placement

Staff Sign In

Fields:

- Email
- Password

Button:

Sign In

No sign-up link.

No social login.

No marketing content.

No forgot-password workflow in this ticket.

Use the same comfortable visual language as the rest of the app.

## Staff profiles

Create a profiles table connected to Supabase Auth.

Fields:

- id UUID, references auth.users
- full_name
- role
- is_active
- created_at
- updated_at

Initial roles:

- admin
- placement_manager
- management

Create a safe trigger or equivalent mechanism so a profile can exist for staff users.

Do not expose service-role credentials to the browser.

## RLS

Enable Row Level Security.

Anonymous users must not be able to read:

- profiles
- batches
- students
- student_notes

Authenticated active staff can read required operational records.

For this initial small-team version, active authenticated staff may update operational student information.

Batch create/edit/archive actions should be limited to admin where practical.

The database is the real security boundary.

Do not rely only on hidden buttons in the UI.

## Database - batches

Create a batches table.

Suggested fields:

- id UUID primary key
- name text
- program text
- start_date date
- schedule_label text nullable
- status text
- sort_order integer nullable
- created_at
- updated_at

Initial status values:

- active
- archived

Do not hard-code only three batches in application code.

The existing April, June, and August batches will be database records.

Future batches must be created from Admin.

## Database - students

Create a students table.

Required fields:

- id UUID primary key
- student_number text unique
- first_name text
- middle_name text nullable
- last_name text nullable
- program text
- batch_id UUID nullable
- phone text nullable
- email text nullable
- address_line text nullable
- city text nullable
- province text nullable
- postal_code text nullable
- is_returning boolean
- placement_status text
- document_status text
- is_active boolean
- migration_source text nullable
- created_at
- updated_at

Do not store date of birth from the migration workbook.

Do not store immigration status from the migration workbook.

Do not import academic columns that are not needed for placement operations.

## Placement status

For this ticket use simple operational status codes:

- needs_review
- documents_pending
- ready_for_placement
- placement_assigned
- placement_started
- placement_completed
- on_hold

Default imported students to:

needs_review

Do NOT infer historical placement status from the Excel workbook.

The user will manually correct April and June after migration.

Placement stages will become more sophisticated in a later Placement ticket.

## Document status

Use:

- not_reviewed
- pending
- ready

Default imported students to:

not_reviewed

Do not import legacy Doc Status from the workbook.

The detailed document checklist will be built in a later ticket.

## Previous / Returning Students

Do not create a fake permanent batch named Previous Students.

Use:

is_returning = true

A student may still retain their real historical batch if known.

Create a dedicated UI view for:

Previous / Returning Students

Future staff must be able to mark or unmark a student as Returning.

## Student notes

Create:

student_notes

Suggested fields:

- id UUID
- student_id UUID
- body text
- created_by UUID references auth.users
- created_at
- updated_at

All notes belong to a student.

Display the staff name from profiles.

Authenticated active staff can:

- view notes
- add notes

Keep edit/delete conservative.

Do not build direct messaging.

## Students page

Create or replace:

/students

This becomes a real database-backed page.

Page heading:

Students

Use a short human subtitle such as:

View students by batch and keep placement readiness easy to follow.

Header actions:

- Search
- Add Student

Do not overload the header.

## Students summary cards

Create three large operational summary blocks.

Use live database counts.

Suggested cards:

Total Students
Students Needing Placement
Placement Ready

Use:

- blue for Total Students
- soft red/coral for Students Needing Placement
- green for Placement Ready

"Students Needing Placement" can initially include students whose placement status is:

- needs_review
- documents_pending
- ready_for_placement

Do not pretend this is a final placement metric.

"Placement Ready" should use:

ready_for_placement

## Cohorts and Batches section

This is a primary browsing method.

Display database batches as large cards.

Initial imported batches should become:

April 27, 2026
June 1, 2026
August 17, 2026

Use cleaner UI display names if helpful:

April 2026
June 2026
August 2026

but retain actual start dates in the database.

Each batch card should show:

- batch name
- program
- number of students
- simple status counts
- obvious View Batch action

Also create a visually related:

Previous / Returning

card.

This card is not a batch database record.

It queries students where:

is_returning = true

## Student list

Below the batch cards, create:

Students

or:

Students Across Batches

Use large comfortable rows/cards.

Do not use a traditional dense HTML data table as the primary interface.

Each row should prioritize:

- student name
- student number
- batch
- city or location
- document status
- placement status
- Open Student

If city is missing, show a sensible location fallback from the stored address without pretending it is parsed correctly.

## Filters

Provide simple filters:

- Batch
- Placement Status
- Document Status
- Returning

Keep the filter area visually light.

Do not add complex filter builders.

## Search

Search should support:

- student name
- student number
- email where practical

Keep behavior simple.

## Batch page

Create:

/students/batches/[batchId]

Show:

- Back to Students
- large batch name
- program
- start date
- student count
- simple status summary
- search within batch
- comfortable student list

Do not duplicate excessive functionality.

## Previous / Returning page

Create:

/students/returning

Show:

- Back to Students
- Previous / Returning Students
- student count
- search
- student rows

## Student detail page

Create:

/students/[studentId]

The page should be a comfortable single-page overview.

Do not create many traditional tabs.

Top:

- Back to logical parent
- optional breadcrumb
- large student name
- student number
- batch
- program
- location
- placement status
- document status
- Comments button with current note count
- Edit Student action

## Student detail sections

Create clear large sections for:

Contact Information

Show:
- phone
- email
- address

Placement Readiness

For this ticket show only the current document readiness status.

Do not build the 13-document checklist yet.

Use human copy explaining that detailed placement documents will be managed in the Documents module.

Placement

Show the current placement status.

Do not assign LTCs in this ticket.

Do not fake matching.

If no placement exists, use a clear calm empty state.

Notes / Comments

Use the top Comments button to open the notes drawer.

Recent notes may also be summarized if helpful, but do not make the page repetitive.

## Add Student

Create:

/students/new

Use a large comfortable form.

Fields:

- Student Number
- First Name
- Middle Name
- Last Name
- Program
- Batch
- Phone
- Email
- Address
- City
- Province
- Postal Code
- Returning Student
- Placement Status
- Document Status

Defaults:

Program = PSW
Placement Status = needs_review
Document Status = not_reviewed
Province = Ontario
Returning Student = false
Active = true

After successful creation:

redirect to the new student's detail page.

Provide an obvious Cancel / Back action.

## Edit Student

Create:

/students/[studentId]/edit

Use the same form language as Add Student.

After saving:

return to the student page.

Do not allow editing the database UUID.

Student Number must remain unique.

## Admin batch management

Create:

/admin/batches

From the main Admin page, add a clear Batch Management entry.

Admin should be able to:

- create batch
- edit batch
- archive batch
- reactivate batch

Fields:

- Name
- Program
- Start Date
- Schedule
- Status
- Sort Order

Do not permanently delete a batch that already contains students.

Archived batches should remain available for historical records.

## Excel migration

The Excel workbook in the local repository is for ONE-TIME INITIAL MIGRATION ONLY.

Do not build a permanent Excel import screen.

Do not add Excel import to the normal navigation.

Create a local script, for example:

scripts/import-initial-students.ts

The script should accept an explicit workbook path.

Example:

npx tsx scripts/import-initial-students.ts ".\student-file.xlsx" --dry-run

and:

npx tsx scripts/import-initial-students.ts ".\student-file.xlsx" --apply

Do not automatically import every xlsx file found on disk.

## Expected workbook

The current workbook contains these sheets:

- April 27
- June 01
- August 17

The workbook uses approximately:

row 1 - batch title
row 2 - headers
row 3 onward - students

Headers include fields such as:

- Student ID
- First Name
- Middle Name
- Last Name
- Contact No.
- Email
- Address

There are also many fields that must NOT be imported.

## Migration mapping

Import ONLY:

Student ID
-> student_number

First Name
-> first_name

Middle Name
-> middle_name

Last Name / Last name
-> last_name

Contact No.
-> phone

Email
-> email

Address
-> address_line

Sheet / batch header
-> batch relationship

The script may attempt conservative parsing for:

- city
- province
- postal_code

If location parsing is uncertain:

- keep address_line intact
- leave uncertain structured fields null
- report the row for manual review

Do not silently invent a city.

## Fields to ignore during migration

Ignore:

- Sr. No.
- YYYY/MM/DD
- Status / immigration status
- Transcripts
- College Cert
- NACC
- Placement Venue
- Placement Start Date
- Placement Finish Date
- legacy Placement Status
- legacy Doc Status
- Graduated
- blank working columns

Do not import date of birth.

Do not import immigration status.

Do not import historical placement columns.

The user will manually update placement/document status in the new application.

## Batch creation during migration

The migration should safely create or reuse:

April 27, 2026
June 1, 2026
August 17, 2026

Program:

PSW

Schedule:

Morning

Use the workbook titles/sheet information to confirm this.

Do not duplicate batches on repeated runs.

## Migration safety

The import must be idempotent.

Running it twice must not duplicate students.

Use student_number as the migration uniqueness key.

Prefer upsert behavior that does not create duplicates.

The script must support:

--dry-run

Dry run must:

- inspect workbook
- show batch counts
- show students that would be processed
- show skipped rows
- show location parse warnings
- perform no database writes

--apply

Apply must:

- require Supabase service-role credentials from local environment only
- create/reuse batches
- upsert students
- show a final summary

Never put the Supabase service role key in browser code.

Never commit it.

## Imported status defaults

Every initially imported student should default to:

placement_status = needs_review

document_status = not_reviewed

is_returning = false

is_active = true

Do not hard-code exceptions for individual April or June students.

The user will manually update them after import.

## Supabase environment

Use local environment variables.

Use the appropriate public Supabase browser key for the Next.js application.

Use a service role key only for the private local migration script if needed.

Do not expose the service role key through NEXT_PUBLIC_ variables.

Ensure all environment files remain ignored by Git.

## Privacy

This project contains real student personal information.

Do not:

- seed fake copies of real student data
- put student data into source code
- put student data into README
- print full student datasets in production logs
- expose student records without authentication
- expose service keys
- commit Excel files
- commit CSV exports
- commit UI reference screenshots
- commit environment files

## Dashboard

Do not redesign the Dashboard in this ticket.

We will align Dashboard visual design later using the Students design language.

## Placement Partners

Do not build LTC accounts in this ticket.

That belongs to PLACEMENT-02.

## Documents

Do not build the detailed placement document checklist in this ticket.

That belongs to a later Documents ticket.

## Placement assignment

Do not build:

- placement assignment
- LTC matching
- Kanban
- drag and drop
- placement capacity
- active placement monitoring
- check-ins

Those come later.

## Responsive behavior

Desktop is the primary workspace.

Still ensure:

- student rows remain usable on tablet
- mobile does not horizontally overflow
- sidebar/mobile navigation from PLACEMENT-00 continues to work
- forms remain usable
- notes drawer remains usable

## Accessibility

Ensure:

- readable contrast
- visible focus states
- proper labels
- keyboard-accessible actions
- buttons are real buttons
- navigation actions are real links where appropriate

## Style

Use normal hyphens only.

Do not use em dashes.

Do not use long hyphens.

Keep UI copy short and human.

Avoid generic AI motivational text.

## Documentation

Create:

docs/product/students-and-batches.md

Document:

- purpose
- database model
- student fields
- batch behavior
- Returning Student behavior
- placement/document status behavior
- notes behavior
- initial Excel migration behavior
- fields intentionally not imported
- security/auth approach
- admin workflow
- future boundaries

Also update README with:

Current ticket:
PLACEMENT-01 - Students, Batches and Initial Migration

## Validation

Run:

npm run lint
npm run build

Run relevant TypeScript validation if available.

Run:

git status

Confirm none of these are staged:

- *.xlsx
- *.xls
- *.csv
- .env*
- _reference/private/
- real student exports

## Done criteria

- Supabase packages installed
- minimal email/password staff login exists
- protected routes require authentication
- no public student access
- RLS enabled
- profiles table exists
- batches table exists
- students table exists
- student_notes table exists
- Students page uses real database records
- large student-friendly visual design
- large blue/red/green operational blocks
- batch cards exist
- Previous / Returning view exists
- batch detail route exists
- student detail route exists
- visible logical Back action exists
- Comments button is prominent
- comments open without navigating away
- Add Student works
- Edit Student works
- Admin Batch Management works
- archived batches are retained
- one-time migration script exists
- migration script supports dry-run
- migration script supports apply
- import is idempotent
- only approved student fields are imported
- DOB is not imported
- immigration status is not imported
- old placement columns are not imported
- old document status is not imported
- imported students default to needs_review / not_reviewed
- private workbook remains ignored
- private UI references remain ignored
- no LTC functionality built
- no detailed documents functionality built
- no placement assignment built
- Dashboard not redesigned
- npm run lint passes
- npm run build passes
- no private files are staged
