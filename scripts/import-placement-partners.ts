/**
 * ONE-TIME placement partner migration.
 *
 * Reads the private cleaned Zoho workbook and creates placement partners and
 * their contacts in Supabase. This is migration tooling only. The application
 * never reads Excel, and there is no Excel import screen.
 *
 * Usage:
 *   npx tsx scripts/import-placement-partners.ts "<path to workbook.xlsx>" --dry-run
 *   npx tsx scripts/import-placement-partners.ts "<path to workbook.xlsx>" --apply
 *
 * Options:
 *   --dry-run           inspect the workbook and report, write nothing
 *   --apply             create partners and contacts that are not there yet
 *   --update-existing   also refresh workbook fields on partners and contacts
 *                       that already exist. Off by default so manual edits made
 *                       in the application are never overwritten by a rerun.
 *   --verbose           list every partner and contact that would be processed.
 *                       Off by default to keep contact details out of terminal
 *                       scrollback.
 *
 * Only the Accounts and Contacts worksheets are read. Account Contact View,
 * Review, Import Mapping, and Summary are reference material for staff.
 *
 * The workbook path must always be given explicitly. The script never searches
 * the disk for spreadsheets.
 *
 * What is deliberately NOT imported:
 *   address, city, province, postal code   the source has none that is reliable
 *   placement area                         every partner starts Unassigned
 *   primary contact                        staff choose one later
 *
 * Idempotency comes from the Zoho record ids:
 *   placement_partners.legacy_zoho_account_id
 *   placement_partner_contacts.legacy_zoho_contact_id
 * Both are unique, so a second run creates nothing.
 *
 * --apply needs SUPABASE_SERVICE_ROLE_KEY in the local environment. That key
 * bypasses Row Level Security, so it lives only in .env.local and is never
 * exposed to the browser or committed.
 */

import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ACCOUNTS_SHEET = "Accounts";
const CONTACTS_SHEET = "Contacts";

/** Accounts columns this migration reads. Everything else is ignored. */
const ACCOUNT_COLUMNS = {
  zohoId: "Zoho Account ID",
  name: "Account Name",
  phone: "Phone",
  website: "Website",
  owner: "Account Owner",
} as const;

/** Contacts columns this migration reads. */
const CONTACT_COLUMNS = {
  zohoId: "Zoho Contact ID",
  name: "Contact Name",
  accountZohoId: "Zoho Account ID",
  accountName: "Account Name",
  email: "Email",
  phone: "Phone",
  owner: "Contact Owner",
  matchStatus: "Match Status",
} as const;

type PlannedPartner = {
  legacy_zoho_account_id: string;
  name: string;
  main_phone: string | null;
  website: string | null;
  legacy_owner_name: string | null;
  row: number;
};

type PlannedContact = {
  legacy_zoho_contact_id: string;
  full_name: string;
  accountZohoId: string;
  email: string | null;
  phone: string | null;
  legacy_owner_name: string | null;
  row: number;
};

type SkippedRow = {
  sheet: string;
  row: number;
  reason: string;
};

type Plan = {
  partners: PlannedPartner[];
  contacts: PlannedContact[];
  skipped: SkippedRow[];
  /** Contact rows whose Match Status is not "Matched". */
  unmatched: { row: number; name: string; status: string }[];
  problems: string[];
};

// ---------------------------------------------------------------------------
// Argument handling
// ---------------------------------------------------------------------------

type Options = {
  workbookPath: string;
  mode: "dry-run" | "apply";
  updateExisting: boolean;
  verbose: boolean;
};

const USAGE = `
Usage:
  npx tsx scripts/import-placement-partners.ts "<workbook.xlsx>" --dry-run
  npx tsx scripts/import-placement-partners.ts "<workbook.xlsx>" --apply

Options:
  --dry-run           report only, no database writes
  --apply             create partners and contacts that are not there yet
  --update-existing   refresh workbook fields on records that already exist
  --verbose           list each partner and contact
`.trim();

const KNOWN_FLAGS = ["--dry-run", "--apply", "--update-existing", "--verbose"];

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function parseOptions(argv: string[]): Options {
  const flags = argv.filter((value) => value.startsWith("--"));
  const positional = argv.filter((value) => !value.startsWith("--"));

  const unknown = flags.filter((flag) => !KNOWN_FLAGS.includes(flag));
  if (unknown.length > 0) {
    fail(`Unknown option: ${unknown.join(", ")}\n\n${USAGE}`);
  }

  if (positional.length === 0) fail(`A workbook path is required.\n\n${USAGE}`);
  if (positional.length > 1) {
    fail(`Only one workbook path may be given.\n\n${USAGE}`);
  }

  const dryRun = flags.includes("--dry-run");
  const apply = flags.includes("--apply");

  if (dryRun && apply) fail("Choose either --dry-run or --apply, not both.");
  if (!dryRun && !apply) fail(`Choose --dry-run or --apply.\n\n${USAGE}`);

  const workbookPath = path.resolve(positional[0]);
  if (!fs.existsSync(workbookPath)) {
    fail(`Workbook not found: ${workbookPath}`);
  }

  return {
    workbookPath,
    mode: apply ? "apply" : "dry-run",
    updateExisting: flags.includes("--update-existing"),
    verbose: flags.includes("--verbose"),
  };
}

// ---------------------------------------------------------------------------
// Workbook reading
// ---------------------------------------------------------------------------

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function optional(value: string): string | null {
  return value.length > 0 ? value : null;
}

type SheetRow = Record<string, unknown>;

/**
 * Reads one worksheet as objects keyed by its header row, and checks that every
 * column this migration needs is present.
 *
 * The structure is validated rather than the row counts: the source is expected
 * to grow, so a different number of accounts is not a failure.
 */
function readSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  requiredColumns: string[],
): { rows: SheetRow[]; headers: string[] } {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    fail(
      `The workbook has no "${sheetName}" worksheet. Found: ${workbook.SheetNames.join(", ")}`,
    );
  }

  const headerRow =
    XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    })[0] ?? [];
  const headers = headerRow.map(cellText).filter(Boolean);

  const missing = requiredColumns.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    fail(
      `Worksheet "${sheetName}" is missing the column(s): ${missing.join(", ")}.\nFound: ${headers.join(", ")}`,
    );
  }

  const rows = XLSX.utils
    .sheet_to_json<SheetRow>(sheet, { defval: null, raw: false })
    // The cleaned export pads each sheet out with blank rows.
    .filter((row) => Object.values(row).some((value) => cellText(value) !== ""));

  return { rows, headers };
}

function buildPlan(options: Options): Plan {
  const workbook = XLSX.readFile(options.workbookPath);

  const accounts = readSheet(
    workbook,
    ACCOUNTS_SHEET,
    Object.values(ACCOUNT_COLUMNS),
  );
  const contacts = readSheet(
    workbook,
    CONTACTS_SHEET,
    Object.values(CONTACT_COLUMNS),
  );

  const partners: PlannedPartner[] = [];
  const plannedContacts: PlannedContact[] = [];
  const skipped: SkippedRow[] = [];
  const unmatched: Plan["unmatched"] = [];
  const problems: string[] = [];

  const seenAccountIds = new Map<string, number>();

  accounts.rows.forEach((row, index) => {
    // +2: one for the header row, one because spreadsheet rows are 1 based.
    const rowNumber = index + 2;
    const zohoId = cellText(row[ACCOUNT_COLUMNS.zohoId]);
    const name = cellText(row[ACCOUNT_COLUMNS.name]);

    if (!name) {
      skipped.push({
        sheet: ACCOUNTS_SHEET,
        row: rowNumber,
        reason: "No Account Name.",
      });
      return;
    }

    if (!zohoId) {
      skipped.push({
        sheet: ACCOUNTS_SHEET,
        row: rowNumber,
        reason: `"${name}" has no Zoho Account ID, so it cannot be imported safely. Add it by hand in the application.`,
      });
      problems.push(`Accounts row ${rowNumber}: missing Zoho Account ID.`);
      return;
    }

    const firstSeen = seenAccountIds.get(zohoId);
    if (firstSeen) {
      skipped.push({
        sheet: ACCOUNTS_SHEET,
        row: rowNumber,
        reason: `Zoho Account ID ${zohoId} also appears on row ${firstSeen}. Only the first one is imported.`,
      });
      problems.push(
        `Accounts: duplicate Zoho Account ID ${zohoId} on rows ${firstSeen} and ${rowNumber}.`,
      );
      return;
    }
    seenAccountIds.set(zohoId, rowNumber);

    partners.push({
      legacy_zoho_account_id: zohoId,
      name,
      main_phone: optional(cellText(row[ACCOUNT_COLUMNS.phone])),
      website: optional(cellText(row[ACCOUNT_COLUMNS.website])),
      legacy_owner_name: optional(cellText(row[ACCOUNT_COLUMNS.owner])),
      row: rowNumber,
    });
  });

  const seenContactIds = new Map<string, number>();

  contacts.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const zohoId = cellText(row[CONTACT_COLUMNS.zohoId]);
    const name = cellText(row[CONTACT_COLUMNS.name]);
    const accountZohoId = cellText(row[CONTACT_COLUMNS.accountZohoId]);
    const matchStatus = cellText(row[CONTACT_COLUMNS.matchStatus]);

    if (!name) {
      skipped.push({
        sheet: CONTACTS_SHEET,
        row: rowNumber,
        reason: "No Contact Name.",
      });
      return;
    }

    // Only matched contacts are imported. The cleaned source flags the rest,
    // including the "test" row, for review.
    if (matchStatus.toLowerCase() !== "matched") {
      unmatched.push({ row: rowNumber, name, status: matchStatus || "(blank)" });
      skipped.push({
        sheet: CONTACTS_SHEET,
        row: rowNumber,
        reason: `"${name}" is ${matchStatus || "not matched"} and is not imported.`,
      });
      return;
    }

    if (!accountZohoId) {
      skipped.push({
        sheet: CONTACTS_SHEET,
        row: rowNumber,
        reason: `"${name}" is marked Matched but has no Zoho Account ID.`,
      });
      problems.push(
        `Contacts row ${rowNumber}: Matched but missing Zoho Account ID.`,
      );
      return;
    }

    if (!seenAccountIds.has(accountZohoId)) {
      skipped.push({
        sheet: CONTACTS_SHEET,
        row: rowNumber,
        reason: `"${name}" points at Zoho Account ID ${accountZohoId}, which is not in the Accounts sheet.`,
      });
      problems.push(
        `Contacts row ${rowNumber}: account ${accountZohoId} is not in Accounts.`,
      );
      return;
    }

    if (!zohoId) {
      skipped.push({
        sheet: CONTACTS_SHEET,
        row: rowNumber,
        reason: `"${name}" has no Zoho Contact ID, so a rerun could duplicate it. Add this contact by hand.`,
      });
      problems.push(`Contacts row ${rowNumber}: missing Zoho Contact ID.`);
      return;
    }

    const firstSeen = seenContactIds.get(zohoId);
    if (firstSeen) {
      skipped.push({
        sheet: CONTACTS_SHEET,
        row: rowNumber,
        reason: `Zoho Contact ID ${zohoId} also appears on row ${firstSeen}. Only the first one is imported.`,
      });
      problems.push(
        `Contacts: duplicate Zoho Contact ID ${zohoId} on rows ${firstSeen} and ${rowNumber}.`,
      );
      return;
    }
    seenContactIds.set(zohoId, rowNumber);

    // Two contacts with the same name under one account are two separate source
    // records. They are both kept: nothing is merged or deduplicated by name.
    plannedContacts.push({
      legacy_zoho_contact_id: zohoId,
      full_name: name,
      accountZohoId,
      email: optional(cellText(row[CONTACT_COLUMNS.email])),
      phone: optional(cellText(row[CONTACT_COLUMNS.phone])),
      legacy_owner_name: optional(cellText(row[CONTACT_COLUMNS.owner])),
      row: rowNumber,
    });
  });

  return { partners, contacts: plannedContacts, skipped, unmatched, problems };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(plan: Plan, options: Options): void {
  const contactsByAccount = new Map<string, PlannedContact[]>();
  for (const contact of plan.contacts) {
    const list = contactsByAccount.get(contact.accountZohoId) ?? [];
    list.push(contact);
    contactsByAccount.set(contact.accountZohoId, list);
  }

  const withContacts = plan.partners.filter((partner) =>
    contactsByAccount.has(partner.legacy_zoho_account_id),
  );
  const withoutContacts = plan.partners.filter(
    (partner) => !contactsByAccount.has(partner.legacy_zoho_account_id),
  );
  const multiContact = plan.partners.filter(
    (partner) =>
      (contactsByAccount.get(partner.legacy_zoho_account_id)?.length ?? 0) > 1,
  );

  console.log("\nWorkbook:", options.workbookPath);
  console.log("Mode:", options.mode);
  console.log("Worksheets read:", `${ACCOUNTS_SHEET}, ${CONTACTS_SHEET}`);

  console.log("\nSource summary");
  console.log(`  accounts found:                 ${plan.partners.length}`);
  console.log(`  matched contacts:               ${plan.contacts.length}`);
  console.log(`  unmatched / skipped contacts:   ${plan.unmatched.length}`);
  console.log(`  partners with at least one:     ${withContacts.length}`);
  console.log(`  partners without contacts:      ${withoutContacts.length}`);
  console.log(`  partners with several contacts: ${multiContact.length}`);

  console.log("\nUnmatched contact rows (not imported)");
  if (plan.unmatched.length === 0) {
    console.log("  none");
  } else {
    for (const row of plan.unmatched) {
      console.log(`  row ${row.row}: "${row.name}" - ${row.status}`);
    }
  }

  console.log("\nPartners with several contacts (all are kept)");
  if (multiContact.length === 0) {
    console.log("  none");
  } else {
    for (const partner of multiContact) {
      const list = contactsByAccount.get(partner.legacy_zoho_account_id) ?? [];
      console.log(`  ${partner.name}: ${list.length} contacts`);
    }
  }

  console.log("\nDuplicate or missing external ids");
  if (plan.problems.length === 0) {
    console.log("  none");
  } else {
    for (const problem of plan.problems) console.log(`  ${problem}`);
  }

  console.log(`\nRows that will be skipped: ${plan.skipped.length}`);
  for (const row of plan.skipped) {
    console.log(`  ${row.sheet} row ${row.row}: ${row.reason}`);
  }

  console.log("\nFields deliberately not imported");
  console.log(
    "  address, city, province, postal code - the source has no reliable location data",
  );
  console.log(
    "  placement area                       - every partner starts Unassigned",
  );
  console.log(
    "  primary contact                      - staff mark one after reviewing",
  );

  if (options.verbose) {
    console.log("\nPartners");
    for (const partner of plan.partners) {
      const list = contactsByAccount.get(partner.legacy_zoho_account_id) ?? [];
      console.log(`  ${partner.name} (${list.length} contacts)`);
      for (const contact of list) {
        console.log(`    ${contact.full_name}`);
      }
    }
  } else {
    console.log("\n  (run with --verbose to list partners and contact names)");
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function serviceClient() {
  dotenv.config({ path: ".env.local" });
  dotenv.config({ path: ".env" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    fail(
      "--apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function apply(plan: Plan, options: Options): Promise<void> {
  const supabase = serviceClient();

  let partnersCreated = 0;
  let partnersUpdated = 0;
  let partnersUnchanged = 0;
  let contactsCreated = 0;
  let contactsUpdated = 0;
  let contactsUnchanged = 0;
  let contactsSkipped = 0;

  /** Zoho account id -> placement_partners.id, filled in as partners land. */
  const partnerIds = new Map<string, string>();

  for (const partner of plan.partners) {
    const { data: existing, error: readError } = await supabase
      .from("placement_partners")
      .select("id")
      .eq("legacy_zoho_account_id", partner.legacy_zoho_account_id)
      .maybeSingle();

    if (readError) {
      fail(`Reading partner "${partner.name}": ${readError.message}`);
    }

    const workbookFields = {
      name: partner.name,
      main_phone: partner.main_phone,
      website: partner.website,
      legacy_owner_name: partner.legacy_owner_name,
    };

    if (!existing) {
      const { data: inserted, error: insertError } = await supabase
        .from("placement_partners")
        .insert({
          legacy_zoho_account_id: partner.legacy_zoho_account_id,
          ...workbookFields,
          // Imported partners always start here. No location is invented and no
          // area is guessed, so every one of them appears under Unassigned.
          area_id: null,
          relationship_status: "active",
          partner_type: null,
          address_line: null,
          city: null,
          province: null,
          postal_code: null,
          last_contacted_at: null,
          next_follow_up_at: null,
          // Nobody has asked these partners about placements yet, so their
          // availability is Unknown rather than an invented answer.
          availability_status: "unknown",
          next_intake_date: null,
          availability_note: null,
          availability_checked_at: null,
          is_active: true,
        })
        .select("id")
        .single();

      if (insertError) {
        fail(`Creating partner "${partner.name}": ${insertError.message}`);
      }
      partnerIds.set(partner.legacy_zoho_account_id, inserted.id as string);
      partnersCreated += 1;
      continue;
    }

    partnerIds.set(partner.legacy_zoho_account_id, existing.id as string);

    if (!options.updateExisting) {
      partnersUnchanged += 1;
      continue;
    }

    // Area, relationship status, location, and follow-up fields are never
    // touched, so cleanup work done in the application survives a rerun.
    const { error: updateError } = await supabase
      .from("placement_partners")
      .update(workbookFields)
      .eq("id", existing.id);

    if (updateError) {
      fail(`Updating partner "${partner.name}": ${updateError.message}`);
    }
    partnersUpdated += 1;
  }

  for (const contact of plan.contacts) {
    const partnerId = partnerIds.get(contact.accountZohoId);
    if (!partnerId) {
      // Only reachable if the partner insert above was skipped.
      console.log(
        `  skipped contact "${contact.full_name}": partner ${contact.accountZohoId} is not in the database.`,
      );
      contactsSkipped += 1;
      continue;
    }

    const { data: existing, error: readError } = await supabase
      .from("placement_partner_contacts")
      .select("id")
      .eq("legacy_zoho_contact_id", contact.legacy_zoho_contact_id)
      .maybeSingle();

    if (readError) {
      fail(`Reading contact "${contact.full_name}": ${readError.message}`);
    }

    const workbookFields = {
      partner_id: partnerId,
      full_name: contact.full_name,
      email: contact.email,
      phone: contact.phone,
      legacy_owner_name: contact.legacy_owner_name,
    };

    if (!existing) {
      const { error: insertError } = await supabase
        .from("placement_partner_contacts")
        .insert({
          legacy_zoho_contact_id: contact.legacy_zoho_contact_id,
          ...workbookFields,
          job_title: null,
          // No primary contact is guessed, even when a partner has only one.
          is_primary: false,
          is_active: true,
        });

      if (insertError) {
        fail(`Creating contact "${contact.full_name}": ${insertError.message}`);
      }
      contactsCreated += 1;
      continue;
    }

    if (!options.updateExisting) {
      contactsUnchanged += 1;
      continue;
    }

    // is_primary and is_active are left alone: marking a primary contact or
    // archiving a duplicate is a staff decision.
    const { error: updateError } = await supabase
      .from("placement_partner_contacts")
      .update(workbookFields)
      .eq("id", existing.id);

    if (updateError) {
      fail(`Updating contact "${contact.full_name}": ${updateError.message}`);
    }
    contactsUpdated += 1;
  }

  console.log("\nImport summary");
  console.log(`  partners created:                     ${partnersCreated}`);
  console.log(`  partners updated:                     ${partnersUpdated}`);
  console.log(`  partners already present, left alone: ${partnersUnchanged}`);
  console.log(`  contacts created:                     ${contactsCreated}`);
  console.log(`  contacts updated:                     ${contactsUpdated}`);
  console.log(`  contacts already present, left alone: ${contactsUnchanged}`);
  console.log(
    `  rows skipped:                         ${plan.skipped.length + contactsSkipped}`,
  );

  if ((partnersUnchanged > 0 || contactsUnchanged > 0) && !options.updateExisting) {
    console.log(
      "\n  Pass --update-existing to refresh workbook fields on those records.",
    );
  }
  console.log(
    "\n  Every imported partner is Unassigned. Staff organize them on the Area Board.",
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const plan = buildPlan(options);

  report(plan, options);

  if (options.mode === "dry-run") {
    console.log("\nDry run finished. Nothing was written.\n");
    return;
  }

  console.log("\nApplying...\n");
  await apply(plan, options);
  console.log("\nDone.\n");
}

main().catch((error: unknown) => {
  console.error(
    "\nImport failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
