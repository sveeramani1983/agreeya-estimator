"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { v4 as uuidv4 } from "uuid"
import { Plus, Trash2, Edit, ShieldAlert, AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { toast } from "sonner"

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
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
import { Separator } from "@/components/ui/separator"
import { Card, CardContent } from "@/components/ui/card"

import { Assumption } from "@/lib/types"
import { upsertAssumption, deleteAssumption } from "@/lib/actions"

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Scope",
  "Technical",
  "Resource",
  "Client",
  "Timeline",
  "Commercial",
  "Third Party",
  "Regulatory",
]

// ── Form state types ───────────────────────────────────────────────────────────

type AssumptionFormState = {
  title: string
  description: string
  category: string
  status: Assumption["status"]
}

type RiskFormState = {
  title: string
  description: string
  category: string
  likelihood: "low" | "medium" | "high"
  impact: "low" | "medium" | "high"
  mitigation: string
  owner: string
  status: Assumption["status"]
}

const DEFAULT_ASSUMPTION_FORM: AssumptionFormState = {
  title: "",
  description: "",
  category: "",
  status: "open",
}

const DEFAULT_RISK_FORM: RiskFormState = {
  title: "",
  description: "",
  category: "",
  likelihood: "medium",
  impact: "medium",
  mitigation: "",
  owner: "",
  status: "open",
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcScore(
  likelihood: "low" | "medium" | "high",
  impact: "low" | "medium" | "high"
): number {
  const m = { low: 1, medium: 2, high: 3 }
  return m[likelihood] * m[impact]
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Assumption["status"] }) {
  const map: Record<Assumption["status"], string> = {
    open: "bg-blue-900/30 text-blue-300",
    accepted: "bg-green-900/30 text-green-300",
    resolved: "bg-[#1E2D45] text-[#94A3B8]",
    transferred: "bg-orange-900/30 text-orange-300",
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status]}`}>
      {status}
    </span>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs">—</span>
  const cls = score >= 6 ? "bg-red-900/30 text-red-300" : score >= 3 ? "bg-yellow-900/30 text-yellow-300" : "bg-green-900/30 text-green-300"
  return (
    <span className={`inline-flex items-center justify-center rounded-full w-7 h-7 text-xs font-bold ${cls}`}>
      {score}
    </span>
  )
}

function LevelBadge({ value }: { value: "low" | "medium" | "high" }) {
  const map = { low: "bg-green-900/30 text-green-300", medium: "bg-yellow-900/30 text-yellow-300", high: "bg-red-900/30 text-red-300" }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[value]}`}>
      {value}
    </span>
  )
}

// ── Risk Matrix ────────────────────────────────────────────────────────────────

function riskMatrixColor(likelihood: "low" | "medium" | "high", impact: "low" | "medium" | "high") {
  const score = calcScore(likelihood, impact)
  if (score >= 6) return "bg-red-900/40"
  if (score >= 3) return "bg-yellow-900/40"
  return "bg-green-900/40"
}

function RiskMatrix({ risks }: { risks: Assumption[] }) {
  const likelihoods: Array<"high" | "medium" | "low"> = ["high", "medium", "low"]
  const impacts: Array<"low" | "medium" | "high"> = ["low", "medium", "high"]

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        Risk Matrix
      </h3>
      <div className="overflow-x-auto">
        <div className="inline-grid" style={{ gridTemplateColumns: "80px repeat(3, 1fr)", minWidth: 400 }}>
          <div />
          {impacts.map(imp => (
            <div key={imp} className="text-center text-xs font-semibold text-muted-foreground pb-1 capitalize">
              {imp} Impact
            </div>
          ))}
          {likelihoods.map(lik => (
            <>
              <div key={`label-${lik}`} className="text-xs font-semibold text-muted-foreground flex items-center pr-2 capitalize">
                {lik} Likely
              </div>
              {impacts.map(imp => {
                const cellRisks = risks.filter(r => r.likelihood === lik && r.impact === imp)
                return (
                  <div
                    key={`${lik}-${imp}`}
                    className={`relative min-h-[64px] border border-[#1E2D45] rounded-md m-0.5 p-1.5 flex flex-wrap gap-1 items-start content-start ${riskMatrixColor(lik, imp)}`}
                  >
                    {cellRisks.map(r => (
                      <div
                        key={r.id}
                        title={r.title || "Untitled risk"}
                        className="relative group w-5 h-5 rounded-full bg-[#1E2D45] border border-[#2D3F5A] text-[9px] font-bold flex items-center justify-center cursor-default shadow-sm overflow-visible"
                      >
                        <span className="sr-only">{r.title}</span>
                        <span className="absolute z-10 bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#0A0F1E] text-white text-[10px] px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                          {r.title || "Untitled"}
                        </span>
                        <span className="text-[#94A3B8]">R</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-900/40 border border-green-800" /> Low (1–2)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-900/40 border border-yellow-800" /> Medium (3–4)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-900/40 border border-red-800" /> High (6–9)</span>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface RisksWorkspaceProps {
  projectId: string
  initialItems: Assumption[]
}

export function RisksWorkspace({ projectId, initialItems }: RisksWorkspaceProps) {
  const router = useRouter()
  const [items, setItems] = useState<Assumption[]>(initialItems)
  const [activeTab, setActiveTab] = useState<"assumptions" | "risks">("assumptions")

  // ── Assumption form state (independent)
  const [assumptionForm, setAssumptionForm] = useState<AssumptionFormState>(DEFAULT_ASSUMPTION_FORM)
  const [editingAssumptionId, setEditingAssumptionId] = useState<string | null>(null)
  const [showAssumptionDialog, setShowAssumptionDialog] = useState(false)
  const [savingAssumption, setSavingAssumption] = useState(false)

  // ── Risk form state (completely separate — never shares data with assumption form)
  const [riskForm, setRiskForm] = useState<RiskFormState>(DEFAULT_RISK_FORM)
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null)
  const [showRiskDialog, setShowRiskDialog] = useState(false)
  const [savingRisk, setSavingRisk] = useState(false)

  // ── Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── Derived
  const assumptions = items.filter(i => i.type === "assumption")
  const risks = items.filter(i => i.type === "risk")

  const openAssumptionCount = assumptions.filter(a => a.status === "open").length
  const highRisks = risks.filter(r => (r.risk_score ?? 0) >= 6).length
  const medRisks = risks.filter(r => { const s = r.risk_score ?? 0; return s >= 3 && s < 6 }).length
  const lowRisks = risks.filter(r => (r.risk_score ?? 0) < 3).length

  // ── Live risk score (updates as likelihood/impact dropdowns change)
  const liveRiskScore = useMemo(
    () => calcScore(riskForm.likelihood, riskForm.impact),
    [riskForm.likelihood, riskForm.impact]
  )

  // ── Assumption handlers ────────────────────────────────────────────────────

  const handleAddAssumption = () => {
    setAssumptionForm(DEFAULT_ASSUMPTION_FORM)
    setEditingAssumptionId(null)
    setShowAssumptionDialog(true)
  }

  const handleEditAssumption = (a: Assumption) => {
    setAssumptionForm({
      title: a.title,
      description: a.description ?? "",
      category: a.category ?? "",
      status: a.status,
    })
    setEditingAssumptionId(a.id)
    setShowAssumptionDialog(true)
  }

  const handleCancelAssumption = () => {
    setAssumptionForm(DEFAULT_ASSUMPTION_FORM)
    setEditingAssumptionId(null)
    setShowAssumptionDialog(false)
  }

  const handleSaveAssumption = async () => {
    if (!assumptionForm.title.trim()) {
      toast.error("Title is required")
      return
    }
    setSavingAssumption(true)
    const now = new Date().toISOString()
    try {
      if (editingAssumptionId) {
        const existing = items.find(i => i.id === editingAssumptionId)!
        const updated: Assumption = {
          ...existing,
          title: assumptionForm.title.trim(),
          description: assumptionForm.description.trim() || null,
          category: assumptionForm.category || null,
          status: assumptionForm.status,
        }
        await upsertAssumption(projectId, updated)
        setItems(prev => prev.map(i => i.id === editingAssumptionId ? updated : i))
        toast.success("Assumption updated")
      } else {
        const newItem: Assumption = {
          id: uuidv4(),
          project_id: projectId,
          type: "assumption",
          title: assumptionForm.title.trim(),
          description: assumptionForm.description.trim() || null,
          category: assumptionForm.category || null,
          likelihood: "low",
          impact: "low",
          risk_score: null,
          mitigation: null,
          owner: null,
          status: assumptionForm.status,
          sort_order: items.length,
          created_at: now,
        }
        await upsertAssumption(projectId, newItem)
        setItems(prev => [...prev, newItem])
        toast.success("Assumption added")
      }
      setAssumptionForm(DEFAULT_ASSUMPTION_FORM)
      setEditingAssumptionId(null)
      setShowAssumptionDialog(false)
      router.refresh()
    } catch {
      toast.error("Failed to save assumption")
    } finally {
      setSavingAssumption(false)
    }
  }

  // ── Risk handlers ──────────────────────────────────────────────────────────

  const handleAddRisk = () => {
    setRiskForm(DEFAULT_RISK_FORM)
    setEditingRiskId(null)
    setShowRiskDialog(true)
  }

  const handleEditRisk = (r: Assumption) => {
    setRiskForm({
      title: r.title,
      description: r.description ?? "",
      category: r.category ?? "",
      likelihood: r.likelihood,
      impact: r.impact,
      mitigation: r.mitigation ?? "",
      owner: r.owner ?? "",
      status: r.status,
    })
    setEditingRiskId(r.id)
    setShowRiskDialog(true)
  }

  const handleCancelRisk = () => {
    setRiskForm(DEFAULT_RISK_FORM)
    setEditingRiskId(null)
    setShowRiskDialog(false)
  }

  const handleSaveRisk = async () => {
    if (!riskForm.title.trim()) {
      toast.error("Title is required")
      return
    }
    setSavingRisk(true)
    const now = new Date().toISOString()
    try {
      if (editingRiskId) {
        const existing = items.find(i => i.id === editingRiskId)!
        const updated: Assumption = {
          ...existing,
          title: riskForm.title.trim(),
          description: riskForm.description.trim() || null,
          category: riskForm.category || null,
          likelihood: riskForm.likelihood,
          impact: riskForm.impact,
          risk_score: liveRiskScore,
          mitigation: riskForm.mitigation.trim() || null,
          owner: riskForm.owner.trim() || null,
          status: riskForm.status,
        }
        await upsertAssumption(projectId, updated)
        setItems(prev => prev.map(i => i.id === editingRiskId ? updated : i))
        toast.success("Risk updated")
      } else {
        const newItem: Assumption = {
          id: uuidv4(),
          project_id: projectId,
          type: "risk",
          title: riskForm.title.trim(),
          description: riskForm.description.trim() || null,
          category: riskForm.category || null,
          likelihood: riskForm.likelihood,
          impact: riskForm.impact,
          risk_score: liveRiskScore,
          mitigation: riskForm.mitigation.trim() || null,
          owner: riskForm.owner.trim() || null,
          status: riskForm.status,
          sort_order: items.length,
          created_at: now,
        }
        await upsertAssumption(projectId, newItem)
        setItems(prev => [...prev, newItem])
        toast.success("Risk added")
      }
      setRiskForm(DEFAULT_RISK_FORM)
      setEditingRiskId(null)
      setShowRiskDialog(false)
      router.refresh()
    } catch {
      toast.error("Failed to save risk")
    } finally {
      setSavingRisk(false)
    }
  }

  // ── Delete handler ─────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteId) return
    const prev = items
    setItems(cur => cur.filter(i => i.id !== deleteId))
    setDeleteId(null)
    try {
      await deleteAssumption(projectId, deleteId)
      toast.success("Deleted")
      router.refresh()
    } catch {
      toast.error("Failed to delete")
      setItems(prev)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Summary counts bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-muted-foreground">Assumptions:</span>
          <span className="font-semibold">{openAssumptionCount} open</span>
        </div>
        <Separator orientation="vertical" className="h-4 hidden sm:block" />
        <div className="flex items-center gap-2 text-sm">
          <ShieldAlert className="h-4 w-4 text-orange-500" />
          <span className="font-medium text-muted-foreground">Risks:</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-semibold">{highRisks} High</span>
            <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs font-semibold">{medRisks} Medium</span>
            <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-semibold">{lowRisks} Low</span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Score = Likelihood × Impact (low=1, med=2, high=3)
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
        <button
          onClick={() => setActiveTab("assumptions")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            activeTab === "assumptions" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Assumptions
          {openAssumptionCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold w-4 h-4">
              {openAssumptionCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("risks")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            activeTab === "risks" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Risks
          {risks.length > 0 && (
            <span className={`ml-2 inline-flex items-center justify-center rounded-full text-[10px] font-bold w-4 h-4 ${highRisks > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
              {risks.length}
            </span>
          )}
        </button>
      </div>

      {/* ── ASSUMPTIONS TAB ───────────────────────────────────────────────────── */}
      {activeTab === "assumptions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              Assumptions
              <span className="text-muted-foreground font-normal text-sm">({assumptions.length})</span>
            </h2>
            <Button onClick={handleAddAssumption} className="bg-sidebar text-white hover:bg-sidebar-accent gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Add Assumption
            </Button>
          </div>

          <div className="rounded-md border border-[#1E2D45] bg-[#111827] overflow-hidden">
            <Table>
              <TableHeader className="bg-[#0D1526]">
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[140px]">Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assumptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium">No assumptions yet</p>
                          <p className="text-sm text-muted-foreground">Document project assumptions to track scope boundaries.</p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={handleAddAssumption}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add First Assumption
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  assumptions.map((a, idx) => (
                    <TableRow key={a.id} className="group">
                      <TableCell className="text-muted-foreground font-mono text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium max-w-[200px]">
                        <span className="line-clamp-2">{a.title || <span className="text-muted-foreground italic">Untitled</span>}</span>
                      </TableCell>
                      <TableCell>
                        {a.category
                          ? <Badge variant="outline" className="text-xs font-normal">{a.category}</Badge>
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[260px]">
                        <span className="line-clamp-2">{a.description || "—"}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleEditAssumption(a)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => setDeleteId(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── RISKS TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === "risks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Risks
              <span className="text-muted-foreground font-normal text-sm">({risks.length})</span>
            </h2>
            <Button onClick={handleAddRisk} className="bg-sidebar text-white hover:bg-sidebar-accent gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Add Risk
            </Button>
          </div>

          <div className="rounded-md border border-[#1E2D45] bg-[#111827] overflow-hidden">
            <Table>
              <TableHeader className="bg-[#0D1526]">
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[130px]">Category</TableHead>
                  <TableHead className="w-[110px]">Likelihood</TableHead>
                  <TableHead className="w-[100px]">Impact</TableHead>
                  <TableHead className="w-[70px] text-center">Score</TableHead>
                  <TableHead>Mitigation</TableHead>
                  <TableHead className="w-[120px]">Owner</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium">No risks logged</p>
                          <p className="text-sm text-muted-foreground">Identify and track project risks here.</p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={handleAddRisk}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add First Risk
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  risks.map((r, idx) => (
                    <TableRow key={r.id} className="group">
                      <TableCell className="text-muted-foreground font-mono text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium max-w-[160px]">
                        <span className="line-clamp-2">{r.title || <span className="text-muted-foreground italic">Untitled</span>}</span>
                      </TableCell>
                      <TableCell>
                        {r.category
                          ? <Badge variant="outline" className="text-xs font-normal">{r.category}</Badge>
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </TableCell>
                      <TableCell><LevelBadge value={r.likelihood} /></TableCell>
                      <TableCell><LevelBadge value={r.impact} /></TableCell>
                      <TableCell className="text-center"><ScoreBadge score={r.risk_score} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px]">
                        <span className="line-clamp-2">{r.mitigation || "—"}</span>
                      </TableCell>
                      <TableCell className="text-sm">{r.owner || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleEditRisk(r)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => setDeleteId(r.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Card>
            <CardContent className="pt-4">
              <RiskMatrix risks={risks} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ASSUMPTION DIALOG (blue accent) ───────────────────────────────────── */}
      <Dialog open={showAssumptionDialog} onOpenChange={open => { if (!open) handleCancelAssumption() }}>
        <DialogContent className="sm:max-w-lg">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 rounded-t-lg" />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              {editingAssumptionId ? "Edit Assumption" : "Add Assumption"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="a-title"
                value={assumptionForm.title}
                onChange={e => setAssumptionForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Describe the assumption…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={assumptionForm.category} onValueChange={v => setAssumptionForm(f => ({ ...f, category: v ?? "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="a-desc">Description</Label>
              <Textarea
                id="a-desc"
                value={assumptionForm.description}
                onChange={e => setAssumptionForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Additional detail…"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={assumptionForm.status} onValueChange={v => setAssumptionForm(f => ({ ...f, status: v as Assumption["status"] }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelAssumption} disabled={savingAssumption}>Cancel</Button>
            <Button onClick={handleSaveAssumption} disabled={savingAssumption} className="bg-sidebar text-white hover:bg-sidebar-accent">
              {savingAssumption ? "Saving…" : editingAssumptionId ? "Save Changes" : "Add Assumption"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── RISK DIALOG (amber accent) ─────────────────────────────────────────── */}
      <Dialog open={showRiskDialog} onOpenChange={open => { if (!open) handleCancelRisk() }}>
        <DialogContent className="sm:max-w-lg">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500 rounded-t-lg" />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {editingRiskId ? "Edit Risk" : "Add Risk"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="r-title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="r-title"
                value={riskForm.title}
                onChange={e => setRiskForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Describe the risk…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={riskForm.category} onValueChange={v => setRiskForm(f => ({ ...f, category: v ?? "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="r-desc">Description</Label>
              <Textarea
                id="r-desc"
                value={riskForm.description}
                onChange={e => setRiskForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Additional detail…"
                rows={2}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Likelihood</Label>
                <Select value={riskForm.likelihood} onValueChange={v => setRiskForm(f => ({ ...f, likelihood: v as "low" | "medium" | "high" }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Impact</Label>
                <Select value={riskForm.impact} onValueChange={v => setRiskForm(f => ({ ...f, impact: v as "low" | "medium" | "high" }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Live Score — updates in real time as dropdowns change */}
            <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border ${
              liveRiskScore >= 6 ? "bg-red-50 border-red-200" :
              liveRiskScore >= 3 ? "bg-amber-50 border-amber-200" :
              "bg-green-50 border-green-200"
            }`}>
              <span className={`inline-flex items-center justify-center rounded-full w-9 h-9 text-base font-black ${
                liveRiskScore >= 6 ? "bg-red-100 text-red-800" :
                liveRiskScore >= 3 ? "bg-amber-100 text-amber-800" :
                "bg-green-100 text-green-800"
              }`}>
                {liveRiskScore}
              </span>
              <div>
                <p className={`text-sm font-semibold ${
                  liveRiskScore >= 6 ? "text-red-800" :
                  liveRiskScore >= 3 ? "text-amber-800" :
                  "text-green-800"
                }`}>
                  {liveRiskScore >= 6 ? "High Risk" : liveRiskScore >= 3 ? "Medium Risk" : "Low Risk"}
                </p>
                <p className="text-xs text-muted-foreground">Score = Likelihood × Impact</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="r-mitigation">Mitigation</Label>
              <Textarea
                id="r-mitigation"
                value={riskForm.mitigation}
                onChange={e => setRiskForm(f => ({ ...f, mitigation: e.target.value }))}
                placeholder="How will this risk be mitigated?"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="r-owner">Owner</Label>
              <Input
                id="r-owner"
                value={riskForm.owner}
                onChange={e => setRiskForm(f => ({ ...f, owner: e.target.value }))}
                placeholder="Risk owner name or role"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={riskForm.status} onValueChange={v => setRiskForm(f => ({ ...f, status: v as Assumption["status"] }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelRisk} disabled={savingRisk}>Cancel</Button>
            <Button onClick={handleSaveRisk} disabled={savingRisk} className="bg-sidebar text-white hover:bg-sidebar-accent">
              {savingRisk ? "Saving…" : editingRiskId ? "Save Changes" : "Add Risk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRMATION ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this{" "}
              {items.find(i => i.id === deleteId)?.type ?? "item"}. This action cannot be undone.
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

    </div>
  )
}
