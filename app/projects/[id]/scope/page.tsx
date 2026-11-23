import { notFound } from "next/navigation"
import { getProject, getWBSComponents, getRfpAnalysisForProject } from "@/lib/actions"
import { ScopeWorkspace } from "@/components/scope-workspace"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ScopePage({ params }: PageProps) {
  const { id } = await params
  const [project, wbsComponents, initialAnalysis] = await Promise.all([
    getProject(id),
    getWBSComponents(id),
    getRfpAnalysisForProject(id),
  ])

  if (!project) {
    notFound()
  }

  return (
    <div className="min-h-full -m-6 p-6">
      <ScopeWorkspace
        projectId={id}
        projectName={project.name}
        clientName={project.client_name}
        existingWBSCount={wbsComponents.length}
        initialAnalysis={initialAnalysis}
      />
    </div>
  )
}
