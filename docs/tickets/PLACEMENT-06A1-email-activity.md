# PLACEMENT-06A.1 - Email Activity & Live Status Updates

## Status

**Implemented. No migration was created, and none was needed.**

Product documentation:
[docs/product/student-document-email.md](../product/student-document-email.md)

This ticket is a READ and a REFRESH on top of PLACEMENT-06A. It adds no table,
no column, no policy, no grant, no environment variable, and no API route. It
changes nothing about how an email is composed, sent, logged, or how the Resend
webhook advances a status.

Verified against the live database from a signed-in staff session: 26 logged
emails, 21 Delivered, 3 In Progress, 2 Bounced, with search, the quick filters,
the stored-snapshot dialog, and the live indicator all behaving as described
below.

| Area | Where |
| --- | --- |
| Status groups and the final/unresolved split | `src/lib/placement/constants.ts` |
| Filters, date windows, pagination (pure) | `src/lib/documents/email-activity.ts` |
| Activity reads | `src/lib/documents/email-queries.ts` |
| Page | `src/app/(app)/activity/page.tsx` |
| List and historical email dialog | `src/components/documents/EmailActivityList.tsx` |
| Summary cards / quick filters | `src/components/documents/EmailActivitySummaryCards.tsx` |
| Search and filters | `src/components/documents/EmailActivityToolbar.tsx` |
| Pagination | `src/components/documents/EmailActivityPagination.tsx` |
| Live status refresh | `src/components/documents/EmailStatusAutoRefresh.tsx` |
| Checks | `scripts/check-document-email-rendering.ts` (`npm run check:email`) |

## Goal

Staff were able to see a placement email only by opening the student it was sent
to. After a batch reminder to twenty-seven students, answering "did they all get
it" meant twenty-seven page visits, and the two that bounced were indistinguishable
from the twenty-five that did not until each was opened.

So: one operational list of every placement document email, newest first,
filterable, with the failures reachable in a click - and delivery statuses that
catch up on their own rather than waiting for somebody to press reload.

## Architecture

Nothing new was introduced to hold this. The page is a Server Component that
reads `student_email_log` through the existing authenticated Supabase server
client, and one small Client Component asks it to read again every ten seconds
while anything on screen can still change.

```
/activity (Server Component)
  |
  |-- getEmailActivity(filters, page) ------> student_email_log  (+ students, batches)
  |-- getEmailActivitySummary(filters) -----> four COUNT(*) reads
  |-- listBatches() ------------------------> the batch filter's options
  |
  |-- EmailActivitySummaryCards   summary and quick filters, links only
  |-- EmailActivityToolbar        search and filters, writes the URL
  |-- EmailActivityList           rows, and the stored-snapshot dialog
  |-- EmailActivityPagination     Previous / Next, links only
  |-- EmailStatusAutoRefresh      router.refresh() every 10s while unresolved
```

`student_email_log` remains the permanent audit record and the source of truth
for recipient, sender name, email type, snapshot, status, provider timestamps,
and provider error. The only things joined in are the student's current name and
batch, and only because a list needs something to scan and something to click.

## Query design

`src/lib/documents/email-queries.ts`, beside the existing reads:

```ts
getEmailActivity(filters, page) -> { items, page, pageCount, total, firstRow, lastRow }
getEmailActivitySummary(filters) -> { total, delivered, inProgress, needsAttention }
```

Both build their query through one internal `activityQuery()`, so a filter
cannot apply to the list and not to the numbers above it.

**The join.** One select, using the real foreign keys:
`student_email_log.student_id -> students.id` (migration 0008) and
`students.batch_id -> batches.id` (migration 0001).

```
student:students(id, first_name, middle_name, last_name, batch:batches(id, name))
```

**Columns.** Everything except `body_html` and `idempotency_key`. The HTML body
is the largest column on the table and nothing renders it - the dialog shows the
structured snapshot and the exact plain text - so fifty of them per page would
be megabytes fetched to display none of it.

**Search across two tables.** The search box asks one question - "this student,
or this recipient address" - and PostgREST cannot express an OR that spans a
join. The roster is therefore asked first, through the same
`buildStudentSearchFilter()` the Students page uses (now exported rather than
re-spelled), and the log is filtered by `recipient_email ILIKE` OR
`student_id IN (matched ids)`. Inactive students are included: a deactivated
student's emails are part of the permanent record.

**Ordering.** `created_at DESC, id DESC`. `created_at` is the indexed column and
the only one never null - `sent_at` is still empty on a row whose send never
reached the provider - and the `id` tiebreaker stops a bulk send of twenty-seven
rows written in the same millisecond from shuffling across a page boundary.

**Sender names.** The existing rule, now shared by both readers through
`resolveSenderNames()`: the frozen `sent_by_name` wins, and a profile lookup runs
only for rows that have none. Historical values are never replaced by today's.

## Filters

All server-backed, all in the URL, none applied in the browser.

| Param | Values |
| --- | --- |
| `q` | student name / number / email, or recipient address |
| `batch` | batch id |
| `status` | one of the eight statuses |
| `group` | `delivered`, `in_progress`, `needs_attention` |
| `type` | `document_status`, `document_reminder` |
| `range` | `all`, `today`, `7d`, `30d` |
| `page` | 1-based |

`status` and `group` are two ways of asking one question, so the controls clear
each other: choosing a status clears the chip, choosing a chip clears the status.
A hand-written URL carrying both is answered by intersecting them, which may
legitimately match nothing rather than silently dropping one of the two.

Junk values are dropped by the type guards in `constants.ts`, never passed to the
database. "Clear filters" is a plain link back to `/activity`.

**Today** is read in `America/Toronto`, not UTC. A staff member filtering at 8pm
in Toronto is already on the next UTC day, and a UTC boundary would have hidden
every email they sent that afternoon.

## Pagination

50 per page, newest first, server-side via `.range()` with an exact count.
`emailActivityHref()` carries the whole filter state and changes only the page
number, so filters survive paging; changing any *filter* resets to page 1,
because page 7 of the old result set is a meaningless place to land in the new
one. A page number past the end is clamped to the last page that exists.

## Status group definitions

A grouping of the existing eight statuses, never a second vocabulary. The group
lists are built from the unresolved/final split, so a ninth status cannot be
added to one and forgotten in the other.

| Group | Statuses |
| --- | --- |
| Delivered | `delivered` |
| In Progress | `pending`, `accepted`, `sent`, `delivery_delayed` |
| Needs Attention | `bounced`, `failed`, `complained` |

Accepted and Sent are never worded as, grouped with, or counted as Delivered.
Row labels stay the individual status: Accepted by Resend, Sent, Delivered,
Delivery Delayed, Bounced, Failed, Marked as Spam.

## Polling behaviour

`EmailStatusAutoRefresh` - `useRouter()`, `useEffect()`, `setInterval`,
`router.refresh()`. No Supabase Realtime, no websocket, no new endpoint.

- **Unresolved** (keep polling): `pending`, `accepted`, `sent`, `delivery_delayed`
- **Final** (stop): `delivered`, `bounced`, `failed`, `complained`

The timer is created only when at least one email *currently rendered* is
unresolved, and is cleared on unmount and whenever that flips, so there is one
interval per mount and none at all on a page of finished emails. Ticks are
skipped while `document.visibilityState === "hidden"`, and a `visibilitychange`
listener catches up the moment the tab is looked at again.

Note what the rule does not do: it does not decide that a row which has been
Sent for three weeks is finished. Sent means the provider passed the message on
and never reported the outcome, so the page keeps asking rather than claim a
delivery nobody confirmed. The indicator reads "Checking delivery updates..."
while active and "Delivery statuses up to date." once every visible row is final.

The same component is used on the student's Email History, where the items are
still server-loaded and passed in exactly as before.

## Security decisions

- Reads go through `createSupabaseServerClient()` (anon key, RLS applies), after
  `requireActiveStaff()`. **The service role is not used anywhere on this page.**
  `SUPABASE_SERVICE_ROLE_KEY` stays server-only, in the send path and the webhook.
- Active staff hold `SELECT` on `student_email_log` and nothing else. There is no
  delete button, no edit button, and no manual status override - and none could
  be added from a browser session, because there is no policy that would let one
  write.
- The webhook remains the only way a status moves. Untouched by this ticket.
- Visiting `/activity` contacts no provider and sends no email.
- Unauthenticated requests to `/activity` are redirected to `/login` by
  `src/proxy.ts` before any query runs.
- The list omits `body_html` and `idempotency_key` from what is sent to the
  browser.

## Testing checklist

Verified in the browser against the live database, signed in as active staff:

1. Activity page loads for authenticated active staff - yes
2. Existing logs appear newest first - yes, 26 rows
3. Student name links to the student record - yes
4. Batch shown per row - yes
5. Recipient is the historical `recipient_email` - yes
6. Sent-by uses the historical `sent_by_name` - yes
7. Delivered renders - yes
8. Sent renders, distinct from Delivered - yes
9. Bounced renders - yes, 2 rows
10. Failed / complained labels available - present in the vocabulary; no such
    rows exist in the database yet, so not observed live
11. Search by student works - yes (`q=NIDHI`)
12. Search by recipient email works - yes (`q=nidhin783@gmail.com`)
13. Batch filter - options load from `listBatches()`; filter path exercised by
    the same `.in("student_id", ...)` used by search
14. Status filter - yes
15. Email type filter - yes (`type=document_reminder`)
16. Quick Delivered filter - yes
17. Quick In Progress filter - yes (3 rows)
18. Quick Needs Attention filter - yes (2 rows)
19. Pagination preserves filters - covered by `npm run check:email`; only 26 rows
    exist, so a second page could not be shown live
20. View Email shows the exact stored snapshot - yes
21. A long provider error does not break the layout - yes, clipped to one line in
    the row and shown whole in the dialog
22. Auto-refresh with an unresolved status - yes, a refresh observed in the dev
    server log
23. Polling stops when all rendered statuses are final - yes, indicator reads
    "Delivery statuses up to date."
24. Student Email History auto-refreshes - yes, indicator active on a student
    whose email is Sent
25. Student Email History stops when final - same component and rule
26. No timer leaks - interval cleared on unmount and on the active flag flipping
27. No email is sent by visiting Activity - no provider call exists on this path
28. No status can be edited - no write path, no policy
29. No log can be deleted - no delete policy, plus the 0008 trigger
30. Send Status Email still works - untouched
31. Batch reminder send still works - untouched
32. Webhook still returns and updates - untouched
33. No service role key client-side - the page uses the anon-key server client

Plus 29 new automated checks in `npm run check:email` covering the group
partition, the unresolved/final rule, filter parsing, href behaviour, pagination
arithmetic, and provider-error truncation.

## Files changed

Created:

- `src/lib/documents/email-activity.ts`
- `src/components/documents/EmailActivityList.tsx`
- `src/components/documents/EmailActivitySummaryCards.tsx`
- `src/components/documents/EmailActivityToolbar.tsx`
- `src/components/documents/EmailActivityPagination.tsx`
- `src/components/documents/EmailStatusAutoRefresh.tsx`
- `docs/tickets/PLACEMENT-06A1-email-activity.md`

Modified:

- `src/app/(app)/activity/page.tsx` - the placeholder became the real page
- `src/lib/placement/constants.ts` - unresolved/final split and the three groups
- `src/lib/documents/email-queries.ts` - `getEmailActivity`,
  `getEmailActivitySummary`, shared `resolveSenderNames`
- `src/lib/students/queries.ts` - `buildStudentSearchFilter` exported
- `src/components/documents/StudentEmailHistory.tsx` - live refresh added;
  rendering unchanged
- `scripts/check-document-email-rendering.ts` - checks for the new pure rules
- `docs/product/student-document-email.md` - Activity and polling documented

## No migration

None was created and none was needed. Everything this page reads already exists
in `supabase/migrations/0008_student_document_email.sql`: the log row and every
column on it, the `student_email_log_student_idx` and `student_email_log_status_idx`
indexes the filters lean on, and the `SELECT`-only grant for authenticated staff
that the page relies on.
