-- PLACEMENT-07B.1 - Batch Document Grid
--
--   students.class_session   the student's class / session WITHIN a batch:
--                            morning, evening, or null for Not Set
--
-- This migration is purely ADDITIVE. It adds one nullable text column to
-- public.students with a CHECK constraint and a comment, and nothing else. It
-- does not touch batches, student notes, document requirements, the checklist,
-- the readiness view, student placements, partners, areas, the email log, or
-- email settings, and it rewrites nothing from 0001 through 0010. It is safe
-- to apply once to the live database.
--
-- ---------------------------------------------------------------------------
-- Why a student-level field, and not batches.schedule_label
-- ---------------------------------------------------------------------------
--
-- A batch is NOT purely Morning or purely Evening. The August batch holds
-- Morning students and Evening students; so does September. The batch's
-- schedule_label is a free-text description of the batch as a whole and
-- cannot say which session an individual student attends, so the Batch
-- Document Grid needs one small field on the student.
--
-- ---------------------------------------------------------------------------
-- What this migration deliberately does NOT do
-- ---------------------------------------------------------------------------
--
--   * No existing student is inferred, derived, or updated. Every student
--     starts as null (Not Set) and staff choose Morning or Evening on purpose.
--   * Nothing is derived from batches.schedule_label, now or by trigger.
--   * No default other than null, no index, no trigger, no policy.
--
-- ---------------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------------
--
-- No new policy and no new role. The column lives on public.students, so the
-- existing 0001 policies apply exactly as they do to every other student
-- field: any active staff member may read it and any active staff member may
-- change it. The 0006 placement guard is untouched: it watches
-- placement_status and the hold columns only, so saving a session never
-- counts as a placement change.
-- ---------------------------------------------------------------------------

alter table public.students
  add column if not exists class_session text null;

alter table public.students
  drop constraint if exists students_class_session_check;

alter table public.students
  add constraint students_class_session_check
  check (class_session is null or class_session in ('morning', 'evening'));

comment on column public.students.class_session is
  'This identifies the student''s class/session within a batch. A single batch may contain both Morning and Evening students. Allowed values: morning, evening. Null means Not Set. Never inferred from batches.schedule_label and never backfilled automatically.';
