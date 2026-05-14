import { getProject, getAssumptionCounts } from "@/lib/actions"
import { notFound } from "next/navigation"
import { ProjectTabs } from "@/components/project-tabs"
import { ProjectStatusControl } from "@/components/project-status-control"
import { ProjectHeader } from "@/components/project-header"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import Link from "next/link"

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [project, riskCounts] = await Promise.all([
    getProject(id),
    getAssumptionCounts(id),
  ])

  if (!project) {
    notFound()
  }

  return (
    <div className="flex flex-col h-full space-y-8">
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumb className="print:hidden">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/projects">Projects</Link>} />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{project.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Main Header Area */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <ProjectHeader
              projectId={id}
              initialName={project.name}
              initialClientName={project.client_name}
              status={project.status}
              updatedAt={project.updated_at}
            />
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <ProjectStatusControl
              projectId={id}
              project={project}
              currentQuotedPrice={project.total_cost ?? 0}
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b">
          <ProjectTabs projectId={id} riskCount={riskCounts.highRisks} />
        </div>
      </div>

      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
