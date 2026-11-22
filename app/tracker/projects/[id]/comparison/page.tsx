import { getProject, getTrackerProject } from "@/lib/actions"
import { getComponentActuals, getUnallocatedHours, getPeriodBurnsTotal } from "@/lib/tracker-actions"
import { notFound } from "next/navigation"
import { ComparisonClient } from "@/components/tracker-comparison-client"
import { format, parseISO } from "date-fns"

export default async function ComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, trackerProject] = await Promise.all([getProject(id), getTrackerProject(id)])
  if (!project || !trackerProject) notFound()

  const [components, unallocatedHours, periodBurnsTotal] = await Promise.all([
    getComponentActuals(trackerProject.id, id),
    getUnallocatedHours(trackerProject.id),
    getPeriodBurnsTotal(trackerProject.id),
  ])

  const totalEstHours   = components.reduce((s, c) => s + c.base_hours, 0)
  const totalActHours   = components.reduce((s, c) => s + c.actual_hours, 0)
  const totalRemaining  = components.reduce((s, c) => s + c.remaining, 0)
  const totalVariance   = totalActHours - totalEstHours

  const withActuals     = components.filter(c => c.status !== 'not_started')
  const cpi = totalActHours > 0 && withActuals.length > 0
    ? withActuals.reduce((s, c) => s + c.base_hours, 0) / withActuals.reduce((s, c) => s + c.actual_hours, 0)
    : null

  const completeCount   = components.filter(c => c.status === 'complete').length
  const atRiskCount     = components.filter(c => c.variance_percent > 10 && c.status !== 'not_started').length

  const topAtRisk = components
    .filter(c => c.variance_percent > 10 && c.status !== 'not_started')
    .sort((a, b) => b.variance_percent - a.variance_percent)
    .slice(0, 3)

  const allDates = components.filter(c => c.as_of_date).map(c => c.as_of_date as string)
  const lastUpdated = allDates.length > 0
    ? format(parseISO(allDates.sort().reverse()[0]), "MMM d, yyyy")
    : null

  return (
    <ComparisonClient
      trackerId={trackerProject.id}
      estimatorProjectId={id}
      components={components}
      unallocatedHours={unallocatedHours}
      periodBurnsTotal={periodBurnsTotal}
      summary={{
        totalEstHours,
        totalActHours,
        totalRemaining,
        totalVariance,
        completeCount,
        totalCount: components.length,
        atRiskCount,
        cpi,
        topAtRisk,
        lastUpdated,
      }}
    />
  )
}
