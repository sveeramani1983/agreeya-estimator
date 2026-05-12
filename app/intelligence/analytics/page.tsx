import { ComingSoonBanner } from "@/components/intelligence/coming-soon-banner"
import { FeatureFeedback } from "@/components/intelligence/feature-feedback"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Info, TrendingUp, Target, Trophy, AlertCircle } from "lucide-react"

// ── Mock data ────────────────────────────────────────────────────────────────

const WIN_RATE = 68
const TOTAL_BIDS = 34
const WON = 16
const LOST = 8
const SUBMITTED = 10

const ESTIMATE_ACCURACY = [
  { project: "City of Austin Digital Services", estimated: 3200, actual: 3410, delta: +6.6 },
  { project: "Metro Transit Customer App", estimated: 1840, actual: 1720, delta: -6.5 },
  { project: "State of Oregon Portal", estimated: 5600, actual: 6380, delta: +13.9 },
  { project: "Cascade Health EHR Integration", estimated: 2100, actual: 2080, delta: -1.0 },
  { project: "Portland Parks Booking System", estimated: 980, actual: 1040, delta: +6.1 },
]

const WIN_FACTORS = [
  { factor: "Technical expertise demonstrated", count: 11 },
  { factor: "Competitive pricing", count: 9 },
  { factor: "Strong references / past performance", count: 8 },
  { factor: "Team stability & key personnel", count: 7 },
  { factor: "Proposed timeline was realistic", count: 5 },
  { factor: "Local presence / onsite availability", count: 4 },
]

const LOSS_REASONS = [
  { reason: "Price — came in above winner", count: 5 },
  { reason: "Incumbent had incumbent advantage", count: 3 },
  { reason: "Team availability concerns", count: 2 },
  { reason: "Technical approach not differentiated", count: 2 },
  { reason: "Timeline deemed too long", count: 1 },
]

const COMPONENT_ACCURACY = [
  { type: "Frontend / UI", avg: -3.2, class: "text-green-600" },
  { type: "Backend / API", avg: +4.8, class: "text-yellow-600" },
  { type: "Integrations (3rd party)", avg: +18.4, class: "text-red-600" },
  { type: "Infrastructure / DevOps", avg: +7.1, class: "text-orange-600" },
  { type: "Data / Analytics", avg: +12.3, class: "text-orange-600" },
  { type: "Security / Compliance", avg: +5.5, class: "text-yellow-600" },
]

// ── Sub-components ───────────────────────────────────────────────────────────

function DonutChart({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 36 36" className="h-36 w-36 -rotate-90">
          <circle cx="18" cy="18" r="15.91549430918954" fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
          <circle
            cx="18" cy="18" r="15.91549430918954"
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-foreground">{pct}%</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
    </div>
  )
}

function HBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-[#1E2D45]">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function IntelligenceAnalyticsPage() {
  const maxWinFactor = WIN_FACTORS[0].count
  const maxLossReason = LOSS_REASONS[0].count

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-foreground">
            AI Analytics
          </h2>
          <p className="text-muted-foreground">
            Win rate trends, estimate accuracy, and pattern analysis across your proposal portfolio.
          </p>
        </div>
        <ComingSoonBanner />
      </div>

      {/* Data note */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-800/50 bg-blue-900/20 px-4 py-3 text-sm text-blue-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Note:</strong> Charts below show sample data for illustration.
          Live AI analytics populate automatically after 5+ completed projects with outcome data recorded.
        </p>
      </div>

      {/* ── KPI row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Bids", value: TOTAL_BIDS, icon: Target, color: "text-[#94A3B8]" },
          { label: "Won", value: WON, icon: Trophy, color: "text-green-600" },
          { label: "Lost", value: LOST, icon: AlertCircle, color: "text-red-600" },
          { label: "Win Rate", value: `${WIN_RATE}%`, icon: TrendingUp, color: "text-blue-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="shadow-sm border-[#1E2D45] bg-[#111827]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Win rate + Estimate accuracy ── */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2 shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Win Rate</CardTitle>
            <CardDescription>
              Won {WON} · Lost {LOST} · {SUBMITTED} in flight
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 py-4">
            <DonutChart pct={WIN_RATE} color="#22c55e" label="win rate" />
            <div className="flex w-full items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />
                Won ({WON})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" />
                Lost ({LOST})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#1E2D45] inline-block" />
                In flight ({SUBMITTED})
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Estimate Accuracy
            </CardTitle>
            <CardDescription>Estimated vs. actual hours by project</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {ESTIMATE_ACCURACY.map((row) => {
              const maxH = Math.max(row.estimated, row.actual)
              return (
                <div key={row.project} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#94A3B8] truncate max-w-[220px]">
                      {row.project}
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        Math.abs(row.delta) <= 5
                          ? "text-green-600"
                          : Math.abs(row.delta) <= 10
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {row.delta > 0 ? "+" : ""}{row.delta.toFixed(1)}%
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-xs text-muted-foreground shrink-0">Est.</span>
                      <div className="flex-1">
                        <HBar value={row.estimated} max={maxH * 1.2} color="bg-blue-400" />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground shrink-0">
                        {row.estimated.toLocaleString()}h
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-xs text-muted-foreground shrink-0">Actual</span>
                      <div className="flex-1">
                        <HBar value={row.actual} max={maxH * 1.2} color="bg-[#1E2D45]" />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground shrink-0">
                        {row.actual.toLocaleString()}h
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* ── Factor tables ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              What drives wins
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Factor</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground w-28">
                    Times cited
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {WIN_FACTORS.map(({ factor, count }) => (
                  <TableRow key={factor}>
                    <TableCell className="py-3">
                      <div className="space-y-1">
                        <span className="text-sm font-medium text-[#94A3B8]">{factor}</span>
                        <HBar value={count} max={maxWinFactor} color="bg-green-400" />
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

        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">
              Why deals are lost
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Reason</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground w-28">
                    Times cited
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LOSS_REASONS.map(({ reason, count }) => (
                  <TableRow key={reason}>
                    <TableCell className="py-3">
                      <div className="space-y-1">
                        <span className="text-sm font-medium text-[#94A3B8]">{reason}</span>
                        <HBar value={count} max={maxLossReason} color="bg-red-400" />
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
      </div>

      {/* ── Accuracy by component type ── */}
      <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Accuracy by Component Type
          </CardTitle>
          <CardDescription>
            Average estimate over/under-run per component category — positive = underestimated
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#0D1526]">
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Component Type</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Avg Delta</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Signal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMPONENT_ACCURACY.map(({ type, avg, class: cls }) => (
                <TableRow key={type}>
                  <TableCell className="font-medium text-foreground">{type}</TableCell>
                  <TableCell className={`text-right font-bold tabular-nums ${cls}`}>
                    {avg > 0 ? "+" : ""}{avg.toFixed(1)}%
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        Math.abs(avg) <= 5
                          ? "bg-green-900/30 text-green-300 border-green-800/50 text-xs"
                          : Math.abs(avg) <= 10
                          ? "bg-yellow-100 text-yellow-700 border-yellow-200 text-xs"
                          : "bg-red-900/30 text-red-300 border-red-800/50 text-xs"
                      }
                    >
                      {Math.abs(avg) <= 5 ? "On track" : Math.abs(avg) <= 10 ? "Caution" : "Add buffer"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FeatureFeedback feature="intelligence-analytics" />
    </div>
  )
}
