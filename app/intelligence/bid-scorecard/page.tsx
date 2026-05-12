import { ComingSoonBanner } from "@/components/intelligence/coming-soon-banner"
import { DisabledFeature } from "@/components/intelligence/disabled-feature"
import { FeatureFeedback } from "@/components/intelligence/feature-feedback"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, AlertCircle, ThumbsUp, RefreshCw } from "lucide-react"

const DIMENSIONS = [
  {
    label: "Technical Fit",
    score: 85,
    weight: 25,
    note: "Strong match — team has SAP + portal experience",
    color: "bg-green-500",
  },
  {
    label: "Budget Alignment",
    score: 72,
    weight: 20,
    note: "Within range, but ceiling is undefined",
    color: "bg-lime-500",
  },
  {
    label: "Timeline Realism",
    score: 68,
    weight: 15,
    note: "6-month ask may require scope negotiation",
    color: "bg-yellow-500",
  },
  {
    label: "Team Availability",
    score: 90,
    weight: 20,
    note: "Bench capacity available for Q3 start",
    color: "bg-green-500",
  },
  {
    label: "Competitive Position",
    score: 55,
    weight: 10,
    note: "3 known incumbents — pricing will be competitive",
    color: "bg-orange-500",
  },
  {
    label: "Risk Profile",
    score: 78,
    weight: 10,
    note: "SAP integration is the primary technical risk",
    color: "bg-lime-500",
  },
]

const weightedScore =
  DIMENSIONS.reduce((acc, d) => acc + (d.score * d.weight) / 100, 0)

function scoreColor(s: number) {
  if (s >= 80) return "text-green-600"
  if (s >= 65) return "text-yellow-600"
  return "text-red-600"
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="relative h-2.5 w-full rounded-full bg-[#1E2D45]">
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${color} transition-all`}
        style={{ width: `${score}%` }}
      />
      <div
        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-[#0D1526] bg-[#2563EB] shadow ring-1 ring-[#1E2D45]"
        style={{ left: `calc(${score}% - 8px)` }}
      />
    </div>
  )
}

export default function BidScorecardPage() {
  const recommendation = weightedScore >= 75 ? "GO" : weightedScore >= 60 ? "CONDITIONAL GO" : "NO-GO"
  const recColor =
    recommendation === "GO"
      ? "text-green-300 bg-green-900/20 border-green-800/50"
      : recommendation === "CONDITIONAL GO"
      ? "text-amber-300 bg-amber-900/20 border-amber-800/50"
      : "text-red-300 bg-red-900/20 border-red-800/50"

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-foreground">
            Bid Scorecard
          </h2>
          <p className="text-muted-foreground">
            Score an opportunity across six dimensions and get a Go/No-Go recommendation.
          </p>
        </div>
        <ComingSoonBanner />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Scoring Panel ── */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">
                City of Portland — Digital Services Platform
              </CardTitle>
              <CardDescription>
                Adjust each dimension to reflect your assessment. Weights shown in parentheses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {DIMENSIONS.map((dim) => (
                <div key={dim.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">
                      {dim.label}
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                        (weight: {dim.weight}%)
                      </span>
                    </span>
                    <span className={`font-bold tabular-nums ${scoreColor(dim.score)}`}>
                      {dim.score}/100
                    </span>
                  </div>
                  <DisabledFeature>
                    <div className="w-full">
                      <ScoreBar score={dim.score} color={dim.color} />
                    </div>
                  </DisabledFeature>
                  <p className="text-xs text-muted-foreground">{dim.note}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* ── Recommendation Panel ── */}
        <div className="space-y-4">
          <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">
                Overall Score
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 py-4">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <svg viewBox="0 0 36 36" className="h-36 w-36 -rotate-90">
                  <circle
                    cx="18" cy="18" r="15.91549430918954"
                    fill="none" stroke="#e2e8f0" strokeWidth="3"
                  />
                  <circle
                    cx="18" cy="18" r="15.91549430918954"
                    fill="none"
                    stroke={weightedScore >= 75 ? "#22c55e" : weightedScore >= 60 ? "#eab308" : "#ef4444"}
                    strokeWidth="3"
                    strokeDasharray={`${weightedScore.toFixed(1)} ${(100 - weightedScore).toFixed(1)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-3xl font-black ${scoreColor(weightedScore)}`}>
                    {weightedScore.toFixed(0)}
                  </span>
                  <span className="text-xs text-muted-foreground">/ 100</span>
                </div>
              </div>
              <div className={`w-full rounded-xl border px-4 py-3 text-center font-bold text-lg ${recColor}`}>
                {recommendation === "GO" && <CheckCircle className="inline mr-2 h-5 w-5" />}
                {recommendation === "CONDITIONAL GO" && <AlertCircle className="inline mr-2 h-5 w-5" />}
                {recommendation === "NO-GO" && <XCircle className="inline mr-2 h-5 w-5" />}
                {recommendation}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#94A3B8]">
                Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-[#94A3B8] space-y-3">
              <p>
                Weighted score of <strong>{weightedScore.toFixed(1)}</strong> signals a
                <strong> Conditional Go</strong>. Proceed with proposal on the condition that
                timeline concerns are addressed in discovery.
              </p>
              <p>Key risks to mitigate before submitting:</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Confirm SAP integration scope with client pre-RFP</li>
                <li>• Propose phased delivery to address timeline risk</li>
                <li>• Benchmark pricing against known competitor range</li>
              </ul>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <DisabledFeature>
              <Button className="flex-1 gap-1.5">
                <ThumbsUp className="h-4 w-4" />
                Save Scorecard
              </Button>
            </DisabledFeature>
            <DisabledFeature>
              <Button variant="outline" size="icon">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </DisabledFeature>
          </div>
        </div>
      </div>

      <FeatureFeedback feature="bid-scorecard" />
    </div>
  )
}
