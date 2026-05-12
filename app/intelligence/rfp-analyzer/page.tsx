import { getRfpAnalyses } from "@/lib/actions"
import { getProjects } from "@/lib/actions"
import { RFPAnalyzerClient } from "./rfp-analyzer-client"

export default async function RFPAnalyzerPage() {
  const [analyses, projects] = await Promise.all([
    getRfpAnalyses(),
    getProjects(),
  ])

  return (
    <RFPAnalyzerClient
      initialAnalyses={analyses}
      projects={projects.map((p) => ({ id: p.id, name: p.name, client_name: p.client_name }))}
    />
  )
}
