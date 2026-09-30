/**
 * Silom POS has no API or webhook -- this logs into the Silom cloud
 * dashboard fresh (headless Chromium) and reads the same numbers a manager
 * would see there, so the "live" shop dashboard can refresh itself on a
 * schedule (src/app/api/cron/silom-sync/route.ts) instead of you having to
 * open Silom's site and eyeball it.
 *
 * This is screen-reading, not a real integration: if Silom redesigns that
 * page, parseSilomDashboardText() below is the thing that breaks and needs
 * updating, not the login flow.
 */
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export type SilomSnapshot = {
  sales: number | null;
  profit: number | null;
  discount: number | null;
  billCount: number | null;
  avgBill: number | null;
  grandTotal: number | null;
};

const LOGIN_URL = "https://dashboard.silompos.app/login";

export async function fetchSilomSnapshot(email: string, password: string): Promise<SilomSnapshot> {
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 900 },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);

    await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });

    // Two plain inputs on this form: the first non-password text input is
    // the e-mail field, the other is type="password". Matched by type/order
    // rather than a name or id, since none is visible in the rendered DOM.
    await page.waitForSelector('input[type="password"]');
    const emailHandle = await page.$('input:not([type="password"])');
    const passwordHandle = await page.$('input[type="password"]');
    if (!emailHandle || !passwordHandle) {
      throw new Error("Silom login form fields not found -- the page may have changed.");
    }
    await emailHandle.type(email, { delay: 15 });
    await passwordHandle.type(password, { delay: 15 });

    // No stable selector on the button either -- match it by its own label.
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Sign In"
      );
      if (!btn) return false;
      (btn as HTMLButtonElement).click();
      return true;
    });
    if (!clicked) throw new Error('Silom "Sign In" button not found -- the page may have changed.');

    // The dashboard renders client-side after login; wait for the numbers
    // rather than for a URL change, since a slow first paint otherwise
    // reads as "still on the login page" and times out for the wrong reason.
    try {
      await page.waitForFunction(() => document.body.innerText.includes("Sales"), {
        timeout: 35000,
      });
    } catch (waitErr) {
      // The plain "35000ms exceeded" message tells us nothing about *why* --
      // wrong password, an unexpected interstitial (2FA, a "select branch"
      // screen, a cookie/consent banner), or just a slow first paint. Grab
      // what's actually on screen so the next failure is diagnosable from
      // the cron response alone, without needing a live look at the page.
      const url = page.url();
      const snippet = await page
        .evaluate(() => document.body.innerText.slice(0, 500))
        .catch(() => "(could not read page text)");
      const waitMsg = waitErr instanceof Error ? waitErr.message : String(waitErr);
      // Never log/throw the actual credential value -- but its length and
      // whether it has stray leading/trailing whitespace (a classic
      // copy-paste-into-an-env-var bug) are safe to report and are exactly
      // what "logs in fine by hand, fails here" usually turns out to be.
      const emailHygiene = `len=${email.length}${email !== email.trim() ? ", HAS LEADING/TRAILING WHITESPACE" : ""}`;
      const passwordHygiene = `len=${password.length}${password !== password.trim() ? ", HAS LEADING/TRAILING WHITESPACE" : ""}`;
      throw new Error(
        `Dashboard never showed "Sales" after login (${waitMsg}). Current URL: ${url}. Email hygiene: ${emailHygiene}. Password hygiene: ${passwordHygiene}. Page text starts: ${JSON.stringify(snippet)}`
      );
    }

    // The word "Sales" can be on screen before the dashboard's actual
    // figures have loaded -- a "0.00" placeholder/skeleton while Silom's
    // own async fetch is still in flight would satisfy the wait above and
    // get read as if it were real, producing a false "no sales" snapshot
    // even during busy hours. Instead of trusting the very first read,
    // keep re-reading the panel until the text stops changing (or we hit
    // a budget), which is true whether the real numbers turn out to be
    // zero or not.
    const readMain = () =>
      page.evaluate(
        () => (document.querySelector("main") as HTMLElement | null)?.innerText ?? document.body.innerText
      );

    let text = await readMain();
    const stabilizeDeadline = Date.now() + 10000; // stay well inside the 60s function budget
    while (Date.now() < stabilizeDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const next = await readMain();
      if (next === text) break;
      text = next;
    }

    return parseSilomDashboardText(text);
  } finally {
    await browser.close();
  }
}

/**
 * The dashboard's main panel comes back as label/value pairs separated by
 * tabs or newlines depending on whether it's a summary tile or a table row,
 * e.g.:
 *   Sales\n9,800.00\nProfit\n8,772.60 ...
 *   Total\t11 Bill\nAverage / bill\t890.91 ...
 *   Grand Total\t9,800.00
 */
export function parseSilomDashboardText(text: string): SilomSnapshot {
  const money = (label: string): number | null => {
    const re = new RegExp(`${escapeRegExp(label)}\\s*[\\t\\n]+(-?[\\d,]+(?:\\.\\d+)?)`);
    const m = text.match(re);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  };
  const billCount = (): number | null => {
    const m = text.match(/Total\s*[\t\n]+(\d+)\s*Bill/);
    return m ? Number(m[1]) : null;
  };

  return {
    sales: money("Sales"),
    profit: money("Profit"),
    discount: money("Discount"),
    billCount: billCount(),
    avgBill: money("Average / bill"),
    grandTotal: money("Grand Total"),
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
