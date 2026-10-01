import type { GridCellTone } from "@/lib/documents/batch-grid";

/**
 * The Batch Document Grid's cell colours, by tone.
 *
 * Shared by the status cell, the legend, and nothing else. The tones
 * themselves (which status is which colour) are decided in
 * @/lib/documents/batch-grid; this file only maps a tone to classes.
 */
export const GRID_TONE_CLASSES: Record<GridCellTone, string> = {
  ready: "border-ready-line bg-ready-soft text-ready-ink",
  warning: "border-warning-line bg-warning-soft text-warning-ink",
  attention: "border-attention-line bg-attention-soft text-attention-ink",
  neutral: "border-line bg-surface text-ink",
  muted: "border-line bg-surface-muted text-ink-muted",
  missing: "border-dashed border-line-strong bg-surface-muted text-ink-muted",
};

/** The compact control shared by the status select and the session select. */
export const GRID_SELECT_CLASSES =
  "h-8 w-full min-w-0 rounded-md border px-1.5 pr-6 text-[13px] font-medium outline-none focus:border-brand disabled:opacity-60";

export const GRID_ICON_BUTTON_CLASSES =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-muted transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

export const GRID_TEXT_BUTTON_CLASSES =
  "inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[13px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

export const GRID_ERROR_CLASSES = "text-[12px] leading-tight text-attention-ink";

export const GRID_SAVING_CLASSES = "text-[12px] leading-tight text-ink-muted";
