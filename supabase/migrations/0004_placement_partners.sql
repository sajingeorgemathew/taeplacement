-- PLACEMENT-03 - Placement Partners, Contacts and Areas
--
-- Adds the placement partner network on top of PLACEMENT-01 / PLACEMENT-02:
--   placement_areas             admin configured operational area definitions
--   placement_partners          LTC and other placement organization accounts
--   placement_partner_contacts  many contacts per partner
--   placement_partner_notes     contextual internal comments on a partner
--
-- This migration is purely ADDITIVE. It creates nothing that replaces or
-- rewrites 0001, 0002, or 0003, and it never touches students, batches, student
-- notes, document requirements, checklist rows, or placement packages. It is
-- safe to apply once to the live database that already holds the imported
-- students.
--
-- The database stays the security boundary. Row Level Security is enabled on
-- all four new tables and anonymous users read nothing.
--
-- Unassigned is NOT a row in placement_areas. A partner is Unassigned when
-- placement_partners.area_id IS NULL. The Area Board renders that as its first
-- column, so Unassigned can never be renamed, reordered, or deleted by staff.

-- ---------------------------------------------------------------------------
-- Access helper
--
-- Reading the partner network is open to every active staff member, including
-- management. Creating and editing partners and contacts, moving partners
-- between areas, and updating location, relationship status, and follow-up
-- fields is limited to the two roles that actually run placement.
--
-- Configuring the AREA DEFINITIONS themselves is admin only and uses the
-- existing public.is_admin().
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_partners()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role in ('admin', 'placement_manager')
  );
$$;

revoke all on function public.can_manage_partners() from public, anon;
grant execute on function public.can_manage_partners() to authenticated;

-- ---------------------------------------------------------------------------
-- placement_areas
--
-- Admin configuration. The Area Board reads its columns from this table, so no
-- area is ever hard-coded in a React component. Areas are archived, never
-- deleted, so a partner that references one keeps its meaning.
--
-- sort_order is seeded with gaps of ten so a new area can later be slotted
-- between two existing ones without renumbering the whole list.
-- ---------------------------------------------------------------------------

create table if not exists public.placement_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.placement_areas is
  'Configurable operational areas partners are grouped into. Admin only. Archived, never deleted. Unassigned is not a row here: it is area_id IS NULL.';
comment on column public.placement_areas.sort_order is
  'Board column order after the special Unassigned column. Seeded with gaps of ten so later areas can be inserted between existing ones.';
comment on column public.placement_areas.is_active is
  'Archived areas leave the normal board. Partners that reference one stay valid and surface under Unassigned / Needs Area.';

create unique index if not exists placement_areas_name_key
  on public.placement_areas (lower(btrim(name)));
create index if not exists placement_areas_active_idx
  on public.placement_areas (is_active, sort_order);

drop trigger if exists placement_areas_set_updated_at on public.placement_areas;
create trigger placement_areas_set_updated_at
  before update on public.placement_areas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- placement_partners
--
-- One row per placement organization. legacy_zoho_account_id is the uniqueness
-- key for the one-time Zoho migration: it is what makes re-running
-- scripts/import-placement-partners.ts safe.
--
-- Location columns are all nullable on purpose. The cleaned Zoho export has no
-- reliable address data, so imported partners arrive with no location and no
-- area, and staff fill those in over time. Nothing is inferred.
-- ---------------------------------------------------------------------------

create table if not exists public.placement_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  partner_type text,
  main_phone text,
  website text,
  address_line text,
  city text,
  province text,
  postal_code text,
  area_id uuid references public.placement_areas (id) on delete set null,
  relationship_status text not null default 'active'
    check (relationship_status in ('active', 'prospect', 'inactive', 'archived')),
  legacy_zoho_account_id text unique,
  legacy_owner_name text,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.placement_partners is
  'Placement partner accounts: LTCs, retirement residences, hospitals, and other placement organizations. Students are not assigned to partners yet; that is PLACEMENT-04.';
comment on column public.placement_partners.area_id is
  'Operational area, or NULL for Unassigned. Imported partners start NULL by design.';
comment on column public.placement_partners.legacy_zoho_account_id is
  'Zoho Account Record Id from the one-time cleaned workbook migration. The idempotency key for that import.';
comment on column public.placement_partners.legacy_owner_name is
  'Zoho Account Owner name, kept only as migration traceability. Not a staff account reference.';
comment on column public.placement_partners.is_active is
  'Archived partners leave the Area Board and List View. They are never deleted.';

create index if not exists placement_partners_area_id_idx
  on public.placement_partners (area_id);
create index if not exists placement_partners_active_idx
  on public.placement_partners (is_active);
create index if not exists placement_partners_relationship_status_idx
  on public.placement_partners (relationship_status);
create index if not exists placement_partners_name_idx
  on public.placement_partners (lower(name));

drop trigger if exists placement_partners_set_updated_at on public.placement_partners;
create trigger placement_partners_set_updated_at
  before update on public.placement_partners
  for each row execute function public.set_updated_at();

-- An area that partners still point at must never be hard deleted. Archive it
-- instead, exactly like a batch that still holds students.
create or replace function public.prevent_delete_referenced_area()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.placement_partners p where p.area_id = old.id) then
    raise exception
      'Placement area % is still used by placement partners. Archive it instead of deleting it.',
      old.name;
  end if;
  return old;
end;
$$;

drop trigger if exists placement_areas_prevent_delete_referenced
  on public.placement_areas;
create trigger placement_areas_prevent_delete_referenced
  before delete on public.placement_areas
  for each row execute function public.prevent_delete_referenced_area();

-- ---------------------------------------------------------------------------
-- placement_partner_contacts
--
-- MANY contacts per partner. There is deliberately no unique constraint on
-- (partner_id, full_name): the cleaned Zoho source legitimately holds two
-- separate contact records with the same name under one organization, and
-- merging them automatically would lose a real record. Staff archive duplicates
-- by hand after reviewing them.
--
-- is_primary is not enforced as "exactly one". The migration never guesses a
-- primary contact; marking one is a later staff decision.
-- ---------------------------------------------------------------------------

create table if not exists public.placement_partner_contacts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null
    references public.placement_partners (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  email text,
  phone text,
  job_title text,
  is_primary boolean not null default false,
  legacy_zoho_contact_id text unique,
  legacy_owner_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.placement_partner_contacts is
  'Contacts at a placement partner. One partner may have many. Contacts are archived, never deleted, so imported source records are never lost.';
comment on column public.placement_partner_contacts.is_primary is
  'Set by staff. The one-time migration never guesses a primary contact.';
comment on column public.placement_partner_contacts.legacy_zoho_contact_id is
  'Zoho Contact Record Id. The idempotency key for the one-time import. Different ids are different source records even when the names match.';

create index if not exists placement_partner_contacts_partner_id_idx
  on public.placement_partner_contacts (partner_id, is_active);
create index if not exists placement_partner_contacts_primary_idx
  on public.placement_partner_contacts (partner_id, is_primary);

drop trigger if exists placement_partner_contacts_set_updated_at
  on public.placement_partner_contacts;
create trigger placement_partner_contacts_set_updated_at
  before update on public.placement_partner_contacts
  for each row execute function public.set_updated_at();

-- Marking a contact primary demotes the other contacts at the same partner, so
-- "primary" stays a single answer without a constraint that would block the
-- import or an ordinary edit.
create or replace function public.demote_other_primary_contacts()
returns trigger
language plpgsql
as $$
begin
  if new.is_primary then
    update public.placement_partner_contacts
       set is_primary = false
     where partner_id = new.partner_id
       and id <> new.id
       and is_primary;
  end if;
  return null;
end;
$$;

drop trigger if exists placement_partner_contacts_single_primary
  on public.placement_partner_contacts;
create trigger placement_partner_contacts_single_primary
  after insert or update of is_primary, partner_id
  on public.placement_partner_contacts
  for each row
  when (new.is_primary)
  execute function public.demote_other_primary_contacts();

-- ---------------------------------------------------------------------------
-- placement_partner_notes
--
-- Simple contextual commenting, the same shape as student_notes. Not chat, not
-- threaded conversation.
-- ---------------------------------------------------------------------------

create table if not exists public.placement_partner_notes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null
    references public.placement_partners (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.placement_partner_notes is
  'Internal contextual comments about a placement partner. This is not a messaging system.';

create index if not exists placement_partner_notes_partner_id_idx
  on public.placement_partner_notes (partner_id, created_at desc);

drop trigger if exists placement_partner_notes_set_updated_at
  on public.placement_partner_notes;
create trigger placement_partner_notes_set_updated_at
  before update on public.placement_partner_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed the starting operational areas
--
-- These are only starting clusters, not geographic truth. Admin renames,
-- reorders, archives, reactivates, and adds areas at /admin/placement-areas.
--
-- on conflict do nothing keeps a repeat run of this migration from duplicating
-- a seeded area or undoing an admin rename.
-- ---------------------------------------------------------------------------

insert into public.placement_areas (name, sort_order, is_active)
values
  ('GTA', 10, true),
  ('Peel / Mississauga', 20, true),
  ('Durham / Oshawa-Ajax', 30, true),
  ('Waterloo / Kitchener', 40, true),
  ('Hamilton / Halton', 50, true),
  ('Other', 60, true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- No policy below is granted to anon, so anonymous requests read and write
-- nothing on any of these tables.
--
--   every active staff member        read areas, partners, contacts, notes
--   admin + placement_manager        create / edit / archive partners
--                                    create / edit / archive contacts
--                                    move partners between areas
--   admin only                       configure area definitions
--   every active staff member        add a note
-- ---------------------------------------------------------------------------

alter table public.placement_areas enable row level security;
alter table public.placement_partners enable row level security;
alter table public.placement_partner_contacts enable row level security;
alter table public.placement_partner_notes enable row level security;

-- placement_areas -----------------------------------------------------------

drop policy if exists "staff read placement areas" on public.placement_areas;
create policy "staff read placement areas"
  on public.placement_areas for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "admin insert placement areas" on public.placement_areas;
create policy "admin insert placement areas"
  on public.placement_areas for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admin update placement areas" on public.placement_areas;
create policy "admin update placement areas"
  on public.placement_areas for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No delete policy. Areas are archived, never deleted through the API.

-- placement_partners --------------------------------------------------------

drop policy if exists "staff read placement partners" on public.placement_partners;
create policy "staff read placement partners"
  on public.placement_partners for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "placement staff insert partners" on public.placement_partners;
create policy "placement staff insert partners"
  on public.placement_partners for insert
  to authenticated
  with check (public.can_manage_partners());

drop policy if exists "placement staff update partners" on public.placement_partners;
create policy "placement staff update partners"
  on public.placement_partners for update
  to authenticated
  using (public.can_manage_partners())
  with check (public.can_manage_partners());

-- No delete policy. Partners are archived, never deleted through the API.

-- placement_partner_contacts ------------------------------------------------

drop policy if exists "staff read partner contacts"
  on public.placement_partner_contacts;
create policy "staff read partner contacts"
  on public.placement_partner_contacts for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "placement staff insert partner contacts"
  on public.placement_partner_contacts;
create policy "placement staff insert partner contacts"
  on public.placement_partner_contacts for insert
  to authenticated
  with check (public.can_manage_partners());

drop policy if exists "placement staff update partner contacts"
  on public.placement_partner_contacts;
create policy "placement staff update partner contacts"
  on public.placement_partner_contacts for update
  to authenticated
  using (public.can_manage_partners())
  with check (public.can_manage_partners());

-- No delete policy. A contact imported from Zoho is archived, never deleted.

-- placement_partner_notes ---------------------------------------------------

drop policy if exists "staff read partner notes" on public.placement_partner_notes;
create policy "staff read partner notes"
  on public.placement_partner_notes for select
  to authenticated
  using (public.is_active_staff());

-- Management reads the partner network and may still add context, so adding a
-- note is open to every active staff member, as it is for students.
drop policy if exists "staff add partner notes" on public.placement_partner_notes;
create policy "staff add partner notes"
  on public.placement_partner_notes for insert
  to authenticated
  with check (public.is_active_staff() and created_by = auth.uid());

-- Conservative, matching student_notes: only the author may change or remove
-- their own note. The application does not expose either yet.
drop policy if exists "author edits own partner note"
  on public.placement_partner_notes;
create policy "author edits own partner note"
  on public.placement_partner_notes for update
  to authenticated
  using (public.is_active_staff() and created_by = auth.uid())
  with check (public.is_active_staff() and created_by = auth.uid());

drop policy if exists "author deletes own partner note"
  on public.placement_partner_notes;
create policy "author deletes own partner note"
  on public.placement_partner_notes for delete
  to authenticated
  using (public.is_active_staff() and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Table grants
--
-- Revoke everything from anon so no future policy can accidentally open the
-- partner network to unauthenticated requests.
-- ---------------------------------------------------------------------------

revoke all on public.placement_areas from anon;
revoke all on public.placement_partners from anon;
revoke all on public.placement_partner_contacts from anon;
revoke all on public.placement_partner_notes from anon;

grant select, insert, update on public.placement_areas to authenticated;
grant select, insert, update on public.placement_partners to authenticated;
grant select, insert, update on public.placement_partner_contacts to authenticated;
grant select, insert, update, delete on public.placement_partner_notes
  to authenticated;
