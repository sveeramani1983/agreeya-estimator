"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  FileUp, Sparkles, FileText, AlertTriangle, CheckCircle2,
  Clock, BarChart2, Loader2, Target, HelpCircle, Shield,
  ClipboardList, ArrowRight, Check, Plus, AlertCircle, ExternalLink,
  ChevronRight, RefreshCw, Award, CheckSquare, Square,
} from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  saveRfpAnalysis,
  acceptScopeAndPopulateEstimate,
  SuggestedWBSComponent,
} from "@/lib/actions"
import Link from "next/link"

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

interface ScopeWorkspaceProps {
  projectId: string
  projectName: string
  clientName?: string | null
  existingWBSCount: number
  initialAnalysis?: {
    id: string
    filename: string | null
    file_size: number | null
    created_at: string
    analysis_json: string
  } | null
}

const LOADING_MESSAGES = [
  "Reading RFP document...",
  "Extracting functional & compliance requirements...",
  "Identifying scope risks & technical red flags...",
  "Reconciling deliverables with Component Library...",
  "Synthesizing WBS & presales discovery questions...",
]

export function ScopeWorkspace({
  projectId,
  projectName,
  clientName,
  existingWBSCount,
  initialAnalysis,
}: ScopeWorkspaceProps) {
  const router = useRouter()

  const [analysis, setAnalysis] = useState<RFPAnalysis | null>(() => {
    if (initialAnalysis?.analysis_json) {
      try {
        return JSON.parse(initialAnalysis.analysis_json)
      } catch {
        return null
      }
    }
    return null
  })

  const [analysisFilename, setAnalysisFilename] = useState<string>(
    initialAnalysis?.filename || "Attached RFP"
  )
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(
    initialAnalysis?.created_at || null
  )

  const [activeInputTab, setActiveInputTab] = useState<"file" | "text">("file")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(0)
  const [activeResultTab, setActiveResultTab] = useState("wbs")
  const [isDragging, setIsDragging] = useState(false)

  // Selection states for one-click populate
  const [selectedWBSIndices, setSelectedWBSIndices] = useState<Set<number>>(new Set())
  const [selectedRiskIndices, setSelectedRiskIndices] = useState<Set<number>>(new Set())
  const [selectedQuestionIndices, setSelectedQuestionIndices] = useState<Set<number>>(new Set())
  const [populating, setPopulating] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Select all items by default whenever analysis is loaded
  useEffect(() => {
    if (analysis) {
      if (analysis.suggestedWBS) {
        setSelectedWBSIndices(new Set(analysis.suggestedWBS.map((_, i) => i)))
      }
      if (analysis.redFlags) {
        setSelectedRiskIndices(new Set(analysis.redFlags.map((_, i) => i)))
      }
      if (analysis.questionsForClient) {
        setSelectedQuestionIndices(new Set(analysis.questionsForClient.map((_, i) => i)))
      }
    }
  }, [analysis])

  // Cycle loading messages during analysis
  useEffect(() => {
    if (!analyzing) return
    const interval = setInterval(() => {
      setLoadingMsg((prev) => (prev + 1) % LOADING_MESSAGES.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [analyzing])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase()
      if (ext === "pdf" || ext === "docx" || ext === "txt") {
        setSelectedFile(file)
        setActiveInputTab("file")
        toast.success(`Loaded ${file.name}`)
      } else {
        toast.error("Please drop a valid .pdf, .docx, or .txt document.")
      }
    }
  }, [])

  const canAnalyze =
    (activeInputTab === "file" && selectedFile !== null) ||
    (activeInputTab === "text" && pastedText.trim().length >= 50)

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setLoadingMsg(0)

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
        toast.error(data.error || "Analysis failed")
        return
      }

      setAnalysis(data.analysis)
      const filename = data.filename || selectedFile?.name || "requirements-input.txt"
      setAnalysisFilename(filename)
      setAnalyzedAt(new Date().toISOString())
      setActiveResultTab("wbs")

      // Persist to DB linked directly to this project
      try {
        await saveRfpAnalysis({
          projectId,
          filename,
          fileSize: data.fileSize || 0,
          analysisJson: JSON.stringify(data.analysis),
        })
      } catch (err) {
        console.error("Failed to persist RFP analysis to project:", err)
      }

      toast.success("RFP scope analysis complete!")
    } catch {
      toast.error("Network error — could not reach analysis service")
    } finally {
      setAnalyzing(false)
    }
  }

  // WBS toggles
  const toggleSelectWBS = (idx: number) => {
    setSelectedWBSIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleAllWBS = () => {
    if (!analysis?.suggestedWBS) return
    if (selectedWBSIndices.size === analysis.suggestedWBS.length) {
      setSelectedWBSIndices(new Set())
    } else {
      setSelectedWBSIndices(new Set(analysis.suggestedWBS.map((_, i) => i)))
    }
  }

  // Risk toggles
  const toggleSelectRisk = (idx: number) => {
    setSelectedRiskIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // Questions toggles
  const toggleSelectQuestion = (idx: number) => {
    setSelectedQuestionIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // One-click populate
  const handleAcceptScopeAndPopulate = async () => {
    if (!analysis?.suggestedWBS || selectedWBSIndices.size === 0) {
      toast.error("Please select at least one WBS component to import.")
      return
    }

    setPopulating(true)
    try {
      const selectedComponents = analysis.suggestedWBS.filter((_, i) =>
        selectedWBSIndices.has(i)
      )
      const selectedRisks = (analysis.redFlags || []).filter((_, i) =>
        selectedRiskIndices.has(i)
      )
      const selectedQuestions = (analysis.questionsForClient || []).filter((_, i) =>
        selectedQuestionIndices.has(i)
      )

      const result = await acceptScopeAndPopulateEstimate(
        projectId,
        selectedComponents,
        selectedRisks,
        selectedQuestions
      )

      toast.success(
        `Scope accepted! Populated ${result.importedComponents} WBS component${
          result.importedComponents === 1 ? "" : "s"
        } and ${result.importedRisks} risk item${
          result.importedRisks === 1 ? "" : "s"
        }.`
      )

      router.push(`/projects/${projectId}/estimate`)
    } catch (err) {
      console.error(err)
      toast.error("Failed to populate estimate from scope.")
    } finally {
      setPopulating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Top Header / Breadcrumb Context ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-[#1E2D45] bg-[#111827]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Step 1 of 9: Scope
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">Requirements & RFP Ingestion</span>
          </div>
          <h2 className="text-xl font-black text-foreground">
            {projectName} {clientName && <span className="text-muted-foreground font-medium text-base">({clientName})</span>}
          </h2>
          <p className="text-xs text-muted-foreground">
            Upload an RFP or paste requirements to extract deliverables, identify scope red flags, and automatically seed your Estimate WBS and Risk register.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {existingWBSCount > 0 ? (
            <Badge variant="outline" className="text-xs border-green-800/60 bg-green-900/20 text-green-300 py-1 px-2.5">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-400" />
              {existingWBSCount} active WBS component{existingWBSCount === 1 ? "" : "s"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs border-[#1E2D45] bg-[#0D1526] text-muted-foreground py-1 px-2.5">
              WBS Empty
            </Badge>
          )}

          <Button size="sm" variant="ghost" asChild>
            <Link href={`/projects/${projectId}/estimate`} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              Skip to Estimate <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Main Layout: Drop / Intake Area + Detailed Results ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Document Drop & Intake */}
        <div className={analysis ? "lg:col-span-4 space-y-4" : "lg:col-span-12 max-w-3xl mx-auto space-y-6 w-full"}>
          <Card
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`shadow-sm border-[#1E2D45] bg-[#111827] transition-all ${
              isDragging ? "ring-2 ring-primary border-primary bg-primary/5" : ""
            }`}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FileUp className="h-4 w-4 text-primary" />
                {analysis ? "Update Scope / Re-Analyze" : "Drop RFP Document or Paste Scope"}
              </CardTitle>
              <CardDescription className="text-xs">
                Drag and drop your RFP file directly onto this card, or paste raw text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs
                value={activeInputTab}
                onValueChange={(v) => setActiveInputTab(v as "file" | "text")}
              >
                <TabsList className="w-full bg-[#0D1526] border border-[#1E2D45]">
                  <TabsTrigger value="file" className="flex-1 text-xs">
                    File Upload (.pdf, .docx, .txt)
                  </TabsTrigger>
                  <TabsTrigger value="text" className="flex-1 text-xs">
                    Paste Scope Text
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="mt-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      isDragging
                        ? "border-primary bg-primary/10"
                        : "border-[#1E2D45] hover:border-primary/50 bg-[#0D1526]"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setSelectedFile(file)
                      }}
                    />
                    <FileText className="h-9 w-9 mx-auto text-primary/70 mb-2.5" />
                    {selectedFile ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-foreground truncate max-w-xs mx-auto">
                          {selectedFile.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {(selectedFile.size / 1024).toFixed(1)} KB • Click to choose another
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-foreground">
                          Drop RFP file here or click to browse
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Extracts scope, requirements, red flags, and WBS
                        </p>
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="text" className="mt-3">
                  <Textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste RFP scope text, requirements, or statement of work here (min 50 characters)..."
                    rows={6}
                    className="bg-[#0D1526] border-[#1E2D45] text-xs resize-none"
                  />
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1.5">
                    <span>{pastedText.length} characters</span>
                    <span>Min 50 chars</span>
                  </div>
                </TabsContent>
              </Tabs>

              <Button
                onClick={handleAnalyze}
                disabled={!canAnalyze || analyzing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 text-xs h-9 shadow-sm"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {LOADING_MESSAGES[loadingMsg]}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Analyze Scope with AI
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Quick Context / Instructions */}
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/20 p-4 space-y-2 text-xs">
            <p className="font-semibold text-blue-300 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Presales Continuity
            </p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Accepting scope in this step pushes deliverables to the <strong className="text-foreground">Estimate</strong> tab with historical base hours from your Component Library. Identified red flags automatically seed the <strong className="text-foreground">Risks</strong> register.
            </p>
          </div>
        </div>

        {/* Right Column: Multi-Tab Scope Results */}
        {analysis && (
          <div className="lg:col-span-8 space-y-4">
            {/* Analysis Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-blue-800/40 bg-blue-900/10">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-blue-900/30 border border-blue-700/50 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground truncate">{analysisFilename}</span>
                    <Badge className="bg-green-900/40 text-green-300 border-green-800/60 text-[10px] shrink-0">
                      Analyzed
                    </Badge>
                  </div>
                  {analyzedAt && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Analyzed {new Date(analyzedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>

              {analysis.bidRecommendation && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Bid Recommendation:</span>
                  <Badge
                    className={`text-xs uppercase font-bold px-2.5 py-1 ${
                      analysis.bidRecommendation.recommendation === "pursue"
                        ? "bg-green-900/50 text-green-300 border-green-700"
                        : analysis.bidRecommendation.recommendation === "caution"
                        ? "bg-amber-900/50 text-amber-300 border-amber-700"
                        : "bg-red-900/50 text-red-300 border-red-700"
                    }`}
                  >
                    {analysis.bidRecommendation.recommendation} ({analysis.bidRecommendation.score}/100)
                  </Badge>
                </div>
              )}
            </div>

            {/* Persistent Primary Action Callout */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-primary/30 bg-primary/10">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Ready to proceed to estimation?
                </p>
                <p className="text-xs text-muted-foreground">
                  One click will populate <strong className="text-foreground">{selectedWBSIndices.size}</strong> WBS components, <strong className="text-foreground">{selectedRiskIndices.size}</strong> risks, and <strong className="text-foreground">{selectedQuestionIndices.size}</strong> discovery clarifications.
                </p>
              </div>

              <Button
                onClick={handleAcceptScopeAndPopulate}
                disabled={populating || selectedWBSIndices.size === 0}
                className="bg-primary hover:bg-primary/90 text-white gap-2 font-bold text-xs h-9 shadow-md shrink-0"
              >
                {populating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Populating Estimate…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Accept Scope & Populate Estimate
                  </>
                )}
              </Button>
            </div>

            {/* Tabs for In-Depth Scope Exploration */}
            <Tabs value={activeResultTab} onValueChange={setActiveResultTab}>
              <TabsList className="w-full bg-[#0D1526] border border-[#1E2D45] overflow-x-auto justify-start h-auto p-1">
                <TabsTrigger value="wbs" className="gap-1.5 text-xs">
                  <Target className="h-3.5 w-3.5" />
                  Suggested WBS ({analysis.suggestedWBS?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="redflags" className="gap-1.5 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Red Flags & Risks ({analysis.redFlags?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="questions" className="gap-1.5 text-xs">
                  <HelpCircle className="h-3.5 w-3.5" />
                  Discovery Questions ({analysis.questionsForClient?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="requirements" className="gap-1.5 text-xs">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Requirements ({analysis.requirements?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="overview" className="gap-1.5 text-xs">
                  <BarChart2 className="h-3.5 w-3.5" />
                  Overview & Fit
                </TabsTrigger>
              </TabsList>

              {/* ── TAB 1: SUGGESTED WBS ── */}
              <TabsContent value="wbs" className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Items selected below will be created as authoritative WBS components.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={toggleAllWBS}
                    className="text-xs h-7 text-muted-foreground hover:text-foreground"
                  >
                    {selectedWBSIndices.size === (analysis.suggestedWBS?.length ?? 0)
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                </div>

                <div className="rounded-xl border border-[#1E2D45] overflow-hidden bg-[#111827]">
                  <Table className="text-xs">
                    <TableHeader className="bg-[#0D1526]">
                      <TableRow className="border-[#1E2D45]">
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            checked={
                              (analysis.suggestedWBS?.length ?? 0) > 0 &&
                              selectedWBSIndices.size === analysis.suggestedWBS.length
                            }
                            onChange={toggleAllWBS}
                            className="rounded border-[#1E2D45] bg-[#0A1120]"
                          />
                        </TableHead>
                        <TableHead className="font-semibold text-muted-foreground">Deliverable / Component</TableHead>
                        <TableHead className="font-semibold text-muted-foreground">Category</TableHead>
                        <TableHead className="font-semibold text-muted-foreground">Complexity</TableHead>
                        <TableHead className="font-semibold text-muted-foreground text-right">Base Hours</TableHead>
                        <TableHead className="font-semibold text-muted-foreground">Match</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.suggestedWBS?.map((comp, idx) => {
                        const isSelected = selectedWBSIndices.has(idx)
                        return (
                          <TableRow
                            key={idx}
                            onClick={() => toggleSelectWBS(idx)}
                            className={`cursor-pointer border-[#1E2D45] hover:bg-white/[0.02] ${
                              isSelected ? "bg-blue-950/20" : ""
                            }`}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectWBS(idx)}
                                className="rounded border-[#1E2D45] bg-[#0A1120]"
                              />
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-foreground">{comp.componentName}</p>
                              {comp.description && (
                                <p className="text-[11px] text-muted-foreground line-clamp-1">{comp.description}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{comp.category || "General"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {comp.complexity || "medium"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold text-foreground">
                              {comp.baseHours}h
                            </TableCell>
                            <TableCell>
                              {comp.source === "library" ? (
                                <Badge className="bg-blue-900/40 text-blue-300 border-blue-800/60 text-[10px]">
                                  Library Match
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-zinc-400">
                                  AI Suggested
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* ── TAB 2: RED FLAGS & RISKS ── */}
              <TabsContent value="redflags" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Checked red flags will automatically be added as active risks to Step 7: Risks.
                </p>

                <div className="space-y-3">
                  {analysis.redFlags?.map((flag, idx) => {
                    const isSelected = selectedRiskIndices.has(idx)
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleSelectRisk(idx)}
                        className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-red-900/60 bg-red-950/20"
                            : "border-[#1E2D45] bg-[#111827] opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRisk(idx)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-[#1E2D45] mt-1 bg-[#0A1120]"
                            />
                            <div className="space-y-1">
                              <span className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                                {flag.title}
                              </span>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {flag.description}
                              </p>
                              {flag.recommendation && (
                                <div className="text-xs bg-red-900/20 rounded p-2.5 text-red-200 mt-2">
                                  <strong>Proposed Mitigation:</strong> {flag.recommendation}
                                </div>
                              )}
                            </div>
                          </div>

                          <Badge className="bg-red-900/40 text-red-300 border-red-800/60 text-[10px] uppercase shrink-0">
                            {flag.severity}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </TabsContent>

              {/* ── TAB 3: DISCOVERY QUESTIONS ── */}
              <TabsContent value="questions" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Checked discovery questions will be logged as pending presales assumptions/clarifications.
                </p>

                <div className="space-y-2">
                  {analysis.questionsForClient?.map((q, idx) => {
                    const isSelected = selectedQuestionIndices.has(idx)
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleSelectQuestion(idx)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-colors flex items-start gap-3 ${
                          isSelected
                            ? "border-blue-900/50 bg-blue-950/20"
                            : "border-[#1E2D45] bg-[#111827] opacity-60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectQuestion(idx)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-[#1E2D45] mt-1 bg-[#0A1120]"
                        />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">{q.category}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] capitalize ${
                                q.importance === "critical"
                                  ? "border-red-800/50 text-red-300"
                                  : "border-blue-800/50 text-blue-300"
                              }`}
                            >
                              {q.importance}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{q.question}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </TabsContent>

              {/* ── TAB 4: REQUIREMENTS MATRIX ── */}
              <TabsContent value="requirements" className="mt-4 space-y-3">
                <div className="grid gap-2">
                  {analysis.requirements?.map((req) => (
                    <div
                      key={req.id}
                      className="p-3.5 rounded-xl border border-[#1E2D45] bg-[#111827] space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-primary">{req.id}</span>
                          <span className="text-xs font-bold text-foreground">{req.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {req.type}
                          </Badge>
                          <Badge
                            className={`text-[10px] capitalize ${
                              req.priority === "must-have"
                                ? "bg-red-900/30 text-red-300 border-red-800/50"
                                : "bg-amber-900/30 text-amber-300 border-amber-800/50"
                            }`}
                          >
                            {req.priority}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{req.description}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* ── TAB 5: OVERVIEW & FIT ── */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                <Card className="border-[#1E2D45] bg-[#111827]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold">Executive Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                      {analysis.summary}
                    </p>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="border-[#1E2D45] bg-[#111827]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-muted-foreground">Timeline Parameters</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Estimated Duration:</span>
                        <span className="font-medium text-foreground">{analysis.timeline?.projectDuration || "Not specified"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Submission Deadline:</span>
                        <span className="font-medium text-foreground">{analysis.timeline?.submissionDeadline || "Not specified"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target Start Date:</span>
                        <span className="font-medium text-foreground">{analysis.timeline?.projectStartDate || "Not specified"}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-[#1E2D45] bg-[#111827]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-muted-foreground">Budget & Commercials</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contract Type:</span>
                        <span className="font-medium text-foreground capitalize">{analysis.budget?.contractType || "Fixed Price"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Estimated Value:</span>
                        <span className="font-medium text-foreground">{analysis.budget?.estimatedValue || "Undefined"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Budget Range:</span>
                        <span className="font-medium text-foreground">{analysis.budget?.budgetRange || "Not specified"}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}
