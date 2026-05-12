import { ComingSoonBanner } from "@/components/intelligence/coming-soon-banner"
import { DisabledFeature } from "@/components/intelligence/disabled-feature"
import { FeatureFeedback } from "@/components/intelligence/feature-feedback"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Zap, Clock, Layers, Users, DollarSign, ShieldAlert, CheckCircle } from "lucide-react"

const OPTIONS = [
  {
    id: "accelerated",
    label: "Accelerated",
    icon: Zap,
    tagline: "Fastest path to delivery",
    recommended: false,
    color: "border-orange-200",
    badgeColor: "bg-orange-100 text-orange-700 border-orange-200",
    accentColor: "text-orange-600",
    bgColor: "bg-orange-50",
    details: {
      timeline: "4 months",
      teamSize: "8 people",
      cost: "$1.82M",
      risk: "High",
      riskColor: "text-red-600",
    },
    includes: [
      "Parallel workstreams from week 1",
      "24/5 extended dev hours",
      "Dedicated QA embedded per squad",
      "Reduced documentation scope",
      "Assumes no SAP delays",
    ],
    tradeoffs: [
      "Higher burn rate — cost premium ~52%",
      "Minimal buffer for scope changes",
      "Requires all 8 resources immediately available",
    ],
  },
  {
    id: "standard",
    label: "Standard",
    icon: Clock,
    tagline: "Recommended — balanced delivery",
    recommended: true,
    color: "border-blue-400 ring-2 ring-blue-300",
    badgeColor: "bg-blue-600 text-white border-blue-700",
    accentColor: "text-blue-600",
    bgColor: "bg-blue-900/20",
    details: {
      timeline: "6 months",
      teamSize: "6 people",
      cost: "$1.2M",
      risk: "Medium",
      riskColor: "text-yellow-600",
    },
    includes: [
      "Sequential sprints with 2-week cadence",
      "Integrated QA at end of each sprint",
      "Full documentation package",
      "10% contingency buffer built in",
      "Standard SAP integration timeline",
    ],
    tradeoffs: [
      "Most predictable delivery model",
      "Proven methodology — lowest rework rate",
      "Easiest to adapt if scope changes",
    ],
  },
  {
    id: "phased",
    label: "Phased",
    icon: Layers,
    tagline: "Lowest risk, staged rollout",
    recommended: false,
    color: "border-green-800/50",
    badgeColor: "bg-green-900/30 text-green-300 border-green-800/50",
    accentColor: "text-green-600",
    bgColor: "bg-green-900/20",
    details: {
      timeline: "9 months",
      teamSize: "4 people",
      cost: "$980K",
      risk: "Low",
      riskColor: "text-green-600",
    },
    includes: [
      "Phase 1: Core portal + auth (months 1–4)",
      "Phase 2: SAP integration (months 4–7)",
      "Phase 3: Reporting & analytics (months 7–9)",
      "Client team ramp-up built into each phase",
      "Independent UAT per phase",
    ],
    tradeoffs: [
      "Longest overall timeline (+50% vs Standard)",
      "Smaller team — requires key personnel continuity",
      "Value delivered incrementally — not all at once",
    ],
  },
]

function DetailRow({ icon: Icon, label, value, valueClass }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={`font-semibold text-foreground ${valueClass ?? ""}`}>{value}</span>
    </div>
  )
}

export default function DeliveryOptionsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-foreground">
            Delivery Options
          </h2>
          <p className="text-muted-foreground">
            Compare Accelerated, Standard, and Phased delivery approaches for a given scope.
          </p>
        </div>
        <ComingSoonBanner />
      </div>

      {/* Context bar */}
      <div className="rounded-xl border border-[#1E2D45] bg-[#111827] px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4 text-sm text-[#94A3B8]">
          <span className="font-semibold text-foreground">
            City of Portland — Digital Services Platform
          </span>
          <span className="text-muted-foreground">·</span>
          <span>4,200 base hours</span>
          <span className="text-muted-foreground">·</span>
          <span>6 WBS components</span>
          <span className="text-muted-foreground">·</span>
          <span>SAP integration (complex)</span>
        </div>
      </div>

      {/* ── Three-column comparison ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon
          return (
            <Card
              key={opt.id}
              className={`relative shadow-sm ${opt.color} ${opt.recommended ? "shadow-blue-100" : ""}`}
            >
              {opt.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow">
                    Recommended
                  </span>
                </div>
              )}
              <CardHeader className={`rounded-t-xl ${opt.bgColor} pb-4`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${opt.accentColor}`} />
                    <CardTitle className="text-lg font-bold text-foreground">
                      {opt.label}
                    </CardTitle>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${opt.badgeColor}`}
                  >
                    {opt.label}
                  </span>
                </div>
                <CardDescription className="mt-1">{opt.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                <div className="space-y-2.5">
                  <DetailRow icon={Clock} label="Timeline" value={opt.details.timeline} />
                  <DetailRow icon={Users} label="Team Size" value={opt.details.teamSize} />
                  <DetailRow icon={DollarSign} label="Est. Cost" value={opt.details.cost} />
                  <DetailRow
                    icon={ShieldAlert}
                    label="Risk"
                    value={opt.details.risk}
                    valueClass={opt.details.riskColor}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Includes
                  </p>
                  <ul className="space-y-1.5">
                    {opt.includes.map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-xs text-[#94A3B8]">
                        <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Trade-offs
                  </p>
                  <ul className="space-y-1.5">
                    {opt.tradeoffs.map((t) => (
                      <li key={t} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E2D45]" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>

                <DisabledFeature>
                  <Button
                    className={`w-full ${
                      opt.recommended
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : ""
                    }`}
                    variant={opt.recommended ? "default" : "outline"}
                  >
                    Select {opt.label}
                  </Button>
                </DisabledFeature>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Comparison table */}
      <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Side-by-Side Comparison
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2D45] bg-[#0D1526]">
                  <th className="py-3 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Dimension
                  </th>
                  {OPTIONS.map((opt) => (
                    <th
                      key={opt.id}
                      className="py-3 px-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {opt.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { label: "Timeline", key: "timeline" as const },
                  { label: "Team Size", key: "teamSize" as const },
                  { label: "Cost", key: "cost" as const },
                  { label: "Risk Level", key: "risk" as const },
                ].map(({ label, key }) => (
                  <tr key={label}>
                    <td className="py-3 pl-4 font-medium text-[#94A3B8]">{label}</td>
                    {OPTIONS.map((opt) => (
                      <td
                        key={opt.id}
                        className={`py-3 px-4 text-center tabular-nums font-semibold ${
                          key === "risk" ? opt.details.riskColor : "text-foreground"
                        }`}
                      >
                        {opt.details[key]}
                        {opt.recommended && key === "timeline" && (
                          <span className="ml-1.5 text-xs text-blue-500">★</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <FeatureFeedback feature="delivery-options" />
    </div>
  )
}
