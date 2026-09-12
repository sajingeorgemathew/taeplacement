/**
 * ONE-TIME initial student migration.
 *
 * Reads the private PSW master list workbook and creates the first batches and
 * students in Supabase. This is migration tooling only. The application never
 * reads Excel, and there is no Excel import screen.
 *
 * Usage:
 *   npx tsx scripts/import-initial-students.ts "<path to workbook.xlsx>" --dry-run
 *   npx tsx scripts/import-initial-students.ts "<path to workbook.xlsx>" --apply
 *
 * Options:
 *   --dry-run           inspect the workbook and report, write nothing
 *   --apply             create or reuse batches and insert new students
 *   --update-existing   also refresh workbook fields on students that already
 *                       exist. Off by default so manual corrections made in the
 *                       application are never overwritten by a repeat run.
 *   --verbose           list every student number and name that would be
 *                       processed. Off by default to keep personal information
 *                       out of terminal scrollback.
 *
 * The workbook path must always be given explicitly. The script never searches
 * the disk for spreadsheets.
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

import { parseAddress } from "../src/lib/students/address";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MIGRATION_SOURCE = "psw-master-list-workbook";

/** Workbook headers that become student fields. Everything else is ignored. */
const FIELD_HEADERS: Record<string, keyof MappedStudent> = {
  "student id": "student_number",
  "first name": "first_name",
  "middle name": "middle_name",
  "last name": "last_name",
  "contact no.": "phone",
  "contact no": "phone",
  email: "email",
  address: "address_line",
};

/**
 * Headers that are deliberately not imported. Date of birth, immigration
 * status, and the legacy placement and document columns stay in the workbook.
 */
const IGNORED_HEADERS = [
  "sr. no.",
  "yyyy/mm/dd",
  "status",
  "transcripts",
  "college cert",
  "nacc",
  "venue",
  "start date",
  "finish date",
  "doc status",
  "graduated",
  "placement",
];

type MappedStudent = {
  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address_line: string | null;
};

type PlannedStudent = MappedStudent & {
  city: string | null;
  province: string | null;
  postal_code: string | null;
  sheet: string;
  row: number;
  warnings: string[];
};

type SkippedRow = {
  sheet: string;
  row: number;
  reason: string;
};

type PlannedBatch = {
  sheet: string;
  name: string;
  program: string;
  schedule_label: string;
  start_date: string;
  sort_order: number;
  students: PlannedStudent[];
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
  npx tsx scripts/import-initial-students.ts "<workbook.xlsx>" --dry-run
  npx tsx scripts/import-initial-students.ts "<workbook.xlsx>" --apply

Options:
  --dry-run           report only, no database writes
  --apply             create or reuse batches and insert new students
  --update-existing   refresh workbook fields on students that already exist
  --verbose           list each student number and name
`.trim();

function parseOptions(argv: string[]): Options {
  const flags = argv.filter((value) => value.startsWith("--"));
  const positional = argv.filter((value) => !value.startsWith("--"));

  const unknown = flags.filter(
    (flag) =>
      !["--dry-run", "--apply", "--update-existing", "--verbose"].includes(flag),
  );
  if (unknown.length > 0) {
    fail(`Unknown option: ${unknown.join(", ")}\n\n${USAGE}`);
  }

  if (positional.length === 0) {
    fail(`A workbook path is required.\n\n${USAGE}`);
  }
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

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
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

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * Reads "PSW Morning Batch - April 27, 2026" from row 1 of a sheet.
 * Nothing is guessed: a title that cannot be read stops the run.
 */
function readBatchTitle(
  sheetName: string,
  title: string,
): { name: string; program: string; schedule: string; startDate: string } {
  const match = title.match(/^(.*?)\s*-\s*(.+)$/);
  if (!match) {
    fail(
      `Sheet "${sheetName}": could not read the batch title in row 1. Found: "${title}"`,
    );
  }

  const prefix = match[1].replace(/batch/i, "").trim().split(/\s+/);
  const program = prefix[0] ?? "PSW";
  const schedule = prefix.slice(1).join(" ") || "Morning";

  const dateText = match[2].trim();
  const dateMatch = dateText.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!dateMatch) {
    fail(
      `Sheet "${sheetName}": could not read a start date from "${dateText}".`,
    );
  }

  const monthIndex = MONTHS.indexOf(dateMatch[1].toLowerCase());
  if (monthIndex < 0) {
    fail(`Sheet "${sheetName}": unknown month in "${dateText}".`);
  }

  const day = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const month = String(monthIndex + 1).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");

  return {
    name: `${MONTHS[monthIndex].replace(/^./, (c) => c.toUpperCase())} ${day}, ${year}`,
    program,
    schedule,
    startDate: `${year}-${month}-${dayText}`,
  };
}

function buildPlan(options: Options): {
  batches: PlannedBatch[];
  skipped: SkippedRow[];
  ignoredHeaders: Set<string>;
} {
  const workbook = XLSX.readFile(options.workbookPath);
  const batches: PlannedBatch[] = [];
  const skipped: SkippedRow[] = [];
  const ignoredHeaders = new Set<string>();
  const seenStudentNumbers = new Map<string, string>();

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: false,
    });

    const titleRow = rows[0] ?? [];
    const headerRow = rows[1] ?? [];

    const title = cellText(titleRow[0]);
    if (!title) fail(`Sheet "${sheetName}": row 1 has no batch title.`);

    const batchInfo = readBatchTitle(sheetName, title);

    // Map header text to the field it feeds, ignoring everything else.
    const columns = new Map<number, keyof MappedStudent>();
    headerRow.forEach((raw, index) => {
      const header = cellText(raw).toLowerCase();
      if (!header) return;
      const field = FIELD_HEADERS[header];
      if (field) {
        columns.set(index, field);
      } else {
        ignoredHeaders.add(header);
      }
    });

    const required: (keyof MappedStudent)[] = ["student_number", "first_name"];
    for (const field of required) {
      if (![...columns.values()].includes(field)) {
        fail(`Sheet "${sheetName}": row 2 has no column for ${field}.`);
      }
    }

    const students: PlannedStudent[] = [];

    for (let index = 2; index < rows.length; index += 1) {
      const row = rows[index] ?? [];
      const rowNumber = index + 1;

      const isEmpty = row.every((cell) => cellText(cell) === "");
      if (isEmpty) continue;

      const mapped: MappedStudent = {
        student_number: "",
        first_name: "",
        middle_name: null,
        last_name: null,
        phone: null,
        email: null,
        address_line: null,
      };

      for (const [columnIndex, field] of columns) {
        const value = cellText(row[columnIndex]);
        if (field === "student_number" || field === "first_name") {
          mapped[field] = value;
        } else {
          mapped[field] = optional(value);
        }
      }

      // The workbook repeats its header row part way down each sheet.
      if (mapped.first_name.toLowerCase() === "first name") continue;

      if (!mapped.student_number) {
        if (mapped.first_name) {
          skipped.push({
            sheet: sheetName,
            row: rowNumber,
            reason: "No Student ID. Add the student by hand after the import.",
          });
        }
        continue;
      }

      if (!mapped.first_name) {
        skipped.push({
          sheet: sheetName,
          row: rowNumber,
          reason: `Student ${mapped.student_number} has no first name.`,
        });
        continue;
      }

      const firstSeen = seenStudentNumbers.get(mapped.student_number);
      if (firstSeen) {
        skipped.push({
          sheet: sheetName,
          row: rowNumber,
          reason: `Student ${mapped.student_number} also appears in "${firstSeen}". Only the first one is imported.`,
        });
        continue;
      }
      seenStudentNumbers.set(mapped.student_number, sheetName);

      const location = parseAddress(mapped.address_line);

      students.push({
        ...mapped,
        address_line: location.addressLine,
        city: location.city,
        province: location.province,
        postal_code: location.postalCode,
        sheet: sheetName,
        row: rowNumber,
        warnings: location.warnings,
      });
    }

    batches.push({
      sheet: sheetName,
      name: batchInfo.name,
      program: batchInfo.program,
      schedule_label: batchInfo.schedule,
      start_date: batchInfo.startDate,
      sort_order: sheetIndex + 1,
      students,
    });
  });

  return { batches, skipped, ignoredHeaders };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function displayName(student: PlannedStudent): string {
  return [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(" ");
}

function report(
  plan: ReturnType<typeof buildPlan>,
  options: Options,
): void {
  const { batches, skipped, ignoredHeaders } = plan;

  console.log("\nWorkbook:", options.workbookPath);
  console.log("Mode:", options.mode);

  console.log("\nBatches found");
  for (const batch of batches) {
    console.log(
      `  sheet "${batch.sheet}" -> ${batch.name} | ${batch.program} | ${batch.schedule_label} | starts ${batch.start_date} | ${batch.students.length} students`,
    );
  }

  const total = batches.reduce((sum, batch) => sum + batch.students.length, 0);
  console.log(`\nStudents that would be processed: ${total}`);

  if (options.verbose) {
    for (const batch of batches) {
      console.log(`\n  ${batch.name}`);
      for (const student of batch.students) {
        console.log(`    ${student.student_number}  ${displayName(student)}`);
      }
    }
  } else {
    console.log("  (run with --verbose to list student numbers and names)");
  }

  const withWarnings = batches.flatMap((batch) =>
    batch.students.filter((student) => student.warnings.length > 0),
  );

  console.log(`\nLocation parse warnings: ${withWarnings.length}`);
  for (const student of withWarnings) {
    console.log(
      `  ${student.sheet} row ${student.row} (${student.student_number}): ${student.warnings.join(" ")}`,
    );
  }
  if (withWarnings.length > 0) {
    console.log(
      "  The full address is still stored. Review these students in the application.",
    );
  }

  console.log(`\nSkipped rows: ${skipped.length}`);
  for (const row of skipped) {
    console.log(`  ${row.sheet} row ${row.row}: ${row.reason}`);
  }

  const ignored = [...ignoredHeaders].filter((header) =>
    IGNORED_HEADERS.some((known) => header.includes(known)),
  );
  const unexpected = [...ignoredHeaders].filter(
    (header) => !ignored.includes(header),
  );

  console.log("\nColumns deliberately not imported:");
  console.log(`  ${ignored.join(", ") || "none found"}`);
  if (unexpected.length > 0) {
    console.log("Columns seen but not recognised (also not imported):");
    console.log(`  ${unexpected.join(", ")}`);
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

async function apply(
  plan: ReturnType<typeof buildPlan>,
  options: Options,
): Promise<void> {
  const supabase = serviceClient();

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const batch of plan.batches) {
    // Create or reuse the batch. Names are unique, so a repeat run reuses it.
    const { data: existingBatch, error: batchReadError } = await supabase
      .from("batches")
      .select("id")
      .ilike("name", batch.name)
      .maybeSingle();

    if (batchReadError) fail(`Reading batch "${batch.name}": ${batchReadError.message}`);

    let batchId = existingBatch?.id as string | undefined;

    if (!batchId) {
      const { data: inserted, error: batchInsertError } = await supabase
        .from("batches")
        .insert({
          name: batch.name,
          program: batch.program,
          start_date: batch.start_date,
          schedule_label: batch.schedule_label,
          status: "active",
          sort_order: batch.sort_order,
        })
        .select("id")
        .single();

      if (batchInsertError) {
        fail(`Creating batch "${batch.name}": ${batchInsertError.message}`);
      }
      batchId = inserted.id as string;
      console.log(`Created batch ${batch.name}`);
    } else {
      console.log(`Reusing batch ${batch.name}`);
    }

    for (const student of batch.students) {
      const { data: existing, error: readError } = await supabase
        .from("students")
        .select("id")
        .eq("student_number", student.student_number)
        .maybeSingle();

      if (readError) {
        fail(`Reading student ${student.student_number}: ${readError.message}`);
      }

      const workbookFields = {
        first_name: student.first_name,
        middle_name: student.middle_name,
        last_name: student.last_name,
        phone: student.phone,
        email: student.email,
        address_line: student.address_line,
        city: student.city,
        province: student.province,
        postal_code: student.postal_code,
        batch_id: batchId,
      };

      if (!existing) {
        const { error: insertError } = await supabase.from("students").insert({
          student_number: student.student_number,
          program: batch.program,
          ...workbookFields,
          // Imported students always start here. Historical placement and
          // document state is corrected by staff in the application.
          placement_status: "needs_review",
          document_status: "not_reviewed",
          is_returning: false,
          is_active: true,
          migration_source: MIGRATION_SOURCE,
        });

        if (insertError) {
          fail(
            `Creating student ${student.student_number}: ${insertError.message}`,
          );
        }
        created += 1;
        continue;
      }

      if (!options.updateExisting) {
        unchanged += 1;
        continue;
      }

      // Placement status, document status, and returning are never touched, so
      // corrections made in the application survive a repeat run.
      const { error: updateError } = await supabase
        .from("students")
        .update(workbookFields)
        .eq("id", existing.id);

      if (updateError) {
        fail(`Updating student ${student.student_number}: ${updateError.message}`);
      }
      updated += 1;
    }
  }

  console.log("\nImport summary");
  console.log(`  students created: ${created}`);
  console.log(`  students updated: ${updated}`);
  console.log(`  students already present, left alone: ${unchanged}`);
  if (unchanged > 0 && !options.updateExisting) {
    console.log(
      "  Pass --update-existing to refresh workbook fields on those records.",
    );
  }
  console.log(`  rows skipped: ${plan.skipped.length}`);
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
  console.error("\nImport failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
