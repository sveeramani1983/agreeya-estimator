import { notFound } from "next/navigation"
import {
  getProject,
  getProjectPhases,
  getPhaseTemplates,
  getResourceGanttData,
  validatePhaseCoverage,
} from "@/lib/actions"
import { ScheduleWorkspace } from "@/components/schedule-workspace"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SchedulePage({ params }: PageProps) {
  const { id } = await params

  const [project, phases, templates, ganttData, warnings] = await Promise.all([
    getProject(id),
    getProjectPhases(id),
    getPhaseTemplates(),
    getResourceGanttData(id),
    validatePhaseCoverage(id),
  ])

  if (!project) notFound()

  return (
    <ScheduleWorkspace
      projectId={id}
      project={project}
      initialPhases={phases}
      templates={templates}
      ganttData={ganttData}
      coverageWarnings={warnings}
    />
  )
}
