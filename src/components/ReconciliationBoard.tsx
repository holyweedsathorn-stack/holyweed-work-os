"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewStatement,
  importStatement,
  categorizePatternAsPosSale,
  categorizePatternAsHostelTransfer,
  categorizePatternAsBranchTransfer,
  categorizePatternAsOther,
  type PreviewResult,
} from "@/app/(app)/reconciliation/actions";
import { SHARED_ACCOUNT } from "@/lib/bank-statement";
import { fmtTHB, fmtDateBKK, type Branch } from "@/lib/types";

type Preview = Extract<PreviewResult, { ok: true }>;

type Pattern = { typeKey: string; count: number; total: number };

type ComparisonRow = {
  date: string;
  branchId: string;
  branchName: string;
  branchSlug: string | null;
  bank: number;
  pos: number;
  diff: number;
};

type MonthlyRow = {
  month: string; // "YYYY-MM"
  bank: number;
  pos: number;
  diff: number;
};

type HostelComparisonRow = {
  date: string;
  branchId: string;
  branchName: string;
  branchSlug: string | null;
  bank: number;
  recorded: number;
  diff: number;
};

type BranchTransferRow = {
  month: string;
  branchName: string;
  branchSlug: string | null;
  total: number;
};

type LedgerRow = {
  id: string;
  date: string;
  time: string | null;
  description: string;
  direction: "in" | "out";
  amount: number;
  category: string;
  balanceAfter: number | null;
  hasGap: boolean;
  gap: number | null;
};

function errorMessage(e: any): string {
  const raw = String(e?.message ?? e ?? "");
  if (/server action|not found|failed to find/i.test(raw)) {
    return "This page is out of date — the app was updated while it was open. Reload the page (Ctrl+Shift+R) and try again.";
  }
  if (/fetch|network|load failed/i.test(raw)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return raw || "Something went wrong. Reload the page and try again.";
}

export function ReconciliationBoard({
  branches,
  accounts,
  patterns,
  comparisonRows,
  hostelComparisonRows,
  branchTransferRows,
  monthlyRows,
  ledgerRows,
  currentBalance,
  currentBalanceAsOf,
  hasAnyStatement,
  comparisonStartDate,
}: {
  branches: Branch[];
  accounts: { id: string; label: string }[];
  patterns: Pattern[];
  comparisonRows: ComparisonRow[];
  hostelComparisonRows: HostelComparisonRow[];
  branchTransferRows: BranchTransferRow[];
  monthlyRows: MonthlyRow[];
  ledgerRows: LedgerRow[];
  currentBalance: number | null;
  currentBalanceAsOf: string | null;
  hasAnyStatement: boolean;
  comparisonStartDate: string | null;
}) {
  return (
    <div className="grid gap-3.5 items-start grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-3.5">
        <UploadCard />
        {patterns.length > 0 && <PatternsCard patterns={patterns} branches={branches} />}
        {hasAnyStatement && (
          <LedgerCard rows={ledgerRows} currentBalance={currentBalance} currentBalanceAsOf={currentBalanceAsOf} />
        )}
        {hasAnyStatement && <MonthlyCard rows={monthlyRows} />}
        <ComparisonCard rows={comparisonRows} hasAnyStatement={hasAnyStatement} startDate={comparisonStartDate} />
        {hostelComparisonRows.length > 0 && <HostelComparisonCard rows={hostelComparisonRows} />}
        {branchTransferRows.length > 0 && <BranchTransferCard rows={branchTransferRows} />}
      </div>
      <AccountsCard accounts={accounts} />
    </div>
  );
}

function LedgerCard({
  rows,
  currentBalance,
  currentBalanceAsOf,
}: {
  rows: LedgerRow[];
  currentBalance: number | null;
  currentBalanceAsOf: string | null;
}) {
  const gapCount = rows.filter((r) => r.hasGap).length;
  const newestFirst = [...rows].reverse();

  return (
    <div className="card">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h3 className="font-display text-[15px] font-semibold">Account balance</h3>
        {currentBalance != null && (
          <div className="text-right">
            <div className="num text-[19px] font-semibold">{fmtTHB(currentBalance)}</div>
            {currentBalanceAsOf && (
              <div className="text-[11px] text-inkMuted">as of {fmtDateBKK(currentBalanceAsOf)}</div>
            )}
          </div>
        )}
      </div>
      <p className="text-[12.5px] text-inkMuted mb-3">
        Every transaction on the account, in order, with the balance the bank itself recorded right after each one —
        not a total this app calculated, the statement's own number.
      </p>

      {gapCount > 0 && (
        <div
          className="text-[12px] font-medium rounded-[9px] px-3 py-2.5 mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {gapCount} row{gapCount === 1 ? "" : "s"} below don&apos;t add up — the balance jumps by more than this
          transaction alone explains, which usually means a transaction between it and the one before it was never
          imported (see the warning on upload for the transaction types this app doesn&apos;t recognize yet).
          Flagged rows are marked "Gap" below.
        </div>
      )}

      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className="text-left text-inkMuted text-[11px] uppercase tracking-wide">
              <th className="pb-2 font-semibold">Date</th>
              <th className="pb-2 font-semibold">Description</th>
              <th className="pb-2 font-semibold text-right">Amount</th>
              <th className="pb-2 font-semibold text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((r) => (
              <tr
                key={r.id}
                style={{
                  borderTop: "1px solid var(--line)",
                  background: r.hasGap ? "var(--critical-soft)" : undefined,
                }}
              >
                <td className="py-1.5 num align-top whitespace-nowrap">
                  {fmtDateBKK(r.date)}
                  {r.time && <div className="text-[10.5px] text-inkMuted">{r.time}</div>}
                </td>
                <td className="py-1.5 align-top">
                  {r.description}
                  {r.hasGap && (
                    <div className="text-[10.5px] font-semibold" style={{ color: "var(--critical)" }}>
                      Gap: {r.gap != null && r.gap > 0 ? "+" : ""}
                      {r.gap != null ? fmtTHB(r.gap) : ""} unexplained before this row
                    </div>
                  )}
                </td>
                <td
                  className="py-1.5 num text-right align-top"
                  style={{ color: r.direction === "in" ? "var(--good)" : "var(--ink-secondary)" }}
                >
                  {r.direction === "in" ? "+" : "-"}
                  {fmtTHB(r.amount)}
                </td>
                <td className="py-1.5 num text-right align-top">
                  {r.balanceAfter != null ? fmtTHB(r.balanceAfter) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function MonthlyCard({ rows }: { rows: MonthlyRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="card">
      <h3 className="font-display text-[15px] font-semibold mb-1">Bank vs. POS, by month</h3>
      <p className="text-[12.5px] text-inkMuted mb-4">
        Same comparison as below, added up per month so the net over/under reads at a glance.
      </p>
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="text-left text-inkMuted text-[11px] uppercase tracking-wide">
            <th className="pb-2 font-semibold">Month</th>
            <th className="pb-2 font-semibold text-right">Bank</th>
            <th className="pb-2 font-semibold text-right">POS (PromptPay)</th>
            <th className="pb-2 font-semibold text-right">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mismatch = Math.abs(r.diff) > 1;
            return (
              <tr key={r.month} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="py-1.5 num">{fmtMonthLabel(r.month)}</td>
                <td className="py-1.5 num text-right">{fmtTHB(r.bank)}</td>
                <td className="py-1.5 num text-right">{fmtTHB(r.pos)}</td>
                <td
                  className="py-1.5 num text-right font-semibold"
                  style={{ color: mismatch ? "var(--critical)" : "var(--good)" }}
                >
                  {r.diff > 0 ? "+" : ""}
                  {fmtTHB(r.diff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UploadCard() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function currentFile(): File | null {
    return formRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0] ?? null;
  }

  function doPreview() {
    const file = currentFile();
    if (!file) return;
    setError(null);
    setDone(null);
    setPreview(null);

    const fd = new FormData();
    fd.set("file", file);
    if (password) fd.set("password", password);

    start(async () => {
      try {
        const res = await previewStatement(fd);
        if (!res.ok) {
          setNeedsPassword(!!res.needsPassword);
          setError(res.error);
          return;
        }
        setNeedsPassword(false);
        setPreview(res);
      } catch (e: any) {
        setError(errorMessage(e));
      }
    });
  }

  function confirm() {
    const file = currentFile();
    if (!file) {
      setError("Please choose the file again.");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    if (password) fd.set("password", password);

    setError(null);
    start(async () => {
      try {
        const res = await importStatement(fd);
        if (!res.ok) {
          setNeedsPassword(!!res.needsPassword);
          setError(res.error);
          return;
        }
        setDone(
          `Imported ${res.bankAccountLabel}: ${res.rowCount} transactions read, ${res.newRowCount} new (already-seen ones were skipped).` +
            (res.skipped.count > 0
              ? ` ${res.skipped.count} row${res.skipped.count === 1 ? "" : "s"} had a transaction type this app doesn't recognize yet and were NOT imported -- see the warning below next time you preview a statement.`
              : "") +
            (res.possibleDuplicates.count > 0
              ? ` ${res.possibleDuplicates.count} row${res.possibleDuplicates.count === 1 ? "" : "s"} looked like an exact repeat of another row in this same statement -- if they're actually separate transactions, only one was kept.`
              : "")
        );
        setPreview(null);
        setPassword("");
        formRef.current?.reset();
        router.refresh();
      } catch (e: any) {
        setError(errorMessage(e));
      }
    });
  }

  return (
    <div className="card">
      <h3 className="font-display text-[15px] font-semibold mb-1">Upload a bank statement</h3>
      <p className="text-[12.5px] text-inkMuted mb-4">
        A Krungthai <b>Account Statement</b> PDF. If it opens with a password in your bank app,
        enter that password below — nothing is stored, it's only used to read the file.
      </p>

      <form ref={formRef} className="flex flex-col gap-2.5">
        <input
          type="file"
          accept=".pdf"
          onChange={() => {
            setError(null);
            setDone(null);
            setPreview(null);
          }}
          disabled={pending}
          className="block w-full text-[13px] text-inkSecondary file:mr-3 file:rounded-[9px] file:border file:px-4 file:py-2 file:text-[13px] file:font-semibold file:cursor-pointer file:bg-transparent"
        />
        {/* Always shown, not just after a password-required error -- the
            person uploading already knows whether their bank PDF has a
            password, so let them enter it up front instead of waiting for
            a failed attempt to reveal this field. */}
        <input
          type="password"
          placeholder="PDF password (leave blank if it doesn't have one)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          className="w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent"
          style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
        />
        <button
          type="button"
          onClick={doPreview}
          disabled={pending}
          className="self-start rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
          style={{ border: "1px solid var(--line-strong)" }}
        >
          {pending && !preview ? "Reading…" : "Read this file"}
        </button>
      </form>

      {error && (
        <div
          className="text-[12.5px] font-medium rounded-[9px] px-3 py-2 mt-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
          {needsPassword && <div className="mt-1 font-normal">Enter the password above and try again.</div>}
        </div>
      )}

      {done && (
        <p
          className="text-[13px] font-medium rounded-[9px] px-3 py-2 mt-3"
          style={{ background: "var(--good-soft)", color: "var(--good)" }}
        >
          {done}
        </p>
      )}

      {preview && (
        <div className="mt-4 rounded-[11px] p-4" style={{ background: "var(--surface-2)" }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <h4 className="font-display text-[14px] font-semibold">
              {preview.accountName ?? "Account"} {preview.accountNumber ? `(••••${preview.accountNumber.slice(-4)})` : ""}
            </h4>
            <span className="text-[12px] text-inkMuted">
              {preview.periodStart && preview.periodEnd ? `${preview.periodStart} → ${preview.periodEnd}` : "no date range found"}
            </span>
          </div>

          <div className="grid gap-3 mb-3 grid-cols-2 sm:grid-cols-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold">Transactions</div>
              <div className="num text-[19px] font-semibold">{preview.rowCount}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold">Deposits</div>
              <div className="num text-[17px] font-semibold">{fmtTHB(preview.totalIn)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold">Withdrawals</div>
              <div className="num text-[17px] font-semibold">{fmtTHB(preview.totalOut)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold">Needs tagging</div>
              <div className="num text-[17px] font-semibold">{preview.autoTagged.uncategorized}</div>
            </div>
          </div>

          <p className="text-[11.5px] text-inkMuted mb-3">
            {preview.autoTagged.otaPayout} already tagged as OTA payouts (Airbnb/Booking.com), {preview.autoTagged.other} as
            other. The rest need a one-time tag below after importing.
          </p>

          {preview.skipped.count > 0 && (
            <div
              className="text-[12px] font-medium rounded-[9px] px-3 py-2.5 mb-3"
              style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
            >
              {preview.skipped.count} row{preview.skipped.count === 1 ? "" : "s"} in this statement{" "}
              {preview.skipped.count === 1 ? "has" : "have"} a transaction type this app doesn't recognize yet, and{" "}
              {preview.skipped.count === 1 ? "won't" : "won't"} be imported at all -- not tagged as anything, just
              missing. That's real money the account's own balance includes but this page won't. Examples:
              <ul className="mt-1 ml-4 list-disc font-normal">
                {preview.skipped.samples.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <div className="mt-1 font-normal">Send these to whoever maintains the app so the parser can be taught this type.</div>
            </div>
          )}

          {preview.possibleDuplicates.count > 0 && (
            <div
              className="text-[12px] font-medium rounded-[9px] px-3 py-2.5 mb-3"
              style={{ background: "var(--warn-soft, #fff4e0)", color: "var(--warn, #b45309)" }}
            >
              {preview.possibleDuplicates.count} row{preview.possibleDuplicates.count === 1 ? "" : "s"} in this
              statement {preview.possibleDuplicates.count === 1 ? "matches" : "match"} another row's date, amount and
              description exactly (usually because neither had a printed time). Only one of each matching set will be
              saved -- if these are genuinely separate transactions (not the same one printed twice), this import will
              undercount them. Examples:
              <ul className="mt-1 ml-4 list-disc font-normal">
                {preview.possibleDuplicates.samples.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={pending}
              className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {pending ? "Importing…" : "Import this statement"}
            </button>
            <button
              onClick={() => setPreview(null)}
              disabled={pending}
              className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
              style={{ border: "1px solid var(--line-strong)" }}
            >
              Cancel
            </button>
          </div>
          <p className="text-[11.5px] text-inkMuted mt-3">
            Re-uploading a statement you've already imported is safe — matching rows are skipped, not duplicated.
          </p>
        </div>
      )}
    </div>
  );
}

function PatternsCard({ patterns, branches }: { patterns: Pattern[]; branches: Branch[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function apply(typeKey: string, kind: "branch" | "hostel" | "tab" | "other") {
    setError(null);
    setBusyKey(typeKey);
    start(async () => {
      try {
        const res =
          kind === "other"
            ? await categorizePatternAsOther(typeKey)
            : kind === "hostel"
              ? await categorizePatternAsHostelTransfer(typeKey, choice[typeKey] ?? "")
              : kind === "tab"
                ? await categorizePatternAsBranchTransfer(typeKey, choice[typeKey] ?? "")
                : await categorizePatternAsPosSale(typeKey, choice[typeKey] ?? "");
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
      } catch (e: any) {
        setError(errorMessage(e));
      } finally {
        setBusyKey(null);
      }
    });
  }

  return (
    <div className="card">
      <h3 className="font-display text-[15px] font-semibold mb-1">Needs tagging</h3>
      <p className="text-[12.5px] text-inkMuted mb-4">
        Every deposit that isn't obviously an OTA payout, grouped by transaction type. Tag each group once — every
        matching deposit gets the same tag, including new ones from future statements.
      </p>

      {error && (
        <div
          className="text-[12.5px] font-medium rounded-[9px] px-3 py-2 mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {patterns.map((p) => (
          <div
            key={p.typeKey}
            className="flex items-center gap-2 flex-wrap rounded-[9px] px-3 py-2.5"
            style={{ background: "var(--surface-2)" }}
          >
            <div className="flex-1 min-w-[180px]">
              <div className="text-[12.8px] font-semibold">{p.typeKey}</div>
              <div className="text-[11.5px] text-inkMuted num">
                {p.count} deposits · {fmtTHB(p.total)}
              </div>
            </div>
            <select
              value={choice[p.typeKey] ?? ""}
              onChange={(e) => setChoice((c) => ({ ...c, [p.typeKey]: e.target.value }))}
              disabled={pending}
              className="rounded-[9px] border px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            >
              <option value="">Which branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value={SHARED_ACCOUNT}>All branches (shared account)</option>
            </select>
            <button
              onClick={() => apply(p.typeKey, "branch")}
              disabled={pending || !choice[p.typeKey]}
              className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {busyKey === p.typeKey && pending ? "…" : "Tag as POS sale"}
            </button>
            <button
              onClick={() => apply(p.typeKey, "hostel")}
              disabled={pending || !choice[p.typeKey]}
              title="For guest payments wired directly to the bank -- compared against hostel check-in records, not PromptPay sales."
              className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
              style={{ border: "1px solid var(--line-strong)", background: "var(--surface-2)" }}
            >
              {busyKey === p.typeKey && pending ? "…" : "Hostel bank transfer"}
            </button>
            <button
              onClick={() => apply(p.typeKey, "tab")}
              disabled={pending || !choice[p.typeKey] || choice[p.typeKey] === SHARED_ACCOUNT}
              title={
                choice[p.typeKey] === SHARED_ACCOUNT
                  ? 'A tab has to belong to one specific branch -- choose it from the dropdown instead of "All branches (shared account)".'
                  : "For a customer who runs a tab and settles later by transfer -- counted as revenue for the branch, with no PromptPay or check-in record to match it against."
              }
              className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
              style={{ border: "1px solid var(--line-strong)", background: "var(--surface-2)" }}
            >
              {busyKey === p.typeKey && pending ? "…" : "Tab / running account"}
            </button>
            <button
              onClick={() => apply(p.typeKey, "other")}
              disabled={pending}
              className="rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
              style={{ border: "1px solid var(--line-strong)" }}
            >
              Not a sale
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountsCard({ accounts }: { accounts: { id: string; label: string }[] }) {
  return (
    <div className="card">
      <h3 className="font-display text-[15px] font-semibold mb-3">Bank accounts on file</h3>
      {accounts.length === 0 ? (
        <p className="text-[13px] text-inkMuted">Upload a statement to add one.</p>
      ) : (
        <div className="flex flex-col">
          {accounts.map((a, i) => (
            <div key={a.id} className="py-2 text-[12.8px]" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              {a.label}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11.5px] text-inkMuted mt-3">
        One account can cover more than one branch if the same PromptPay QR is used at both — tag each transaction
        type to whichever branch it actually belongs to.
      </p>
    </div>
  );
}

function ComparisonCard({
  rows,
  hasAnyStatement,
  startDate,
}: {
  rows: ComparisonRow[];
  hasAnyStatement: boolean;
  startDate: string | null;
}) {
  if (!hasAnyStatement) {
    return (
      <div className="card">
        <h3 className="font-display text-[15px] font-semibold mb-1">Bank vs. POS, by day</h3>
        <p className="text-[13px] text-inkMuted">Upload a statement to see this.</p>
      </div>
    );
  }

  const taggedRows = rows.filter((r) => r.bank > 0 || r.pos > 0);

  return (
    <div className="card">
      <h3 className="font-display text-[15px] font-semibold mb-1">Bank vs. POS, by day</h3>
      <p className="text-[12.5px] text-inkMuted mb-4">
        Bank deposits tagged as POS sale vs. that branch's PromptPay sales recorded in Silom for the same day — not
        total revenue, since cash and card sales never hit this account.
        {startDate && (
          <>
            {" "}
            Showing from <b>{fmtDateBKK(startDate)}</b> on — no POS sales are recorded before that date yet, so
            earlier bank deposits would only show as 100% unexplained.
          </>
        )}
      </p>

      {taggedRows.length === 0 ? (
        <p className="text-[13px] text-inkMuted">
          Nothing to compare yet — tag some deposits above as a branch's POS sale first.
        </p>
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="text-left text-inkMuted text-[11px] uppercase tracking-wide">
                <th className="pb-2 font-semibold">Date</th>
                <th className="pb-2 font-semibold">Branch</th>
                <th className="pb-2 font-semibold text-right">Bank</th>
                <th className="pb-2 font-semibold text-right">POS (PromptPay)</th>
                <th className="pb-2 font-semibold text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {taggedRows.map((r) => {
                const mismatch = Math.abs(r.diff) > 1;
                return (
                  <tr key={`${r.date}|${r.branchId}`} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="py-1.5 num">{fmtDateBKK(r.date)}</td>
                    <td className="py-1.5">
                      <span
                        className="chip"
                        style={{
                          background: r.branchSlug ? `var(--${r.branchSlug}-soft)` : "var(--surface-2)",
                          color: r.branchSlug ? `var(--${r.branchSlug})` : "var(--ink-secondary)",
                        }}
                      >
                        {r.branchName}
                      </span>
                    </td>
                    <td className="py-1.5 num text-right">{fmtTHB(r.bank)}</td>
                    <td className="py-1.5 num text-right">{fmtTHB(r.pos)}</td>
                    <td
                      className="py-1.5 num text-right font-semibold"
                      style={{ color: mismatch ? "var(--critical)" : "var(--good)" }}
                    >
                      {r.diff > 0 ? "+" : ""}
                      {fmtTHB(r.diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HostelComparisonCard({ rows }: { rows: HostelComparisonRow[] }) {
  const taggedRows = rows.filter((r) => r.bank > 0 || r.recorded > 0);

  return (
    <div className="card">
      <h3 className="font-display text-[15px] font-semibold mb-1">Hostel bank transfers, by day</h3>
      <p className="text-[12.5px] text-inkMuted mb-4">
        Bank deposits tagged as a hostel wire vs. the amount recorded at check-in for guests who paid that way the
        same day — a separate comparison from PromptPay above, since these payments never go through Silom at all.
      </p>

      {taggedRows.length === 0 ? (
        <p className="text-[13px] text-inkMuted">Nothing to compare yet.</p>
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="text-left text-inkMuted text-[11px] uppercase tracking-wide">
                <th className="pb-2 font-semibold">Date</th>
                <th className="pb-2 font-semibold">Branch</th>
                <th className="pb-2 font-semibold text-right">Bank</th>
                <th className="pb-2 font-semibold text-right">Recorded at check-in</th>
                <th className="pb-2 font-semibold text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {taggedRows.map((r) => {
                const mismatch = Math.abs(r.diff) > 1;
                return (
                  <tr key={`${r.date}|${r.branchId}`} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="py-1.5 num">{fmtDateBKK(r.date)}</td>
                    <td className="py-1.5">
                      <span
                        className="chip"
                        style={{
                          background: r.branchSlug ? `var(--${r.branchSlug}-soft)` : "var(--surface-2)",
                          color: r.branchSlug ? `var(--${r.branchSlug})` : "var(--ink-secondary)",
                        }}
                      >
                        {r.branchName}
                      </span>
                    </td>
                    <td className="py-1.5 num text-right">{fmtTHB(r.bank)}</td>
                    <td className="py-1.5 num text-right">{fmtTHB(r.recorded)}</td>
                    <td
                      className="py-1.5 num text-right font-semibold"
                      style={{ color: mismatch ? "var(--critical)" : "var(--good)" }}
                    >
                      {r.diff > 0 ? "+" : ""}
                      {fmtTHB(r.diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11.5px] text-inkMuted mt-3">
            A mismatch here usually means either the check-in wasn't logged as "Bank transfer" with an amount, or the
            guest paid on a different day than they checked in.
          </p>
        </div>
      )}
    </div>
  );
}

function BranchTransferCard({ rows }: { rows: BranchTransferRow[] }) {
  return (
    <div className="card">
      <h3 className="font-display text-[15px] font-semibold mb-1">Tab / running-account transfers, by month</h3>
      <p className="text-[12.5px] text-inkMuted mb-4">
        Bank deposits tagged as a customer settling a tab by transfer, totalled per branch per month. Nothing to
        compare this against — no PromptPay record (not a QR sale) and no check-in record (not a booking) — so this
        is just real revenue that would otherwise be invisible in the reconciliation above.
      </p>
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className="text-left text-inkMuted text-[11px] uppercase tracking-wide">
              <th className="pb-2 font-semibold">Month</th>
              <th className="pb-2 font-semibold">Branch</th>
              <th className="pb-2 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.month}|${r.branchName}`} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="py-1.5 num">{r.month}</td>
                <td className="py-1.5">
                  <span
                    className="chip"
                    style={{
                      background: r.branchSlug ? `var(--${r.branchSlug}-soft)` : "var(--surface-2)",
                      color: r.branchSlug ? `var(--${r.branchSlug})` : "var(--ink-secondary)",
                    }}
                  >
                    {r.branchName}
                  </span>
                </td>
                <td className="py-1.5 num text-right font-semibold">{fmtTHB(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
