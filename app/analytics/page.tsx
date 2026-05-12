import { getAnalyticsData } from "@/lib/actions"
import { Project } from "@/lib/types"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import {
  BarChart2,
  Trophy,
  XCircle,
  TrendingUp,
  DollarSign,
  Target,
} from "lucide-react"

// ─── helpers ────────────────────────────────────────────────────────────────

function winRateColor(rate: number): string {
  if (rate >= 60) return "text-green-600"
  if (rate >= 40) return "text-yellow-600"
  return "text-red-600"
}

function statusBadgeClass(status: Project["status"]): string {
  switch (status) {
    case "won":
      return "bg-green-900/30 text-green-300 border-green-800/50"
    case "lost":
      return "bg-red-900/30 text-red-300 border-red-800/50"
    case "submitted":
      return "bg-blue-900/30 text-blue-300 border-blue-800/50"
    default:
      return "bg-[#1E2D45] text-[#94A3B8] border-[#2D3F5A]"
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// ─── sub-components (pure server-renderable) ────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  colorClass,
}: {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  colorClass: string
}) {
  return (
    <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold text-[#94A3B8] uppercase tracking-wider">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

function FactorTable({
  title,
  counts,
}: {
  title: string
  counts: Record<string, number>
}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const max = entries[0]?.[1] ?? 1

  return (
    <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider">
                Factor
              </TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider text-right w-32">
                Times Cited
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([label, count]) => (
              <TableRow key={label}>
                <TableCell className="py-3">
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-[#94A3B8]">
                      {label}
                    </span>
                    <div className="h-1.5 w-full rounded-full bg-[#1E2D45] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#94A3B8] transition-all"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold text-[#94A3B8]">
                  {count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage() {
  const {
    projects,
    won,
    lost,
    submitted,
    draft,
    winRate,
    avgDealSize,
    winFactorCounts,
    lossReasonCounts,
    avgPriceGap,
    totalPipeline,
  } = await getAnalyticsData()

  const completedCount = won.length + lost.length
  const totalBids = completedCount + submitted.length + draft.length
  const hasWinFactors = Object.keys(winFactorCounts).length > 0
  const hasLossReasons = Object.keys(lossReasonCounts).length > 0

  // Win-rate bar widths (guard against 0/0)
  const wonPct = completedCount > 0 ? (won.length / completedCount) * 100 : 0
  const lostPct = completedCount > 0 ? (lost.length / completedCount) * 100 : 0

  return (
    <div className="space-y-8">
      {/* ── Page Header ── */}
      <div className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight text-foreground">
          Analytics
        </h2>
        <p className="text-muted-foreground">
          Win/loss intelligence across your proposal portfolio
        </p>
      </div>

      {/* ── Placeholder notice ── */}
      {completedCount < 3 && (
        <Card className="border-2 border-dashed border-[#1E2D45] shadow-none bg-[#0D1526]">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-[#1E2D45] flex items-center justify-center ring-1 ring-[#2D3F5A] shadow-sm">
              <BarChart2 className="h-8 w-8 text-[#94A3B8]" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                Not enough data yet
              </p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Analytics become meaningful after 3+ completed bids. Keep
                tracking your outcomes.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KPI Row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Total Bids"
          value={totalBids}
          icon={Target}
          colorClass="text-muted-foreground"
        />
        <KpiCard
          title="Won"
          value={won.length}
          icon={Trophy}
          colorClass="text-green-600"
        />
        <KpiCard
          title="Lost"
          value={lost.length}
          icon={XCircle}
          colorClass="text-red-600"
        />
        <KpiCard
          title="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          icon={TrendingUp}
          colorClass={winRateColor(winRate)}
        />
        {won.length > 0 && (
          <KpiCard
            title="Avg Deal Size (Won)"
            value={`$${avgDealSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            icon={DollarSign}
            colorClass="text-purple-600"
          />
        )}
        <KpiCard
          title="Total Pipeline"
          value={`$${totalPipeline.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          colorClass="text-blue-600"
        />
      </div>

      {/* ── Win Rate Visual ── */}
      {completedCount > 0 && (
        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Win Rate Breakdown
            </CardTitle>
            <CardDescription>
              Won {won.length} · Lost {lost.length} ·{" "}
              {winRate.toFixed(0)}% win rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-[#1E2D45]">
              {wonPct > 0 && (
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${wonPct}%` }}
                  title={`Won: ${won.length}`}
                />
              )}
              {lostPct > 0 && (
                <div
                  className="h-full bg-red-400 transition-all"
                  style={{ width: `${lostPct}%` }}
                  title={`Lost: ${lost.length}`}
                />
              )}
            </div>
            <div className="mt-3 flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                Won ({won.length})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
                Lost ({lost.length})
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Win Factors & Loss Reasons ── */}
      {(hasWinFactors || hasLossReasons) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {hasWinFactors && (
            <FactorTable
              title="What drives wins"
              counts={winFactorCounts}
            />
          )}
          {hasLossReasons && (
            <FactorTable
              title="Why deals are lost"
              counts={lossReasonCounts}
            />
          )}
        </div>
      )}

      {/* ── Price Competitiveness ── */}
      {avgPriceGap !== null && (
        <Card
          className={
            avgPriceGap >= 0
              ? "border-amber-200 bg-amber-50 shadow-sm"
              : "border-green-200 bg-green-50 shadow-sm"
          }
        >
          <CardContent className="flex items-start gap-4 py-5">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                avgPriceGap >= 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p
                className={`text-sm font-semibold ${
                  avgPriceGap >= 0 ? "text-amber-800" : "text-green-800"
                }`}
              >
                Price Competitiveness
              </p>
              <p
                className={`mt-0.5 text-sm ${
                  avgPriceGap >= 0 ? "text-amber-700" : "text-green-700"
                }`}
              >
                {avgPriceGap >= 0
                  ? `On average, you are ${avgPriceGap.toFixed(1)}% above competitor pricing on lost deals.`
                  : `On average, you are ${Math.abs(avgPriceGap).toFixed(1)}% below competitor pricing on lost deals — you may have room to increase pricing.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ── Project List ── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">All Projects</h3>
          <p className="text-sm text-muted-foreground">
            Full portfolio overview across all statuses
          </p>
        </div>

        {projects.length === 0 ? (
          <Card className="border-2 border-dashed shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <BarChart2 className="h-10 w-10 text-[#94A3B8]" />
              <p className="text-sm text-muted-foreground">No projects found.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm border-[#1E2D45] bg-[#111827] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#0D1526]">
                  <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider font-semibold">
                    Project
                  </TableHead>
                  <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider font-semibold">
                    Client
                  </TableHead>
                  <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider font-semibold">
                    Status
                  </TableHead>
                  <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider font-semibold text-right">
                    Hours
                  </TableHead>
                  <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider font-semibold text-right">
                    Cost
                  </TableHead>
                  <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider font-semibold text-right">
                    Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium text-foreground max-w-[200px] truncate">
                      {project.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[160px] truncate">
                      {project.client_name}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(project.status)}`}
                      >
                        {project.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {project.total_hours != null
                        ? project.total_hours.toLocaleString(undefined, {
                            maximumFractionDigits: 1,
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {project.total_cost != null && project.total_cost > 0
                        ? `$${project.total_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {formatDate(project.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  )
}
