import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { SalesImporter } from "@/components/SalesImporter";
import { fmtDateBKK, type Branch } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  daily: "Sales by Date",
  product: "Sales by Product",
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const supabase = await createClient();

  const [{ data: branches }, { data: imports }] = await Promise.all([
    supabase.from("branches").select("*").returns<Branch[]>(),
    supabase
      .from("sales_imports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const branchById = Object.fromEntries((branches ?? []).map((b) => [b.id, b]));

  return (
    <>
      <Topbar title="Import sales" sub="From Silom POS exports" branch={branch} />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <div className="grid gap-3.5 items-start grid-cols-1 lg:grid-cols-[2fr_1fr]">
          <SalesImporter branches={branches ?? []} />

          <div className="card">
            <h3 className="font-display text-[15px] font-semibold mb-3">Recent imports</h3>
            {!imports || imports.length === 0 ? (
              <p className="text-[13px] text-inkMuted">Nothing imported yet.</p>
            ) : (
              <div className="flex flex-col">
                {imports.map((im: any) => (
                  <div key={im.id} className="py-2.5" style={{ borderTop: "1px solid var(--line)" }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[12.8px] font-semibold">
                        {KIND_LABEL[im.kind] ?? im.kind}
                      </span>
                      <span
                        className="chip"
                        style={{
                          background: `var(--${branchById[im.branch_id]?.slug}-soft)`,
                          color: `var(--${branchById[im.branch_id]?.slug})`,
                        }}
                      >
                        {branchById[im.branch_id]?.name ?? "—"}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-inkMuted mt-1">
                      {im.row_count} rows
                      {im.period_start && im.period_end
                        ? ` · ${im.period_start} → ${im.period_end}`
                        : ""}
                    </div>
                    <div className="text-[11.5px] text-inkMuted">
                      Uploaded {fmtDateBKK(im.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card mt-3.5">
          <h3 className="font-display text-[15px] font-semibold mb-2">How this works</h3>
          <ul className="text-[13px] text-inkSecondary flex flex-col gap-1.5 list-disc pl-5">
            <li>
              <b>Sales by Date</b> fills the revenue, cost and profit figures on the Shop dashboard
              and Overview.
            </li>
            <li>
              <b>Sales by Product</b> fills the Top products panel.
            </li>
            <li>
              Your two branches are separate Silom accounts, so export and upload each one
              separately. The app reads the shop name from the file and pre-selects the branch.
            </li>
            <li>
              Re-uploading the same dates is safe — figures are replaced, not added twice.
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
