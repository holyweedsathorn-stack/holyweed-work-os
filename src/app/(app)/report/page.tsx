import { Topbar } from "@/components/Topbar";
import { KpiCard } from "@/components/KpiCard";
import { MonthPicker } from "@/components/MonthPicker";
import { PayrollEditor } from "@/components/PayrollEditor";
import { MonthNote } from "@/components/MonthNote";
import { FixedCostsEditor } from "@/components/FixedCostsEditor";
import { fmtTHB, bangkokMonth } from "@/lib/types";
import { recentMonths } from "@/lib/report";
import { loadMonthReport } from "@/lib/report-load";

export const dynamic = "force-dynamic";

const MONTH = /^\d{4}-\d{2}$/;

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branch?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month && MONTH.test(sp.month) ? sp.month : bangkokMonth();
  const { report, branches, carriedFrom, noteBody } = await loadMonthReport(month);

  const cols = [...report.branches, null]; // null = the Combined column
  const th = "text-right py-2 px-2.5 font-semibold";
  const td = "text-right py-2 px-2.5 num";
  const rowLine = { borderTop: "1px solid var(--line)" };

  const metric = (
    label: string,
    pick: (t: (typeof report.branches)[number] | typeof report.combined) => number,
    opts: { negative?: boolean; strong?: boolean; money?: boolean } = {}
  ) => (
    <tr key={label} style={rowLine} className={opts.strong ? "font-semibold" : undefined}>
      <td className="py-2 px-2.5 text-[13px]">{label}</td>
      {cols.map((c, i) => {
        const v = pick(c ?? report.combined);
        return (
          <td
            key={i}
            className={`${td} text-[13px]`}
            style={c === null ? { background: "var(--surface-2)" } : undefined}
          >
            {opts.money === false
              ? Math.round(v).toLocaleString("en-US")
              : (opts.negative && v ? "−" : "") + fmtTHB(Math.abs(v))}
          </td>
        );
      })}
    </tr>
  );

  return (
    <>
      <Topbar
        title="Monthly report"
        sub={`${report.monthLabel} · all branches`}
        branch={sp.branch || "all"}
      />
      <div className="flex-1 overflow-y-auto px-4 md:px-7 py-6 pb-16 print-page">
        <MonthPicker month={month} options={recentMonths()} />

        <h1 className="font-display text-[20px] font-semibold print-only mb-1">
          Holyweed Group — {report.monthLabel} monthly report
        </h1>

        <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Net revenue" value={fmtTHB(report.combined.netRevenue)} />
          <KpiCard label="Gross profit (POS)" value={fmtTHB(report.combined.grossProfit)} />
          <KpiCard label="Operating expenses" value={fmtTHB(report.operatingTotal)} />
          <KpiCard
            label="Net profit"
            value={fmtTHB(report.netProfit)}
            delta={{
              dir: report.netProfit >= 0 ? "up" : "down",
              text: report.combined.netRevenue
                ? `${((report.netProfit / report.combined.netRevenue) * 100).toFixed(1)}% of revenue`
                : "no sales recorded",
            }}
          />
        </div>

        {report.gaps.length > 0 && (
          <div
            className="mt-3.5 rounded-[9px] px-3.5 py-2.5 text-[12.5px]"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            <b>Missing sales days.</b>{" "}
            {report.gaps
              .map((g) => `${g.name} has ${g.missing} day${g.missing === 1 ? "" : "s"} with no data`)
              .join("; ")}
            . Everything below is understated until those days are imported.
          </div>
        )}

        {/* ------------------------------------------------ sales ------- */}
        <h3 className="font-display text-[15px] font-semibold mt-7 mb-2.5">
          Revenue &amp; gross profit (from the POS)
        </h3>
        <div className="card p-0 overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-[11.5px] uppercase tracking-wide text-inkMuted">
                <th className="text-left py-2.5 px-2.5 font-semibold">&nbsp;</th>
                {cols.map((c, i) => (
                  <th
                    key={i}
                    className={th}
                    style={c === null ? { background: "var(--surface-2)" } : undefined}
                  >
                    {c ? c.name : "Combined"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metric("Gross sales (sub total)", (t) => t.grossSales)}
              {metric("Less: discounts", (t) => t.discount, { negative: true })}
              {metric("Net revenue (grand total)", (t) => t.netRevenue, { strong: true })}
              {metric("Less: cost of goods sold", (t) => t.cogs, { negative: true })}
              {metric("Gross profit", (t) => t.grossProfit, { strong: true })}
              {metric("Bills", (t) => t.bills, { money: false })}
              {metric("Days with sales recorded", (t) => t.daysWithSales, { money: false })}
              {metric("Cash", (t) => t.cash)}
              {metric("Card / PromptPay / delivery (bank)", (t) => t.electronic)}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-inkMuted mt-2">
          Gross profit is the figure Silom reports. It has never reconciled exactly to revenue
          minus cost — worth confirming with Silom or your accountant what it includes.
        </p>

        {/* --------------------------------------------- payroll -------- */}
        <h3 className="font-display text-[15px] font-semibold mt-7 mb-2.5">
          Salary &amp; incentives earned
        </h3>
        <div className="card">
          <PayrollEditor
            month={month}
            monthLabel={report.monthLabel}
            lines={report.payroll}
            carriedFrom={carriedFrom}
          />
        </div>

        {/* ------------------------------------------ shop expenses ----- */}
        <h3 className="font-display text-[15px] font-semibold mt-7 mb-2.5">
          Shop expenses (from the branch ledgers)
        </h3>
        <div className="card p-0">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-[11.5px] uppercase tracking-wide text-inkMuted">
                <th className="text-left py-2.5 px-2.5 font-semibold">Branch</th>
                <th className="text-left py-2.5 px-2.5 font-semibold">Category</th>
                <th className={th}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.shopExpenses.map((l) => (
                <tr key={`${l.branchName}|${l.category}`} style={rowLine}>
                  <td className="py-2 px-2.5 text-[13px]">{l.branchName}</td>
                  <td className="py-2 px-2.5 text-[13px]">{l.label}</td>
                  <td className={`${td} text-[13px]`}>{fmtTHB(l.amount)}</td>
                </tr>
              ))}
              {report.shopExpenses.length === 0 && (
                <tr style={rowLine}>
                  <td className="py-2.5 px-2.5 text-[13px] text-inkMuted" colSpan={3}>
                    No expenses imported for {report.monthLabel} yet — upload the branch sheets on
                    the Import page.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--line-strong)" }} className="font-semibold">
                <td className="py-2.5 px-2.5 text-[13px]" colSpan={2}>
                  Total shop expenses
                </td>
                <td className={`${td} text-[13px]`}>{fmtTHB(report.shopExpensesTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ------------------------------------------ rent & bills ------ */}
        <h3 className="font-display text-[15px] font-semibold mt-7 mb-2.5">Rent &amp; utilities</h3>
        <div className="card">
          <FixedCostsEditor
            month={month}
            monthLabel={report.monthLabel}
            branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
            lines={report.fixedCosts}
            bistroLines={report.bistroCostsLines}
          />
        </div>

        {/* --------------------------------------------- advances ------- */}
        <h3 className="font-display text-[15px] font-semibold mt-7 mb-2.5">
          Salary advances already paid from petty cash
        </h3>
        <div className="card p-0">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {report.advances.map((l) => (
                <tr key={l.branchName} style={rowLine}>
                  <td className="py-2 px-2.5 text-[13px]">{l.branchName}</td>
                  <td className={`${td} text-[13px]`}>{fmtTHB(l.amount)}</td>
                </tr>
              ))}
              {report.advances.length === 0 && (
                <tr>
                  <td className="py-2.5 px-2.5 text-[13px] text-inkMuted" colSpan={2}>
                    None recorded this month.
                  </td>
                </tr>
              )}
              <tr style={{ borderTop: "2px solid var(--line-strong)" }} className="font-semibold">
                <td className="py-2.5 px-2.5 text-[13px]">Still to pay at month end</td>
                <td className={`${td} text-[13px]`}>{fmtTHB(report.remainingPayable)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-inkMuted mt-2">
          Advances are not an extra cost — they are part of the salary above, handed over early, so
          they are left out of the totals below to avoid charging the same wage twice.
        </p>

        {/* ------------------------------------------- net profit ------- */}
        <h3 className="font-display text-[15px] font-semibold mt-7 mb-2.5">Net profit</h3>
        <div className="card">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td className="py-2 text-[13px]">Combined gross profit (POS)</td>
                <td className={`${td} text-[13px]`}>{fmtTHB(report.combined.grossProfit)}</td>
              </tr>
              <tr style={rowLine}>
                <td className="py-2 text-[13px]">Less: salary &amp; incentives earned</td>
                <td className={`${td} text-[13px]`}>−{fmtTHB(report.payrollTotal)}</td>
              </tr>
              <tr style={rowLine}>
                <td className="py-2 text-[13px]">Less: shop expenses</td>
                <td className={`${td} text-[13px]`}>−{fmtTHB(report.shopExpensesTotal)}</td>
              </tr>
              <tr style={rowLine}>
                <td className="py-2 text-[13px]">
                  Less: rent &amp; utilities
                  {(() => {
                    const parts = [
                      ...(report.fixedCostsByBranch.length > 1 || report.bistroCostsTotal
                        ? report.fixedCostsByBranch
                            .filter((f) => f.total)
                            .map((f) => `${f.branchName} ${fmtTHB(f.total)}`)
                        : []),
                      ...(report.bistroCostsTotal
                        ? [
                            `Holy Bistro rent ${fmtTHB(report.bistroCosts.rent)}, electricity ${fmtTHB(
                              report.bistroCosts.electricity
                            )}`,
                          ]
                        : []),
                    ];
                    return parts.length ? <span className="text-inkMuted"> ({parts.join("; ")})</span> : null;
                  })()}
                </td>
                <td className={`${td} text-[13px]`}>
                  −{fmtTHB(report.fixedCostsTotal + report.bistroCostsTotal)}
                </td>
              </tr>
              <tr style={{ borderTop: "2px solid var(--line-strong)" }}>
                <td className="py-3 text-[15px] font-display font-semibold">
                  Net profit — {report.monthLabel}
                </td>
                <td
                  className="text-right py-3 num text-[20px] font-semibold"
                  style={{ color: report.netProfit >= 0 ? "var(--good)" : "var(--critical)" }}
                >
                  {fmtTHB(report.netProfit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ------------------------------------------------ cash & bank -- */}
        <h3 className="font-display text-[15px] font-semibold mt-7 mb-2.5">
          Cash &amp; bank — what to deposit
        </h3>
        <div className="card">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td className="py-2 text-[13px] font-semibold" colSpan={2}>
                  Cash (physical, sitting in the shop)
                </td>
              </tr>
              <tr style={rowLine}>
                <td className="py-2 text-[13px]">Cash collected at the till</td>
                <td className={`${td} text-[13px]`}>{fmtTHB(report.cashBank.cashCollected)}</td>
              </tr>
              <tr style={rowLine}>
                <td className="py-2 text-[13px]">Less: shop expenses paid from cash</td>
                <td className={`${td} text-[13px]`}>−{fmtTHB(report.shopExpensesTotal)}</td>
              </tr>
              <tr style={rowLine}>
                <td className="py-2 text-[13px]">Less: salary &amp; incentives paid from cash</td>
                <td className={`${td} text-[13px]`}>−{fmtTHB(report.payrollTotal)}</td>
              </tr>
              <tr style={{ borderTop: "2px solid var(--line-strong)" }}>
                <td className="py-3 text-[15px] font-display font-semibold">
                  Cash left over — ready to deposit
                </td>
                <td
                  className="text-right py-3 num text-[20px] font-semibold"
                  style={{ color: report.cashBank.cashToDeposit >= 0 ? "var(--good)" : "var(--critical)" }}
                >
                  {fmtTHB(report.cashBank.cashToDeposit)}
                </td>
              </tr>

              <tr>
                <td className="py-2 pt-6 text-[13px] font-semibold" colSpan={2}>
                  Bank (card, PromptPay, delivery-app sales)
                </td>
              </tr>
              <tr style={rowLine}>
                <td className="py-2 text-[13px]">Electronic sales settled to the bank</td>
                <td className={`${td} text-[13px]`}>{fmtTHB(report.cashBank.electronicCollected)}</td>
              </tr>
              <tr style={rowLine}>
                <td className="py-2 text-[13px]">Less: rent &amp; utilities paid from the bank</td>
                <td className={`${td} text-[13px]`}>−{fmtTHB(report.cashBank.bankPaidOut)}</td>
              </tr>
              <tr style={{ borderTop: "2px solid var(--line-strong)" }}>
                <td className="py-3 text-[15px] font-display font-semibold">
                  Bank balance movement this month
                </td>
                <td
                  className="text-right py-3 num text-[20px] font-semibold"
                  style={{ color: report.cashBank.bankNetThisMonth >= 0 ? "var(--good)" : "var(--critical)" }}
                >
                  {fmtTHB(report.cashBank.bankNetThisMonth)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {report.cashBank.daysMissingBreakdown > 0 && (
          <p
            className="mt-2 rounded-[9px] px-3.5 py-2.5 text-[12.5px]"
            style={{ background: "var(--critical-soft)", color: "var(--critical)" }}
          >
            {report.cashBank.daysMissingBreakdown} of {report.cashBank.totalDays} sales day
            {report.cashBank.totalDays === 1 ? "" : "s"} this month {report.cashBank.daysMissingBreakdown === 1 ? "was" : "were"}{" "}
            imported before cash/card/PromptPay/delivery were tracked separately, so the figures
            above are understated. Re-import this month&apos;s Sales by Date report from Silom for
            both branches to fill it in.
          </p>
        )}
        {report.cashBank.daysMissingBreakdown === 0 && (
          <p className="text-[11.5px] text-inkMuted mt-2">
            &ldquo;Cash left over&rdquo; is what should physically be in the shop right now, ready
            to bank. &ldquo;Bank balance movement&rdquo; is electronic sales less bills paid
            straight from the company account — it does not include cash you deposit by hand.
          </p>
        )}

        {/* ------------------------------------------------- note ------- */}
        <h3 className="font-display text-[15px] font-semibold mt-7 mb-2.5">Notes for this month</h3>
        <div className="card">
          <MonthNote month={month} initial={noteBody} />
        </div>
      </div>
    </>
  );
}
