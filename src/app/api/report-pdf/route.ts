import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { requireManager } from "@/lib/guard";

// Phones block window.print(), so the Monthly report's "Download PDF"
// button asks the server to print the page instead: headless Chromium
// opens /report as the signed-in user and hands back a real PDF file.
// "Save PDF" (?layout=document) prints /report-document instead: the same
// figures as one complete, plain document (see that page).
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const FONT_BASE = "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts";
const FONTS = [
  "NotoSansThai/hinted/ttf/NotoSansThai-Regular.ttf",
  "NotoSansThai/hinted/ttf/NotoSansThai-Bold.ttf",
  "NotoSansMyanmar/hinted/ttf/NotoSansMyanmar-Regular.ttf",
];

/**
 * The bundled Chromium only ships basic Latin fonts, so the baht sign and
 * Thai/Burmese staff names come out as boxes. @sparticuz/chromium points
 * fontconfig at <tmpdir>/fonts, so drop the Noto fonts in there before the
 * browser launches. A failed download just means boxes, not a failed PDF.
 */
async function ensureFonts() {
  const dir = path.join(os.tmpdir(), "fonts");
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  await Promise.all(
    FONTS.map(async (rel) => {
      const dest = path.join(dir, path.basename(rel));
      try {
        await fs.access(dest);
        return; // warm function: already downloaded
      } catch {}
      try {
        const res = await fetch(`${FONT_BASE}/${rel}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
      } catch (err) {
        console.warn(`report-pdf: could not download font ${rel}:`, err);
      }
    }),
  );
}

export async function GET(req: NextRequest) {
  const guard = await requireManager("report.pdf");
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: 401 });
  }

  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid "month" (YYYY-MM).' },
      { status: 400 },
    );
  }

  const asDocument = req.nextUrl.searchParams.get("layout") === "document";
  const target = asDocument ? "/report-document" : "/report";
  const filename = asDocument ? `Holyweed-monthly-report-${month}.pdf` : `Holyweed-report-${month}.pdf`;

  const origin = req.nextUrl.origin;
  const cookie = req.headers.get("cookie") ?? "";

  const executablePath = await chromium.executablePath();
  await ensureFonts();

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1024, height: 1400 },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);

    // Forward the session cookie only to our own origin -- fonts, CDNs or
    // anything else the page loads must never see it.
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (cookie && (url === origin || url.startsWith(`${origin}/`))) {
        request.continue({ headers: { ...request.headers(), cookie } });
      } else {
        request.continue();
      }
    });

    await page.emulateMediaType("print");
    await page.goto(`${origin}${target}?month=${encodeURIComponent(month)}`, {
      waitUntil: "networkidle0",
    });

    const landed = new URL(page.url()).pathname;
    if (landed.startsWith("/login")) {
      return NextResponse.json({ ok: false, error: "You are not signed in." }, { status: 401 });
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("report-pdf failed:", err);
    return NextResponse.json(
      { ok: false, error: `Could not make the PDF: ${msg}` },
      { status: 500 },
    );
  } finally {
    await browser.close();
  }
}
