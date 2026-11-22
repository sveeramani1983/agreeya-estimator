import { getProject, getTrackerProject, getChangeRequests } from "@/lib/actions"
import { notFound } from "next/navigation"
import { TrackerProjectTabs } from "@/components/tracker-project-tabs"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import Link from "next/link"

const LIFECYCLE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700", text: "text-gray-600 dark:text-gray-400", label: "Not Started" },
  in_progress: { bg: "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-800/60", text: "text-blue-700 dark:text-blue-300", label: "In Progress" },
  on_hold:     { bg: "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-800/60", text: "text-amber-700 dark:text-amber-300", label: "On Hold" },
  completed:   { bg: "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-800/60", text: "text-green-700 dark:text-green-300", label: "Completed" },
}

export default async function TrackerProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [project, trackerProject] = await Promise.all([
    getProject(id),
    getTrackerProject(id),
  ])

  if (!project || !trackerProject) {
    notFound()
  }

  const changeRequests = await getChangeRequests(trackerProject.id)
  const openChanges = changeRequests.filter(c => c.status === 'open').length

  const badge = LIFECYCLE_BADGE[project.project_status ?? "not_started"] ?? LIFECYCLE_BADGE.not_started

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb className="print:hidden">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/tracker">Tracker</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/tracker/projects">Projects</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{project.client_name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
          <Link
            href={`/projects/${id}/summary`}
            className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
          >
            View in Estimator →
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border print:hidden">
        <TrackerProjectTabs projectId={id} changeCount={openChanges} />
      </div>

      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
