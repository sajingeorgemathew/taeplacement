-- PLACEMENT-02 (revision) - Student Final Placement Package
--
-- Corrects the placement document workflow to match how placement is actually
-- run.
--
-- The 13 placement requirements are a READINESS CHECKLIST. Staff mark a status
-- per requirement; they do not upload a separate Serology / VSC / TB / CPR file
-- into TAE Placement. When the documents are ready, an admin merges them into
-- ONE PDF outside this application and uploads that single merged file as the
-- student's Final Placement Package.
--
--   individual requirements -> staff mark each status
--                           -> admin merges the documents externally
--                           -> admin uploads one merged PDF
--
-- This migration is purely additive and safe on a database that has already had
-- 0002_placement_documents.sql applied. It does not touch students, batches,
-- notes, profiles, requirements, or any existing checklist row.
--
-- Readiness is unchanged: it is still derived only from the 13 requirement
-- statuses. The final package is optional and never affects readiness.

-- ---------------------------------------------------------------------------
-- student_placement_packages
--
-- One current merged PDF per student. Unique on student_id, so replacing a
-- package is an upsert rather than a growing pile of rows. There is no version
-- history: replacing the package supersedes the previous one.
-- ---------------------------------------------------------------------------

create table if not exists public.student_placement_packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique
    references public.students (id) on delete cascade,
  file_path text not null,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  uploaded_by uuid references public.profiles (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.student_placement_packages is
  'One current merged placement PDF per student, prepared externally by an admin. Optional, and never part of the readiness calculation.';
comment on column public.student_placement_packages.file_path is
  'Object path inside the private placement-documents bucket: students/{student_id}/final-package/{uuid}.pdf. Never a public URL, never a student name.';
comment on column public.student_placement_packages.uploaded_at is
  'When the current package was uploaded. A replacement resets this.';

drop trigger if exists student_placement_packages_set_updated_at
  on public.student_placement_packages;
create trigger student_placement_packages_set_updated_at
  before update on public.student_placement_packages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Retire the per-document file columns
--
-- The application no longer reads or writes these. They are LEFT IN PLACE
-- rather than dropped, because dropping them on the development database would
-- destroy the reference to any file already uploaded during PLACEMENT-02
-- testing and orphan the stored object.
--
-- To clean up later, once the bucket has been checked for objects under
-- students/{student_id}/{requirement_id}/:
--
--   alter table public.student_placement_documents
--     drop column file_path,
--     drop column original_file_name,
--     drop column mime_type,
--     drop column file_size_bytes;
-- ---------------------------------------------------------------------------

comment on column public.student_placement_documents.file_path is
  'DEPRECATED. Per-requirement uploads were removed; the application never writes this. Use student_placement_packages for the merged PDF.';
comment on column public.student_placement_documents.original_file_name is
  'DEPRECATED. See student_placement_documents.file_path.';
comment on column public.student_placement_documents.mime_type is
  'DEPRECATED. See student_placement_documents.file_path.';
comment on column public.student_placement_documents.file_size_bytes is
  'DEPRECATED. See student_placement_documents.file_path.';

comment on table public.student_placement_documents is
  'Placement document readiness checklist per student: status, request and received markers, and one short internal note. No files are stored per requirement.';

-- ---------------------------------------------------------------------------
-- student_document_readiness
--
-- Rebuilt to drop file_count, which counted per-requirement uploads that no
-- longer exist. Everything else is the definition from 0002 unchanged:
-- readiness is still every ACTIVE REQUIRED requirement whose status is
-- received or not_applicable, and the final package is deliberately absent
-- from it.
--
-- drop + create rather than create or replace, because a replace cannot remove
-- a column. The view holds no data, so rebuilding it loses nothing.
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
  count(*) filter (where d.status <> 'not_reviewed')::integer as reviewed_count
from public.students s
cross join totals t
left join (
  -- Only rows for requirements that are still active are counted at all.
  select doc.student_id, doc.status, req.is_required
  from public.student_placement_documents doc
  join public.placement_document_requirements req
    on req.id = doc.requirement_id
   and req.is_active
) d on d.student_id = s.id
group by s.id, t.required_total, t.active_total;

comment on view public.student_document_readiness is
  'Derived placement document readiness per student, from the requirement statuses only. The denominator is every active required requirement. The final placement package is not part of readiness.';

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Same boundary as the checklist. Every active staff member may read a
-- student's package; only admin and placement_manager may upload, replace, or
-- remove one, through public.can_manage_documents().
-- ---------------------------------------------------------------------------

alter table public.student_placement_packages enable row level security;

drop policy if exists "staff read placement packages"
  on public.student_placement_packages;
create policy "staff read placement packages"
  on public.student_placement_packages for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "placement staff insert placement packages"
  on public.student_placement_packages;
create policy "placement staff insert placement packages"
  on public.student_placement_packages for insert
  to authenticated
  with check (public.can_manage_documents());

drop policy if exists "placement staff update placement packages"
  on public.student_placement_packages;
create policy "placement staff update placement packages"
  on public.student_placement_packages for update
  to authenticated
  using (public.can_manage_documents())
  with check (public.can_manage_documents());

-- Unlike a checklist row, a package IS removable: Remove takes the merged PDF
-- back out so a superseded package is never left standing.
drop policy if exists "placement staff delete placement packages"
  on public.student_placement_packages;
create policy "placement staff delete placement packages"
  on public.student_placement_packages for delete
  to authenticated
  using (public.can_manage_documents());

revoke all on public.student_placement_packages from anon;
grant select, insert, update, delete on public.student_placement_packages
  to authenticated;

-- Re-grant the rebuilt view.
revoke all on public.student_document_readiness from anon;
grant select on public.student_document_readiness to authenticated;

-- ---------------------------------------------------------------------------
-- Private storage
--
-- The existing placement-documents bucket is reused. Its policies are scoped to
-- the whole bucket, so students/{student_id}/final-package/ is already covered
-- and no new storage policy is needed.
--
-- The file size limit is raised from 15 MB to 25 MB: one merged PDF holding
-- thirteen scanned documents is routinely larger than any single scan was. The
-- bucket still allows JPEG and PNG, because it keeps serving the
-- per-requirement objects uploaded before this change; the application itself
-- now accepts PDF only, and only for the merged package.
--
-- Wrapped, like 0002, because writing to the storage schema needs privileges a
-- restricted SQL role may not hold.
-- ---------------------------------------------------------------------------

do $$
begin
  update storage.buckets
     set public = false,
         file_size_limit = 26214400 -- 25 MB
   where id = 'placement-documents';

  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'placement-documents',
      'placement-documents',
      false,
      26214400,
      array['application/pdf', 'image/jpeg', 'image/png']
    );
  end if;
exception
  when others then
    raise warning
      'Could not raise the placement-documents bucket limit from SQL (%). Set the limit to 25 MB on the private placement-documents bucket in the Supabase Storage dashboard.',
      sqlerrm;
end;
$$;
