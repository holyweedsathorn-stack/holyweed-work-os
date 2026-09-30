/**
 * Parses a Krung Thai Bank "Account Statement" PDF into individual
 * transactions, for the bank ↔ POS reconciliation page
 * (src/app/(app)/reconciliation).
 *
 * This is tailored to the exact table layout Krungthai's statement export
 * uses (see the direction-keyword list below) -- a different bank's PDF
 * will very likely need its own keyword list, or fail to parse at all and
 * surface as a clear error rather than silently misreading amounts.
 *
 * Approach: pull text out of the PDF page-by-page via pdfjs-dist, grouping
 * text items into lines by their Y position (PDF text extraction has no
 * concept of "rows" on its own). Each transaction is one line of the form
 * `<date> <type + description> <amount> <balance> <branch code>`, optionally
 * followed by a continuation line that always starts with the transaction's
 * time. Anything else repeats on every page (the account header, the
 * column titles, the footer) and is discarded.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export class StatementParseError extends Error {
  constructor(
    message: string,
    public reason: "password_required" | "wrong_password" | "unreadable" | "no_transactions"
  ) {
    super(message);
    this.name = "StatementParseError";
  }
}

export type ParsedTransaction = {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  direction: "in" | "out";
  amount: number;
  balanceAfter: number | null;
  description: string;
};

export type ParsedStatement = {
  accountName: string | null;
  accountNumber: string | null;
  bankName: string;
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;
  transactions: ParsedTransaction[];
  // Lines that had a real transaction row (date, amount, balance) but whose
  // leading type text didn't match IN_RE/OUT_RE -- previously dropped with
  // no trace at all, which is exactly the kind of thing that looks like
  // "missing money" later: the statement's own balance moves, but the
  // transaction that moved it was never imported. Surfaced in the upload
  // preview instead so it's a visible "N rows need a new keyword added",
  // not a silent gap.
  skipped: { count: number; samples: string[] };
  // Rows within THIS statement that share the exact same date, time,
  // amount and description as another row already parsed. The database's
  // own duplicate check (used so re-uploading the same statement doesn't
  // create double entries) keys on those same four fields -- so if two
  // genuinely different transactions happen to match on all four (most
  // often because neither had a continuation line, so time is null for
  // both), only one of them will ever be saved and the other is silently
  // swallowed at import, same failure mode as a skipped row but on rows
  // that DID get read correctly. Flagged here so it's visible before
  // that happens, not discovered later as another balance gap.
  possibleDuplicates: { count: number; samples: string[] };
};

function toIsoDate(ddmmyy: string): string {
  // Krungthai statements print DD/MM/YY (Buddhist-looking but actually a
  // plain 2-digit Gregorian year in this export -- 26 = 2026).
  const [dd, mm, yy] = ddmmyy.split("/");
  return `20${yy}-${mm}-${dd}`;
}

async function extractLines(data: Uint8Array, password?: string): Promise<string[]> {
  let doc;
  try {
    doc = await getDocument({ data, password: password || undefined }).promise;
  } catch (err: any) {
    if (err?.name === "PasswordException") {
      // code 1 = need a password at all, 2 = the one given was wrong.
      if (err.code === 1) {
        throw new StatementParseError("This PDF is password-protected.", "password_required");
      }
      throw new StatementParseError("That password didn't open the PDF.", "wrong_password");
    }
    throw new StatementParseError(
      `Couldn't read that PDF: ${err?.message ?? err}`,
      "unreadable"
    );
  }

  const allLines: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const rows = new Map<number, { str: string; x: number }[]>();
    for (const item of content.items as any[]) {
      if (typeof item.str !== "string") continue;
      const y = Math.round(item.transform[5]);
      const arr = rows.get(y) ?? [];
      arr.push({ str: item.str, x: item.transform[4] });
      rows.set(y, arr);
    }
    const sortedYs = [...rows.keys()].sort((a, b) => b - a); // top → bottom
    for (const y of sortedYs) {
      const items = rows.get(y)!.sort((a, b) => a.x - b.x);
      const line = items
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) allLines.push(line);
    }
  }
  return allLines;
}

const DATE_RE = /^(\d{2}\/\d{2}\/\d{2})\s+(.*)$/;
// A continuation line always opens with the transaction's own time, either
// alone ("02:16") or with extra reference text ("02:21 Amount: 450 ~ Tran:
// IORISD"). Anything reaching here NOT starting with a time is page
// header/footer text repeating on every page -- discard it.
const CONT_RE = /^(\d{2}:\d{2})\b(.*)$/;
// Trailing "<amount> <balance> <branch code>" at the end of the line. Only
// one of Withdrawal/Deposit is ever filled in per row, so there are always
// exactly two money figures here, not three.
const TRAILING_RE = /^(.*?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(\d+)$/;

const IN_RE = /^(Transfer in|Inward|Deposit|Interest)\b/i;
const OUT_RE = /^(Transfer out|Outward|Direct Debit|Withdrawal)\b/i;

function directionOf(typeDesc: string): "in" | "out" | null {
  if (OUT_RE.test(typeDesc)) return "out";
  if (IN_RE.test(typeDesc)) return "in";
  return null;
}

function extractField(lines: string[], label: RegExp): string | null {
  for (const l of lines) {
    const m = l.match(label);
    if (m) return m[1].trim();
  }
  return null;
}

export async function parseBankStatementPdf(
  buf: Buffer,
  password?: string
): Promise<ParsedStatement> {
  const lines = await extractLines(new Uint8Array(buf), password);

  const periodRaw = extractField(lines, /^Statement Period\s+(\d{2}\/\d{2}\/\d{2}\s+to\s+\d{2}\/\d{2}\/\d{2})/);
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (periodRaw) {
    const [a, , b] = periodRaw.split(/\s+/);
    periodStart = toIsoDate(a);
    periodEnd = toIsoDate(b);
  }
  const accountName = extractField(lines, /^Account Name\s+(.+?)\s+Account Type/);
  const accountNumber = extractField(lines, /^Account Number\s+(\S+)/);

  const transactions: ParsedTransaction[] = [];
  const skipped = { count: 0, samples: [] as string[] };
  let current: { date: string; time: string | null; typeDesc: string; amount: number; balance: number } | null =
    null;

  const push = () => {
    if (!current) return;
    const dir = directionOf(current.typeDesc);
    if (dir) {
      transactions.push({
        date: current.date,
        time: current.time,
        direction: dir,
        amount: current.amount,
        balanceAfter: current.balance,
        description: current.typeDesc,
      });
      return;
    }
    // A real transaction row (it had a date, an amount and a balance) whose
    // type text didn't match IN_RE/OUT_RE -- a transaction type this
    // statement hasn't shown before. Tracked instead of silently dropped;
    // see the ParsedStatement.skipped doc comment.
    skipped.count++;
    if (skipped.samples.length < 5 && !skipped.samples.includes(current.typeDesc)) {
      skipped.samples.push(current.typeDesc);
    }
  };

  for (const raw of lines) {
    const dm = raw.match(DATE_RE);
    if (dm) {
      push();
      current = null;
      const [, dateRaw, rest] = dm;
      const tm = rest.match(TRAILING_RE);
      if (!tm) continue; // a header/title line that happens to start with a date-like token
      const [, typeDesc, amountStr, balanceStr] = tm;
      current = {
        date: toIsoDate(dateRaw),
        time: null,
        typeDesc: typeDesc.trim(),
        amount: Number(amountStr.replace(/,/g, "")),
        balance: Number(balanceStr.replace(/,/g, "")),
      };
      continue;
    }
    if (!current) continue;
    const cm = raw.match(CONT_RE);
    if (cm) {
      if (!current.time) current.time = cm[1];
      const extra = cm[2].trim();
      if (extra) current.typeDesc += " " + extra;
    }
    // else: repeated page header/footer text -- ignore.
  }
  push();

  const dupKeyCounts = new Map<string, number>();
  for (const t of transactions) {
    const key = `${t.date}|${t.time ?? ""}|${t.amount}|${t.description}`;
    dupKeyCounts.set(key, (dupKeyCounts.get(key) ?? 0) + 1);
  }
  const possibleDuplicates = { count: 0, samples: [] as string[] };
  for (const [key, n] of dupKeyCounts) {
    if (n <= 1) continue;
    possibleDuplicates.count += n - 1;
    if (possibleDuplicates.samples.length < 5) {
      possibleDuplicates.samples.push(key.split("|").slice(2).join(" -- "));
    }
  }

  if (transactions.length === 0) {
    throw new StatementParseError(
      "Couldn't find any transactions in that PDF -- it may not be a Krungthai account statement, or the layout has changed.",
      "no_transactions"
    );
  }

  return {
    accountName,
    accountNumber,
    bankName: "Krung Thai Bank",
    periodStart,
    periodEnd,
    transactions,
    skipped,
    possibleDuplicates,
  };
}

/**
 * Sentinel used in place of a real branch id when tagging a pattern group:
 * "this deposit is POS income, but the account is shared between branches
 * and nothing in the bank data itself says which one" (Krungthai's own
 * transaction rows carry a sender's bank reference, not a till or location).
 * A transaction tagged this way keeps branch_id = null, and the
 * reconciliation page compares it against every branch's PromptPay sales
 * combined for that day, instead of one branch's alone.
 */
export const SHARED_ACCOUNT = "shared";

/**
 * Known senders under an "Inward"-type transfer who are never a customer
 * or guest payment -- add a name here and it's auto-tagged "other" at
 * import, the same way Airbnb/Booking.com payouts are, instead of landing
 * in "Needs tagging" mixed in with actual guest/customer wires under the
 * same transaction-type code (see typeKeyOf below for why that mix is a
 * problem even when tagged by hand).
 *
 * - Andrew Tjoe: the owner, settling up in one lump sum for stock he took
 *   -- not sales income.
 */
const KNOWN_NON_SALE_SENDERS = [/Andrew\s*Tjoe/i];

/** Auto-tag the obvious cases; everything else starts life "uncategorized". */
export function autoCategory(t: ParsedTransaction): "uncategorized" | "ota_payout" | "other" {
  if (t.direction === "out") return "other";
  if (/Airbnb Payments|BOOKING\.COM|Agoda|Expedia/i.test(t.description)) return "ota_payout";
  if (/^Interest/i.test(t.description)) return "other";
  if (KNOWN_NON_SALE_SENDERS.some((re) => re.test(t.description))) return "other";
  return "uncategorized";
}

// e.g. "Transfer in-PromptPay (MORISD) TR fr 004-0761494562" -> "Transfer
// in-PromptPay (MORISD)". Individual transactions carry a unique sender
// reference, but there are only a handful of these transaction-type
// prefixes on any one statement -- grouping by this key is what lets the
// reconciliation page offer "tag all 143 of these as Sathorn" instead of
// making someone categorize a thousand rows one at a time.
const TYPE_KEY_RE = /^([A-Za-z][A-Za-z\- ]*\([A-Z0-9]+\))/;

// "Inward (XBSDT) Transfer From Andrew Tjoe" -- unlike PromptPay or OTA
// rows, where every transaction under one type+code is the same payment
// channel and genuinely fine to bulk-tag together, a plain "Inward ...
// Transfer From X" row can be a completely different PERSON each time for
// a completely different reason: a guest paying for their stay, the owner
// settling up for stock he took, a one-off personal transfer. Grouping
// all of those under "Inward (XBSDT)" would make one bulk-tag click apply
// the same category to unrelated people's money. Keying on the sender's
// name too keeps each person as their own pattern to tag separately.
const NAMED_TRANSFER_RE = /^([A-Za-z][A-Za-z\- ]*\([A-Z0-9]+\))\s+(Transfer From\s+.+)$/i;
// Some rows repeat the name twice back to back ("Andrew tjoe Andrew
// tjoe") and/or append a reference after it ("~ Future Amount: ...",
// "TR fr ..."); both would otherwise make the same person key
// differently statement to statement.
const TRAILING_REF_RE = /\s*(~|TR fr\b).*$/i;

function cleanSenderSuffix(raw: string): string {
  const noRef = raw.replace(TRAILING_REF_RE, "").trim();
  const words = noRef.split(/\s+/);
  if (words.length % 2 === 0) {
    const half = words.length / 2;
    const firstHalf = words.slice(0, half).join(" ").toLowerCase();
    const secondHalf = words.slice(half).join(" ").toLowerCase();
    if (firstHalf === secondHalf) return words.slice(0, half).join(" ").replace(/^transfer from\s+/i, "Transfer From ");
  }
  return noRef;
}

function titleCase(s: string): string {
  return s.replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export function typeKeyOf(description: string): string {
  const named = description.match(NAMED_TRANSFER_RE);
  if (named) {
    const [, typePart, suffixPart] = named;
    return `${typePart} ${titleCase(cleanSenderSuffix(suffixPart))}`;
  }
  const m = description.match(TYPE_KEY_RE);
  return m ? m[1] : description;
}
