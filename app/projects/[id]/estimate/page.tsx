import { notFound } from "next/navigation"
import { getProject, getWBSComponents, getLibraryComponents, getWBSActuals } from "@/lib/actions"
import { WBSWorkspace } from "@/components/wbs-workspace"
import { getCalibrationSuggestions, getSimilarProjects } from "@/lib/intelligence"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EstimatePage({ params }: PageProps) {
  const { id } = await params

  const [project, initialComponents, library, initialActuals, calibrationSuggestions, similarProjects] = await Promise.all([
    getProject(id),
    getWBSComponents(id),
    getLibraryComponents(),
    getWBSActuals(id),
    getCalibrationSuggestions(),
    getSimilarProjects(id),
  ])

  if (!project) {
    notFound()
  }

  return (
    <WBSWorkspace
      projectId={id}
      initialComponents={initialComponents}
      library={library}
      project={project}
      initialActuals={initialActuals}
      calibrationSuggestions={calibrationSuggestions}
      similarProjects={similarProjects}
    />
  )
}
