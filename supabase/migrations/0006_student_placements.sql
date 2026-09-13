-- PLACEMENT-04 - Student Placement Assignment and the Placement Board
--
-- Connects the two primary records: a STUDENT is placed at a PLACEMENT PARTNER.
--
--   student_placements                   the real Student <-> Partner relationship
--   students.placement_hold_reason       why a student is paused
--   students.placement_hold_at           when the pause started
--   can_manage_placements()              admin + placement_manager
--   finish_student_placement()           the controlled end of one placement
--
-- Two DIFFERENT completions live here and are never conflated:
--
--   student_placements.status = completed   THIS placement segment finished
--   students.placement_status = placement_completed
--                                           the student's WHOLE placement
--                                           requirement is finished
--
-- A student may do part of their placement at one partner and the rest at
-- another. Ending a placement is therefore not the same as finishing placement,
-- and moving a student is not a cancellation.
--
-- A placement also has two completely different endings, and they are reached
-- from two different statuses:
--
--   assigned -> cancelled     the assignment never meaningfully started.
--                             An ordinary UPDATE under RLS. No hours, no
--                             outcome, and never a completed requirement.
--   started  -> completed     the student actually participated here and the
--            -> ended_early   segment is now ending. finish_student_placement()
--                             only, because that is the one that also has to
--                             answer "does this finish the requirement".
--
-- started -> cancelled is not an ordinary operation and the application never
-- offers it: a student who attended was not "cancelled". The CHECK constraint
-- still permits the value so a mis-entered record can be corrected in SQL.
--
-- Everything here is ADDITIVE. 0001 through 0005 are never rewritten, no
-- existing column is dropped, renamed, or retyped, and nothing re-imports or
-- re-derives students or partners. It is safe to apply once to the live
-- database that already holds the imported students and partners.
--
-- students.placement_status stays the ONE high-level student placement summary.
-- This migration does not add a second competing summary field. It only makes
-- that column follow the facts:
--
--   * document readiness informs it while a student is still PRE-placement
--   * a placement record moves it once one exists
--   * an assigned, started, completed, or on-hold student is never dragged
--     backwards by a document change
--   * a student whose placement ENDS without finishing their requirement goes
--     back to that document-derived status, ready to be placed again
--
-- Deliberately NOT here: daily attendance, timesheets, check-ins, hour-entry
-- logs, evaluations, employer signoff, capacity, slots, reminders, and
-- geographic matching. Those are PLACEMENT-05 and later. credited_hours is a
-- single accepted total, not the beginning of an hours system.

-- ---------------------------------------------------------------------------
-- Access helper
--
-- Reading placement information is open to every active staff member, including
-- management. Assigning a student, finishing a placement, changing planned
-- dates, and putting a student on or off hold are limited to the two roles that
-- actually run placement, exactly like can_manage_partners() in 0004.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_placements()
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

comment on function public.can_manage_placements() is
  'Who may assign placements, finish them, change planned dates, and hold or release a student. admin and placement_manager. management reads only.';

revoke all on function public.can_manage_placements() from public, anon;
grant execute on function public.can_manage_placements() to authenticated;

-- ---------------------------------------------------------------------------
-- students placement hold
--
-- A hold is a deliberate pause: the student is not being matched right now, and
-- the reason is one short line, not a history. Releasing a hold is an explicit
-- staff action, never a side effect of a document or placement change.
-- ---------------------------------------------------------------------------

alter table public.students
  add column if not exists placement_hold_reason text,
  add column if not exists placement_hold_at timestamptz;

comment on column public.students.placement_hold_reason is
  'Short optional reason a student is On Hold. Never required. Cleared when the hold is released.';
comment on column public.students.placement_hold_at is
  'When the current hold started. Set with placement_status = on_hold, cleared on release.';

-- ---------------------------------------------------------------------------
-- student_placements
--
-- One row per Student <-> Partner placement. A student may have MANY rows over
-- time, and none of them is ever deleted: a cancelled placement is history, not
-- a mistake to erase.
--
--   assigned      matched to a partner, not started yet
--   started       the student is on placement at this partner
--   completed     THIS placement segment finished successfully
--   ended_early   the student really worked here, but the placement ended
--                 before its expected completion. They may continue elsewhere.
--   cancelled     the assignment was withdrawn before any meaningful placement
--                 happened. Kept forever.
--
-- assigned and started are ACTIVE. completed, ended_early, and cancelled are
-- HISTORICAL and stay permanently visible.
--
-- ended_early is the important one. A student who does 120 hours at one LTC and
-- then moves to another has not had a cancelled placement: they had a real one
-- that ended early. Cancellation is only for an assignment that never
-- meaningfully proceeded.
--
-- credited_hours is the final number of hours staff ACCEPT for this segment. It
-- is one number entered once, not a log. There is no timesheet, no attendance,
-- and no hour-entry history here: that is PLACEMENT-05.
--
-- Every date is nullable. Staff are never forced to invent a planned start date
-- to record a real assignment.
-- ---------------------------------------------------------------------------

create table if not exists public.student_placements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references public.students (id) on delete restrict,
  partner_id uuid not null
    references public.placement_partners (id) on delete restrict,
  status text not null default 'assigned'
    check (status in (
      'assigned', 'started', 'completed', 'ended_early', 'cancelled'
    )),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id) on delete set null,
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  assignment_note text,
  credited_hours numeric(7, 2)
    check (credited_hours is null or credited_hours >= 0),
  completion_note text,
  end_reason text,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.student_placements is
  'The real Student <-> Placement Partner relationship. One row per placement SEGMENT. Many historical rows per student, at most one active (assigned or started). Rows are ended, never deleted.';
comment on column public.student_placements.status is
  'assigned, started, completed, ended_early, or cancelled. assigned and started are the ACTIVE states and only one of them may exist per student at a time. This is the status of THIS segment and is never the student overall placement requirement, which is students.placement_status.';
comment on column public.student_placements.partner_id is
  'on delete restrict: a partner with placement history can never be removed out from under it. Partners are archived, not deleted, and so are students.';
comment on column public.student_placements.assigned_by is
  'The staff member who made the assignment. Kept as an audit fact even after the record is cancelled.';
comment on column public.student_placements.planned_start_date is
  'Optional planned start. A DATE, because a start is a day and must never shift across a timezone.';
comment on column public.student_placements.actual_start_date is
  'The day the student actually began at this partner. Set by the minimal Start Placement transition, and present so a historical placement can also be recorded by hand. Everything that happens DURING a placement - attendance, check-ins, hour logs - is still PLACEMENT-05.';
comment on column public.student_placements.assignment_note is
  'One short note about THIS assignment. Not a second notes system: student context stays in student_notes and partner context in placement_partner_notes.';
comment on column public.student_placements.actual_end_date is
  'The day this placement segment actually ended. Captured by Finish Placement for completed and ended_early.';
comment on column public.student_placements.credited_hours is
  'The final number of placement hours staff ACCEPT for this segment. One number, entered once. Not a timesheet and not an attendance log: PLACEMENT-05 owns those. Null when nobody has credited any, and always null on a cancelled row.';
comment on column public.student_placements.completion_note is
  'The Completion / Transfer note for a completed or ended_early segment. Why it finished, or where the student went next.';
comment on column public.student_placements.end_reason is
  'Short reason an ended_early segment stopped before its expected completion. Only ever set on ended_early: a cancellation uses cancellation_reason.';
comment on column public.student_placements.cancellation_reason is
  'Optional reason the assignment was withdrawn BEFORE any meaningful placement happened. Never used for a transfer: that is ended_early with an end_reason.';

-- ---------------------------------------------------------------------------
-- At most ONE current active placement per student
--
-- A partial unique index, so a student may accumulate any number of completed,
-- ended_early, and cancelled rows while the database still refuses a second
-- assigned or started row. That is exactly what lets a student finish part of
-- their placement at one partner and continue at another.
--
-- This is the constraint, not an application convention: no server
-- action, drag gesture, or concurrent request can create a double placement.
-- ---------------------------------------------------------------------------

create unique index if not exists student_placements_one_active_idx
  on public.student_placements (student_id)
  where status in ('assigned', 'started');

create index if not exists student_placements_student_idx
  on public.student_placements (student_id, assigned_at desc);
create index if not exists student_placements_partner_idx
  on public.student_placements (partner_id, status);
create index if not exists student_placements_status_idx
  on public.student_placements (status);

drop trigger if exists student_placements_set_updated_at
  on public.student_placements;
create trigger student_placements_set_updated_at
  before update on public.student_placements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Readiness mapping
--
-- The single definition of "what should a PRE-placement student's high-level
-- status be, given their documents". students.document_status is itself derived
-- from the detailed checklist by sync_student_document_status() in 0002, so the
-- 13-document rules live in exactly one place and are never re-implemented.
-- ---------------------------------------------------------------------------

create or replace function public.placement_status_for_documents(
  p_document_status text
)
returns text
language sql
immutable
as $$
  select case p_document_status
    when 'ready' then 'ready_for_placement'
    when 'pending' then 'documents_pending'
    else 'needs_review'
  end;
$$;

comment on function public.placement_status_for_documents(text) is
  'not_reviewed -> needs_review, pending -> documents_pending, ready -> ready_for_placement. Only meaningful for a student with no placement record.';

-- The statuses a student may be moved out of automatically. Anything else is a
-- real placement fact or a deliberate staff decision and is left alone.
create or replace function public.is_pre_placement_status(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in (
    'needs_review', 'documents_pending', 'ready_for_placement'
  );
$$;

/**
 * What a student's high-level status should be RIGHT NOW.
 *
 * A live placement record always wins over the document mapping: an assigned or
 * started student is assigned or started whatever their checklist says. Only a
 * student with no active placement falls back to document readiness.
 */
create or replace function public.resolve_student_placement_status(
  p_student_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active text;
  v_documents text;
begin
  select p.status into v_active
  from public.student_placements p
  where p.student_id = p_student_id
    and p.status in ('assigned', 'started')
  limit 1;

  if v_active = 'assigned' then return 'placement_assigned'; end if;
  if v_active = 'started' then return 'placement_started'; end if;

  select s.document_status into v_documents
  from public.students s
  where s.id = p_student_id;

  if v_documents is null then return null; end if;
  return public.placement_status_for_documents(v_documents);
end;
$$;

-- Deliberately NOT granted to authenticated. It is called from the triggers and
-- from release_student_placement_hold(), all of which are SECURITY DEFINER and
-- therefore run as the owner. Nothing in the application needs to ask the
-- database this question directly.
revoke all on function public.resolve_student_placement_status(uuid)
  from public, anon, authenticated;

/**
 * Write the resolved status onto the student.
 *
 * Two guards, both deliberate:
 *
 *   on_hold        is NEVER left automatically. A hold is released by a staff
 *                  action, not by a document edit or a cancelled assignment.
 *   p_force        false is the safe automatic path: it only ever moves a
 *                  student who is still PRE-placement, so a document edit can
 *                  never drag a placed student backwards. Finishing a placement
 *                  passes true, because that IS the deliberate staff action
 *                  that ends it and frees the student to be placed again.
 *
 * p_force does NOT excuse a hold, and it is never handed to the application.
 * Its only callers are the placement trigger, which refuses to force a student
 * who is already placement_completed, and finish_student_placement(), which
 * only reaches it when staff have said this is NOT the end of the requirement.
 */
create or replace function public.refresh_student_placement_status(
  p_student_id uuid,
  p_force boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_next text;
begin
  select s.placement_status into v_current
  from public.students s
  where s.id = p_student_id;

  if v_current is null then return null; end if;
  if v_current = 'on_hold' then return v_current; end if;
  if not p_force and not public.is_pre_placement_status(v_current) then
    return v_current;
  end if;

  v_next := public.resolve_student_placement_status(p_student_id);
  if v_next is null or v_next = v_current then return v_current; end if;

  update public.students
     set placement_status = v_next
   where id = p_student_id;

  return v_next;
end;
$$;

-- Deliberately NOT granted to authenticated either, and for a sharper reason:
-- p_force => true on a COMPLETED student with no active placement would drag
-- them back to their document-derived status. Only the cancellation trigger is
-- allowed to force a refresh, and it runs as the owner.
revoke all on function public.refresh_student_placement_status(uuid, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The students guard
--
-- One BEFORE trigger doing two things, in this order:
--
--   1. AUTHORITY. Setting or changing placement_status or the hold columns by
--      hand is limited to admin and placement_manager. The students INSERT and
--      UPDATE policies from 0001 are open to every active staff member and 0001
--      is not rewritten, so this trigger is what keeps management read-only over
--      placement state. It only fires for a REAL change, so management adding a
--      student or editing a phone number passes untouched.
--
--      auth.uid() IS NULL means this is not a PostgREST request: a migration, a
--      psql session, or the service role, all of which already bypass RLS. Those
--      are not gated here.
--
--   2. READINESS. When document_status changes and the caller did not set a
--      placement_status of their own, a PRE-placement student follows their
--      documents. An assigned, started, completed, or on-hold student is left
--      exactly where they are: a document edit must never regress a student who
--      already has a placement.
--
-- Doing it in a BEFORE trigger rather than as a second UPDATE statement means
-- there is no recursion and no extra write.
-- ---------------------------------------------------------------------------

create or replace function public.students_placement_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if tg_op = 'INSERT' then
    -- A new student starts PRE-placement. Creating one already assigned, on
    -- hold, or completed is a placement decision, not data entry.
    v_changed :=
      not public.is_pre_placement_status(new.placement_status)
      or new.placement_hold_reason is not null
      or new.placement_hold_at is not null;
  else
    v_changed :=
      new.placement_status is distinct from old.placement_status
      or new.placement_hold_reason is distinct from old.placement_hold_reason
      or new.placement_hold_at is distinct from old.placement_hold_at;
  end if;

  if v_changed
     and auth.uid() is not null
     and not public.can_manage_placements()
  then
    raise exception
      'Only an admin or a placement manager may change a student placement status.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.document_status is distinct from old.document_status
     and new.placement_status is not distinct from old.placement_status
     and public.is_pre_placement_status(old.placement_status)
  then
    new.placement_status :=
      public.placement_status_for_documents(new.document_status);
  end if;

  return new;
end;
$$;

drop trigger if exists students_placement_guard on public.students;
create trigger students_placement_guard
  before insert or update on public.students
  for each row execute function public.students_placement_guard();

-- ---------------------------------------------------------------------------
-- Placement records drive the student summary
--
-- The application inserts and updates student_placements; students
-- .placement_status follows from the database, so it can never drift out of
-- step with the real relationship.
--
--   assigned     -> placement_assigned, and any hold is released, because
--                   assigning a partner IS the decision to stop holding
--   started      -> placement_started
--   completed    -> the student goes back to their PRE-placement status, so
--   ended_early     another placement can be assigned
--   cancelled       (this is the whole of what cancelling has to do: the
--                   application writes the cancelled row and the student
--                   follows from here)
--
-- Note what the terminal branch deliberately does NOT do: it never sets
-- placement_completed. Finishing a placement at one partner is not the same as
-- finishing the placement REQUIREMENT, and only a staff member can say which
-- of the two just happened. finish_student_placement() below asks them, and
-- writes placement_completed itself when the answer is yes.
--
-- A student who is ALREADY placement_completed is left alone: that answer was a
-- deliberate staff decision and no later edit to a history row may undo it.
-- ---------------------------------------------------------------------------

create or replace function public.student_placements_sync_student_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_current text;
begin
  -- NEW does not exist on a DELETE, so it is never touched on that branch.
  if tg_op = 'DELETE' then
    v_student := old.student_id;
  else
    v_student := new.student_id;
  end if;

  if tg_op <> 'DELETE' and new.status in ('assigned', 'started') then
    update public.students
       set placement_status = case new.status
             when 'assigned' then 'placement_assigned'
             else 'placement_started'
           end,
           -- A live placement and a hold are contradictory states, so
           -- assigning a partner is also what releases a hold.
           placement_hold_reason = null,
           placement_hold_at = null
     where id = v_student;

    return new;
  end if;

  -- completed, ended_early, cancelled, or the row went away entirely.
  select s.placement_status into v_current
  from public.students s
  where s.id = v_student;

  if v_current is distinct from 'placement_completed' then
    -- Forced, because a staff member deliberately ended this placement. The
    -- student returns to the column their documents put them in, ready to be
    -- placed somewhere else.
    perform public.refresh_student_placement_status(v_student, true);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists student_placements_sync_student_status
  on public.student_placements;
create trigger student_placements_sync_student_status
  after insert or update of status or delete on public.student_placements
  for each row execute function public.student_placements_sync_student_status();

/**
 * Release a hold, correctly.
 *
 * "Off hold" is never blindly "Ready". Where the student goes is resolved from
 * the facts: their live placement record if they still have one, otherwise
 * their current document readiness. One statement, so the status and the hold
 * columns can never disagree.
 *
 * SECURITY DEFINER, but the authority check is explicit: the students guard
 * trigger would refuse this write for anyone else anyway, and failing here says
 * so in plain language instead.
 */
create or replace function public.release_student_placement_hold(
  p_student_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next text;
begin
  if not public.can_manage_placements() then
    raise exception
      'Only an admin or a placement manager may release a placement hold.'
      using errcode = '42501';
  end if;

  v_next := public.resolve_student_placement_status(p_student_id);
  if v_next is null then return null; end if;

  update public.students
     set placement_status = v_next,
         placement_hold_reason = null,
         placement_hold_at = null
   where id = p_student_id;

  return v_next;
end;
$$;

revoke all on function public.release_student_placement_hold(uuid)
  from public, anon;
grant execute on function public.release_student_placement_hold(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The ending fields always match the status
--
-- The status column is CHECK constrained, but the fields AROUND it have to stay
-- honest too, or a row ends up saying two things at once: a cancelled placement
-- with credited hours on it, or a live placement still carrying last month's
-- transfer note.
--
--   cancelled            the assignment never meaningfully started, so it is
--                        stamped with when and carries no credited hours, no
--                        completion note, and no end_reason. The reason it was
--                        cancelled is cancellation_reason.
--   completed            a real ending, after a real placement.
--   ended_early          cancellation_reason cannot apply to either.
--   assigned / started   an ACTIVE placement has not ended, so every ending
--                        field is cleared. Starting a placement therefore
--                        clears nothing it should keep.
-- ---------------------------------------------------------------------------

create or replace function public.student_placements_stamp_ending()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled' then
    if new.cancelled_at is null then new.cancelled_at := now(); end if;
    new.credited_hours := null;
    new.completion_note := null;
    new.end_reason := null;

  elsif new.status in ('completed', 'ended_early') then
    new.cancelled_at := null;
    new.cancellation_reason := null;
    -- end_reason is the reason an ended_early segment stopped. A completed
    -- segment did not stop early, so it has no such reason.
    if new.status = 'completed' then new.end_reason := null; end if;

  else
    -- assigned or started. Moving a row back out of a historical status is not
    -- a normal operation, but if a caller does it the stale ending must not be
    -- left behind.
    new.cancelled_at := null;
    new.cancellation_reason := null;
    new.completion_note := null;
    new.end_reason := null;
    new.credited_hours := null;
    new.actual_end_date := null;
  end if;

  return new;
end;
$$;

drop trigger if exists student_placements_stamp_cancelled
  on public.student_placements;
drop trigger if exists student_placements_stamp_ending
  on public.student_placements;
create trigger student_placements_stamp_ending
  before insert or update on public.student_placements
  for each row execute function public.student_placements_stamp_ending();

-- Placement history is never removed. There is no DELETE policy below either,
-- so the API cannot delete a row; this refuses it at the table itself.
create or replace function public.prevent_delete_student_placement()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Placement records are history and are never deleted. Finish the placement instead.';
  return old;
end;
$$;

drop trigger if exists student_placements_prevent_delete
  on public.student_placements;
create trigger student_placements_prevent_delete
  before delete on public.student_placements
  for each row execute function public.prevent_delete_student_placement();

-- ---------------------------------------------------------------------------
-- Finish one STARTED placement
--
-- Finishing is for a placement the student actually participated in, so this
-- function only ever acts on a started row. An assignment that never began is
-- cancelled instead, which is an ordinary UPDATE and asks none of the questions
-- below.
--
-- Two decisions, and only a staff member can make the second one:
--
--   1. what happened to THIS placement    completed / ended_early
--   2. does that finish the student's WHOLE placement requirement
--
-- Answering yes to the second sets students.placement_status =
-- placement_completed. Answering no sends the student back to the pre-placement
-- status their documents put them in, so another placement can be assigned at
-- another partner. That is the whole point: a student may do 120 hours at one
-- LTC, end early, and complete the remaining 180 somewhere else.
--
-- Both writes happen in one function, so a placement can never be ended without
-- the student summary following it.
-- ---------------------------------------------------------------------------

create or replace function public.finish_student_placement(
  p_placement_id uuid,
  p_status text,
  p_actual_end_date date default null,
  p_credited_hours numeric default null,
  p_completion_note text default null,
  p_end_reason text default null,
  p_completes_requirement boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_current text;
begin
  if not public.can_manage_placements() then
    raise exception
      'Only an admin or a placement manager may finish a placement.'
      using errcode = '42501';
  end if;

  if p_status not in ('completed', 'ended_early') then
    raise exception
      'A placement is finished as completed or ended_early. An assignment that never began is cancelled instead.'
      using errcode = '22023';
  end if;

  select p.student_id, p.status into v_student, v_current
  from public.student_placements p
  where p.id = p_placement_id
  for update;

  if v_student is null then
    raise exception 'That placement record no longer exists.'
      using errcode = 'P0002';
  end if;

  if v_current = 'assigned' then
    raise exception
      'That placement has not started, so there is nothing to finish. Cancel the assignment instead.'
      using errcode = '22023';
  end if;

  if v_current <> 'started' then
    raise exception 'That placement has already been finished.'
      using errcode = '22023';
  end if;

  -- end_reason is only meaningful on an ended_early segment. A completed one
  -- did not stop early, so it has no such reason, and the stamp trigger clears
  -- it either way.
  update public.student_placements
     set status = p_status,
         actual_end_date = p_actual_end_date,
         credited_hours = p_credited_hours,
         completion_note = p_completion_note,
         end_reason =
           case when p_status = 'ended_early' then p_end_reason end
   where id = p_placement_id;

  if p_completes_requirement then
    update public.students
       set placement_status = 'placement_completed',
           placement_hold_reason = null,
           placement_hold_at = null
     where id = v_student;

    return 'placement_completed';
  end if;

  -- Not the whole requirement. Forced, because a staff member deliberately
  -- ended this placement, and the student is now available to be placed again.
  return public.refresh_student_placement_status(v_student, true);
end;
$$;

comment on function public.finish_student_placement(
  uuid, text, date, numeric, text, text, boolean
) is
  'Ends one STARTED placement segment as completed or ended_early, and moves the student to the right place: placement_completed when this finishes their whole requirement, otherwise back to their document-derived pre-placement status so another placement can be assigned. An assignment that never began is cancelled instead, not finished.';

revoke all on function public.finish_student_placement(
  uuid, text, date, numeric, text, text, boolean
) from public, anon;
grant execute on function public.finish_student_placement(
  uuid, text, date, numeric, text, text, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- One-time safe synchronisation of existing students
--
-- Only students who are still PRE-placement are touched, and only where the
-- mapped value actually differs. A student who is already placement_assigned,
-- placement_started, placement_completed, or on_hold is left exactly as staff
-- left them, so no historical or manually corrected record is regressed.
--
-- This guesses nothing: it creates no placement rows and infers no partner from
-- any previous spreadsheet. Historical placements are entered by staff.
-- ---------------------------------------------------------------------------

update public.students s
   set placement_status =
         public.placement_status_for_documents(s.document_status)
 where public.is_pre_placement_status(s.placement_status)
   and s.placement_status is distinct from
       public.placement_status_for_documents(s.document_status);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- No policy below is granted to anon, so anonymous requests read and write
-- nothing.
--
--   every active staff member        read placement records
--   admin + placement_manager        create placements, update them, finish
--   management                       read only
--   nobody                           delete
-- ---------------------------------------------------------------------------

alter table public.student_placements enable row level security;

drop policy if exists "staff read student placements"
  on public.student_placements;
create policy "staff read student placements"
  on public.student_placements for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "placement staff insert student placements"
  on public.student_placements;
create policy "placement staff insert student placements"
  on public.student_placements for insert
  to authenticated
  with check (public.can_manage_placements());

drop policy if exists "placement staff update student placements"
  on public.student_placements;
create policy "placement staff update student placements"
  on public.student_placements for update
  to authenticated
  using (public.can_manage_placements())
  with check (public.can_manage_placements());

-- No delete policy. Placements are finished, never deleted.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on public.student_placements from anon;

grant select, insert, update on public.student_placements to authenticated;
