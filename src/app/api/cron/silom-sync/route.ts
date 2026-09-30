import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSilomSnapshot } from "@/lib/silom-live";

// Headless Chromium + a real login round trip easily takes 10-20s -- this
// needs a plan that allows a serverless function to run that long (Vercel
// Hobby defaults to 10s). Split into two separate cron hits (one per shop,
// see vercel.json) rather than one longer run doing both, to keep each
// invocation as short as possible either way.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ShopKey = "sathorn" | "sukhumvit";

function credentialsFor(shop: ShopKey): { email: string; password: string } | null {
  const prefix = shop === "sathorn" ? "SILOM_SATHORN" : "SILOM_SUKHUMVIT";
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends this automatically once CRON_SECRET is set in the
  // project's env vars -- without it, this route would be a public URL
  // anyone could hit to trigger a login against your Silom accounts.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const shop = req.nextUrl.searchParams.get("shop") as ShopKey | null;
  if (shop !== "sathorn" && shop !== "sukhumvit") {
    return NextResponse.json(
      { ok: false, error: 'Missing or invalid "shop" query param (sathorn | sukhumvit).' },
      { status: 400 }
    );
  }

  const creds = credentialsFor(shop);
  if (!creds) {
    return NextResponse.json(
      {
        ok: false,
        error: `SILOM_${shop.toUpperCase()}_EMAIL / _PASSWORD not set in the environment.`,
      },
      { status: 500 }
    );
  }

  const admin = createAdminClient();

  const [{ data: org, error: orgErr }, { data: branch, error: branchErr }] = await Promise.all([
    admin.from("organizations").select("id").limit(1).single(),
    admin.from("branches").select("id").eq("slug", shop).single(),
  ]);
  if (orgErr || !org) {
    return NextResponse.json({ ok: false, error: `No organization found: ${orgErr?.message}` }, { status: 500 });
  }
  if (branchErr || !branch) {
    return NextResponse.json(
      { ok: false, error: `No branch with slug "${shop}": ${branchErr?.message}` },
      { status: 500 }
    );
  }

  try {
    const snapshot = await fetchSilomSnapshot(creds.email, creds.password);

    const { error: insertErr } = await admin.from("pos_live_snapshots").insert({
      org_id: org.id,
      branch_id: branch.id,
      source: "silom",
      sales: snapshot.sales,
      profit: snapshot.profit,
      discount: snapshot.discount,
      bill_count: snapshot.billCount,
      avg_bill: snapshot.avgBill,
      grand_total: snapshot.grandTotal,
    });
    if (insertErr) throw insertErr;

    return NextResponse.json({ ok: true, shop, snapshot });
  } catch (err) {
    // Never let a broken Silom login/page take the app down -- a missed
    // refresh just means the dashboard shows an older "as of" time.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron/silom-sync] ${shop} failed:`, message);
    return NextResponse.json({ ok: false, shop, error: message }, { status: 502 });
  }
}
