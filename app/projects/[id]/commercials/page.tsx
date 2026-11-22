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
  getBillingMilestones,
  getMilestoneTemplates,
} from "@/lib/actions"
import { CommercialsWorkspace } from "@/components/commercials-workspace"
import { getClientIntelligence } from "@/lib/intelligence"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CommercialsPage({ params }: PageProps) {
  const { id } = await params

  const [project, laborCosts, additionalCosts, config, wbsStats, overheadConfig, constructionHours, contingencyHours, milestones, templates] = await Promise.all([
    getProject(id),
    getLaborCosts(id),
    getAdditionalCosts(id),
    getCommercialsConfig(id),
    getWBSStats(id),
    getOverheadConfig(id),
    getTotalConstructionHours(id),
    getWBSConfidenceHours(id),
    getBillingMilestones(id),
    getMilestoneTemplates(),
  ])

  if (!project) {
    notFound()
  }

  const clientIntelligence = project.client_id
    ? await getClientIntelligence(project.client_id)
    : null

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
      initialMilestones={milestones}
      templates={templates}
      clientIntelligence={clientIntelligence}
    />
  )
}
