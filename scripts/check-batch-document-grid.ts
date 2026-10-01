/**
 * Checks for PLACEMENT-07B.1: the Batch Document Grid.
 *
 *   npm run check:batch-grid
 *
 * ---------------------------------------------------------------------------
 * This script NEVER touches the database and NEVER sends anything
 * ---------------------------------------------------------------------------
 *
 * It imports only pure modules: the grid matrix builder, the class session
 * vocabulary and schema, the toolbar URL parser, and the placement
 * vocabulary. It also reads the batch page, the grid components, the actions,
 * the bulk read, and migration 0011 as TEXT, to assert on what the code does
 * rather than on what a comment says about it.
 *
 * The fixtures are invented placeholders and deliberately not real students.
 */

import fs from "node:fs";
import path from "node:path";

import {
  BATCH_VIEWS,
  DEFAULT_BATCH_VIEW,
  GRID_STATUS_TONES,
  MISSING_CELL,
  NOT_INITIALIZED_LABEL,
  batchViewFrom,
  buildBatchDocumentGrid,
  countNotesByStudent,
  documentCellLabel,
  documentCellTone,
  latestNotesByStudent,
  notePreview,
  requirementColumnLabel,
  sortGridRequirements,
  type GridChecklistRow,
  type GridRequirement,
  type GridStudent,
  type GridStudentNote,
} from "../src/lib/documents/batch-grid";
import type { DocumentReadiness } from "../src/lib/documents/queries";
import {
  CLASS_SESSIONS,
  CLASS_SESSION_LABELS,
  CLASS_SESSION_NOT_SET_LABEL,
  PLACEMENT_DOCUMENT_STATUSES,
  PLACEMENT_DOCUMENT_STATUS_LABELS,
  classSessionLabel,
  isClassSession,
  type ClassSession,
  type PlacementDocumentStatus,
  type PlacementStatus,
} from "../src/lib/placement/constants";
import {
  emptyToolbarValues,
  studentHref,
  toolbarValuesFrom,
} from "../src/lib/students/filters";
import { ClassSessionChangeSchema } from "../src/lib/students/schema";

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
    return;
  }
  failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
  console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n${title}`);
}

function same<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sourceOf(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

/** Lines of SQL with comments removed, so an assertion is about the DDL. */
function sqlWithoutComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

/**
 * TypeScript with its comments removed, so an assertion about a forbidden
 * name is about CODE. The grid's own doc comments name student_message and
 * schedule_label on purpose, to say they are never used.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .map((line) => line.replace(/\s\/\/.*$/, ""))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const UUID = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function requirement(
  id: string,
  name: string,
  sortOrder: number,
  extra: Partial<GridRequirement> = {},
): GridRequirement {
  return { id, name, short_name: null, is_required: true, sort_order: sortOrder, ...extra };
}

// Deliberately NOT in sort order, so the builder has to sort them.
const R_TB = requirement("r-tb", "TB Test (Two Step)", 50, { short_name: "TB" });
const R_SEROLOGY = requirement("r-serology", "Serology Report", 10, { short_name: "Serology" });
const R_BLOOD = requirement("r-blood", "Blood Report", 40, { short_name: "Blood" });
const R_IMMUN = requirement("r-immun", "Immunization Record", 20);
const R_VSC = requirement("r-vsc", "Vulnerable Sector Police Check Certificate", 90, { short_name: "VSC" });
const R_OPTIONAL = requirement("r-driver", "Driver Abstract", 200, { is_required: false });
const R_SAME_ORDER_B = requirement("r-zeta", "Zeta Form", 300);
const R_SAME_ORDER_A = requirement("r-alpha", "Alpha Form", 300);
const REQUIREMENTS = [R_TB, R_SEROLOGY, R_OPTIONAL, R_BLOOD, R_SAME_ORDER_B, R_IMMUN, R_VSC, R_SAME_ORDER_A];

function student(
  id: string,
  placementStatus: PlacementStatus,
  classSession: ClassSession | null,
  extra: Partial<GridStudent> = {},
): GridStudent {
  return {
    id,
    student_number: `S-${id}`,
    first_name: `First ${id}`,
    middle_name: null,
    last_name: `Last ${id}`,
    is_returning: false,
    placement_status: placementStatus,
    class_session: classSession,
    ...extra,
  };
}

// One PSW batch holding BOTH Morning and Evening students, plus Not Set.
const PSW_STUDENTS: GridStudent[] = [
  student("s1", "documents_pending", "morning"),
  student("s2", "ready_for_placement", "evening"),
  student("s3", "needs_review", null, { is_returning: true }),
  student("s4", "placement_assigned", "morning"),
];

// One ECEA batch, same shape, different program lane.
const ECEA_STUDENTS: GridStudent[] = [
  student("e1", "documents_pending", "evening"),
  student("e2", "ready_for_placement", "morning"),
];

/**
 * Checklist rows as the TABLE holds them, student_message included, so the
 * test proves the matrix never carries it even when handed a wider row.
 */
type WideRow = GridChecklistRow & { student_message: string | null };

const PRIVATE_MESSAGE = "PRIVATE-STUDENT-MESSAGE-must-never-appear";
const TB_NOTE = "Step 1 complete. Step 2 booked Oct 8.";

let rowCounter = 0;
function row(
  studentId: string,
  requirementId: string,
  status: PlacementDocumentStatus,
  note: string | null = null,
): WideRow {
  rowCounter += 1;
  return {
    id: `doc-${rowCounter}`,
    student_id: studentId,
    requirement_id: requirementId,
    status,
    note,
    student_message: PRIVATE_MESSAGE,
  };
}

const CHECKLIST_ROWS: WideRow[] = [
  // s1: every requirement, a spread of statuses, one internal note
  row("s1", R_SEROLOGY.id, "received"),
  row("s1", R_IMMUN.id, "requested"),
  row("s1", R_BLOOD.id, "needs_update"),
  row("s1", R_TB.id, "not_reviewed", TB_NOTE),
  row("s1", R_VSC.id, "not_applicable"),
  row("s1", R_OPTIONAL.id, "received"),
  row("s1", R_SAME_ORDER_A.id, "received"),
  row("s1", R_SAME_ORDER_B.id, "received"),
  // s2: missing TB and VSC entirely
  row("s2", R_SEROLOGY.id, "received"),
  row("s2", R_IMMUN.id, "received"),
  row("s2", R_BLOOD.id, "received"),
  row("s2", R_OPTIONAL.id, "not_reviewed"),
  row("s2", R_SAME_ORDER_A.id, "received"),
  row("s2", R_SAME_ORDER_B.id, "received"),
  // s3: everything not reviewed
  ...REQUIREMENTS.map((r) => row("s3", r.id, "not_reviewed")),
  // s4: everything received
  ...REQUIREMENTS.map((r) => row("s4", r.id, "received")),
  // a row for an INACTIVE requirement that is not a column: must be ignored
  row("s1", "r-archived", "requested"),
  // rows for another batch and an unknown student: must be ignored
  row("e1", R_SEROLOGY.id, "requested"),
  row("ghost", R_SEROLOGY.id, "requested"),
  // ECEA
  ...REQUIREMENTS.map((r) => row("e1", r.id, "requested")),
  ...REQUIREMENTS.map((r) => row("e2", r.id, "received")),
];

function readiness(ready: number, total: number, reviewed: number): DocumentReadiness {
  return {
    requiredTotal: total,
    requiredReady: ready,
    activeTotal: total + 1,
    activeReady: ready,
    reviewedCount: reviewed,
    percent: total === 0 ? 100 : Math.round((ready / total) * 100),
    isReady: ready >= total,
  };
}

// Values deliberately NOT what counting the fixture cells would give, so the
// test can tell "passed through from the view" apart from "recomputed".
const READINESS = new Map<string, DocumentReadiness>([
  ["s1", readiness(9, 13, 13)],
  ["s2", readiness(12, 13, 12)],
  ["s3", readiness(0, 13, 0)],
  ["s4", readiness(13, 13, 13)],
  ["e1", readiness(2, 13, 13)],
  ["e2", readiness(13, 13, 13)],
]);

function note(
  id: string,
  studentId: string,
  body: string,
  createdAt: string,
  createdBy: string | null = "u-priya",
): GridStudentNote {
  return { id, student_id: studentId, body, created_at: createdAt, created_by: createdBy };
}

// Out of chronological order on purpose.
const NOTES: GridStudentNote[] = [
  note("n1", "s1", "Called, no answer.", "2026-09-20T10:00:00Z"),
  note("n3", "s1", "Not responding - called twice.", "2026-09-26T15:30:00Z"),
  note("n2", "s1", "Student will call back.", "2026-09-22T09:00:00Z", null),
  note("n4", "s2", "Will submit documents Friday.", "2026-09-25T12:00:00Z", "u-sam"),
  note("n5", "e1", "Waiting for VSC appointment.", "2026-09-24T12:00:00Z"),
  note("n6", "ghost", "Nobody.", "2026-09-24T12:00:00Z"),
];

const AUTHORS = new Map<string, string | null>([
  ["u-priya", "Priya"],
  ["u-sam", null],
]);

const psw = buildBatchDocumentGrid({
  students: PSW_STUDENTS,
  requirements: REQUIREMENTS,
  rows: CHECKLIST_ROWS,
  readiness: READINESS,
  notes: NOTES,
  authorNames: AUTHORS,
});

const ecea = buildBatchDocumentGrid({
  students: ECEA_STUDENTS,
  requirements: REQUIREMENTS,
  rows: CHECKLIST_ROWS,
  readiness: READINESS,
  notes: NOTES,
  authorNames: AUTHORS,
});

const rowFor = (id: string) => psw.rows.find((r) => r.student.id === id);
const cell = (studentId: string, requirementId: string) =>
  rowFor(studentId)?.cells[requirementId];

// ---------------------------------------------------------------------------
// A. Rows and columns
// ---------------------------------------------------------------------------

section("A. Rows and columns");

check("one student = one row", psw.rows.length === PSW_STUDENTS.length);
check(
  "rows keep the students' order",
  same(psw.rows.map((r) => r.student.id), PSW_STUDENTS.map((s) => s.id)),
);
check(
  "every row belongs to a student in the batch, never a ghost",
  psw.rows.every((r) => PSW_STUDENTS.some((s) => s.id === r.student.id)),
);
check(
  "requirements determine the columns dynamically",
  psw.columns.length === REQUIREMENTS.length &&
    REQUIREMENTS.every((r) => psw.columns.some((c) => c.id === r.id)),
);
check(
  "requirement sort_order is respected, then name on a tie",
  same(psw.columns.map((c) => c.id), [
    R_SEROLOGY.id,
    R_IMMUN.id,
    R_BLOOD.id,
    R_TB.id,
    R_VSC.id,
    R_OPTIONAL.id,
    R_SAME_ORDER_A.id,
    R_SAME_ORDER_B.id,
  ]),
  psw.columns.map((c) => c.id).join(" | "),
);
check(
  "sortGridRequirements does not mutate its input",
  REQUIREMENTS[0].id === R_TB.id && sortGridRequirements(REQUIREMENTS)[0].id === R_SEROLOGY.id,
);
check(
  "a column header uses the short name when Admin set one, else the name",
  requirementColumnLabel(R_SEROLOGY) === "Serology" &&
    requirementColumnLabel(R_IMMUN) === "Immunization Record" &&
    requirementColumnLabel({ ...R_TB, short_name: "   " }) === R_TB.name,
);
check(
  "an optional requirement is still a column, marked optional",
  psw.columns.some((c) => c.id === R_OPTIONAL.id && c.is_required === false),
);
check(
  "every row has a cell for every column, and only for columns",
  psw.rows.every(
    (r) =>
      Object.keys(r.cells).length === psw.columns.length &&
      psw.columns.every((c) => c.id in r.cells),
  ),
);
check(
  "a row for an archived requirement is not a column and not a cell",
  !psw.columns.some((c) => c.id === "r-archived") &&
    psw.rows.every((r) => !("r-archived" in r.cells)),
);
check(
  "Serology and Blood Report are both columns, unmerged, under their own names",
  psw.columns.some((c) => c.name === "Serology Report") &&
    psw.columns.some((c) => c.name === "Blood Report"),
);

// ---------------------------------------------------------------------------
// B. Cells
// ---------------------------------------------------------------------------

section("B. Cells");

const s1Serology = cell("s1", R_SEROLOGY.id);
const s1Immun = cell("s1", R_IMMUN.id);
const s1Blood = cell("s1", R_BLOOD.id);
const s1Tb = cell("s1", R_TB.id);
const s1Vsc = cell("s1", R_VSC.id);

check(
  "the correct document status sits at each intersection",
  s1Serology?.kind === "document" && s1Serology.status === "received" &&
    s1Immun?.kind === "document" && s1Immun.status === "requested" &&
    s1Blood?.kind === "document" && s1Blood.status === "needs_update" &&
    s1Tb?.kind === "document" && s1Tb.status === "not_reviewed" &&
    s1Vsc?.kind === "document" && s1Vsc.status === "not_applicable",
);
check(
  "each cell carries the id of exactly the row it came from",
  s1Tb?.kind === "document" &&
    CHECKLIST_ROWS.find((r) => r.id === s1Tb.documentId)?.requirement_id === R_TB.id &&
    CHECKLIST_ROWS.find((r) => r.id === s1Tb.documentId)?.student_id === "s1",
);
check(
  "a missing checklist row becomes Not Initialized, never Received",
  cell("s2", R_TB.id) === MISSING_CELL &&
    cell("s2", R_VSC.id) === MISSING_CELL &&
    documentCellLabel(MISSING_CELL) === NOT_INITIALIZED_LABEL &&
    NOT_INITIALIZED_LABEL === "Not Initialized",
);
check(
  "missing rows are counted per student and for the whole grid",
  rowFor("s2")?.missingCount === 2 &&
    rowFor("s1")?.missingCount === 0 &&
    psw.missingCellCount === 2 &&
    psw.studentsMissingRows === 1,
);
check(
  "status labels are the five existing labels",
  same(
    PLACEMENT_DOCUMENT_STATUSES.map((s) => PLACEMENT_DOCUMENT_STATUS_LABELS[s]),
    ["Not Reviewed", "Requested", "Received", "Needs Update", "N/A"],
  ) &&
    PLACEMENT_DOCUMENT_STATUSES.every(
      (s) =>
        documentCellLabel({ kind: "document", documentId: "x", status: s, note: null }) ===
        PLACEMENT_DOCUMENT_STATUS_LABELS[s],
    ),
);
check(
  "the colour scale: received green, requested amber, needs_update red, not_reviewed neutral, N/A muted",
  GRID_STATUS_TONES.received === "ready" &&
    GRID_STATUS_TONES.requested === "warning" &&
    GRID_STATUS_TONES.needs_update === "attention" &&
    GRID_STATUS_TONES.not_reviewed === "neutral" &&
    GRID_STATUS_TONES.not_applicable === "muted" &&
    documentCellTone(MISSING_CELL) === "missing",
);
check(
  "a full row and an empty row both render every cell",
  psw.columns.every((c) => cell("s4", c.id)?.kind === "document") &&
    psw.columns.every((c) => {
      const value = cell("s3", c.id);
      return value?.kind === "document" && value.status === "not_reviewed";
    }),
);

// ---------------------------------------------------------------------------
// C. The three kinds of text
// ---------------------------------------------------------------------------

section("C. Internal note, student message, general notes");

check(
  "the document note on a cell is student_placement_documents.note",
  s1Tb?.kind === "document" && s1Tb.note === TB_NOTE &&
    s1Serology?.kind === "document" && s1Serology.note === null,
);

const serialized = JSON.stringify(psw) + JSON.stringify(ecea);
check(
  "student_message never appears in the matrix, even from a wider row",
  !serialized.includes(PRIVATE_MESSAGE) && !serialized.includes("student_message"),
);

check(
  "General Notes carries the LATEST student_notes row by created_at, not by array order",
  rowFor("s1")?.latestNote?.id === "n3" &&
    rowFor("s1")?.latestNote?.body === "Not responding - called twice.",
);
check(
  "the latest note carries its date and author name",
  rowFor("s1")?.latestNote?.created_at === "2026-09-26T15:30:00Z" &&
    rowFor("s1")?.latestNote?.author_name === "Priya" &&
    rowFor("s2")?.latestNote?.author_name === null,
);
check(
  "a student with no notes has none, and a ghost's notes reach nobody",
  rowFor("s3")?.latestNote === null && rowFor("s3")?.noteCount === 0 &&
    !serialized.includes("Nobody."),
);
check(
  "note counts are per student",
  rowFor("s1")?.noteCount === 3 && rowFor("s2")?.noteCount === 1,
);
check(
  "latestNotesByStudent picks the newest regardless of input order",
  latestNotesByStudent(NOTES).get("s1")?.id === "n3" &&
    latestNotesByStudent([...NOTES].reverse()).get("s1")?.id === "n3" &&
    countNotesByStudent(NOTES).get("s1") === 3,
);
check(
  "the note preview flattens whitespace and truncates with an ellipsis",
  notePreview("  Called,\n\nno   answer. ") === "Called, no answer." &&
    notePreview("x".repeat(200)).length === 90 &&
    notePreview("x".repeat(200)).endsWith("…"),
);

// ---------------------------------------------------------------------------
// D. Session
// ---------------------------------------------------------------------------

section("D. Morning / Evening");

const parse = (value: string | null) =>
  ClassSessionChangeSchema.safeParse({ student_id: UUID(1), class_session: value ?? "" });

check("Morning is saved as class_session = morning", parse("morning").success && parse("morning").data?.class_session === "morning");
check("Evening is saved as class_session = evening", parse("evening").success && parse("evening").data?.class_session === "evening");
check("Not Set is saved as null", parse("").success && parse("").data?.class_session === null && parse(null).data?.class_session === null);
check("whitespace is Not Set too", parse("   ").success && parse("   ").data?.class_session === null);
check(
  "anything else is refused",
  !parse("afternoon").success && !parse("MORNING").success && !parse("Morning").success,
);
check(
  "a malformed student id is refused",
  !ClassSessionChangeSchema.safeParse({ student_id: "s1", class_session: "morning" }).success,
);
check(
  "the vocabulary is exactly morning and evening with Not Set for null",
  same(CLASS_SESSIONS, ["morning", "evening"]) &&
    CLASS_SESSION_LABELS.morning === "Morning" &&
    CLASS_SESSION_LABELS.evening === "Evening" &&
    CLASS_SESSION_NOT_SET_LABEL === "Not Set" &&
    classSessionLabel(null) === "Not Set" &&
    classSessionLabel("morning") === "Morning" &&
    isClassSession("evening") &&
    !isClassSession("night") &&
    !isClassSession(null),
);
check(
  "one batch may contain both Morning and Evening students, and Not Set",
  psw.rows.some((r) => r.student.class_session === "morning") &&
    psw.rows.some((r) => r.student.class_session === "evening") &&
    psw.rows.some((r) => r.student.class_session === null),
);
check(
  "each row shows that student's own session, untouched",
  rowFor("s1")?.student.class_session === "morning" &&
    rowFor("s2")?.student.class_session === "evening" &&
    rowFor("s3")?.student.class_session === null,
);

// ---------------------------------------------------------------------------
// E. Readiness and placement status
// ---------------------------------------------------------------------------

section("E. Readiness and placement status");

check(
  "readiness is the derived view's value passed through, never recomputed",
  rowFor("s1")?.readiness === READINESS.get("s1") &&
    rowFor("s1")?.readiness?.requiredReady === 9 &&
    rowFor("s2")?.readiness?.requiredReady === 12 &&
    rowFor("s4")?.readiness?.isReady === true,
);
check(
  "a student the view has no row for has undefined readiness, not zero",
  buildBatchDocumentGrid({
    students: [student("nobody", "needs_review", null)],
    requirements: REQUIREMENTS,
    rows: [],
    readiness: READINESS,
    notes: [],
  }).rows[0]?.readiness === undefined,
);
check(
  "placement status is carried as stored, for a pill, not for editing",
  rowFor("s4")?.student.placement_status === "placement_assigned",
);

// ---------------------------------------------------------------------------
// F. PSW and ECEA, search
// ---------------------------------------------------------------------------

section("F. PSW and ECEA, search");

check("PSW works", psw.rows.length === 4 && psw.columns.length === REQUIREMENTS.length);
check(
  "ECEA works through the same builder",
  ecea.rows.length === 2 &&
    ecea.columns.length === REQUIREMENTS.length &&
    ecea.rows.every((r) => psw.columns.every((c) => c.id in r.cells)) &&
    ecea.rows.find((r) => r.student.id === "e1")?.cells[R_SEROLOGY.id]?.kind === "document" &&
    ecea.rows.find((r) => r.student.id === "e1")?.latestNote?.body === "Waiting for VSC appointment.",
);
check(
  "rows from the other batch never cross over",
  !psw.rows.some((r) => r.student.id.startsWith("e")) &&
    !ecea.rows.some((r) => r.student.id.startsWith("s")),
);

const searched = buildBatchDocumentGrid({
  students: PSW_STUDENTS.filter((s) => s.id === "s2"),
  requirements: REQUIREMENTS,
  rows: CHECKLIST_ROWS,
  readiness: READINESS,
  notes: NOTES,
});
check(
  "search narrows rows only; the requirement columns are unchanged",
  searched.rows.length === 1 &&
    same(searched.columns.map((c) => c.id), psw.columns.map((c) => c.id)),
);

// ---------------------------------------------------------------------------
// G. The view parameter
// ---------------------------------------------------------------------------

section("G. View parameter");

check("the Document Grid is the default", DEFAULT_BATCH_VIEW === "grid" && same(BATCH_VIEWS, ["grid", "cards"]));
check(
  "missing, empty, or invalid view opens the grid",
  batchViewFrom(undefined) === "grid" &&
    batchViewFrom("") === "grid" &&
    batchViewFrom("spreadsheet") === "grid" &&
    batchViewFrom("GRID") === "grid" &&
    batchViewFrom("grid") === "grid",
);
check("view=cards opens the cards", batchViewFrom("cards") === "cards" && batchViewFrom(["cards", "grid"]) === "cards");
check(
  "the toolbar carries view through a search so cards stay cards",
  toolbarValuesFrom({ view: "cards", q: "jane" }).view === "cards" &&
    studentHref("/students/batches/b1", toolbarValuesFrom({ view: "cards" }), { q: "jane" }) ===
      "/students/batches/b1?q=jane&view=cards" &&
    emptyToolbarValues.view === "",
);

// ---------------------------------------------------------------------------
// H. Source assertions: actions, permissions, privacy, revalidation
// ---------------------------------------------------------------------------

section("H. Actions, permissions, privacy");

const pageSource = sourceOf("src/app/(app)/students/batches/[batchId]/page.tsx");
const gridSources = [
  "src/components/documents/BatchDocumentGrid.tsx",
  "src/components/documents/BatchDocumentStatusCell.tsx",
  "src/components/documents/DocumentInternalNoteButton.tsx",
  "src/components/documents/StudentGeneralNotesCell.tsx",
  "src/components/documents/StudentSessionCell.tsx",
  "src/components/documents/batch-grid-tones.ts",
].map(sourceOf);
const libSource = sourceOf("src/lib/documents/batch-grid.ts");
const readSource = sourceOf("src/lib/documents/batch-grid-queries.ts");
const documentActions = sourceOf("src/lib/documents/actions.ts");
const studentActions = sourceOf("src/lib/students/actions.ts");
const gridSurface = codeOnly(
  [pageSource, ...gridSources, libSource, readSource].join("\n"),
);

function body(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  if (start < 0) return "";
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

const setStatus = codeOnly(body(documentActions, "setDocumentStatusAction"));
const saveNote = codeOnly(body(documentActions, "saveDocumentNoteAction"));
const saveMessage = codeOnly(body(documentActions, "saveStudentMessageAction"));
const addNote = codeOnly(body(studentActions, "addStudentNoteAction"));
const setSession = codeOnly(body(studentActions, "setStudentClassSessionAction"));

check(
  "a document status edit updates ONE checklist row by its id",
  setStatus.includes('.from("student_placement_documents")') &&
    setStatus.includes(".update({") &&
    setStatus.includes('.eq("id", parsed.data.document_id)') &&
    !setStatus.includes(".in(") &&
    !setStatus.includes('.eq("student_id"'),
);
check(
  "the status cell calls that existing action and no other mutation",
  gridSources[1].includes("setDocumentStatusAction") &&
    !gridSources[1].includes("markRemainingDocumentsReceivedAction") &&
    !gridSources[1].includes("resetStudentDocumentsAction"),
);
check(
  "the document note button writes student_placement_documents.note through the existing action",
  gridSources[2].includes("saveDocumentNoteAction") &&
    saveNote.includes(".update({ note: parsed.data.note") &&
    saveNote.includes('.eq("id", parsed.data.document_id)'),
);
check(
  "the note action and the message action stay separate columns",
  !/update\(\{[^}]*student_message/.test(saveNote) &&
    !/update\(\{[^}]*\bnote\b/.test(saveMessage),
);
check(
  "the grid never reads, shows, or writes student_message",
  !gridSurface.includes("student_message") &&
    !gridSurface.includes("saveStudentMessageAction") &&
    !gridSurface.includes("studentMessage"),
);
check(
  "the bulk checklist read selects exactly id, student_id, requirement_id, status, note",
  readSource.includes('.select("id, student_id, requirement_id, status, note")') &&
    !/select\([^)]*description/.test(readSource),
);
check(
  "the bulk read reads student_notes, not a second note field",
  readSource.includes('.from("student_notes")') &&
    readSource.includes('.select("id, student_id, body, created_at, created_by")'),
);
check(
  "the bulk read and the matrix never insert, update, upsert, delete, or rpc",
  !/\.(insert|update|upsert|delete|rpc)\(/.test(readSource + libSource) &&
    !/\.(insert|update|upsert|delete|rpc)\(/.test(pageSource),
);
check(
  "General Notes posts through the existing addStudentNoteAction",
  gridSources[3].includes("addStudentNoteAction") &&
    gridSources[3].includes('name="student_id"') &&
    gridSources[3].includes('name="body"'),
);
check(
  "adding a general note INSERTS a student_notes row and never updates or overwrites",
  addNote.includes('.from("student_notes").insert({') &&
    !addNote.includes(".update(") &&
    !addNote.includes(".upsert(") &&
    !addNote.includes(".delete("),
);
check(
  "View Notes opens the student profile rather than loading the history into the grid",
  gridSources[3].includes("href={`/students/${studentId}`}") &&
    !/listStudentNotes/.test(gridSurface),
);
check(
  "the session action updates ONLY students.class_session for one student",
  setSession.includes('.from("students")') &&
    setSession.includes(".update({ class_session: parsed.data.class_session })") &&
    setSession.includes('.eq("id", parsed.data.student_id)') &&
    !setSession.includes("batch_id") &&
    !setSession.includes("placement_status") &&
    !setSession.includes("program") &&
    !setSession.includes("student_notes") &&
    !setSession.includes("student_placement_documents"),
);
check(
  "the session action uses the student edit permission (any active staff), not canManageDocuments",
  setSession.includes("await requireActiveStaff()") &&
    !setSession.includes("canManageDocuments") &&
    !setSession.includes("isAdmin("),
);
check(
  "document status and note stay behind canManageDocuments, in the action and on the page",
  setStatus.includes("if (!canManageDocuments(session)) return NOT_ALLOWED;") &&
    saveNote.includes("if (!canManageDocuments(session)) return NOT_ALLOWED;") &&
    pageSource.includes("canManageDocuments(session)") &&
    pageSource.includes("canManageDocuments={canManage}"),
);
check(
  "the status cell hides its controls from view-only staff",
  gridSources[1].includes("canManage ? (") &&
    gridSources[1].includes("<select") &&
    gridSources[4].includes("if (!canEdit)"),
);
check(
  "the page gates session editing and note adding on active staff, the student edit model",
  pageSource.includes("isActiveStaff(session)") &&
    pageSource.includes("canEditStudents={canEditStudents}") &&
    pageSource.includes("canAddNotes={canEditStudents}"),
);
check(
  "the grid has no placement status dropdown",
  !gridSources[0].includes("PLACEMENT_STATUSES.map") &&
    !gridSurface.includes("setPlacementStatus") &&
    gridSources[0].includes("<PlacementStatusPill"),
);
check(
  "the page lists only this batch's students, with the search applied as a row filter",
  pageSource.includes("listStudents({ ...studentFiltersFrom(values), batchId: batch.id })") &&
    pageSource.includes("readBatchGridData(") &&
    pageSource.includes("students.map((student) => student.id)"),
);
check(
  "the grid surface never assumes batch.schedule_label",
  !gridSurface.includes("schedule_label") || pageSource.split("schedule_label").length === 3,
);
check(
  "the matrix and the components never read schedule_label at all",
  !codeOnly(gridSources.join("\n") + libSource + readSource).includes(
    "schedule_label",
  ),
);
check(
  "readiness arithmetic is not reimplemented on the grid",
  !libSource.includes("READY_DOCUMENT_STATUSES") &&
    !libSource.includes("isDocumentReady") &&
    !gridSources.join("\n").includes("READY_DOCUMENT_STATUSES") &&
    pageSource.includes("listStudentReadiness()"),
);
check(
  "the grid sends no email and touches no email history",
  !/resend|sendEmail|student_email_log|email_log/i.test(gridSurface),
);
check(
  "the view switch keeps the search and filters in both links",
  pageSource.includes('studentHref(basePath, values, { view: "grid" })') &&
    pageSource.includes('studentHref(basePath, values, { view: "cards" })'),
);

section("I. Revalidation");

check(
  "a document status or note change refreshes the batch grid, the student, the documents page, Students, and Placement",
  documentActions.includes('revalidatePath("/students/batches/[batchId]", "page")') &&
    documentActions.includes("revalidatePath(`/students/${studentId}/documents`)") &&
    documentActions.includes("revalidatePath(`/students/${studentId}`)") &&
    documentActions.includes('revalidatePath("/students")') &&
    documentActions.includes('revalidatePath("/placement")'),
);
check(
  "a general note refreshes the batch grid and the student profile",
  addNote.includes('revalidatePath("/students/batches/[batchId]", "page")') &&
    addNote.includes("revalidatePath(`/students/${parsed.data.student_id}`)"),
);
check(
  "a session change refreshes the batch grid and the student page",
  setSession.includes('revalidatePath("/students/batches/[batchId]", "page")') &&
    setSession.includes("revalidatePath(`/students/${parsed.data.student_id}`)"),
);
check(
  "no action here touches the email history",
  !setSession.includes("email") && !addNote.includes("email") && !setStatus.includes("email"),
);

// ---------------------------------------------------------------------------
// J. Migration 0011
// ---------------------------------------------------------------------------

section("J. Migration 0011");

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "0011_student_class_session.sql");
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
const ddl = sqlWithoutComments(migration);
// The column COMMENT names schedule_label to say it is never used; the
// statements that could actually derive something are everything else.
const statements = ddl.replace(/comment on column[\s\S]*?;/i, "");

check("0011_student_class_session.sql exists and is the next number", migration.length > 0 &&
  fs.readdirSync(path.join(process.cwd(), "supabase", "migrations")).filter((n) => n.endsWith(".sql")).length === 11);
check(
  "it adds students.class_session as nullable text",
  /alter table public\.students\s+add column if not exists class_session text null;/.test(ddl),
);
check(
  "it constrains the value to morning / evening / null with a CHECK",
  ddl.includes("check (class_session is null or class_session in ('morning', 'evening'))"),
);
check(
  "it carries the required comment",
  migration.includes("This identifies the student''s class/session within a batch. A single batch may contain both Morning and Evening students."),
);
check(
  "it never infers, backfills, or derives a session for existing students",
  !/update public\.students/i.test(statements) &&
    !/schedule_label/i.test(statements) &&
    !/set class_session/i.test(statements) &&
    !/create (or replace )?function/i.test(statements) &&
    !/create trigger/i.test(statements),
);
check(
  "it changes no other table and no policy",
  !/alter table public\.(batches|student_notes|student_placement_documents|placement_document_requirements)/i.test(ddl) &&
    !/create policy|drop policy/i.test(ddl) &&
    !/create index/i.test(ddl),
);
check(
  "the TypeScript row type carries class_session as ClassSession | null",
  sourceOf("src/lib/supabase/database.types.ts").includes("class_session: ClassSession | null;"),
);
check(
  "Serology and Blood Report are untouched by this migration",
  !/serology|blood/i.test(ddl),
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
