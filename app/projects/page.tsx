import { getProjects, getProjectStats } from "@/lib/actions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Folder, Activity, CheckCircle2, DollarSign, Plus } from "lucide-react"
import { ProjectsTable } from "@/components/projects-table"
import { NewProjectModal } from "@/components/new-project-modal"
import { Button } from "@/components/ui/button"

export default async function ProjectsPage() {
  const [projects, stats] = await Promise.all([
    getProjects(),
    getProjectStats(),
  ])

  const kpis = [
    { 
      title: "Total Estimates", 
      value: stats.totalProjects, 
      icon: Folder, 
      color: "text-blue-600" 
    },
    { 
      title: "In-Flight Estimates", 
      value: stats.activeEstimates, 
      icon: Activity, 
      color: "text-orange-600" 
    },
    { 
      title: "Won Deals", 
      value: stats.wonProjects, 
      icon: CheckCircle2, 
      color: "text-green-600" 
    },
    { 
      title: "Pipeline Value", 
      value: `$${stats.totalValue.toLocaleString()}`, 
      icon: DollarSign, 
      color: "text-purple-600" 
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-foreground">Estimates</h2>
          <p className="text-muted-foreground">Manage your portfolio of estimates, bids, and proposals.</p>
        </div>
        <NewProjectModal />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="shadow-sm border-[#1E2D45] bg-[#111827]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-[#94A3B8] uppercase tracking-wider">
                {kpi.title}
              </CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {projects.length > 0 ? (
        <ProjectsTable initialProjects={projects} />
      ) : (
        <Card className="border-2 border-dashed border-[#1E2D45] shadow-none bg-[#111827]">
          <CardContent className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-6">
            <div className="h-20 w-20 rounded-full bg-[#1E2D45] flex items-center justify-center">
              <Folder className="h-10 w-10 text-[#94A3B8]" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-foreground">No estimates found</h3>
              <p className="text-[#94A3B8] max-w-sm mx-auto">
                You haven't created any estimates yet. Click the button below to start your first proposal.
              </p>
            </div>
            <NewProjectModal />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
