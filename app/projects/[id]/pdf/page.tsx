import { notFound } from "next/navigation"
import {
  getProject,
  getWBSComponents,
  getProjectPhases,
  getBillingMilestones,
  getAssumptions,
  getRisks,
  getLaborCosts,
  getAdditionalCosts,
  getCommercialsConfig,
} from "@/lib/actions"
import { PDFDocument } from "@/components/pdf/pdf-document"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PDFPage({ params }: PageProps) {
  const { id } = await params

  const [
    project,
    wbsComponents,
    phases,
    billingMilestones,
    assumptions,
    risks,
    laborCosts,
    additionalCosts,
    commercialsConfig,
  ] = await Promise.all([
    getProject(id),
    getWBSComponents(id),
    getProjectPhases(id),
    getBillingMilestones(id),
    getAssumptions(id),
    getRisks(id),
    getLaborCosts(id),
    getAdditionalCosts(id),
    getCommercialsConfig(id),
  ])

  if (!project) notFound()

  const totalLaborCost = laborCosts.reduce((a: number, l: any) => a + (l.total_cost || 0), 0)
  const totalAdditionalCosts = additionalCosts.reduce((a: number, c: any) => {
    return a + (c.cost_type === "monthly" ? c.amount * c.duration_months : c.amount)
  }, 0)
  const totalProjectCost = totalLaborCost + totalAdditionalCosts
  const marginAmount = commercialsConfig.rates_include_margin
    ? 0
    : totalProjectCost * ((commercialsConfig.margin_percent || 0) / 100)
  const quotedPrice = totalProjectCost + marginAmount

  return (
    <PDFDocument
      project={project}
      wbsComponents={wbsComponents}
      phases={phases}
      billingMilestones={billingMilestones}
      assumptions={assumptions}
      risks={risks}
      laborCosts={laborCosts}
      additionalCosts={additionalCosts}
      commercialsConfig={commercialsConfig}
      totals={{ totalLaborCost, totalAdditionalCosts, totalProjectCost, quotedPrice }}
    />
  )
}
