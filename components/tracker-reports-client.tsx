"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  generateAIStatusReport,
  createStatusReport,
  deleteStatusReport,
  createChangeRequest,
  updateChangeRequest,
  deleteChangeRequest,
  createHealthSnapshot,
} from "@/lib/actions"
import { TrackerProject, StatusReport, ChangeRequest, HealthSnapshot } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Brain, FileText, GitPullRequest, Plus, Trash2, Activity, ChevronDown, ChevronUp } from "lucide-react"
import { format, parseISO } from "date-fns"

interface Props {
  projectId: string
  trackerProject: TrackerProject
  reports: StatusReport[]
  changeRequests: ChangeRequest[]
  healthSnapshots: HealthSnapshot[]
}

const CR_STATUS_BADGE: Record<string, string> = {
  open:     "bg-blue-900/40 border-blue-800/60 text-blue-300",
  approved: "bg-green-900/40 border-green-800/60 text-green-300",
  rejected: "bg-red-900/40 border-red-800/60 text-red-300",
}

function fmt(n: number) { return `$${Math.round(n).toLocaleString("en-US")}` }

export function TrackerReportsClient({ projectId, trackerProject, reports, changeRequests, healthSnapshots }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [generatingAI, setGeneratingAI] = useState(false)
  const [selectedReport, setSelectedReport] = useState<StatusReport | null>(reports[0] ?? null)

  // Health snapshot dialog
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [snapPctComplete, setSnapPctComplete] = useState("")
  const [snapSchedule, setSnapSchedule] = useState<string>("on_track")
  const [snapBudget, setSnapBudget] = useState<string>("on_track")
  const [snapScope, setSnapScope] = useState<string>("on_track")
  const [snapNotes, setSnapNotes] = useState("")

  // Change request dialog
  const [crOpen, setCrOpen] = useState(false)
  const [crTitle, setCrTitle] = useState("")
  const [crDesc, setCrDesc] = useState("")
  const [crBy, setCrBy] = useState("")
  const [crImpactH, setCrImpactH] = useState("")
  const [crImpactC, setCrImpactC] = useState("")

  // Manual report dialog
  const [manualOpen, setManualOpen] = useState(false)
  const [manualContent, setManualContent] = useState("")
  const [manualDate, setManualDate] = useState(new Date().toISOString().split("T")[0])

  function handleGenerateAI() {
    setGeneratingAI(true)
    startTransition(async () => {
      try {
        const { content, reportId } = await generateAIStatusReport(trackerProject.id)
        toast.success("AI report generated.")
        router.refresh()
      } catch (e: any) {
        toast.error(e.message || "Failed to generate AI report.")
      } finally {
        setGeneratingAI(false)
      }
    })
  }

  async function handleSaveSnapshot() {
    startTransition(async () => {
      try {
        await createHealthSnapshot({
          tracker_project_id: trackerProject.id,
          snapshot_date: new Date().toISOString().split("T")[0],
          percent_complete: snapPctComplete ? parseFloat(snapPctComplete) : null,
          schedule_status: snapSchedule as any,
          budget_status: snapBudget as any,
          scope_status: snapScope as any,
          notes: snapNotes || null,
        })
        toast.success("Health check saved.")
        setSnapshotOpen(false)
        router.refresh()
      } catch { toast.error("Failed to save health check.") }
    })
  }

  async function handleSaveCR() {
    if (!crTitle.trim()) { toast.error("Title is required."); return }
    startTransition(async () => {
      try {
        await createChangeRequest({
          tracker_project_id: trackerProject.id,
          title: crTitle.trim(),
          description: crDesc || null,
          requested_by: crBy || null,
          status: "open",
          impact_hours: crImpactH ? parseFloat(crImpactH) : null,
          impact_cost: crImpactC ? parseFloat(crImpactC) : null,
        })
        toast.success("Change request created.")
        setCrOpen(false); setCrTitle(""); setCrDesc(""); setCrBy(""); setCrImpactH(""); setCrImpactC("")
        router.refresh()
      } catch { toast.error("Failed to create change request.") }
    })
  }

  async function handleSaveManualReport() {
    if (!manualContent.trim()) { toast.error("Report content is required."); return }
    startTransition(async () => {
      try {
        await createStatusReport({ tracker_project_id: trackerProject.id, report_date: manualDate, content: manualContent, generated_by: "manual" })
        toast.success("Report saved.")
        setManualOpen(false); setManualContent("")
        router.refresh()
      } catch { toast.error("Failed to save report.") }
    })
  }

  async function handleDeleteReport(id: string) {
    startTransition(async () => {
      try {
        await deleteStatusReport(id)
        toast.success("Report deleted.")
        if (selectedReport?.id === id) setSelectedReport(null)
        router.refresh()
      } catch { toast.error("Failed to delete report.") }
    })
  }

  async function handleUpdateCRStatus(id: string, status: string) {
    startTransition(async () => {
      try {
        await updateChangeRequest(id, { status: status as any })
        toast.success("Change request updated.")
        router.refresh()
      } catch { toast.error("Failed to update.") }
    })
  }

  async function handleDeleteCR(id: string) {
    startTransition(async () => {
      try {
        await deleteChangeRequest(id)
        toast.success("Deleted.")
        router.refresh()
      } catch { toast.error("Failed to delete.") }
    })
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setSnapshotOpen(true)}>
          <Activity className="h-4 w-4 mr-1.5" /> Log Health Check
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCrOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Change Request
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
          <FileText className="h-4 w-4 mr-1.5" /> Write Report
        </Button>
        <Button size="sm" onClick={handleGenerateAI} disabled={generatingAI || isPending}>
          <Brain className="h-4 w-4 mr-1.5" />
          {generatingAI ? "Generating…" : "Generate AI Report"}
        </Button>
      </div>

      {/* Change requests */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <GitPullRequest className="h-4 w-4 text-primary" />
          Change Requests
          <span className="ml-1 text-xs font-normal text-muted-foreground">({changeRequests.filter(c => c.status === "open").length} open)</span>
        </h3>
        {changeRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No change requests. Click "Add Change Request" to log one.</p>
        ) : (
          <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2D45] bg-[#0D1526]/80">
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Requested By</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hours</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cost</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D45]">
                {changeRequests.map(cr => (
                  <tr key={cr.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{cr.title}</p>
                      {cr.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{cr.description}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{cr.requested_by || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{cr.impact_hours != null ? `${cr.impact_hours}h` : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{cr.impact_cost != null ? fmt(cr.impact_cost) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <Select value={cr.status} onValueChange={val => { if (val) handleUpdateCRStatus(cr.id, val) }} disabled={isPending}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleDeleteCR(cr.id)} disabled={isPending} className="text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status reports */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Status Reports
        </h3>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports yet. Generate an AI report or write one manually.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Report list */}
            <div className="space-y-1.5 lg:col-span-1">
              {reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedReport(r)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${selectedReport?.id === r.id ? "border-primary/60 bg-primary/10" : "border-[#1E2D45] hover:border-[#2E3D55]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {format(parseISO(r.report_date), "MMM d, yyyy")}
                    </p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.generated_by === "ai" ? "bg-purple-900/40 text-purple-300" : "bg-gray-800 text-gray-400"}`}>
                      {r.generated_by === "ai" ? "AI" : "Manual"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {r.content.substring(0, 60)}…
                  </p>
                </button>
              ))}
            </div>

            {/* Report viewer */}
            <div className="lg:col-span-2">
              {selectedReport ? (
                <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{format(new Date(selectedReport.report_date), "MMMM d, yyyy")}</p>
                      <p className="text-xs text-muted-foreground">{selectedReport.generated_by === "ai" ? "AI Generated" : "Manual"}</p>
                    </div>
                    <button onClick={() => handleDeleteReport(selectedReport.id)} disabled={isPending} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="prose prose-sm prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">{selectedReport.content}</pre>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-8 text-center h-full flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Select a report to view its content.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Health check history */}
      {healthSnapshots.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Health Check History
          </h3>
          <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2D45] bg-[#0D1526]/80">
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Schedule</th>
                  <th className="text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Budget</th>
                  <th className="text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Scope</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">% Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D45]">
                {healthSnapshots.slice(0, 8).map(snap => {
                  const statusColor = (s: string) =>
                    s === "on_track" || s === "completed" ? "text-green-400" :
                    s.includes("risk") || s.includes("pending") ? "text-amber-400" : "text-red-400"
                  return (
                    <tr key={snap.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-foreground">{format(parseISO(snap.snapshot_date), "MMM d, yyyy")}</td>
                      <td className={`px-4 py-2.5 text-center font-medium capitalize ${statusColor(snap.schedule_status)}`}>{snap.schedule_status.replace("_", " ")}</td>
                      <td className={`px-4 py-2.5 text-center font-medium capitalize ${statusColor(snap.budget_status)}`}>{snap.budget_status.replace("_", " ")}</td>
                      <td className={`px-4 py-2.5 text-center font-medium capitalize ${statusColor(snap.scope_status)}`}>{snap.scope_status.replace("_", " ")}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{snap.percent_complete != null ? `${snap.percent_complete}%` : "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Health snapshot dialog */}
      <Dialog open={snapshotOpen} onOpenChange={setSnapshotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Health Check</DialogTitle>
            <DialogDescription>Record a point-in-time health snapshot for this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Schedule", value: snapSchedule, onChange: (v: string) => setSnapSchedule(v), options: ["on_track", "at_risk", "behind"] },
                { label: "Budget",   value: snapBudget,   onChange: (v: string) => setSnapBudget(v),   options: ["on_track", "at_risk", "over_budget"] },
                { label: "Scope",    value: snapScope,    onChange: (v: string) => setSnapScope(v),    options: ["on_track", "at_risk", "changes_pending"] },
              ].map(f => (
                <div key={f.label} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  <Select value={f.value} onValueChange={val => { if (val) f.onChange(val) }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {f.options.map(o => <SelectItem key={o} value={o} className="text-xs">{o.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">% Complete (optional)</Label>
              <Input type="number" min="0" max="100" value={snapPctComplete} onChange={e => setSnapPctComplete(e.target.value)} placeholder="0–100" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={snapNotes} onChange={e => setSnapNotes(e.target.value)} rows={3} placeholder="Key observations…" className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSnapshotOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveSnapshot} disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change request dialog */}
      <Dialog open={crOpen} onOpenChange={setCrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Change Request</DialogTitle>
            <DialogDescription>Log a scope or cost change request for this project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Title *</Label>
              <Input value={crTitle} onChange={e => setCrTitle(e.target.value)} placeholder="Brief description" className="text-sm h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={crDesc} onChange={e => setCrDesc(e.target.value)} rows={2} placeholder="Details…" className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Requested By</Label>
              <Input value={crBy} onChange={e => setCrBy(e.target.value)} placeholder="Client / PM" className="text-sm h-8" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Impact Hours</Label>
                <Input type="number" value={crImpactH} onChange={e => setCrImpactH(e.target.value)} placeholder="0" className="text-sm h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Impact Cost ($)</Label>
                <Input type="number" value={crImpactC} onChange={e => setCrImpactC(e.target.value)} placeholder="0" className="text-sm h-8" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCrOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveCR} disabled={isPending}>{isPending ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual report dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Write Status Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Report Date</Label>
              <Input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="h-8 text-sm w-48" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Content (Markdown supported)</Label>
              <Textarea value={manualContent} onChange={e => setManualContent(e.target.value)} rows={12} placeholder="# Project Status Report..." className="text-sm font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveManualReport} disabled={isPending}>{isPending ? "Saving…" : "Save Report"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
