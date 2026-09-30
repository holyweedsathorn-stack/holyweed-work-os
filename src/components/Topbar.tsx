import { BranchSwitcher } from "./BranchSwitcher";
import { Clock } from "./Clock";

export function Topbar({
  title,
  sub,
  branch,
}: {
  title: string;
  sub: string;
  branch: string;
}) {
  return (
    <div
      className="flex items-start md:items-center justify-between gap-2 md:gap-4 px-4 md:px-7 py-3 md:py-4 flex-col md:flex-row flex-none"
      style={{ borderBottom: "1px solid var(--line)" }}
    >
      <div className="min-w-0">
        <h2 className="font-display font-semibold text-[19px] md:text-[21px]">{title}</h2>
        <p className="text-[12.5px] text-inkMuted mt-0.5">{sub}</p>
      </div>
      <div className="flex items-center gap-2 md:gap-3 no-print w-full md:w-auto overflow-x-auto">
        <BranchSwitcher current={branch} />
        <Clock />
      </div>
    </div>
  );
}
