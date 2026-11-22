import { getProject, getTrackerProject, getStatusReports, getChangeRequests, getHealthSnapshots } from "@/lib/actions"
import { notFound } from "next/navigation"
import { TrackerReportsClient } from "@/components/tracker-reports-client"

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, trackerProject] = await Promise.all([getProject(id), getTrackerProject(id)])
  if (!project || !trackerProject) notFound()

  const [reports, changeRequests, healthSnapshots] = await Promise.all([
    getStatusReports(trackerProject.id),
    getChangeRequests(trackerProject.id),
    getHealthSnapshots(trackerProject.id),
  ])

  return (
    <TrackerReportsClient
      projectId={id}
      trackerProject={trackerProject}
      reports={reports}
      changeRequests={changeRequests}
      healthSnapshots={healthSnapshots}
    />
  )
}
