-- PLACEMENT-06A - Student Placement Document Email System
--
--   student_placement_documents.student_message   a STUDENT FACING note
--   student_email_log                             the permanent record of every
--                                                 outbound placement email
--
-- This migration is purely ADDITIVE. It adds one nullable column to an existing
-- table, creates one new table with its indexes, trigger, guard, and policies,
-- and nothing else. It does not touch students, batches, student notes,
-- document requirements, the existing checklist columns, placement packages,
-- placement areas, placement partners, partner contacts, partner notes, city
-- mappings, or student placements, and it rewrites nothing from 0001 through
-- 0007. It is safe to apply once to the live database.
--
-- It changes NO readiness rule, NO placement status, and NO trigger that
-- already exists. An email is an observation ABOUT the checklist; it never
-- moves the checklist. Nothing here sends anything: sending is deliberate and
-- staff-triggered, from the application.
--
-- ---------------------------------------------------------------------------
-- The privacy line this migration draws
-- ---------------------------------------------------------------------------
--
-- student_placement_documents already has ONE free text column, `note`. It is
-- where staff record things like "VSC applied, expected next week", "second
-- attempt failed", or a medical detail that explains a decision. That column is
-- INTERNAL. It was written on the understanding that no student would ever read
-- it, and this migration does not change that understanding.
--
-- So the student-facing text is a SEPARATE column, written on purpose, by a
-- staff member who knows it is going to the student:
--
--   note              internal. Staff only. Never leaves the application.
--   student_message   student facing. May appear in a placement document email.
--
-- Nothing is migrated from one to the other. Copying today's internal notes
-- into student_message would publish, in one statement, every sentence ever
-- typed in private about a student's documents. The new column starts null for
-- every row and stays null until a staff member types into it.

-- ---------------------------------------------------------------------------
-- student_placement_documents.student_message
--
-- Nullable, with no default and no backfill, for the reason above.
--
-- 500 characters, enforced HERE in the database rather than only in the form.
-- This is the one field on the row whose contents leave the building, so the
-- limit on it is a storage fact rather than a form convenience: a direct INSERT
-- or a future caller that skips the Zod schema is still refused.
--
-- 500 is room for a real instruction with a reason in it ("The certificate you
-- sent expired in June. Please complete the mask fit again and send the new
-- certificate; the clinic can usually do this the same week.") and still short
-- enough to be the wrong shape for a private staff comment. That is the point
-- of bounding it at all: a box that invites three paragraphs invites exactly
-- the commentary this column exists to keep out of a student's inbox.
--
-- For the avoidance of doubt: the INTERNAL note column has NO length constraint
-- in the database. 0002 created it as plain `note text`, and the 300 character
-- limit staff meet when typing one is enforced only by
-- DocumentNoteSchema in src/lib/documents/schema.ts. Nothing here changes that,
-- and the two fields are not kept to a shared number.
-- ---------------------------------------------------------------------------

alter table public.student_placement_documents
  add column if not exists student_message text;

alter table public.student_placement_documents
  drop constraint if exists student_placement_documents_student_message_length;
alter table public.student_placement_documents
  add constraint student_placement_documents_student_message_length
  check (student_message is null or length(student_message) <= 500);

comment on column public.student_placement_documents.student_message is
  'STUDENT FACING. A short staff-written line, at most 500 characters, that may be included in a placement document email. Never holds internal staff commentary: that is what note is for.';

-- Restated here because this column now has a second reader. The comment on
-- `note` from 0002 was about where discussion belongs; this one is about who
-- may see it.
comment on column public.student_placement_documents.note is
  'INTERNAL. Staff only. One short internal note. Never included in any email to a student, and never copied into student_message. Threaded discussion belongs in student_notes.';

-- ---------------------------------------------------------------------------
-- student_email_log
--
-- TAE Placement, not the Resend dashboard, is the permanent business record of
-- what the academy sent a student. Resend is the delivery provider and its
-- dashboard has a retention window; this table has none.
--
-- One row per STUDENT per SEND. A bulk reminder to 27 students writes 27 rows,
-- each with its own subject, its own rendered body, its own snapshot, its own
-- provider id, and its own delivery status. There is no row that means "a batch
-- was emailed", because there is no such thing as emailing a batch: there are
-- 27 individual emails that happened to be sent together, and send_group_id is
-- the only thing that records the "together".
--
-- content_snapshot is the point of the table. It stores the structured content
-- the system USED at send time, so history is never rebuilt from today's
-- checklist. A student whose VSC was Requested in April and Received in June
-- must still show April's email saying Requested. body_text and body_html sit
-- beside it so staff can read the exact words that were sent, rather than a
-- re-render of them.
--
-- content_snapshot deliberately does NOT contain note. See above.
--
-- The table is APPEND ONLY and only the SERVER may append. Ordinary
-- authenticated staff have SELECT and nothing else; rows are created and
-- advanced by the server only service role, after the application has
-- authenticated the staff member and checked can_manage_documents(). The Row
-- Level Security section at the bottom of this file explains why.
-- ---------------------------------------------------------------------------

-- Deliberately NOT "if not exists". This is a numbered migration applied once,
-- in order, and an unexpected pre-existing table means the schema is not in the
-- state this file assumes.
create table public.student_email_log (
  id uuid primary key default gen_random_uuid(),
  -- restrict, not cascade. Outbound history is permanent, and a student record
  -- is deactivated rather than deleted anyway. A cascade here would mean one
  -- delete could erase the only proof of what the academy told someone.
  student_id uuid not null references public.students (id) on delete restrict,
  email_type text not null check (
    email_type in ('document_status', 'document_reminder')
  ),
  -- The address the email was ACTUALLY sent to, normalized, as it was at send
  -- time. students.email may be corrected later; this must not move with it.
  recipient_email text not null check (length(btrim(recipient_email)) > 0),
  subject text not null,
  body_text text not null,
  body_html text not null,
  content_snapshot jsonb not null,
  -- Null until Resend accepts the send. Unique, so one provider email can never
  -- be claimed by two log rows: Postgres allows many nulls in a unique column,
  -- which is exactly the behaviour a pending row needs.
  resend_email_id text unique,
  status text not null default 'pending' check (
    status in (
      'pending',
      'accepted',
      'sent',
      'delivered',
      'delivery_delayed',
      'bounced',
      'failed',
      'complained'
    )
  ),
  -- The application's own duplicate protection, and the same value is sent to
  -- Resend as its Idempotency-Key. Unique and NOT NULL: the row is created
  -- BEFORE the provider call, so a double-clicked button loses the race here
  -- and never reaches Resend at all.
  idempotency_key text not null unique
    check (length(btrim(idempotency_key)) > 0),
  -- Shared by every row of one bulk reminder. Null for an individual send.
  send_group_id uuid,
  -- WHO sent it, twice, on purpose.
  --
  -- sent_by is the live reference. It is `on delete set null`, because a
  -- profile is removed when a staff member leaves and that must not take a
  -- student's email history with it - but it does mean the reference can become
  -- null years later.
  --
  -- sent_by_name is the answer to the question staff actually ask, frozen at
  -- send time. "Who told this student their police check was missing?" has to
  -- stay answerable after the person who did it has gone, so the name is
  -- snapshotted here in exactly the way the email body and content_snapshot are.
  -- It is never recomputed and never backfilled from today's profiles.
  sent_by uuid references public.profiles (id) on delete set null,
  sent_by_name text,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  failed_at timestamptz,
  complained_at timestamptz,
  -- When the provider last told us anything about this email. Kept apart from
  -- the per-outcome timestamps so a repeated or out-of-order webhook is still
  -- visible without rewriting an outcome that already happened.
  last_provider_event_at timestamptz,
  -- A SAFE message only. Never a provider secret, never an API key, never a
  -- raw provider payload.
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.student_email_log is
  'Permanent record of every placement document email sent to a student. One row per student per send, never deleted. TAE Placement is the business record; Resend is only the delivery provider.';
comment on column public.student_email_log.content_snapshot is
  'The structured content used at send time: student identity, readiness summary, completed requirements, action-needed requirements, and student messages. Contains NO internal notes. History is read from here, never rebuilt from the current checklist.';
comment on column public.student_email_log.body_text is
  'The exact plain text body that was sent.';
comment on column public.student_email_log.body_html is
  'The exact HTML body that was sent.';
comment on column public.student_email_log.status is
  'Local delivery status. accepted means Resend took the API call. Only a provider webhook may advance it to delivered, bounced, failed, or complained.';
comment on column public.student_email_log.idempotency_key is
  'Unique per send attempt, and sent to Resend as Idempotency-Key. Application-side duplicate protection: the row is inserted before the provider call.';
comment on column public.student_email_log.sent_by is
  'Live reference to the staff profile that sent this. Nulled if that profile is removed, which is why sent_by_name exists beside it.';
comment on column public.student_email_log.sent_by_name is
  'The sender display name, frozen at send time. Snapshotted like the body and content_snapshot so history still says who sent an email after that profile is gone. Never recomputed.';
comment on column public.student_email_log.send_group_id is
  'Shared by every row of one bulk batch reminder. Null for an individual send. Records only that the emails went out together; each email is still its own row.';
comment on column public.student_email_log.error_message is
  'Safe, human readable failure reason. Never a provider secret or raw payload.';

-- The student's Email History panel, newest first.
create index if not exists student_email_log_student_idx
  on public.student_email_log (student_id, created_at desc);

-- "Was this student emailed in the last 24 hours?", asked once per student on
-- the individual send and once per roster on the batch reminder review screen.
create index if not exists student_email_log_recent_idx
  on public.student_email_log (student_id, status, sent_at desc);

-- Every row of one bulk send.
create index if not exists student_email_log_send_group_idx
  on public.student_email_log (send_group_id)
  where send_group_id is not null;

create index if not exists student_email_log_status_idx
  on public.student_email_log (status);

drop trigger if exists student_email_log_set_updated_at
  on public.student_email_log;
create trigger student_email_log_set_updated_at
  before update on public.student_email_log
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Outbound history is permanent
--
-- There is no delete policy below, which already stops every application role.
-- This trigger is what also stops the service role, which bypasses Row Level
-- Security entirely and is the credential the provider webhook route uses. A
-- record of what the academy sent a student must not be removable by the one
-- code path that has no policy standing in front of it.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_delete_student_email_log()
returns trigger
language plpgsql
as $function$
begin
  raise exception
    'Sent placement emails are a permanent record and cannot be deleted.';
end;
$function$;

drop trigger if exists student_email_log_prevent_delete
  on public.student_email_log;
create trigger student_email_log_prevent_delete
  before delete on public.student_email_log
  for each row execute function public.prevent_delete_student_email_log();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- This table is APPEND ONLY, and only the server may append to it.
--
--   every active staff member   SELECT, and nothing else
--   admin                       SELECT, and nothing else
--   placement_manager           SELECT, and nothing else
--   management                  SELECT, and nothing else
--   anon                        nothing at all
--   service_role                select, insert, update - the server send path
--                               and the provider webhook, and nothing else
--
-- ---------------------------------------------------------------------------
-- Why no authenticated write, when can_manage_documents() would have allowed it
-- ---------------------------------------------------------------------------
--
-- Because an audit record its own subject can rewrite is not an audit record.
--
-- A policy of "for insert with check (can_manage_documents())" would have been
-- the obvious shape, and it is the wrong one. Every column on this table is a
-- claim about something that ALREADY HAPPENED: the address a message went to,
-- the subject and body a student received, the snapshot the system used, the
-- provider id for it, and what the provider said about delivery. None of that
-- is data a staff member should be able to author, amend, or contradict from a
-- browser session. Not because placement managers are suspected of anything,
-- but because "what did we actually tell this student" stops being evidence the
-- moment the answer is editable by the people it is evidence about.
--
-- With the write policies gone, an authenticated token cannot change
-- recipient_email, subject, body_text, body_html, content_snapshot, status,
-- resend_email_id, sent_at, sent_by, sent_by_name, or any provider timestamp.
-- Not through the application, not through a hand written PostgREST call, not
-- by pasting the anon key into a console.
--
-- The only two ways a row appears or moves are both server side. The send path
-- authenticates the staff member and checks can_manage_documents() in
-- application code BEFORE it reaches for the service role. The provider webhook
-- verifies a Resend signature before it touches anything.
--
-- Authorization has therefore not been relaxed. It has moved to where it can be
-- true of the WRITES rather than only of the writer.
--
-- Reading stays open to every active staff member, management included. Seeing
-- what was communicated to a student is exactly the oversight a read only role
-- exists for, and reads are the half of this table staff genuinely need.
--
-- There is no delete policy, no delete grant, and the trigger above refuses the
-- delete outright, including from the service role. That is the one caller a
-- policy would not have stopped.
-- ---------------------------------------------------------------------------

alter table public.student_email_log enable row level security;

drop policy if exists "staff read student email log"
  on public.student_email_log;
create policy "staff read student email log"
  on public.student_email_log for select
  to authenticated
  using (public.is_active_staff());

-- Deliberately NO insert, update, or delete policy for authenticated.
--
-- These two are dropped by name so that applying this file over an earlier
-- draft of itself removes them, rather than leaving a write policy behind that
-- nothing in the current file would ever have created.
drop policy if exists "placement staff insert student email log"
  on public.student_email_log;
drop policy if exists "placement staff update student email log"
  on public.student_email_log;

-- Table grants, stated in full rather than trusted to Supabase default
-- privileges, which grant ALL on new tables in public to anon and
-- authenticated. Revoking first is what makes the grant below the whole truth:
-- without it, authenticated would keep an INSERT privilege that only the
-- ABSENCE of a policy was holding back, and defence in depth means not leaning
-- on one of the two layers alone.
revoke all on public.student_email_log from anon;
revoke all on public.student_email_log from authenticated;
grant select on public.student_email_log to authenticated;

-- The server's two callers. service_role bypasses Row Level Security, so this
-- grant is what it actually needs, and it is stated explicitly for the same
-- reason the revokes are. Still no delete: the trigger refuses it anyway, and
-- there is no reason to hand out the privilege.
grant select, insert, update on public.student_email_log to service_role;

-- ---------------------------------------------------------------------------
-- No seed data, and no backfill
--
-- Nothing is inserted here. There is no history of placement emails to import:
-- before this migration the academy had no record of them inside TAE Placement,
-- and inventing rows for emails that may have been sent from somewhere else
-- would make the permanent record start with entries nobody can verify.
--
-- student_message is likewise not backfilled from note. See the top of this
-- file.
-- ---------------------------------------------------------------------------
