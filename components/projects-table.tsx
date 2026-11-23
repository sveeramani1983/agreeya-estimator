"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  MoreHorizontal, 
  Edit, 
  Copy, 
  Trash2, 
  FileSearch,
  ArrowUpDown,
  Search
} from "lucide-react"
import { format } from "date-fns"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { toast } from "sonner"
import { deleteProject, duplicateProject, getProjectSummaryData } from "@/lib/actions"
import { Project, ProjectStatus } from "@/lib/types"

interface ProjectsTableProps {
  initialProjects: Project[]
}

const statusColors: Record<ProjectStatus, string> = {
  draft: "bg-[#1E2D45] text-[#94A3B8] border-[#2D3F5A]",
  submitted: "bg-blue-900/30 text-blue-300 border-blue-800/50",
  won: "bg-green-900/30 text-green-300 border-green-800/50",
  lost: "bg-red-900/30 text-red-300 border-red-800/50",
}

export function ProjectsTable({ initialProjects }: ProjectsTableProps) {
  const [projects, setProjects] = useState(initialProjects)
  const [search, setSearch] = useState("")
  const [sortConfig, setSortConfig] = useState<{ key: keyof Project; direction: 'asc' | 'desc' } | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [summaryData, setSummaryData] = useState<{ baseHours: number, contingencyAndOverhead: number, finalCost: number } | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const router = useRouter()

  const handleViewSummary = async (project: Project) => {
    setSelectedProject(project)
    setSummaryData(null)
    setLoadingSummary(true)
    try {
      const data = await getProjectSummaryData(project.id)
      setSummaryData(data)
    } catch (error) {
      console.error("Error fetching summary:", error)
      toast.error("Failed to load project summary")
    } finally {
      setLoadingSummary(false)
    }
  }

  const handleSort = (key: keyof Project) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const sortedProjects = [...projects].sort((a, b) => {
    if (!sortConfig) return 0
    const { key, direction } = sortConfig
    const aValue = a[key] ?? ""
    const bValue = b[key] ?? ""
    
    if (aValue < bValue) return direction === 'asc' ? -1 : 1
    if (aValue > bValue) return direction === 'asc' ? 1 : -1
    return 0
  })

  const filteredProjects = sortedProjects.filter(
    (p) => 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      (p.client_name ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async () => {
    if (!projectToDelete) return
    try {
      await deleteProject(projectToDelete)
      setProjects(projects.filter(p => p.id !== projectToDelete))
      toast.success("Project deleted successfully")
    } catch (error) {
      toast.error("Failed to delete project")
    } finally {
      setProjectToDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects or clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-md border border-[#1E2D45] bg-[#111827]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                Estimate Title <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('client_name')}>
                Client <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
                Status <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => handleSort('total_hours')}>
                Est. Hours <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => handleSort('resource_hours_loaded')}>
                Resource Hours <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => handleSort('total_cost')}>
                Cost <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
              </TableHead>
              <TableHead className="text-right">
                Quoted Price
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('updated_at')}>
                Last Updated <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProjects.length > 0 ? (
              filteredProjects.map((project) => {
                const quotedPrice = project.total_cost ? Math.round(project.total_cost * (1 + (project.margin_percent ?? 0) / 100)) : 0;
                return (
                <TableRow key={project.id} className="cursor-pointer hover:bg-[#1E2D45]/50 transition-colors" onClick={() => router.push(`/projects/${project.id}/review`)}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell>
                    {project.client_id ? (
                      <Link
                        href={`/clients/${project.client_id}`}
                        onClick={e => e.stopPropagation()}
                        className="hover:text-primary transition-colors hover:underline underline-offset-2"
                      >
                        {project.client_name}
                      </Link>
                    ) : (
                      project.client_name
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[project.status]}>
                      {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{project.total_hours?.toFixed(1) || "0.0"}</TableCell>
                  <TableCell className="text-right">{project.resource_hours_loaded?.toFixed(1) || "0.0"}</TableCell>
                  <TableCell className="text-right">${project.total_cost?.toLocaleString('en-US') || "0"}</TableCell>
                  <TableCell className="text-right font-semibold text-green-400">${quotedPrice.toLocaleString('en-US')}</TableCell>
                  <TableCell>{format(new Date(project.updated_at), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => router.push(`/projects/${project.id}/estimate`)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewSummary(project)}>
                            <FileSearch className="mr-2 h-4 w-4" /> View Review
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={async () => {
                            const toastId = toast.loading("Duplicating estimate…")
                            try {
                              const { id } = await duplicateProject(project.id)
                              toast.dismiss(toastId)
                              toast.success("Estimate duplicated")
                              router.push(`/projects/${id}/estimate`)
                            } catch {
                              toast.error("Failed to duplicate estimate", { id: toastId })
                            }
                          }}>
                            <Copy className="mr-2 h-4 w-4" /> Duplicate
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuItem 
                            className="text-red-600 focus:text-red-600"
                            onClick={() => setProjectToDelete(project.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  No projects found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the project
              and all its estimation data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!selectedProject} onOpenChange={(open) => !open && setSelectedProject(null)}>
        <SheetContent className="sm:max-w-2xl sm:!max-w-2xl">
          <SheetHeader>
            <SheetTitle>Project Summary</SheetTitle>
            <SheetDescription>
              Overview for {selectedProject?.name}
            </SheetDescription>
          </SheetHeader>
          {selectedProject && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Client</p>
                  <p className="font-medium">{selectedProject.client_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusColors[selectedProject.status] + " capitalize"}>
                    {selectedProject.status}
                  </Badge>
                </div>
              </div>
              
              <div className="rounded-xl border bg-muted/30 p-5 space-y-4 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Base Hours</span>
                  <span className="font-semibold">
                    {summaryData ? summaryData.baseHours.toFixed(1) : loadingSummary ? "..." : selectedProject.total_hours?.toFixed(1) || "0.0"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Contingency & Overhead</span>
                  <span className="font-semibold text-primary">
                    {summaryData ? summaryData.contingencyAndOverhead.toFixed(1) : loadingSummary ? "..." : "0.0"}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-foreground">Total Estimated Cost</span>
                  <span className="text-xl font-bold text-primary">
                    ${summaryData ? summaryData.finalCost.toLocaleString('en-US') : loadingSummary ? "..." : selectedProject.total_cost?.toLocaleString('en-US') || "0"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Description</p>
                <p className="text-sm text-muted-foreground bg-[#0D1526] p-3 rounded-md border border-[#1E2D45] italic">
                  {selectedProject.description || "No description provided."}
                </p>
              </div>

              <div className="pt-4 flex gap-2">
                <Button className="flex-1 bg-sidebar text-white hover:bg-sidebar-accent" onClick={() => router.push(`/projects/${selectedProject.id}`)}>
                  Open Workspace
                </Button>
                <Button variant="outline" onClick={() => setSelectedProject(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
