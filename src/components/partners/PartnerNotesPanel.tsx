"use client";

import { MessageSquare, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { emptyFormState } from "@/lib/forms/state";
import {
  commentDayKey,
  commentDayLabel,
  formatTimeOfDay,
} from "@/lib/format";
import { addPartnerNoteAction } from "@/lib/partners/actions";
import type { PartnerNote } from "@/lib/partners/queries";

/** One day's comments, under one "Today" / "September 11, 2026" separator. */
type CommentDay = {
  key: string;
  label: string;
  notes: PartnerNote[];
};

/**
 * Group comments into consecutive days.
 *
 * The comments arrive oldest first, so a single pass is enough: a comment joins
 * the group above it when it falls on the same local calendar day, and starts a
 * new separator otherwise.
 */
function groupByDay(notes: PartnerNote[]): CommentDay[] {
  const days: CommentDay[] = [];

  for (const note of notes) {
    const key = commentDayKey(note.created_at);
    const current = days.at(-1);

    if (current && current.key === key) {
      current.notes.push(note);
      continue;
    }

    days.push({
      key,
      label: commentDayLabel(note.created_at) ?? "Earlier",
      notes: [note],
    });
  }

  return days;
}

type PartnerNotesPanelProps = {
  partnerId: string;
  partnerName: string;
  notes: PartnerNote[];
  /** Distinguishes the field ids when a page shows more than one button. */
  panelId?: string;
};

/**
 * Comments for one placement partner.
 *
 * This is the single operational note and history system for a partner: there
 * is no separate Notes section, and the availability note on the partner page
 * is one current line, not a log. Deliberately a plain comment list, with no
 * threads, replies, or reactions.
 *
 * Same interaction as student comments: a right-side drawer over the partner
 * page, so closing it leaves staff exactly where they were. Inside, comments
 * run oldest at the top to newest at the bottom, under day separators, and the
 * drawer opens scrolled to the newest one, the way a history is actually read.
 */
export default function PartnerNotesPanel({
  partnerId,
  partnerName,
  notes,
  panelId = "top",
}: PartnerNotesPanelProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    addPartnerNoteAction,
    emptyFormState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wasPending = useRef(false);
  const bodyId = `partner-note-body-${panelId}`;
  const days = groupByDay(notes);

  // Clear the box once a comment has been posted successfully.
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Open on the newest comment, and stay on it after posting one. notes.length
  // is what changes when the posted comment comes back from the server, so the
  // same effect covers both.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [open, notes.length]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-2xl border border-brand bg-brand-soft px-6 py-4 text-[17px] font-semibold text-brand-strong transition-colors hover:bg-white"
      >
        <MessageSquare size={22} aria-hidden="true" />
        <span>Comments</span>
        <span className="rounded-full bg-brand px-3 py-0.5 text-[15px] font-semibold text-white">
          {notes.length}
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close comments"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Comments for ${partnerName}`}
            className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-line bg-surface shadow-lg"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
              <div className="min-w-0">
                <h2 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">
                  Comments
                </h2>
                <p className="mt-1 truncate text-[16px] text-ink-muted">
                  {partnerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl px-4 py-3 text-[16px] font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <X size={22} aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-6">
              {days.length === 0 ? (
                <p className="text-[17px] text-ink-muted">
                  No comments yet. Add the first internal note about this
                  partner.
                </p>
              ) : (
                <div className="flex flex-col gap-6">
                  {days.map((day) => (
                    <section key={day.key} aria-label={day.label}>
                      {/* The separator carries the date, so each comment below
                          it only needs its time. */}
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="h-px flex-1 bg-line"
                        />
                        <span className="text-[15px] font-medium text-ink-muted">
                          {day.label}
                        </span>
                        <span
                          aria-hidden="true"
                          className="h-px flex-1 bg-line"
                        />
                      </div>

                      <ul className="mt-4 flex flex-col gap-4">
                        {day.notes.map((note) => (
                          <li
                            key={note.id}
                            className="rounded-2xl border border-line bg-surface-muted p-5"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="text-[16px] font-semibold text-ink">
                                {note.author_name ?? "Staff"}
                              </span>
                              <span className="text-[14px] text-ink-muted">
                                {formatTimeOfDay(note.created_at)}
                              </span>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-[16px] leading-relaxed text-ink">
                              {note.body}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>

            <form
              ref={formRef}
              action={formAction}
              className="border-t border-line px-6 py-5"
            >
              <input type="hidden" name="partner_id" value={partnerId} />
              <label
                htmlFor={bodyId}
                className="text-[16px] font-medium text-ink"
              >
                Add an internal comment
              </label>
              <textarea
                id={bodyId}
                name="body"
                rows={3}
                required
                className="mt-2 w-full rounded-2xl border border-line bg-surface px-5 py-4 text-[16px] text-ink outline-none focus:border-brand"
              />

              {state.error ? (
                <p
                  role="alert"
                  className="mt-3 rounded-2xl border border-attention-line bg-attention-soft px-5 py-3 text-[15px] text-attention-ink"
                >
                  {state.error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={pending}
                className="mt-4 w-full rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
              >
                {pending ? "Posting..." : "Post Comment"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
