import { readXlsxAllSheets, readCsv, type Grid, type Cell } from "@/lib/xlsx";
import { ParseError } from "@/lib/silom";

/**
 * Reads the hand-kept expense spreadsheets (one workbook per branch, one
 * sheet per month).
 *
 * These are typed by people, not exported by a machine, so the shapes vary:
 *
 *   Date | daily operating expenses | Costs of goods | advance salary | total
 *   Date | daily operating expenses | total | costs of goods | total | advance salary | total
 *   Date | Costs of Goods | Running Costs | Advance Salary | Total
 *
 * The rule used here: a "total" column always belongs to the labelled column
 * immediately to its left. Where there is only one total at the end and no
 * per-category totals, that total is the day's whole spend and is filed as
 * uncategorised.
 */

export type ExpenseCategory = "operating" | "cogs" | "salary" | "other";

export type ExpenseRow = {
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  sheet: string;
};

export type ExpenseWarning = { sheet: string; row: number; message: string };

export type ParsedExpenses = {
  kind: "expenses";
  rows: ExpenseRow[];
  warnings: ExpenseWarning[];
  months: string[]; // YYYY-MM covered
};

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  operating: "Operating",
  cogs: "Cost of goods",
  salary: "Salary advances",
  other: "Uncategorised",
};

export function categoryLabel(c: string) {
  return CATEGORY_LABEL[c as ExpenseCategory] ?? c;
}

const str = (c: Cell) => (c == null ? "" : String(c).trim());

function num(c: Cell): number | null {
  if (c == null || c === "") return null;
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const t = String(c).trim();
  if (t === "-" || t === "—") return null;
  const n = Number(t.replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Classify a column heading into one of our buckets. */
function categoryOf(heading: string): ExpenseCategory | null {
  const h = heading.toLowerCase();
  if (!h) return null;
  if (h.includes("salary") || h.includes("advance")) return "salary";
  if (h.includes("cost") && h.includes("good")) return "cogs";
  if (h.includes("cogs")) return "cogs";
  if (h.includes("operating") || h.includes("running") || h.includes("expens")) return "operating";
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "August 2026" / "JUNE 2026" / "Jun 2026" -> { year, month } */
function monthFromSheetName(name: string): { year: number; month: number } | null {
  const m = /([A-Za-z]+)\s*(\d{4})/.exec(name);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  return { year: Number(m[2]), month: mon };
}

type DateResult = { date: string; swapped: boolean } | null;

/**
 * Read a date cell, using the sheet's month as the source of truth.
 *
 * Google Sheets sometimes reads "1/8/2026" as 8 January instead of 1 August.
 * When a date lands in the wrong month but its day number matches the sheet's
 * month, that is what happened — swapping day and month recovers the real date
 * rather than silently filing August spending under January.
 */
function readDate(c: Cell, expect: { year: number; month: number } | null): DateResult {
  if (c == null || c === "") return null;

  let y: number, mo: number, d: number;

  if (c instanceof Date) {
    y = c.getUTCFullYear();
    mo = c.getUTCMonth() + 1;
    d = c.getUTCDate();
  } else if (typeof c === "number") {
    const dt = new Date(Math.round((c - 25569) * 86400 * 1000));
    if (isNaN(dt.getTime())) return null;
    y = dt.getUTCFullYear();
    mo = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
  } else {
    const s = String(c).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) {
      y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
    } else {
      m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s);
      if (!m) return null;
      // Day-first, as written in Thailand. A two-digit year means 20xx.
      d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
      if (y < 100) y += 2000;
    }
  }

  let swapped = false;
  if (expect && mo !== expect.month && d === expect.month && mo <= 12) {
    // Day and month are the wrong way round: put them back.
    [d, mo] = [mo, d];
    swapped = true;
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { date: iso, swapped };
}

/** Header row = the first row with a date-ish first cell heading or a known category. */
function findHeader(grid: Grid): number {
  for (let r = 0; r < Math.min(grid.length, 8); r++) {
    const cells = (grid[r] ?? []).map((c) => str(c).toLowerCase());
    if (cells.some((c) => categoryOf(c))) return r;
    if (cells[0] === "date") return r;
  }
  return -1;
}

/**
 * Work out which column holds the amount for each category column.
 * A "total" heading to the right of a category belongs to that category.
 */
function mapColumns(header: Cell[]) {
  const cats: { category: ExpenseCategory; descCol: number; amountCol: number }[] = [];
  const unnamed: { heading: string; descCol: number; amountCol: number }[] = [];
  let trailingTotal = -1;

  for (let i = 0; i < header.length; i++) {
    const heading = str(header[i]);
    if (!heading || heading.toLowerCase() === "total") continue;

    const cat = categoryOf(heading);
    const nextIsTotal = str(header[i + 1]).toLowerCase() === "total";

    if (cat) {
      cats.push({ category: cat, descCol: i, amountCol: nextIsTotal ? i + 1 : -1 });
    } else if (nextIsTotal && i > 0) {
      // The heading has been typed over, but a total column sits beside it,
      // so there is real money here. Keep it rather than dropping it.
      unnamed.push({ heading, descCol: i, amountCol: i + 1 });
    }
  }

  for (let i = header.length - 1; i >= 0; i--) {
    if (str(header[i]).toLowerCase() === "total") {
      const claimed = cats.some((c) => c.amountCol === i);
      if (!claimed) trailingTotal = i;
      break;
    }
  }

  return { cats, unnamed, trailingTotal };
}

function parseSheet(sheetName: string, grid: Grid): { rows: ExpenseRow[]; warnings: ExpenseWarning[] } {
  const rows: ExpenseRow[] = [];
  const warnings: ExpenseWarning[] = [];
  const expect = monthFromSheetName(sheetName);

  const headerRow = findHeader(grid);
  if (headerRow < 0) {
    warnings.push({
      sheet: sheetName,
      row: 1,
      message: "Couldn't find column headings on this sheet, so it was skipped.",
    });
    return { rows, warnings };
  }

  const header = grid[headerRow];
  const { cats, unnamed, trailingTotal } = mapColumns(header);

  for (const u of unnamed) {
    warnings.push({
      sheet: sheetName,
      row: headerRow + 1,
      message: `Column heading "${u.heading}" isn't a category name, so its amounts were imported as uncategorised. Rename it in the spreadsheet (e.g. "daily operating expenses") and re-import to file it correctly.`,
    });
  }

  const allCols = [
    ...cats,
    ...unnamed.map((u) => ({ category: "other" as ExpenseCategory, descCol: u.descCol, amountCol: u.amountCol })),
  ];

  if (cats.length === 0 && unnamed.length === 0 && trailingTotal < 0) {
    warnings.push({
      sheet: sheetName,
      row: headerRow + 1,
      message:
        "The headings on this sheet don't name any expense categories, so it was skipped. Check the top row hasn't been typed over.",
    });
    return { rows, warnings };
  }

  if (allCols.length === 0) {
    warnings.push({
      sheet: sheetName,
      row: headerRow + 1,
      message: "No category headings found — the daily totals were imported as uncategorised.",
    });
  }

  let swappedCount = 0;

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (row.every((c) => c == null || str(c) === "")) continue;

    const dateCell = readDate(row[0], expect);
    if (!dateCell) {
      if (str(row[0])) {
        warnings.push({
          sheet: sheetName,
          row: r + 1,
          message: `Couldn't read "${str(row[0])}" as a date — that row was skipped.`,
        });
      }
      continue;
    }
    if (dateCell.swapped) swappedCount++;

    let addedForRow = false;

    for (const c of allCols) {
      const desc = str(row[c.descCol]) || null;
      let amount: number | null = null;

      if (c.amountCol >= 0) {
        amount = num(row[c.amountCol]);
      } else if (allCols.length === 1 && trailingTotal >= 0) {
        amount = num(row[trailingTotal]);
      } else if (desc) {
        // No total column for this category: add up the numbers written in
        // the description, e.g. "trash bill(300), hostel(200)" -> 500.
        const nums = [...desc.matchAll(/\(([\d,]+(?:\.\d+)?)\)/g)].map((m) =>
          Number(m[1].replace(/,/g, ""))
        );
        if (nums.length) amount = nums.reduce((s, n) => s + n, 0);
      }

      if (amount != null && amount !== 0) {
        rows.push({
          date: dateCell.date,
          category: c.category,
          amount,
          description: desc,
          sheet: sheetName,
        });
        addedForRow = true;
      }
    }

    // Nothing categorised, but there is a day total: keep it as uncategorised
    // so the month still adds up.
    if (!addedForRow && trailingTotal >= 0) {
      const total = num(row[trailingTotal]);
      if (total != null && total !== 0) {
        rows.push({
          date: dateCell.date,
          category: "other",
          amount: total,
          description: null,
          sheet: sheetName,
        });
      }
    }
  }

  if (swappedCount > 0) {
    warnings.push({
      sheet: sheetName,
      row: headerRow + 1,
      message: `${swappedCount} date${swappedCount === 1 ? "" : "s"} on this sheet had the day and month the wrong way round (a spreadsheet date-format problem). They were corrected to match the sheet's month — worth fixing in the original file too.`,
    });
  }

  return { rows, warnings };
}

export function parseExpenseFile(fileName: string, buf: Buffer): ParsedExpenses {
  const lower = fileName.toLowerCase();

  let sheets: { name: string; grid: Grid }[];
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    sheets = [{ name: "Sheet1", grid: readCsv(buf.toString("utf8")) }];
  } else if (lower.endsWith(".xlsx")) {
    sheets = readXlsxAllSheets(buf);
  } else {
    throw new ParseError("Please upload a .xlsx or .csv expense sheet.");
  }

  const rows: ExpenseRow[] = [];
  const warnings: ExpenseWarning[] = [];

  for (const s of sheets) {
    const res = parseSheet(s.name, s.grid);
    rows.push(...res.rows);
    warnings.push(...res.warnings);
  }

  if (rows.length === 0) {
    throw new ParseError(
      "No expense rows could be read from that file. Check it has a Date column and at least one category column."
    );
  }

  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
  return { kind: "expenses", rows, warnings, months };
}
