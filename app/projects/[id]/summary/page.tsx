import { notFound } from "next/navigation"
import {
  getProject,
  getWBSComponents,
  getOverheadConfig,
  getLaborCosts,
  getAdditionalCosts,
  getCommercialsConfig,
  getAssumptions,
  getRisks,
  getProjectPhases,
  getBurnRateData,
  getWBSActuals,
  getBillingMilestones,
} from "@/lib/actions"
import { WBSComponentWithActual } from "@/lib/types"
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
    risks,
    phases,
    burnRateData,
    actuals,
    billingMilestones,
  ] = await Promise.all([
    getProject(id),
    getWBSComponents(id),
    getOverheadConfig(id),
    getLaborCosts(id),
    getAdditionalCosts(id),
    getCommercialsConfig(id),
    getAssumptions(id),
    getRisks(id),
    getProjectPhases(id),
    getBurnRateData(id),
    getWBSActuals(id),
    getBillingMilestones(id),
  ])

  if (!project) {
    notFound()
  }

  // Merge actuals into WBS components
  const wbsWithActuals: WBSComponentWithActual[] = wbsComponents.map(c => {
    const actual = actuals.find(a => a.wbs_component_id === c.id)
    return {
      ...c,
      actual_hours: actual?.actual_hours ?? null,
      accuracy_pct: actual && c.base_hours > 0
        ? Math.round((actual.actual_hours / c.base_hours) * 100)
        : null,
    }
  })

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
        wbsComponents={wbsWithActuals}
        overheadConfig={overheadConfig}
        laborCosts={laborCosts}
        additionalCosts={additionalCosts}
        commercialsConfig={commercialsConfig}
        totals={totals}
        assumptions={assumptions}
        risks={risks}
        phases={phases}
        burnRateData={burnRateData}
        billingMilestones={billingMilestones}
      />
    </div>
  )
}
