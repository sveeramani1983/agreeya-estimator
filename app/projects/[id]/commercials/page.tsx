import { notFound } from "next/navigation"
import {
  getProject,
  getLaborCosts,
  getAdditionalCosts,
  getCommercialsConfig,
  getWBSStats,
  getOverheadConfig,
  getTotalConstructionHours,
  getWBSConfidenceHours,
} from "@/lib/actions"
import { CommercialsWorkspace } from "@/components/commercials-workspace"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CommercialsPage({ params }: PageProps) {
  const { id } = await params

  const [project, laborCosts, additionalCosts, config, wbsStats, overheadConfig, constructionHours, contingencyHours] = await Promise.all([
    getProject(id),
    getLaborCosts(id),
    getAdditionalCosts(id),
    getCommercialsConfig(id),
    getWBSStats(id),
    getOverheadConfig(id),
    getTotalConstructionHours(id),
    getWBSConfidenceHours(id),
  ])

  if (!project) {
    notFound()
  }

  return (
    <CommercialsWorkspace
      projectId={id}
      project={project}
      laborCosts={laborCosts}
      initialAdditionalCosts={additionalCosts.length > 0 ? additionalCosts : []}
      initialConfig={config}
      totalSP={wbsStats.totalSP}
      overheadConfig={overheadConfig}
      constructionHours={constructionHours}
      contingencyHours={contingencyHours}
    />
  )
}
