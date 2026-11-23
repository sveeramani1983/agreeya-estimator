"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, Search, Building2, ChevronDown, ChevronRight, BarChart2,
  X, FileUp, Sparkles, Copy, FileText, ArrowLeft, ArrowRight,
  Layers, Check, Loader2, FilePlus, AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  createProject,
  createEstimateFromClone,
  getClients,
  getProjects,
  getClientIntelligenceAction,
  saveRfpAnalysis,
} from "@/lib/actions"
import type { Client, Project, ProjectStatus } from "@/lib/types"
import type { ClientIntelligence } from "@/lib/intelligence"

// ── Client Picker ─────────────────────────────────────────────────────────────

function ClientPicker({
  clients,
  value,
  onChange,
}: {
  clients: Client[]
  value: { id: string | null; name: string }
  onChange: (v: { id: string | null; name: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )
  const showNewOption = search.trim() && !clients.some(c => c.name.toLowerCase() === search.toLowerCase().trim())

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function select(id: string | null, name: string) {
    onChange({ id, name })
    setSearch("")
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch("") }}
        className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left hover:bg-accent/10 transition-colors"
      >
        <span className={value.name ? "text-foreground" : "text-muted-foreground"}>
          {value.name || "Select or type client name…"}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-[#1E2D45] bg-[#0D1526] shadow-xl">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search or type new client…"
                className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#0A1120] border border-[#1E2D45] text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto pb-2">
            {showNewOption && (
              <button
                type="button"
                onClick={() => select(null, search.trim())}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                Create "{search.trim()}"
              </button>
            )}
            {filtered.length === 0 && !showNewOption && (
              <p className="px-3 py-4 text-sm text-muted-foreground text-center">No clients found</p>
            )}
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c.id, c.name)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
              >
                <div className="h-6 w-6 rounded bg-blue-900/30 border border-blue-800/40 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-black text-blue-300">{c.name.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-foreground truncate">{c.name}</p>
                  {c.industry && <p className="text-[10px] text-muted-foreground">{c.industry}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Client Intelligence Card ──────────────────────────────────────────────────

function ClientIntelligenceCard({ intel }: { intel: ClientIntelligence }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || intel.totalPursued === 0) return null

  function fmtValue(v: number | null) {
    if (!v) return '—'
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
    return `$${Math.round(v)}`
  }

  function fmtDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  return (
    <div style={{
      background: 'color-mix(in srgb, var(--accent-blue, #2563EB) 6%, var(--bg-card, #111827))',
      border: '1px solid color-mix(in srgb, var(--accent-blue, #2563EB) 30%, var(--border-primary, #1E2D45))',
      borderRadius: 8,
      padding: '12px 16px',
    }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <BarChart2 className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Client History</span>
        </div>
        <button type="button" onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-2 text-xs">
        <div>
          <p className="text-muted-foreground">Win Rate</p>
          <p className="font-semibold text-foreground">
            {intel.winRate !== null
              ? `${Math.round(intel.winRate)}% (${intel.won} of ${intel.totalPursued})`
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Avg Win Value</p>
          <p className="font-semibold text-foreground">{fmtValue(intel.avgWinValue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Last Engagement</p>
          <p className="font-semibold text-foreground">{fmtDate(intel.lastEngagement)}</p>
        </div>
      </div>
      {intel.pricingMessage && (
        <p className="text-[11px] text-blue-300 leading-relaxed">
          💡 {intel.pricingMessage}
        </p>
      )}
    </div>
  )
}

// ── Wizard Types ──────────────────────────────────────────────────────────────

type InitiationMethod = "rfp" | "template" | "blank"

// ── Main Wizard Component ────────────────────────────────────────────────────

export function NewEstimateWizard({
  trigger,
}: {
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [method, setMethod] = useState<InitiationMethod>("rfp")

  // Form states
  const [estimateName, setEstimateName] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<ProjectStatus>("draft")
  const [clientValue, setClientValue] = useState<{ id: string | null; name: string }>({ id: null, name: "" })
  const [clientIntel, setClientIntel] = useState<ClientIntelligence | null>(null)

  // RFP file/text states
  const [rfpFile, setRfpFile] = useState<File | null>(null)
  const [rfpText, setRfpText] = useState("")
  const [rfpMode, setRfpMode] = useState<"file" | "text">("file")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Template / clone states
  const [selectedProjectIdToClone, setSelectedProjectIdToClone] = useState<string | null>(null)

  // Data lookups
  const [clients, setClients] = useState<Client[]>([])
  const [pastEstimates, setPastEstimates] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState("")

  useEffect(() => {
    if (open) {
      setStep(1)
      setMethod("rfp")
      setEstimateName("")
      setDescription("")
      setStatus("draft")
      setClientValue({ id: null, name: "" })
      setClientIntel(null)
      setRfpFile(null)
      setRfpText("")
      setSelectedProjectIdToClone(null)
      setLoading(false)

      getClients().then(setClients).catch(() => {})
      getProjects().then(setPastEstimates).catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (clientValue.id) {
      getClientIntelligenceAction(clientValue.id)
        .then(intel => setClientIntel(intel.totalPursued > 0 ? intel : null))
        .catch(() => setClientIntel(null))
    } else {
      setClientIntel(null)
    }
  }, [clientValue.id])

  // Select method and advance to step 2
  const handleSelectMethod = (m: InitiationMethod) => {
    setMethod(m)
    setStep(2)
  }

  // Submit Handler
  const handleCreateEstimate = async (e: React.FormEvent) => {
    e.preventDefault()

    const finalName = estimateName.trim() || (rfpFile ? rfpFile.name.replace(/\.[^/.]+$/, "") : "")
    if (!finalName) {
      toast.error("Estimate Title is required.")
      return
    }
    if (!clientValue.name.trim()) {
      toast.error("Client is required.")
      return
    }

    setLoading(true)

    try {
      if (method === "template") {
        if (!selectedProjectIdToClone) {
          toast.error("Please select a template or prior estimate to clone.")
          setLoading(false)
          return
        }
        setLoadingText("Cloning estimate & assets...")
        const { id } = await createEstimateFromClone({
          sourceProjectId: selectedProjectIdToClone,
          name: finalName,
          clientName: clientValue.name.trim(),
          clientId: clientValue.id,
          description: description.trim() || undefined,
        })
        toast.success("Estimate created from template!")
        setOpen(false)
        router.push(`/projects/${id}/estimate`)
        return
      }

      // Method: Blank or RFP
      setLoadingText("Creating estimate...")
      const { id } = await createProject({
        name: finalName,
        client_name: clientValue.name.trim(),
        client_id: clientValue.id,
        description: description.trim() || undefined,
        status,
      })

      // If user uploaded an RFP in Path A, trigger initial analysis
      if (method === "rfp" && (rfpFile || rfpText.trim().length >= 50)) {
        setLoadingText("Analyzing RFP requirements with AI...")
        try {
          const fd = new FormData()
          if (rfpMode === "file" && rfpFile) {
            fd.append("file", rfpFile)
          } else if (rfpText.trim()) {
            fd.append("text", rfpText.trim())
          }

          const res = await fetch("/api/analyze-rfp", { method: "POST", body: fd })
          const data = await res.json()

          if (res.ok && data.success) {
            await saveRfpAnalysis({
              projectId: id,
              filename: data.filename || rfpFile?.name || "rfp-upload.txt",
              fileSize: data.fileSize || 0,
              analysisJson: JSON.stringify(data.analysis),
            })
            toast.success("Estimate created with initial RFP analysis!")
          } else {
            toast.success("Estimate created. Proceed to Scope tab to analyze.")
          }
        } catch (rfpErr) {
          console.warn("Background RFP analysis notice:", rfpErr)
          toast.success("Estimate created. Proceed to Scope tab to analyze.")
        }
      } else {
        toast.success("Estimate created successfully!")
      }

      setOpen(false)
      router.push(`/projects/${id}/scope`)
    } catch (err) {
      console.error("Failed to create estimate:", err)
      toast.error("Failed to create estimate")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            <>{trigger}</>
          ) : (
            <Button className="bg-sidebar hover:bg-sidebar-accent text-white gap-2 shadow-sm font-semibold text-sm">
              <Plus className="h-4 w-4" />
              New Estimate
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-[580px] p-0 overflow-hidden border-[#1E2D45] bg-[#0D1526]">
        {/* Wizard Header */}
        <div className="p-6 border-b border-[#1E2D45] bg-[#111827]">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-900/40 text-blue-300 border-blue-800/60 text-[10px] uppercase font-bold">
                  Step {step} of 2
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {step === 1 ? "Select Initiation Method" : "Configure Estimate Details"}
                </span>
              </div>
              <DialogTitle className="text-xl font-black text-foreground">
                {step === 1 ? "How would you like to start?" : "New Estimate Setup"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {step === 1
                  ? "Choose whether to analyze an RFP document, clone a proven template, or start blank."
                  : method === "rfp"
                  ? "Upload RFP documents or requirements for AI scope extraction."
                  : method === "template"
                  ? "Select a previous estimate or preset template to duplicate."
                  : "Enter client and bid details for a bespoke manual estimate."}
              </DialogDescription>
            </div>

            {step === 2 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
          </div>
        </div>

        {/* Wizard Step 1: Choose Initiation Method */}
        {step === 1 && (
          <div className="p-6 space-y-4">
            {/* Option A: Upload RFP */}
            <div
              onClick={() => handleSelectMethod("rfp")}
              className="group p-4 rounded-xl border border-[#1E2D45] bg-[#111827] hover:border-blue-500 hover:bg-[#162032] cursor-pointer transition-all flex items-start gap-4"
            >
              <div className="h-10 w-10 rounded-xl bg-blue-900/30 border border-blue-800/50 flex items-center justify-center shrink-0 group-hover:bg-blue-600 transition-colors">
                <Sparkles className="h-5 w-5 text-blue-400 group-hover:text-white transition-colors" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    Upload RFP / Paste Requirements
                  </p>
                  <Badge className="bg-primary/20 text-primary border-primary/40 text-[10px]">
                    Recommended
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upload an RFP (.pdf, .docx, .txt) or paste requirements. AI extracts requirements, identifies scope red flags, and matches Component Library items.
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0 self-center transition-colors" />
            </div>

            {/* Option B: Template / Clone */}
            <div
              onClick={() => handleSelectMethod("template")}
              className="group p-4 rounded-xl border border-[#1E2D45] bg-[#111827] hover:border-blue-500 hover:bg-[#162032] cursor-pointer transition-all flex items-start gap-4"
            >
              <div className="h-10 w-10 rounded-xl bg-purple-900/30 border border-purple-800/50 flex items-center justify-center shrink-0 group-hover:bg-purple-600 transition-colors">
                <Layers className="h-5 w-5 text-purple-400 group-hover:text-white transition-colors" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    From Template or Previous Estimate
                  </p>
                  <Badge variant="outline" className="text-[10px] border-[#1E2D45] text-zinc-400">
                    Fastest
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Duplicate a previously won bid or pre-configured proposal structure (WBS items, overhead configuration, and role mix).
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0 self-center transition-colors" />
            </div>

            {/* Option C: Blank Manual */}
            <div
              onClick={() => handleSelectMethod("blank")}
              className="group p-4 rounded-xl border border-[#1E2D45] bg-[#111827] hover:border-blue-500 hover:bg-[#162032] cursor-pointer transition-all flex items-start gap-4"
            >
              <div className="h-10 w-10 rounded-xl bg-emerald-900/30 border border-emerald-800/50 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 transition-colors">
                <FilePlus className="h-5 w-5 text-emerald-400 group-hover:text-white transition-colors" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    Blank Estimate (Manual)
                  </p>
                  <Badge variant="outline" className="text-[10px] border-[#1E2D45] text-zinc-400">
                    Custom
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Start from a blank canvas. Add custom WBS components, build overhead governance, and staff roles manually.
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0 self-center transition-colors" />
            </div>
          </div>
        )}

        {/* Wizard Step 2: Form Details */}
        {step === 2 && (
          <form onSubmit={handleCreateEstimate} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Method A Extra: RFP Upload / Paste input */}
            {method === "rfp" && (
              <div className="p-4 rounded-xl border border-blue-900/40 bg-blue-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                    <FileUp className="h-3.5 w-3.5" /> RFP Ingestion Source
                  </Label>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setRfpMode("file")}
                      className={`px-2 py-0.5 rounded ${rfpMode === "file" ? "bg-blue-600 text-white font-bold" : "text-zinc-400"}`}
                    >
                      File
                    </button>
                    <button
                      type="button"
                      onClick={() => setRfpMode("text")}
                      className={`px-2 py-0.5 rounded ${rfpMode === "text" ? "bg-blue-600 text-white font-bold" : "text-zinc-400"}`}
                    >
                      Paste Text
                    </button>
                  </div>
                </div>

                {rfpMode === "file" ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-blue-800/60 hover:border-primary bg-[#0D1526] rounded-lg p-4 text-center cursor-pointer transition-colors"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) {
                          setRfpFile(f)
                          if (!estimateName) {
                            setEstimateName(f.name.replace(/\.[^/.]+$/, ""))
                          }
                        }
                      }}
                    />
                    <FileText className="h-6 w-6 mx-auto text-blue-400 mb-1.5" />
                    {rfpFile ? (
                      <p className="text-xs font-semibold text-primary truncate max-w-sm mx-auto">
                        {rfpFile.name} ({(rfpFile.size / 1024).toFixed(1)} KB)
                      </p>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-foreground">Click to select RFP document (.pdf, .docx, .txt)</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Or skip and upload later in the Scope tab</p>
                      </>
                    )}
                  </div>
                ) : (
                  <Textarea
                    value={rfpText}
                    onChange={(e) => setRfpText(e.target.value)}
                    placeholder="Paste RFP scope, objectives, or requirement specifications..."
                    rows={4}
                    className="bg-[#0D1526] border-[#1E2D45] text-xs resize-none"
                  />
                )}
              </div>
            )}

            {/* Method B Extra: Template / Clone Selector */}
            {method === "template" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Select Base Estimate or Template <span className="text-red-500">*</span></Label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 rounded-lg border border-[#1E2D45] bg-[#0A1120]">
                  {pastEstimates.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">No existing estimates found to clone.</p>
                  ) : (
                    pastEstimates.map((proj) => {
                      const isSelected = selectedProjectIdToClone === proj.id
                      return (
                        <div
                          key={proj.id}
                          onClick={() => {
                            setSelectedProjectIdToClone(proj.id)
                            if (!estimateName) setEstimateName(`${proj.name} (Copy)`)
                            if (!clientValue.name && proj.client_name) {
                              setClientValue({ id: proj.client_id || null, name: proj.client_name })
                            }
                          }}
                          className={`p-2.5 rounded-md cursor-pointer flex items-center justify-between text-xs transition-colors ${
                            isSelected ? "bg-blue-600 text-white font-semibold" : "hover:bg-white/5 text-foreground"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{proj.name}</p>
                            <p className={`text-[10px] ${isSelected ? "text-blue-100" : "text-muted-foreground"}`}>
                              {proj.client_name} • {proj.status.toUpperCase()}
                            </p>
                          </div>
                          {isSelected && <Check className="h-4 w-4 shrink-0 ml-2" />}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* Standard Common Fields */}
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="estimate-title" className="text-xs font-semibold">
                  Estimate Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="estimate-title"
                  value={estimateName}
                  onChange={(e) => setEstimateName(e.target.value)}
                  placeholder="e.g. Health Analytics Web Portal"
                  className="bg-[#0D1526] border-[#1E2D45] text-xs h-9"
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">
                  Client <span className="text-red-500">*</span>
                </Label>
                <ClientPicker clients={clients} value={clientValue} onChange={setClientValue} />
                {clientIntel && <ClientIntelligenceCard intel={clientIntel} />}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="status" className="text-xs font-semibold">Initial Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                    <SelectTrigger className="bg-[#0D1526] border-[#1E2D45] text-xs h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0D1526] border-[#1E2D45]">
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="desc" className="text-xs font-semibold">Scope Summary (Optional)</Label>
                  <Input
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief objective..."
                    className="bg-[#0D1526] border-[#1E2D45] text-xs h-9"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-[#1E2D45] flex items-center justify-between sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                className="text-xs"
              >
                Change Method
              </Button>

              <Button
                type="submit"
                disabled={loading}
                className="bg-primary hover:bg-primary/90 text-white font-bold text-xs h-9 px-4 gap-1.5 shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {loadingText || "Processing…"}
                  </>
                ) : method === "rfp" ? (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Create & Analyze Scope
                  </>
                ) : method === "template" ? (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Create from Template
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Create Blank Estimate
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Backward-compatible alias
export const NewProjectModal = NewEstimateWizard
