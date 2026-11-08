import { fmtTHB } from "@/lib/types";
import { FIXED_COST_CATEGORIES, FIXED_COST_LABEL, BISTRO_COST_CATEGORIES, type MonthReport } from "@/lib/report";

/**
 * The Monthly report as one printable document -- what "Save PDF" puts in the file (rendered by
 * /report-document, printed by /api/report-pdf?layout=document). Same figures as /report, but every
 * section is a plain table: the salary and rent editors and the notes box come out as text, so the
 * PDF carries the whole month on its own -- who earned what, which costs carried over, Holy Bistro's
 * bills, the full notes. Laid out after the September 2026 report the owner keeps as the reference.
 */
export function ReportDocument({
  report,
  carriedFrom,
  noteBody,
  generated,
}: {
  report: MonthReport;
  carriedFrom: string | null;
  noteBody: string;
  /** When the PDF was made, already formatted (Bangkok time). */
  generated: string;
}) {
  const cols = [...report.branches, null]; // null = Combined
  const neg = (v: number) => (v ? "−" : "") + fmtTHB(Math.abs(v));
  const pct = report.combined.netRevenue ? ((report.netProfit / report.combined.netRevenue) * 100).toFixed(1) : null;
  const fixedFor = (branchId: string, c: string) => report.fixedCosts.find((f) => f.branchId === branchId && f.category === c);
  const bistroFor = (c: string) => report.bistroCostsLines.find((l) => l.category === c);
  const fixedBranches = report.fixedCostsByBranch;
  const showBistro = report.bistroCostsLines.length > 0;

  return (
    <main className="report-doc">
      <style>{DOC_CSS}</style>

      <header className="doc-head">
        <div className="doc-kicker">Monthly report</div>
        <div className="doc-sub">{report.monthLabel} · all branches</div>
      </header>
      <h1>Holyweed Group — {report.monthLabel} monthly report</h1>

      <section className="kpis">
        <Kpi label="Net revenue" value={fmtTHB(report.combined.netRevenue)} />
        <Kpi label="Gross profit (POS)" value={fmtTHB(report.combined.grossProfit)} />
        <Kpi label="Operating expenses" value={fmtTHB(report.operatingTotal)} />
        <Kpi
          label="Net profit"
          value={fmtTHB(report.netProfit)}
          note={pct ? `${report.netProfit >= 0 ? "▲" : "▼"} ${pct}% of revenue` : "no sales recorded"}
          bad={report.netProfit < 0}
        />
      </section>

      {report.gaps.length > 0 && (
        <p className="warn">
          <b>Missing sales days.</b>{" "}
          {report.gaps.map((g) => `${g.name} has ${g.missing} day${g.missing === 1 ? "" : "s"} with no data`).join("; ")}.
          Everything below is understated until those days are imported.
        </p>
      )}

      {/* ---- Revenue & gross profit ---- */}
      <h2>Revenue &amp; gross profit (from the POS)</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th />
              {cols.map((c, i) => (
                <th key={i} className="r">{c ? c.name : "Combined"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Gross sales (sub total)", (t) => fmtTHB(t.grossSales)],
                ["Less: discounts", (t) => neg(t.discount)],
                ["Net revenue (grand total)", (t) => fmtTHB(t.netRevenue), true],
                ["Less: cost of goods sold", (t) => neg(t.cogs)],
                ["Gross profit", (t) => fmtTHB(t.grossProfit), true],
                ["Bills", (t) => Math.round(t.bills).toLocaleString("en-US")],
                ["Days with sales recorded", (t) => String(t.daysWithSales)],
                ["Cash", (t) => fmtTHB(t.cash)],
                ["Card / PromptPay / delivery (bank)", (t) => fmtTHB(t.electronic)],
              ] as [string, (t: typeof report.combined) => string, boolean?][]
            ).map(([label, pick, strong]) => (
              <tr key={label} className={strong ? "strong" : undefined}>
                <td>{label}</td>
                {cols.map((c, i) => (
                  <td key={i} className="r num">{pick(c ?? report.combined)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="foot">
        Gross profit is the figure Silom reports. It has never reconciled exactly to revenue minus cost — worth
        confirming with Silom or your accountant what it includes.
      </p>

      {/* ---- Salary & incentives ---- */}
      <h2>Salary &amp; incentives earned</h2>
      <div className="card">
        {carriedFrom && <p className="hint">No salaries saved for {report.monthLabel} yet: base salaries carried over from {carriedFrom}.</p>}
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th className="r">Base salary</th>
              <th className="r">Incentive</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {report.payroll.map((p) => (
              <tr key={p.employeeId}>
                <td>
                  <b>{p.name}</b> <span className="muted">· {p.branchName}</span>
                  {p.carried && <span className="muted small"> · carried over</span>}
                </td>
                <td className="r num">{fmtTHB(p.base)}</td>
                <td className="r num">{fmtTHB(p.incentive)}</td>
                <td className="r num"><b>{fmtTHB(p.total)}</b></td>
              </tr>
            ))}
            {report.payroll.length === 0 && (
              <tr><td colSpan={4} className="muted">No staff on the roster.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Total salary &amp; incentives earned</td>
              <td className="r num">{fmtTHB(report.payrollBase)}</td>
              <td className="r num">{fmtTHB(report.payrollIncentive)}</td>
              <td className="r num">{fmtTHB(report.payrollTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ---- Shop expenses ---- */}
      <h2>Shop expenses (from the branch ledgers)</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Branch</th>
              <th>Category</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {report.shopExpenses.map((l) => (
              <tr key={`${l.branchName}|${l.category}`}>
                <td>{l.branchName}</td>
                <td>{l.label}</td>
                <td className="r num">{fmtTHB(l.amount)}</td>
              </tr>
            ))}
            {report.shopExpenses.length === 0 && (
              <tr><td colSpan={3} className="muted">No expenses imported for {report.monthLabel} yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total shop expenses</td>
              <td className="r num">{fmtTHB(report.shopExpensesTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ---- Rent & utilities ---- */}
      <h2>Rent &amp; utilities</h2>
      <div className="card">
        <p className="hint">
          Only bills paid <b>outside</b> the branch petty-cash sheets belong here — the landlord transfer, the utility bill
          from the company account. Anything already written into a shop ledger is counted above, and typing it here too
          would charge it twice.
        </p>
        <table>
          <thead>
            <tr>
              <th />
              {fixedBranches.map((b) => (
                <th key={b.branchId} className="r">{b.branchName}</th>
              ))}
              {showBistro && <th className="r">Holy Bistro</th>}
              <th className="r">{fixedBranches.length + (showBistro ? 1 : 0) > 2 ? "Total" : "Both"}</th>
            </tr>
          </thead>
          <tbody>
            {FIXED_COST_CATEGORIES.map((c) => {
              const bistroOk = (BISTRO_COST_CATEGORIES as readonly string[]).includes(c);
              const b = bistroOk ? bistroFor(c) : undefined;
              const rowTotal =
                fixedBranches.reduce((s, br) => s + (fixedFor(br.branchId, c)?.amount ?? 0), 0) + (b?.amount ?? 0);
              const carried =
                fixedBranches.some((br) => fixedFor(br.branchId, c)?.carried && fixedFor(br.branchId, c)?.amount) ||
                (b?.carried && b?.amount);
              return (
                <tr key={c}>
                  <td>
                    {FIXED_COST_LABEL[c]}
                    {carried && <span className="muted small"> · carries over</span>}
                  </td>
                  {fixedBranches.map((br) => (
                    <td key={br.branchId} className="r num">{fmtTHB(fixedFor(br.branchId, c)?.amount ?? 0)}</td>
                  ))}
                  {showBistro && <td className="r num">{bistroOk ? fmtTHB(b?.amount ?? 0) : "—"}</td>}
                  <td className="r num"><b>{fmtTHB(rowTotal)}</b></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total rent &amp; utilities</td>
              {fixedBranches.map((br) => (
                <td key={br.branchId} className="r num">{fmtTHB(br.total)}</td>
              ))}
              {showBistro && <td className="r num">{fmtTHB(report.bistroCostsTotal)}</td>}
              <td className="r num">{fmtTHB(report.fixedCostsTotal + report.bistroCostsTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ---- Salary advances ---- */}
      <h2>Salary advances already paid from petty cash</h2>
      <div className="card">
        <table>
          <tbody>
            {report.advances.map((l) => (
              <tr key={l.branchName}>
                <td>{l.branchName}</td>
                <td className="r num">{fmtTHB(l.amount)}</td>
              </tr>
            ))}
            {report.advances.length === 0 && (
              <tr><td colSpan={2} className="muted">None recorded this month.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Still to pay at month end</td>
              <td className="r num">{fmtTHB(report.remainingPayable)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="foot">
        Advances are not an extra cost — they are part of the salary above, handed over early, so they are left out of
        the totals below to avoid charging the same wage twice.
      </p>

      {/* ---- Net profit ---- */}
      <h2>Net profit</h2>
      <div className="card">
        <table>
          <tbody>
            <tr><td>Combined gross profit (POS)</td><td className="r num">{fmtTHB(report.combined.grossProfit)}</td></tr>
            <tr><td>Less: salary &amp; incentives earned</td><td className="r num">−{fmtTHB(report.payrollTotal)}</td></tr>
            <tr><td>Less: shop expenses</td><td className="r num">−{fmtTHB(report.shopExpensesTotal)}</td></tr>
            <tr>
              <td>
                Less: rent &amp; utilities{" "}
                <span className="muted">
                  (
                  {[
                    ...fixedBranches.filter((f) => f.total).map((f) => `${f.branchName} ${fmtTHB(f.total)}`),
                    ...(report.bistroCostsTotal ? [`Holy Bistro ${fmtTHB(report.bistroCostsTotal)}`] : []),
                  ].join(", ")}
                  )
                </span>
              </td>
              <td className="r num">−{fmtTHB(report.fixedCostsTotal + report.bistroCostsTotal)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="big">
              <td>Net profit — {report.monthLabel}</td>
              <td className={`r num ${report.netProfit >= 0 ? "good" : "bad"}`}>{fmtTHB(report.netProfit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ---- Cash & bank ---- */}
      <h2>Cash &amp; bank — what to deposit</h2>
      <div className="card">
        <table>
          <tbody>
            <tr><td colSpan={2}><b>Cash (physical, sitting in the shop)</b></td></tr>
            <tr><td>Cash collected at the till</td><td className="r num">{fmtTHB(report.cashBank.cashCollected)}</td></tr>
            <tr><td>Less: shop expenses paid from cash</td><td className="r num">−{fmtTHB(report.shopExpensesTotal)}</td></tr>
            <tr><td>Less: salary &amp; incentives paid from cash</td><td className="r num">−{fmtTHB(report.payrollTotal)}</td></tr>
            <tr className="big sep">
              <td>Cash left over — ready to deposit</td>
              <td className={`r num ${report.cashBank.cashToDeposit >= 0 ? "good" : "bad"}`}>{fmtTHB(report.cashBank.cashToDeposit)}</td>
            </tr>
            <tr className="gap"><td colSpan={2}><b>Bank (card, PromptPay, delivery-app sales)</b></td></tr>
            <tr><td>Electronic sales settled to the bank</td><td className="r num">{fmtTHB(report.cashBank.electronicCollected)}</td></tr>
            <tr><td>Less: rent &amp; utilities paid from the bank</td><td className="r num">−{fmtTHB(report.cashBank.bankPaidOut)}</td></tr>
            <tr className="big sep">
              <td>Bank balance movement this month</td>
              <td className={`r num ${report.cashBank.bankNetThisMonth >= 0 ? "good" : "bad"}`}>{fmtTHB(report.cashBank.bankNetThisMonth)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {report.cashBank.daysMissingBreakdown > 0 ? (
        <p className="warn">
          {report.cashBank.daysMissingBreakdown} of {report.cashBank.totalDays} sales day
          {report.cashBank.totalDays === 1 ? "" : "s"} this month were imported before cash/card/PromptPay/delivery were
          tracked separately, so the figures above are understated.
        </p>
      ) : (
        <p className="foot">
          “Cash left over” is what should physically be in the shop right now, ready to bank. “Bank balance movement” is
          electronic sales less bills paid straight from the company account — it does not include cash you deposit by
          hand.
        </p>
      )}

      {/* ---- Notes ---- */}
      <h2>Notes for this month</h2>
      <div className="card notes">{noteBody.trim() ? noteBody : <span className="muted">No notes for this month.</span>}</div>

      <footer className="doc-foot">
        Holyweed Work OS · {report.monthLabel} monthly report · generated {generated} (Bangkok)
        {report.daysElapsed < report.daysInMonth && ` · month in progress: ${report.daysElapsed} of ${report.daysInMonth} days`}
      </footer>
    </main>
  );
}

function Kpi({ label, value, note, bad }: { label: string; value: string; note?: string; bad?: boolean }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{value}</div>
      {note && <div className={`kpi-note ${bad ? "bad" : "good"}`}>{note}</div>}
    </div>
  );
}

// A4 print styles for this page only (colours match the reference: teal for good figures).
const DOC_CSS = `
@page { size: A4; margin: 14mm 12mm 16mm; }
html, body { background: #fff !important; }
.report-doc { max-width: 186mm; margin: 0 auto; padding: 8mm 0; color: #1d1d1b; background: #fff; font-family: var(--font-public-sans), system-ui, sans-serif; font-size: 12.5px; line-height: 1.4; }
.report-doc .num { font-family: var(--font-plex-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
.report-doc .doc-head { border-bottom: 1px solid #d9d6cc; padding-bottom: 8px; margin-bottom: 10px; }
.report-doc .doc-kicker { font-family: var(--font-fraunces), Georgia, serif; font-size: 19px; font-weight: 600; }
.report-doc .doc-sub { color: #6f6d66; font-size: 12.5px; }
.report-doc h1 { font-family: var(--font-fraunces), Georgia, serif; font-size: 21px; font-weight: 600; margin: 0 0 12px; }
.report-doc h2 { font-family: var(--font-fraunces), Georgia, serif; font-size: 15px; font-weight: 600; margin: 22px 0 8px; break-after: avoid; }
.report-doc .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.report-doc .kpi { border: 1px solid #d9d6cc; border-radius: 10px; padding: 10px 12px; break-inside: avoid; }
.report-doc .kpi-label { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #6f6d66; }
.report-doc .kpi-value { font-size: 24px; font-weight: 600; margin-top: 6px; }
.report-doc .kpi-note { font-size: 11.5px; margin-top: 2px; font-weight: 600; }
.report-doc .card { border: 1px solid #d9d6cc; border-radius: 10px; padding: 4px 12px; break-inside: avoid; }
.report-doc table { width: 100%; border-collapse: collapse; }
.report-doc th { font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; color: #6f6d66; font-weight: 600; text-align: left; padding: 8px 6px; }
.report-doc td { padding: 6px 6px; border-top: 1px solid #ebe8df; vertical-align: top; }
.report-doc .r { text-align: right; }
.report-doc tr.strong td { font-weight: 600; }
.report-doc tfoot td { font-weight: 600; border-top: 2px solid #d9d6cc; }
.report-doc tr.big td { font-family: var(--font-fraunces), Georgia, serif; font-size: 14px; font-weight: 600; padding: 9px 6px; }
.report-doc tr.big td.num { font-size: 19px; font-family: var(--font-plex-mono), ui-monospace, monospace; }
.report-doc tr.sep td { border-top: 2px solid #d9d6cc; }
.report-doc tr.gap td { padding-top: 16px; }
.report-doc .good { color: #1f8a85; }
.report-doc .bad { color: #b42318; }
.report-doc .muted { color: #6f6d66; }
.report-doc .small { font-size: 11px; }
.report-doc .hint { color: #4d4b45; font-size: 12px; margin: 8px 0 4px; }
.report-doc .foot { color: #6f6d66; font-size: 11px; margin: 6px 0 0; }
.report-doc .warn { background: #fdecea; color: #b42318; border-radius: 8px; padding: 8px 10px; font-size: 12px; margin: 10px 0 0; }
.report-doc .notes { padding: 10px 12px; white-space: pre-wrap; min-height: 28px; }
.report-doc .doc-foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #ebe8df; color: #8a877e; font-size: 10.5px; }
`;
