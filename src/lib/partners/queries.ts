import { requireActiveStaff } from "@/lib/auth/session";
import type {
  AvailabilityStatus,
  RelationshipStatus,
} from "@/lib/placement/constants";
import type {
  PartnerContactRow,
  PartnerNoteRow,
  PlacementAreaRow,
  PlacementPartnerRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * A partner as the board and the list see it: the record plus the two counts
 * that make a card readable, and its area when it still has one.
 */
export type PartnerListItem = PlacementPartnerRow & {
  area: PlacementAreaRow | null;
  contactCount: number;
  noteCount: number;
};

export type PartnerContact = PartnerContactRow;

export type PartnerNote = PartnerNoteRow & {
  author_name: string | null;
};

export type PartnerFilters = {
  search?: string;
  /**
   * An area id, or "unassigned". Unassigned means area_id IS NULL *or* the
   * partner points at an archived area, which is exactly what the Area Board
   * shows in its first column. A partner is never invisible because the area it
   * belongs to was archived.
   */
  areaId?: string;
  relationshipStatus?: RelationshipStatus;
  availabilityStatus?: AvailabilityStatus;
  contacts?: "with" | "without";
  /** Archived partners are hidden everywhere unless this is true. */
  archived?: boolean;
};

const AREA_SELECT =
  "id, name, description, sort_order, color_key, is_active, created_at, updated_at";

const PARTNER_SELECT = `*, area:placement_areas(${AREA_SELECT})`;

/** The Unassigned column and the Unassigned filter. Not a placement_areas row. */
const UNASSIGNED = "unassigned";

/**
 * Supabase `or` filters are comma separated, so anything that would change the
 * shape of the filter string is removed before it is used.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
}

/** All areas, active and archived, in board order. */
export async function listPlacementAreas(): Promise<PlacementAreaRow[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("placement_areas")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Areas that have been archived.
 *
 * Partners still point at them. Their records stay intact, and both the board
 * and the Unassigned filter surface them as needing a new area.
 */
async function readArchivedAreaIds(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("placement_areas")
    .select("id")
    .eq("is_active", false);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id);
}

/** Active contacts per partner id, read in one pass for a whole list. */
async function readContactCounts(): Promise<Map<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("placement_partner_contacts")
    .select("partner_id")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.partner_id, (counts.get(row.partner_id) ?? 0) + 1);
  }
  return counts;
}

async function readNoteCounts(): Promise<Map<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("placement_partner_notes")
    .select("partner_id");

  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.partner_id, (counts.get(row.partner_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Partner ids that match a search term through their contacts, so searching a
 * contact name or email finds the organization.
 */
async function partnerIdsMatchingContacts(term: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("placement_partner_contacts")
    .select("partner_id")
    .eq("is_active", true)
    .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);

  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => row.partner_id))];
}

/**
 * Partners for the Area Board and the List View.
 *
 * The network is a few dozen rows, so the whole working set is read at once and
 * the board groups it in memory rather than running one query per column.
 */
export async function listPartners(
  filters: PartnerFilters = {},
): Promise<PartnerListItem[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("placement_partners")
    .select(PARTNER_SELECT)
    .eq("is_active", !filters.archived);

  if (filters.areaId === UNASSIGNED) {
    // Partners left behind by an archived area belong here too, so archiving an
    // area never hides a partner from the one view that exists to find them.
    const archivedAreaIds = await readArchivedAreaIds();
    query =
      archivedAreaIds.length > 0
        ? query.or(`area_id.is.null,area_id.in.(${archivedAreaIds.join(",")})`)
        : query.is("area_id", null);
  } else if (filters.areaId) {
    query = query.eq("area_id", filters.areaId);
  }

  if (filters.relationshipStatus) {
    query = query.eq("relationship_status", filters.relationshipStatus);
  }

  if (filters.availabilityStatus) {
    query = query.eq("availability_status", filters.availabilityStatus);
  }

  const term = filters.search ? sanitizeSearchTerm(filters.search) : "";
  if (term) {
    // Contact matches are resolved first so one `or` can cover the partner's
    // own columns and the ids found through its contacts.
    const contactPartnerIds = await partnerIdsMatchingContacts(term);
    const conditions = [
      `name.ilike.%${term}%`,
      `city.ilike.%${term}%`,
      `main_phone.ilike.%${term}%`,
      `address_line.ilike.%${term}%`,
    ];
    if (contactPartnerIds.length > 0) {
      conditions.push(`id.in.(${contactPartnerIds.join(",")})`);
    }
    query = query.or(conditions.join(","));
  }

  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as (PlacementPartnerRow & {
    area: PlacementAreaRow | null;
  })[];

  const [contactCounts, noteCounts] = await Promise.all([
    readContactCounts(),
    readNoteCounts(),
  ]);

  const partners = rows.map((row) => ({
    ...row,
    contactCount: contactCounts.get(row.id) ?? 0,
    noteCount: noteCounts.get(row.id) ?? 0,
  }));

  if (filters.contacts === "with") {
    return partners.filter((partner) => partner.contactCount > 0);
  }
  if (filters.contacts === "without") {
    return partners.filter((partner) => partner.contactCount === 0);
  }
  return partners;
}

export async function getPartner(
  partnerId: string,
): Promise<PartnerListItem | null> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("placement_partners")
    .select(PARTNER_SELECT)
    .eq("id", partnerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as PlacementPartnerRow & {
    area: PlacementAreaRow | null;
  };

  const [{ count: contactCount }, { count: noteCount }] = await Promise.all([
    supabase
      .from("placement_partner_contacts")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("is_active", true),
    supabase
      .from("placement_partner_notes")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId),
  ]);

  return {
    ...row,
    contactCount: contactCount ?? 0,
    noteCount: noteCount ?? 0,
  };
}

/** Every contact at one partner, primary first, archived ones last. */
export async function listPartnerContacts(
  partnerId: string,
): Promise<PartnerContact[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("placement_partner_contacts")
    .select("*")
    .eq("partner_id", partnerId)
    .order("is_active", { ascending: false })
    .order("is_primary", { ascending: false })
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Comments on one partner, oldest first, with the staff author name.
 *
 * Chronological order, the way the conversation actually happened: the drawer
 * reads top to bottom and opens scrolled to the newest comment at the bottom.
 */
export async function listPartnerNotes(
  partnerId: string,
): Promise<PartnerNote[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("placement_partner_notes")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const notes = data ?? [];
  const authorIds = [
    ...new Set(
      notes
        .map((note) => note.created_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const names = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", authorIds);

    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.full_name);
    }
  }

  return notes.map((note) => ({
    ...note,
    author_name: note.created_by ? (names.get(note.created_by) ?? null) : null,
  }));
}

export type PartnerCounts = {
  total: number;
  /** area_id IS NULL, plus partners whose area has been archived. */
  unassigned: number;
  withoutContacts: number;
  archived: number;
  /** Partner count per area id, including archived areas. */
  byArea: Map<string, number>;
};

/**
 * One small read that powers every live count on the Placement Partners page,
 * including counts for areas the current filters have hidden.
 */
export async function getPartnerCounts(): Promise<PartnerCounts> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("placement_partners")
    .select("id, area_id, is_active");

  if (error) throw new Error(error.message);

  const [contactCounts, archivedAreaIds] = await Promise.all([
    readContactCounts(),
    readArchivedAreaIds(),
  ]);
  const archivedAreas = new Set(archivedAreaIds);
  const counts: PartnerCounts = {
    total: 0,
    unassigned: 0,
    withoutContacts: 0,
    archived: 0,
    byArea: new Map(),
  };

  for (const row of data ?? []) {
    if (!row.is_active) {
      counts.archived += 1;
      continue;
    }
    counts.total += 1;
    if ((contactCounts.get(row.id) ?? 0) === 0) counts.withoutContacts += 1;
    // An archived area leaves its partners needing a new one, which is the same
    // operational state as never having had one. The board agrees.
    if (!row.area_id || archivedAreas.has(row.area_id)) {
      counts.unassigned += 1;
      continue;
    }
    counts.byArea.set(row.area_id, (counts.byArea.get(row.area_id) ?? 0) + 1);
  }

  return counts;
}

/** Partners per area id, used by Admin to explain why an area is archived. */
export async function getAreaUsageCounts(): Promise<Record<string, number>> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("placement_partners")
    .select("area_id")
    .not("area_id", "is", null);

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.area_id) continue;
    counts[row.area_id] = (counts[row.area_id] ?? 0) + 1;
  }
  return counts;
}
