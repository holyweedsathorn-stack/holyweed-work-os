"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewImport, runImport, type PreviewResult } from "@/app/(app)/import/actions";
import type { Branch } from "@/lib/types";

type Preview = Extract<PreviewResult, { ok: true }>;

const KIND_LABEL: Record<string, string> = {
  daily: "Sales by Date",
  product: "Sales by Product",
  expenses: "Expense sheet",
};

/**
 * Turn whatever was thrown into something worth reading. The common case is a
 * tab that was open while a new version was deployed: the page is calling a
 * version of the server that no longer exists, and reloading fixes it.
 */
function errorMessage(e: any): string {
  const raw = String(e?.message ?? e ?? "");
  if (/server action|not found|failed to find/i.test(raw)) {
    return "This page is out of date — the app was updated while it was open. Reload the page (Ctrl+Shift+R) and try again.";
  }
  if (/fetch|network|load failed/i.test(raw)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return raw || "Something went wrong reading that file. Reload the page and try again.";
}

export function SalesImporter({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setDone(null);
    setPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.set("file", file);

    start(async () => {
      try {
        const res = await previewImport(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setPreview(res);
        // Pre-select the branch the file says it came from.
        const guessed = branches.find((b) => b.slug === res.branchSlug);
        setBranchId(guessed?.id ?? "");
      } catch (e: any) {
        // Without this the page just sat there doing nothing: a thrown error
        // (most often a stale tab left open across a deploy) never reached
        // any of the states that render a message.
        setError(errorMessage(e));
      }
    });
  }

  function confirm() {
    const file = formRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
    if (!file) {
      setError("Please choose the file again.");
      return;
    }
    if (!branchId) {
      setError("Please choose which branch this file is for.");
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    fd.set("branch_id", branchId);

    setError(null);
    start(async () => {
      try {
        const res = await runImport(fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const unit =
          res.kind === "daily" ? "days" : res.kind === "expenses" ? "expense entries" : "products";
        setDone(
          `Imported ${res.rowCount} ${unit} for ${res.branchName}.` +
            (res.warnings?.length
              ? ` ${res.warnings.length} thing(s) worth checking — see above.`
              : "")
        );
        setPreview(null);
        formRef.current?.reset();
        router.refresh();
      } catch (e: any) {
        setError(errorMessage(e));
      }
    });
  }

  return (
    <div className="card">
      <h3 className="font-display text-[15px] font-semibold mb-1">Import a file</h3>
      <p className="text-[12.5px] text-inkMuted mb-4">
        Upload a <b>Silom sales export</b> (Reports → Sales → Sales by Date, or Sales by Product)
        or one of your <b>expense spreadsheets</b>. The app works out which it is. One branch at a
        time.
      </p>

      <form ref={formRef}>
        <input
          type="file"
          accept=".xlsx,.csv,.txt"
          onChange={onFileChosen}
          disabled={pending}
          className="block w-full text-[13px] text-inkSecondary file:mr-3 file:rounded-[9px] file:border file:px-4 file:py-2 file:text-[13px] file:font-semibold file:cursor-pointer file:bg-transparent"
          style={{ colorScheme: "inherit" }}
        />
      </form>

      {pending && !preview && <p className="text-[13px] text-inkMuted mt-3">Reading the file…</p>}

      {error && (
        <p
          className="text-[12.5px] font-medium rounded-[9px] px-3 py-2 mt-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {error}
        </p>
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
              {KIND_LABEL[preview.kind] ?? preview.kind}
            </h4>
            <span className="text-[12px] text-inkMuted">
              {preview.periodStart && preview.periodEnd
                ? `${preview.periodStart} → ${preview.periodEnd}`
                : "no date range in file"}
            </span>
          </div>

          <div className="grid gap-3 mb-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold">
                {preview.kind === "daily" ? "Days" : preview.kind === "expenses" ? "Entries" : "Products"}
              </div>
              <div className="num text-[19px] font-semibold">{preview.rowCount}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold">
                {preview.kind === "expenses" ? "Total spend" : "Revenue"}
              </div>
              <div className="num text-[19px] font-semibold">
                ฿{Math.round(preview.totalRevenue).toLocaleString("en-US")}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold">
                {preview.kind === "expenses" ? "Categories" : "Profit"}
              </div>
              <div className="num text-[19px] font-semibold">
                {preview.kind === "expenses"
                  ? preview.sample.length
                  : preview.totalProfit != null
                    ? "฿" + Math.round(preview.totalProfit).toLocaleString("en-US")
                    : "—"}
              </div>
            </div>
          </div>

          {preview.warnings && preview.warnings.length > 0 && (
            <div
              className="rounded-[9px] px-3 py-2.5 mb-3"
              style={{ background: "var(--warning-soft)" }}
            >
              <div
                className="text-[11px] uppercase tracking-wide font-bold mb-1.5"
                style={{ color: "var(--warning)" }}
              >
                Worth checking ({preview.warnings.length})
              </div>
              <ul className="flex flex-col gap-1.5">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="text-[12px]" style={{ color: "var(--ink-secondary)" }}>
                    {w}
                  </li>
                ))}
              </ul>
              <p className="text-[11.5px] mt-2" style={{ color: "var(--ink-muted)" }}>
                These were handled as best they could be — importing is still safe.
              </p>
            </div>
          )}

          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wide text-inkMuted font-semibold mb-1">
              {preview.kind === "expenses" ? "By category" : "First few rows"}
            </div>
            {preview.sample.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
              >
                <span className="flex-1 min-w-0 truncate">{s.label}</span>
                <span className="num">{s.a}</span>
                <span className="text-inkMuted num w-[90px] text-right">{s.b}</span>
              </div>
            ))}
          </div>

          <label className="text-[12px] font-semibold text-inkSecondary block mb-3">
            Which branch is this?
            {preview.shopName && (
              <span className="font-normal text-inkMuted">
                {" "}
                — file says &ldquo;{preview.shopName}&rdquo;
              </span>
            )}
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="mt-1 w-full rounded-[9px] border px-3 py-2 text-[13.5px] outline-none focus:border-accent"
              style={{ borderColor: "var(--line-strong)", background: "var(--surface)" }}
            >
              <option value="">Choose a branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={pending || !branchId}
              className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {pending ? "Importing…" : "Import this data"}
            </button>
            <button
              onClick={() => {
                setPreview(null);
                formRef.current?.reset();
              }}
              disabled={pending}
              className="rounded-[9px] px-4 py-2 text-[13px] font-semibold"
              style={{ border: "1px solid var(--line-strong)" }}
            >
              Cancel
            </button>
          </div>

          <p className="text-[11.5px] text-inkMuted mt-3">
            Importing the same period twice is safe — it updates those figures rather than adding
            them again.
          </p>
        </div>
      )}
    </div>
  );
}
