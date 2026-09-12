-- PLACEMENT-01 - Students, Batches and Initial Migration
--
-- Creates the first operational tables for TAE Placement:
--   profiles       staff accounts linked to Supabase Auth
--   batches        student intake batches
--   students       student records
--   student_notes  internal notes attached to a student
--
-- The database is the real security boundary. Row Level Security is enabled on
-- every table and anonymous users can read nothing.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'placement_manager'
    check (role in ('admin', 'placement_manager', 'management')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Staff profiles. There is no public registration and no student or partner accounts.';
comment on column public.profiles.is_active is
  'New profiles start inactive. An admin activates a staff member before they can read student data.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- A profile row exists for every auth user, but it starts inactive so that
-- simply having an auth user is not enough to read student information.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, is_active)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Access helpers
--
-- security definer so that policies on profiles do not recurse into profiles.
-- ---------------------------------------------------------------------------

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;

revoke all on function public.is_active_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- batches
-- ---------------------------------------------------------------------------

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  program text not null default 'PSW',
  start_date date,
  schedule_label text,
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.batches is
  'Student intake batches. Batches are database records, never hard-coded in application code.';

create unique index if not exists batches_name_key on public.batches (lower(name));
create index if not exists batches_status_idx on public.batches (status);

drop trigger if exists batches_set_updated_at on public.batches;
create trigger batches_set_updated_at
  before update on public.batches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_number text not null unique,
  first_name text not null,
  middle_name text,
  last_name text,
  program text not null default 'PSW',
  batch_id uuid references public.batches (id) on delete set null,
  phone text,
  email text,
  address_line text,
  city text,
  province text,
  postal_code text,
  is_returning boolean not null default false,
  placement_status text not null default 'needs_review' check (
    placement_status in (
      'needs_review',
      'documents_pending',
      'ready_for_placement',
      'placement_assigned',
      'placement_started',
      'placement_completed',
      'on_hold'
    )
  ),
  document_status text not null default 'not_reviewed'
    check (document_status in ('not_reviewed', 'pending', 'ready')),
  is_active boolean not null default true,
  migration_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.students is
  'Student records. Date of birth and immigration status are deliberately not stored.';
comment on column public.students.student_number is
  'Unique operational student number. Also the idempotency key for the one-time workbook migration.';
comment on column public.students.is_returning is
  'Previous / Returning students. There is no fake "Previous Students" batch record.';

create index if not exists students_batch_id_idx on public.students (batch_id);
create index if not exists students_placement_status_idx on public.students (placement_status);
create index if not exists students_document_status_idx on public.students (document_status);
create index if not exists students_is_returning_idx on public.students (is_returning);
create index if not exists students_last_name_idx on public.students (last_name);

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

-- A batch that still holds students must never be hard deleted. Archive it instead.
create or replace function public.prevent_delete_batch_with_students()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.students s where s.batch_id = old.id) then
    raise exception 'Batch % still contains students. Archive it instead of deleting it.', old.name;
  end if;
  return old;
end;
$$;

drop trigger if exists batches_prevent_delete_with_students on public.batches;
create trigger batches_prevent_delete_with_students
  before delete on public.batches
  for each row execute function public.prevent_delete_batch_with_students();

-- ---------------------------------------------------------------------------
-- student_notes
-- ---------------------------------------------------------------------------

create table if not exists public.student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.student_notes is
  'Internal contextual notes about a student. This is not a messaging system.';

create index if not exists student_notes_student_id_idx
  on public.student_notes (student_id, created_at desc);

drop trigger if exists student_notes_set_updated_at on public.student_notes;
create trigger student_notes_set_updated_at
  before update on public.student_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- No policy below is granted to the anon role, so anonymous requests read and
-- write nothing on any of these tables.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.batches enable row level security;
alter table public.students enable row level security;
alter table public.student_notes enable row level security;

-- profiles ------------------------------------------------------------------

drop policy if exists "staff read profiles" on public.profiles;
create policy "staff read profiles"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_active_staff());

drop policy if exists "staff update own profile" on public.profiles;
create policy "staff update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "admin manage profiles" on public.profiles;
create policy "admin manage profiles"
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- batches -------------------------------------------------------------------

drop policy if exists "staff read batches" on public.batches;
create policy "staff read batches"
  on public.batches for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "admin insert batches" on public.batches;
create policy "admin insert batches"
  on public.batches for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admin update batches" on public.batches;
create policy "admin update batches"
  on public.batches for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No delete policy. Batches are archived, never deleted through the API.

-- students ------------------------------------------------------------------

drop policy if exists "staff read students" on public.students;
create policy "staff read students"
  on public.students for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "staff insert students" on public.students;
create policy "staff insert students"
  on public.students for insert
  to authenticated
  with check (public.is_active_staff());

drop policy if exists "staff update students" on public.students;
create policy "staff update students"
  on public.students for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

-- No delete policy. Students are deactivated, never deleted through the API.

-- student_notes -------------------------------------------------------------

drop policy if exists "staff read student notes" on public.student_notes;
create policy "staff read student notes"
  on public.student_notes for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "staff add student notes" on public.student_notes;
create policy "staff add student notes"
  on public.student_notes for insert
  to authenticated
  with check (public.is_active_staff() and created_by = auth.uid());

-- Conservative: a note can only be changed or removed by the staff member who
-- wrote it. The application does not expose this yet.
drop policy if exists "author edits own note" on public.student_notes;
create policy "author edits own note"
  on public.student_notes for update
  to authenticated
  using (public.is_active_staff() and created_by = auth.uid())
  with check (public.is_active_staff() and created_by = auth.uid());

drop policy if exists "author deletes own note" on public.student_notes;
create policy "author deletes own note"
  on public.student_notes for delete
  to authenticated
  using (public.is_active_staff() and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Table grants
--
-- Revoke everything from anon so that no future policy can accidentally open
-- student data to unauthenticated requests.
-- ---------------------------------------------------------------------------

revoke all on public.profiles from anon;
revoke all on public.batches from anon;
revoke all on public.students from anon;
revoke all on public.student_notes from anon;

grant select, insert, update on public.students to authenticated;
grant select, insert, update, delete on public.student_notes to authenticated;
grant select, insert, update on public.batches to authenticated;
grant select, update on public.profiles to authenticated;
