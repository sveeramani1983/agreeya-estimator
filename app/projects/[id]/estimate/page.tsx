import { notFound } from "next/navigation"
import { getProject, getWBSComponents, getLibraryComponents } from "@/lib/actions"
import { WBSWorkspace } from "@/components/wbs-workspace"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EstimatePage({ params }: PageProps) {
  const { id } = await params
  
  const [project, initialComponents, library] = await Promise.all([
    getProject(id),
    getWBSComponents(id),
    getLibraryComponents()
  ])

  if (!project) {
    notFound()
  }

  return (
    <WBSWorkspace 
      projectId={id} 
      initialComponents={initialComponents} 
      library={library} 
    />
  )
}
