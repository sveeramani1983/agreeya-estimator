import { getProjects, getProjectStats, getPipelineData } from "@/lib/actions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Folder, Box, DollarSign, Activity, Clock, ArrowRight, CheckCircle2, TrendingUp } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PipelineDashboardSection } from "@/components/pipeline-dashboard-section"
import { NewProjectModal } from "@/components/new-project-modal"

export default async function EstimatorDashboardPage() {
  const [projects, stats, pipelineData] = await Promise.all([
    getProjects(),
    getProjectStats(),
    getPipelineData(),
  ])

  const recentProjects = projects.slice(0, 5)

  const kpis = [
    { title: "Total Estimates", value: stats.totalProjects, icon: Folder, color: "text-blue-600", desc: "Lifetime bids & estimates" },
    { title: "In-Flight Estimates", value: stats.activeEstimates, icon: Activity, color: "text-orange-600", desc: "Currently in progress" },
    { title: "Won Deals", value: stats.wonProjects, icon: CheckCircle2, color: "text-green-600", desc: "Successfully won & closed" },
    { title: "Pipeline Value", value: `$${stats.totalValue.toLocaleString()}`, icon: DollarSign, color: "text-purple-600", desc: "Total quoted value" },
  ]

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-foreground">Estimator Dashboard</h2>
          <p className="text-muted-foreground text-lg">Welcome back. Here's what's happening with your estimates.</p>
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
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-foreground">{kpi.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{kpi.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Recent Estimates */}
        <Card className="lg:col-span-2 shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Estimates</CardTitle>
              <CardDescription>Your most recently updated proposals</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects" className="gap-2">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentProjects.length > 0 ? (
                recentProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}/estimate`}
                    className="flex items-center justify-between p-4 rounded-xl border border-[#1E2D45] hover:border-primary hover:bg-[#162032] transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-[#1E2D45] flex items-center justify-center text-[#94A3B8] group-hover:bg-primary group-hover:text-white transition-colors">
                        <Folder className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{project.client_name} • Updated {format(new Date(project.updated_at), "MMM d, yyyy")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className="capitalize">{project.status}</Badge>
                      <ArrowRight className="h-4 w-4 text-[#1E2D45] group-hover:text-primary transition-colors" />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center space-y-3 border-2 border-dashed rounded-xl">
                   <Clock className="h-8 w-8 text-muted-foreground opacity-20" />
                   <p className="text-sm text-muted-foreground font-medium">No estimates found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats / Performance */}
        <div className="space-y-6">
          <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-sidebar" />
                Estimation Health
              </CardTitle>
              <CardDescription>Accuracy and coverage metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                 <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground font-medium">Estimate vs Actual</span>
                    <span className="font-bold text-green-600">+4.2%</span>
                 </div>
                 <div className="h-2 w-full bg-[#1E2D45] rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 w-[85%]" />
                 </div>
                 <p className="text-[10px] text-muted-foreground italic">Based on battle-tested components (Placeholder)</p>
              </div>

              <Separator className="opacity-50" />

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded bg-blue-900/20 flex items-center justify-center shrink-0">
                    <Box className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">High Confidence Score</p>
                    <p className="text-[11px] text-muted-foreground">72% of your WBS items are marked as "High Confidence".</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded bg-orange-900/20 flex items-center justify-center shrink-0">
                    <Activity className="h-4 w-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">Spike Awareness</p>
                    <p className="text-[11px] text-muted-foreground">You have 3 active spikes requiring discovery phases.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-sidebar text-white shadow-xl">
             <CardHeader>
                <CardTitle className="text-white">Quick Action</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <p className="text-sm text-white/70">Ready to start a new engagement? Build an accurate WBS in minutes.</p>
                <Button className="w-full bg-[#F1F5F9] text-sidebar hover:bg-[#E2E8F0] font-bold">New Estimate</Button>
             </CardContent>
          </Card>
        </div>
      </div>

      {/* Pipeline Intelligence */}
      <div className="border-t border-[#1E2D45] pt-10">
        <PipelineDashboardSection data={pipelineData} />
      </div>
    </div>
  )
}
