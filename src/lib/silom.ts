import { readXlsx, readCsv, type Grid, type Cell } from "@/lib/xlsx";

/**
 * Understands the two Silom POS reports we import:
 *
 *   "Sales by Date"    -> one row per day: revenue, cost, profit, bill count
 *   "Sales by Product" -> one row per product over a date range
 *
 * Both share the same preamble: a title, a "Shop" line naming the branch,
 * From/To dates, then a header row followed by the data.
 */

export type DailyRow = {
  date: string; // YYYY-MM-DD
  grossSales: number | null;
  discount: number | null;
  revenue: number;
  cost: number | null;
  profit: number | null;
  billCount: number | null;
  /** How the day's revenue came in. Null when the report doesn't break it out. */
  cash: number | null;
  card: number | null;
  promptpay: number | null;
  delivery: number | null;
};

export type ProductRow = {
  pluCode: string | null;
  name: string;
  category: string | null;
  units: number;
  /** Silom's "Total": the ticket price before any discount. */
  grossRevenue: number;
  /** Item discount + bill discount. */
  discount: number;
  /** What was actually taken: gross less discounts. This is the useful one. */
  revenue: number;
  cost: number | null;
  profit: number | null;
};

export type ParsedFile =
  | {
      kind: "daily";
      shopName: string | null;
      periodStart: string | null;
      periodEnd: string | null;
      rows: DailyRow[];
    }
  | {
      kind: "product";
      shopName: string | null;
      periodStart: string | null;
      periodEnd: string | null;
      rows: ProductRow[];
    };

export class ParseError extends Error {}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const str = (c: Cell) => (c == null ? "" : String(c).trim());

function num(c: Cell): number | null {
  if (c == null || c === "") return null;
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  // Strip thousands separators and any stray currency symbols.
  const n = Number(String(c).replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Silom writes dates two ways: "01/08/2026" in the data (day first, as is
 * standard in Thailand) and "01 August 2026" in the header. Handle both, and
 * Excel serial numbers, which appear when a cell is date-formatted.
 */
export function parseDate(c: Cell): string | null {
  if (c == null || c === "") return null;

  if (typeof c === "number") {
    // Excel serial date: days since 1899-12-30.
    const ms = Math.round((c - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  const s = String(c).trim();

  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const words = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
  if (words) {
    const m = MONTHS[words[2].toLowerCase()];
    if (m) return `${words[3]}-${String(m).padStart(2, "0")}-${words[1].padStart(2, "0")}`;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return iso[0];

  return null;
}

/** Find a header column by name, tolerating case and spacing differences. */
function colIndex(header: Cell[], ...names: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[\s()._-]/g, "");
  const wanted = names.map(norm);
  for (let i = 0; i < header.length; i++) {
    if (wanted.includes(norm(str(header[i])))) return i;
  }
  return -1;
}

/** Read a labelled preamble value, e.g. Shop / From / To. */
function preambleValue(grid: Grid, label: string): string | null {
  for (let r = 0; r < Math.min(grid.length, 12); r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < Math.min(row.length, 4); c++) {
      if (str(row[c]).toLowerCase() === label.toLowerCase()) {
        const v = str(row[c + 1]);
        if (v) return v;
      }
    }
  }
  return null;
}

/** The header row is the first one containing recognisable column names. */
function findHeaderRow(grid: Grid): number {
  const norm = (s: string) => s.toLowerCase().replace(/[\s()._-]/g, "");
  // Names that only ever appear in a Silom report's header row.
  const KEY = new Set(["date", "plucode", "plu", "name", "grandtotal", "subtotal"]);
  const SUPPORT = new Set([
    "no", "total", "cost", "profit", "quantity", "qty", "category",
    "discount", "bill", "activebill", "cancelbill", "price", "onhand",
    "itemdiscount", "billdiscount", "vattype", "firstreceipt", "lastreceipt",
  ]);

  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const cells = (grid[r] ?? []).map((c) => norm(str(c))).filter(Boolean);
    if (cells.length < 3) continue;
    const hasKey = cells.some((c) => KEY.has(c));
    const support = cells.filter((c) => SUPPORT.has(c)).length;
    if (hasKey && support >= 2) return r;
  }
  return -1;
}

/**
 * Silom sometimes returns a one-line sheet instead of a report — most often
 * "the selected period is longer than 90 days". Recognise those so the user
 * gets told what to do rather than a generic parse failure.
 */
function silomNotice(grid: Grid): string | null {
  const text = grid
    .slice(0, 6)
    .flat()
    .map((c) => str(c))
    .filter(Boolean)
    .join(" ");
  if (!text) return null;

  // Only treat it as a notice if the sheet has essentially no data in it.
  const cellCount = grid.flat().filter((c) => str(c) !== "").length;
  if (cellCount > 6) return null;

  if (/เกิน\s*90\s*วัน/.test(text) || /90\s*days?/i.test(text)) {
    return "Silom didn't export any data — the date range you picked is longer than 90 days. Go back in Silom, choose a range of 90 days or less (one month at a time works well), and export again.";
  }
  return `Silom returned a message instead of a report: “${text}”. Adjust the report settings in Silom and export again.`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseSilomFile(fileName: string, buf: Buffer): ParsedFile {
  const lower = fileName.toLowerCase();

  let grid: Grid;
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    grid = readCsv(buf.toString("utf8"));
  } else if (lower.endsWith(".xlsx")) {
    grid = readXlsx(buf);
  } else if (lower.endsWith(".xls")) {
    throw new ParseError(
      "That's an old .xls file. In Silom, export as .xlsx or .csv instead."
    );
  } else {
    throw new ParseError("Please upload a .xlsx or .csv file exported from Silom.");
  }

  if (grid.length === 0) throw new ParseError("That file appears to be empty.");

  const shopName = preambleValue(grid, "Shop");
  const periodStart = parseDate(preambleValue(grid, "From"));
  const periodEnd = parseDate(preambleValue(grid, "To"));

  const headerRow = findHeaderRow(grid);
  if (headerRow < 0) {
    const notice = silomNotice(grid);
    if (notice) throw new ParseError(notice);
    throw new ParseError(
      "Couldn't find the column headings. Make sure this is a Sales by Date or Sales by Product report, exported without editing."
    );
  }

  const header = grid[headerRow];
  const body = grid.slice(headerRow + 1);

  // Which report is this?
  const dateCol = colIndex(header, "Date");
  const pluCol = colIndex(header, "PLU Code", "PLU");
  const nameCol = colIndex(header, "Name");

  if (pluCol >= 0 || (nameCol >= 0 && dateCol < 0)) {
    return parseProduct(header, body, shopName, periodStart, periodEnd);
  }
  if (dateCol >= 0) {
    return parseDaily(header, body, shopName, periodStart, periodEnd);
  }

  throw new ParseError(
    "That doesn't look like a Sales by Date or Sales by Product report."
  );
}

// ---------------------------------------------------------------------------
// Sales by Date
// ---------------------------------------------------------------------------

function parseDaily(
  header: Cell[],
  body: Grid,
  shopName: string | null,
  periodStart: string | null,
  periodEnd: string | null
): ParsedFile {
  const iDate = colIndex(header, "Date");
  const iGross = colIndex(header, "Sub Total");
  const iDisc = colIndex(header, "Discount");
  // Grand Total is what actually came in; fall back to Total.
  const iRev = (() => {
    const g = colIndex(header, "Grand Total");
    return g >= 0 ? g : colIndex(header, "Total");
  })();
  const iCost = colIndex(header, "Cost");
  const iProfit = colIndex(header, "Profit");
  const iBills = (() => {
    const a = colIndex(header, "Active Bill");
    return a >= 0 ? a : colIndex(header, "Bill");
  })();
  const iCash = colIndex(header, "Cash");
  const iCard = colIndex(header, "Credit");
  const iPromptpay = colIndex(header, "PromptPay", "Prompt Pay");
  const iDelivery = colIndex(header, "Delivery");

  if (iRev < 0) {
    throw new ParseError(
      "Couldn't find a Total or Grand Total column in that Sales by Date report."
    );
  }

  const rows: DailyRow[] = [];
  for (const r of body) {
    if (!r || r.length === 0) continue;
    const date = parseDate(r[iDate]);
    if (!date) continue; // skips blank lines and any trailing totals row

    const revenue = num(r[iRev]);
    if (revenue == null) continue;

    rows.push({
      date,
      grossSales: iGross >= 0 ? num(r[iGross]) : null,
      discount: iDisc >= 0 ? num(r[iDisc]) : null,
      revenue,
      cost: iCost >= 0 ? num(r[iCost]) : null,
      profit: iProfit >= 0 ? num(r[iProfit]) : null,
      billCount: iBills >= 0 ? num(r[iBills]) : null,
      cash: iCash >= 0 ? num(r[iCash]) : null,
      card: iCard >= 0 ? num(r[iCard]) : null,
      promptpay: iPromptpay >= 0 ? num(r[iPromptpay]) : null,
      delivery: iDelivery >= 0 ? num(r[iDelivery]) : null,
    });
  }

  if (rows.length === 0) {
    throw new ParseError("No daily sales rows were found in that file.");
  }

  return { kind: "daily", shopName, periodStart, periodEnd, rows };
}

// ---------------------------------------------------------------------------
// Sales by Product
// ---------------------------------------------------------------------------

function parseProduct(
  header: Cell[],
  body: Grid,
  shopName: string | null,
  periodStart: string | null,
  periodEnd: string | null
): ParsedFile {
  const iPlu = colIndex(header, "PLU Code", "PLU");
  const iName = colIndex(header, "Name");
  const iCat = colIndex(header, "Category");
  const iQty = colIndex(header, "Quantity", "Qty");
  const iTotal = colIndex(header, "Total");
  const iCost = colIndex(header, "Cost");
  const iProfit = colIndex(header, "Profit");
  const iItemDisc = colIndex(header, "Item Discount");
  const iBillDisc = colIndex(header, "Bill Discount");

  if (iName < 0 || iTotal < 0) {
    throw new ParseError(
      "Couldn't find the Name and Total columns in that Sales by Product report."
    );
  }

  const rows: ProductRow[] = [];
  for (const r of body) {
    if (!r || r.length === 0) continue;
    const name = str(r[iName]);
    if (!name) continue;

    const grossRevenue = num(r[iTotal]);
    if (grossRevenue == null) continue;

    // Staff allowance and promo lines are rung at full price and then almost
    // entirely discounted, so ranking on Total alone puts them near the top
    // of a "best sellers" list while barely any money changed hands.
    const discount =
      ((iItemDisc >= 0 ? num(r[iItemDisc]) : null) ?? 0) +
      ((iBillDisc >= 0 ? num(r[iBillDisc]) : null) ?? 0);

    rows.push({
      pluCode: iPlu >= 0 ? str(r[iPlu]) || null : null,
      name,
      category: iCat >= 0 ? str(r[iCat]) || null : null,
      units: (iQty >= 0 ? num(r[iQty]) : null) ?? 0,
      grossRevenue,
      discount,
      revenue: Math.max(0, grossRevenue - discount),
      cost: iCost >= 0 ? num(r[iCost]) : null,
      profit: iProfit >= 0 ? num(r[iProfit]) : null,
    });
  }

  if (rows.length === 0) {
    throw new ParseError("No product rows were found in that file.");
  }

  return { kind: "product", shopName, periodStart, periodEnd, rows };
}

/**
 * Guess the branch from the Shop name in the file, e.g.
 * "Holyweed Sathorn" -> the branch whose slug is "sathorn".
 * Returns null when it isn't obvious, so the user picks it themselves.
 */
export function guessBranchSlug(shopName: string | null): "sathorn" | "sukhumvit" | null {
  if (!shopName) return null;
  const s = shopName.toLowerCase();
  if (s.includes("sathorn") || s.includes("สาทร")) return "sathorn";
  if (s.includes("sukhumvit") || s.includes("สุขุมวิท") || /\b22\b/.test(s)) return "sukhumvit";
  return null;
}
