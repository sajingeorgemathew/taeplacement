# PLACEMENT-06A - Student Placement Document Email System

## Status

**Implemented. Migration 0008 is written and NOT applied. The Resend webhook is
implemented and NOT registered. No real email has been sent.**

Product documentation:
[docs/product/student-document-email.md](../product/student-document-email.md)

Three things are deliberately left for review before this goes live:

1. `supabase/migrations/0008_student_document_email.sql` has not been run.
   Until it is, `student_placement_documents.student_message` and
   `student_email_log` do not exist, so the email features cannot work against
   the database. Concretely: the Student -> Placement Documents page reads the
   Email History and will error until the migration has been run. Applying 0008
   is the one step that clears it; no code change is needed.
2. The webhook endpoint at `POST /api/resend/webhook` is not registered in
   Resend and `RESEND_WEBHOOK_SECRET` is not set. Until it is, the route refuses
   every request rather than trusting an unsigned one.
3. Nothing has been sent through Resend. The local `RESEND_API_KEY` is live, and
   the checks in `scripts/check-document-email-rendering.ts` run entirely
   against the pure modules: no network request, no database write, no email.

What was built:

| Area | Where |
| --- | --- |
| Migration | `supabase/migrations/0008_student_document_email.sql` |
| Inclusion rules (pure) | `src/lib/documents/email-content.ts` |
| Renderer (pure) | `src/lib/documents/email-template.ts` |
| Webhook status rules (pure) | `src/lib/documents/email-status.ts` |
| Reads and composing | `src/lib/documents/email-queries.ts` |
| Send actions | `src/lib/documents/email-actions.ts` |
| Resend client, server only | `src/lib/email/` |
| Service role client | `src/lib/supabase/service.ts` |
| Webhook route | `src/app/api/resend/webhook/route.ts` |
| Individual send UI | `src/components/documents/SendStatusEmailButton.tsx` |
| Batch reminder UI | `src/components/documents/BatchReminderPanel.tsx` |
| Email history UI | `src/components/documents/StudentEmailHistory.tsx` |
| Checks | `scripts/check-document-email-rendering.ts` (`npm run check:email`) |

Production hardening applied after the first pass, all three explained in the
product doc:

- **`student_message` is 500 characters**, in the Zod schema and in a database
  CHECK constraint. The internal `note` stays at 300 and is a form rule only:
  0002 created it as plain `note text` with no database constraint, and any
  comment claiming otherwise has been corrected.
- **`student_email_log` is append only.** Authenticated staff, admins included,
  hold `SELECT` and nothing else, with no write policy to match. Rows are
  written only by the server-only service role, and only after the Server Action
  has authenticated the staff member and checked `canManageDocuments()`.
- **`sent_by_name`** freezes the sender's display name at send time beside the
  live `sent_by` reference, so history still says who sent an email after that
  profile is removed.

Two decisions worth flagging, both explained in the product doc:

- **Individual sends, not Resend batch sending.** Batch sending takes one
  idempotency key for the whole request and reports failures by index. Every
  student needs their own key, their own log row, their own provider id, and
  their own delivery status, so each is composed, logged, and sent on its own,
  four at a time.
- **The internal note is unreachable, not filtered.** The function that builds
  an email takes a parameter type with no `note` field on it, so passing one
  does not compile.

## Goal

Allow placement staff to send professional, personalized placement-document status emails directly from TAE Placement using Resend.

The email must be generated from the student's CURRENT placement-document checklist.

Staff decides when to send.

Changing a document status must NEVER automatically send an email.

Two send workflows:

1. Individual Student Status Email
2. Batch Outstanding Document Reminders

TAE Placement is the permanent business record of outbound placement emails.

Resend is the delivery provider.

Student replies go to:

placement@torontoacademy.ca

## Production sender

Environment variables already exist locally:

RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_REPLY_TO

Expected production sender:

Toronto Academy Placement <placement@mail.portal-torontoacademy.ca>

Reply-To:

placement@torontoacademy.ca

The sending domain is already verified in Resend.

Receiving through Resend is intentionally disabled.

Do not change Google Workspace email configuration.

## Critical privacy rule

The existing:

student_placement_documents.note

is INTERNAL.

It must NEVER automatically appear in student email.

Add a separate field:

student_message text

Purpose:

A staff-written message that MAY be shown to the student in document-status emails.

UI wording:

Student Message
Included in placement status emails.

Also clearly label the existing field:

Internal Note
Staff only. Never included in student email.

Do not migrate/copy existing internal notes into student_message.

## Email inclusion rules

For every ACTIVE placement-document requirement:

received:
- include under Completed
- include Student Message if present

requested:
- include under Action Needed
- include Student Message if present

needs_update:
- include under Action Needed
- include Student Message if present

not_applicable:
- OMIT COMPLETELY
- requirement name must not appear
- Student Message must not appear

not_reviewed:
- OMIT from the student-facing requirement list
- it means staff has not reviewed it yet

Never include:

- Internal Note
- uploaded placement documents
- file names
- storage URLs
- medical details outside the intentionally written Student Message
- staff-only audit metadata

## Email wording principle

Emails communicate ADMINISTRATIVE placement-document status.

Do not include detailed health information.

Student Message helper text should warn:

"Student-facing. This may be included in email. Do not enter private staff comments or detailed medical information."

## Individual email

On Student Placement Documents add:

Send Status Email

Only admin / placement_manager may send.

If student has no usable email address:

disable sending and show:

No student email address is available.

Clicking Send Status Email opens a PREVIEW before anything is sent.

Preview must show:

- recipient
- subject
- complete rendered email
- Completed section
- Action Needed section
- student-facing messages exactly as they will appear

Staff actions:

Cancel
Send Email

If there is no reviewed/sendable content, do not send an empty email.

A fully ready student may receive a completion/status email.

## Suggested email structure

Subject:

Placement Document Status Update - Toronto Academy

Body:

Hi {{first_name}},

Here is your current placement-document status from Toronto Academy of Education.

COMPLETED

? TB Test
  Student-facing message if one exists.

? WHMIS

ACTION NEEDED

• Vulnerable Sector Check — Requested
  Please send the completed VSC once available.

• N95 Mask Fit — Needs Update
  Please provide the updated certificate.

Please complete any outstanding items as soon as possible.

This update includes the placement requirements currently reviewed by our placement team.

If you have questions, simply reply to this email or contact:

placement@torontoacademy.ca

Toronto Academy of Education
Placement Team

Exact styling may be polished but keep it simple and warm.

No marketing language.

No unsubscribe footer is required for this operational placement communication unless the existing project/legal rules say otherwise.

## Bulk reminders

Do NOT implement a global blind "email everybody" button.

Bulk reminders must be BATCH-SCOPED.

From the existing batch/student workflow, provide:

Send Document Reminders

for one selected Batch.

Eligible student:

- student is active
- belongs to selected batch
- has usable email
- has at least one ACTIVE requirement with:
  requested OR needs_update

Students whose only status is not_reviewed are NOT reminder recipients.

Students with all requirements received / not_applicable are NOT reminder recipients.

Before sending show a review screen.

Example:

April 27 Batch

31 students require attention
3 have no email
4 were emailed in the last 24 hours

Then list students:

? Maria Smith      3 items need attention
? John Doe         1 item needs attention
? Jane Example     Recently emailed 2 hours ago

Recently emailed students should be UNCHECKED by default.

Staff may deliberately select them again.

Allow:

Select All Eligible
Clear Selection
Preview Student
Send 27 Reminders

Each student receives their OWN personalized email.

Never use BCC as the bulk-send mechanism.

## Duplicate protection

Use BOTH:

1. application-side duplicate protection
2. Resend idempotency key

Individual:

If a successful/accepted/sent/delivered document email was sent within 24 hours, warn:

"A document status email was sent 2 hours ago."

Require:

Cancel
Send Again

Do not silently block an intentional resend.

Bulk:

recently emailed within 24 hours:
unchecked by default.

Use a stable client/request UUID for each send attempt.

The same UI submission must not be able to send twice from double-click/network retry.

Use Resend idempotency keys.

## Email history

Create a permanent email log table.

Suggested name:

student_email_log

Suggested fields:

id uuid primary key
student_id uuid not null
email_type text not null
recipient_email text not null
subject text not null
body_text text not null
body_html text not null
content_snapshot jsonb not null
resend_email_id text unique
status text not null
idempotency_key text not null unique
send_group_id uuid null
sent_by uuid
sent_at timestamptz
delivered_at timestamptz
bounced_at timestamptz
failed_at timestamptz
complained_at timestamptz
last_provider_event_at timestamptz
error_message text
created_at timestamptz
updated_at timestamptz

email_type initial values:

document_status
document_reminder

Suggested status values:

pending
accepted
sent
delivered
delivery_delayed
bounced
failed
complained

No delete workflow.

Outbound history is permanent.

## Snapshot requirement

content_snapshot must preserve exactly what the system used at send time.

Include structured data such as:

student name
student number
document readiness summary
completed requirements
action-needed requirements
student messages
send type

Do NOT include Internal Notes.

The email history must NEVER rebuild old emails from today's checklist.

Also store the rendered:

body_text
body_html

so staff can see exactly what was sent.

## Student Email History UI

On student detail / placement documents show:

Email History

Example:

Sep 16, 2026 2:41 PM
Document Status Update
Delivered
Sent by Sajin
3 items required attention

Open / View Email

Opening it shows the exact historical subject/body snapshot.

Do not depend on Resend Dashboard for permanent history.

## Migration

Create additive migration:

supabase/migrations/0008_student_document_email.sql

Do not modify migrations 0001 through 0007.

Migration should:

1. add student_message to student_placement_documents
2. create student_email_log
3. indexes
4. updated_at trigger
5. RLS

Existing student_placement_documents policies already control document editing.

Do not broaden document permissions.

Email log permissions:

active staff:
read

admin + placement_manager:
send / create log through server workflow

management:
read only

anon:
nothing

No delete policy.

## Resend integration

Install official:

resend

Create a server-only email module.

Never expose RESEND_API_KEY to client code.

Do not use NEXT_PUBLIC for Resend secrets.

Do not instantiate/configure email in a way that makes build fail when optional production webhook configuration is not yet present.

Use:

RESEND_FROM_EMAIL
RESEND_REPLY_TO

from server environment.

## Sending sequence

Do not write "Delivered" merely because Resend accepted the API call.

Preferred lifecycle:

1. validate authenticated active staff
2. validate can_manage_documents
3. re-read current student + checklist server-side
4. build email server-side
5. create pending email log / idempotency record
6. send through Resend
7. store resend_email_id
8. mark local status accepted
9. webhook later advances status

If Resend call fails:

mark log:
failed

store safe error message.

Never expose API keys/provider secrets in UI.

## Webhook

Implement:

POST /api/resend/webhook

Do not register the webhook in Resend yet.

The route must:

- read RAW request body
- verify Resend/Svix signature
- use RESEND_WEBHOOK_SECRET
- reject invalid signatures
- remain safe if secret is not configured during development
- update student_email_log by resend_email_id

Support at minimum:

email.sent
email.delivered
email.delivery_delayed
email.bounced
email.failed
email.complained

Ignore unknown events safely.

Duplicate webhook deliveries must be harmless.

The webhook is server-only and may use SUPABASE_SERVICE_ROLE_KEY for provider-status updates.

Never expose service role to client code.

## Webhook event behavior

email.sent:
status = sent

email.delivered:
status = delivered
delivered_at = event time

email.delivery_delayed:
status = delivery_delayed

email.bounced:
status = bounced
bounced_at = event time

email.failed:
status = failed
failed_at = event time
store safe failure reason if available

email.complained:
status = complained
complained_at = event time

Do not track email.opens or clicks for this ticket.

They are not necessary for placement operations.

## Email address validation

At minimum:

trim
lowercase for comparison
basic server-side email validation

Do not send when email is blank or clearly invalid.

Do not rewrite students.email during sending.

## Operational boundaries

Do NOT:

- automatically send because a requirement changed
- send attachments
- attach health forms
- expose storage links
- expose Internal Notes
- email not_applicable rows
- email not_reviewed rows as outstanding
- send to every historical student globally
- use Google Apps Script for delivery
- use Gmail API for outbound email
- configure Resend Receiving
- change student document readiness logic
- change placement statuses
- change Batch Planning
- change active placement lifecycle
- change partner logic
- implement SMS
- implement scheduled automatic reminders

This ticket is deliberate staff-triggered email only.

## Vercel / deployment

Do not put secrets in repository.

After implementation, production will need:

RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_REPLY_TO

And after webhook registration:

RESEND_WEBHOOK_SECRET

Do not add actual secret values to docs.

## Documentation

Create:

docs/product/student-document-email.md

Document:

- sending architecture
- internal note vs student message
- email inclusion rules
- Not Applicable behavior
- individual send
- batch reminder eligibility
- duplicate protection
- permanent email history
- Resend status lifecycle
- webhook configuration
- production environment variables
- privacy rules

Update:

docs/tickets/PLACEMENT-06A-document-email.md
README.md

## Validation

DO NOT SEND REAL EMAILS WHILE IMPLEMENTING.

The local RESEND_API_KEY is live.

Use pure rendering tests / mocks only.

Test:

1. Received appears under Completed
2. Requested appears under Action Needed
3. Needs Update appears under Action Needed
4. Not Applicable appears nowhere
5. Not Reviewed appears nowhere
6. Student Message appears
7. Internal Note NEVER appears
8. no student email -> cannot send
9. recently emailed -> duplicate warning
10. batch eligibility uses requested / needs_update
11. fully ready student excluded from bulk reminder
12. not-reviewed-only student excluded from bulk reminder
13. exact email snapshot can be read historically
14. management cannot send
15. admin / placement_manager can send
16. webhook invalid signature rejected
17. webhook unknown email ID handled safely
18. webhook duplicate event harmless
19. lint passes
20. build passes

Do not apply 0008 yet.

Do not send a live Resend email.

Do not create/register the production webhook yet.

At completion report:

- migration/schema
- student_message behavior
- internal note protection
- email renderer
- individual preview/send workflow
- bulk batch reminder workflow
- eligibility rules
- duplicate protection
- email history
- Resend integration
- idempotency behavior
- webhook implementation
- permissions/RLS
- files changed
- tests
- lint
- build
- git status
