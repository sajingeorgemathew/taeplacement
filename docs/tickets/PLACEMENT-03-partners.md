claud# PLACEMENT-03 - Placement Partners, Contacts and Areas

## Goal

Build the Placement Partners module for TAE Placement.

This ticket manages LTCs and other placement organizations, their contacts, internal geographic/operational areas, and partner notes.

The primary operational questions are:

- What placement partners do we have?
- Where are they grouped?
- Who are our contacts at each organization?
- How do we quickly find the right organizations for a student later?
- What did staff last note about this partner?
- Which partners still need their area/location cleaned up?

This ticket does NOT assign students to partners yet.

Student-to-partner placement assignment belongs to PLACEMENT-04.

## Product principle

This is an internal working tool.

Do not build a generic CRM.

The Placement Manager should be able to visually understand the partner network quickly.

Prioritize:

- big readable text
- comfortable cards
- simple navigation
- obvious actions
- minimal fields on the main screen
- visual area grouping
- fast search
- comments always easy to reach
- very few clicks

## Existing project

Continue from PLACEMENT-02.

Preserve:

- authentication
- students
- batches
- student notes
- student placement documents
- final placement packages
- existing RLS/security
- application shell

Do not reset Supabase.

Do not modify existing student data.

## Cleaned migration workbook

A private cleaned Zoho workbook is stored locally at:

_private/imports/TAE_Placement_Partners_Cleaned.xlsx

It contains:

- Accounts
- Contacts
- Account Contact View
- Review
- Import Mapping
- Summary

Use only:

Accounts
Contacts

for migration.

The workbook is private migration material.

Do not:

- commit it
- copy it to public/
- expose it through the application
- build a permanent Excel-import feature

## Current migration facts

The cleaned source contains approximately:

- 59 placement partner accounts
- 39 contact rows
- 38 contacts matched to an account
- 35 accounts with at least one contact
- 24 accounts with no contact
- 1 unmatched test contact
- multiple valid contacts on some accounts

One partner can have MANY contacts.

Do not collapse multiple contacts into one.

The unmatched contact named "test" should be skipped.

Do not delete apparently duplicated contact names automatically.

Different Zoho Contact IDs represent separate source records and should remain separate unless staff later choose to archive them.

## Database - placement areas

Create:

placement_areas

Suggested fields:

- id UUID primary key
- name text unique
- description text nullable
- sort_order integer
- is_active boolean
- created_at
- updated_at

Areas are ADMIN CONFIGURATION.

Do not hard-code board columns in React except the special Unassigned column.

Seed initial editable areas:

- GTA
- Peel / Mississauga
- Durham / Oshawa-Ajax
- Waterloo / Kitchener
- Hamilton / Halton
- Other

These are only starting operational clusters.

Admin must be able to rename, reorder, archive, reactivate, and add new areas later.

Do not treat these names as geographic truth.

## Unassigned area

Unassigned is a special system view.

Do NOT create a normal placement_areas row for Unassigned.

A partner is Unassigned when:

area_id IS NULL

The Area Board should always show:

Unassigned

as the first column.

Staff cannot delete or rename Unassigned.

## Database - placement partners

Create:

placement_partners

Suggested fields:

- id UUID primary key
- name text
- partner_type text nullable
- main_phone text nullable
- website text nullable
- address_line text nullable
- city text nullable
- province text nullable
- postal_code text nullable
- area_id UUID nullable references placement_areas
- relationship_status text
- legacy_zoho_account_id text unique nullable
- legacy_owner_name text nullable
- last_contacted_at timestamptz nullable
- next_follow_up_at timestamptz nullable
- is_active boolean
- created_at
- updated_at

Relationship statuses:

- active
- prospect
- inactive
- archived

Imported accounts default to:

active

Do not invent address/city/location values if source data does not contain them.

Imported partners should initially have:

area_id = null

They therefore appear in Unassigned.

The user will gradually clean their geographic information and organize them into areas.

## Database - partner contacts

Create:

placement_partner_contacts

Suggested fields:

- id UUID primary key
- partner_id UUID references placement_partners
- full_name text
- email text nullable
- phone text nullable
- job_title text nullable
- is_primary boolean
- legacy_zoho_contact_id text unique nullable
- legacy_owner_name text nullable
- is_active boolean
- created_at
- updated_at

One partner can have many contacts.

Do not enforce one-contact-per-partner.

Do not guess a primary contact during migration.

Imported contacts default:

is_primary = false
is_active = true

Staff can mark a primary contact later.

## Database - partner notes

Create:

placement_partner_notes

Suggested fields:

- id UUID primary key
- partner_id UUID references placement_partners
- body text
- created_by UUID references profiles
- created_at
- updated_at

This is simple contextual commenting.

Do not build chat.

Do not build threaded conversations.

## RLS / permissions

Enable RLS.

Active authenticated staff may read partners, areas, contacts and notes.

admin:
- create/edit/archive partners
- create/edit/archive contacts
- configure placement areas
- move partners between areas
- add notes

placement_manager:
- create/edit partners
- create/edit contacts
- move partners between areas
- update location information
- update relationship status
- update follow-up fields
- add notes

management:
- read all partner information
- add notes if appropriate
- do not configure placement areas

Use the existing role helpers where practical.

The database is the security boundary.

## Placement Partners main route

Build:

/placement-partners

This becomes a real working page.

Large heading:

Placement Partners

Short subtitle:

Organize LTCs and placement locations, contacts, and areas.

Top actions:

- Search
- Add Partner

Provide two prominent view controls:

Area Board
List View

Remember the user's chosen view only if this can be done simply without creating unnecessary state complexity.

Default to Area Board.

## Area Board

The Area Board is a horizontal visual board.

Columns:

1. Unassigned
2. active placement areas in sort order

Each column header shows:

Area Name
Partner Count

Example:

Peel / Mississauga
12 partners

Partner cards should be large enough to read comfortably.

Card should prioritize:

- partner name
- city if known
- contact count
- relationship status
- note count or comments indicator where practical

Do not overload cards with phone numbers and every field.

Click card:

opens partner detail page.

## Drag and drop

Allow staff with edit permission to move a partner card between Area columns.

Dragging:

Unassigned -> Peel / Mississauga

updates:

placement_partners.area_id

Dragging back to Unassigned:

sets area_id = null

Use a lightweight, reliable drag-and-drop implementation.

If a package is necessary, prefer a focused library such as dnd-kit rather than a large UI framework.

Do not create complicated nested drag-and-drop.

Provide an accessible fallback action on each card such as:

Move to Area

so moving partners does not depend only on drag behavior.

Mobile/tablet can rely more heavily on Move to Area.

## Important board behavior

Areas are database-driven.

Creating an area in Admin should automatically make a new board column.

Renaming an area should update the column name.

Reordering areas should update board order.

Archiving an area should remove it from normal board display.

Partners belonging to an archived area should remain valid historical records and should be surfaced safely, for example under Unassigned/Needs Area or through filtering.

Do not lose partner records when an area is archived.

## List View

Create a comfortable list view.

Do not use a tiny dense CRM table.

Each row/card should show:

- partner name
- city
- area
- contact count
- relationship status
- next follow-up if present
- Open Partner

Search should support where practical:

- partner name
- city
- phone
- contact name
- contact email

Filters:

- Area
- Relationship Status
- Has Contacts / No Contacts

Keep filters simple.

## Partner detail

Create:

/placement-partners/[partnerId]

Top:

- Back to Placement Partners
- large partner name
- city / area
- relationship status
- Comments button
- Edit Partner

Sections:

### Location

Show:

- address
- city
- province
- postal code
- area

Make missing location information obvious but calm.

Example:

Location not added yet.

### Contacts

Show all active contacts.

Each contact card/row:

- name
- primary indicator if applicable
- email
- phone
- title
- Edit

Actions:

- Add Contact
- Edit Contact
- Archive Contact
- Mark Primary

Do not permanently delete imported contacts through normal UI.

### Follow-up

Show:

- Last Contacted
- Next Follow-up

Allow simple update.

Do not build a full task/reminder system yet.

### Current Placements

Show an empty-state placeholder such as:

Student placements will appear here once placement assignment is enabled.

Do NOT fake current students.

PLACEMENT-04 will populate this.

### Comments / Notes

Use the same interaction philosophy as students.

Prominent Comments button near the top.

Open a right-side drawer/panel.

Staff can:

- read notes
- add note

Closing drawer keeps them on the same partner page.

## Add Partner

Create:

/placement-partners/new

Fields:

- Partner Name
- Partner Type
- Main Phone
- Website
- Address
- City
- Province
- Postal Code
- Placement Area
- Relationship Status
- Last Contacted
- Next Follow-up

Defaults:

Province = Ontario
Relationship Status = active
Area = Unassigned

Do not require location fields.

## Edit Partner

Create:

/placement-partners/[partnerId]/edit

Reuse the Add Partner form structure.

Provide clear:

Back / Cancel

Do not expose internal UUIDs.

Zoho ID may be shown as migration metadata only if useful, but should not clutter normal editing.

## Contact management UX

Contact creation/editing may use a drawer/modal or focused route.

Prefer fewer navigation jumps.

Required:

- Full Name

Optional:

- Email
- Phone
- Job Title
- Primary Contact

Do not require email.

Do not require phone.

## Admin - Placement Areas

Create:

/admin/placement-areas

Add a clear entry from /admin.

Admin can:

- Add Area
- Rename Area
- Edit description
- Change display order
- Archive Area
- Reactivate Area

Do not allow hard delete when partners reference an area.

Use archive instead.

The board must react automatically to Admin changes.

## Default area seeding

Seed:

GTA
Peel / Mississauga
Durham / Oshawa-Ajax
Waterloo / Kitchener
Hamilton / Halton
Other

Use sort orders with gaps, for example:

10
20
30
40
50
60

This makes later insertion easier.

## One-time Placement Partner import

Create:

scripts/import-placement-partners.ts

This is migration-only.

Do not add an Import button to the app.

Script usage:

npx tsx scripts/import-placement-partners.ts "_private/imports/TAE_Placement_Partners_Cleaned.xlsx" --dry-run

and:

npx tsx scripts/import-placement-partners.ts "_private/imports/TAE_Placement_Partners_Cleaned.xlsx" --apply

Require explicit file path.

Do not automatically scan the repository for Excel files.

## Import source - Accounts sheet

Expected useful columns include:

- Zoho Account ID
- Account Name
- Phone
- Website
- Account Owner

Map:

Zoho Account ID
-> legacy_zoho_account_id

Account Name
-> name

Phone
-> main_phone

Website
-> website

Account Owner
-> legacy_owner_name

Defaults:

relationship_status = active
area_id = null
is_active = true

Do not invent:

- address
- city
- province
- postal code
- area

## Import source - Contacts sheet

Expected useful columns:

- Zoho Contact ID
- Contact Name
- Zoho Account ID
- Account Name
- Email
- Phone
- Contact Owner
- Match Status

Import only matched contacts.

Skip unmatched/test rows.

Map:

Zoho Contact ID
-> legacy_zoho_contact_id

Zoho Account ID
-> find placement partner by legacy_zoho_account_id

Contact Name
-> full_name

Email
-> email

Phone
-> phone

Contact Owner
-> legacy_owner_name

Defaults:

is_primary = false
is_active = true

## Import safety

Import must be idempotent.

Running it twice must not duplicate:

- partners
- contacts

Use legacy Zoho IDs as migration uniqueness keys.

Dry run:

- performs no database writes
- reports account count
- reports matched contact count
- reports unmatched contacts
- reports partners without contacts
- reports multi-contact partners
- reports duplicate/missing Zoho IDs
- reports rows that will be skipped

Apply:

- requires service-role credentials locally
- upserts or safely creates partners
- links contacts to correct partner
- skips unmatched test contact
- shows final summary

Do not automatically modify manually edited partners when rerunning unless an explicit update-existing mode is supplied.

Prefer behavior similar to the student importer:

created
updated
already present
skipped

## Expected import result

The current source is expected to produce approximately:

59 partner accounts

38 matched contacts

Do not hard-fail only because counts change later.

Validate source structure instead.

## Important: contacts

Some partners legitimately have multiple contacts.

Keep all matched contact records.

Do not merge contacts simply because names match.

Do not automatically delete the two Jaswinder Kaur records under the same organization.

Staff can review/archive later.

## Geographic cleanup

Imported accounts do not contain enough reliable location data to infer areas.

Therefore:

ALL imported partners initially belong to:

Unassigned

This is intentional.

Staff will gradually:

- add address/city
- assign Area
- drag cards on Area Board

Do not make guesses based only on partner organization name.

## UI visual direction

Keep the existing functional UI architecture.

This module should nevertheless emphasize:

- large Placement Partners heading
- big Area Board columns
- readable cards
- rounded surfaces
- comfortable spacing
- visible Back actions
- Comments easy to access
- blue for primary/in-progress
- green for active/good
- soft coral/red for attention/inactive
- off-white main workspace

Do not redesign Dashboard.

Do not perform the final whole-app UI polish in this ticket.

## Students

Do not modify student placement assignment.

Do not connect students to partners yet.

Student matching belongs to PLACEMENT-04.

## Documents

Do not change PLACEMENT-02 document behavior.

## Placement Board

Do NOT build the student Placement Board in this ticket.

The Area Board is ONLY for organizing Placement Partners.

PLACEMENT-04 will have a separate student placement workflow.

## Documentation

Create:

docs/product/placement-partners.md

Document:

- purpose
- data model
- areas
- Unassigned behavior
- Area Board
- List View
- partner profile
- contacts
- notes
- follow-ups
- one-time Zoho migration
- fields imported
- fields intentionally not inferred
- security
- future student assignment boundary

Update README current ticket:

PLACEMENT-03 - Placement Partners, Contacts and Areas

## Migration

Create a NEW Supabase migration after PLACEMENT-02 migrations.

Expected next migration:

supabase/migrations/0004_placement_partners.sql

Do not edit already-applied:

0001
0002
0003

The new migration must be additive.

## Validation

Run:

npm run lint
npm run build
git status

Validate SQL carefully.

Confirm no:

- private workbook
- .env
- CSV
- reference screenshots
- student documents

are staged.

## PLACEMENT-03 refinements before merge

Three refinements added to this ticket after the first pass, before the branch
merges. This is still PLACEMENT-03. No new product ticket was opened.

`supabase/migrations/0004_placement_partners.sql` had already been applied to the
development database, so it was **not** rewritten. Everything below arrives
through one new additive migration:

`supabase/migrations/0005_partner_board_refinements.sql`

### 1. Board horizontal drag auto-scroll

The Area Board scrolls horizontally, and an area several columns away used to be
unreachable in one drag: the board stayed still while the card was held over its
edge.

Dragging a partner card near either edge of the board viewport now scrolls the
**board container** horizontally, not the page. The speed ramps from slow to fast
across a 120px edge zone, so resting just inside it creeps and pushing to the
edge crosses several area columns while the same drag continues. The loop runs
only while a drag is in progress and stops on drop or drag end.

Existing drag and drop behaviour is unchanged, and the **Move to Area** select on
every card is untouched. That fallback remains the accessible path, the touch
path, and the tablet path, and none of it depends on drag behaviour.

### 2. Area colours

`placement_areas.color_key`, `not null default 'slate'`, with a database CHECK
constraint over a controlled palette:

`slate`, `blue`, `green`, `amber`, `purple`, `coral`, `teal`, `indigo`

This is deliberately **not** an arbitrary hex colour picker. A fixed palette is
what keeps the board consistent and readable.

0005 gives the areas seeded by 0004 a sensible starting colour, matched on name
and only while the area is still on the default `slate`, so an admin choice is
never overwritten and a rerun changes nothing:

| Area | Colour |
| --- | --- |
| GTA | blue |
| Peel / Mississauga | coral |
| Durham / Oshawa-Ajax | green |
| Waterloo / Kitchener | purple |
| Hamilton / Halton | amber |
| Other | teal |

No area name or id changed.

`/admin/placement-areas` gains an **Area Colour** picker on both Add Area and
Rename / Edit Area, shown as labelled swatches from the controlled palette, with
a swatch and the colour name beside each area in the list. New areas default to
a sensible palette value. Renaming, reordering, archiving, and reactivating
behave exactly as before.

On the board, colour comes from `placement_areas.color_key` and never from an
array position, so a newly created area renders in the colour the admin picked
and reordering never repaints anything. Each area gets a soft tinted column
surface and a stronger header accent; partner cards stay white with dark text.
Unassigned is not a `placement_areas` row and keeps a neutral slate treatment.

### 3. Placement Availability

Four columns on `placement_partners`, answering operational questions about the
**organization**:

| Column | Holds |
| --- | --- |
| `availability_status` | `unknown` / `available_now` / `upcoming` / `not_available`, CHECK constrained, default `unknown` |
| `next_intake_date` | `date`, nullable. The next intake or cohort |
| `availability_note` | text, nullable. One short operational line |
| `availability_checked_at` | `timestamptz`, nullable. When staff last verified this |

Labels: Unknown, Available Now, Upcoming Intake, Not Available.

`next_intake_date` is a real `date`, not a timestamptz, because an intake is a
day and must not shift across a timezone. Neither the intake date nor the note is
ever required.

This ticket deliberately does **not** add placement capacity or available slot
counts.

**Partner detail** `/placement-partners/[partnerId]` gains a Placement
Availability section showing Availability Status, Next Intake Date, Last Checked,
and Availability Note. Staff with partner edit permission update it there.
`availability_checked_at = now()` is set through an explicit "I checked this with
the partner" box, so fixing a typo never makes a stale answer look freshly
confirmed.

**Add / Edit Partner** carries the same availability fields. A newly created
partner defaults to Unknown and no intake date.

**Area Board cards** show a compact availability chip: "Available Now",
"Upcoming Oct 20", "Not Available", "Unknown". Green, amber, soft coral, and
neutral grey respectively. Card priority is partner name, city, availability,
contacts, then relationship status.

**List View** gains an Availability filter (All / Available Now / Upcoming Intake
/ Not Available / Unknown), carried in the URL like the other filters, and each
row shows the compact availability chip. Search behaviour is unchanged.

### Archived areas

Unchanged in data terms: archiving an area never nulls `area_id`, and the
historical relationship stays intact. Partners left behind by an archived area
keep showing under Unassigned on the board with a "Its area was archived" note,
and the Unassigned filter and the Needs an Area count now include them too, so
archiving an area cannot hide a partner from the one view that exists to find
them.

### Out of scope, as before

Student assignment, student matching, placement capacity, slot reservations,
check-ins, notifications, automated reminders, distance matching, and a full
follow-up task system all remain later tickets. Partner availability is
partner-level operational data that PLACEMENT-04 student matching will read.

## Done criteria

- placement_areas table exists
- placement_partners table exists
- placement_partner_contacts table exists
- placement_partner_notes table exists
- RLS enabled
- seeded editable placement areas exist
- Unassigned is represented by null area_id
- Placement Partners page works
- Area Board works
- board columns come from database
- Unassigned appears first
- drag partner between areas works
- Move to Area fallback works
- List View works
- search works
- simple filters work
- partner detail page works
- Back navigation exists
- Comments drawer works
- contacts support many-per-partner
- add/edit/archive contact works
- primary contact can be selected
- partner follow-up fields work
- Add Partner works
- Edit Partner works
- Admin Placement Areas works
- areas can be added
- areas can be renamed
- areas can be reordered
- areas can be archived/reactivated
- one-time partner import script exists
- dry-run works
- apply mode works
- import is idempotent
- 59-ish accounts can import
- 38-ish matched contacts can import
- unmatched test contact is skipped
- imported partners initially remain Unassigned
- no geographic information is invented
- existing students remain untouched
- existing document workflow remains untouched
- no student placement assignment is built
- npm run lint passes
- npm run build passes
- no private files are staged

### Refinement done criteria

- 0004 was not rewritten
- 0005_partner_board_refinements.sql exists and is additive
- placement_areas.color_key exists with a CHECK constrained palette
- seeded areas received default colours without renaming or re-iding them
- Admin can choose an Area Colour from the controlled palette
- a swatch is shown in Admin
- board column colour comes from color_key, not array position
- a newly created area renders in its chosen colour
- Unassigned stays neutral slate
- dragging near a board edge scrolls the board horizontally
- the page itself does not scroll while dragging
- Move to Area still works
- availability_status, next_intake_date, availability_note, and
  availability_checked_at exist on placement_partners
- a new partner defaults to Unknown availability
- next intake date is not required
- availability note is not required
- Placement Availability shows on the partner detail page
- staff with edit permission can update it
- Last Checked can be set to now
- board cards show a compact availability chip
- List View has an Availability filter
- partners attached to an archived area still appear
- database types include color_key and the four availability columns
- npm run lint passes
- npm run build passes
