# Batch Placement Planning and City to Area Mapping

Planning a batch geographically. Built in PLACEMENT-05A on top of the students
and batches from PLACEMENT-01, the document readiness from PLACEMENT-02, the
partner network and areas from PLACEMENT-03, and the placement records from
PLACEMENT-04.

## Purpose

Before a batch starts, the placement manager has to answer one practical
question:

> Where does this batch need placement coverage?

Batch Planning answers it by putting five things on one screen:

- how many students are in the selected batch, and what state they are in
- which cities those students live in
- which operational Placement Area each of those cities belongs to
- which placement partners exist in those areas
- what those partners' availability currently is

That is the whole scope. It is a **view**. It assigns nobody, it recommends
nobody, and it changes no student record.

## What it is not

Batch Planning deliberately does **not** contain:

- maps, geocoding, postal code distance, or any geographic inference
- AI matching or automatic assignment
- partner capacity, slots, or seat counts
- outreach automation, email, SMS, reminders, or notifications
- check-ins, attendance, hours, or evaluations
- any new placement lifecycle status

Every count on every card is one of the existing `students.placement_status`
values. Nothing new was added to the placement vocabulary.

## The bridge

The planning relationship is **derived**, never stored:

```
students.city
  -> normalized city
  -> placement_area_cities.normalized_city_name
  -> placement_area_cities.area_id
  -> placement_areas.id
  -> placement_partners.area_id
```

There is no `students.area_id` and there must never be one. A student's city is
the factual address value staff maintain on the student record; the Area is an
operational grouping an admin configures. Keeping them apart means:

- re-mapping a city rewrites **no** student row
- correcting one student's city disturbs nobody else's Area
- renaming an Area shows the new name everywhere immediately
- there is never a second, stale copy of "which area is this student in"

`placement_areas.id` is the single meeting point between student geography and
partner geography. There is no second region system.

## City normalization

`src/lib/planning/city.ts` holds the one deterministic definition of "are these
two student cities the same place":

1. trim leading and trailing whitespace
2. collapse repeated internal whitespace
3. lowercase

So `" Mississauga "`, `"MISSISSAUGA"`, and `"mississauga"` all produce the match
key `mississauga` and appear as **one** row with **one** Area choice.

That is all it does. There is no geocoding, no maps service, no postal code
lookup, no alias table, and no spelling correction. `Scarborough` is not folded
into `Toronto`, and `Missisauga` is not corrected to `Mississauga`: both are
real data-quality decisions that belong to a human, and guessing them would
quietly plan a batch around the wrong partners.

A readable label is kept beside the key. The label is the spelling staff used
most often, ties broken alphabetically so it is stable between page loads. It is
a display choice only and is **never written back to a student**.

## Data model

Created by `supabase/migrations/0007_batch_placement_planning.sql`, which is
purely additive and rewrites nothing from 0001 through 0006.

### placement_area_cities

| Column | Holds |
| --- | --- |
| `id` | uuid primary key |
| `area_id` | not null, references `placement_areas`, `on delete restrict` |
| `city_name` | readable label, for example `Mississauga` |
| `normalized_city_name` | the match key. **Unique** |
| `created_at`, `updated_at` | timestamps, `updated_at` by trigger |

`normalized_city_name` is unique, so one city belongs to at most one Area and
capitalisation can never split a city across two areas. A CHECK constraint
refuses a value that did not come from the normalizer, so a hand-written INSERT
cannot create a key the application will never match.

`on delete restrict` plus `prevent_delete_area_with_cities()` mean an Area that
cities still point at cannot be hard deleted. Areas are archived, exactly as
they already were for partners, and the existing mapping relationships survive.
This table holds only the current mapping for each city; it is not a version
history, so the row it holds is the only copy.

**Unmapped is the absence of a row.** There is no placeholder `Unmapped` area,
no tombstone row, and no fake `placement_areas` entry.

### Row Level Security

| Role | May |
| --- | --- |
| every active staff member | read mappings |
| `admin` | add, change, and remove a mapping |
| `placement_manager` | read only |
| `management` | read only |
| `anon` | nothing |

Reads use the existing `public.is_active_staff()`; writes use the existing
`public.is_admin()`, the same helper that guards the Area definitions
themselves. `DELETE` is granted here, unlike areas and partners, because
returning a city to Unmapped means removing its row.

## Admin: City to Area Mapping

`/admin/city-area-mapping`, reachable from a card on `/admin`.

The list is driven by the **roster**, not by a master list of Canadian cities.
It shows the distinct cities active students really live in, grouped by their
normalized value:

| City | Students | Placement Area |
| --- | --- | --- |
| Mississauga | 11 | Peel / Mississauga |
| Brampton | 8 | Peel / Mississauga |
| Toronto | 6 | GTA |
| Scarborough | 2 | Unmapped |

Each row shows the readable city name, any other spellings on student records
("also written as..."), the number of active students, and one Area select.
An admin can:

- **assign** a city to an Area
- **change** it to a different Area
- **unmap** it, which deletes the mapping row

Only **active** areas are offered. Mapping a city to an archived area would
create a Needs Area Review row on purpose, so the action refuses it.

Rows sort problems to the top: Needs Area Review first, then Unmapped, then
mapped, each by student count. A count strip above the list gives cities in use,
mapped, unmapped, and needs review at a glance.

**This screen never edits a student's city.** If one student's city is wrong,
that is a correction on their student record.

### Mappings not currently in use

A mapping whose city no longer appears on any active student keeps its own quiet
section at the bottom. It is not deleted and not hidden: a returning student in
that city should land in the right Area straight away, and removing a mapping is
an admin decision, not a cleanup job.

## Placement navigation

The Placement module now has three views:

```
Board    Batch Planning    List
```

Board and List are unchanged and still live at `/placement`. Batch Planning is
its own route, `/placement/planning`, because it asks a different question and
reads a different working set. The same switch renders on both routes, so moving
between them never feels like leaving Placement, and the selected batch carries
across.

## Batch selector

The options are the real `batches` rows, in the order Admin arranged them. No
intake name is hard-coded or parsed anywhere.

The default is the most recent **active** batch: the latest `start_date`, or
where no dates are recorded, the last batch in the admin display order. Archived
batches stay selectable and are labelled, because looking back at a finished
batch is legitimate and hiding one would make its students look as if they had
vanished.

Choosing a batch resets the drill-down. An Area or a filter from the previous
batch means nothing in this one.

## Batch summary

Eight live counts, all read from the active students in the selected batch. No
summary table, no cached rollup.

| Count | Source |
| --- | --- |
| Total Students | active students in the batch |
| Documents Pending | `placement_status = documents_pending` |
| Ready for Placement | `placement_status = ready_for_placement` |
| Awaiting Start | `placement_status = placement_assigned` |
| On Placement | `placement_status = placement_started` |
| On Hold | `placement_status = on_hold` |
| Unmapped City | non-empty city with no usable **active** Area |
| City Missing | `city` is null or blank |

Inactive students are never counted. `needs_review` and `placement_completed`
are real statuses too; they are not part of the five a planner scans for, so
they only appear on an Area card when the batch actually contains one. They are
always inside Total.

Unmapped City and City Missing sit in the same strip as the placement statuses
on purpose. They are the two things a batch most often fails on, and they should
be seen in the same glance as Ready and On Hold.

## Area cards

One card per **active** Area that actually holds a student from this batch. An
Area with nobody in it is not a planning question for this batch, and an empty
card for every configured area would bury the ones that matter.

Each card carries the Area's own `color_key`, read from the database, never an
array position, so renaming, reordering, or adding an area repaints nothing.

A card shows:

- Area name and student count
- the five status figures: Ready, Docs Pending, Awaiting Start, On Placement,
  On Hold, plus Needs Review and Completed when the batch has one
- a city breakdown, for example `Mississauga 4` `Brampton 3`
- a partner overview: total active partners, Available Now, Upcoming, Unknown,
  Not Available
- a follow-up indicator when any partner in the Area is due
- **Open Area**

### The no-capacity caveat

The partner figures are an **availability** picture, never a capacity one.
Nothing in this application tracks how many students a partner will take: one
LTC may accept six and another may accept one.

So the card's observation line reads:

> 5 students are ready in this Area. 2 partners are currently marked Available
> Now. 3 partners have not been checked yet.

and it never reads "3 students cannot be placed" or "3 students need partners".
No count is ever subtracted from another. It is an operational observation, not
an automated recommendation.

## Unmapped City and City Missing

Two planning exceptions, kept strictly apart, both always visible.

**Unmapped City** - the student has a city, but no active Area mapping matches
it. The card lists the affected city names and counts, and links to **Manage
City Mapping**. Mapping one city moves everyone who lives there at once.

**City Missing** - the student record has no city at all. That is a student
record correction, not a mapping decision, so this card never links to the
mapping screen. It links to the affected students instead.

Both open a drill-down at `?exception=unmapped` or `?exception=missing` listing
the students, so staff can act on real people rather than a number.

Nothing is ever guessed for either group.

## Archived areas: Needs Area Review

When an Area is archived, the cities mapped to it are **not** nulled, not
deleted, and not silently treated as valid.

- In **Batch Planning** those students group under Unmapped City, and the city
  row reads `Needs Area Review - mapped to <Area>, which is archived`, so they
  are visible and nobody is lost.
- In **Admin** the mapping keeps its row, sorts to the top of the list with a
  Needs Area Review chip, and names the archived area, so an admin knows exactly
  which mapping to reassign.
- Archived areas do **not** open as a drill-down, and they are not offered in
  the Area select.

Archiving an Area therefore cannot quietly move a batch's students somewhere
else, cannot hide them, and cannot send planning towards partners the academy
has already retired from the board.

## Area drill-down

`/placement/planning?batch=<batchId>&area=<areaId>`, opened from an Area card,
with a Back link to the overview.

An active Area with no students from this batch still opens: seeing that an Area
is empty, and which partners sit there anyway, is a real planning answer.

### Students in this Area

Active students from the selected batch whose normalized city maps to this Area,
rendered with the same comfortable row the Placement List uses, so the layout is
already familiar. Each row shows:

- student name and student number
- batch and program
- city
- document readiness `X of Y ready`
- placement status and document status
- their current partner and planned start where one exists
- **Open Student**

Filters: All, Ready, Documents Pending, Awaiting Start, On Placement, On Hold.
Each chip carries its own count, and a chip with zero stays visible so "no
students on hold here" is distinguishable from "that filter does not exist".

Document readiness comes from the existing `student_document_readiness` view
through the existing queries. The 13-document rules are never re-implemented.

### Placement Partners in this Area

Active, non-archived partners whose `area_id` is this Area. Each row shows:

- partner name and type
- city
- availability, and the next intake date when Upcoming
- next follow-up, with a **Due** indicator when it is today or already past
- primary contact where one is marked
- contact count
- **Open Partner**

Filters: All, Available Now, Upcoming Intake, Unknown, Not Available. Available
Now sorts first and gets a green outline.

**Unknown partners are never hidden.** An unverified partner is not a closed
one, and those are often exactly the rows that need a phone call before the
batch starts.

### Partner follow-up

Reuses the existing `next_follow_up_at`, `availability_status`,
`next_intake_date`, and `availability_checked_at` on the partner record. There
is no second follow-up model, no outreach table, no reminder, and no
notification. The indicator only says that a date staff already set has arrived.

## Assignment boundary

Batch Planning never assigns anybody. There is exactly one assignment pathway in
the application and it is the PLACEMENT-04 Find Placement flow.

The only concession is a link: a student in the Area drill-down who is Ready for
Placement and has no live placement gets a **Find Placement** link straight into
that existing flow. It carries no state and duplicates no logic; it is the same
page reached from the board and the student record. Staff without
`can_manage_placements` never see it, exactly as they never see it elsewhere.

## Files

| Path | Holds |
| --- | --- |
| `supabase/migrations/0007_batch_placement_planning.sql` | the table, the guard trigger, RLS |
| `src/lib/planning/city.ts` | normalization and the readable label |
| `src/lib/planning/mapping.ts` | city to area resolution, the four states |
| `src/lib/planning/queries.ts` | mapping rows, distinct roster cities |
| `src/lib/planning/batch.ts` | grouping a batch, counts, the observation |
| `src/lib/planning/admin.ts` | the Admin mapping rows |
| `src/lib/planning/actions.ts` | assign / change / unmap, admin only |
| `src/lib/planning/filters.ts` | the URL state and the default batch |
| `src/lib/planning/constants.ts` | short card labels, filter lists |
| `src/app/(app)/placement/planning/page.tsx` | the view |
| `src/app/(app)/admin/city-area-mapping/page.tsx` | Admin mapping |
| `src/components/planning/` | the cards, lists, chips, and selector |

All planning state lives in the URL, like the Placement toolbar and Find
Placement before it, so a view can be shared, bookmarked, and reloaded with no
client state to keep in step.
