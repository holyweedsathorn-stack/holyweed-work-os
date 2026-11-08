"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/report";

/** "page": the report page as shown (Download PDF). "document": the complete report document (Save PDF). */
type PdfKind = "page" | "document";

export function MonthPicker({ month, options }: { month: string; options: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(next: string) {
    const p = new URLSearchParams(params.toString());
    p.set("month", next);
    router.push(`${pathname}?${p.toString()}`);
  }

  const isReport = pathname === "/report";
  const [pdf, setPdf] = useState<
    | { state: "idle" }
    | { state: "working"; kind: PdfKind }
    | { state: "ready"; url: string; file: File }
    | { state: "error"; message: string }
  >({ state: "idle" });

  // Free the blob URL when it's replaced or the picker unmounts.
  const readyUrl = pdf.state === "ready" ? pdf.url : null;
  useEffect(() => {
    return () => {
      if (readyUrl) URL.revokeObjectURL(readyUrl);
    };
  }, [readyUrl]);

  // A PDF for one month shouldn't linger after switching to another.
  useEffect(() => {
    setPdf({ state: "idle" });
  }, [month]);

  async function downloadPdf(kind: PdfKind = "page") {
    setPdf({ state: "working", kind });
    try {
      const layout = kind === "document" ? "&layout=document" : "";
      const res = await fetch(`/api/report-pdf?month=${encodeURIComponent(month)}${layout}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        let message = `Could not make the PDF (error ${res.status}).`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {}
        throw new Error(message);
      }
      // Not signed in: middleware redirects to /login and fetch follows it,
      // so a 200 can still be an HTML page rather than the PDF.
      if (!res.headers.get("content-type")?.includes("application/pdf")) {
        throw new Error("You are not signed in. Sign in again and retry.");
      }
      const blob = await res.blob();
      const filename = kind === "document" ? `Holyweed-monthly-report-${month}.pdf` : `Holyweed-report-${month}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setPdf({ state: "ready", url, file });
    } catch (err) {
      setPdf({
        state: "error",
        message: err instanceof Error ? err.message : "Could not make the PDF.",
      });
    }
  }

  async function sharePdf(file: File) {
    try {
      await navigator.share({ files: [file], title: file.name });
    } catch (err) {
      // User closing the share sheet isn't an error worth showing.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setPdf({ state: "error", message: "Could not share the PDF." });
    }
  }

  const canShare = (file: File) =>
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  const idx = options.indexOf(month);
  const older = idx >= 0 && idx < options.length - 1 ? options[idx + 1] : null;
  const newer = idx > 0 ? options[idx - 1] : null;

  const arrow = "rounded-[9px] px-2.5 py-2 text-[13px] font-semibold disabled:opacity-35";
  const arrowStyle = {
    border: "1px solid var(--line-strong)",
    background: "var(--surface)",
  } as const;

  return (
    <div className="mb-4 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => older && go(older)}
          disabled={!older}
          aria-label="Previous month"
          className={arrow}
          style={arrowStyle}
        >
          ←
        </button>

        <select
          value={month}
          onChange={(e) => go(e.target.value)}
          className="rounded-[9px] border px-3 py-2 text-[13.5px] font-semibold outline-none focus:border-accent"
          style={{
            borderColor: "var(--line-strong)",
            background: "var(--surface)",
          }}
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>

        <button
          onClick={() => newer && go(newer)}
          disabled={!newer}
          aria-label="Next month"
          className={arrow}
          style={arrowStyle}
        >
          →
        </button>

        <div className="ml-auto flex items-center gap-2">
          {isReport && (
            // The complete report as a clean document: salary, rent & bills (incl. Holy Bistro), every
            // carried-over figure and the full notes, laid out like the monthly report the owner files.
            <button
              onClick={() => downloadPdf("document")}
              disabled={pdf.state === "working"}
              className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {pdf.state === "working" && pdf.kind === "document" ? "Making PDF…" : "Save PDF"}
            </button>
          )}
          {isReport && (
            <button
              onClick={() => downloadPdf("page")}
              disabled={pdf.state === "working"}
              className="rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
              style={{ background: "var(--ink)", color: "var(--bg)" }}
            >
              {pdf.state === "working" && pdf.kind === "page" ? "Making PDF…" : "Download PDF"}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className={`${isReport ? "hidden sm:inline-block" : ""} rounded-[9px] px-4 py-2 text-[13px] font-semibold`}
            style={
              isReport
                ? {
                    border: "1px solid var(--line-strong)",
                    background: "var(--surface)",
                  }
                : { background: "var(--ink)", color: "var(--bg)" }
            }
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {isReport && pdf.state === "working" && (
        <p className="mt-2 text-right text-[12.5px]" style={{ color: "var(--ink-muted)" }}>
          Making PDF… this can take up to a minute.
        </p>
      )}
      {isReport && pdf.state === "ready" && (
        <p className="mt-2 text-right text-[12.5px]">
          PDF ready.{" "}
          <a href={pdf.url} target="_blank" rel="noopener" className="font-semibold underline">
            Open
          </a>
          {canShare(pdf.file) && (
            <>
              {" · "}
              <button onClick={() => sharePdf(pdf.file)} className="font-semibold underline">
                Share
              </button>
            </>
          )}
        </p>
      )}
      {isReport && pdf.state === "error" && (
        <p role="alert" className="mt-2 text-right text-[12.5px]" style={{ color: "#b42318" }}>
          {pdf.message}
        </p>
      )}
    </div>
  );
}
