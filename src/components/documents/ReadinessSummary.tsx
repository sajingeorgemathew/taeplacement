import type { DocumentReadiness } from "@/lib/documents/queries";
import {
  DOCUMENT_STATUS_LABELS,
  type DocumentStatus,
} from "@/lib/placement/constants";

type Tone = "ready" | "attention" | "neutral";

const BAR_CLASSES: Record<Tone, string> = {
  ready: "bg-ready",
  attention: "bg-attention",
  neutral: "bg-brand",
};

const TEXT_CLASSES: Record<Tone, string> = {
  ready: "text-ready-ink",
  attention: "text-attention-ink",
  neutral: "text-ink",
};

function toneFor(readiness: DocumentReadiness): Tone {
  if (readiness.isReady) return "ready";
  if (readiness.reviewedCount === 0) return "neutral";
  return "attention";
}

/** "11 of 13 ready" with a plain progress bar. No chart library, no gradient. */
export default function ReadinessSummary({
  readiness,
  documentStatus,
  size = "medium",
}: {
  readiness: DocumentReadiness;
  /** The derived students.document_status, shown as the overall word. */
  documentStatus: DocumentStatus;
  size?: "medium" | "large";
}) {
  const tone = toneFor(readiness);
  const large = size === "large";

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p
          className={`font-semibold leading-none ${TEXT_CLASSES[tone]} ${
            large ? "text-[34px]" : "text-[28px]"
          }`}
        >
          {readiness.requiredReady} of {readiness.requiredTotal} ready
        </p>
        <p className={`${large ? "text-[17px]" : "text-[16px]"} text-ink-muted`}>
          Overall: {DOCUMENT_STATUS_LABELS[documentStatus]}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={readiness.requiredReady}
        aria-valuemin={0}
        aria-valuemax={readiness.requiredTotal}
        aria-label="Required placement documents ready"
        className={`mt-4 w-full overflow-hidden rounded-full bg-surface-muted ${
          large ? "h-4" : "h-3"
        }`}
      >
        <div
          className={`h-full rounded-full transition-[width] ${BAR_CLASSES[tone]}`}
          style={{ width: `${readiness.percent}%` }}
        />
      </div>

      <p className="mt-3 text-[16px] text-ink-muted">
        {readiness.activeTotal > readiness.requiredTotal
          ? `Required documents only. ${readiness.activeTotal - readiness.requiredTotal} optional ${
              readiness.activeTotal - readiness.requiredTotal === 1
                ? "document does"
                : "documents do"
            } not affect readiness.`
          : "Received and N/A both count as ready."}
      </p>
    </div>
  );
}

/** The compact "9/13" used in student lists. */
export function ReadinessCount({
  readiness,
}: {
  readiness: DocumentReadiness | undefined;
}) {
  if (!readiness || readiness.requiredTotal === 0) return null;

  const tone = toneFor(readiness);
  const classes =
    tone === "ready"
      ? "border-ready-line bg-ready-soft text-ready-ink"
      : tone === "attention"
        ? "border-attention-line bg-attention-soft text-attention-ink"
        : "border-line bg-surface-muted text-ink-muted";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-4 py-2 text-[15px] font-medium ${classes}`}
      title="Required placement documents ready"
    >
      {readiness.requiredReady}/{readiness.requiredTotal} documents
    </span>
  );
}
