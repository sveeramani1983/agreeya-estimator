import { notFound } from "next/navigation"
import {
  getProject,
  getWBSComponents,
  getOverheadConfig,
  getLaborCosts,
  getAdditionalCosts,
  getCommercialsConfig,
  getAssumptions,
  getRisks
} from "@/lib/actions"
import { ProjectSummary } from "@/components/project-summary"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SummaryPage({ params }: PageProps) {
  const { id } = await params

  const [
    project,
    wbsComponents,
    overheadConfig,
    laborCosts,
    additionalCosts,
    commercialsConfig,
    assumptions,
    risks
  ] = await Promise.all([
    getProject(id),
    getWBSComponents(id),
    getOverheadConfig(id),
    getLaborCosts(id),
    getAdditionalCosts(id),
    getCommercialsConfig(id),
    getAssumptions(id),
    getRisks(id)
  ])

  if (!project) {
    notFound()
  }

  // Calculate totals needed for summary
  const totalLaborCost = laborCosts.reduce((acc, curr) => acc + curr.total_cost, 0)
  const totalAdditionalCosts = additionalCosts.reduce((acc, curr) => {
    return acc + (curr.cost_type === 'monthly' ? curr.amount * curr.duration_months : curr.amount)
  }, 0)
  const totalProjectCost = totalLaborCost + totalAdditionalCosts
  
  let marginAmount = 0
  let quotedPrice = totalProjectCost

  if (!commercialsConfig.rates_include_margin) {
    marginAmount = totalProjectCost * (commercialsConfig.margin_percent / 100)
    quotedPrice = totalProjectCost + marginAmount
  }

  const totals = {
    totalLaborCost,
    totalAdditionalCosts,
    totalProjectCost,
    quotedPrice
  }

  return (
    <div className="min-h-full bg-[#0D1526]/30 -m-6 p-6">
      <ProjectSummary
        project={project}
        wbsComponents={wbsComponents}
        overheadConfig={overheadConfig}
        laborCosts={laborCosts}
        additionalCosts={additionalCosts}
        commercialsConfig={commercialsConfig}
        totals={totals}
        assumptions={assumptions}
        risks={risks}
      />
    </div>
  )
}
