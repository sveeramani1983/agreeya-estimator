import { notFound } from "next/navigation"
import { getProject, getOverheadConfig, getTotalConstructionHours, getWBSConfidenceHours } from "@/lib/actions"
import { OverheadWorkspace } from "@/components/overhead-workspace"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OverheadPage({ params }: PageProps) {
  const { id } = await params

  const [project, initialConfig, constructionHours, wbsConfidenceHours] = await Promise.all([
    getProject(id),
    getOverheadConfig(id),
    getTotalConstructionHours(id),
    getWBSConfidenceHours(id),
  ])

  if (!project) {
    notFound()
  }

  return (
    <OverheadWorkspace
      projectId={id}
      initialConfig={initialConfig}
      constructionHours={constructionHours}
      wbsConfidenceHours={wbsConfidenceHours}
    />
  )
}
