import { notFound } from "next/navigation"
import { getProject, getTrackerProject, getBillingMilestones } from "@/lib/actions"
import { TrackerBillingClient } from "@/components/tracker-billing-client"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TrackerBillingPage({ params }: PageProps) {
  const { id } = await params
  const [project, trackerProject, milestones] = await Promise.all([
    getProject(id),
    getTrackerProject(id),
    getBillingMilestones(id),
  ])

  if (!project || !trackerProject) notFound()

  const totalContract = trackerProject.baseline_total_cost ?? project.total_cost ?? 0

  return (
    <TrackerBillingClient
      projectId={id}
      milestones={milestones}
      totalContract={totalContract}
    />
  )
}
