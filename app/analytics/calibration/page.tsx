import { BarChart2, RefreshCw } from "lucide-react"
import Link from "next/link"
import { getCalibrationSuggestions, getLibraryHealthSummary } from "@/lib/intelligence"
import { CalibrationPageClient } from "@/components/calibration-page-client"

export default async function CalibrationPage() {
  const [suggestions, health] = await Promise.all([
    getCalibrationSuggestions(),
    getLibraryHealthSummary(),
  ])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/analytics" className="hover:text-foreground transition-colors">Analytics</Link>
            <span>/</span>
            <span className="text-foreground">Calibration</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Component Library Calibration</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Based on actuals from delivered projects</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/analytics/calibration"
            className="flex items-center gap-2 rounded-lg border border-[#1E2D45] bg-[#0D1526] px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-[#2E3D55] transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Recalculate
          </Link>
        </div>
      </div>

      {suggestions.length === 0 && health.withData === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-[#1E2D45] p-16 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-[#1E2D45] flex items-center justify-center mx-auto">
            <BarChart2 className="h-8 w-8 text-[#94A3B8]" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">No calibration data yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Calibration data becomes available after 3+ projects have component actuals recorded in the Tracker.
            </p>
          </div>
        </div>
      ) : (
        <CalibrationPageClient suggestions={suggestions} health={health} />
      )}
    </div>
  )
}
