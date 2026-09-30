import { listMyMaintenanceJobs } from "@/app/clock/maintenance-actions";
import { MaintenanceJobRow } from "./MaintenanceJobRow";

/**
 * Maintenance-team-only card on the clock screen: every approved job across
 * the org that isn't marked done yet, oldest first, each with a "Mark done"
 * photo upload. Shown instead of the Exchange rates card — maintenance
 * staff don't handle foreign cash.
 */
export async function MaintenanceJobs() {
  const result = await listMyMaintenanceJobs();
  const jobs = Array.isArray(result) ? result : [];
  const loadError = Array.isArray(result) ? null : result.error;

  return (
    <div className="card">
      <h2 className="font-display text-[15px] font-semibold mb-3">Maintenance jobs</h2>

      {loadError && (
        <div
          className="rounded-[9px] px-3 py-2.5 text-[13px] font-medium mb-3"
          style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
        >
          {loadError}
        </div>
      )}

      {jobs.length === 0 ? (
        <p className="text-[13px] text-inkMuted m-0">Nothing waiting on you right now.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
            <MaintenanceJobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
