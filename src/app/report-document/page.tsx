import { notFound } from "next/navigation";
import { requireManager } from "@/lib/guard";
import { bangkokMonth } from "@/lib/types";
import { loadMonthReport } from "@/lib/report-load";
import { ReportDocument } from "@/components/ReportDocument";

export const dynamic = "force-dynamic";

const MONTH = /^d{4}-d{2}$/;

/**
 * The Monthly report as a printable document, for "Save PDF" (/api/report-pdf?layout=document).
 * Same data as /report (both use loadMonthReport). Managers only, and no app chrome (sidebar,
 * buttons) around it -- see ReportDocument for what it shows.
 */
export default async function ReportDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const guard = await requireManager("report.document");
  if (!guard.ok) notFound();

  const sp = await searchParams;
  const month = sp.month && MONTH.test(sp.month) ? sp.month : bangkokMonth();
  const { report, carriedFrom, noteBody } = await loadMonthReport(month);
  const generated = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return <ReportDocument report={report} carriedFrom={carriedFrom} noteBody={noteBody} generated={generated} />;
}
