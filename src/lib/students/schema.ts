import { z } from "zod";

import {
  BATCH_STATUSES,
  DEFAULT_PROGRAM,
  DOCUMENT_STATUSES,
  PLACEMENT_STATUSES,
} from "@/lib/placement/constants";

/** Trims a form value and turns an empty string into null. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null);

const optionalEmail = optionalText.refine(
  (value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  { message: "Enter a valid email address or leave it empty." },
);

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null)
  .refine((value) => value === null || z.uuid().safeParse(value).success, {
    message: "Choose a batch from the list.",
  });

export const StudentFormSchema = z.object({
  student_number: z
    .string()
    .trim()
    .min(1, "Student number is required.")
    .max(40, "Student number is too long."),
  first_name: z.string().trim().min(1, "First name is required.").max(80),
  middle_name: optionalText,
  last_name: optionalText,
  program: z.string().trim().min(1).max(60).default(DEFAULT_PROGRAM),
  batch_id: optionalUuid,
  phone: optionalText,
  email: optionalEmail,
  address_line: optionalText,
  city: optionalText,
  province: optionalText,
  postal_code: optionalText,
  is_returning: z.boolean().default(false),
  placement_status: z.enum(PLACEMENT_STATUSES),
  document_status: z.enum(DOCUMENT_STATUSES),
});

export type StudentFormValues = z.infer<typeof StudentFormSchema>;

export const NoteFormSchema = z.object({
  student_id: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Write a note before posting.")
    .max(4000, "Notes are limited to 4000 characters."),
});

export const BatchFormSchema = z.object({
  name: z.string().trim().min(1, "Batch name is required.").max(120),
  program: z.string().trim().min(1).max(60).default(DEFAULT_PROGRAM),
  start_date: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .default(null),
  schedule_label: optionalText,
  status: z.enum(BATCH_STATUSES),
  sort_order: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? Number(value) : null))
    .nullable()
    .default(null)
    .refine((value) => value === null || Number.isInteger(value), {
      message: "Sort order must be a whole number.",
    }),
});

export type BatchFormValues = z.infer<typeof BatchFormSchema>;

/** Reads the shared student form fields out of a submitted FormData. */
export function studentFormDataToObject(formData: FormData) {
  return {
    student_number: formData.get("student_number") ?? "",
    first_name: formData.get("first_name") ?? "",
    middle_name: formData.get("middle_name") ?? "",
    last_name: formData.get("last_name") ?? "",
    program: formData.get("program") ?? DEFAULT_PROGRAM,
    batch_id: formData.get("batch_id") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address_line: formData.get("address_line") ?? "",
    city: formData.get("city") ?? "",
    province: formData.get("province") ?? "",
    postal_code: formData.get("postal_code") ?? "",
    is_returning: formData.get("is_returning") === "on",
    placement_status: formData.get("placement_status") ?? "needs_review",
    document_status: formData.get("document_status") ?? "not_reviewed",
  };
}

export function batchFormDataToObject(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    program: formData.get("program") ?? DEFAULT_PROGRAM,
    start_date: formData.get("start_date") ?? "",
    schedule_label: formData.get("schedule_label") ?? "",
    status: formData.get("status") ?? "active",
    sort_order: formData.get("sort_order") ?? "",
  };
}
