import { getProject, getTrackerProject, getPeriodBurns } from "@/lib/actions"
import { notFound } from "next/navigation"
import { TrackerActualsV2 } from "@/components/tracker-actuals-v2"
import type { ReportingCadence } from "@/lib/types"

export default async function ActualsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, trackerProject] = await Promise.all([getProject(id), getTrackerProject(id)])
  if (!project || !trackerProject) notFound()

  const periodBurns = await getPeriodBurns(trackerProject.id)

  let snapshot: any = {}
  try { snapshot = JSON.parse(trackerProject.baseline_snapshot) } catch {}

  const baselineResources: Array<{ id: string; name: string; role: string | null }> = (snapshot.resources ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    role: r.role ?? null,
  }))

  const cadence = (trackerProject.reporting_cadence ?? "weekly") as ReportingCadence

  return (
    <TrackerActualsV2
      trackerProjectId={trackerProject.id}
      projectId={id}
      reportingCadence={cadence}
      periodBurns={periodBurns}
      projectStartDate={project.project_start_date ?? null}
      projectTargetEndDate={project.project_target_end_date ?? null}
      baselineTotalHours={trackerProject.baseline_total_hours ?? 0}
      baselineTotalCost={trackerProject.baseline_total_cost ?? 0}
      baselineResources={baselineResources}
    />
  )
}
