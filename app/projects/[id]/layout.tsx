import { getProject, getAssumptionCounts, getTrackerProject } from "@/lib/actions"
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
import { Activity, Building2, ExternalLink } from "lucide-react"
import { headers } from "next/headers"

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const headersList = await headers()
  if (headersList.get("x-is-pdf") === "1") {
    return <>{children}</>
  }

  const { id } = await params
  const [project, riskCounts, trackerProject] = await Promise.all([
    getProject(id),
    getAssumptionCounts(id),
    getTrackerProject(id),
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
              <BreadcrumbLink render={<Link href="/projects">Estimates</Link>} />
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
            {project.client_name && (
              <div className="mt-1.5">
                {project.client_id ? (
                  <Link
                    href={`/clients/${project.client_id}`}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors group"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span>{project.client_name}</span>
                    <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-70 transition-opacity" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {project.client_name}
                  </span>
                )}
              </div>
            )}
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

        {/* Tracker redirect banner — below tabs */}
        {project.status === "won" && (
          trackerProject ? (
            <div className="flex items-center gap-3 rounded-lg border border-blue-800/40 bg-blue-900/10 px-4 py-2.5 text-sm print:hidden">
              <Activity className="h-4 w-4 text-blue-400 shrink-0" />
              <p className="text-blue-300">
                This estimate is in active tracking.{" "}
                <Link href={`/tracker/projects/${id}/overview`} className="font-semibold underline underline-offset-2 hover:text-blue-200 transition-colors">
                  View in Project Tracker →
                </Link>
                {" "}Changes here won't automatically update the baseline.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-amber-800/40 bg-amber-900/10 px-4 py-2.5 text-sm print:hidden">
              <Activity className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-amber-300">
                This project was won — start tracking actuals.{" "}
                <Link href={`/tracker/setup/${id}`} className="font-semibold underline underline-offset-2 hover:text-amber-200 transition-colors">
                  Set up Project Tracker →
                </Link>
              </p>
            </div>
          )
        )}
      </div>

      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
