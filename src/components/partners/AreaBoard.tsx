"use client";

import {
  CalendarClock,
  GripVertical,
  MapPin,
  MessageSquare,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import StatusPill from "@/components/ui/StatusPill";
import {
  availabilityChipLabel,
  compactIntakeDate,
  contactCountLabel,
  partnerCountLabel,
} from "@/lib/format";
import { setPartnerAreaAction } from "@/lib/partners/actions";
import { areaColorStyle, type AreaColorStyle } from "@/lib/partners/area-colors";
import type { PartnerListItem } from "@/lib/partners/queries";
import {
  AVAILABILITY_STATUS_TONES,
  DEFAULT_AREA_COLOR_KEY,
  RELATIONSHIP_STATUS_LABELS,
  UNASSIGNED_AREA_ID,
  UNASSIGNED_AREA_LABEL,
} from "@/lib/placement/constants";
import type { PlacementAreaRow } from "@/lib/supabase/database.types";

type AreaBoardProps = {
  /** Active areas in sort order. The board never hard-codes a column. */
  areas: PlacementAreaRow[];
  partners: PartnerListItem[];
  /** Only admin and placement_manager may move a partner. */
  canManage: boolean;
};

/** A column id of null is the special Unassigned column. */
type ColumnKey = string | null;

/**
 * Horizontal auto-scroll while a card is being dragged.
 *
 * EDGE_ZONE is wide enough to be easy to hit and narrow enough that an ordinary
 * drop near a column edge does not start the board moving. The speed ramps from
 * MIN to MAX across that zone, so resting just inside it creeps and pushing all
 * the way to the edge travels several columns in one drag.
 */
const EDGE_ZONE = 120;
const MIN_SPEED = 5;
const MAX_SPEED = 26;

function partnerCity(partner: PartnerListItem): string | null {
  if (partner.city) {
    return partner.province ? `${partner.city}, ${partner.province}` : partner.city;
  }
  return null;
}

/**
 * The horizontal Area Board.
 *
 * Columns come from the database: Unassigned first, then every active
 * placement_area in sort order. Adding, renaming, reordering, recolouring, or
 * archiving an area in Admin changes this board with no code change. Every
 * column's colour comes from its own color_key, never from its position.
 *
 * Dragging uses the browser's own drag and drop, so there is no drag library in
 * the bundle. Dragging a card towards either edge of the board scrolls the BOARD
 * horizontally, never the page, so an area several columns away is reachable in
 * one continuous drag. Every card also carries a "Move to Area" select, which is
 * the path keyboard users, touch devices, and tablets take. That fallback is not
 * a nicety; it is how the board works without a mouse.
 */
export default function AreaBoard({
  areas,
  partners,
  canManage,
}: AreaBoardProps) {
  // Optimistic area per partner, so a dropped card lands immediately and is
  // reverted only if the database refuses the move.
  const [moved, setMoved] = useState<Record<string, ColumnKey>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ColumnKey | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Scroll the board, and only the board, while a drag is in progress.
   *
   * The pointer position is read from the document's own dragover events, which
   * keep firing over gaps between columns and over the page around the board, so
   * the scroll does not stall the moment the cursor leaves a drop target. The
   * animation frame loop lives for exactly as long as the drag does.
   */
  useEffect(() => {
    if (!draggingId) return;

    let pointerX: number | null = null;
    let frame = 0;

    function onDragOver(event: DragEvent) {
      pointerX = event.clientX;
    }

    function step() {
      const board = scrollerRef.current;
      if (board && pointerX !== null) {
        const bounds = board.getBoundingClientRect();
        const leftDepth = bounds.left + EDGE_ZONE - pointerX;
        const rightDepth = pointerX - (bounds.right - EDGE_ZONE);

        let speed = 0;
        if (leftDepth > 0) {
          speed = -ramp(leftDepth);
        } else if (rightDepth > 0) {
          speed = ramp(rightDepth);
        }

        if (speed !== 0) board.scrollLeft += speed;
      }
      frame = requestAnimationFrame(step);
    }

    document.addEventListener("dragover", onDragOver);
    frame = requestAnimationFrame(step);

    return () => {
      document.removeEventListener("dragover", onDragOver);
      cancelAnimationFrame(frame);
    };
  }, [draggingId]);

  const activeAreaIds = new Set(areas.map((area) => area.id));

  /** Where a card sits right now, after any optimistic move. */
  function columnOf(partner: PartnerListItem): ColumnKey {
    const areaId =
      partner.id in moved ? moved[partner.id] : partner.area_id;
    // A partner left behind by an archived area is surfaced under Unassigned
    // rather than lost off the board.
    if (areaId && !activeAreaIds.has(areaId)) return null;
    return areaId;
  }

  function needsArea(partner: PartnerListItem): boolean {
    const areaId = partner.id in moved ? moved[partner.id] : partner.area_id;
    return Boolean(areaId) && !activeAreaIds.has(areaId as string);
  }

  function move(partner: PartnerListItem, target: ColumnKey) {
    if (!canManage) return;
    if (columnOf(partner) === target && !needsArea(partner)) return;

    const previous = partner.id in moved ? moved[partner.id] : partner.area_id;
    setError(null);
    setMoved((current) => ({ ...current, [partner.id]: target }));

    startTransition(async () => {
      const result = await setPartnerAreaAction({
        partnerId: partner.id,
        areaId: target,
      });
      if (result.error) {
        setMoved((current) => ({ ...current, [partner.id]: previous }));
        setError(result.error);
      }
    });
  }

  const columns: {
    key: ColumnKey;
    name: string;
    description: string | null;
    style: AreaColorStyle;
  }[] = [
    {
      key: null,
      name: UNASSIGNED_AREA_LABEL,
      description: "Partners that still need an area.",
      // Unassigned is not a placement_areas row, so it has no color_key. It is
      // always the neutral column.
      style: areaColorStyle(DEFAULT_AREA_COLOR_KEY),
    },
    ...areas.map((area) => ({
      key: area.id as ColumnKey,
      name: area.name,
      description: area.description,
      style: areaColorStyle(area.color_key),
    })),
  ];

  const byColumn = new Map<ColumnKey, PartnerListItem[]>();
  for (const column of columns) byColumn.set(column.key, []);
  for (const partner of partners) {
    const key = columnOf(partner);
    byColumn.get(key)?.push(partner);
  }

  const partnerById = new Map(partners.map((partner) => [partner.id, partner]));

  function onDrop(key: ColumnKey, partnerId: string) {
    setDragOver(undefined);
    setDraggingId(null);
    const partner = partnerById.get(partnerId);
    if (partner) move(partner, key);
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {error}
        </p>
      ) : null}

      {canManage ? (
        <p className="text-[16px] text-ink-muted">
          Drag a partner card into an area, or use Move to Area on the card.
          Dragging towards either edge of the board scrolls it to the areas
          further along.
        </p>
      ) : (
        <p className="text-[16px] text-ink-muted">
          You can open any partner here. Moving partners between areas is done by
          a placement manager or an admin.
        </p>
      )}

      <div
        ref={scrollerRef}
        className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-5"
      >
        {columns.map((column) => {
          const items = byColumn.get(column.key) ?? [];
          const isTarget = dragOver === column.key;

          return (
            <section
              key={column.key ?? UNASSIGNED_AREA_ID}
              aria-label={`${column.name}, ${partnerCountLabel(items.length)}`}
              onDragOver={(event) => {
                if (!canManage || !draggingId) return;
                event.preventDefault();
                setDragOver(column.key);
              }}
              onDragLeave={() => {
                if (dragOver === column.key) setDragOver(undefined);
              }}
              onDrop={(event) => {
                if (!canManage) return;
                event.preventDefault();
                const id =
                  event.dataTransfer.getData("text/plain") || draggingId || "";
                if (id) onDrop(column.key, id);
              }}
              className={`flex w-[20rem] shrink-0 flex-col rounded-3xl border p-4 transition-colors sm:w-[22rem] ${
                isTarget ? column.style.dropTarget : column.style.column
              }`}
            >
              <header className="px-2 pb-4 pt-2">
                {/* The strong accent. The column surface behind it stays soft
                    and the cards on top of it stay white. */}
                <span
                  aria-hidden="true"
                  className={`block h-1.5 w-12 rounded-full ${column.style.accent}`}
                />
                <h3
                  className={`mt-3 text-[21px] font-semibold leading-tight ${column.style.heading}`}
                >
                  {column.name}
                </h3>
                <p className={`mt-1 text-[16px] ${column.style.muted}`}>
                  {partnerCountLabel(items.length)}
                </p>
              </header>

              <ul className="flex flex-1 flex-col gap-3">
                {items.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-4 py-7 text-center text-[15px] text-ink-muted">
                    {column.key === null
                      ? "Every partner has an area."
                      : "Drop a partner here."}
                  </li>
                ) : null}

                {items.map((partner) => {
                  const city = partnerCity(partner);
                  const intake = compactIntakeDate(partner);
                  const currentArea = columnOf(partner);

                  return (
                    <li
                      key={partner.id}
                      draggable={canManage}
                      onDragStart={(event) => {
                        if (!canManage) return;
                        event.dataTransfer.setData("text/plain", partner.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingId(partner.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOver(undefined);
                      }}
                      className={`rounded-2xl border border-line bg-surface p-4 transition-opacity ${
                        draggingId === partner.id ? "opacity-50" : ""
                      } ${canManage ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        {canManage ? (
                          <GripVertical
                            size={20}
                            aria-hidden="true"
                            className="mt-1 shrink-0 text-ink-muted"
                          />
                        ) : null}
                        <Link
                          href={`/placement-partners/${partner.id}`}
                          className="min-w-0 flex-1 text-[18px] font-semibold leading-snug text-ink hover:text-brand-strong"
                        >
                          {partner.name}
                        </Link>
                      </div>

                      {city ? (
                        <p className="mt-2 flex items-start gap-2 text-[15px] text-ink-muted">
                          <MapPin
                            size={17}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0"
                          />
                          <span className="min-w-0 break-words">{city}</span>
                        </p>
                      ) : (
                        <p className="mt-2 text-[15px] text-ink-muted">
                          Location not added yet
                        </p>
                      )}

                      {/* Availability comes before the relationship status: it
                          is the question staff actually ask of a card. The chip
                          is the status alone; an upcoming intake adds its date
                          beside it on the same line, so the card does not grow.
                          The availability note is never shown here: it belongs
                          on the partner page, with Last Checked beside it. */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusPill
                          label={availabilityChipLabel(partner)}
                          tone={
                            AVAILABILITY_STATUS_TONES[
                              partner.availability_status
                            ]
                          }
                        />
                        {intake ? (
                          <span className="inline-flex items-center gap-1.5 text-[15px] text-ink-muted">
                            <CalendarClock size={17} aria-hidden="true" />
                            <span className="sr-only">Next intake </span>
                            {intake}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-ink-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <Users size={17} aria-hidden="true" />
                          {contactCountLabel(partner.contactCount)}
                        </span>
                        {partner.noteCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MessageSquare size={17} aria-hidden="true" />
                            {partner.noteCount}
                          </span>
                        ) : null}
                        <span>
                          {
                            RELATIONSHIP_STATUS_LABELS[
                              partner.relationship_status
                            ]
                          }
                        </span>
                      </div>

                      {needsArea(partner) ? (
                        <p className="mt-3 rounded-xl border border-attention-line bg-attention-soft px-3 py-2 text-[14px] text-attention-ink">
                          Its area was archived. Give this partner a new area.
                        </p>
                      ) : null}

                      {canManage ? (
                        <div className="mt-3 border-t border-line pt-3">
                          <label
                            htmlFor={`move-${partner.id}`}
                            className="text-[14px] font-medium text-ink-muted"
                          >
                            Move to Area
                          </label>
                          <select
                            id={`move-${partner.id}`}
                            value={currentArea ?? ""}
                            disabled={pending}
                            onChange={(event) =>
                              move(partner, event.target.value || null)
                            }
                            className="mt-1.5 h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand disabled:opacity-60"
                          >
                            <option value="">{UNASSIGNED_AREA_LABEL}</option>
                            {areas.map((area) => (
                              <option key={area.id} value={area.id}>
                                {area.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Speed for a pointer `depth` pixels inside an edge zone. */
function ramp(depth: number): number {
  const reach = Math.min(depth, EDGE_ZONE) / EDGE_ZONE;
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * reach;
}
