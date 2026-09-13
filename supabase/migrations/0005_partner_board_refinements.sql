-- PLACEMENT-03 refinements - Area colours and Partner Placement Availability
--
-- 0004 has already been applied to the development database, so this migration
-- never rewrites it. Everything here is ADDITIVE:
--
--   placement_areas.color_key              a controlled board colour per area
--   placement_partners.availability_status operational placement availability
--   placement_partners.next_intake_date    the next intake / cohort date
--   placement_partners.availability_note   a short operational note
--   placement_partners.availability_checked_at
--                                          when staff last verified the above
--
-- Nothing here touches students, batches, student notes, document
-- requirements, checklist rows, or placement packages. No existing column is
-- dropped, renamed, or retyped, and no area name or id is changed.
--
-- Availability is PARTNER level operational data. It answers "is this LTC
-- accepting placements right now, and if not, when is their next intake".
-- It is deliberately NOT capacity, slot counts, or a student assignment:
-- those belong to PLACEMENT-04 and later.

-- ---------------------------------------------------------------------------
-- placement_areas.color_key
--
-- A controlled palette, not a hex colour picker. The application maps each key
-- to one soft column surface, one stronger header accent, and one swatch, so
-- the board stays readable and visually consistent no matter what an admin
-- picks. A new key must be added here and in src/lib/placement/constants.ts.
--
-- slate is the neutral default. It is also the visual treatment of the
-- Unassigned column, which is not a row in this table.
-- ---------------------------------------------------------------------------

alter table public.placement_areas
  add column if not exists color_key text not null default 'slate';

comment on column public.placement_areas.color_key is
  'Controlled Area Board colour. One of slate, blue, green, amber, purple, coral, teal, indigo. Never an arbitrary hex value. The board reads this column, never an array position.';

alter table public.placement_areas
  drop constraint if exists placement_areas_color_key_check;

alter table public.placement_areas
  add constraint placement_areas_color_key_check
  check (
    color_key in (
      'slate', 'blue', 'green', 'amber', 'purple', 'coral', 'teal', 'indigo'
    )
  );

-- ---------------------------------------------------------------------------
-- Default colours for the areas seeded by 0004
--
-- Matched on the seeded NAME, and only while the area is still on the default
-- slate, so an admin who has already chosen a colour is never overwritten and a
-- rerun of this migration changes nothing. Names and ids are left alone.
-- ---------------------------------------------------------------------------

update public.placement_areas as a
   set color_key = seed.color_key
  from (
    values
      ('gta', 'blue'),
      ('peel / mississauga', 'coral'),
      ('durham / oshawa-ajax', 'green'),
      ('waterloo / kitchener', 'purple'),
      ('hamilton / halton', 'amber'),
      ('other', 'teal')
  ) as seed (name_key, color_key)
 where lower(btrim(a.name)) = seed.name_key
   and a.color_key = 'slate';

-- ---------------------------------------------------------------------------
-- placement_partners placement availability
--
-- next_intake_date is a plain DATE, not a timestamptz: an intake is a day, not
-- a moment, and it must never shift across a timezone boundary the way a
-- timestamp would. availability_checked_at IS a moment, because "when did staff
-- last verify this" is an audit fact.
--
-- Every field except the status is nullable. Staff are never forced to invent
-- an intake date or a note to record that a partner is simply not available.
-- ---------------------------------------------------------------------------

alter table public.placement_partners
  add column if not exists availability_status text not null default 'unknown',
  add column if not exists next_intake_date date,
  add column if not exists availability_note text,
  add column if not exists availability_checked_at timestamptz;

comment on column public.placement_partners.availability_status is
  'Is this partner accepting placements: unknown, available_now, upcoming, not_available. Operational partner state, not student assignment and not capacity.';
comment on column public.placement_partners.next_intake_date is
  'The next intake / cohort date when availability_status is upcoming. A DATE, because an intake is a day and must not shift with a timezone. Never required.';
comment on column public.placement_partners.availability_note is
  'Short operational note, for example "Current cohort is full. Check again in January." Never required.';
comment on column public.placement_partners.availability_checked_at is
  'When staff last verified this availability. Set deliberately from the application, never guessed.';

alter table public.placement_partners
  drop constraint if exists placement_partners_availability_status_check;

alter table public.placement_partners
  add constraint placement_partners_availability_status_check
  check (
    availability_status in (
      'unknown', 'available_now', 'upcoming', 'not_available'
    )
  );

-- Imported and pre-existing partners all sit at the column default, which is
-- the honest answer: nobody has checked them yet.
create index if not exists placement_partners_availability_status_idx
  on public.placement_partners (availability_status);

-- Upcoming intakes are read in date order when staff scan for the next opening.
create index if not exists placement_partners_next_intake_date_idx
  on public.placement_partners (next_intake_date)
  where next_intake_date is not null;

-- ---------------------------------------------------------------------------
-- Security
--
-- No new table, so no new RLS policy is needed. The existing policies from 0004
-- already cover these columns:
--
--   placement_areas       admin only insert / update, staff read
--   placement_partners    can_manage_partners() insert / update, staff read
--
-- Table level grants cover new columns, so nothing is re-granted here and anon
-- still reads nothing.
-- ---------------------------------------------------------------------------
