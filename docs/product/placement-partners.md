# Placement Partners, Contacts and Areas

The placement partner network. Built in PLACEMENT-03 on top of the students,
batches, notes, and document readiness from PLACEMENT-01 and PLACEMENT-02.

## Purpose

Staff need to answer six questions about the partner network, quickly:

- What placement partners do we have?
- Where are they grouped?
- Who are our contacts at each organization?
- Which partners still need their area or location cleaned up?
- What did staff last note about this partner?
- When should we follow up?

That is the whole scope. This is **not** a CRM. There are no deals, no pipelines,
no activity feeds, and no email integration.

Students are **not** assigned to partners in this module. Student-to-partner
placement assignment, matching, capacity, check-ins, and distance are
PLACEMENT-04 and later. The partner page shows an empty **Current Placements**
placeholder and nothing more.

## Data model

Created by `supabase/migrations/0004_placement_partners.sql`, which is purely
additive and touches nothing from 0001, 0002, or 0003.
`supabase/migrations/0005_partner_board_refinements.sql` adds Area colours and
Partner Placement Availability on top of it, and is additive in the same way: it
rewrites nothing 0004 created.

| Table | Holds |
| --- | --- |
| `placement_areas` | Configurable operational areas. Admin only. |
| `placement_partners` | One row per placement organization. |
| `placement_partner_contacts` | Many contacts per partner. |
| `placement_partner_notes` | Contextual internal comments on a partner. |

### placement_areas

`id`, `name` (unique, case insensitive), `description`, `sort_order`,
`color_key`, `is_active`, timestamps.

Areas are **admin configuration**, not code. The Area Board reads its columns
from this table, so adding, renaming, reordering, or archiving an area changes
the board with no code change.

Seeded starting clusters, with gaps of ten so a new area can be slotted between
two existing ones:

| Area | sort_order |
| --- | --- |
| GTA | 10 |
| Peel / Mississauga | 20 |
| Durham / Oshawa-Ajax | 30 |
| Waterloo / Kitchener | 40 |
| Hamilton / Halton | 50 |
| Other | 60 |

These are operational clusters, **not geographic truth**. Admin renames and
reorganizes them as the real network becomes clearer.

`color_key` is the area's colour on the Area Board, CHECK constrained to a
controlled palette: `slate`, `blue`, `green`, `amber`, `purple`, `coral`, `teal`,
`indigo`. It is deliberately **not** a hex colour picker. A fixed palette is what
keeps the board consistent and readable, and every key is already known to work
behind white cards and dark text.

0005 gives the seeded areas a starting colour, matched on name and only while the
area is still on the default `slate`, so an admin choice is never overwritten:
GTA blue, Peel / Mississauga coral, Durham / Oshawa-Ajax green,
Waterloo / Kitchener purple, Hamilton / Halton amber, Other teal.

Areas are archived, never deleted. A database trigger refuses a hard delete
while any partner still references the area, and there is no delete RLS policy,
so the API cannot remove one either.

### placement_partners

`name`, `partner_type`, `main_phone`, `website`, `address_line`, `city`,
`province`, `postal_code`, `area_id`, `relationship_status`,
`legacy_zoho_account_id` (unique), `legacy_owner_name`, `last_contacted_at`,
`next_follow_up_at`, `availability_status`, `next_intake_date`,
`availability_note`, `availability_checked_at`, `is_active`, timestamps.

Relationship statuses: `active`, `prospect`, `inactive`, `archived`. Imported
accounts default to `active`.

Every location column is nullable on purpose. Nothing about a partner's address
is required anywhere in the application.

`is_active = false` is an archived partner: it leaves the Area Board and List
View but keeps its contacts and comments. Partners are never deleted.

The four availability columns are described under
[Partner availability](#partner-availability).

### placement_partner_contacts

`partner_id`, `full_name`, `email`, `phone`, `job_title`, `is_primary`,
`legacy_zoho_contact_id` (unique), `legacy_owner_name`, `is_active`, timestamps.

One partner has **many** contacts. There is deliberately no unique constraint on
(`partner_id`, `full_name`): the cleaned Zoho source legitimately holds two
separate records with the same name under one organization, and merging them
automatically would lose a real record.

Only `full_name` is required. A contact with no email and no phone is a normal
imported state, not an error.

`is_primary` is not constrained to exactly one row. Instead, marking a contact
primary fires a trigger that demotes the other contacts at that partner, so
"primary" stays a single answer without a constraint that would block an import
or an ordinary edit. Contacts are archived, never deleted.

### placement_partner_notes

`partner_id`, `body`, `created_by`, timestamps. The same shape as
`student_notes`: simple contextual commenting, not chat and not threaded
conversation.

## Unassigned

Unassigned is **not** a row in `placement_areas`.

A partner is Unassigned when:

```sql
placement_partners.area_id is null
```

The Area Board always renders it as the **first column**, so staff can never
rename it, reorder it, or remove it, and no migration can accidentally delete
it. Every imported partner starts here by design.

A partner whose area has been **archived** also surfaces in the Unassigned
column, with a small note saying its area was archived. Archiving an area never
nulls `area_id`, so the historical relationship stays intact, and the Unassigned
filter and the Needs an Area count include these partners as well. Archiving an
area never loses or hides a partner.

## Partner availability

Added by `supabase/migrations/0005_partner_board_refinements.sql`.

Availability is **partner-level operational data**. It describes the
organization, not any student and not any placement:

- Is this LTC currently accepting placements?
- If not now, when is their next intake or cohort?
- When did staff last verify that?
- Is there a short operational note about it?

| Column | Holds |
| --- | --- |
| `availability_status` | `unknown`, `available_now`, `upcoming`, `not_available`. CHECK constrained, default `unknown` |
| `next_intake_date` | `date`, nullable |
| `availability_note` | text, nullable |
| `availability_checked_at` | `timestamptz`, nullable |

Human labels: **Unknown**, **Available Now**, **Upcoming Intake**,
**Not Available**.

`next_intake_date` is a real `date` rather than a timestamptz because an intake
is a day, not a moment, and must never shift across a timezone boundary.
`availability_checked_at` is a timestamptz because "when did somebody last check"
is an audit fact.

Only the status is ever required. Staff are never forced to invent an intake date
or a note in order to record that a partner is simply not available. A partner
nobody has asked yet stays **Unknown**, which is the honest answer, and every
imported partner starts there.

`availability_checked_at` only moves when staff explicitly say they checked, both
on the partner page and in Add / Edit Partner. Correcting a typo in the note
never makes a year-old answer look freshly confirmed.

This is deliberately **not** capacity. There are no slot counts, no reservations,
and no student assignment here. Those belong to PLACEMENT-04 and later, which
will read these fields when matching students to partners.

## Area Board

`/placement-partners`, the default view.

A horizontal board. Columns are Unassigned first, then every **active**
`placement_area` in `sort_order`. Each column header shows the area name and its
partner count.

Each column is tinted with its area's `color_key`: a soft column surface and a
stronger header accent, with white partner cards and dark text on top of it. The
colour always comes from the area's own `color_key`, never from its position in
the board, so a newly created area renders in the colour the admin picked and
reordering the board never repaints anything. Unassigned is not a
`placement_areas` row and keeps the neutral slate treatment.

Cards are deliberately sparse, in priority order:

- partner name
- city when known, otherwise "Location not added yet"
- the availability chip: "Available Now", "Upcoming Intake", "Not Available",
  "Unknown", with the compact next intake date ("Oct 20") beside it when the
  partner has an upcoming intake and a date is recorded
- contact count, comment count when there is one
- relationship status

Phone numbers, websites, follow-up dates, and the availability note are not on
the card. The availability note, Last Checked, and the full intake date live on
the partner profile. Clicking the name opens the partner.

### Drag and drop

Staff with edit permission drag a card between columns. Dropping into an area
sets `area_id`; dropping into Unassigned sets `area_id = null`. The move is
optimistic and is reverted if the database refuses it.

This uses the browser's own drag and drop, so **no drag library is in the
bundle**. There is no nested dragging and cards are not reordered within a
column.

Dragging a card near either edge of the board scrolls the **board** horizontally,
never the page, so an area several columns away is reachable without letting go.
The speed ramps across the edge zone, so resting just inside it creeps and
pushing to the edge crosses several columns during one drag. The loop exists only
while a drag does.

Every card also carries a **Move to Area** select. That is the accessible path,
it works with a keyboard, and it is the practical path on a tablet. Nothing about
moving a partner depends on drag behaviour.

## List View

`/placement-partners?view=list`.

Comfortable rows, not a dense CRM table. Each row shows the partner name, type,
location, area, contact count, comment count, next follow-up when set, the
availability chip with its intake date, and the relationship status.

Search covers partner name, city, phone, and address, plus contact name and
contact email, so searching a person finds their organization.

Four simple filters: **Area** (including Unassigned), **Relationship Status**,
**Availability** (All / Available Now / Upcoming Intake / Not Available /
Unknown), and **Has contacts / No contacts**.

The view, the search term, and the filters all live in the URL, so a filtered
board can be bookmarked and shared and there is no client state to keep in step.

## Partner profile

`/placement-partners/[partnerId]`.

Top of the page: **Back to Placement Partners**, the large partner name, location
and area, relationship status, contact count, a **Comments** button, and **Edit
Partner**.

Sections:

- **Placement Availability** - Availability Status, Next Intake Date, Last
  Checked, and Availability Note. Staff with partner edit permission update all
  four, and an explicit "I checked this with the partner" box is what sets Last
  Checked to now.
- **Location** - address, city, province, postal code, area, main phone, website.
  When nothing has been filled in it says "Location not added yet" rather than
  showing empty fields as a problem.
- **Follow-up** - Last Contacted and Next Follow-up, two dates and a save
  button. This is not a task or reminder system: nothing is scheduled, notified,
  or assigned.
- **Contacts** - every contact, primary first. Add, Edit, Mark Primary, and
  Archive. Archived contacts sit in a collapsed section and are kept.
- **Current Placements** - an empty placeholder. PLACEMENT-04 fills it in.
- **Comments** - the count, and the same Comments button as the top of the page.
- **Partner Record** - Archive / Restore, and the Zoho migration note when the
  partner came from the import.

### Comments

Comments are the single operational note and history system for a partner.
There is no separate Notes section: the availability note is one current line
about intake, not a running log, and everything else staff want to record about
a partner is a comment.

The same interaction as student comments: a right-side drawer over the partner
page. Closing it leaves staff exactly where they were, with their scroll
position intact.

Inside the drawer the comments run in chronological order, oldest at the top and
newest at the bottom, under date separators that read "Today", "Yesterday", or
the full date. Each comment shows its author and the time it was posted; the day
is on the separator above it. The drawer opens scrolled to the newest comment,
and stays at the bottom after one is posted, so the comment just written is the
one in view.

Deliberately still a simple comment model: no threads, no replies, no
reactions, and no chat behaviour.

## Add and Edit Partner

`/placement-partners/new` and `/placement-partners/[partnerId]/edit` share one
form, so the field architecture is identical.

Defaults for a new partner: Province `Ontario`, Relationship Status `Active`,
Area `Unassigned`, Availability `Unknown`, no intake date.

The form carries the Placement Availability fields as well, so a partner can be
created or corrected in one pass.

Only **Partner Name** is required. No location field is required anywhere.
Internal UUIDs are never shown or editable, and the Zoho columns cannot be
edited from the application at all.

## Admin - Placement Areas

`/admin/placement-areas`, reached from a card on `/admin`.

Admin can add an area, rename it, edit its description, change its display
order, choose its **Area Colour**, archive it, and reactivate it. Each area shows
a swatch, its colour name, and how many partners point at it.

The colour picker is the controlled palette, shown as labelled swatches. A new
area defaults to a sensible palette value and renders in its chosen colour on the
board immediately.

There is no delete. Reordering swaps two `sort_order` values, which keeps the
seeded gaps usable.

The Area Board reacts to every one of these changes on its next render.

## Security

Row Level Security is enabled on all four tables and no policy is granted to
`anon`, so anonymous requests read and write nothing.

| Role | May |
| --- | --- |
| any active staff | read areas, partners, contacts, and notes; add a comment |
| `placement_manager` | create and edit partners and contacts, move partners between areas, update location, relationship status, and follow-up |
| `admin` | everything a placement manager may, plus configure area definitions |
| `management` | read the network and add comments; no partner or area changes |

Write access uses `public.can_manage_partners()`, which mirrors
`canManagePartners()` in `src/lib/auth/session.ts`. Area configuration uses the
existing `public.is_admin()`. There are no delete policies on areas, partners, or
contacts: everything is archived instead.

The UI hides actions a role cannot take, but the **database is the security
boundary** — a Server Action reached directly still fails the policy check.

## One-time Zoho migration

`scripts/import-placement-partners.ts`. Migration tooling only; there is no
Import button anywhere in the application and never will be.

```bash
npx tsx scripts/import-placement-partners.ts "_private/imports/TAE_Placement_Partners_Cleaned.xlsx" --dry-run
npx tsx scripts/import-placement-partners.ts "_private/imports/TAE_Placement_Partners_Cleaned.xlsx" --apply
```

The workbook path is always explicit. The script never searches the disk for
spreadsheets. Only the **Accounts** and **Contacts** worksheets are read; Account
Contact View, Review, Import Mapping, and Summary are reference material for
staff.

Options: `--update-existing` also refreshes workbook fields on records that
already exist (off by default), and `--verbose` lists partner and contact names.

### Fields imported

From **Accounts**:

| Workbook column | Column |
| --- | --- |
| Zoho Account ID | `legacy_zoho_account_id` |
| Account Name | `name` |
| Phone | `main_phone` |
| Website | `website` |
| Account Owner | `legacy_owner_name` |

Defaults: `relationship_status = active`, `area_id = null`, `is_active = true`.

From **Contacts**, matched rows only:

| Workbook column | Column |
| --- | --- |
| Zoho Contact ID | `legacy_zoho_contact_id` |
| Zoho Account ID | partner lookup by `legacy_zoho_account_id` |
| Contact Name | `full_name` |
| Email | `email` |
| Phone | `phone` |
| Contact Owner | `legacy_owner_name` |

Defaults: `is_primary = false`, `is_active = true`.

### Fields intentionally not inferred

- **address, city, province, postal code** - the source has no reliable location
  data, so none is invented from an organization's name.
- **placement area** - every imported partner is Unassigned. Staff clean the
  geography up and then organize the board.
- **primary contact** - never guessed, not even when a partner has exactly one
  contact.
- **partner type** - left empty rather than assumed to be Long Term Care.

### Safety

Idempotency comes from the two unique Zoho id columns, so a second run creates
nothing. Without `--update-existing`, existing records are counted and left
alone, so cleanup done in the application is never overwritten.

Contacts are never merged or deduplicated by name. Different Zoho Contact IDs are
different source records, including the two `Jaswinder Kaur` rows under one
organization. Staff review and archive by hand.

A dry run performs **zero writes** and reports accounts found, matched contacts,
unmatched and skipped rows, partners without contacts, partners with several
contacts, and duplicate or missing external ids. Apply reports created, updated,
already present, and skipped.

The script validates the **worksheet structure**, not the row counts, so the
source growing later is not a failure.

### Expected source counts

The current cleaned workbook produces:

| Metric | Count |
| --- | --- |
| Accounts found | 59 |
| Contact rows in the sheet | 39 |
| Matched contacts imported | 38 |
| Unmatched contacts skipped (the `test` row) | 1 |
| Partners with at least one contact | 35 |
| Partners without contacts | 24 |
| Partners with several contacts | 2 |
| Duplicate or missing external ids | 0 |

### Privacy

The workbook is private migration material. It is never committed, moved,
renamed, copied into `public/`, or exposed through the application. `_private/`
and `*.xlsx` are both ignored by Git.

`--apply` needs `SUPABASE_SERVICE_ROLE_KEY`, which bypasses Row Level Security.
It stays in `.env.local`, is never read from application code, and is never put
behind a `NEXT_PUBLIC_` name.

## Boundary with student placement

This module organizes **organizations**, not students. Nothing here reads or
writes a student record.

PLACEMENT-04 and later will add student-to-partner assignment, matching, the
student placement workflow, check-ins, capacity, and distance. The Area Board is
only for organizing placement partners and is not the student placement board.

Partner availability is the one piece of this module that PLACEMENT-04 will read
directly: "which partners are accepting students, and when does the next intake
open" is a property of the organization, recorded here once, and consumed by
student matching later. It is still not capacity, and it still holds no student.
