"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  canManagePartners,
  isAdmin,
  requireActiveStaff,
} from "@/lib/auth/session";
import {
  emptyFormState,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/forms/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  AreaFormSchema,
  AvailabilityFormSchema,
  ContactFormSchema,
  FollowUpFormSchema,
  PartnerFormSchema,
  PartnerNoteFormSchema,
  areaFormDataToObject,
  availabilityFormDataToObject,
  contactFormDataToObject,
  partnerFormDataToObject,
} from "./schema";

/** Result of a quick action taken straight from a card or a row. */
export type PartnerActionResult = { error: string | null };

const OK: PartnerActionResult = { error: null };

const NOT_ALLOWED_MESSAGE =
  "Your account can view placement partners but not change them. Ask a placement manager or an admin.";

const NOT_ALLOWED: PartnerActionResult = { error: NOT_ALLOWED_MESSAGE };

const ADMIN_ONLY =
  "Only an admin can configure placement areas. Ask an admin to make this change.";

/** Postgres unique violation. */
function isDuplicate(code: string | undefined): boolean {
  return code === "23505";
}

/**
 * Splits the "I have verified this" checkbox off the stored availability
 * fields.
 *
 * availability_checked_at is only ever stamped when staff deliberately say the
 * availability was checked, so an unrelated edit to a phone number never makes
 * stale availability look freshly confirmed. Leaving the box unchecked on an
 * edit leaves the stored timestamp exactly as it was.
 */
function splitAvailabilityCheck<T extends { availability_checked: boolean }>(
  values: T,
): { fields: Omit<T, "availability_checked">; checkedAt: string | null } {
  const { availability_checked: checked, ...fields } = values;
  return { fields, checkedAt: checked ? new Date().toISOString() : null };
}

/** Refresh everywhere a partner is visible. */
function revalidatePartner(partnerId?: string) {
  revalidatePath("/placement-partners");
  if (partnerId) revalidatePath(`/placement-partners/${partnerId}`);
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

export async function createPartnerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const parsed = PartnerFormSchema.safeParse(partnerFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  // A brand new partner starts at Unknown availability unless staff chose
  // otherwise, and is only marked checked if they said so.
  const { fields, checkedAt } = splitAvailabilityCheck(parsed.data);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("placement_partners")
    .insert({
      ...fields,
      availability_checked_at: checkedAt,
      is_active: true,
      legacy_zoho_account_id: null,
      legacy_owner_name: null,
    })
    .select("id")
    .single();

  if (error) {
    return {
      error: "The partner could not be saved. Try again.",
      fieldErrors: {},
    };
  }

  revalidatePartner(data.id);
  redirect(`/placement-partners/${data.id}`);
}

export async function updatePartnerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const partnerId = String(formData.get("partner_id") ?? "");
  if (!partnerId) return { error: "Missing partner.", fieldErrors: {} };

  const parsed = PartnerFormSchema.safeParse(partnerFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { fields, checkedAt } = splitAvailabilityCheck(parsed.data);

  const supabase = await createSupabaseServerClient();
  // The Zoho migration columns are never editable from the application.
  const { error } = await supabase
    .from("placement_partners")
    .update(
      checkedAt
        ? { ...fields, availability_checked_at: checkedAt }
        : fields,
    )
    .eq("id", partnerId);

  if (error) {
    return {
      error: "The changes could not be saved. Try again.",
      fieldErrors: {},
    };
  }

  revalidatePartner(partnerId);
  redirect(`/placement-partners/${partnerId}`);
}

/**
 * Move a partner to an area, or back to Unassigned.
 *
 * This is what a dropped card and the accessible "Move to Area" control both
 * call. An empty areaId means Unassigned, which is area_id = null.
 */
export async function setPartnerAreaAction(input: {
  partnerId: string;
  areaId: string | null;
}): Promise<PartnerActionResult> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) return NOT_ALLOWED;

  if (!input.partnerId) return { error: "Missing partner." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_partners")
    .update({ area_id: input.areaId })
    .eq("id", input.partnerId);

  if (error) {
    return { error: "That partner could not be moved. Try again." };
  }

  revalidatePartner(input.partnerId);
  return OK;
}

/** Archive or restore a partner. Partners are never deleted. */
export async function setPartnerActiveAction(input: {
  partnerId: string;
  isActive: boolean;
}): Promise<PartnerActionResult> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) return NOT_ALLOWED;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_partners")
    .update({ is_active: input.isActive })
    .eq("id", input.partnerId);

  if (error) {
    return { error: "The partner could not be updated. Try again." };
  }

  revalidatePartner(input.partnerId);
  return OK;
}

/**
 * Placement Availability on the partner detail page.
 *
 * This is partner level operational state: is this LTC accepting placements,
 * and if not now, when is their next intake. No student is assigned, no
 * capacity is counted, and nothing is scheduled or notified.
 */
export async function updateAvailabilityAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const parsed = AvailabilityFormSchema.safeParse({
    partner_id: formData.get("partner_id") ?? "",
    ...availabilityFormDataToObject(formData),
  });

  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { partner_id: partnerId, ...values } = parsed.data;
  const { fields, checkedAt } = splitAvailabilityCheck(values);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_partners")
    .update(
      checkedAt ? { ...fields, availability_checked_at: checkedAt } : fields,
    )
    .eq("id", partnerId);

  if (error) {
    return {
      error: "The availability could not be saved. Try again.",
      fieldErrors: {},
    };
  }

  revalidatePartner(partnerId);
  return emptyFormState;
}

export async function updateFollowUpAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const parsed = FollowUpFormSchema.safeParse({
    partner_id: formData.get("partner_id") ?? "",
    last_contacted_at: formData.get("last_contacted_at") ?? "",
    next_follow_up_at: formData.get("next_follow_up_at") ?? "",
  });

  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { partner_id: partnerId, ...changes } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_partners")
    .update(changes)
    .eq("id", partnerId);

  if (error) {
    return { error: "The follow-up could not be saved. Try again.", fieldErrors: {} };
  }

  revalidatePartner(partnerId);
  return emptyFormState;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function createContactAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const parsed = ContactFormSchema.safeParse(contactFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("placement_partner_contacts").insert({
    ...parsed.data,
    is_active: true,
    legacy_zoho_contact_id: null,
    legacy_owner_name: null,
  });

  if (error) {
    return { error: "The contact could not be saved. Try again.", fieldErrors: {} };
  }

  revalidatePartner(parsed.data.partner_id);
  return emptyFormState;
}

export async function updateContactAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const contactId = String(formData.get("contact_id") ?? "");
  if (!contactId) return { error: "Missing contact.", fieldErrors: {} };

  const parsed = ContactFormSchema.safeParse(contactFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { partner_id: partnerId, ...changes } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_partner_contacts")
    .update(changes)
    .eq("id", contactId);

  if (error) {
    return { error: "The changes could not be saved. Try again.", fieldErrors: {} };
  }

  revalidatePartner(partnerId);
  return emptyFormState;
}

/**
 * Archive or restore a contact.
 *
 * There is no delete. An imported Zoho contact is a source record, so it is
 * only ever archived, even when two contacts share a name.
 */
export async function setContactActiveAction(input: {
  contactId: string;
  partnerId: string;
  isActive: boolean;
}): Promise<PartnerActionResult> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) return NOT_ALLOWED;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_partner_contacts")
    // An archived contact should not stay the primary one.
    .update(
      input.isActive
        ? { is_active: true }
        : { is_active: false, is_primary: false },
    )
    .eq("id", input.contactId);

  if (error) {
    return { error: "The contact could not be updated. Try again." };
  }

  revalidatePartner(input.partnerId);
  return OK;
}

/**
 * Mark one contact as the partner's primary contact.
 *
 * A database trigger demotes the other contacts at the same partner, so
 * "primary" stays a single answer.
 */
export async function setPrimaryContactAction(input: {
  contactId: string;
  partnerId: string;
  isPrimary: boolean;
}): Promise<PartnerActionResult> {
  const session = await requireActiveStaff();
  if (!canManagePartners(session)) return NOT_ALLOWED;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_partner_contacts")
    .update({ is_primary: input.isPrimary })
    .eq("id", input.contactId);

  if (error) {
    return { error: "The primary contact could not be changed. Try again." };
  }

  revalidatePartner(input.partnerId);
  return OK;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addPartnerNoteAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  // Management reads the network and may still add context, so this is open to
  // every active staff member, exactly as student notes are.
  const session = await requireActiveStaff();

  const parsed = PartnerNoteFormSchema.safeParse({
    partner_id: formData.get("partner_id") ?? "",
    body: formData.get("body") ?? "",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "The comment could not be saved.",
      fieldErrors: {},
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("placement_partner_notes").insert({
    partner_id: parsed.data.partner_id,
    body: parsed.data.body,
    created_by: session.userId,
  });

  if (error) {
    return { error: "The comment could not be saved. Try again.", fieldErrors: {} };
  }

  revalidatePartner(parsed.data.partner_id);
  return emptyFormState;
}

// ---------------------------------------------------------------------------
// Placement areas - admin configuration
// ---------------------------------------------------------------------------

function revalidateAreas() {
  revalidatePath("/admin/placement-areas");
  revalidatePath("/placement-partners");
}

export async function createAreaAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY, fieldErrors: {} };

  const parsed = AreaFormSchema.safeParse(areaFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_areas")
    .insert({ ...parsed.data, is_active: true });

  if (error) {
    if (isDuplicate(error.code)) {
      return {
        error: null,
        fieldErrors: { name: "An area with that name already exists." },
      };
    }
    return { error: "The area could not be created. Try again.", fieldErrors: {} };
  }

  revalidateAreas();
  return emptyFormState;
}

export async function updateAreaAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY, fieldErrors: {} };

  const areaId = String(formData.get("area_id") ?? "");
  if (!areaId) return { error: "Missing area.", fieldErrors: {} };

  const parsed = AreaFormSchema.safeParse(areaFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_areas")
    .update(parsed.data)
    .eq("id", areaId);

  if (error) {
    if (isDuplicate(error.code)) {
      return {
        error: null,
        fieldErrors: { name: "An area with that name already exists." },
      };
    }
    return { error: "The changes could not be saved. Try again.", fieldErrors: {} };
  }

  revalidateAreas();
  return emptyFormState;
}

/**
 * Swap one area with its neighbour in display order.
 *
 * Only the two sort_order values change, so the gaps seeded by the migration
 * survive and the board reorders immediately.
 */
export async function moveAreaAction(input: {
  areaId: string;
  direction: "up" | "down";
}): Promise<PartnerActionResult> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY };

  const supabase = await createSupabaseServerClient();
  const { data: areas, error: readError } = await supabase
    .from("placement_areas")
    .select("id, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (readError) return { error: "The areas could not be read. Try again." };

  // Reordering happens within the active list, which is what the board shows.
  const ordered = (areas ?? []).filter((area) => area.is_active);
  const index = ordered.findIndex((area) => area.id === input.areaId);
  if (index < 0) return { error: "That area is no longer available." };

  const swapWith = input.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ordered.length) return OK;

  const current = ordered[index];
  const neighbour = ordered[swapWith];

  // Equal sort orders would leave the swap invisible, so the pair is spread
  // apart by ten before it is written back.
  const currentOrder =
    current.sort_order === neighbour.sort_order
      ? neighbour.sort_order + (input.direction === "up" ? -10 : 10)
      : neighbour.sort_order;

  const updates = [
    { id: current.id, sort_order: currentOrder },
    { id: neighbour.id, sort_order: current.sort_order },
  ];

  for (const update of updates) {
    const { error } = await supabase
      .from("placement_areas")
      .update({ sort_order: update.sort_order })
      .eq("id", update.id);
    if (error) return { error: "The order could not be changed. Try again." };
  }

  revalidateAreas();
  return OK;
}

/**
 * Archive or reactivate an area.
 *
 * Areas are never hard deleted. Partners that reference an archived area keep
 * their record and surface on the board under Unassigned / Needs Area.
 */
export async function setAreaActiveAction(input: {
  areaId: string;
  isActive: boolean;
}): Promise<PartnerActionResult> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_areas")
    .update({ is_active: input.isActive })
    .eq("id", input.areaId);

  if (error) {
    return { error: "The area could not be updated. Try again." };
  }

  revalidateAreas();
  return OK;
}
