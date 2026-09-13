-- PLACEMENT-05A - Batch Placement Planning and City to Area mapping
--
--   placement_area_cities   maps ONE normalized student city to ONE operational
--                           placement area
--
-- This migration is purely ADDITIVE. It creates one table, one guard trigger,
-- and its policies. It does not touch students, batches, student notes,
-- document requirements, checklist rows, placement packages, placement areas,
-- placement partners, partner contacts, partner notes, or student placements,
-- and it rewrites nothing from 0001 through 0006. It is safe to apply once to
-- the live database.
--
-- The planning relationship is deliberately DERIVED and never stored on a
-- student:
--
--   students.city
--     -> normalized city
--     -> placement_area_cities.normalized_city_name
--     -> placement_area_cities.area_id
--     -> placement_areas.id
--     -> placement_partners.area_id
--
-- There is no students.area_id and there must never be one. A student's city is
-- the factual address value staff maintain on the student record; the Area is
-- an operational grouping an admin configures here. Re-mapping a city therefore
-- never rewrites a single student row, and correcting one student's city never
-- disturbs anyone else's Area.
--
-- Unmapped is NOT a row in placement_areas and NOT a row here either. A city is
-- Unmapped when no row in this table matches its normalized value. Nothing is
-- ever inferred from geography, postal code, distance, or a maps service: an
-- unmapped city is the honest answer until an admin maps it.

-- ---------------------------------------------------------------------------
-- placement_area_cities
--
-- normalized_city_name is the key the application matches on, and it is UNIQUE:
-- one normalized city belongs to at most one area, so " Mississauga ",
-- "MISSISSAUGA", and "mississauga" can never be split across two areas.
--
-- city_name keeps a READABLE label beside it ("Mississauga"). It is what the
-- admin screen shows; it is never written back to any student.
--
-- The normalization itself lives in application code
-- (src/lib/planning/city.ts): trim, collapse repeated internal whitespace,
-- lowercase. The CHECK below re-states that relationship in SQL: the stored key
-- must be the normalization OF THIS ROW'S city_name, not merely a string that
-- happens to look normalized. A hand written INSERT therefore cannot pair a
-- readable label with a key that does not belong to it, which is the one way
-- this table could silently stop matching students.
--
-- Only case and whitespace are touched. Punctuation, accents, apostrophes, and
-- hyphens all survive, so "St. Catharines", "Val-d'Or", and "Montréal" keep
-- their own identity instead of being folded into something else.
-- ---------------------------------------------------------------------------

-- Deliberately NOT "if not exists". This is a numbered migration applied once,
-- in order, and an unexpected pre-existing table means the schema is not in the
-- state this file assumes. Failing loudly is the point: a silent skip is what
-- lets a partially applied schema hide behind a green migration run.
create table public.placement_area_cities (
  id uuid primary key default gen_random_uuid(),
  -- restrict, not cascade: removing an area must never silently delete the
  -- mapping relationships that tell staff which cities point at it. This table
  -- holds only the CURRENT mapping for each city, not past versions of it, so a
  -- cascaded delete would destroy the only copy. Areas are archived rather than
  -- deleted anyway, and the trigger below says so in plain language.
  area_id uuid not null
    references public.placement_areas (id) on delete restrict,
  city_name text not null,
  normalized_city_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A table constraint, because it spans two columns.
  --
  -- Whitespace is collapsed BEFORE trimming, matching the application exactly:
  -- btrim() alone removes spaces but not tabs or newlines, so trimming first
  -- would leave a leading tab as a leading space here while the application
  -- dropped it, and an honest row would be rejected.
  --
  -- The length guard is what makes city_name meaningfully non-blank. A label of
  -- "   " or a lone tab normalizes to the empty string and is refused, so a
  -- separate check on city_name would only restate this one.
  constraint placement_area_cities_normalized_matches_city check (
    normalized_city_name =
      btrim(regexp_replace(lower(city_name), '[[:space:]]+', ' ', 'g'))
    and length(normalized_city_name) > 0
  )
);

comment on table public.placement_area_cities is
  'Maps one normalized student city to one operational placement area. The bridge between students.city and placement_areas, so no area is ever stored on a student. Unmapped is the absence of a row here, never a fake area.';
comment on column public.placement_area_cities.city_name is
  'Readable display label for the city, for example "Mississauga". Shown in Admin. Never written back to a student record.';
comment on column public.placement_area_cities.normalized_city_name is
  'The match key: trimmed, internal whitespace collapsed, lowercased. Unique, so one city can never point at two areas.';

create index if not exists placement_area_cities_area_id_idx
  on public.placement_area_cities (area_id);

drop trigger if exists placement_area_cities_set_updated_at
  on public.placement_area_cities;
create trigger placement_area_cities_set_updated_at
  before update on public.placement_area_cities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- An area that cities still point at must never be hard deleted
--
-- 0004 already refuses to delete an area that PARTNERS point at. This is the
-- same guard for city mappings, added as its own function and trigger so the
-- 0004 objects are left exactly as they are. The foreign key above would refuse
-- the delete on its own; this exists so the refusal says what to do instead.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_delete_area_with_cities()
returns trigger
language plpgsql
as $function$
begin
  if exists (
    select 1 from public.placement_area_cities c where c.area_id = old.id
  ) then
    raise exception
      'Placement area % is still mapped to student cities. Archive it, or move those cities to another area, instead of deleting it.',
      old.name;
  end if;
  return old;
end;
$function$;

drop trigger if exists placement_areas_prevent_delete_mapped_cities
  on public.placement_areas;
create trigger placement_areas_prevent_delete_mapped_cities
  before delete on public.placement_areas
  for each row execute function public.prevent_delete_area_with_cities();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Reading the mapping is what makes Batch Planning work, so every active staff
-- member may read it, management included. Changing it is an ADMIN decision in
-- exactly the same way the area definitions themselves are, so it reuses
-- public.is_admin() rather than public.can_manage_partners().
--
--   every active staff member   read
--   admin                       add / change / remove a mapping
--   placement_manager           read only
--   management                  read only
--   anon                        nothing
--
-- DELETE is granted here, unlike areas and partners, and that is deliberate:
-- returning a city to Unmapped means removing its row. There is no fake
-- "Unmapped" area to point it at, and leaving a tombstone row would make an
-- unmapped city look mapped.
-- ---------------------------------------------------------------------------

alter table public.placement_area_cities enable row level security;

drop policy if exists "staff read area city mappings"
  on public.placement_area_cities;
create policy "staff read area city mappings"
  on public.placement_area_cities for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "admin insert area city mappings"
  on public.placement_area_cities;
create policy "admin insert area city mappings"
  on public.placement_area_cities for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admin update area city mappings"
  on public.placement_area_cities;
create policy "admin update area city mappings"
  on public.placement_area_cities for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin delete area city mappings"
  on public.placement_area_cities;
create policy "admin delete area city mappings"
  on public.placement_area_cities for delete
  to authenticated
  using (public.is_admin());

revoke all on public.placement_area_cities from anon;
grant select, insert, update, delete on public.placement_area_cities
  to authenticated;

-- ---------------------------------------------------------------------------
-- No seed data
--
-- Nothing is inserted here on purpose. Seeding "Mississauga -> Peel" would be
-- this migration guessing Ontario geography on the academy's behalf, and a
-- wrong guess is worse than an honest Unmapped: it would quietly send a batch's
-- planning to the wrong partners. The repository holds no user approved mapping
-- source, so every mapping is created by an admin at
-- /admin/city-area-mapping from the cities their own students actually have.
-- ---------------------------------------------------------------------------
