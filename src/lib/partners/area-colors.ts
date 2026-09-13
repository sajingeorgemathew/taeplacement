/**
 * How the controlled Area Board palette is actually rendered.
 *
 * The keys are the vocabulary in src/lib/placement/constants.ts, which matches
 * the CHECK constraint on placement_areas.color_key. Every colour an area can
 * have is spelled out here as a literal class string, for two reasons:
 *
 *   1. Tailwind only ships the classes it can see in the source, so a class
 *      built at runtime from a database value would silently render nothing.
 *   2. A fixed table is what keeps the board readable. Each area gets a SOFT
 *      tinted column and a STRONGER header accent, and the partner cards on top
 *      of it stay white with dark text. No card is ever a saturated colour.
 *
 * Colour always comes from the area's own color_key, never from its position in
 * the array, so a newly created area renders in the colour the admin picked and
 * reordering the board never repaints it.
 */

import {
  DEFAULT_AREA_COLOR_KEY,
  isAreaColorKey,
  type AreaColorKey,
} from "@/lib/placement/constants";

export type AreaColorStyle = {
  /** The soft tinted column surface and its border. */
  column: string;
  /** The same column while a dragged card is over it. */
  dropTarget: string;
  /** The strong header accent bar. */
  accent: string;
  /** Dark, readable heading text on the tinted surface. */
  heading: string;
  /** Quieter supporting text on the tinted surface. */
  muted: string;
  /** A small solid swatch, used in Admin and beside the area name. */
  swatch: string;
};

export const AREA_COLOR_STYLES: Record<AreaColorKey, AreaColorStyle> = {
  slate: {
    column: "border-slate-200 bg-slate-50",
    dropTarget: "border-slate-500 bg-slate-100",
    accent: "bg-slate-400",
    heading: "text-slate-900",
    muted: "text-slate-600",
    swatch: "bg-slate-400",
  },
  blue: {
    column: "border-blue-200 bg-blue-50",
    dropTarget: "border-blue-500 bg-blue-100",
    accent: "bg-blue-500",
    heading: "text-blue-950",
    muted: "text-blue-800",
    swatch: "bg-blue-500",
  },
  green: {
    column: "border-emerald-200 bg-emerald-50",
    dropTarget: "border-emerald-500 bg-emerald-100",
    accent: "bg-emerald-500",
    heading: "text-emerald-950",
    muted: "text-emerald-800",
    swatch: "bg-emerald-500",
  },
  amber: {
    column: "border-amber-200 bg-amber-50",
    dropTarget: "border-amber-500 bg-amber-100",
    accent: "bg-amber-500",
    heading: "text-amber-950",
    muted: "text-amber-800",
    swatch: "bg-amber-500",
  },
  purple: {
    column: "border-purple-200 bg-purple-50",
    dropTarget: "border-purple-500 bg-purple-100",
    accent: "bg-purple-500",
    heading: "text-purple-950",
    muted: "text-purple-800",
    swatch: "bg-purple-500",
  },
  coral: {
    column: "border-rose-200 bg-rose-50",
    dropTarget: "border-rose-500 bg-rose-100",
    accent: "bg-rose-400",
    heading: "text-rose-950",
    muted: "text-rose-800",
    swatch: "bg-rose-400",
  },
  teal: {
    column: "border-teal-200 bg-teal-50",
    dropTarget: "border-teal-500 bg-teal-100",
    accent: "bg-teal-500",
    heading: "text-teal-950",
    muted: "text-teal-800",
    swatch: "bg-teal-500",
  },
  indigo: {
    column: "border-indigo-200 bg-indigo-50",
    dropTarget: "border-indigo-500 bg-indigo-100",
    accent: "bg-indigo-500",
    heading: "text-indigo-950",
    muted: "text-indigo-800",
    swatch: "bg-indigo-500",
  },
};

/**
 * The style for a stored colour key.
 *
 * An unrecognised value falls back to slate rather than rendering nothing, so a
 * palette key added to the database ahead of the application still shows a
 * usable column.
 */
export function areaColorStyle(colorKey: string | null | undefined): AreaColorStyle {
  return AREA_COLOR_STYLES[
    isAreaColorKey(colorKey) ? colorKey : DEFAULT_AREA_COLOR_KEY
  ];
}
