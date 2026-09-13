import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  PLACEMENT_DOCUMENT_STATUS_LABELS,
  PLACEMENT_DOCUMENT_STATUS_TONES,
  PLACEMENT_STATUS_LABELS,
  PLACEMENT_STATUS_TONES,
  type DocumentStatus,
  type PlacementDocumentStatus,
  type PlacementStatus,
  type Tone,
} from "@/lib/placement/constants";

const TONE_CLASSES: Record<Tone, string> = {
  info: "border-info-line bg-info-soft text-info-ink",
  ready: "border-ready-line bg-ready-soft text-ready-ink",
  attention: "border-attention-line bg-attention-soft text-attention-ink",
  warning: "border-warning-line bg-warning-soft text-warning-ink",
  neutral: "border-line bg-surface-muted text-ink-muted",
};

const SIZE_CLASSES = {
  medium: "px-4 py-2 text-[15px]",
  large: "px-5 py-2.5 text-[16px]",
};

type StatusPillProps = {
  label: string;
  tone?: Tone;
  size?: keyof typeof SIZE_CLASSES;
};

/** A calm, readable state label. No tiny chips. */
export default function StatusPill({
  label,
  tone = "neutral",
  size = "medium",
}: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]}`}
    >
      {label}
    </span>
  );
}

export function PlacementStatusPill({
  status,
  size,
}: {
  status: PlacementStatus;
  size?: keyof typeof SIZE_CLASSES;
}) {
  return (
    <StatusPill
      label={PLACEMENT_STATUS_LABELS[status]}
      tone={PLACEMENT_STATUS_TONES[status]}
      size={size}
    />
  );
}

export function DocumentStatusPill({
  status,
  size,
}: {
  status: DocumentStatus;
  size?: keyof typeof SIZE_CLASSES;
}) {
  return (
    <StatusPill
      label={`Documents ${DOCUMENT_STATUS_LABELS[status]}`}
      tone={DOCUMENT_STATUS_TONES[status]}
      size={size}
    />
  );
}

/** The status of a single requirement on a student's document checklist. */
export function PlacementDocumentStatusPill({
  status,
  size,
}: {
  status: PlacementDocumentStatus;
  size?: keyof typeof SIZE_CLASSES;
}) {
  return (
    <StatusPill
      label={PLACEMENT_DOCUMENT_STATUS_LABELS[status]}
      tone={PLACEMENT_DOCUMENT_STATUS_TONES[status]}
      size={size}
    />
  );
}
