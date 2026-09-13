# PLACEMENT-05A - Batch Placement Planning and City-to-Area Mapping

## Goal

Build a planning workspace for upcoming student batches.

The placement manager should be able to answer:

- How many students are in this batch?
- Which cities are those students coming from?
- Which operational Placement Areas do those cities belong to?
- How many students in each Area are ready, pending documents, assigned, or already on placement?
- Which Placement Partners exist in each Area?
- Which of those Partners are Available Now, Upcoming, Unknown, or Not Available?
- Which geographic areas need outreach first?

This is a PLANNING view.

It does not assign students automatically.

It does not replace the existing Placement Board.

## Existing system

Preserve all existing behavior from:

- PLACEMENT-01 Students / Batches
- PLACEMENT-02 Documents
- PLACEMENT-03 Partners / Areas / Availability
- PLACEMENT-04 Student Placement Assignment
- UI-01 TAE branding / Dashboard

Do not reset Supabase.

Do not modify historical placements.

Do not re-import students or partners.

Latest migration is 0006_student_placements.sql.

Create a new additive migration:

supabase/migrations/0007_batch_placement_planning.sql

Do not edit migrations 0001 through 0006.

## Product principle

This is an internal planning tool for a small placement team.

Keep it visual and understandable.

The user should not have to interpret a complex analytics dashboard.

The basic planning relationship is:

Student
-> Batch
-> Student City
-> Admin-defined Placement Area
-> Placement Partners in that Area

Student city remains the factual address field.

Placement Area is an operational grouping.

Never rewrite a student's city just because an Area mapping changes.

## Database - city to area mapping

Create:

placement_area_cities

Suggested fields:

- id uuid primary key
- area_id uuid not null references placement_areas
- city_name text not null
- normalized_city_name text not null
- created_at timestamptz
- updated_at timestamptz

normalized_city_name must be unique.

Purpose:

Map a normalized student city to one operational Placement Area.

Example:

Mississauga -> Peel / Mississauga
Brampton -> Peel / Mississauga
Oakville -> Hamilton / Halton

These are examples only.

DO NOT hard-code these mappings in React.

DO NOT infer Area using geography, postal code, Maps, or AI.

If a student's city has no mapping:

Unmapped

is the correct result.

## City normalization

Use a small deterministic normalization function in application/server code.

At minimum:

- trim leading/trailing whitespace
- collapse repeated internal whitespace
- lowercase for comparison

For example:

" Mississauga "
"MISSISSAUGA"
"mississauga"

should all resolve to the same normalized key:

mississauga

Preserve a readable city label for display.

Do not aggressively rewrite city names.

Do not geocode.

## RLS

Enable RLS on placement_area_cities.

All active staff may read mappings.

Only admin may:

- add mapping
- change mapping
- remove/reassign mapping

placement_manager and management:

read only

Use existing security helpers.

No anon access.

## Admin page

Create:

/admin/city-area-mapping

Add a clear entry from /admin.

The page should primarily be driven by the actual distinct city values currently present in active student records.

Do NOT require the user to build a master list of Canadian cities.

Show something like:

Student City       Students     Placement Area

Mississauga        11           Peel / Mississauga
Brampton            8           Peel / Mississauga
Toronto             6           GTA
Scarborough         2           Unmapped

For every distinct student city:

- readable city name
- number of active students using that city
- current mapped Area
- Area dropdown for Admin

Use the existing active Placement Areas.

Allow:

- assign city to Area
- change city to another Area
- return city to Unmapped

Unmapped means no placement_area_cities row for that normalized city.

Do not create a fake "Unmapped" placement_areas row.

## Important mapping behavior

Areas remain managed through:

/admin/placement-areas

City Mapping references those Area records.

If an Area is renamed:

the City Mapping should automatically display the new Area name.

If an Area is archived:

do not delete the mapping history automatically.

Admin should be able to identify mappings pointing to an archived Area and reassign them.

In normal Batch Planning, a city whose mapping points to an inactive/archived Area should be treated as:

Needs Area Review

rather than silently disappearing.

Do not lose data.

## Placement navigation

The existing Placement module currently has:

Board
List

Add:

Batch Planning

The primary Placement navigation becomes:

Board
Batch Planning
List

Do not remove or redesign the existing Board/List functionality.

Batch Planning is a separate view of the same operational system.

## Batch Planning view

Add a Batch Planning view under /placement.

A dedicated route such as:

/placement/planning

is acceptable if it keeps the code cleaner.

The visual navigation should still make it feel like one Placement module.

## Batch selector

At the top:

Batch Placement Planning

Batch selector:

- active batches
- archived batches may be selectable if existing architecture supports it cleanly

Default:

choose the most recent active batch where practical.

Do not hard-code April / June / August.

Batches are database records.

## Batch summary

Once a batch is selected, show a concise summary.

Suggested:

Total Students
Documents Pending
Ready for Placement
Awaiting Start
On Placement
On Hold
Unmapped City

Use EXISTING data:

students.placement_status
students.document_status
student_placements where needed

Do not create duplicate summary fields.

Do not count inactive students.

Definitions:

Documents Pending:
placement_status = documents_pending

Ready for Placement:
placement_status = ready_for_placement

Awaiting Start:
placement_status = placement_assigned
or active student_placements status = assigned, using the most reliable existing source

On Placement:
placement_status = placement_started
or active student_placements status = started

On Hold:
placement_status = on_hold

Unmapped City:
active student has a non-empty city whose normalized city has no active usable Area mapping

Students with no city should be surfaced separately as:

City Missing

Do not silently combine missing city with an unmapped known city.

## Geographic Area cards

Below the batch summary, show one card per relevant Placement Area.

Use the existing Placement Area:

- name
- color_key

Do not assign colors by array position.

Each Area card should show:

Area Name
Student Count

City breakdown, for example:

Mississauga 4
Brampton 3

Readiness / status breakdown:

Ready 5
Docs Pending 2
Awaiting Start 0
On Placement 0
On Hold 0

Partner overview:

Total Active Partners
Available Now
Upcoming Intake
Unknown
Not Available

Do not overcrowd the card.

Prioritize:

student count
ready count
partner availability

Provide:

Open Area

## Unmapped / Missing cards

Always surface planning problems.

If present, show a neutral/attention card for:

Unmapped Cities

Example:

Scarborough 2
Barrie 1

with:

Manage City Mapping

link to:

/admin/city-area-mapping

Also show:

City Missing

if students in the selected batch have blank/null city.

Provide a way to open the affected student list.

Do not guess their geography.

## Area drill-down

Clicking an Area should open a planning detail view.

Can be:

/placement/planning?batch=<batchId>&area=<areaId>

or a dedicated route.

Show two clear sections.

### Students in this Area

Only students from the selected Batch whose normalized city maps to this Area.

Show comfortable rows/cards:

- Student Name
- Student Number
- City
- Document readiness X/Y
- Placement Status
- Current Partner where one exists
- Open Student

Useful filters:

- All
- Ready
- Documents Pending
- Awaiting Start
- On Placement
- On Hold

Do not create another student placement state.

### Placement Partners in this Area

Show active/non-archived partners assigned to this Placement Area.

Partner card should show:

- Partner Name
- City
- Availability
- Next Intake Date when Upcoming
- Next Follow-up when present
- Primary Contact where available
- Contact count
- Open Partner

Availability groups/filter:

All
Available Now
Upcoming Intake
Unknown
Not Available

Visually prioritize:

Available Now

but do not hide Unknown or Upcoming.

Unknown partners are important because they may need outreach.

## Planning insight

The page should make a basic imbalance visible.

For example:

5 Ready Students
2 Available Partners

Do NOT turn this into capacity math.

Do NOT claim:

"3 students cannot be placed"

because one partner may accept multiple students and capacity is not tracked.

Use neutral copy such as:

"5 students are ready in this Area. 2 partners are currently marked Available Now."

This is an operational observation, not an automated recommendation.

## Partner follow-up

Reuse existing:

next_follow_up_at
availability_status
next_intake_date
availability_checked_at

Do not introduce another outreach/follow-up table.

If Partner Follow-up is due, show that indicator in Area detail.

Do not build notifications.

## Student city editing

Do not edit a student's city from the mapping screen.

If a city is incorrect on an individual student:

staff must correct the Student record.

The Mapping screen only maps normalized city labels to Placement Areas.

## Existing partner area model

Partner Area and Student City Mapping intentionally meet at:

placement_areas.id

That is the bridge.

Do not create a second region system for students.

Do not add student.area_id.

Student Area should always be derived:

student.city
-> normalized city
-> placement_area_cities
-> placement_areas

This prevents duplicated/stale Area information on student records.

## No automatic matching

Do NOT automatically recommend or assign a specific Partner to a Student.

Batch Planning only narrows the operational view.

Actual Student -> Partner assignment remains the PLACEMENT-04 Find Placement flow.

A manager may open the Student or Find Placement from the planning view where appropriate, but the existing assignment logic must remain the only assignment pathway.

## UI direction

Use the existing TAE branded shell.

Use existing Area colors.

Large headings.
Comfortable cards.
Clear batch selector.
No dense spreadsheet.
No charts required.
No maps.
No unnecessary analytics visualizations.

The planning view should feel like:

"Where do I need placement coverage for this batch?"

## Boundaries

Do NOT build:

- Google Maps
- distance calculations
- postal-code matching
- automatic geographic inference
- AI matching
- partner capacity
- placement slots
- email outreach
- SMS
- automated reminders
- outreach campaigns
- check-ins
- attendance
- detailed hours
- evaluations
- new placement lifecycle statuses
- automatic placement assignment

Those are later tickets.

## Migration

Create:

supabase/migrations/0007_batch_placement_planning.sql

Additive only.

Do not modify earlier migrations.

## Documentation

Create:

docs/product/batch-placement-planning.md

Document:

- purpose
- city normalization
- city-to-Area mapping
- Unmapped behavior
- Missing City behavior
- Batch Planning view
- Area cards
- Area drill-down
- student status counts
- partner availability counts
- no-capacity caveat
- assignment boundary

Create/update:

docs/tickets/PLACEMENT-05A-batch-planning.md

Update README current work.

## Validation

Run:

npm run lint
npm run build
git status

Verify:

- existing Placement Board still works
- existing Placement List still works
- Partner Area Board still works
- no placement assignment behavior changed
- no student city values changed
- no partner Areas changed
- city mappings are Admin-controlled
- unmapped cities stay visible
- missing city stays visible
- archived Area mapping cannot silently hide students
- no private files are staged

## Done criteria

- placement_area_cities table exists
- RLS enabled
- Admin City-to-Area Mapping page works
- actual student cities are listed
- duplicate city capitalization/spacing is normalized
- each normalized city maps to at most one Area
- mappings can be changed
- mappings can be removed back to Unmapped
- Placement navigation includes Batch Planning
- Batch selector works
- batch summary uses real counts
- geographic Area cards use existing Area colors
- Area cards show student counts
- Area cards show useful readiness/status breakdown
- Area cards show Partner availability overview
- Unmapped cities are visible
- Missing City is visible
- Area drill-down works
- students in Area are shown
- partners in Area are shown
- partner availability and next intake are visible
- follow-up-due indicator is visible where applicable
- no automatic student/partner assignment
- no student.area_id duplication
- no geographic guessing
- existing flows remain intact
- lint passes
- build passes
- no private files staged

## Status: Done

Implemented on `feat/placement-05a-batch-planning`.

Documented in
[docs/product/batch-placement-planning.md](../product/batch-placement-planning.md).

### Migration

`supabase/migrations/0007_batch_placement_planning.sql`, purely additive. 0001
through 0006 are untouched. Nothing is reset, no student and no partner is
re-imported, no historical placement is modified, and no student city value is
changed.

It creates one table, `placement_area_cities`, plus
`prevent_delete_area_with_cities()` and its trigger. `area_id` references
`placement_areas` with `on delete restrict`, so an area cities point at cannot
be hard deleted and no mapping relationship is lost; the trigger turns that
refusal into a sentence that says to archive the area instead. The table holds
only the current mapping for each city, not past versions of it, so that row is
the only copy.

`normalized_city_name` is unique, so one city belongs to at most one Area, and a
CHECK constraint ties it to this row's own `city_name`: the key must be that
label with whitespace collapsed, then trimmed, then lowercased, and it must be
non-empty. A hand written INSERT therefore cannot pair a readable label with a
key that does not belong to it, and cannot store a whitespace-only label.

The migration seeds **nothing**. Seeding "Mississauga -> Peel" would be the
migration guessing Ontario geography, and the repository holds no user approved
mapping source. Every mapping is an admin decision.

### RLS

`is_active_staff()` reads, `is_admin()` writes, both existing helpers. Anon is
revoked. `placement_manager` and `management` are read only.

`DELETE` is granted here, unlike areas and partners, because returning a city to
Unmapped means removing its row. There is no fake `Unmapped` area and no
tombstone row.

### Unmapped is the absence of a row

Deliberately, in three places: no placeholder `placement_areas` entry, no
mapping row pointing at nothing, and no `students.area_id`. A student's Area is
always derived at read time.

### Archived areas

Not nulled, not deleted, not silently valid. In Batch Planning those students
group under Unmapped City with the row reading `Needs Area Review - mapped to
<Area>, which is archived`. In Admin the mapping keeps its row, sorts to the top
with a Needs Area Review chip, and names the archived area so it can be
reassigned. Archived areas do not open as a drill-down and are not offered in
the Area select.

### Application

| Route | What it is |
| --- | --- |
| `/admin/city-area-mapping` | the Admin mapping screen, linked from `/admin` |
| `/placement/planning` | Batch Planning: summary, Area cards, exception cards |
| `/placement/planning?area=<id>` | Area drill-down: students and partners |
| `/placement/planning?exception=unmapped` | the students behind Unmapped City |
| `/placement/planning?exception=missing` | the students behind City Missing |

Placement navigation is now **Board / Batch Planning / List**, rendered by one
shared `PlacementViewSwitch` on both routes. Board and List are unchanged; the
selected batch carries between them and planning.

### Reuse, not reimplementation

Document readiness still comes from the `student_document_readiness` view
through `listStudentReadiness()`. Students come from `listPlacementStudents()`,
partners from `listPartners()`, areas from `listPlacementAreas()`, batches from
`listBatches()`, primary contacts from `getPrimaryContacts()`. The Area
drill-down renders students with the existing `PlacementList` row. The only new
reads are the mapping table and the distinct roster cities.

`PlacementList` gained one optional `renderAction` prop, rendered outside the
row link. Callers that pass nothing produce byte-identical markup.

### No capacity math

The Area card observation reads "5 students are ready in this Area. 2 partners
are currently marked Available Now." and never subtracts one from the other,
because partner capacity is not tracked anywhere. No shortage is calculated and
no recommendation is made.

### Assignment boundary

No new assignment pathway. A Ready student with no live placement gets a link
into the existing PLACEMENT-04 Find Placement flow, shown only to staff who can
manage placements. No assignment logic is duplicated.

### Not built, as specified

Maps, geocoding, postal code distance, automatic geographic inference, AI
matching, automatic assignment, partner capacity, slots, outreach automation,
email, SMS, reminders, check-ins, attendance, detailed hours, evaluations, and
any new placement lifecycle status. Batch Planning adds **no** new status: every
count is an existing `students.placement_status` value.

No charts and no maps were added. The page is cards, figures, and plain filter
chips.

### Validation

- `npm run lint` passes
- `npm run build` passes
- `git status` shows only the intended source, migration, and documentation
  changes. No `.env` file, private import, Excel, CSV, reference screenshot, or
  placement package file is staged.
