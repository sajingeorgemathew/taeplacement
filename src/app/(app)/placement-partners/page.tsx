import { Building2, CircleAlert, Columns3, List, MapPinOff, Plus } from "lucide-react";
import Link from "next/link";

import AreaBoard from "@/components/partners/AreaBoard";
import { PartnerList } from "@/components/partners/PartnerList";
import PartnerToolbar from "@/components/partners/PartnerToolbar";
import SummaryBlock from "@/components/ui/SummaryBlock";
import { canManagePartners, getStaffSession } from "@/lib/auth/session";
import { partnerCountLabel } from "@/lib/format";
import {
  hasActivePartnerFilters,
  partnerFiltersFrom,
  partnerHref,
  partnerToolbarValuesFrom,
  partnerViewFrom,
} from "@/lib/partners/filters";
import {
  getPartnerCounts,
  listPartners,
  listPlacementAreas,
} from "@/lib/partners/queries";
import { UNASSIGNED_AREA_ID } from "@/lib/placement/constants";

export const metadata = {
  title: "Placement Partners",
};

const BASE_PATH = "/placement-partners";

/** The two view controls. Area Board is the default. */
function ViewSwitch({
  current,
  boardHref,
  listHref,
}: {
  current: "board" | "list";
  boardHref: string;
  listHref: string;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-2xl px-6 py-4 text-[17px] font-semibold transition-colors";
  const on = "bg-brand text-white";
  const off =
    "border border-line bg-surface text-ink hover:border-brand hover:bg-brand-soft hover:text-brand-strong";

  return (
    <div
      role="group"
      aria-label="Choose how to view placement partners"
      className="flex flex-wrap gap-3"
    >
      <Link
        href={boardHref}
        aria-current={current === "board" ? "true" : undefined}
        className={`${base} ${current === "board" ? on : off}`}
      >
        <Columns3 size={22} aria-hidden="true" />
        Area Board
      </Link>
      <Link
        href={listHref}
        aria-current={current === "list" ? "true" : undefined}
        className={`${base} ${current === "list" ? on : off}`}
      >
        <List size={22} aria-hidden="true" />
        List View
      </Link>
    </div>
  );
}

export default async function PlacementPartnersPage(
  props: PageProps<"/placement-partners">,
) {
  const searchParams = await props.searchParams;
  const values = partnerToolbarValuesFrom(searchParams);
  const view = partnerViewFrom(values);

  const [areas, partners, counts, session] = await Promise.all([
    listPlacementAreas(),
    listPartners(partnerFiltersFrom(values)),
    getPartnerCounts(),
    getStaffSession(),
  ]);

  const activeAreas = areas.filter((area) => area.is_active);
  const canManage = canManagePartners(session);
  const filtered = hasActivePartnerFilters(values);
  const showingArchived = values.archived === "1";

  return (
    <>
      <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[38px] font-semibold leading-tight tracking-tight text-ink sm:text-[42px]">
            Placement Partners
          </h1>
          <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
            Organize LTCs and placement locations, contacts, and areas.
          </p>
        </div>

        {canManage ? (
          <Link
            href="/placement-partners/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            <Plus size={22} aria-hidden="true" />
            Add Partner
          </Link>
        ) : null}
      </div>

      <section aria-labelledby="partner-summary-heading" className="mb-10">
        <h2 id="partner-summary-heading" className="sr-only">
          Partner network summary
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <SummaryBlock
            label="Placement Partners"
            value={counts.total}
            note="Active partner accounts across every area."
            tone="info"
            icon={Building2}
          />
          <SummaryBlock
            label="Needs an Area"
            value={counts.unassigned}
            note="Unassigned partners, and partners whose area was archived."
            tone="attention"
            icon={MapPinOff}
            href={`${BASE_PATH}?view=list&area=${UNASSIGNED_AREA_ID}`}
          />
          <SummaryBlock
            label="No Contacts Yet"
            value={counts.withoutContacts}
            note="Partners with no contact person recorded."
            tone="attention"
            icon={CircleAlert}
            href={`${BASE_PATH}?view=list&contacts=without`}
          />
        </div>
      </section>

      <div className="mb-7 flex flex-col gap-6">
        <ViewSwitch
          current={view}
          boardHref={partnerHref(BASE_PATH, values, { view: "" })}
          listHref={partnerHref(BASE_PATH, values, { view: "list" })}
        />
        <PartnerToolbar
          basePath={BASE_PATH}
          values={values}
          areas={activeAreas}
          showFilters={view === "list"}
        />
      </div>

      {showingArchived ? (
        <p className="mb-6 rounded-2xl border border-info-line bg-info-soft px-6 py-4 text-[16px] text-info-ink">
          Showing archived partners. They are kept as records and stay off the
          Area Board.{" "}
          <Link
            href={partnerHref(BASE_PATH, values, { archived: "" })}
            className="font-semibold underline"
          >
            Show current partners
          </Link>
        </p>
      ) : null}

      {view === "board" ? (
        <section aria-labelledby="area-board-heading">
          <h2
            id="area-board-heading"
            className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
          >
            Area Board
          </h2>
          <p className="mb-6 text-[17px] text-ink-muted">
            {filtered
              ? `Showing ${partnerCountLabel(partners.length)} for the current search.`
              : `Unassigned first, then every area an admin has set up. Showing all ${partnerCountLabel(partners.length)}.`}
          </p>

          <AreaBoard
            areas={activeAreas}
            partners={partners}
            canManage={canManage}
          />

          {activeAreas.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-line bg-surface p-8">
              <p className="text-[17px] text-ink-muted">
                There are no areas yet, so every partner sits in Unassigned. An
                admin sets areas up in Placement Areas.
              </p>
              <Link
                href="/admin/placement-areas"
                className="mt-5 inline-flex rounded-2xl border border-line px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
              >
                Open Placement Areas
              </Link>
            </div>
          ) : null}
        </section>
      ) : (
        <section aria-labelledby="partner-list-heading">
          <h2
            id="partner-list-heading"
            className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
          >
            All Placement Partners
          </h2>
          <p className="mb-6 text-[17px] text-ink-muted">
            {filtered
              ? `Showing ${partnerCountLabel(partners.length)} for the current search and filters.`
              : `Showing all ${partnerCountLabel(partners.length)}.`}
          </p>

          <PartnerList
            partners={partners}
            emptyMessage={
              filtered
                ? "No partners match this search. Try clearing the filters."
                : "No partners yet. Use Add Partner to create the first record."
            }
          />
        </section>
      )}

      {counts.archived > 0 && !showingArchived ? (
        <p className="mt-8 text-[16px] text-ink-muted">
          {partnerCountLabel(counts.archived)} archived.{" "}
          <Link
            href={partnerHref(BASE_PATH, values, {
              view: "list",
              archived: "1",
            })}
            className="font-medium text-brand-strong hover:underline"
          >
            Show archived partners
          </Link>
        </p>
      ) : null}
    </>
  );
}
