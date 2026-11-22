import { getProject, getTrackerProject } from "@/lib/actions"
import { notFound, redirect } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import Link from "next/link"
import { Activity } from "lucide-react"
import { TrackerSetupForm } from "@/components/tracker-setup-form"

export default async function TrackerSetupPage({ params }: { params: Promise<{ estimatorProjectId: string }> }) {
  const { estimatorProjectId } = await params
  const [project, trackerProject] = await Promise.all([
    getProject(estimatorProjectId),
    getTrackerProject(estimatorProjectId),
  ])

  if (!project) notFound()
  if (project.status !== "won") redirect(`/projects/${estimatorProjectId}/summary`)
  if (trackerProject) redirect(`/tracker/projects/${estimatorProjectId}/overview`)

  const baselineCost = project.total_cost ?? 0

  return (
    <div className="flex flex-col h-full space-y-6 max-w-3xl">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/tracker">Tracker</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/projects/${estimatorProjectId}/summary`}>{project.name}</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Set Up Tracker</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-lg bg-amber-900/20 border border-amber-800/40 p-2">
          <Activity className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Set Up Project Tracker</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure delivery tracking for <span className="text-foreground font-medium">{project.name}</span>. You can update these details later.
          </p>
        </div>
      </div>

      <TrackerSetupForm
        estimatorProjectId={estimatorProjectId}
        projectName={project.name}
        baselineCost={baselineCost}
      />
    </div>
  )
}
