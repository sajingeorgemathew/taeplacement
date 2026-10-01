"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { readinessTone } from "@/components/documents/ReadinessSummary";
import { PlacementStatusPill } from "@/components/ui/StatusPill";
import {
  GRID_STATUS_TONES,
  NOT_INITIALIZED_LABEL,
  requirementColumnLabel,
  type BatchDocumentGrid as BatchDocumentGridData,
  type GridRow,
} from "@/lib/documents/batch-grid";
import type { DocumentReadiness } from "@/lib/documents/queries";
import { studentFullName } from "@/lib/format";
import {
  PLACEMENT_DOCUMENT_STATUSES,
  PLACEMENT_DOCUMENT_STATUS_LABELS,
} from "@/lib/placement/constants";

import { GRID_TONE_CLASSES } from "./batch-grid-tones";
import BatchDocumentStatusCell from "./BatchDocumentStatusCell";
import StudentGeneralNotesCell from "./StudentGeneralNotesCell";
import StudentSessionCell from "./StudentSessionCell";

/**
 * The Batch Document Grid. PLACEMENT-07B.1.
 *
 * An Excel-like matrix: one student per row, one ACTIVE requirement per
 * column, the stored status in every cell. Deliberately denser than the rest
 * of TAE Placement, because its job is to let staff see and work a whole
 * batch at once instead of opening fifty students one by one.
 *
 *   sticky header          the requirement names stay visible while scrolling
 *                          down fifty rows
 *   sticky Student column  the name stays visible while scrolling sideways
 *                          across thirteen documents
 *   sticky Session column  Morning / Evening stays beside the name
 *   horizontal scroll      the grid is as wide as the batch's checklist and
 *                          is never squeezed onto a phone width
 *
 * Everything in the grid is already in memory: the page read the batch, the
 * students, the requirements, the readiness view, the checklist rows, and the
 * latest notes in a fixed handful of queries and built the matrix once. Each
 * cell saves through the existing per-row server actions, so one change is
 * one row.
 */

const STUDENT_COLUMN_WIDTH = "14rem";
const SESSION_COLUMN_WIDTH = "7.5rem";

const HEADER_CELL =
  "sticky top-0 z-20 border-b border-r border-line bg-surface-muted px-2 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-ink-muted";

const BODY_CELL =
  "border-b border-r border-line bg-surface px-2 py-1.5 align-top group-hover:bg-brand-soft";

/** "9 / 13", coloured the way the student list colours "9/13 documents". */
function ReadinessCell({
  readiness,
}: {
  readiness: DocumentReadiness | undefined;
}) {
  if (!readiness || readiness.requiredTotal === 0) {
    return <span className="text-[13px] text-ink-muted">-</span>;
  }
  const tone = readinessTone(readiness);
  const classes =
    tone === "ready"
      ? "border-ready-line bg-ready-soft text-ready-ink"
      : tone === "attention"
        ? "border-attention-line bg-attention-soft text-attention-ink"
        : "border-line bg-surface-muted text-ink-muted";

  return (
    <span
      className={`inline-flex h-8 items-center whitespace-nowrap rounded-md border px-2 text-[13px] font-semibold tabular-nums ${classes}`}
      title="Required placement documents ready"
    >
      {readiness.requiredReady} / {readiness.requiredTotal}
    </span>
  );
}

function Legend() {
  return (
    <ul
      aria-label="Status colours"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-muted"
    >
      {PLACEMENT_DOCUMENT_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`inline-block h-3.5 w-3.5 rounded-sm border ${GRID_TONE_CLASSES[GRID_STATUS_TONES[status]]}`}
          />
          {PLACEMENT_DOCUMENT_STATUS_LABELS[status]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`inline-block h-3.5 w-3.5 rounded-sm border ${GRID_TONE_CLASSES.missing}`}
        />
        {NOT_INITIALIZED_LABEL}
      </li>
    </ul>
  );
}

function StudentRow({
  row,
  columns,
  canManageDocuments,
  canEditStudents,
  canAddNotes,
}: {
  row: GridRow;
  columns: BatchDocumentGridData["columns"];
  canManageDocuments: boolean;
  canEditStudents: boolean;
  canAddNotes: boolean;
}) {
  const { student } = row;
  const name = studentFullName(student);

  return (
    <tr className="group">
      <td
        className={`${BODY_CELL} sticky left-0 z-10`}
        style={{ width: STUDENT_COLUMN_WIDTH, minWidth: STUDENT_COLUMN_WIDTH }}
      >
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/students/${student.id}`}
            className="truncate text-[14px] font-semibold text-ink hover:text-brand-strong hover:underline"
            title={name}
          >
            {name}
          </Link>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            <span className="truncate">{student.student_number}</span>
            {student.is_returning ? (
              <span className="shrink-0 rounded-full border border-line bg-surface-muted px-1.5 text-[11px] font-medium">
                Returning
              </span>
            ) : null}
          </span>
        </div>
      </td>

      <td
        className={`${BODY_CELL} sticky z-10`}
        style={{
          left: STUDENT_COLUMN_WIDTH,
          width: SESSION_COLUMN_WIDTH,
          minWidth: SESSION_COLUMN_WIDTH,
        }}
      >
        <StudentSessionCell
          studentId={student.id}
          studentName={name}
          value={student.class_session}
          canEdit={canEditStudents}
        />
      </td>

      <td className={`${BODY_CELL} whitespace-nowrap`}>
        <PlacementStatusPill status={student.placement_status} size="small" />
      </td>

      <td className={`${BODY_CELL} whitespace-nowrap`}>
        <ReadinessCell readiness={row.readiness} />
      </td>

      {columns.map((requirement) => (
        <td
          key={requirement.id}
          className={`${BODY_CELL} min-w-[10.5rem]`}
        >
          <BatchDocumentStatusCell
            cell={row.cells[requirement.id]}
            studentName={name}
            requirementName={requirement.name}
            canManage={canManageDocuments}
          />
        </td>
      ))}

      <td className={`${BODY_CELL} min-w-[16rem] max-w-[20rem]`}>
        <StudentGeneralNotesCell
          studentId={student.id}
          studentName={name}
          latestNote={row.latestNote}
          noteCount={row.noteCount}
          canAdd={canAddNotes}
        />
      </td>

      <td className={`${BODY_CELL} whitespace-nowrap`}>
        <Link
          href={`/students/${student.id}`}
          className="inline-flex h-8 items-center gap-0.5 rounded-md px-1.5 text-[13px] font-semibold text-brand-strong hover:bg-brand-soft"
        >
          Open
          <ChevronRight size={15} aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

export default function BatchDocumentGrid({
  grid,
  canManageDocuments,
  canEditStudents,
  canAddNotes,
  emptyMessage,
}: {
  grid: BatchDocumentGridData;
  canManageDocuments: boolean;
  canEditStudents: boolean;
  canAddNotes: boolean;
  emptyMessage: string;
}) {
  if (grid.rows.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8">
        <p className="text-[17px] text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <p className="text-[13px] text-ink-muted">
          {grid.columns.length === 1
            ? "1 active requirement"
            : `${grid.columns.length} active requirements`}
          . Scroll sideways to see every column.
        </p>
      </div>

      <div className="max-h-[75vh] overflow-auto rounded-2xl border border-line bg-surface">
        <table className="min-w-max border-separate border-spacing-0 text-[14px]">
          <thead>
            <tr>
              <th
                scope="col"
                className={`${HEADER_CELL} left-0 z-30`}
                style={{
                  width: STUDENT_COLUMN_WIDTH,
                  minWidth: STUDENT_COLUMN_WIDTH,
                }}
              >
                Student
              </th>
              <th
                scope="col"
                className={`${HEADER_CELL} z-30`}
                style={{
                  left: STUDENT_COLUMN_WIDTH,
                  width: SESSION_COLUMN_WIDTH,
                  minWidth: SESSION_COLUMN_WIDTH,
                }}
              >
                Session
              </th>
              <th scope="col" className={HEADER_CELL}>
                Placement
              </th>
              <th scope="col" className={HEADER_CELL} title="Required documents ready">
                Ready
              </th>
              {grid.columns.map((requirement) => (
                <th
                  key={requirement.id}
                  scope="col"
                  className={`${HEADER_CELL} min-w-[10.5rem]`}
                  title={requirement.name}
                >
                  <span className="block truncate normal-case tracking-normal text-[13px] text-ink">
                    {requirementColumnLabel(requirement)}
                  </span>
                  {requirement.is_required ? null : (
                    <span className="block text-[11px] font-medium normal-case tracking-normal">
                      Optional
                    </span>
                  )}
                </th>
              ))}
              <th scope="col" className={`${HEADER_CELL} min-w-[16rem]`}>
                General Notes
              </th>
              <th scope="col" className={HEADER_CELL}>
                Open
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <StudentRow
                key={row.student.id}
                row={row}
                columns={grid.columns}
                canManageDocuments={canManageDocuments}
                canEditStudents={canEditStudents}
                canAddNotes={canAddNotes}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
