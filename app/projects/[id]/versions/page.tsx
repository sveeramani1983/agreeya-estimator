import { getEstimateVersions, getWBSStats, getProjectTotalCost } from "@/lib/actions"
import { VersionsWorkspace } from "@/components/versions-workspace"

export default async function VersionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [versions, stats, totalCost] = await Promise.all([
    getEstimateVersions(id),
    getWBSStats(id),
    getProjectTotalCost(id),
  ])

  return (
    <VersionsWorkspace
      projectId={id}
      initialVersions={versions}
      currentTotals={{ hours: stats.totalHours, sp: stats.totalSP, cost: totalCost }}
    />
  )
}
