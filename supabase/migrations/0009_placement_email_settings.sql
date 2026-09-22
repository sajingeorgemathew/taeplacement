-- PLACEMENT-06A.2 - Custom Email Opening Message
--
--   placement_email_settings    one row of Academy-wide settings for the
--                               placement document emails
--
-- This migration is purely ADDITIVE. It creates one new single-row table with
-- its constraints, trigger, seed row, and policies, and nothing else. It does
-- not touch students, batches, document requirements, the checklist columns,
-- student_placement_documents.student_message, student_email_log, placement
-- areas, placement partners, or student placements, and it rewrites nothing
-- from 0001 through 0008. It is safe to apply once to the live database.
--
-- It changes NO email eligibility rule, NO subject line, NO delivery status,
-- and NO webhook behaviour. Nothing here sends anything: saving a setting is a
-- configuration change, and the application never sends an email in response
-- to it.
--
-- ---------------------------------------------------------------------------
-- What the opening message is, and what it is not
-- ---------------------------------------------------------------------------
--
-- Staff sometimes need every placement document email to carry a short
-- operational notice near the top, for a while: which address to write to,
-- which channel not to use, that the office is closed for a week. That notice
-- is the OPENING MESSAGE. It is written by an admin, in the application,
-- switched on and off in the application, and it is STUDENT FACING by design:
-- every word of it is going to a student's inbox.
--
-- It is therefore bounded, at 600 characters, in the database and not only in
-- the form, for the same reason student_message is bounded in 0008: this text
-- leaves the building, so its limit is a storage fact. A direct UPDATE that
-- skips the Zod schema is still refused.
--
-- It is NOT a route for internal notes. student_placement_documents.note stays
-- INTERNAL and nothing in this migration reads, copies, or references it. The
-- opening message is one Academy-wide sentence or two, not a per-student field:
-- when a staff member customizes it for one email, that customization lives
-- only on that email's permanent log row (content_snapshot.opening_message),
-- never on the student, and never here.
--
-- ---------------------------------------------------------------------------
-- Why a single-row table rather than a generic key/value settings framework
-- ---------------------------------------------------------------------------
--
-- Because there is exactly one setting, it has a type, and it has a length
-- constraint. A `settings(key text, value text)` table would lose all three:
-- the CHECK on length could not know which key it was bounding, the boolean
-- would be a string, and every reader would need to know the magic key name.
-- One row with named, typed, constrained columns is the smallest thing that is
-- also the most correct thing. If the placement emails ever need a second
-- Academy-wide setting, it is a second column on this row.
--
-- The row is a singleton by construction: `id` is a smallint that must equal
-- 1, so a second row cannot be inserted by anyone, including the service role.
-- The one row is seeded here, disabled and blank, so the application only ever
-- UPDATEs it and never has to decide whether to create it.
-- ---------------------------------------------------------------------------

-- Deliberately NOT "if not exists". This is a numbered migration applied once,
-- in order, and an unexpected pre-existing table means the schema is not in the
-- state this file assumes.
create table public.placement_email_settings (
  -- Exactly one row, forever. See above.
  id smallint primary key default 1 check (id = 1),
  -- Off by default. A freshly migrated database sends exactly the emails it
  -- sent before this migration, until an admin turns the message on.
  opening_message_enabled boolean not null default false,
  -- The message itself. Stored trimmed of surrounding whitespace by the
  -- application; blank means "no message" even when the switch is on, and the
  -- application treats it that way rather than sending an empty paragraph.
  opening_message text not null default ''
    check (length(opening_message) <= 600),
  updated_at timestamptz not null default now(),
  -- Who last saved it. `on delete set null` because a profile is removed when
  -- a staff member leaves, and the setting must not go with them.
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.placement_email_settings is
  'Academy-wide settings for placement document emails. Exactly one row (id = 1). Read by anyone who may send a placement email; changed only by an admin, only from the application. Saving a row here never sends anything.';
comment on column public.placement_email_settings.opening_message_enabled is
  'When true, and opening_message is not blank, new placement document emails open with opening_message directly after the greeting. Staff may still customize or clear it for one send.';
comment on column public.placement_email_settings.opening_message is
  'STUDENT FACING. The common opening message, at most 600 characters, trimmed. Never holds internal notes, medical detail, file names, or provider metadata. The exact text used for any one email is frozen on that email''s student_email_log row, never rebuilt from here.';
comment on column public.placement_email_settings.updated_by is
  'The staff profile that last saved these settings. Nulled if that profile is removed.';

drop trigger if exists placement_email_settings_set_updated_at
  on public.placement_email_settings;
create trigger placement_email_settings_set_updated_at
  before update on public.placement_email_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The one row
--
-- Seeded DISABLED and BLANK. The wording of any real notice is an operational
-- decision made by an admin in the application, at the time it is needed, and
-- it is deliberately not written into a migration where it would outlive the
-- situation that called for it.
-- ---------------------------------------------------------------------------

insert into public.placement_email_settings (id, opening_message_enabled, opening_message)
values (1, false, '')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
--   every active staff member   SELECT. Anyone who may send a placement email
--                               must be able to read the message that email
--                               will open with, and management may see what
--                               students are being told.
--   admin                       UPDATE. Configuring the Academy-wide message
--                               is a settings change, and settings are admin
--                               only everywhere else in this application
--                               (batches, document requirements, placement
--                               areas, city mappings). No new role is invented
--                               here: public.is_admin() from 0001 decides.
--   placement_manager           SELECT only. May send emails, may customize
--                               the message for one send, may not change what
--                               every other staff member's emails say.
--   management                  SELECT only.
--   anon                        nothing at all.
--
-- There is no INSERT policy and no DELETE policy, for anyone. The row exists;
-- there is nothing to insert, and deleting it would leave the application
-- reading a setting that is not there. The id CHECK stops a second row from
-- any caller regardless.
--
-- The service role is not involved. The setting is read and written with the
-- signed in staff member's own token, through these policies, exactly like the
-- other admin configuration tables. Nothing about this feature needs, or is
-- given, a path around Row Level Security.
-- ---------------------------------------------------------------------------

alter table public.placement_email_settings enable row level security;

drop policy if exists "staff read placement email settings"
  on public.placement_email_settings;
create policy "staff read placement email settings"
  on public.placement_email_settings for select
  to authenticated
  using (public.is_active_staff());

drop policy if exists "admin update placement email settings"
  on public.placement_email_settings;
create policy "admin update placement email settings"
  on public.placement_email_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Deliberately NO insert or delete policy for authenticated.

-- Table grants, stated in full rather than trusted to Supabase default
-- privileges, which grant ALL on new tables in public to anon and
-- authenticated. Revoking first is what makes the grants below the whole
-- truth: authenticated holds select and update, and the update is then
-- narrowed to admins by the policy above.
revoke all on public.placement_email_settings from anon;
revoke all on public.placement_email_settings from authenticated;
grant select, update on public.placement_email_settings to authenticated;
