"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * The panel a controlled placement action opens from a board card.
 *
 * A board column is 23rem wide and a placement action asks real questions, so
 * expanding one inside a card would either truncate the question or make the
 * board unreadable sideways. The card keeps the button; the question opens
 * here, in front of the board, with the student and the partner named at the
 * top so there is never any doubt which placement is being changed.
 *
 * It is the NATIVE dialog element, opened with showModal(), so the focus trap,
 * the Escape key, the inert background, and the backdrop are the browser's
 * rather than a hand-rolled imitation. The same forms still render inline on
 * the student's own placement page, where there is room for them: this is a
 * second presentation of one form, never a second implementation of an action.
 */
export default function ActionDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="action-dialog-title"
      // Escape, and the browser's own close, both come back through here so the
      // owning component's state can never drift out of step with the dialog.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      // The dialog element itself is the full modal box, so a click that lands
      // on it rather than on the panel inside it is a click on the backdrop.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      // A board card is itself draggable, and this dialog is a DOM descendant of
      // one. Without this, selecting text in a date field or a note would start
      // dragging the student's card behind it.
      draggable={false}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="w-[min(44rem,calc(100vw-2rem))] max-w-none rounded-3xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-[rgba(18,24,32,0.45)]"
    >
      <div className="max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-line px-7 py-6">
          <div className="min-w-0">
            <h2
              id="action-dialog-title"
              className="text-[22px] font-semibold leading-snug tracking-tight text-ink"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 break-words text-[16px] text-ink-muted">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-xl border border-line p-2.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="px-7 py-6">{children}</div>
      </div>
    </dialog>
  );
}
