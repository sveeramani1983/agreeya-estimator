import { notFound } from "next/navigation"
import {
  getProject,
  getResources,
  getResourceLoading,
  getRateCard,
  getFinalEstimatedHours,
  getWBSConfidenceHours
} from "@/lib/actions"
import { ResourceWorkspace } from "@/components/resource-workspace"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ResourcesPage({ params }: PageProps) {
  const { id } = await params

  const [project, initialResources, initialLoading, rateCard, totalEstimatedHours, wbsConfidenceHours] = await Promise.all([
    getProject(id),
    getResources(id),
    getResourceLoading(id),
    getRateCard(),
    getFinalEstimatedHours(id),
    getWBSConfidenceHours(id)
  ])

  if (!project) {
    notFound()
  }

  return (
    <ResourceWorkspace
      projectId={id}
      initialProject={project}
      initialResources={initialResources}
      initialLoading={initialLoading}
      rateCard={rateCard}
      totalEstimatedHours={totalEstimatedHours}
      wbsConfidenceHours={wbsConfidenceHours}
    />
  )
}
