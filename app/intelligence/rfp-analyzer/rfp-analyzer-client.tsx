"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  FileUp, Sparkles, FileText, AlertTriangle, DollarSign,
  CheckCircle, CheckCircle2, XCircle, Clock, BarChart2,
  ChevronDown, ChevronRight, Copy, Download, Loader2,
  Target, HelpCircle, Shield, ClipboardList, X, Filter,
  FolderPlus, FolderOpen,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { saveRfpAnalysis, importWBSFromRFP, createProject, SuggestedWBSComponent } from "@/lib/actions"

// ── Types ────────────────────────────────────────────────────────────────────

interface RFPAnalysis {
  projectTitle: string
  clientName: string
  projectType: string
  summary: string
  timeline: {
    submissionDeadline: string | null
    projectStartDate: string | null
    projectDuration: string | null
    keyMilestones: string[]
  }
  budget: {
    estimatedValue: string | null
    budgetRange: string | null
    contractType: string
  }
  requirements: Array<{
    id: string
    title: string
    description: string
    type: "functional" | "non-functional" | "compliance" | "technical"
    priority: "must-have" | "should-have" | "nice-to-have"
    complexity: "simple" | "medium" | "complex" | "very-complex"
  }>
  technicalRequirements: Array<{ category: string; requirement: string }>
  complianceRequirements: Array<{
    standard: string
    description: string
    mandatory: boolean
  }>
  evaluationCriteria: Array<{
    criterion: string
    weight: string | null
    description: string
  }>
  redFlags: Array<{
    severity: "high" | "medium" | "low"
    title: string
    description: string
    recommendation: string
  }>
  opportunities: Array<{ title: string; description: string }>
  suggestedWBS: SuggestedWBSComponent[]
  bidRecommendation: {
    recommendation: "pursue" | "caution" | "no-bid"
    score: number
    rationale: string
    keyRisks: string[]
    keyStrengths: string[]
  }
  questionsForClient: Array<{
    category: string
    question: string
    importance: "critical" | "important" | "nice-to-know"
  }>
}

interface AnalysisRecord {
  id: string
  filename: string | null
  file_size: number | null
  created_at: string
  analysis_json: string
}

interface ProjectRef {
  id: string
  name: string
  client_name: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  "Reading document...",
  "Extracting requirements...",
  "Identifying risks...",
  "Generating WBS suggestions...",
  "Building bid recommendation...",
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function priorityBadge(p: string) {
  if (p === "must-have") return "bg-red-900/30 text-red-300 border-red-800/50"
  if (p === "should-have") return "bg-amber-900/30 text-amber-300 border-amber-800/50"
  return "bg-[#1E2D45] text-[#94A3B8] border-[#2D3F5A]"
}

function typeBadge(t: string) {
  if (t === "functional") return "bg-blue-900/30 text-blue-300 border-blue-800/50"
  if (t === "non-functional") return "bg-purple-900/30 text-purple-300 border-purple-800/50"
  if (t === "compliance") return "bg-amber-900/30 text-amber-300 border-amber-800/50"
  return "bg-[#1E2D45] text-[#94A3B8] border-[#2D3F5A]"
}

function complexityBadge(c: string) {
  if (c === "very-complex" || c === "very_complex") return "bg-red-900/30 text-red-300 border-red-800/50"
  if (c === "complex") return "bg-amber-900/30 text-amber-300 border-amber-800/50"
  if (c === "medium") return "bg-blue-900/30 text-blue-300 border-blue-800/50"
  return "bg-green-900/30 text-green-300 border-green-800/50"
}

function confidenceBadge(c: string) {
  if (c === "high") return "bg-green-900/30 text-green-300 border-green-800/50"
  if (c === "medium") return "bg-amber-900/30 text-amber-300 border-amber-800/50"
  return "bg-red-900/30 text-red-300 border-red-800/50"
}

function parseWeightPct(w: string | null): number | null {
  if (!w) return null
  const m = w.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function BidRecommendationCard({ rec }: { rec: RFPAnalysis["bidRecommendation"] }) {
  const isPursue = rec.recommendation === "pursue"
  const isCaution = rec.recommendation === "caution"

  const bg = isPursue
    ? "border-green-800/50 bg-green-900/10"
    : isCaution
    ? "border-amber-800/50 bg-amber-900/10"
    : "border-red-800/50 bg-red-900/10"

  const label = isPursue ? "PURSUE" : isCaution ? "CAUTION" : "NO-BID"
  const icon = isPursue ? "🟢" : isCaution ? "🟡" : "🔴"
  const scoreColor = isPursue ? "text-green-400" : isCaution ? "text-amber-400" : "text-red-400"

  return (
    <Card className={`shadow-sm ${bg}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-base font-semibold text-foreground">
          <span className="text-2xl">{icon}</span>
          Bid Recommendation
          <span className={`ml-auto text-3xl font-black tabular-nums ${scoreColor}`}>
            {rec.score}
          </span>
          <span className="text-sm font-normal text-muted-foreground">/ 100</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${scoreColor}`}>
          {label}
        </div>
        <p className="text-sm text-[#94A3B8] leading-relaxed">{rec.rationale}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {rec.keyStrengths?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-green-400">Strengths</p>
              <ul className="space-y-1">
                {rec.keyStrengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#94A3B8]">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rec.keyRisks?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400">Key Risks</p>
              <ul className="space-y-1">
                {rec.keyRisks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[#94A3B8]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function OverviewTab({ analysis }: { analysis: RFPAnalysis }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-black text-foreground">{analysis.projectTitle || "Untitled RFP"}</h3>
        <p className="mt-1 text-muted-foreground">{analysis.clientName}</p>
        <p className="mt-3 text-sm text-[#94A3B8] leading-relaxed">{analysis.summary}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              <Clock className="h-3.5 w-3.5" /> Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1 text-sm">
            {analysis.timeline.submissionDeadline && (
              <p><span className="text-muted-foreground">Deadline:</span> <span className="text-foreground font-medium">{analysis.timeline.submissionDeadline}</span></p>
            )}
            {analysis.timeline.projectDuration && (
              <p><span className="text-muted-foreground">Duration:</span> <span className="text-foreground font-medium">{analysis.timeline.projectDuration}</span></p>
            )}
            {analysis.timeline.projectStartDate && (
              <p><span className="text-muted-foreground">Start:</span> <span className="text-foreground font-medium">{analysis.timeline.projectStartDate}</span></p>
            )}
            {!analysis.timeline.submissionDeadline && !analysis.timeline.projectDuration && (
              <p className="text-muted-foreground">Not specified</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              <DollarSign className="h-3.5 w-3.5" /> Budget
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1 text-sm">
            {analysis.budget.estimatedValue && (
              <p className="font-semibold text-foreground">{analysis.budget.estimatedValue}</p>
            )}
            {analysis.budget.budgetRange && (
              <p className="text-[#94A3B8]">{analysis.budget.budgetRange}</p>
            )}
            <p><span className="text-muted-foreground">Contract:</span> <span className="text-foreground font-medium">{analysis.budget.contractType}</span></p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              <Target className="h-3.5 w-3.5" /> Project Type
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm">
            <p className="font-semibold text-foreground">{analysis.projectType || "Not specified"}</p>
            {analysis.timeline.keyMilestones?.length > 0 && (
              <ul className="mt-2 space-y-1">
                {analysis.timeline.keyMilestones.slice(0, 3).map((m, i) => (
                  <li key={i} className="text-xs text-[#94A3B8] flex items-start gap-1">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-blue-400" />
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <BidRecommendationCard rec={analysis.bidRecommendation} />

      {analysis.opportunities?.length > 0 && (
        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#94A3B8]">
              <Sparkles className="h-4 w-4 text-blue-400" />
              Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {analysis.opportunities.map((opp, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-foreground">{opp.title}</p>
                <p className="text-xs text-[#94A3B8]">{opp.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RequirementsTab({ analysis }: { analysis: RFPAnalysis }) {
  const [filterType, setFilterType] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [filterComplexity, setFilterComplexity] = useState("all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const reqs = analysis.requirements || []

  const filtered = reqs.filter((r) => {
    if (filterType !== "all" && r.type !== filterType) return false
    if (filterPriority !== "all" && r.priority !== filterPriority) return false
    if (filterComplexity !== "all" && r.complexity !== filterComplexity) return false
    return true
  })

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const mustHave = reqs.filter((r) => r.priority === "must-have").length
  const shouldHave = reqs.filter((r) => r.priority === "should-have").length
  const niceToHave = reqs.filter((r) => r.priority === "nice-to-have").length
  const functional = reqs.filter((r) => r.type === "functional").length
  const nonFunctional = reqs.filter((r) => r.type === "non-functional").length
  const compliance = reqs.filter((r) => r.type === "compliance").length

  const exportExcel = () => {
    const rows = [
      ["ID", "Title", "Type", "Priority", "Complexity", "Description"],
      ...reqs.map((r) => [r.id, r.title, r.type, r.priority, r.complexity, r.description]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "requirements.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {[
          { label: "Must-Have", count: mustHave, color: "text-red-400" },
          { label: "Should-Have", count: shouldHave, color: "text-amber-400" },
          { label: "Nice-to-Have", count: niceToHave, color: "text-[#94A3B8]" },
          { label: "Functional", count: functional, color: "text-blue-400" },
          { label: "Non-Functional", count: nonFunctional, color: "text-purple-400" },
          { label: "Compliance", count: compliance, color: "text-amber-400" },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-sm">
            <span className={`font-bold tabular-nums ${color}`}>{count}</span>
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {[
          { value: filterType, setter: setFilterType, options: ["all", "functional", "non-functional", "compliance", "technical"], label: "Type" },
          { value: filterPriority, setter: setFilterPriority, options: ["all", "must-have", "should-have", "nice-to-have"], label: "Priority" },
          { value: filterComplexity, setter: setFilterComplexity, options: ["all", "simple", "medium", "complex", "very-complex"], label: "Complexity" },
        ].map(({ value, setter, options, label }) => (
          <Select key={label} value={value} onValueChange={(v) => v !== null && setter(v)}>
            <SelectTrigger className="h-8 w-[140px] text-xs bg-[#111827] border-[#1E2D45]">
              <SelectValue placeholder={label} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o} className="text-xs capitalize">
                  {o === "all" ? `All ${label}s` : o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <Button variant="outline" size="sm" onClick={exportExcel} className="ml-auto h-8 text-xs border-[#1E2D45] bg-[#111827]">
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-[#1E2D45] bg-[#111827]">
        <Table>
          <TableHeader className="bg-[#0D1526]">
            <TableRow>
              <TableHead className="text-xs w-8" />
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider w-20">ID</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider">Title</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider w-28">Type</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider w-28">Priority</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider w-28">Complexity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground text-sm">
                  No requirements match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((req) => (
                <>
                  <TableRow
                    key={req.id}
                    className="cursor-pointer hover:bg-[#1E2D45]/30"
                    onClick={() => toggle(req.id)}
                  >
                    <TableCell className="text-muted-foreground">
                      {expanded.has(req.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{req.id}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{req.title}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${typeBadge(req.type)}`}>
                        {req.type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${priorityBadge(req.priority)}`}>
                        {req.priority}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${complexityBadge(req.complexity)}`}>
                        {req.complexity}
                      </span>
                    </TableCell>
                  </TableRow>
                  {expanded.has(req.id) && (
                    <TableRow key={`${req.id}-exp`} className="bg-[#0D1526]/50">
                      <TableCell colSpan={6} className="px-8 py-3 text-sm text-[#94A3B8]">
                        {req.description}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {analysis.complianceRequirements?.length > 0 && (
        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#94A3B8]">
              <Shield className="h-4 w-4 text-amber-400" />
              Compliance Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {analysis.complianceRequirements.map((cr, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${cr.mandatory ? "bg-red-900/30 text-red-300 border-red-800/50" : "bg-[#1E2D45] text-[#94A3B8] border-[#2D3F5A]"}`}>
                  {cr.standard}
                </span>
                <p className="text-sm text-[#94A3B8]">{cr.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function WBSTab({
  analysis,
  projects,
  onImported,
  projectName,
  setProjectName,
  onProjectCreated,
}: {
  analysis: RFPAnalysis
  projects: ProjectRef[]
  onImported: () => void
  projectName: string
  setProjectName: (name: string) => void
  onProjectCreated?: (project: ProjectRef) => void
}) {
  const router = useRouter()
  const wbs = analysis.suggestedWBS || []
  const [selected, setSelected] = useState<Set<number>>(new Set(wbs.map((_, i) => i)))
  const [importOpen, setImportOpen] = useState(false)
  const [importMode, setImportMode] = useState<"new" | "existing">("new")
  const [targetProject, setTargetProject] = useState(projects[0]?.id || "")
  const [newProjectName, setNewProjectName] = useState(projectName || analysis.projectTitle || "")
  const [newClientName, setNewClientName] = useState(analysis.clientName || "")
  const [importing, setImporting] = useState(false)

  // Re-sync selected items when analysis changes
  useEffect(() => {
    setSelected(new Set((analysis.suggestedWBS || []).map((_, i) => i)))
  }, [analysis])

  // Sync state when dialog opens
  useEffect(() => {
    if (importOpen) {
      setNewProjectName(projectName || analysis.projectTitle || "")
      setNewClientName(analysis.clientName || "")
      if (projects.length === 0) {
        setImportMode("new")
      }
    }
  }, [importOpen, projectName, analysis.projectTitle, analysis.clientName, projects.length])

  const allSelected = selected.size === wbs.length
  const libraryMatchedCount = wbs.filter((c) => c.source === "library" || !!c.libraryComponentId).length
  const customCount = wbs.length - libraryMatchedCount

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(wbs.map((_, i) => i)))
  const toggleItem = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  const handleImport = async () => {
    const components = Array.from(selected).map((i) => wbs[i])
    if (components.length === 0) {
      toast.error("No components selected for import")
      return
    }

    setImporting(true)
    try {
      let finalProjectId = targetProject
      if (importMode === "new") {
        const trimmedName = newProjectName.trim()
        if (!trimmedName) {
          toast.error("Please enter a project name")
          setImporting(false)
          return
        }
        const clientVal = newClientName.trim() || analysis.clientName || "General Client"
        const created = await createProject({
          name: trimmedName,
          client_name: clientVal,
          description: analysis.summary || undefined,
        })
        finalProjectId = created.id
        setProjectName(trimmedName)
        if (onProjectCreated) {
          onProjectCreated({ id: created.id, name: trimmedName, client_name: clientVal })
        }
      } else {
        if (!finalProjectId) {
          toast.error("Please select an existing project")
          setImporting(false)
          return
        }
      }

      await importWBSFromRFP(finalProjectId, components)
      toast.success(
        importMode === "new"
          ? `Created project "${newProjectName.trim()}" and imported ${components.length} components`
          : `Imported ${components.length} components to project`
      )
      setImportOpen(false)
      onImported()
      router.push(`/projects/${finalProjectId}/estimate`)
    } catch (err) {
      console.error("[RFP Import] Error:", err)
      toast.error("Import failed")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#94A3B8]">
        Based on the RFP analysis, here are the suggested WBS components. Review and import the ones that apply to your estimate.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={toggleAll} className="h-8 text-xs border-[#1E2D45] bg-[#111827]">
          {allSelected ? "Deselect All" : "Select All"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {selected.size} of {wbs.length} selected
        </span>
        {wbs.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="inline-flex items-center rounded-full border border-emerald-800/50 bg-emerald-900/20 px-2.5 py-0.5 font-medium text-emerald-300">
              {libraryMatchedCount} Library Match{libraryMatchedCount !== 1 ? "es" : ""}
            </span>
            <span className="inline-flex items-center rounded-full border border-purple-800/50 bg-purple-900/20 px-2.5 py-0.5 font-medium text-purple-300">
              {customCount} AI Custom
            </span>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-[#1E2D45] bg-[#111827]">
        <Table>
          <TableHeader className="bg-[#0D1526]">
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider w-28">Source</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider">Category</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider">Component</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider w-28">Complexity</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider text-right w-14">SP</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider text-right w-16">Hours</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider w-20">Confidence</TableHead>
              <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider">Rationale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wbs.map((comp, i) => {
              const isLibraryMatch = comp.source === "library" || !!comp.libraryComponentId
              return (
                <TableRow
                  key={i}
                  className={`cursor-pointer ${selected.has(i) ? "bg-blue-900/5" : "opacity-50"} hover:bg-[#1E2D45]/20`}
                  onClick={() => toggleItem(i)}
                >
                  <TableCell>
                    <div className={`h-4 w-4 rounded border ${selected.has(i) ? "bg-blue-600 border-blue-600" : "border-[#2D3F5A]"} flex items-center justify-center`}>
                      {selected.has(i) && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isLibraryMatch ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-800/50 bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        Library Match
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-purple-800/50 bg-purple-900/30 px-2 py-0.5 text-xs font-medium text-purple-300">
                        AI Custom
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-[#1E2D45] text-[#94A3B8] border-[#2D3F5A] text-xs">
                      {comp.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">{comp.componentName}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{comp.description}</p>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${complexityBadge(comp.complexity)}`}>
                      {(comp.complexity || "medium").replace(/[_-]/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">{comp.storyPoints}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">{comp.baseHours}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${confidenceBadge(comp.confidence)}`}>
                      {comp.confidence}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{comp.rationale}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => setImportOpen(true)}
          disabled={selected.size === 0}
          className="bg-blue-600 text-white hover:bg-blue-700 gap-2"
        >
          <Download className="h-4 w-4" />
          Import {selected.size} Selected to Project WBS →
        </Button>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import to Project WBS</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Import {selected.size} WBS component{selected.size !== 1 ? "s" : ""} into a new or existing project.
            </p>

            {/* Mode Selector */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#0D1526] rounded-lg border border-[#1E2D45]">
              <button
                type="button"
                onClick={() => setImportMode("new")}
                className={`py-1.5 px-3 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                  importMode === "new"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-[#94A3B8] hover:text-white"
                }`}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Create New Project
              </button>
              <button
                type="button"
                onClick={() => setImportMode("existing")}
                disabled={projects.length === 0}
                className={`py-1.5 px-3 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                  importMode === "existing"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-[#94A3B8] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                }`}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Existing Project ({projects.length})
              </button>
            </div>

            {importMode === "new" ? (
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="import-new-proj-name" className="text-xs font-medium text-[#94A3B8]">
                    Project Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="import-new-proj-name"
                    placeholder="e.g. Acme Cloud Migration"
                    value={newProjectName}
                    onChange={(e) => {
                      setNewProjectName(e.target.value)
                      setProjectName(e.target.value)
                    }}
                    className="bg-[#0D1526] border-[#1E2D45] text-sm h-9 text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-new-client-name" className="text-xs font-medium text-[#94A3B8]">
                    Client Name
                  </Label>
                  <Input
                    id="import-new-client-name"
                    placeholder="e.g. Acme Corporation"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="bg-[#0D1526] border-[#1E2D45] text-sm h-9 text-foreground"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <Label htmlFor="import-existing-proj" className="text-xs font-medium text-[#94A3B8]">
                  Select Existing Project <span className="text-red-400">*</span>
                </Label>
                <Select value={targetProject} onValueChange={(v) => v !== null && setTargetProject(v)}>
                  <SelectTrigger id="import-existing-proj" className="bg-[#0D1526] border-[#1E2D45] h-9 text-sm">
                    <SelectValue placeholder="Select Project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} <span className="text-muted-foreground ml-1">— {p.client_name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projects.length === 0 && (
                  <p className="text-xs text-muted-foreground">No existing projects found.</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing} className="border-[#1E2D45]">
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={
                importing ||
                (importMode === "new" ? !newProjectName.trim() : !targetProject)
              }
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {importMode === "new" ? "Creating & Importing…" : "Importing…"}
                </>
              ) : importMode === "new" ? (
                "Create Project & Import"
              ) : (
                "Confirm Import"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RedFlagsTab({ analysis }: { analysis: RFPAnalysis }) {
  const flags = [...(analysis.redFlags || [])].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.severity] - order[b.severity]
  })

  const cardStyle = (sev: string) => {
    if (sev === "high") return "border-red-800/50 bg-red-900/10"
    if (sev === "medium") return "border-amber-800/50 bg-amber-900/10"
    return "border-yellow-800/50 bg-yellow-900/10"
  }
  const textStyle = (sev: string) => {
    if (sev === "high") return "text-red-300"
    if (sev === "medium") return "text-amber-300"
    return "text-yellow-300"
  }

  return (
    <div className="space-y-3">
      {flags.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
          <CheckCircle className="h-10 w-10 text-green-500" />
          <p className="text-sm text-muted-foreground">No red flags identified.</p>
        </div>
      ) : (
        flags.map((flag, i) => (
          <Card key={i} className={`shadow-sm ${cardStyle(flag.severity)}`}>
            <CardContent className="py-4 space-y-2">
              <div className="flex items-start gap-3">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${textStyle(flag.severity)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold uppercase ${textStyle(flag.severity)} border-current/30`}>
                      {flag.severity}
                    </span>
                    <p className={`font-semibold text-sm ${textStyle(flag.severity)}`}>{flag.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-[#94A3B8]">{flag.description}</p>
                  {flag.recommendation && (
                    <p className="mt-2 text-xs text-[#64748B] flex items-start gap-1.5">
                      <span className="shrink-0">💡</span>
                      {flag.recommendation}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

function EvaluationTab({ analysis }: { analysis: RFPAnalysis }) {
  const criteria = analysis.evaluationCriteria || []

  return (
    <div className="space-y-4">
      {criteria.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No evaluation criteria extracted.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-[#1E2D45] bg-[#111827]">
          <Table>
            <TableHeader className="bg-[#0D1526]">
              <TableRow>
                <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider">Criterion</TableHead>
                <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider w-28">Weight</TableHead>
                <TableHead className="text-xs text-[#94A3B8] uppercase tracking-wider">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {criteria.map((c, i) => {
                const pct = parseWeightPct(c.weight)
                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-foreground text-sm">{c.criterion}</TableCell>
                    <TableCell>
                      {c.weight ? (
                        <div className="space-y-1">
                          <span className="text-sm font-semibold tabular-nums text-foreground">{c.weight}</span>
                          {pct !== null && (
                            <div className="h-1.5 w-full rounded-full bg-[#1E2D45] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-[#94A3B8]">{c.description}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function QuestionsTab({ analysis }: { analysis: RFPAnalysis }) {
  const questions = analysis.questionsForClient || []

  const grouped = questions.reduce<Record<string, typeof questions>>((acc, q) => {
    if (!acc[q.category]) acc[q.category] = []
    acc[q.category].push(q)
    return acc
  }, {})

  const importanceBadge = (imp: string) => {
    if (imp === "critical") return "bg-red-900/30 text-red-300 border-red-800/50"
    if (imp === "important") return "bg-amber-900/30 text-amber-300 border-amber-800/50"
    return "bg-[#1E2D45] text-[#94A3B8] border-[#2D3F5A]"
  }

  const copyAll = () => {
    const text = questions
      .map((q, i) => `${i + 1}. [${q.importance.toUpperCase()}] ${q.question}`)
      .join("\n")
    navigator.clipboard.writeText(text)
    toast.success("Copied all questions to clipboard")
  }

  const copyOne = (q: string) => {
    navigator.clipboard.writeText(q)
    toast.success("Copied to clipboard")
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={copyAll} className="h-8 text-xs border-[#1E2D45] bg-[#111827]">
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy All Questions
        </Button>
      </div>

      {Object.entries(grouped).map(([category, qs]) => (
        <div key={category} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">{category}</h4>
          {qs.map((q, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-[#1E2D45] bg-[#111827] px-4 py-3">
              <span className={`mt-0.5 shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${importanceBadge(q.importance)}`}>
                {q.importance}
              </span>
              <p className="flex-1 text-sm text-foreground">{q.question}</p>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copyOne(q.question)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ))}

      {questions.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No questions generated.</p>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RFPAnalyzerClient({
  initialAnalyses,
  projects,
}: {
  initialAnalyses: AnalysisRecord[]
  projects: ProjectRef[]
}) {
  const [projectList, setProjectList] = useState<ProjectRef[]>(projects)
  const [projectName, setProjectName] = useState("")
  const [activeInputTab, setActiveInputTab] = useState<"file" | "text">("file")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState("")
  const [dragging, setDragging] = useState(false)

  const [analyzing, setAnalyzing] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(0)

  const [analysis, setAnalysis] = useState<RFPAnalysis | null>(null)
  const [analysisFilename, setAnalysisFilename] = useState("")
  const [truncated, setTruncated] = useState(false)

  const [history, setHistory] = useState<AnalysisRecord[]>(initialAnalyses)
  const [activeResultTab, setActiveResultTab] = useState("overview")

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!analyzing) return
    const id = setInterval(() => {
      setLoadingMsg((prev) => (prev + 1) % LOADING_MESSAGES.length)
    }, 2000)
    return () => clearInterval(id)
  }, [analyzing])

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setSelectedFile(file)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  const canAnalyze =
    !analyzing &&
    (activeInputTab === "file" ? selectedFile !== null : pastedText.trim().length > 0)

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setLoadingMsg(0)
    setAnalysis(null)
    setActiveResultTab("overview")

    try {
      const fd = new FormData()
      if (activeInputTab === "file" && selectedFile) {
        fd.append("file", selectedFile)
      } else {
        fd.append("text", pastedText)
      }

      const res = await fetch("/api/analyze-rfp", { method: "POST", body: fd })
      const data = await res.json()

      if (!res.ok || !data.success) {
        console.error("[RFP Client] API error:", data)
        if (data.suggestion === "paste") {
          setActiveInputTab("text")
          toast.error((data.error || "Analysis failed") + " — Switched to paste mode.", { duration: 8000 })
        } else {
          toast.error(data.error || "Analysis failed", { duration: 8000 })
        }
        return
      }

      setAnalysis(data.analysis)
      setAnalysisFilename(data.filename || selectedFile?.name || "pasted-text.txt")
      setTruncated(data.truncated || false)

      // Pre-fill Project Name from AI-extracted project title if user hasn't specified one
      if (!projectName.trim() && data.analysis?.projectTitle) {
        setProjectName(data.analysis.projectTitle)
      }

      // Persist to DB silently
      try {
        const id = await saveRfpAnalysis({
          filename: data.filename || selectedFile?.name || "pasted-text.txt",
          fileSize: data.fileSize || 0,
          analysisJson: JSON.stringify(data.analysis),
        })
        const newRecord: AnalysisRecord = {
          id,
          filename: data.filename || "pasted-text.txt",
          file_size: data.fileSize || 0,
          created_at: new Date().toISOString(),
          analysis_json: JSON.stringify(data.analysis),
        }
        setHistory((prev) => [newRecord, ...prev])
      } catch {
        // non-fatal
      }
    } catch {
      toast.error("Network error — could not reach analysis API")
    } finally {
      setAnalyzing(false)
    }
  }

  const loadFromHistory = (record: AnalysisRecord) => {
    try {
      const parsed = JSON.parse(record.analysis_json)
      setAnalysis(parsed)
      setAnalysisFilename(record.filename || "unknown")
      if (parsed.projectTitle) {
        setProjectName(parsed.projectTitle)
      }
      setActiveResultTab("overview")
    } catch {
      toast.error("Could not load saved analysis")
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-black tracking-tight text-foreground">RFP Analyzer</h2>
          <Badge className="bg-blue-900/30 text-blue-300 border-blue-800/50 text-xs">Live</Badge>
        </div>
        <p className="text-muted-foreground">
          Upload an RFP and let AI extract requirements, surface red flags, and generate WBS suggestions.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* ── Left: Upload Panel ── */}
        <div className="space-y-4">
          <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">Upload RFP Document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Optional Project Name */}
              <div className="space-y-1.5">
                <Label htmlFor="rfp-project-name" className="text-xs font-medium text-[#94A3B8]">
                  Project Name <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="rfp-project-name"
                  placeholder="e.g., Enterprise Cloud Migration"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="bg-[#0D1526] border-[#1E2D45] text-sm h-9 text-foreground placeholder:text-muted-foreground/60"
                />
              </div>

              {/* Tab toggle */}
              <div className="flex border-b border-[#1E2D45]">
                {(["file", "text"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveInputTab(tab)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeInputTab === tab
                        ? "border-b-2 border-blue-500 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "file" ? "Upload File" : "Paste Text"}
                  </button>
                ))}
              </div>

              {activeInputTab === "file" ? (
                <>
                  {/* Dropzone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                      dragging
                        ? "border-blue-500 bg-blue-900/10"
                        : "border-[#1E2D45] bg-[#0D1526] hover:border-[#2D3F5A] hover:bg-[#0D1526]/80"
                    }`}
                  >
                    <FileUp className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium text-[#94A3B8]">Drop your RFP here or click to browse</p>
                    <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT — max 10 MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>

                  {/* Selected file */}
                  {selectedFile && (
                    <div className="flex items-center gap-3 rounded-lg border border-[#1E2D45] bg-[#0D1526] px-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-blue-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <Textarea
                  placeholder="Paste RFP content here..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="h-48 resize-none bg-[#0D1526] border-[#1E2D45] text-sm"
                />
              )}

              {/* Analyze button */}
              <Button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {LOADING_MESSAGES[loadingMsg]}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analyze RFP
                  </>
                )}
              </Button>

              {truncated && (
                <p className="text-xs text-amber-400 text-center">
                  ⚠ Document truncated to first 30,000 characters for analysis.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Analysis History */}
          {history.length > 0 && (
            <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#94A3B8] flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Analysis History
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {history.slice(0, 8).map((record) => {
                  let title = record.filename || "Unknown"
                  try {
                    const parsed = JSON.parse(record.analysis_json)
                    if (parsed.projectTitle) title = parsed.projectTitle
                  } catch {}
                  return (
                    <button
                      key={record.id}
                      onClick={() => loadFromHistory(record)}
                      className="w-full text-left rounded-md px-3 py-2 hover:bg-[#1E2D45]/50 transition-colors"
                    >
                      <p className="text-xs font-medium text-foreground truncate">{title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(record.created_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right: Results Panel ── */}
        <div>
          {!analysis && !analyzing && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] rounded-lg border-2 border-dashed border-[#1E2D45] bg-[#0D1526] text-center space-y-3">
              <FileText className="h-12 w-12 text-[#1E2D45]" />
              <div>
                <p className="text-base font-semibold text-foreground">No analysis yet</p>
                <p className="text-sm text-muted-foreground mt-1">Upload an RFP document and click Analyze</p>
              </div>
            </div>
          )}

          {analyzing && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] rounded-lg border border-[#1E2D45] bg-[#0D1526] text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
              <div>
                <p className="text-base font-semibold text-foreground">{LOADING_MESSAGES[loadingMsg]}</p>
                <p className="text-sm text-muted-foreground mt-1">AI is analyzing your RFP…</p>
              </div>
            </div>
          )}

          {analysis && !analyzing && (
            <div className="space-y-4">
              {/* File info bar */}
              <div className="flex items-center gap-2 rounded-lg border border-blue-800/50 bg-blue-900/20 px-4 py-3">
                <FileText className="h-4 w-4 shrink-0 text-blue-400" />
                <span className="text-sm font-medium text-blue-300 truncate">{analysisFilename}</span>
                <Badge className="ml-auto shrink-0 bg-green-900/30 text-green-300 border-green-800/50 text-xs">
                  Analyzed
                </Badge>
              </div>

              <Tabs value={activeResultTab} onValueChange={setActiveResultTab}>
                <TabsList className="w-full overflow-x-auto flex-nowrap bg-[#0D1526] border border-[#1E2D45] h-auto p-1">
                  {[
                    { id: "overview", label: "Overview", icon: BarChart2 },
                    { id: "requirements", label: `Requirements (${analysis.requirements?.length ?? 0})`, icon: ClipboardList },
                    { id: "wbs", label: `WBS (${analysis.suggestedWBS?.length ?? 0})`, icon: Target },
                    { id: "redflags", label: `Red Flags (${analysis.redFlags?.length ?? 0})`, icon: AlertTriangle },
                    { id: "evaluation", label: "Evaluation", icon: BarChart2 },
                    { id: "questions", label: `Questions (${analysis.questionsForClient?.length ?? 0})`, icon: HelpCircle },
                  ].map(({ id, label, icon: Icon }) => (
                    <TabsTrigger
                      key={id}
                      value={id}
                      className="flex-shrink-0 gap-1.5 text-xs data-[state=active]:bg-[#111827] data-[state=active]:text-white text-[#94A3B8] hover:text-white whitespace-nowrap"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="overview" className="mt-4">
                  <OverviewTab analysis={analysis} />
                </TabsContent>
                <TabsContent value="requirements" className="mt-4">
                  <RequirementsTab analysis={analysis} />
                </TabsContent>
                <TabsContent value="wbs" className="mt-4">
                  <WBSTab
                    analysis={analysis}
                    projects={projectList}
                    onImported={() => {}}
                    projectName={projectName}
                    setProjectName={setProjectName}
                    onProjectCreated={(newProj) => setProjectList((prev) => [newProj, ...prev])}
                  />
                </TabsContent>
                <TabsContent value="redflags" className="mt-4">
                  <RedFlagsTab analysis={analysis} />
                </TabsContent>
                <TabsContent value="evaluation" className="mt-4">
                  <EvaluationTab analysis={analysis} />
                </TabsContent>
                <TabsContent value="questions" className="mt-4">
                  <QuestionsTab analysis={analysis} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
