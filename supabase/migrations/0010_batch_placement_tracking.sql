-- PLACEMENT-07A - Program Operations & ECEA Support
--
--   batches.placement_tracking_enabled   whether a batch takes part in CURRENT
--                                        placement operations
--
-- This migration is purely ADDITIVE. It adds one boolean column to
-- public.batches with a comment and a small index, and nothing else. It does
-- not touch students, student notes, document requirements, the checklist,
-- student placements, placement history, partners, areas, city mappings, the
-- email log, or email settings, and it rewrites nothing from 0001 through 0009.
-- It is safe to apply once to the live database.
--
-- No row is deleted, archived, deactivated, or re-derived here. Every existing
-- batch simply receives the default, false, and every student attached to it
-- keeps exactly the status, activity, documents, and placements they had.
--
-- ---------------------------------------------------------------------------
-- What the flag is, and what it is not
-- ---------------------------------------------------------------------------
--
-- The academy now runs two program lanes, PSW and ECEA, through ONE placement
-- lifecycle. Older PSW batches (April, June) are still in the database and their
-- students are still active records with stale operational data. Nobody is
-- cleaning that up in this ticket, and nothing should be deleted to make the
-- dashboard honest.
--
-- Instead a batch says, explicitly, whether it belongs to today's placement
-- operations. The rule the application reads everywhere is:
--
--   a batch is IN current placement operations when
--     batches.status = 'active'
--     AND batches.placement_tracking_enabled = true
--
-- and a student is COUNTED in current placement operations when they are
-- is_active, attached to such a batch, grouped by their program.
--
-- This flag is an OPERATIONAL VISIBILITY switch and nothing more:
--
--   * it is NOT an archive. Archiving is batches.status = 'archived', which is
--     a statement that the intake is over. Tracking is a statement about what
--     the dashboard shows today. An active batch may be untracked; an archived
--     batch is never tracked regardless of this value.
--   * it is NOT a delete, a soft delete, or a cleanup. Untracked batches and
--     their students remain fully browsable on the Students page, the batch
--     page, the Placement List, and every student record.
--   * it is NOT a student status. It never reads or writes students.is_active,
--     students.placement_status, students.document_status, any placement
--     record, or any document record. Turning it on or off changes one boolean
--     on one batch row.
--
-- New batches default to false as well. Staff deliberately switch a batch on in
-- Batch Management when it is ready to be worked, and switch it off when its
-- students are no longer today's work.
--
-- ---------------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------------
--
-- No new policy and no new role. The column lives on public.batches, so the
-- existing 0001 policies apply exactly as they do to every other batch field:
-- any active staff member may read it, only an admin may change it.
-- ---------------------------------------------------------------------------

alter table public.batches
  add column if not exists placement_tracking_enabled boolean not null default false;

comment on column public.batches.placement_tracking_enabled is
  'Operational visibility flag: when true AND status = active, this batch is part of CURRENT placement operations and its active students appear in the program dashboard and operational program counts. It is not an archive, not a delete, and not a replacement for status. Toggling it never changes any student, placement, or document record. Defaults to false; staff enable it deliberately in Batch Management.';

-- The dashboard asks "which batches are tracked right now" on every load. The
-- table is tiny, so this is cheap either way; the index mostly documents the
-- one compound condition the application depends on.
create index if not exists batches_placement_tracking_idx
  on public.batches (status, placement_tracking_enabled);
