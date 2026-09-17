import EmailActivityList from "@/components/documents/EmailActivityList";
import EmailActivityPagination from "@/components/documents/EmailActivityPagination";
import EmailActivitySummaryCards from "@/components/documents/EmailActivitySummaryCards";
import EmailActivityToolbar from "@/components/documents/EmailActivityToolbar";
import EmailStatusAutoRefresh from "@/components/documents/EmailStatusAutoRefresh";
import PageHeader from "@/components/ui/PageHeader";
import {
  emailActivityValuesFrom,
  emailActivityFiltersFrom,
  emailCountLabel,
  hasActiveEmailActivityFilters,
  pageNumberFrom,
} from "@/lib/documents/email-activity";
import {
  getEmailActivity,
  getEmailActivitySummary,
} from "@/lib/documents/email-queries";
import { hasUnresolvedEmailStatus } from "@/lib/placement/constants";
import { listBatches } from "@/lib/students/queries";

export const metadata = {
  title: "Activity",
};

const BASE_PATH = "/activity";

/**
 * Email Activity: every placement document email, across every student.
 *
 * The operational counterpart to the per-student Email History. Staff asking
 * "did that batch reminder get through" should not have to open twenty-seven
 * student records to find out, and the three emails that bounced are the three
 * that matter - so the whole log is readable in one place, newest first, with
 * the failures filterable in a click.
 *
 * ---------------------------------------------------------------------------
 * What this page is, and is not
 * ---------------------------------------------------------------------------
 *
 * It is a READ of student_email_log, which stays the permanent audit record.
 * Nothing on this page sends an email, changes a status, edits a row, or
 * deletes one. Visiting it contacts no provider. Authenticated staff hold
 * SELECT on that table and nothing else, so this is not a UI decision that
 * could be undone by adding a button: there is nothing for a button to call.
 *
 * Statuses move only one way, from the Resend webhook. This page re-reads them
 * every ten seconds while any of them may still change, which is the whole of
 * the live behaviour: no realtime connection, no subscription, no new endpoint.
 *
 * ---------------------------------------------------------------------------
 * Filters
 * ---------------------------------------------------------------------------
 *
 * All of them live in the URL and are answered by the database, never by
 * filtering a page of rows in the browser. The log only grows, so "load it all
 * and filter in JavaScript" is a page that gets slower every week and is wrong
 * the moment it exceeds one page.
 */
export default async function ActivityPage(props: PageProps<"/activity">) {
  const searchParams = await props.searchParams;
  const values = emailActivityValuesFrom(searchParams);
  const filters = emailActivityFiltersFrom(values);
  const requestedPage = pageNumberFrom(values.page);

  const [activity, summary, batches] = await Promise.all([
    getEmailActivity(filters, requestedPage),
    getEmailActivitySummary(filters),
    listBatches(),
  ]);

  const filtered = hasActiveEmailActivityFilters(values);

  // The polling rule, decided by what is ACTUALLY ON SCREEN. A page of finished
  // emails stops asking even when an unresolved one sits on page nine, and any
  // row still capable of changing keeps it going.
  const hasUnresolved = hasUnresolvedEmailStatus(
    activity.items.map((item) => item.status),
  );

  return (
    <>
      <PageHeader
        title="Activity"
        description="A central record of placement document emails sent to students."
      />

      <section aria-labelledby="email-activity-heading">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2
              id="email-activity-heading"
              className="text-[26px] font-semibold tracking-tight text-ink"
            >
              Email Activity
            </h2>
            <p className="mt-2 max-w-3xl text-[17px] text-ink-muted">
              Delivery statuses come from the email provider and update on their
              own. Accepted and Sent mean the message is on its way, not that it
              arrived.
            </p>
          </div>

          <EmailStatusAutoRefresh active={hasUnresolved} />
        </div>

        <div className="mb-4">
          <EmailActivitySummaryCards
            basePath={BASE_PATH}
            values={values}
            summary={summary}
          />
        </div>
        <p className="mb-10 text-[15px] text-ink-muted">
          {filtered
            ? "Counts for the current search, batch, type, and date filters. Choosing one of these cards filters the list below."
            : "Counts across every placement email. Choosing one of these cards filters the list below."}
        </p>

        <div className="mb-7">
          <EmailActivityToolbar
            basePath={BASE_PATH}
            values={values}
            batches={batches}
          />
        </div>

        <p className="mb-6 text-[17px] text-ink-muted">
          {activity.total === 0
            ? filtered
              ? "No emails match these filters."
              : "No placement document emails have been sent yet."
            : `Showing ${activity.firstRow}-${activity.lastRow} of ${emailCountLabel(
                activity.total,
              )}, newest first.`}
        </p>

        <EmailActivityList
          items={activity.items}
          emptyMessage={
            filtered
              ? "No emails match this search. Try clearing the filters."
              : "No placement document emails have been sent yet. They appear here as soon as staff send one from a student's placement documents."
          }
        />

        <EmailActivityPagination
          basePath={BASE_PATH}
          values={values}
          info={activity}
        />
      </section>
    </>
  );
}
