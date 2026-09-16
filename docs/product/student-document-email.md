# Student Placement Document Email

Sending placement-document status emails to students from TAE Placement. Built
in PLACEMENT-06A on top of the placement document checklist from PLACEMENT-02.

## Purpose

Staff spend a large part of every intake telling students which placement
documents are still missing. Before this module that meant opening the student's
checklist, reading it, and typing the same email by hand, one student at a time,
in a different application, with no record afterwards of what anyone was told.

This module does exactly that job and nothing more:

- send one student their current placement-document status
- send one **batch** of students a reminder about their outstanding documents
- keep a permanent record of every email that went out

That is the whole scope. It is not a mailing list, not a campaign tool, not a
notification system, and not a messaging inbox. There is no SMS, no scheduling,
and no automation.

**Nothing sends by itself.** There is no trigger, no cron, and no status change
anywhere in the application that causes an email. Changing a document status has
never sent anything and still does not. A staff member opens a preview, reads
it, and presses Send.

## The two workflows

```
Individual
  Student -> Placement Documents -> Send Status Email
          -> PREVIEW (recipient, subject, full content)
          -> Send Email

Batch reminder
  Students -> Batch -> Send Document Reminders
           -> REVIEW screen (who is included, who is not, who was emailed
              recently)
           -> select students -> Preview Student (optional)
           -> Send N Reminders
```

Both end in one personalized email **per student**. Nobody is ever BCC'd, so no
student can see another student's address.

## Internal Note vs Student Message

This is the most important rule in the module.

`student_placement_documents` has two free text columns and they are not
interchangeable:

| Column | Reader | Ever emailed? |
| --- | --- | --- |
| `note` | staff only | **Never** |
| `student_message` | the student | Yes, when the requirement is included |

`note` already existed. It was written on the understanding that no student
would ever read it, and it holds exactly the kind of thing that understanding
invites: "second TB attempt failed", "chase the clinic", a medical detail that
explains a decision. PLACEMENT-06A does not change that understanding and does
not migrate a single character of it.

`student_message` is new, starts null for every row, and stays null until a
staff member types into it.

The two fields have **different** length limits and are not kept in step:

| | Limit | Enforced by |
| --- | --- | --- |
| `note` | 300 | the Zod schema only. The column is plain `text`. |
| `student_message` | 500 | the Zod schema **and** a CHECK constraint in 0008. |

`student_message` is the longer of the two because an instruction that explains
itself ("The certificate you sent expired in June, please complete the mask fit
again") is worth more to a student than a terse one. It is the one that also has
a database constraint because it is the field whose contents leave the building,
so its bound is a storage fact rather than a form convenience.

In the interface the two are separate boxes, separately labelled:

```
Internal Note
Staff only. Never included in student email.

Student Message
Included in placement status emails.
Student-facing. This may be included in email. Do not enter private staff
comments or detailed medical information.
```

They are saved by different Server Actions writing different columns.
`saveDocumentNoteAction` never touches `student_message`, and
`saveStudentMessageAction` never touches `note`.

### How the internal note is kept out

Not by a filter. `src/lib/documents/email-content.ts` builds email entries
through `emailEntriesFrom()`, whose parameter type is:

```ts
items: readonly {
  requirement: { id: string; name: string };
  document: { status: PlacementDocumentStatus; student_message?: string | null };
}[]
```

There is no `note` on that type. The internal note is not omitted by a rule
somebody could later relax; it is **unreachable** from the code that builds an
email, and a future caller that tries to pass one does not compile.

`scripts/check-document-email-rendering.ts` also renders a full email from a
checklist whose every row carries an internal note, and asserts that no part of
that note appears in the subject, the text body, the HTML body, or the stored
snapshot.

## Email inclusion rules

For every **active** requirement on the student's checklist:

| Status | In the email |
| --- | --- |
| `received` | **Completed**, with its Student Message if present |
| `requested` | **Action Needed**, with its Student Message if present |
| `needs_update` | **Action Needed**, with its Student Message if present |
| `not_applicable` | **Nothing at all** |
| `not_reviewed` | **Nothing at all** |

The two omissions are the point of the table.

**Not Applicable is omitted completely.** The requirement's name does not
appear, its Student Message does not appear, and nothing hints that it exists. A
student who is exempt from a requirement does not need to be handed a list that
says so, and "N/A" in an email reads as a problem rather than as a decision
already made in their favour.

**Not Reviewed is omitted too, and it is never presented as outstanding.** Not
Reviewed means nobody on staff has looked at that requirement yet. That is our
state, not the student's. Listing it as missing would ask a student to chase a
document that may already be sitting in the LMS waiting for review.

Because Not Reviewed rows are invisible, every email carries the sentence:

> This update includes the placement requirements currently reviewed by our
> placement team.

That line is not filler. It is the honest counterpart of leaving unreviewed rows
out, and it stops a student reading the list as complete.

Never included, in any email, under any circumstances:

- Internal Notes
- uploaded placement documents or the Final Placement Package
- file names or storage URLs
- medical detail beyond an intentionally written Student Message
- staff audit metadata (who requested, who received, when)

### Note on the readiness split

The email split is **not** the readiness split, and the code keeps them apart on
purpose. `READY_DOCUMENT_STATUSES` counts `not_applicable` as ready, because a
requirement that does not apply cannot hold a student back.
`EMAIL_COMPLETED_STATUSES` does not, because "Completed" in an email is a
different claim from "does not block readiness". Both lists live in
`src/lib/placement/constants.ts` with the difference documented between them.

## Individual send

On **Student -> Placement Documents**, admins and placement managers see
**Send Status Email**.

If the student has no usable email address the button is disabled and the page
says:

> No student email address is available.

"Usable" means: trims to something, is at most 254 characters, and has an `@`
with a dotted domain after it. The check lives in `src/lib/email/address.ts` and
is the single definition used by the button, the batch review screen, and the
send itself. Sending **never rewrites `students.email`**: the address is trimmed
and lowercased for delivery, and the student record keeps whatever staff typed.

### The preview is not optional

Clicking Send Status Email opens a preview. It shows the real recipient, the
real subject, the Completed section, the Action Needed section, the student
messages exactly as they will appear, and the exact plain text body under
"Exact email text". The staff member can Cancel or Send Email.

The preview is built by `composeStudentDocumentEmail()`, which is the same
function the send uses. The preview is not a mock-up of the email; it is the
email.

If a student has nothing reviewed at all, no email is offered:

> This student has no reviewed requirements yet, so there is nothing to tell
> them. Review the checklist first.

A **fully ready** student is different: their Completed section is the message,
and telling somebody their documents are done is a useful thing to send. They
are excluded from bulk reminders but may receive a status email on purpose.

## Batch reminder eligibility

Bulk sending is **batch scoped, always**. There is no roster-wide "email
everyone" button and there must never be one: it would be one misclick away from
writing to every student the academy has ever enrolled.

The review screen lives at
`/students/batches/[batchId]/document-reminders`, reached from the batch page.

A student is a reminder recipient when **all** of these hold:

- the student is active
- the student is in the selected batch
- the student has a usable email address
- at least one **active** requirement is `requested` or `needs_update`

Which means, deliberately:

- a fully ready student is **not** a recipient - there is nothing to remind
- a student whose statuses are all `not_reviewed` is **not** a recipient
- a student whose only outstanding row is on an **archived** requirement is not
  a recipient either, because the academy has retired that document

The review screen says who is in and who is out:

```
April 27 Batch

31 students require attention
3 have no email address on file
4 were emailed in the last 24 hours
```

Then lists them with counts, offers **Select All Eligible**, **Clear
Selection**, and **Preview Student**, and finishes with **Send 27 Reminders**.

Students emailed in the last 24 hours are listed and **unchecked by default**.
Staff can tick them deliberately. Students with no email are shown separately,
so a missing address is visible as a student record problem rather than silently
dropping someone.

### What is re-checked on the server

The browser's selection decides **who is considered**, never **what is true
about them**. The send action:

1. re-reads the batch membership and drops any id that is not in it
2. re-reads and re-composes every selected student from the live checklist
3. skips anyone who no longer has anything outstanding

So a student whose last outstanding document was marked Received while the
review screen sat open is skipped, not emailed.

## Duplicate protection

Two independent layers, as required.

### 1. Application side: a unique idempotency key

Every send attempt carries a UUID the browser creates once:

- individual: created when the **preview opens**
- bulk: created once per **submission**, shared by every student in it

The key stored on the log row is built from it:

```
document_status:<studentId>:<requestId>
document_reminder:<sendGroupId>:<studentId>
```

`student_email_log.idempotency_key` is `not null unique`, and **the row is
inserted before the provider is called**. A double-clicked button, a browser
retry, and two tabs pressing Send on the same submission all collide in Postgres
and lose before anything reaches Resend.

### 2. Provider side: Resend's Idempotency-Key

The same key is passed to `resend.emails.send()` as `idempotencyKey`. That
covers the case the database cannot see: our request succeeded but the response
never came back to us.

### The 24 hour warning

Separately from the above, a **warning** - never a block:

Individual send, when a real send exists inside 24 hours:

> A document status email was sent 2 hours ago.
> Sending again is fine if the student needs another copy.

with **Cancel** and **Send Again**. Sending again is a new preview, so a new
request id, so a new submission rather than a replay.

Bulk: those students are unchecked by default.

A "real send" means a log row whose status is `accepted`, `sent`, `delivered`,
or `delivery_delayed`. A `pending`, `failed`, `bounced`, or `complained` row is
**not** a duplicate risk: nothing arrived, so sending again is the right thing
to do.

## Permanent email history

`student_email_log` is the business record. **TAE Placement is the record;
Resend is the delivery provider.** The Resend dashboard has a retention window
and this table has none.

One row per **student** per **send**. A bulk reminder to 27 students writes 27
rows, each with its own subject, rendered body, snapshot, provider id, and
delivery status. `send_group_id` records only that they went out together; there
is no row meaning "a batch was emailed", because there is no such thing.

Nothing is ever deleted. There is no delete policy on the table **and** a
database trigger that refuses the delete outright, which also stops the service
role the webhook uses.

### The snapshot

`content_snapshot` holds the structured content used **at send time**:

```jsonc
{
  "version": 1,
  "send_type": "document_status",
  "generated_at": "2026-09-16T18:41:00.000Z",
  "student": { "id", "student_number", "first_name", "full_name",
               "recipient_email", "batch_name" },
  "readiness": { "required_total", "required_ready", "active_total",
                 "active_ready", "percent", "is_ready" },
  "completed":     [{ "requirement_id", "name", "status", "status_label",
                      "student_message" }],
  "action_needed": [{ "requirement_id", "name", "status", "status_label",
                      "student_message" }],
  "omitted": { "not_applicable": 1, "not_reviewed": 1 }
}
```

`omitted` is counts only, for staff reading the history later. It is never
rendered into an email: the whole point of omitting a Not Applicable requirement
is that the student never learns it existed.

There is no `note` anywhere in a snapshot.

`body_text` and `body_html` sit beside it, holding the exact bytes that were
sent.

**The history is never rebuilt from today's checklist.** An email that said
"Police Check - Requested" in April still says that in June, after the police
check arrives.

On **Student -> Placement Documents -> Email History** each entry shows the
date, the type, the delivery status, who sent it, and how many items required
attention. **View Email** opens the stored snapshot and the exact text.

Every active staff member can read the history, management included. Seeing what
was communicated to a student is exactly the oversight a read-only role is for.

## Resend integration

The official `resend` package. `src/lib/email/resend.ts` is the only module in
the application that talks to it.

Every email module starts with `import "server-only"`, so a Client Component
that imported one - directly or through anything else - would fail the build
rather than ship an API key. No Resend value is a `NEXT_PUBLIC_` variable.

The client is created **lazily, per call**. `new Resend()` throws when there is
no API key, so a module-level instance would turn "Resend is not configured yet"
into a crash at import time and take the whole build with it on a machine with
no production secrets. Nothing in this module is read at module load, and the
application builds and runs with every Resend variable blank; only a **send** is
refused, with a plain message.

Attachments, CC, BCC, tracking, and unsubscribe headers are all deliberately
absent. This is an operational placement email to one student.

### Why individual sends, not Resend batch sending

Resend can take up to 100 emails in one call. It is the wrong shape here for
three reasons:

1. **Idempotency is per request, not per email.** `resend.batch.send` accepts
   one `Idempotency-Key` for the whole call, so a retry is all-or-nothing across
   27 students. Individual sends give every student their own key, tied to their
   own log row.
2. **Failures are positional.** A partly rejected batch reports errors by
   **index**, and only in permissive mode. Mapping index 14 back to a student to
   write the right failure onto the right permanent record is exactly the kind
   of bookkeeping that is silently wrong the first time the response shape
   changes.
3. **The log rows are one-to-one anyway.** Every student needs their own row,
   subject, body, snapshot, provider id, and delivery status. Batch sending
   would save one round trip and cost a fragile join.

So each student is composed, logged, and sent on their own, four at a time
(`SEND_CONCURRENCY`). A 30-student batch finishes in a few seconds, stays well
inside any rate limit, and keeps each failure attached to the one student it
belongs to.

## Status lifecycle

```
pending  -> the log row exists, nothing has been sent
accepted -> Resend took the API call
sent         \
delivered     |  only a verified provider webhook writes these
delivery_delayed
bounced       |
failed        |
complained   /
```

**The interface never says Delivered because an API call returned 200.** The
send path stops at `accepted`, labelled "Accepted by Resend", and the send
dialog says so:

> The email has been accepted by our email provider and is on its way. Delivery
> is confirmed separately and will appear in Email History.

If the Resend call fails, the row is marked `failed` with a safe, length-capped
provider message. Provider messages are kept because they are useful ("Invalid
`to` field"), and they are never joined with anything from the configuration, so
no credential can reach the interface or the log.

## Webhook

`POST /api/resend/webhook`.

**Not registered yet.** The route exists and works; nothing in the Resend
dashboard points at it and `RESEND_WEBHOOK_SECRET` is not set anywhere.

What it does:

1. reads the **raw** request body as text, before anything looks at it
2. verifies it through the official Resend webhook verification API, using the
   `svix-id`, `svix-timestamp`, and `svix-signature` headers and
   `RESEND_WEBHOOK_SECRET`
3. rejects an invalid signature with 401
4. responds 503 when the secret is not configured - the payload is never parsed
5. finds the log row by `resend_email_id` and updates it

Raw, because the signature covers the exact bytes Resend sent; parsing first and
re-serializing would change key order or whitespace and invalidate every genuine
event.

**The webhook never trusts an unsigned request.** Unsigned, badly signed, and
arriving-before-configuration are all refused the same way: nothing is parsed
and nothing is written.

The route is in `PUBLIC_PATHS` in `src/proxy.ts`, because there is no staff
member behind a provider callback and redirecting it to `/login` would turn
every delivery event into a 307 the provider retries forever. It is not
unprotected: a valid Resend signature is a stronger check than a session cookie.

### Events

| Event | Effect |
| --- | --- |
| `email.sent` | `status = sent` |
| `email.delivered` | `status = delivered`, `delivered_at` |
| `email.delivery_delayed` | `status = delivery_delayed` |
| `email.bounced` | `status = bounced`, `bounced_at`, safe reason |
| `email.failed` | `status = failed`, `failed_at`, safe reason |
| `email.complained` | `status = complained`, `complained_at` |

`email.opened` and `email.clicked` are deliberately **not** tracked. Whether a
student opened an email is not a placement fact and it is not worth collecting.

Anything else - an unknown event, a payload with no email id, an email id this
application has no row for - is acknowledged with 200 and dropped. A provider
that never gets a 2xx retries forever, and retrying will not make an
`email.opened` event any more interesting. A webhook can never **create** a log
row, only advance one.

### Repeats and out-of-order events

Both are ordinary webhook behaviour, and both are handled by ranking statuses:

```
pending 0 < accepted 10 < sent 20 < delivery_delayed 30 < delivered 40
        < bounced 50 = failed 50 < complained 60
```

A status only ever moves **forward**, so a late `email.sent` cannot demote a row
that already knows it was delivered. Equal ranks are allowed through, so a
duplicate `email.delivered` rewrites the values it already wrote. Each outcome
writes only its **own** timestamp: a bounce does not clear `delivered_at` and a
delivery does not clear `bounced_at`, because both really happened.

The three bad outcomes outrank delivered on purpose. A message that was
delivered and then complained about is a complaint.

### Why the service role

There is no signed in staff member behind a provider callback, so there is no
Row Level Security context to work in. `SUPABASE_SERVICE_ROLE_KEY` is used here
and nowhere else in the application, it never leaves the server, and this route
only ever **updates** a row it can already find by provider id. The delete
trigger in 0008 refuses this credential too, so bypassing policies cannot become
erasing history.

## Permissions

| Role | Read email history | Send | Write to the log directly |
| --- | --- | --- | --- |
| admin | yes | yes | **no** |
| placement_manager | yes | yes | **no** |
| management | yes | **no** | **no** |
| anon | no | no | no |

Sending reuses `can_manage_documents()` - the same check that governs changing a
document. Who may email a student about their documents is the same question as
who may change those documents, and answering it twice is how the two answers
drift apart.

0008 **broadens nothing**. The existing `student_placement_documents` policies
are untouched and no role gains a document permission it did not already have.

### The email log is append only, and only the server may append

Note the last column above. **Nobody** writes `student_email_log` with their own
authenticated token, an admin included. The table grants ordinary authenticated
staff `SELECT` and nothing else:

```sql
revoke all on public.student_email_log from anon;
revoke all on public.student_email_log from authenticated;
grant select on public.student_email_log to authenticated;
grant select, insert, update on public.student_email_log to service_role;
```

and there is no `INSERT`, `UPDATE`, or `DELETE` policy for `authenticated` to go
with it. Both layers say the same thing, because relying on the absence of a
policy alone would leave a privilege that only a policy is holding back.

The reason is that every column here is a claim about something that **already
happened**: the address a message went to, the subject and body a student
received, the snapshot the system used, the provider's id for it, and what the
provider said about delivery. An audit record its own subject can rewrite is not
an audit record. So a placement manager cannot amend `recipient_email`,
`subject`, `body_text`, `body_html`, `content_snapshot`, `status`,
`resend_email_id`, `sent_at`, `sent_by`, `sent_by_name`, or any provider
timestamp - not through the application, not through a hand-written PostgREST
call, not by pasting the anon key into a console.

This is not a relaxation of authorization. It is authorization moved to where it
can be true of the **writes** as well as of the writer.

### How a send authorizes before touching the service role

`authorizeSend()` in `src/lib/documents/email-actions.ts` is the only door, and
the order inside it is the whole point:

```ts
const session = await requireActiveStaff();          // 1  who is asking
if (!canManageDocuments(session)) return { ... };    // 2  may they send
const service = createSupabaseServiceRoleClient();   // 3  only now
```

1. `requireActiveStaff()` establishes the caller and redirects a signed out or
   unactivated visitor.
2. `canManageDocuments()` mirrors `public.can_manage_documents()` and decides
   whether this person may email a student about their documents.
3. Only after both have passed is the service-role client created.

It is used for exactly three statements per email - the pending insert and the
two possible follow-up updates on that same row - and then dropped when the
action returns. It is never returned from a Server Action, never passed to a
component, and never reaches client code: `src/lib/supabase/service.ts` carries
`import "server-only"`, so a Client Component importing it fails the build.

Everything else in the send path stays on the ordinary authenticated client,
under Row Level Security, including the batch-membership read that bounds a bulk
reminder. The service role is for writing the append-only log and nothing else.

Sending is therefore still checked three times: the page hides the button, the
Server Action refuses, and - for the reads staff do make - Row Level Security
refuses. The write itself is checked in application code before the credential
that performs it is ever created.

### Who sent it, after they have left

`sent_by` is a live `on delete set null` reference to `profiles`, so removing a
staff member does not take a student's email history with them - but it does
leave the reference null.

`sent_by_name text` sits beside it, holding the sender's display name **frozen
at send time**, snapshotted in exactly the way the body and `content_snapshot`
are. "Who told this student their police check was missing?" has to stay
answerable after that person has gone.

Email History prefers `sent_by_name` and falls back to a live profile lookup only
for rows that have no frozen name. The name is never recomputed and never
backfilled from today's profiles.

## Database

`supabase/migrations/0008_student_document_email.sql`, additive.

1. `student_placement_documents.student_message text` - nullable, no default,
   no backfill, 500 character CHECK constraint
2. `student_email_log` - the permanent record
3. indexes for the history panel, the 24 hour check, and send groups
4. `updated_at` trigger
5. a `before delete` trigger that refuses deletion
6. Row Level Security: a `SELECT` policy for active staff, and deliberately no
   write policy - see the permissions section above

It rewrites nothing from 0001 through 0007, changes no readiness rule, no
placement status, no batch planning, no partner logic, and no active placement
logic.

Nothing is seeded. There is no history of placement emails to import, and
inventing rows for emails sent from somewhere else would make the permanent
record start with entries nobody can verify.

## Production environment variables

Server only. Never `NEXT_PUBLIC_`, never committed.

| Variable | Needed for |
| --- | --- |
| `RESEND_API_KEY` | sending |
| `RESEND_FROM_EMAIL` | sending |
| `RESEND_REPLY_TO` | sending |
| `RESEND_WEBHOOK_SECRET` | the webhook, after it is registered |
| `SUPABASE_SERVICE_ROLE_KEY` | the webhook's status updates |

Expected production sender:

```
Toronto Academy Placement <placement@mail.portal-torontoacademy.ca>
```

Reply-To:

```
placement@torontoacademy.ca
```

The sending domain is already verified in Resend. **Receiving through Resend is
intentionally disabled**, so replies land in the real Google Workspace mailbox
staff already read. Google Workspace configuration is not touched by this
module.

## Privacy rules

1. Internal Notes are never emailed, and are unreachable from the code that
   builds an email.
2. Not Applicable requirements are omitted completely - name, status, and
   student message.
3. Not Reviewed requirements are omitted and are never presented as outstanding.
4. No attachments, no file names, no storage URLs, no signed links.
5. No health detail beyond an intentionally written Student Message. The
   Student Message field says so where it is typed.
6. No student is ever BCC'd with another. One email per student, always.
7. No tracking pixel, no click tracking, no open tracking.
8. Provider errors are length-capped and never carry configuration values.
9. Outbound history is permanent and cannot be deleted by any role.
10. Sending never rewrites `students.email`.

## Checks

```bash
npm run check:email
```

`scripts/check-document-email-rendering.ts` runs 57 assertions over the pure
modules: the inclusion rules, the renderer, address validation, the student
message length limit, the duplicate window, bulk eligibility, snapshot
permanence, the permission helpers, webhook signature verification, and webhook
event handling.

Seven of them read migration 0008 as text and assert on its **statements**, with
`--` comments stripped, so that "authenticated staff may read the email log and
nothing else" is a claim the repository checks rather than one a comment makes.
Those checks were verified to fail when a write grant is re-added.

**It sends nothing and touches no database.** The only use of the `resend`
package is a local HMAC signature check, which makes no request. The fixtures
are invented placeholders, not real students.

## Deliberately not built

- automatic sending of any kind, including on a status change
- scheduled or recurring reminders
- SMS
- attachments or document links
- a roster-wide send
- open and click tracking
- Resend Receiving
- an unsubscribe mechanism - a student cannot opt out of being told their police
  check is missing, and this is operational mail, not marketing
- any change to placement statuses, readiness, Batch Planning, partner logic, or
  active placement
