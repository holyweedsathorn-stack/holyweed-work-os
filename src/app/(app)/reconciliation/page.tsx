import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { ReconciliationBoard } from "@/components/ReconciliationBoard";
import { typeKeyOf, SHARED_ACCOUNT } from "@/lib/bank-statement";
import type { Branch } from "@/lib/types";

export const dynamic = "force-dynamic";

type BankTxnRow = {
  id: string;
  txn_date: string;
  txn_time: string | null;
  amount: number;
  direction: "in" | "out";
  balance_after: number | null;
  description: string;
  category: string;
  branch_id: string | null;
  created_at: string;
  line_seq: number | null;
};

// Silom's own daily report closed at 2am (not midnight) up through 13 Sep --
// a "business day" ran past midnight into the small hours, so a customer
// paying at, say, 01:30 was booked by Silom as part of the PREVIOUS
// calendar day's sales. The bank has no notion of a "business day" though:
// it timestamps that same PromptPay deposit with the actual calendar date
// it landed on. Comparing the two directly for that period, day by day,
// made a single late-night rush look like two separate mismatches -- a
// shortfall the night before, a surplus the morning after. Shifting any
// bank deposit between 00:00-01:59 back a day (only for dates before the
// cutover) re-aligns the two sides with how Silom actually grouped the sale.
const REPORT_CUTOFF_CHANGED_ON = "2026-09-14";
const OLD_CUTOFF_HOUR = 2;

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function comparisonDateFor(t: BankTxnRow): string {
  if (t.txn_date >= REPORT_CUTOFF_CHANGED_ON || !t.txn_time) return t.txn_date;
  const hour = Number(t.txn_time.slice(0, 2));
  return hour < OLD_CUTOFF_HOUR ? shiftDate(t.txn_date, -1) : t.txn_date;
}

export default async function ReconciliationPage() {
  const supabase = await createClient();

  const [{ data: branches }, { data: accounts }, { data: allTxns }] = await Promise.all([
    supabase.from("branches").select("*").order("name").returns<Branch[]>(),
    supabase.from("bank_accounts").select("id, label").order("created_at"),
    supabase
      .from("bank_transactions")
      .select("id, txn_date, txn_time, amount, direction, balance_after, description, category, branch_id, created_at, line_seq")
      .order("txn_date")
      .order("txn_time")
      // line_seq (not created_at) breaks ties between transactions that
      // share the same printed minute -- Krungthai's statement has no
      // seconds, and a whole statement import writes every row in one
      // batch, so created_at is identical across an entire upload and
      // can't tell same-minute rows apart. line_seq instead preserves the
      // exact order the PDF itself prints them in, which is always true
      // chronological order -- see 0042_bank_transactions_line_seq.sql.
      // Rows imported before that migration have line_seq = null and
      // fall back to whatever order Postgres returns them in.
      .order("line_seq", { ascending: true, nullsFirst: false })
      .returns<BankTxnRow[]>(),
  ]);

  const txns = allTxns ?? [];

  // Group the still-unreviewed inbound transactions by their transaction
  // type (e.g. "Transfer in-PromptPay (MORISD)") so a statement's ~1,000
  // rows show up as a handful of patterns to tag, not a wall of checkboxes.
  const uncategorizedGroups = new Map<string, { count: number; total: number }>();
  for (const t of txns) {
    if (t.category !== "uncategorized") continue;
    const key = typeKeyOf(t.description);
    const g = uncategorizedGroups.get(key) ?? { count: 0, total: 0 };
    g.count++;
    g.total += t.amount;
    uncategorizedGroups.set(key, g);
  }
  const patterns = [...uncategorizedGroups.entries()]
    .map(([typeKey, g]) => ({ typeKey, ...g }))
    .sort((a, b) => b.total - a.total);

  // Bank side of the comparison: deposits already tagged as POS income,
  // summed per day. A transaction tagged as a specific branch keys on that
  // branch's id; one tagged "shared" (branch_id null -- the account serves
  // more than one branch and nothing in the bank data says which) keys on
  // the SHARED_ACCOUNT bucket instead.
  const bankByDayBranch = new Map<string, number>();
  const posTxns = txns.filter((t) => t.category === "pos_sale");
  for (const t of posTxns) {
    const key = `${comparisonDateFor(t)}|${t.branch_id ?? SHARED_ACCOUNT}`;
    bankByDayBranch.set(key, (bankByDayBranch.get(key) ?? 0) + t.amount);
  }

  // POS side: sales_daily.promptpay for whatever date range the statement
  // actually covers -- comparing against total revenue would be wrong,
  // since cash and card sales never touch this bank account.
  const dates = txns.map((t) => t.txn_date);
  const minDate = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  const maxDate = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;

  let salesRows: { branch_id: string; sale_date: string; promptpay: number | null }[] = [];
  if (minDate && maxDate) {
    const { data } = await supabase
      .from("sales_daily")
      .select("branch_id, sale_date, promptpay")
      .gte("sale_date", minDate)
      .lte("sale_date", maxDate);
    salesRows = data ?? [];
  }
  // Per-branch POS totals, plus a combined-across-every-branch total per day
  // for comparing against "shared" bank deposits. posSalesByDayCombined is
  // looked up lazily below (only for a date that actually has a "shared"
  // bank entry) -- it is NOT unioned into allKeys itself. Every date with
  // any sales_daily.promptpay row would otherwise get a synthetic "All
  // branches" row even when nothing was ever tagged as shared, duplicating
  // the per-branch rows next to it with no new information.
  const posSalesByDayBranch = new Map<string, number>();
  const posSalesByDayCombined = new Map<string, number>();
  for (const r of salesRows) {
    if (r.promptpay == null) continue;
    posSalesByDayBranch.set(`${r.sale_date}|${r.branch_id}`, r.promptpay);
    posSalesByDayCombined.set(r.sale_date, (posSalesByDayCombined.get(r.sale_date) ?? 0) + r.promptpay);
  }

  // Holy Bistro prints the exact same PromptPay QR as the Sathorn
  // dispensary, so its PromptPay income lands in this same bank account
  // with nothing on the bank side saying which business it was for --
  // invisible to this comparison unless it's folded in here. Bistro has
  // no branch of its own in this schema (see the reconciliation thread
  // from Sept 2026), so it only ever adds to the combined/shared bucket,
  // never a per-branch row.
  let bistroSalesRows: { sale_date: string; promptpay: number }[] = [];
  if (minDate && maxDate) {
    const { data } = await supabase
      .from("bistro_sales_daily")
      .select("sale_date, promptpay")
      .gte("sale_date", minDate)
      .lte("sale_date", maxDate);
    bistroSalesRows = data ?? [];
  }
  for (const r of bistroSalesRows) {
    posSalesByDayCombined.set(r.sale_date, (posSalesByDayCombined.get(r.sale_date) ?? 0) + Number(r.promptpay));
  }

  // Earliest date sales_daily actually has PromptPay data for. Before this
  // date the bank side gets tagged (people were still paying by PromptPay in
  // June) but the POS side has nothing at all -- every one of those days
  // would show as a 100% "unexplained" bank deposit, which isn't a real
  // mismatch, just a gap in what's been imported. Comparison rows only
  // start once both sides can actually be compared.
  const posDatesWithData = new Set<string>([
    ...salesRows.filter((r) => r.promptpay != null).map((r) => r.sale_date),
    ...bistroSalesRows.map((r) => r.sale_date),
  ]);
  const earliestPosDate = posDatesWithData.size
    ? [...posDatesWithData].reduce((a, b) => (a < b ? a : b))
    : null;

  // Only the shared-account bucket is ever shown: a specific-branch row
  // would always read Bank = ฿0, since nothing can be tagged to an
  // individual branch on this account (Sathorn and Sukhumvit print the
  // identical PromptPay QR -- see the reconciliation thread from Sept
  // 2026). A row like that isn't a real mismatch, just permanent noise,
  // so per-branch tagging stays available above for if that ever changes,
  // but this table only ever pulls from the shared bucket.
  const allKeys = new Set<string>(
    [...bankByDayBranch.keys()].filter((key) => {
      const [date, branchId] = key.split("|");
      if (branchId !== SHARED_ACCOUNT) return false;
      return !earliestPosDate || date >= earliestPosDate;
    })
  );
  const branchById = new Map((branches ?? []).map((b) => [b.id, b]));

  // Hostel guests who wire their payment directly to the bank (tagged
  // "hostel_transfer", not "pos_sale") never show up in Silom, so they get
  // their own comparison against hostel_stays.amount_thb instead of
  // PromptPay sales. Matched by calendar date of check-in, not the shared
  // account's SHARED_ACCOUNT bucketing -- unlike the PromptPay QR, a wire's
  // branch tag is meaningful (the hostel is a distinct branch), so every
  // tagged branch is shown here, not just "shared".
  const hostelBankByDayBranch = new Map<string, number>();
  const hostelTxns = txns.filter((t) => t.category === "hostel_transfer");
  for (const t of hostelTxns) {
    const key = `${t.txn_date}|${t.branch_id ?? SHARED_ACCOUNT}`;
    hostelBankByDayBranch.set(key, (hostelBankByDayBranch.get(key) ?? 0) + t.amount);
  }

  let hostelStayRows: { branch_id: string; checked_in_at: string; amount_thb: number | null }[] = [];
  if (minDate && maxDate) {
    const { data } = await supabase
      .from("hostel_stays")
      .select("branch_id, checked_in_at, amount_thb")
      .eq("payment_method", "bank_transfer")
      .not("amount_thb", "is", null)
      // checked_in_at is a timestamp; widen the date filter by a day on
      // each side so a check-in just before/after local midnight (this
      // query runs in UTC) isn't dropped at the edge of the statement's
      // own date range.
      .gte("checked_in_at", shiftDate(minDate, -1))
      .lte("checked_in_at", shiftDate(maxDate, 1) + "T23:59:59");
    hostelStayRows = data ?? [];
  }
  const hostelStaysByDayBranch = new Map<string, number>();
  for (const r of hostelStayRows) {
    if (r.amount_thb == null) continue;
    const date = r.checked_in_at.slice(0, 10);
    const key = `${date}|${r.branch_id}`;
    hostelStaysByDayBranch.set(key, (hostelStaysByDayBranch.get(key) ?? 0) + r.amount_thb);
  }

  const hostelKeys = new Set<string>([...hostelBankByDayBranch.keys(), ...hostelStaysByDayBranch.keys()]);
  const hostelComparisonRows = [...hostelKeys]
    .map((key) => {
      const [date, branchId] = key.split("|");
      const isShared = branchId === SHARED_ACCOUNT;
      const bank = hostelBankByDayBranch.get(key) ?? 0;
      const recorded = isShared ? 0 : hostelStaysByDayBranch.get(key) ?? 0;
      return {
        date,
        branchId,
        branchName: isShared ? "All branches (shared account)" : branchById.get(branchId)?.name ?? "Unknown branch",
        branchSlug: isShared ? null : branchById.get(branchId)?.slug ?? null,
        bank,
        recorded,
        diff: bank - recorded,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // Tab customers (buy now, settle later by bank transfer) have no
  // PromptPay record and no hostel check-in to match against -- just a
  // running total per branch/month, not a day-by-day comparison.
  const branchTransferTotals = new Map<string, { branchName: string; branchSlug: string | null; total: number }>();
  for (const t of txns) {
    if (t.category !== "branch_transfer" || !t.branch_id) continue;
    const month = t.txn_date.slice(0, 7);
    const key = `${month}|${t.branch_id}`;
    const g = branchTransferTotals.get(key) ?? {
      branchName: branchById.get(t.branch_id)?.name ?? "Unknown branch",
      branchSlug: branchById.get(t.branch_id)?.slug ?? null,
      total: 0,
    };
    g.total += t.amount;
    branchTransferTotals.set(key, g);
  }
  const branchTransferRows = [...branchTransferTotals.entries()]
    .map(([key, g]) => ({ month: key.split("|")[0], ...g }))
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : b.total - a.total));

  const comparisonRows = [...allKeys]
    .map((key) => {
      const [date, branchId] = key.split("|");
      const bank = bankByDayBranch.get(key) ?? 0;
      const isShared = branchId === SHARED_ACCOUNT;
      const pos = isShared ? posSalesByDayCombined.get(date) ?? 0 : posSalesByDayBranch.get(key) ?? 0;
      return {
        date,
        branchId,
        branchName: isShared ? "All branches (shared account)" : branchById.get(branchId)?.name ?? "Unknown branch",
        branchSlug: isShared ? null : branchById.get(branchId)?.slug ?? null,
        bank,
        pos,
        diff: bank - pos,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // One row per calendar month: sum the (already shared-account-only) daily
  // rows above so the net over/under for July, August, etc. reads at a
  // glance instead of having to add up ~30 daily +/- figures by eye.
  const monthlyTotals = new Map<string, { bank: number; pos: number }>();
  for (const r of comparisonRows) {
    const month = r.date.slice(0, 7); // "YYYY-MM"
    const m = monthlyTotals.get(month) ?? { bank: 0, pos: 0 };
    m.bank += r.bank;
    m.pos += r.pos;
    monthlyTotals.set(month, m);
  }
  const monthlyRows = [...monthlyTotals.entries()]
    .map(([month, { bank, pos }]) => ({ month, bank, pos, diff: bank - pos }))
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));

  // Every transaction on the account, in the order the bank itself applied
  // them (txns is already sorted date -> time -> line_seq ascending), each
  // carrying the balance the STATEMENT itself recorded right after it --
  // not a total this app computed by summing amounts, the bank's own number.
  // That makes it a free consistency check: if a row's balance doesn't
  // follow from the previous row's balance plus this amount, something
  // between them never made it into bank_transactions at all (most likely
  // an unrecognized transaction type -- see the "skipped" warning on
  // upload above). Flagging that gap here is what turns "still a lot of
  // missing money" into "here's the exact row where it went missing."
  let prevBalance: number | null = null;
  const ledgerRows = txns.map((t) => {
    const signedAmount = t.direction === "out" ? -t.amount : t.amount;
    const expectedBalance = prevBalance != null ? prevBalance + signedAmount : null;
    const gap =
      expectedBalance != null && t.balance_after != null ? t.balance_after - expectedBalance : null;
    const hasGap = gap != null && Math.abs(gap) > 1;
    if (t.balance_after != null) prevBalance = t.balance_after;
    return {
      id: t.id,
      date: t.txn_date,
      time: t.txn_time,
      description: t.description,
      direction: t.direction,
      amount: t.amount,
      category: t.category,
      balanceAfter: t.balance_after,
      hasGap,
      gap,
    };
  });
  const currentBalance = [...ledgerRows].reverse().find((r) => r.balanceAfter != null)?.balanceAfter ?? null;
  const currentBalanceAsOf = [...ledgerRows].reverse().find((r) => r.balanceAfter != null)?.date ?? null;

  return (
    <>
      <Topbar title="Bank reconciliation" sub="Bank deposits vs. recorded POS sales" branch="all" />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <ReconciliationBoard
          branches={branches ?? []}
          accounts={accounts ?? []}
          patterns={patterns}
          comparisonRows={comparisonRows}
          hostelComparisonRows={hostelComparisonRows}
          branchTransferRows={branchTransferRows}
          monthlyRows={monthlyRows}
          ledgerRows={ledgerRows}
          currentBalance={currentBalance}
          currentBalanceAsOf={currentBalanceAsOf}
          hasAnyStatement={txns.length > 0}
          comparisonStartDate={earliestPosDate}
        />
      </div>
    </>
  );
}
