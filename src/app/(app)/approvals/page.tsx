import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManager } from "@/lib/guard";
import { Topbar } from "@/components/Topbar";
import { PulseBar } from "@/components/PulseBar";
import { ApprovalQueue } from "@/components/ApprovalQueue";
import {
  APPROVAL_KIND_LABEL,
  fmtTHB,
  fmtTimeBKK,
  type Approval,
  type Branch,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const sp = await searchParams;
  const branch = sp.branch || "all";
  const supabase = await createClient();

  const select = "*, requester:employees(full_name, role_title)";

  const [{ data: branches }, { data: pending }, { data: decided }] = await Promise.all([
    supabase.from("branches").select("*").returns<Branch[]>(),
    supabase
      .from("approvals")
      .select(select)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .returns<Approval[]>(),
    supabase
      .from("approvals")
      .select(select)
      .in("status", ["approved", "denied"])
      .order("decided_at", { ascending: false })
      .limit(12)
      .returns<Approval[]>(),
  ]);

  const branchById = Object.fromEntries((branches ?? []).map((b) => [b.id, b]));
  const inBranch = (bid: string | null) =>
    branch === "all" || !bid || branchById[bid]?.slug === branch;

  const queue = (pending ?? []).filter((a) => inBranch(a.branch_id));
  const history = (decided ?? []).filter((a) => inBranch(a.branch_id));

  // Signed URLs for any completed-maintenance photos, and for whatever
  // photo the requester attached up front (a receipt, a screenshot) —
  // these are two different things on the same row, so two maps. Uses the
  // admin client (both buckets are private), gated on requireManager() in
  // code — this page is already manager-only via the (app) layout, but the
  // admin client's own convention is to prove the role again at the call
  // site.
  const photoGuard = await requireManager("approvals.viewCompletionPhotos");
  const photoUrlById = new Map<string, string>();
  const requestPhotoUrlById = new Map<string, string>();
  if (photoGuard.ok) {
    const admin = createAdminClient();
    const withPhotos = history.filter((a) => a.completion_photo_path);
    const allWithRequestPhotos = [...queue, ...history].filter((a) => a.request_photo_path);
    await Promise.all([
      ...withPhotos.map(async (a) => {
        const { data: signed } = await admin.storage
          .from("maintenance-photos")
          .createSignedUrl(a.completion_photo_path as string, 60 * 10);
        if (signed?.signedUrl) photoUrlById.set(a.id, signed.signedUrl);
      }),
      ...allWithRequestPhotos.map(async (a) => {
        const { data: signed } = await admin.storage
          .from("approval-photos")
          .createSignedUrl(a.request_photo_path as string, 60 * 10);
        if (signed?.signedUrl) requestPhotoUrlById.set(a.id, signed.signedUrl);
      }),
    ]);
  }

  const sub =
    queue.length === 0
      ? "Nothing waiting on you"
      : queue.length === 1
        ? "One thing is waiting on you"
        : `${queue.length} things are waiting on you`;

  return (
    <>
      <Topbar title="Approvals" sub={sub} branch={branch} />
      <PulseBar />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16">
        <ApprovalQueue pending={queue} branches={branches ?? []} photoUrlById={requestPhotoUrlById} />

        {history.length > 0 && (
          <div className="mt-7">
            <div className="text-[11px] font-bold uppercase tracking-wider text-inkMuted mb-2.5">
              Recently decided
            </div>
            <div className="flex flex-col gap-1.5">
              {history.map((a) => {
                const ok = a.status === "approved";
                const photoUrl = photoUrlById.get(a.id);
                return (
                  <div
                    key={a.id}
                    className="flex flex-col gap-1.5 px-3.5 py-2.5 rounded-[9px]"
                    style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="chip flex-none"
                        style={{
                          background: ok ? "var(--accent-soft)" : "var(--critical-soft)",
                          color: ok ? "var(--accent)" : "var(--critical)",
                        }}
                      >
                        {ok ? "Approved" : "Denied"}
                      </span>
                      <span className="text-[13.5px] min-w-0 flex-1 truncate">
                        <b className="font-semibold">{a.requester?.full_name ?? "Unknown"}</b>
                        {" · "}
                        {APPROVAL_KIND_LABEL[a.kind].toLowerCase()} — {a.title}
                        {a.amount != null && <span className="num"> {fmtTHB(a.amount)}</span>}
                        {a.decision_note && (
                          <i className="text-inkSecondary"> — “{a.decision_note}”</i>
                        )}
                      </span>
                      {requestPhotoUrlById.get(a.id) && (
                        <a
                          href={requestPhotoUrlById.get(a.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold flex-none text-[12px]"
                          style={{ color: "var(--accent)" }}
                        >
                          Photo
                        </a>
                      )}
                      <span className="num text-[12px] text-inkMuted flex-none">
                        {a.decided_at ? fmtTimeBKK(a.decided_at) : ""}
                      </span>
                    </div>

                    {a.kind === "maintenance" && ok && (
                      <div className="flex items-center gap-2 pl-[calc(1px)] text-[12px]">
                        {a.completed_at ? (
                          <>
                            <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                              Done
                            </span>
                            <span className="text-inkMuted">
                              {a.completed_by_name} · {fmtTimeBKK(a.completed_at)}
                              {a.completion_note && <> — “{a.completion_note}”</>}
                            </span>
                            {photoUrl && (
                              <a
                                href={photoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold flex-none"
                                style={{ color: "var(--accent)" }}
                              >
                                View photo
                              </a>
                            )}
                          </>
                        ) : (
                          <span className="chip" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>
                            Waiting on maintenance
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
