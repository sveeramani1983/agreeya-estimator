import { getPipelineData } from "@/lib/actions"
import { format, parseISO } from "date-fns"
import { PrintButton } from "@/components/print-button"

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

const VERTICAL_LABELS: Record<string, string> = {
  state_government: "State Gov",
  local_government: "Local Gov",
  federal: "Federal",
  healthcare: "Healthcare",
  enterprise: "Enterprise",
  other: "Other",
}

export default async function PipelineSummaryPage() {
  const data = await getPipelineData()
  const { pipeline, wonThisYear, metrics, monthlyForecast } = data
  const today = new Date()

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-page { background: white !important; color: black !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="print-page max-w-4xl mx-auto py-8 px-6 space-y-10 print:py-0 print:px-0 print:space-y-8">

        {/* Back link — hidden on print */}
        <div className="no-print">
          <a href="/pipeline" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Pipeline
          </a>
        </div>

        {/* Header */}
        <div className="border-b border-[#1E2D45] print:border-gray-300 pb-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground print:text-gray-500 mb-2">AgreeYa Solutions</p>
          <h1 className="text-3xl font-black tracking-tight text-foreground print:text-black">SKYNET 1.0 — Pipeline Summary</h1>
          <p className="text-sm text-muted-foreground print:text-gray-500 mt-1">
            Generated: {format(today, "MMMM d, yyyy")}
          </p>
        </div>

        {/* Pipeline at a Glance */}
        <div className="rounded-xl border-2 border-blue-800/40 bg-blue-900/10 print:border-gray-400 print:bg-gray-50 p-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400 print:text-gray-600 mb-4">Pipeline at a Glance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { label: "Total Pipeline",     value: fmt(metrics.totalPipeline),    sub: `${metrics.dealCount} active deals` },
              { label: "Weighted Forecast",  value: fmt(metrics.weightedPipeline), sub: "Probability-adjusted" },
              { label: "Won YTD",            value: fmt(metrics.wonRevenue),       sub: `${wonThisYear.length} deals` },
              { label: "Win Rate YTD",       value: `${Math.round(metrics.winRate)}%`, sub: `${wonThisYear.length} of ${wonThisYear.length + data.lostThisYear.length} pursued` },
            ].map(t => (
              <div key={t.label}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-500 mb-1">{t.label}</p>
                <p className="text-2xl font-black text-foreground print:text-black">{t.value}</p>
                <p className="text-xs text-muted-foreground print:text-gray-500 mt-0.5">{t.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Active Pursuits table */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground print:text-gray-600 mb-4">Active Pursuits</h2>
          {pipeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active pipeline deals.</p>
          ) : (
            <div className="rounded-lg border border-[#1E2D45] print:border-gray-300 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E2D45] print:border-gray-300 bg-[#0A1120] print:bg-gray-100">
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Project</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Client</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Vertical</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Value</th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Win %</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Weighted</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D45] print:divide-gray-200">
                  {pipeline.map(p => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5 font-medium text-foreground print:text-black line-clamp-1">{p.name}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground print:text-gray-600">{p.client_name}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground print:text-gray-600">
                        {p.vertical ? VERTICAL_LABELS[p.vertical] ?? p.vertical : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground print:text-gray-800">
                        {p.quoted_price > 0 ? fmt(p.quoted_price) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums text-xs font-semibold text-foreground print:text-black">
                        {p.win_probability ?? 50}%
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-xs text-foreground print:text-black">
                        {p.quoted_price > 0 ? fmt(p.quoted_price * ((p.win_probability ?? 50) / 100)) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground print:text-gray-600 capitalize">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#1E2D45] print:border-gray-400 bg-[#0A1120] print:bg-gray-100">
                    <td colSpan={3} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">
                      Total — {pipeline.length} deal{pipeline.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-foreground print:text-black text-xs">
                      {fmt(metrics.totalPipeline)}
                    </td>
                    <td />
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-foreground print:text-black text-xs">
                      {fmt(metrics.weightedPipeline)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Monthly Forecast */}
        {monthlyForecast.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground print:text-gray-600 mb-4">Monthly Forecast</h2>
            <div className="rounded-lg border border-[#1E2D45] print:border-gray-300 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E2D45] print:border-gray-300 bg-[#0A1120] print:bg-gray-100">
                    <th className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Month</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Deals</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Total</th>
                    <th className="text-right px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Weighted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D45] print:divide-gray-200">
                  {monthlyForecast.map(m => (
                    <tr key={m.month}>
                      <td className="px-5 py-2.5 font-medium text-foreground print:text-black">
                        {format(parseISO(m.month + "-01"), "MMMM yyyy")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground print:text-gray-600">{m.deals}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground print:text-gray-800">{fmt(m.total)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-bold text-foreground print:text-black">{fmt(m.weighted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Won This Year */}
        {wonThisYear.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground print:text-gray-600 mb-4">Won This Year</h2>
            <div className="rounded-lg border border-[#1E2D45] print:border-gray-300 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E2D45] print:border-gray-300 bg-[#0A1120] print:bg-gray-100">
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Project</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Client</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Value</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground print:text-gray-600">Close Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D45] print:divide-gray-200">
                  {wonThisYear.map(p => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5 font-medium text-foreground print:text-black">{p.name}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground print:text-gray-600">{p.client_name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-green-400 print:text-green-700 text-xs">{fmt(p.quoted_price)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground print:text-gray-600 tabular-nums">
                        {format(new Date(p.updated_at), "MMM d, yyyy")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Print button — hidden on print */}
        <div className="no-print flex justify-center pt-4">
          <PrintButton />
        </div>
      </div>
    </>
  )
}
