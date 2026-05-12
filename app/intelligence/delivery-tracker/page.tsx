import { ComingSoonBanner } from "@/components/intelligence/coming-soon-banner"
import { DisabledFeature } from "@/components/intelligence/disabled-feature"
import { FeatureFeedback } from "@/components/intelligence/feature-feedback"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlertTriangle, TrendingUp, RefreshCw, Calendar, DollarSign, Clock } from "lucide-react"

// ── Mock data ────────────────────────────────────────────────────────────────

const PROJECT = {
  name: "City of Portland — Digital Services Platform",
  client: "City of Portland",
  startDate: "2025-01-13",
  endDate: "2025-07-07",
  currentWeek: 18,
  totalWeeks: 26,
}

const BUDGET = {
  total: 1_200_000,
  burned: 847_200,
  remaining: 352_800,
  forecasted: 1_312_500,
}

const TIMELINE = {
  currentWeek: 18,
  totalWeeks: 26,
  forecastedWeeks: 28.5,
}

const HOURS = {
  estimated: 4_200,
  burned: 2_967,
  remaining: 1_233,
  forecasted: 4_680,
}

const TEAM_BURN = [
  { role: "Tech Lead", estH: 840, burnedH: 612, forecastH: 940, delta: "+11.9%" },
  { role: "Senior Developer (x2)", estH: 1200, burnedH: 887, forecastH: 1340, delta: "+11.7%" },
  { role: "Mid Developer", estH: 720, burnedH: 534, forecastH: 768, delta: "+6.7%" },
  { role: "QA Engineer", estH: 480, burnedH: 312, forecastH: 420, delta: "-12.5%" },
  { role: "Business Analyst", estH: 360, burnedH: 298, forecastH: 380, delta: "+5.6%" },
  { role: "Project Manager", estH: 600, burnedH: 324, forecastH: 432, delta: "-28.0%" },
]

const WARNINGS = [
  {
    severity: "high",
    title: "Budget overrun likely at current burn rate",
    detail: "Forecasted at $1.31M (+$112K over contract). SAP integration scope expanded in Week 14.",
  },
  {
    severity: "medium",
    title: "Timeline slippage of ~2.5 weeks projected",
    detail: "Integration milestones are 8 days behind as of Week 18. Recommend scope negotiation.",
  },
  {
    severity: "low",
    title: "QA hours tracking well below estimate",
    detail: "QA burn is 13% under estimate. Consider re-allocating capacity to backend if needed.",
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function BurnBar({
  burned,
  total,
  forecast,
  colorClass,
}: {
  burned: number
  total: number
  forecast: number
  colorClass: string
}) {
  const burnedPct = (burned / total) * 100
  const overPct = forecast > total ? ((forecast - total) / total) * 100 : 0
  return (
    <div className="space-y-1.5">
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-[#1E2D45]">
        <div
          className={`absolute inset-y-0 left-0 rounded-l-full ${colorClass}`}
          style={{ width: `${Math.min(burnedPct, 100)}%` }}
        />
        {overPct > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full bg-red-400 opacity-70"
            style={{ left: "100%", width: `${overPct}%` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{burnedPct.toFixed(1)}% consumed</span>
        {forecast > total && (
          <span className="font-semibold text-red-600">
            Forecast: +{((forecast / total - 1) * 100).toFixed(1)}% over
          </span>
        )}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DeliveryTrackerPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-foreground">
            Delivery Tracker
          </h2>
          <p className="text-muted-foreground">
            Live budget burn, timeline progress, and AI-generated forecasts for active projects.
          </p>
        </div>
        <ComingSoonBanner />
      </div>

      {/* Project header */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#1E2D45] bg-[#111827] px-5 py-4 shadow-sm">
        <div className="flex-1 space-y-0.5">
          <h3 className="text-base font-bold text-foreground">{PROJECT.name}</h3>
          <p className="text-sm text-muted-foreground">
            {PROJECT.startDate} → {PROJECT.endDate} · Week {PROJECT.currentWeek} of {PROJECT.totalWeeks}
          </p>
        </div>
        <Badge className="bg-blue-900/30 text-blue-300 border-blue-800/50 text-xs">
          In Progress
        </Badge>
        <DisabledFeature>
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Sync data
          </Button>
        </DisabledFeature>
      </div>

      {/* ── Burn bars ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <DollarSign className="h-5 w-5 text-purple-500" />
              Budget Burn
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-black text-foreground">
                  {fmt(BUDGET.burned)}
                </p>
                <p className="text-xs text-muted-foreground">Burned</p>
              </div>
              <div>
                <p className="text-2xl font-black text-green-600">
                  {fmt(BUDGET.remaining)}
                </p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
              <div>
                <p className="text-2xl font-black text-red-600">
                  {fmt(BUDGET.forecasted)}
                </p>
                <p className="text-xs text-muted-foreground">Forecast</p>
              </div>
            </div>
            <BurnBar
              burned={BUDGET.burned}
              total={BUDGET.total}
              forecast={BUDGET.forecasted}
              colorClass="bg-purple-500"
            />
            <p className="text-xs text-muted-foreground">
              Contract total: {fmt(BUDGET.total)} · Overrun risk: +{fmt(BUDGET.forecasted - BUDGET.total)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Calendar className="h-5 w-5 text-blue-500" />
              Timeline Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-black text-foreground">
                  Wk {TIMELINE.currentWeek}
                </p>
                <p className="text-xs text-muted-foreground">Current week</p>
              </div>
              <div>
                <p className="text-2xl font-black text-green-600">
                  {TIMELINE.totalWeeks - TIMELINE.currentWeek}
                </p>
                <p className="text-xs text-muted-foreground">Weeks left</p>
              </div>
              <div>
                <p className="text-2xl font-black text-red-600">
                  Wk {TIMELINE.forecastedWeeks}
                </p>
                <p className="text-xs text-muted-foreground">Forecast end</p>
              </div>
            </div>
            <BurnBar
              burned={TIMELINE.currentWeek}
              total={TIMELINE.totalWeeks}
              forecast={TIMELINE.forecastedWeeks}
              colorClass="bg-blue-500"
            />
            <p className="text-xs text-muted-foreground">
              Planned end: Week {TIMELINE.totalWeeks} · Slippage risk: ~2.5 weeks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Warnings ── */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">AI Forecast Warnings</h3>
        {WARNINGS.map((w) => (
          <div
            key={w.title}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
              w.severity === "high"
                ? "border-red-800/50 bg-red-900/20"
                : w.severity === "medium"
                ? "border-amber-800/50 bg-amber-900/20"
                : "border-[#1E2D45] bg-[#0D1526]"
            }`}
          >
            <AlertTriangle
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                w.severity === "high"
                  ? "text-red-500"
                  : w.severity === "medium"
                  ? "text-amber-500"
                  : "text-muted-foreground"
              }`}
            />
            <div>
              <p
                className={`text-sm font-semibold ${
                  w.severity === "high"
                    ? "text-red-300"
                    : w.severity === "medium"
                    ? "text-amber-300"
                    : "text-[#94A3B8]"
                }`}
              >
                {w.title}
              </p>
              <p
                className={`mt-0.5 text-xs ${
                  w.severity === "high"
                    ? "text-red-300"
                    : w.severity === "medium"
                    ? "text-amber-300"
                    : "text-muted-foreground"
                }`}
              >
                {w.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Hours table ── */}
      <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Hours by Role
          </CardTitle>
          <CardDescription>
            Estimated · Burned · Forecasted at completion
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#0D1526]">
                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Role</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Estimated</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Burned</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Forecasted</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TEAM_BURN.map((row) => (
                <TableRow key={row.role}>
                  <TableCell className="font-medium text-foreground">{row.role}</TableCell>
                  <TableCell className="text-right tabular-nums text-[#94A3B8]">{row.estH.toLocaleString()}h</TableCell>
                  <TableCell className="text-right tabular-nums text-[#94A3B8]">{row.burnedH.toLocaleString()}h</TableCell>
                  <TableCell className="text-right tabular-nums text-[#94A3B8]">{row.forecastH.toLocaleString()}h</TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${
                      row.delta.startsWith("-") ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {row.delta}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-[#0D1526] font-semibold">
                <TableCell className="font-bold text-foreground">Total</TableCell>
                <TableCell className="text-right tabular-nums text-foreground">{HOURS.estimated.toLocaleString()}h</TableCell>
                <TableCell className="text-right tabular-nums text-foreground">{HOURS.burned.toLocaleString()}h</TableCell>
                <TableCell className="text-right tabular-nums text-red-300 font-bold">{HOURS.forecasted.toLocaleString()}h</TableCell>
                <TableCell className="text-right font-bold text-red-600">+11.4%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FeatureFeedback feature="delivery-tracker" />
    </div>
  )
}
