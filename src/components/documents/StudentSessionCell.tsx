"use client";

import { useState, useTransition } from "react";

import {
  CLASS_SESSIONS,
  CLASS_SESSION_LABELS,
  CLASS_SESSION_NOT_SET_LABEL,
  classSessionLabel,
  isClassSession,
  type ClassSession,
} from "@/lib/placement/constants";
import { setStudentClassSessionAction } from "@/lib/students/actions";

import {
  GRID_ERROR_CLASSES,
  GRID_SAVING_CLASSES,
  GRID_SELECT_CLASSES,
} from "./batch-grid-tones";

/**
 * The Session cell of the Batch Document Grid: Not Set, Morning, or Evening.
 *
 * This is students.class_session, a STUDENT level field. A batch is not
 * purely Morning or Evening, so the batch's schedule label is never consulted
 * and never changed from here. Saving writes that one column and nothing else.
 *
 * Any active staff member may edit a student, so any active staff member may
 * set this; the database policy is what enforces it. The same save pattern
 * as the status cell: the chosen value while saving, the stored value plus an
 * error and Retry if the save fails.
 */
const SESSION_CLASSES: Record<ClassSession | "unset", string> = {
  morning: "border-warning-line bg-warning-soft text-warning-ink",
  evening: "border-info-line bg-info-soft text-info-ink",
  unset: "border-line bg-surface text-ink-muted",
};

export default function StudentSessionCell({
  studentId,
  studentName,
  value,
  canEdit,
}: {
  studentId: string;
  studentName: string;
  value: ClassSession | null;
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<ClassSession | null | undefined>(
    undefined,
  );
  const [failed, setFailed] = useState<ClassSession | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  const shown = draft === undefined ? value : draft;
  const classes = SESSION_CLASSES[shown ?? "unset"];

  function save(next: ClassSession | null) {
    if (next === value) {
      setDraft(undefined);
      setFailed(undefined);
      setError(null);
      return;
    }
    setDraft(next);
    setFailed(undefined);
    setError(null);
    startTransition(async () => {
      const result = await setStudentClassSessionAction({
        studentId,
        classSession: next,
      });
      if (result.error) {
        setDraft(undefined);
        setFailed(next);
        setError(result.error);
        return;
      }
      setDraft(undefined);
    });
  }

  if (!canEdit) {
    return (
      <span
        className={`inline-flex h-8 items-center rounded-md border px-2 text-[13px] font-medium ${classes}`}
      >
        {classSessionLabel(value)}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="sr-only" htmlFor={`grid-session-${studentId}`}>
        Session for {studentName}
      </label>
      <select
        id={`grid-session-${studentId}`}
        value={shown ?? ""}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "") save(null);
          else if (isClassSession(next)) save(next);
        }}
        className={`${GRID_SELECT_CLASSES} ${classes}`}
      >
        <option value="">{CLASS_SESSION_NOT_SET_LABEL}</option>
        {CLASS_SESSIONS.map((session) => (
          <option key={session} value={session}>
            {CLASS_SESSION_LABELS[session]}
          </option>
        ))}
      </select>

      {pending ? (
        <span className={GRID_SAVING_CLASSES} aria-live="polite">
          Saving...
        </span>
      ) : null}

      {error && !pending ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span role="alert" className={GRID_ERROR_CLASSES}>
            {error}
          </span>
          {failed !== undefined ? (
            <button
              type="button"
              onClick={() => save(failed)}
              className="text-[12px] font-semibold text-brand-strong underline underline-offset-2"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
