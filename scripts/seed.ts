/**
 * Seeds a fresh Supabase project with demo data for Holyweed Group so the
 * app is immediately useful after setup: one owner login, two branches,
 * a roster of employees, a week of shifts, 14 days of sales, 6 months of
 * financials, expenses, top products, and a projects board.
 *
 * Usage:  npm run seed
 * Requires (in .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Next.js loads .env.local automatically, but this standalone script has to be
// told about it. Load .env.local first (it wins), then fall back to .env.
loadEnv({ path: ".env.local" });
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Create a .env.local file in the project root with your Supabase project's\n" +
      "URL, anon/publishable key, and service_role/secret key. See README.md."
  );
  process.exit(1);
}

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || "owner@holyweed.co";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD || "holyweed-demo-2026";

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  console.log("Seeding Holyweed Work OS…");

  // 1. Organization
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name: "Holyweed Group" })
    .select()
    .single();
  if (orgErr) throw orgErr;
  console.log("✓ organization", org.id);

  // 2. Owner login
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  if (authErr) throw authErr;
  const { error: appUserErr } = await supabase
    .from("app_users")
    .insert({ id: authUser.user.id, org_id: org.id, full_name: "Naing", role: "owner" });
  if (appUserErr) throw appUserErr;
  console.log(`✓ owner login  ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);

  // 3. Branches
  const { data: branches, error: brErr } = await supabase
    .from("branches")
    .insert([
      { org_id: org.id, name: "Sathorn", slug: "sathorn" },
      { org_id: org.id, name: "Sukhumvit 22", slug: "sukhumvit" },
    ])
    .select();
  if (brErr) throw brErr;
  const sathorn = branches.find((b) => b.slug === "sathorn")!;
  const sukhumvit = branches.find((b) => b.slug === "sukhumvit")!;
  console.log("✓ branches");

  // 4. Employees
  const empRows = [
    { full_name: "Ploy Suwannarat", role_title: "Budtender", branch: sathorn, status: "on", task: "Serving walk-in customer" },
    { full_name: "Ohm Techawong", role_title: "Inventory Lead", branch: sathorn, status: "on", task: "Restocking flower display case" },
    { full_name: "Gap Wattana", role_title: "Assistant Manager", branch: sathorn, status: "on", task: "Morning cash reconciliation" },
    { full_name: "Mai Srisuk", role_title: "Budtender", branch: sathorn, status: "off", task: null },
    { full_name: "Nick Anderson", role_title: "Store Manager", branch: sukhumvit, status: "on", task: "Reviewing weekly inventory count" },
    { full_name: "Fah Chaiyaporn", role_title: "Budtender", branch: sukhumvit, status: "break", task: "On 15-min break" },
    { full_name: "Nan Phetcharat", role_title: "Budtender", branch: sukhumvit, status: "on", task: "Consulting customer on strains" },
    { full_name: "Beam Kittisak", role_title: "Courier", branch: sukhumvit, status: "on", task: "Out for delivery — Thonglor" },
  ];
  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .insert(
      empRows.map((e) => ({
        org_id: org.id,
        branch_id: e.branch.id,
        full_name: e.full_name,
        role_title: e.role_title,
        status: e.status,
        current_task: e.task,
        clocked_in_at: e.status === "off" ? null : new Date().toISOString(),
      }))
    )
    .select();
  if (empErr) throw empErr;
  const empByName = Object.fromEntries(employees.map((e) => [e.full_name, e]));
  console.log("✓ employees", employees.length);

  // 5. Shifts — this week, Mon–Sun
  const SCHEDULE: Record<string, (null | "open" | "mid" | "close")[]> = {
    "Ploy Suwannarat": ["open", "open", null, "open", "open", "mid", null],
    "Ohm Techawong": ["mid", "mid", "mid", null, "mid", null, "mid"],
    "Gap Wattana": ["open", null, "open", "open", null, "open", "mid"],
    "Mai Srisuk": [null, "mid", null, "mid", null, "mid", "open"],
    "Nick Anderson": ["mid", "mid", "mid", "mid", "mid", null, null],
    "Fah Chaiyaporn": ["open", "open", null, "open", null, "open", "open"],
    "Nan Phetcharat": [null, "close", "close", null, "close", "close", null],
    "Beam Kittisak": ["open", "open", "open", "open", "open", null, null],
  };
  const monday = startOfWeek(new Date());
  const shiftRows: any[] = [];
  for (const [name, week] of Object.entries(SCHEDULE)) {
    const emp = empByName[name];
    week.forEach((type, i) => {
      if (!type) return;
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      shiftRows.push({
        org_id: org.id,
        employee_id: emp.id,
        branch_id: emp.branch_id,
        shift_date: d.toISOString().slice(0, 10),
        shift_type: type,
      });
    });
  }
  const { error: shiftErr } = await supabase.from("shifts").insert(shiftRows);
  if (shiftErr) throw shiftErr;
  console.log("✓ shifts", shiftRows.length);

  // 6. Activity log
  const activity = [
    { who: "Ploy Suwannarat", kind: "sale", msg: "closed sale #4821 — ฿1,240", minsAgo: 5 },
    { who: "Beam Kittisak", kind: "ops", msg: "started delivery route — 3 stops", minsAgo: 9 },
    { who: "Ohm Techawong", kind: "stock", msg: "restocked Blue Dream flower — +40 units", minsAgo: 12 },
    { who: "Nick Anderson", kind: "alert", msg: "approved refund on order #4790 — ฿350", minsAgo: 27 },
    { who: "Nan Phetcharat", kind: "sale", msg: "closed sale #4818 — ฿860", minsAgo: 38 },
    { who: "Ploy Suwannarat", kind: "ops", msg: "clocked in for opening shift", minsAgo: 51 },
    { who: "Gap Wattana", kind: "ops", msg: "completed cash drawer count — balanced", minsAgo: 65 },
    { who: "Ohm Techawong", kind: "alert", msg: "flagged low stock — Pineapple Express pre-rolls", minsAgo: 78 },
  ];
  const { error: actErr } = await supabase.from("activity_log").insert(
    activity.map((a) => {
      const emp = empByName[a.who];
      return {
        org_id: org.id,
        employee_id: emp.id,
        branch_id: emp.branch_id,
        kind: a.kind,
        message: a.msg,
        occurred_at: new Date(Date.now() - a.minsAgo * 60000).toISOString(),
      };
    })
  );
  if (actErr) throw actErr;
  console.log("✓ activity log");

  // 7. Alerts
  const { error: alertErr } = await supabase.from("alerts").insert([
    { org_id: org.id, branch_id: sathorn.id, severity: "critical", title: "Low stock — Pineapple Express pre-rolls", sub: "Sathorn · 6 units left · reorder threshold 20" },
    { org_id: org.id, branch_id: sukhumvit.id, severity: "warning", title: "Sukhumvit 22 short-staffed Wed closing shift", sub: "Only 1 of 2 required staff scheduled" },
    { org_id: org.id, branch_id: null, severity: "warning", title: "Supplier invoice due in 3 days", sub: "Green Valley Farms — ฿184,000" },
  ]);
  if (alertErr) throw alertErr;
  console.log("✓ alerts");

  // 8. Sales — last 14 days, per branch
  const sales14 = [
    [18200, 14100], [19800, 15300], [17600, 13900], [21200, 16800],
    [24500, 19200], [27800, 22100], [26100, 20800], [18900, 14600],
    [20100, 15900], [19400, 16400], [22300, 17700], [25600, 20300],
    [28900, 23400], [16200, 12100],
  ];
  const today = new Date();
  const salesRows: any[] = [];
  sales14.forEach(([s, k], i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (sales14.length - 1 - i));
    const date = d.toISOString().slice(0, 10);
    salesRows.push({ org_id: org.id, branch_id: sathorn.id, sale_date: date, revenue: s });
    salesRows.push({ org_id: org.id, branch_id: sukhumvit.id, sale_date: date, revenue: k });
  });
  const { error: salesErr } = await supabase.from("sales_daily").insert(salesRows);
  if (salesErr) throw salesErr;
  console.log("✓ sales_daily", salesRows.length);

  // 9. Monthly finance — 6 months
  const months = [
    ["Mar", 642000, 451000], ["Apr", 678000, 468000], ["May", 715000, 492000],
    ["Jun", 693000, 501000], ["Jul", 759000, 512000], ["Aug", 788000, 529000],
  ];
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const financeRows = months.map(([, rev, exp], i) => {
    const d = new Date(thisMonth);
    d.setMonth(d.getMonth() - (months.length - 1 - i));
    return { org_id: org.id, month: d.toISOString().slice(0, 10), revenue: rev as number, expenses: exp as number };
  });
  const { error: finErr } = await supabase.from("monthly_finance").insert(financeRows);
  if (finErr) throw finErr;
  console.log("✓ monthly_finance");

  // 10. Expenses (this month)
  const { error: expErr } = await supabase.from("expenses").insert(
    [
      ["Payroll", 214000],
      ["Inventory (COGS)", 186000],
      ["Rent", 78000],
      ["Utilities", 24000],
      ["Marketing", 17000],
    ].map(([category, amount]) => ({
      org_id: org.id,
      period_month: thisMonth.toISOString().slice(0, 10),
      category,
      amount,
    }))
  );
  if (expErr) throw expErr;
  console.log("✓ expenses");

  // 11. Products + this month's sales
  const productDefs = [
    { name: "Blue Dream (Flower, 3.5g)", category: "Flower", units: 312, revenue: 112320 },
    { name: "Mango Gummies 10-pack", category: "Edibles", units: 268, revenue: 80400 },
    { name: "Pineapple Express Pre-roll", category: "Pre-roll", units: 401, revenue: 72180 },
    { name: "Live Resin Cart — OG Kush", category: "Vape", units: 96, revenue: 67200 },
    { name: "Rolling kit + grinder combo", category: "Accessory", units: 140, revenue: 39200 },
  ];
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .insert(productDefs.map((p) => ({ org_id: org.id, name: p.name, category: p.category })))
    .select();
  if (prodErr) throw prodErr;
  const { error: psErr } = await supabase.from("product_sales").insert(
    products.map((p, i) => ({
      org_id: org.id,
      product_id: p.id,
      period_month: thisMonth.toISOString().slice(0, 10),
      units: productDefs[i].units,
      revenue: productDefs[i].revenue,
    }))
  );
  if (psErr) throw psErr;
  console.log("✓ products & product_sales");

  // 12. Projects
  const projectDefs = [
    { title: "Sukhumvit 22 renovation — phase 2 (display wall)", branch: sukhumvit, assignee: "Nick Anderson", due: 5, priority: "high", status: "inprogress" },
    { title: "New POS terminal rollout", branch: null, assignee: "Gap Wattana", due: 12, priority: "med", status: "todo" },
    { title: "Staff compliance training — Q3 refresher", branch: null, assignee: "Ohm Techawong", due: 2, priority: "high", status: "inprogress" },
    { title: "Pre-roll line packaging redesign", branch: null, assignee: "Nan Phetcharat", due: 19, priority: "low", status: "todo" },
    { title: "Loyalty program launch", branch: null, assignee: "Nick Anderson", due: 27, priority: "med", status: "todo" },
    { title: "Sathorn stockroom reorganisation", branch: sathorn, assignee: "Ohm Techawong", due: 1, priority: "med", status: "review" },
    { title: "Menu board redesign — both branches", branch: null, assignee: "Ploy Suwannarat", due: -2, priority: "low", status: "done" },
    { title: "Flower vendor contract renewal", branch: null, assignee: "Gap Wattana", due: 9, priority: "high", status: "review" },
    { title: "Delivery zone expansion — Thonglor/Ekkamai", branch: sukhumvit, assignee: "Beam Kittisak", due: 22, priority: "med", status: "todo" },
  ];
  const { error: projErr } = await supabase.from("projects").insert(
    projectDefs.map((p) => {
      const d = new Date(today);
      d.setDate(d.getDate() + p.due);
      return {
        org_id: org.id,
        title: p.title,
        branch_id: p.branch?.id ?? null,
        assignee_employee_id: empByName[p.assignee].id,
        due_date: d.toISOString().slice(0, 10),
        priority: p.priority,
        status: p.status,
      };
    })
  );
  if (projErr) throw projErr;
  console.log("✓ projects");

  console.log("\nDone. Sign in at /login with:");
  console.log(`  email:    ${OWNER_EMAIL}`);
  console.log(`  password: ${OWNER_PASSWORD}`);
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

main().catch((err) => {
  console.error("Seed failed:", err.message || err);
  process.exit(1);
});
