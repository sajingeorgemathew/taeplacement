-- PLACEMENT-02 - Student Placement Documents
--
-- Adds the placement document readiness workflow on top of the PLACEMENT-01
-- core schema:
--   placement_document_requirements  configurable checklist definitions
--   student_placement_documents      one checklist row per student + requirement
--   student_document_readiness       derived "X of Y ready" view
--   placement-documents              private Supabase Storage bucket
--
-- This migration is additive. It creates nothing that replaces PLACEMENT-01 and
-- it never deletes or rewrites students, batches, notes, or profiles. It is safe
-- to apply once to the live database that already holds the imported students.
--
-- The database stays the security boundary. Row Level Security is enabled on
-- both new tables and on the storage objects, and anonymous users read nothing.

-- ---------------------------------------------------------------------------
-- Access helper
--
-- Reading document readiness is open to every active staff member. Changing a
-- document, uploading a file, or removing a file is limited to the two roles
-- that actually run placement.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_documents()
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

revoke all on function public.can_manage_documents() from public, anon;
grant execute on function public.can_manage_documents() to authenticated;

-- ---------------------------------------------------------------------------
-- placement_document_requirements
--
-- The checklist definitions. Admin maintains this list, so no placement
-- document is ever hard-coded in a React component.
-- ---------------------------------------------------------------------------

create table if not exists public.placement_document_requirements (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  short_name text,
  description text,
  is_required boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.placement_document_requirements is
  'Configurable placement document checklist definitions. Archived, never deleted.';
comment on column public.placement_document_requirements.is_required is
  'Required requirements form the readiness denominator. Optional ones never block readiness.';
comment on column public.placement_document_requirements.is_active is
  'Archived requirements stay in the table so historical student rows keep their meaning.';

create unique index if not exists placement_document_requirements_name_key
  on public.placement_document_requirements (lower(btrim(name)));
create index if not exists placement_document_requirements_active_idx
  on public.placement_document_requirements (is_active, sort_order);

drop trigger if exists placement_document_requirements_set_updated_at
  on public.placement_document_requirements;
create trigger placement_document_requirements_set_updated_at
  before update on public.placement_document_requirements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- student_placement_documents
--
-- One row per student per requirement. The unique constraint is what makes the
-- initialization functions below safe to run again and again.
-- ---------------------------------------------------------------------------

create table if not exists public.student_placement_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  requirement_id uuid not null
    references public.placement_document_requirements (id) on delete restrict,
  status text not null default 'not_reviewed' check (
    status in (
      'not_reviewed',
      'requested',
      'received',
      'needs_update',
      'not_applicable'
    )
  ),
  file_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  requested_by uuid references public.profiles (id) on delete set null,
  requested_at timestamptz,
  received_by uuid references public.profiles (id) on delete set null,
  received_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_placement_documents_student_requirement_key
    unique (student_id, requirement_id)
);

comment on table public.student_placement_documents is
  'Placement document checklist per student. A file is optional: the official copy may stay in the LMS.';
comment on column public.student_placement_documents.file_path is
  'Object path inside the private placement-documents bucket. Never a public URL.';
comment on column public.student_placement_documents.note is
  'One short internal note. Threaded discussion belongs in student_notes.';

create index if not exists student_placement_documents_student_idx
  on public.student_placement_documents (student_id);
create index if not exists student_placement_documents_requirement_idx
  on public.student_placement_documents (requirement_id);
create index if not exists student_placement_documents_status_idx
  on public.student_placement_documents (status);

drop trigger if exists student_placement_documents_set_updated_at
  on public.student_placement_documents;
create trigger student_placement_documents_set_updated_at
  before update on public.student_placement_documents
  for each row execute function public.set_updated_at();

-- Requirements are archived through is_active. A requirement that is already
-- attached to a student must never be hard deleted.
create or replace function public.prevent_delete_used_requirement()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.student_placement_documents d
    where d.requirement_id = old.id
  ) then
    raise exception
      'Document requirement "%" is in use by students. Archive it instead of deleting it.',
      old.name;
  end if;
  return old;
end;
$$;

drop trigger if exists placement_document_requirements_prevent_delete_in_use
  on public.placement_document_requirements;
create trigger placement_document_requirements_prevent_delete_in_use
  before delete on public.placement_document_requirements
  for each row execute function public.prevent_delete_used_requirement();

-- ---------------------------------------------------------------------------
-- student_document_readiness
--
-- The single definition of "X of Y ready".
--
--   ready         status is received or not_applicable
--   denominator   every ACTIVE REQUIRED requirement, counted from the
--                 requirements table rather than from the student rows, so a
--                 missing checklist row can never make a student look ready
--   optional      counted separately and never blocks overall readiness
--
-- security_invoker so a staff member only ever sees rows their own policies on
-- students and student_placement_documents already allow.
-- ---------------------------------------------------------------------------

drop view if exists public.student_document_readiness;
create view public.student_document_readiness
with (security_invoker = true) as
with totals as (
  select
    count(*) filter (where is_required) as required_total,
    count(*) as active_total
  from public.placement_document_requirements
  where is_active
)
select
  s.id as student_id,
  t.required_total::integer as required_total,
  t.active_total::integer as active_total,
  count(*) filter (
    where d.is_required and d.status in ('received', 'not_applicable')
  )::integer as required_ready,
  count(*) filter (
    where d.status in ('received', 'not_applicable')
  )::integer as active_ready,
  count(*) filter (where d.status <> 'not_reviewed')::integer as reviewed_count,
  count(*) filter (where d.file_path is not null)::integer as file_count
from public.students s
cross join totals t
left join (
  -- Only rows for requirements that are still active are counted at all.
  select doc.student_id, doc.status, doc.file_path, req.is_required
  from public.student_placement_documents doc
  join public.placement_document_requirements req
    on req.id = doc.requirement_id
   and req.is_active
) d on d.student_id = s.id
group by s.id, t.required_total, t.active_total;

comment on view public.student_document_readiness is
  'Derived placement document readiness per student. The denominator is every active required requirement.';

-- ---------------------------------------------------------------------------
-- Summary synchronisation
--
-- students.document_status stays the summary field, but staff never maintain it
-- by hand. It is recomputed from the detailed rows every time one changes.
--
--   not_reviewed  nothing on the checklist has been touched yet
--   ready         every active required requirement is received or N/A
--   pending       anything else
-- ---------------------------------------------------------------------------

create or replace function public.sync_student_document_status(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select case
    when r.reviewed_count = 0 then 'not_reviewed'
    when r.required_ready >= r.required_total then 'ready'
    else 'pending'
  end
  into v_status
  from public.student_document_readiness r
  where r.student_id = p_student_id;

  if v_status is null then
    return null;
  end if;

  update public.students
     set document_status = v_status
   where id = p_student_id
     and document_status is distinct from v_status;

  return v_status;
end;
$$;

revoke all on function public.sync_student_document_status(uuid) from public, anon;

create or replace function public.student_placement_documents_sync_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- OLD is only assigned on delete and update, NEW only on insert and update,
  -- so each branch reads the one it actually has.
  if tg_op = 'DELETE' then
    perform public.sync_student_document_status(old.student_id);
    return old;
  end if;

  -- Creating a fresh not_reviewed row for a student whose summary is already
  -- not_reviewed cannot change anything, so skip the recomputation. This keeps
  -- the bulk checklist initialization cheap.
  if tg_op = 'INSERT' and new.status = 'not_reviewed' then
    if (select document_status from public.students where id = new.student_id)
       = 'not_reviewed' then
      return new;
    end if;
  end if;

  perform public.sync_student_document_status(new.student_id);
  return new;
end;
$$;

drop trigger if exists student_placement_documents_sync_status
  on public.student_placement_documents;
create trigger student_placement_documents_sync_status
  after insert or update or delete on public.student_placement_documents
  for each row execute function public.student_placement_documents_sync_status();

-- ---------------------------------------------------------------------------
-- Checklist initialization
--
-- Idempotent by construction: every insert relies on the
-- (student_id, requirement_id) unique constraint and does nothing on conflict.
-- Running any of these twice creates no duplicates.
-- ---------------------------------------------------------------------------

create or replace function public.initialize_student_placement_documents(
  p_student_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  -- Security definer, so re-check the caller. auth.uid() is null only when this
  -- runs from a migration or the local service-role script.
  if auth.uid() is not null and not public.is_active_staff() then
    raise exception 'Only active staff can initialize placement documents.';
  end if;

  insert into public.student_placement_documents (student_id, requirement_id, status)
  select p_student_id, r.id, 'not_reviewed'
  from public.placement_document_requirements r
  where r.is_active
  on conflict (student_id, requirement_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.initialize_student_placement_documents(uuid) is
  'Gives one student every active requirement. Safe to call repeatedly.';

create or replace function public.initialize_all_placement_documents()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can initialize placement documents for every student.';
  end if;

  insert into public.student_placement_documents (student_id, requirement_id, status)
  select s.id, r.id, 'not_reviewed'
  from public.students s
  cross join public.placement_document_requirements r
  where s.is_active and r.is_active
  on conflict (student_id, requirement_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.initialize_all_placement_documents() is
  'Backfills every active student with every active requirement. Safe to call repeatedly.';

revoke all on function public.initialize_student_placement_documents(uuid) from public, anon;
revoke all on function public.initialize_all_placement_documents() from public, anon;
grant execute on function public.initialize_student_placement_documents(uuid) to authenticated;
grant execute on function public.initialize_all_placement_documents() to authenticated;

-- Every student created from now on gets the current checklist automatically.
create or replace function public.students_initialize_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active then
    perform public.initialize_student_placement_documents(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists students_initialize_documents on public.students;
create trigger students_initialize_documents
  after insert on public.students
  for each row execute function public.students_initialize_documents();

-- A requirement added or reactivated later reaches existing students the same
-- way, with no duplicates and no client-side loop.
create or replace function public.requirements_backfill_students()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.student_placement_documents (student_id, requirement_id, status)
  select s.id, new.id, 'not_reviewed'
  from public.students s
  where s.is_active
  on conflict (student_id, requirement_id) do nothing;

  return new;
end;
$$;

drop trigger if exists placement_document_requirements_backfill
  on public.placement_document_requirements;
create trigger placement_document_requirements_backfill
  after insert or update of is_active on public.placement_document_requirements
  for each row
  when (new.is_active)
  execute function public.requirements_backfill_students();

-- ---------------------------------------------------------------------------
-- Seed the initial 13 requirements
--
-- TB is deliberately one requirement. Step 1, Step 2, and an X-ray report are
-- all handled through the single TB row and its note.
-- ---------------------------------------------------------------------------

insert into public.placement_document_requirements
  (name, short_name, description, is_required, is_active, sort_order)
values
  ('Serology Report', 'Serology', null, true, true, 10),
  ('Immunization Record', 'Immunization', null, true, true, 20),
  ('Pre-Placement Health Form', 'Health Form', null, true, true, 30),
  ('Blood Report', 'Blood', null, true, true, 40),
  ('TB Test Report', 'TB Test',
   'Covers Step 1, Step 2, or an X-ray report where applicable. Use the note to record which one was accepted.',
   true, true, 50),
  ('COVID-19 Vaccination Report', 'COVID-19', null, true, true, 60),
  ('Standard First Aid & CPR Certificate - Level C', 'First Aid & CPR', null, true, true, 70),
  ('N95 Mask Fit Certificate', 'Mask Fit', null, true, true, 80),
  ('Vulnerable Sector Police Check Certificate', 'Police Check', null, true, true, 90),
  ('WHMIS Certificate', 'WHMIS', null, true, true, 100),
  ('AODA Certificate', 'AODA', null, true, true, 110),
  ('BLS Certificate', 'BLS', null, true, true, 120),
  ('GPA Certificate', 'GPA', null, true, true, 130)
on conflict do nothing;

-- Give every existing student the checklist. The unique constraint makes this
-- safe on a database that has already been through this migration once.
select public.initialize_all_placement_documents();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.placement_document_requirements enable row level security;
alter table public.student_placement_documents enable row level security;

-- placement_document_requirements -------------------------------------------

drop policy if exists "staff read document requirements"
  on public.placement_document_requirements;
create policy "staff read document requirements"
  on public.placement_document_requirements for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "admin insert document requirements"
  on public.placement_document_requirements;
create policy "admin insert document requirements"
  on public.placement_document_requirements for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admin update document requirements"
  on public.placement_document_requirements;
create policy "admin update document requirements"
  on public.placement_document_requirements for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No delete policy. Requirements are archived through is_active.

-- student_placement_documents ------------------------------------------------

drop policy if exists "staff read student documents"
  on public.student_placement_documents;
create policy "staff read student documents"
  on public.student_placement_documents for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "placement staff insert student documents"
  on public.student_placement_documents;
create policy "placement staff insert student documents"
  on public.student_placement_documents for insert
  to authenticated
  with check (public.can_manage_documents());

drop policy if exists "placement staff update student documents"
  on public.student_placement_documents;
create policy "placement staff update student documents"
  on public.student_placement_documents for update
  to authenticated
  using (public.can_manage_documents())
  with check (public.can_manage_documents());

-- No delete policy. A checklist row is reset, never removed.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on public.placement_document_requirements from anon;
revoke all on public.student_placement_documents from anon;
revoke all on public.student_document_readiness from anon;

grant select, insert, update on public.placement_document_requirements to authenticated;
grant select, insert, update on public.student_placement_documents to authenticated;
grant select on public.student_document_readiness to authenticated;

-- ---------------------------------------------------------------------------
-- Private storage
--
-- placement-documents holds medical and police-check scans. It is private, it
-- has no public URL, and every read goes through a short lived signed URL
-- created server side for an authenticated staff member.
--
-- Wrapped in an exception block because creating policies on storage.objects
-- needs privileges that a restricted SQL role may not hold. If this block warns,
-- create the bucket in the Storage dashboard (private, 15 MB, PDF/JPEG/PNG) and
-- add the four policies below by hand.
-- ---------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'placement-documents',
    'placement-documents',
    false,
    15728640, -- 15 MB
    array['application/pdf', 'image/jpeg', 'image/png']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "staff read placement document files" on storage.objects;
  create policy "staff read placement document files"
    on storage.objects for select
    to authenticated
    using (bucket_id = 'placement-documents' and public.is_active_staff());

  drop policy if exists "placement staff upload placement document files" on storage.objects;
  create policy "placement staff upload placement document files"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'placement-documents' and public.can_manage_documents());

  drop policy if exists "placement staff update placement document files" on storage.objects;
  create policy "placement staff update placement document files"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'placement-documents' and public.can_manage_documents())
    with check (bucket_id = 'placement-documents' and public.can_manage_documents());

  drop policy if exists "placement staff delete placement document files" on storage.objects;
  create policy "placement staff delete placement document files"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'placement-documents' and public.can_manage_documents());
exception
  when others then
    raise warning
      'Could not configure the placement-documents storage bucket from SQL (%). Create it in the Supabase Storage dashboard as a PRIVATE bucket with a 15 MB limit and PDF/JPEG/PNG only, then add the storage policies from this migration.',
      sqlerrm;
end;
$$;
