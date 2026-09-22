# PLACEMENT-06A.2 - Custom Email Opening Message

## Status

**Implemented. One additive migration: `0009_placement_email_settings.sql`.**

Product documentation:
[docs/product/student-document-email.md](../product/student-document-email.md)

This ticket is a small, safe follow-up to PLACEMENT-06A. It adds one single-row
settings table, one Admin page, one optional field on the email snapshot, and an
editable opening message on the two preview screens. It changes nothing about
Resend configuration, the webhook, delivery-status polling, email eligibility,
subjects, batch boundaries, idempotency, or the rule that internal notes never
reach a student.

| Area | Where |
| --- | --- |
| Settings table, policies, grants | `supabase/migrations/0009_placement_email_settings.sql` |
| Row type | `src/lib/supabase/database.types.ts` (`PlacementEmailSettingsRow`) |
| Normalization, validation, form schema (pure) | `src/lib/documents/email-settings.ts` |
| Reading the setting | `src/lib/documents/email-settings-queries.ts` |
| Saving the setting (admin only) | `src/lib/documents/email-settings-actions.ts` |
| Snapshot field and version 2 | `src/lib/documents/email-content.ts` |
| Rendering, text and HTML | `src/lib/documents/email-template.ts` |
| Compose with a decided message | `src/lib/documents/email-queries.ts` |
| Preview, individual send, batch send | `src/lib/documents/email-actions.ts` |
| Admin page | `src/app/(app)/admin/email-settings/page.tsx`, `src/components/admin/EmailSettingsAdmin.tsx` |
| Editable message on previews | `src/components/documents/OpeningMessageEditor.tsx` |
| Individual preview and send | `src/components/documents/SendStatusEmailButton.tsx` |
| Batch review, per-student customize | `src/components/documents/BatchReminderPanel.tsx` |
| History and Activity display | `src/components/documents/EmailSnapshotView.tsx` |
| Checks | `scripts/check-document-email-rendering.ts` (`npm run check:email`, section "Opening message") |

## Goal

Staff need an optional, student-facing opening message near the beginning of
placement document emails, for temporary operational notices such as which
address to use for placement communication. Two levels:

1. A **common** Academy-wide message, editable in Admin, with an on/off switch.
2. A **per-send** message a staff member may keep, edit, or clear for one email.

The wording is never hardcoded. The exact message used for each email is frozen
into that email's permanent record.

## Email position

```
Hi FirstName,

[opening message, when there is one]

Here is your current placement-document status from Toronto Academy of Education.

COMPLETED / ACTION NEEDED
...
```

Present in both the plain-text and HTML bodies. HTML is escaped first, then line
breaks inside the message become `<br />`.

## Database

`public.placement_email_settings`, one row (`id smallint check (id = 1)`):

| Column | Meaning |
| --- | --- |
| `opening_message_enabled` | Off by default. Off means no message, even if text is saved. |
| `opening_message` | Trimmed, `check (length <= 600)`. Blank means no message. |
| `updated_at` | Maintained by `set_updated_at()`. |
| `updated_by` | Staff profile that last saved, `on delete set null`. |

Seeded disabled and blank. No production wording is written into the migration.

### Authorization

The existing pattern for admin configuration tables (batches, document
requirements, placement areas), with no new role:

- **Read**: every active staff member, `public.is_active_staff()`. Anyone who can
  send a placement email can read the message it opens with.
- **Update**: admin only, `public.is_admin()`, and `isAdmin(session)` in the
  server action. A placement manager may customize the message for one send but
  may not change the Academy-wide setting.
- No insert or delete policy or grant for anyone. Grants are `select, update` to
  `authenticated`; everything revoked from `anon`. The service role is not used.

## Snapshot compatibility

`EMAIL_SNAPSHOT_VERSION` is now 2. The only change is an optional
`opening_message: string | null` on `DocumentEmailSnapshot`.

- Version 1 rows have no key. `parseStoredSnapshot()` accepts them unchanged and
  `storedOpeningMessage()` reads a missing key, `null`, blank, or a non-string as
  "no opening message". They render exactly as before.
- Version 2 rows carry the exact message that was sent, or `null`.
- Nothing is backfilled from today's setting. The stored `body_text` and
  `body_html` remain the ultimate record. No old row is modified.

## Individual send

1. The preview opens with the common message already in the editable box.
2. Staff may keep it, edit it, or clear it. The preview re-renders locally with
   the same pure template the server uses, so the wording shown is the wording
   that will be sent for that checklist.
3. Send submits the reviewed message. The server authorizes the sender,
   validates the message (a string of at most 600 characters, or `null`),
   re-reads the student and the **current** checklist, composes, logs, and
   sends. Document state is never trusted from the browser.
4. The edit affects only that email. It is not written to the setting or the
   student.

## Batch reminders

- The review page resolves the enabled common message once, when it loads. That
  text is the **reviewed batch default**: shown once at the top, used for every
  preview of a non-customized student, and submitted verbatim with the send as
  `defaultOpeningMessage`.
- Each student row has **Customize** (or **Edit Message** once customized) and
  **Reset to common**, which restores this review session's default. A
  customization is held in screen state until Send and is submitted as
  `customOpeningMessages: [{ studentId, openingMessage }]`.
- The server authorizes, validates the reviewed default and every custom
  message independently before the first email goes out, re-reads each
  student's current checklist, and uses the submitted default for
  non-customized students and the submitted custom wording for customized
  ones. It does **not** re-read the Admin setting for the send: what staff
  reviewed is what is sent. Changing Email Settings affects new previews and
  review sessions only.
- Batch boundary, eligibility, concurrency, idempotency keys, `send_group_id`,
  and duplicate protection are unchanged.

## Privacy

`student_placement_documents.note` remains internal and unreachable from the
email builder. The opening message is student facing by design, bounded at 600
characters, and stored on the email log row only. The Admin page carries the
helper text: "This message appears near the top of placement document emails.
Keep it student-facing and do not include confidential or medical information."

## Checks

`npm run check:email` gains the section "Opening message" (O1 to O17e): setting
off and on, text and HTML presence and position, the rest of the email
unchanged, per-send override and clear, batch per-student customization and
reset, trimming, the 600 limit, escaping with line breaks, version 1 snapshots
parsing and rendering unchanged, version 2 snapshots reading back exactly, the
history not being rebuilt from today's setting, internal notes still absent, the
settings action never importing the send path, the send actions validating and
re-composing, and the 0009 policies and grants.

Saving the Admin setting never sends an email: there is no call from the
settings action into the send path, no trigger, and no schedule.
