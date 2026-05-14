"use client"

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger,
  SheetDescription 
} from "@/components/ui/sheet"
import {
  GripVertical,
  Trash2,
  AlertTriangle,
  Plus,
  CheckCircle2,
  BookPlus,
  Info,
  Search,
  X,
  FileUp,
  Download,
  ChevronRight,
  ChevronDown,
  Edit2,
  Layers,
  Activity,
  MoreHorizontal,
  BarChart2,
} from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import debounce from "lodash.debounce"
import Papa from "papaparse"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

import { WBSComponent, WBSActual, Project } from "@/lib/types"
import { updateWBSComponents, createLibraryComponent } from "@/lib/actions"
import { AddFromLibraryModal } from "./add-from-library-modal"
import { useSaveStatus } from "@/components/save-status-context"
import { ActualsSheet } from "@/components/actuals-sheet"

// ── Constants ──────────────────────────────────────────────

const HRS_PER_SP = 4

const COMPLEXITY_DEFAULTS: Record<string, { sp: number; hrs: number }> = {
  simple:       { sp: 2,  hrs: 8  },   // 2 × 4
  medium:       { sp: 5,  hrs: 20 },   // 5 × 4
  complex:      { sp: 13, hrs: 52 },   // 13 × 4
  very_complex: { sp: 21, hrs: 84 },   // 21 × 4
  spike:        { sp: 0,  hrs: 0  },
}

const CONFIDENCE_CONTINGENCY: Record<string, number> = {
  high:   0.1,
  medium: 0.2,
  low:    0.35,
  spike:  0,
}

// Valid Fibonacci SP values (excluding spike's "?")
const FIBONACCI_NUMS: number[] = [0.5, 1, 2, 3, 5, 8, 13, 21]

function nearestFib(n: number): number {
  if (!n || n <= 0) return 1
  return FIBONACCI_NUMS.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev
  )
}

// ── Types ──────────────────────────────────────────────────

interface WBSWorkspaceProps {
  projectId: string
  initialComponents: WBSComponent[]
  library: any[]
  project?: Project
  initialActuals?: WBSActual[]
}

// ── Main Component ─────────────────────────────────────────

export function WBSWorkspace({ projectId, initialComponents, library, project, initialActuals = [] }: WBSWorkspaceProps) {
  const [components, setComponents] = useState<WBSComponent[]>(initialComponents)
  const { setSaveState } = useSaveStatus()
  const saveCount = useRef(0)
  const [velocity, setVelocity] = useState(15)
  const [sprintLength, setSprintLength] = useState(2)
  const [quotedTimeline, setQuotedTimeline] = useState(12)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState("all")
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [actualsOpen, setActualsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleRowExpansion = (id: string) => {
    const next = new Set(expandedRows)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedRows(next)
  }

  // Totals — exclude spike rows from SP count
  const totals = useMemo(() => {
    let storyPoints = 0
    let baseHours = 0
    let contingencyHours = 0

    components.forEach(c => {
      if (c.complexity !== "spike") {
        storyPoints += Math.max(0, c.story_points || 0)
      }
      baseHours += Math.max(0, c.base_hours || 0)
      const contPct = CONFIDENCE_CONTINGENCY[c.confidence_level] || 0
      contingencyHours += Math.max(0, c.base_hours || 0) * contPct
    })

    const totalHours = baseHours + contingencyHours
    const weightedContingency = baseHours > 0 ? (contingencyHours / baseHours) * 100 : 0

    return { storyPoints, baseHours, contingencyHours, totalHours, weightedContingency }
  }, [components])

  // Accuracy KPI from recorded actuals
  const accuracyKPI = useMemo(() => {
    if (!initialActuals.length) return null
    const billable = components.filter(c => c.complexity !== "spike" && c.base_hours > 0)
    let totalEst = 0, totalAct = 0
    for (const c of billable) {
      const a = initialActuals.find(a => a.wbs_component_id === c.id)
      if (a) { totalEst += c.base_hours; totalAct += a.actual_hours }
    }
    if (!totalEst) return null
    return Math.round((totalAct / totalEst) * 100)
  }, [components, initialActuals])

  // Velocity check uses live SP total from the same memo
  const velocityCheck = useMemo(() => {
    const sprintsNeeded = velocity > 0 ? Math.ceil(totals.storyPoints / velocity) : 0
    const impliedWeeks = sprintsNeeded * sprintLength
    const gap = quotedTimeline - impliedWeeks
    return { sprintsNeeded, impliedWeeks, gap, achievable: gap >= 0 }
  }, [totals.storyPoints, velocity, sprintLength, quotedTimeline])

  const filteredRows = useMemo(() => {
    if (!searchTerm) return components
    const lowerSearch = searchTerm.toLowerCase()
    return components.filter(c => 
      c.component_name.toLowerCase().includes(lowerSearch) ||
      (c.category && c.category.toLowerCase().includes(lowerSearch)) ||
      (c.notes && c.notes.toLowerCase().includes(lowerSearch))
    )
  }, [components, searchTerm])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]
    if (sortBy === 'all') return rows

    const complexityOrder: Record<string, number> = { simple: 1, medium: 2, complex: 3, very_complex: 4, spike: 5 }
    const confidenceOrder: Record<string, number> = { high: 1, medium: 2, low: 3, spike: 4 }

    return rows.sort((a, b) => {
      switch (sortBy) {
        case 'category-asc':
          return (a.category || '').localeCompare(b.category || '')
        case 'category-desc':
          return (b.category || '').localeCompare(a.category || '')
        case 'complexity-asc':
          return (complexityOrder[a.complexity] || 99) - (complexityOrder[b.complexity] || 99)
        case 'complexity-desc':
          return (complexityOrder[b.complexity] || 99) - (complexityOrder[a.complexity] || 99)
        case 'sp-asc':
          return (a.story_points || 0) - (b.story_points || 0)
        case 'sp-desc':
          return (b.story_points || 0) - (a.story_points || 0)
        case 'hours-asc':
          return (a.base_hours || 0) - (b.base_hours || 0)
        case 'hours-desc':
          return (b.base_hours || 0) - (a.base_hours || 0)
        case 'confidence-asc':
          return (confidenceOrder[a.confidence_level] || 99) - (confidenceOrder[b.confidence_level] || 99)
        case 'confidence-desc':
          return (confidenceOrder[b.confidence_level] || 99) - (confidenceOrder[a.confidence_level] || 99)
        case 'recent':
          return (b.sort_order ?? 0) - (a.sort_order ?? 0)
        default:
          return 0
      }
    })
  }, [filteredRows, sortBy])

  // Auto-save
  const debouncedSave = useCallback(
    debounce((data: WBSComponent[]) => {
      saveCount.current += 1
      setSaveState(true)
      updateWBSComponents(projectId, data)
        .then(() => {
          setTimeout(() => {
            saveCount.current -= 1
            if (saveCount.current <= 0) { saveCount.current = 0; setSaveState(false) }
          }, 500)
        })
        .catch(err => {
          console.error(err)
          toast.error("Auto-save failed")
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaveState(false) }
        })
    }, 800),
    [projectId, setSaveState]
  )

  useEffect(() => {
    if (components !== initialComponents) {
      debouncedSave(components)
    }
  }, [components, debouncedSave, initialComponents])

  // ── Handlers ───────────────────────────────────────────

  const addRow = () => {
    const newRow: WBSComponent = {
      id: uuidv4(),
      project_id: projectId,
      category: "User Story",
      component_name: "New Story",
      description: "",
      complexity: "medium",
      story_points: COMPLEXITY_DEFAULTS.medium.sp,
      base_hours: COMPLEXITY_DEFAULTS.medium.hrs,
      confidence_level: "medium",
      notes: "",
      sort_order: components.length
    }
    setComponents([...components, newRow])
  }

  const addFromLibrary = (selected: any[]) => {
    const newRows: WBSComponent[] = selected.map((item, index) => ({
      id: uuidv4(),
      project_id: projectId,
      category: item.category,
      component_name: item.component_name,
      description: item.description,
      complexity: item.complexity as any,
      story_points: item.story_points,
      base_hours: item.base_hours,
      confidence_level: "medium",
      notes: item.notes,
      sort_order: components.length + index
    }))
    setComponents([...components, ...newRows])
    toast.success(`Added ${selected.length} components from library`)
  }

  const updateRow = (id: string, updates: any) => {
    setComponents(prev => prev.map(c => {
      if (c.id !== id) return c

      const updated = { ...c, ...updates }

      // Complexity changed → reset SP to Fibonacci default and recalculate hours
      if (updates.complexity !== undefined && updates.complexity !== c.complexity) {
        const defaults = COMPLEXITY_DEFAULTS[updates.complexity as keyof typeof COMPLEXITY_DEFAULTS]
        updated.story_points = defaults.sp
        updated.base_hours = defaults.hrs
        // Spike complexity forces spike confidence
        if (updates.complexity === "spike") {
          updated.confidence_level = "spike"
        }
      }

      // SP changed without a simultaneous complexity change → recalculate base hours
      if (updates.story_points !== undefined && updates.complexity === undefined) {
        const sp = updates.story_points as number
        updated.base_hours = updated.complexity === "spike" ? 0 : sp * HRS_PER_SP
      }

      return updated
    }))
  }

  const deleteRow = () => {
    if (!deleteId) return
    setComponents(prev => prev.filter(c => c.id !== deleteId))
    setDeleteId(null)
    toast.success("Row removed")
  }

  const downloadTemplate = () => {
    const headers = ["Category", "Component Name", "Description", "Complexity", "Story Points", "Base Hours", "Notes"]
    const sampleData = [
      ["Frontend", "Login Screen", "Standard login with email", "medium", "5", "20", "Example row"],
      ["Backend", "User Profile API", "CRUD endpoints", "simple", "3", "12", ""]
    ]
    const csvContent = Papa.unparse({ fields: headers, data: sampleData })
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", "wbs_import_template.csv")
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportWBS = () => {
    if (components.length === 0) { toast.error("No components to export"); return }
    const headers = ["Category", "Component Name", "Description", "Complexity", "Story Points", "Base Hours", "Confidence Level", "Notes"]
    const rows = components.map(c => [
      c.category || "", c.component_name, c.description || "",
      c.complexity, c.story_points, c.base_hours, c.confidence_level, c.notes || ""
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "wbs-export.csv"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const importedData = results.data as any[]
        if (importedData.length === 0) {
          toast.error("CSV file is empty")
          return
        }

        const newComponents: WBSComponent[] = importedData.map((row, index) => {
          const complexity = (row["Complexity"] || "medium").toLowerCase().replace(" ", "_")
          const validComplexity = Object.keys(COMPLEXITY_DEFAULTS).includes(complexity) 
            ? complexity as any 
            : "medium"
          
          const defaultVals = COMPLEXITY_DEFAULTS[validComplexity]
          
          return {
            id: uuidv4(),
            project_id: projectId,
            category: row["Category"] || "Other",
            component_name: row["Component Name"] || "Imported Item",
            description: row["Description"] || "",
            complexity: validComplexity,
            story_points: parseFloat(row["Story Points"]) || defaultVals.sp,
            base_hours: parseFloat(row["Base Hours"]) || defaultVals.hrs,
            confidence_level: "medium",
            notes: row["Notes"] || "",
            sort_order: components.length + index
          }
        })

        setComponents([...components, ...newComponents])
        toast.success(`Successfully imported ${newComponents.length} components`)
        if (fileInputRef.current) fileInputRef.current.value = ""
      },
      error: (error) => {
        console.error("CSV Parse Error:", error)
        toast.error("Failed to parse CSV file")
      }
    })
  }

  const handleSaveToLibrary = async (c: WBSComponent) => {
    if (!c.component_name.trim()) {
      toast.error("Component name is required")
      return
    }
    try {
      await createLibraryComponent({
        category: c.category,
        component_name: c.component_name,
        description: c.description || "",
        complexity: c.complexity,
        story_points: c.story_points,
        base_hours: c.base_hours,
        notes: c.notes || ""
      })
      toast.success(`${c.component_name} added to library`)
    } catch {
      toast.error("Failed to add to library")
    }
  }

  // DND
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: any) => {
    const { active, over } = event
    if (active && over && active.id !== over.id) {
      setComponents((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id)
        const newIndex = items.findIndex(i => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex).map((item, index) => ({ ...item, sort_order: index }))
      })
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 relative pb-40">

        {/* Sticky Top Bar */}
        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
        <div className="sticky top-0 z-20 bg-[#0D1526]/95 backdrop-blur-md border-b border-[#1E2D45] -mx-6 px-6 py-4 flex items-center justify-between shadow-sm">
          {/* KPI stats */}
          <div className="flex items-center gap-3">
            <StatTile
              label="Total Story Points"
              value={totals.storyPoints}
              subtext={components.length !== filteredRows.length ? `(+${components.length - filteredRows.length} hidden)` : undefined}
            />
            <StatTile
              label="Base Const. Hours"
              value={totals.baseHours.toFixed(1)}
              subtext={components.length !== filteredRows.length ? `(+${components.length - filteredRows.length} hidden)` : undefined}
            />
            <StatTile
              label="Weighted Contingency"
              value={`${totals.weightedContingency.toFixed(0)}%`}
            />
            <StatTile
              label="Total Est. Hours"
              value={totals.totalHours.toFixed(1)}
              subtext={components.length !== filteredRows.length ? `(+${components.length - filteredRows.length} hidden)` : undefined}
            />
            {(() => {
              const score = Math.round(Math.max(0, 100 - totals.weightedContingency))
              const scheme: "green" | "amber" | "red" = score >= 80 ? "green" : score >= 60 ? "amber" : "red"
              return <StatTile label="Confidence" value={`${score}%`} colorScheme={scheme} />
            })()}
            {accuracyKPI !== null && (() => {
              const scheme: "green" | "amber" | "red" = accuracyKPI <= 100 ? "green" : accuracyKPI <= 120 ? "amber" : "red"
              return <StatTile label="Est. Accuracy" value={`${accuracyKPI}%`} colorScheme={scheme} />
            })()}
          </div>

          <Separator orientation="vertical" className="h-8 mx-2" />

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Secondary — hidden on narrow screens */}
            <div className="hidden lg:flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Sheet>
                      <SheetTrigger
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              "gap-2 h-9 px-3 rounded-xl border shadow-sm transition-all",
                              !velocityCheck.achievable && "border-orange-500 text-orange-400 bg-orange-900/20 hover:bg-orange-900/30"
                            )}
                          />
                        }
                      >
                        <Activity className="h-4 w-4" />
                        Velocity Check
                        {!velocityCheck.achievable && <AlertTriangle className="h-4 w-4" />}
                      </SheetTrigger>
                <SheetContent className="sm:max-w-xl sm:!max-w-xl overflow-y-auto">
                  <SheetHeader className="pb-6 border-b">
                    <SheetTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      Velocity Sanity Check
                    </SheetTitle>
                    <SheetDescription>
                      Verify if your quoted timeline is achievable based on current story point velocity.
                    </SheetDescription>
                  </SheetHeader>
                  
                  <div className="mt-8 space-y-8 px-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sprint Velocity (SP)</label>
                        <Input
                          type="number"
                          value={velocity}
                          onChange={e => setVelocity(Number(e.target.value))}
                          className="h-10 text-base font-semibold"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sprint Weeks</label>
                        <Input
                          type="number"
                          value={sprintLength}
                          onChange={e => setSprintLength(Number(e.target.value))}
                          className="h-10 text-base font-semibold"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#1E2D45] bg-[#111827] p-5 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Total Story Points</span>
                        <span className="text-lg font-bold tabular-nums">{totals.storyPoints}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Sprints Needed</span>
                        <span className="text-lg font-semibold tabular-nums">{velocityCheck.sprintsNeeded}</span>
                      </div>
                      <Separator className="bg-[#1E2D45]" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold">Implied Duration</span>
                        <span className="text-lg font-bold text-primary tabular-nums">{velocityCheck.impliedWeeks} weeks</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quoted Timeline (Weeks)</label>
                      <div className="flex gap-4">
                        <Input
                          type="number"
                          value={quotedTimeline}
                          onChange={e => setQuotedTimeline(Number(e.target.value))}
                          className="h-12 text-lg font-bold"
                        />
                        <div className={cn(
                          "flex items-center justify-center px-6 rounded-xl text-sm font-black tracking-tight border shadow-sm",
                          velocityCheck.achievable ? 'bg-green-900/20 text-green-400 border-green-800' : 'bg-red-900/20 text-red-400 border-red-800'
                        )}>
                          {velocityCheck.gap > 0 ? '+' : ''}{velocityCheck.gap} wk
                        </div>
                      </div>
                    </div>

                    {!velocityCheck.achievable && (
                      <div className="bg-orange-900/20 border border-orange-800/50 p-4 rounded-xl text-sm text-orange-300 leading-relaxed shadow-sm">
                        <div className="font-bold flex items-center gap-2 mb-2 text-orange-200">
                          <AlertTriangle className="h-5 w-5" /> PROJECT AT RISK
                        </div>
                        The current scope (<strong>{totals.storyPoints} SP</strong>) exceeds your quoted timeline. 
                        You need <strong>{velocityCheck.impliedWeeks} weeks</strong> but have only allocated <strong>{quotedTimeline}</strong>. 
                        Consider increasing velocity, reducing scope, or extending the timeline.
                      </div>
                    )}
                    
                    {velocityCheck.achievable && (
                      <div className="bg-green-900/20 border border-green-800/50 p-4 rounded-xl text-sm text-green-300 leading-relaxed shadow-sm">
                        <div className="font-bold flex items-center gap-2 mb-2 text-green-200">
                          <CheckCircle2 className="h-5 w-5" /> TIMELINE ACHIEVABLE
                        </div>
                        Your current scope fits comfortably within the quoted timeline with a <strong>{velocityCheck.gap} week</strong> buffer.
                      </div>
                    )}
                  </div>
                </SheetContent>
                    </Sheet>
                  </div>
                </TooltipTrigger>
                {!velocityCheck.achievable && (
                  <TooltipContent side="bottom" className="max-w-[260px] text-center leading-snug">
                    Timeline warning: at {velocity} SP/sprint, {totals.storyPoints} SP requires {velocityCheck.impliedWeeks} weeks. You are {Math.abs(velocityCheck.gap)} week{Math.abs(velocityCheck.gap) !== 1 ? "s" : ""} short.
                  </TooltipContent>
                )}
              </Tooltip>

              {project?.status === 'won' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9 px-3 rounded-xl text-green-400 border-green-800 bg-green-900/20 hover:bg-green-900/30"
                  onClick={() => setActualsOpen(true)}
                >
                  <BarChart2 className="h-4 w-4" /> Record Actuals
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="sm" className="gap-1.5 h-9 px-3 rounded-xl" />}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  More
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={downloadTemplate}>
                    <Download className="h-4 w-4" /> Download Template
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <FileUp className="h-4 w-4" /> Import CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportWBS}>
                    <Download className="h-4 w-4" /> Export WBS
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Separator orientation="vertical" className="h-6" />
            </div>

            {/* Primary — always visible */}
            <AddFromLibraryModal library={library} onAdd={addFromLibrary} />
            <Button onClick={addRow} className="bg-sidebar text-white hover:bg-sidebar-accent gap-2 h-9">
              <Plus className="h-4 w-4" /> Add Row
            </Button>
          </div>
        </div>

        {/* Search and Sort Bar */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by component name, category, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="w-[240px] flex items-center gap-2 shrink-0">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Sort by:</span>
              <Select value={sortBy} onValueChange={(val) => setSortBy(val || "all")}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (Original Order)</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="category-asc">Category A–Z</SelectItem>
                  <SelectItem value="category-desc">Category Z–A</SelectItem>
                  <SelectItem value="complexity-asc">Complexity: Simple → Very Complex</SelectItem>
                  <SelectItem value="complexity-desc">Complexity: Very Complex → Simple</SelectItem>
                  <SelectItem value="sp-asc">Story Points: Low → High</SelectItem>
                  <SelectItem value="sp-desc">Story Points: High → Low</SelectItem>
                  <SelectItem value="hours-asc">Base Hours: Low → High</SelectItem>
                  <SelectItem value="hours-desc">Base Hours: High → Low</SelectItem>
                  <SelectItem value="recent">Recently Added</SelectItem>
                  <SelectItem value="confidence-asc">Confidence: High → Low</SelectItem>
                  <SelectItem value="confidence-desc">Confidence: Low → High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {searchTerm && (
            <p className="text-xs text-muted-foreground">
              {filteredRows.length > 0 
                ? `Showing ${filteredRows.length} of ${components.length} components`
                : "No components match your search. Clear search to see all."}
            </p>
          )}
        </div>

        {/* Component Table */}
        <div className="rounded-md border border-[#1E2D45] bg-[#111827] overflow-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table>
              <TableHeader className="bg-[#0D1526]">
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead className="w-[150px]">Category</TableHead>
                  <TableHead>Component Name</TableHead>
                  <TableHead className="w-[150px]">Complexity</TableHead>
                  <TableHead className="w-[120px]">SP</TableHead>
                  <TableHead className="w-[80px]">Base Hrs</TableHead>
                  <TableHead className="w-[140px]">Confidence</TableHead>
                  <TableHead className="w-[80px]">Cont. Hrs</TableHead>
                  <TableHead className="w-[100px]">Total Hrs</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext items={sortedRows} strategy={verticalListSortingStrategy}>
                  {sortedRows.map((c, index) => {
                    const isFirstInCategory = 
                      sortBy.startsWith('category') && 
                      (index === 0 || sortedRows[index - 1].category !== c.category);

                    return (
                      <React.Fragment key={c.id}>
                        {isFirstInCategory && (
                          <TableRow className="bg-[#1E2D45]/30 hover:bg-[#1E2D45]/30">
                            <TableCell colSpan={12} className="py-2 px-4 text-xs font-bold text-primary uppercase tracking-wider">
                              {c.category || 'Uncategorized'}
                            </TableCell>
                          </TableRow>
                        )}
                        <SortableRow
                          component={c}
                          index={index}
                          isExpanded={expandedRows.has(c.id)}
                          onToggleExpand={() => toggleRowExpansion(c.id)}
                          updateRow={updateRow}
                          deleteRow={() => setDeleteId(c.id)}
                          saveToLibrary={handleSaveToLibrary}
                        />
                      </React.Fragment>
                    )
                  })}
                </SortableContext>
                {components.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                          <Plus className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-lg">No components yet</p>
                          <p className="text-sm text-muted-foreground">Start building your project estimate by adding rows.</p>
                        </div>
                        <div className="flex gap-3">
                          <Button 
                            variant="outline" 
                            onClick={downloadTemplate}
                            className="gap-2"
                          >
                            <Download className="h-4 w-4" /> Download Template
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => fileInputRef.current?.click()}
                            className="gap-2"
                          >
                            <FileUp className="h-4 w-4" /> Import CSV
                          </Button>
                          <AddFromLibraryModal library={library} onAdd={addFromLibrary} />
                          <Button onClick={addRow} variant="secondary">Manual Add</Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>

        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove component?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove this line item from your project estimate. This action is auto-saved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteRow} className="bg-red-600 hover:bg-red-700 text-white">Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {project?.status === 'won' && (
          <ActualsSheet
            projectId={projectId}
            components={components}
            existingActuals={initialActuals}
            open={actualsOpen}
            onClose={() => setActualsOpen(false)}
          />
        )}

      </div>
    </TooltipProvider>
  )
}

// ── Stat Tile ──────────────────────────────────────────────

function StatTile({ label, value, subtext, colorScheme }: { label: string; value: string | number; subtext?: React.ReactNode; colorScheme?: "green" | "amber" | "red" }) {
  return (
    <div className={cn(
      "px-4 py-3 rounded-xl border transition-all duration-300 min-w-[120px]",
      colorScheme === "green" ? "bg-green-900/20 border-green-800/50 shadow-sm" :
      colorScheme === "amber" ? "bg-amber-900/20 border-amber-800/50 shadow-sm" :
      colorScheme === "red"   ? "bg-red-900/20 border-red-800/50 shadow-sm" :
      "bg-[#111827] border-[#1E2D45] shadow-sm"
    )}>
      <p className={cn(
        "text-[10px] uppercase tracking-wider font-bold mb-1.5",
        colorScheme === "green" ? "text-green-400" :
        colorScheme === "amber" ? "text-amber-400" :
        colorScheme === "red"   ? "text-red-400" :
        "text-muted-foreground"
      )}>{label}</p>
      <div className="flex items-baseline gap-2">
        <p className={cn(
          "text-2xl font-bold tabular-nums tracking-tight",
          colorScheme === "green" ? "text-green-300" :
          colorScheme === "amber" ? "text-amber-300" :
          colorScheme === "red"   ? "text-red-300" :
          "text-foreground"
        )}>
          {value}
        </p>
        {subtext && <span className="text-[10px] text-muted-foreground font-semibold bg-[#1E2D45] px-1.5 py-0.5 rounded-md">{subtext}</span>}
      </div>
    </div>
  )
}

// ── Sortable Row ───────────────────────────────────────────

function SortableRow({
  component: c,
  index,
  isExpanded,
  onToggleExpand,
  updateRow,
  deleteRow,
  saveToLibrary
}: {
  component: WBSComponent
  index: number
  isExpanded: boolean
  onToggleExpand: () => void
  updateRow: (id: string, updates: any) => void
  deleteRow: () => void
  saveToLibrary: (c: WBSComponent) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1
  }

  const isSpike = c.complexity === "spike"
  const contPercent = CONFIDENCE_CONTINGENCY[c.confidence_level] || 0
  const contingencyHrs = (c.base_hours || 0) * contPercent
  const totalHrs = (c.base_hours || 0) + contingencyHrs

  const subtasks = c.subtasks || []
  const subtasksSum = subtasks.reduce((a, s) => a + (s.hours || 0), 0)
  const hasSubtasks = subtasks.length > 0
  const isAutoRolledUp = hasSubtasks && !c.is_hours_overridden

  // Keep a stable ref so the effect below doesn't re-run every time the
  // parent recreates the updateRow function reference.
  const updateRowRef = useRef(updateRow)
  updateRowRef.current = updateRow

  // Effect to keep base_hours in sync with subtasks sum if not overridden
  useEffect(() => {
    if (isAutoRolledUp && c.base_hours !== subtasksSum) {
      updateRowRef.current(c.id, { base_hours: subtasksSum })
    }
  }, [subtasksSum, isAutoRolledUp, c.id, c.base_hours])

  // Fibonacci SP display logic
  const displaySP = FIBONACCI_NUMS.includes(c.story_points)
    ? c.story_points
    : nearestFib(c.story_points || 1)
  const spSelectValue = String(displaySP)
  const defaultSP = COMPLEXITY_DEFAULTS[c.complexity]?.sp ?? 0
  const isSpOverridden = !isSpike && displaySP !== defaultSP
  const showSplitWarning = displaySP === 21 && !isSpike

  const handleSPChange = (value: string | null) => {
    if (!value) return
    if (value === "?") {
      updateRow(c.id, { story_points: 0, base_hours: 0, complexity: "spike", confidence_level: "spike" })
    } else {
      const sp = parseFloat(value)
      updateRow(c.id, { story_points: sp })
    }
  }

  const ghostIdRef = useRef(uuidv4())
  const [ghostName, setGhostName] = useState("")
  const ghostTaskRef = useRef<HTMLInputElement | null>(null)

  const handleGhostNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!val.trim()) { setGhostName(val); return }
    // Rotate the ghost ID first so the next render's ghost row gets a fresh key.
    // React will then reuse the current ghost DOM element as the newly committed row
    // (same key, same list position), keeping focus and the typed character intact.
    const committedId = ghostIdRef.current
    ghostIdRef.current = uuidv4()
    setGhostName("")
    updateRow(c.id, { subtasks: [...subtasks, { id: committedId, task_name: val, hours: 0 }] })
  }

  const handleSubtaskBlur = (sid: string, taskName: string) => {
    if (!taskName.trim()) removeSubtask(sid)
  }

  const updateSubtask = (sid: string, updates: any) => {
    const next = subtasks.map(s => s.id === sid ? { ...s, ...updates } : s)
    updateRow(c.id, { subtasks: next })
  }

  const removeSubtask = (sid: string) => {
    const next = subtasks.filter(s => s.id !== sid)
    updateRow(c.id, { subtasks: next })
  }

  return (
    <React.Fragment>
      <TableRow
        ref={setNodeRef}
        style={style}
        className={cn(
          isSpike ? "bg-orange-900/10 border-l-4 border-l-orange-500" : "",
          isExpanded ? "border-b-0 bg-[#162032]/50" : ""
        )}
      >
        <TableCell className="p-0">
          <button {...attributes} {...listeners} className="p-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
            <GripVertical className="h-4 w-4" />
          </button>
        </TableCell>

        <TableCell className="p-0">
          <Button variant="ghost" size="icon-sm" onClick={onToggleExpand} className="text-muted-foreground">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>

        <TableCell className="text-muted-foreground font-mono text-xs">{index + 1}</TableCell>

        {/* Category */}
        <TableCell>
          <Select value={c.category || ""} onValueChange={v => updateRow(c.id, { category: v })}>
            <SelectTrigger className="h-8 text-xs border-none bg-transparent hover:bg-[#1E2D45] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["User Story", "Frontend", "Backend", "Integration", "Data/Analytics", "Infrastructure", "Security", "Mobile", "Other"].map(cat => (
                <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>

        {/* Component Name */}
        <TableCell>
          <div className="flex flex-col gap-1">
            <input
              value={c.component_name}
              onChange={e => updateRow(c.id, { component_name: e.target.value })}
              className="w-full bg-transparent font-medium border-none focus:ring-0 text-sm p-0 h-auto"
            />
            <div className="flex items-center gap-2">
              {isSpike && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 uppercase italic">
                  <AlertTriangle className="h-3 w-3" /> Requires Discovery
                </span>
              )}
              {c.notes && (
                <span className="text-[10px] text-muted-foreground italic truncate max-w-[200px]">
                  {c.notes}
                </span>
              )}
            </div>
          </div>
        </TableCell>

        {/* Complexity */}
        <TableCell>
          <Select value={c.complexity} onValueChange={v => updateRow(c.id, { complexity: v as any })}>
            <SelectTrigger className="h-8 text-xs border-none bg-transparent hover:bg-[#1E2D45] shadow-none capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["simple", "medium", "complex", "very_complex", "spike"].map(comp => (
                <SelectItem key={comp} value={comp} className="text-xs capitalize">
                  {comp.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>

        {/* SP */}
        <TableCell className={cn(isSpOverridden ? "bg-yellow-900/20" : "")}>
          {isSpike ? (
            <span className="block px-2 text-sm text-muted-foreground font-medium select-none">?</span>
          ) : (
            <div className="flex items-center gap-0.5">
              <Select value={spSelectValue} onValueChange={handleSPChange}>
                <SelectTrigger className="h-7 text-xs border-none bg-transparent hover:bg-[#1E2D45] shadow-none px-1 w-[54px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5" className="text-xs">½</SelectItem>
                  <SelectItem value="1"   className="text-xs">1</SelectItem>
                  <SelectItem value="2"   className="text-xs">2</SelectItem>
                  <SelectItem value="3"   className="text-xs">3</SelectItem>
                  <SelectItem value="5"   className="text-xs">5</SelectItem>
                  <SelectItem value="8"   className="text-xs">8</SelectItem>
                  <SelectItem value="13"  className="text-xs">13</SelectItem>
                  <SelectItem value="21"  className="text-xs">21</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="?" className="text-xs text-orange-600">? spike</SelectItem>
                </SelectContent>
              </Select>
              {showSplitWarning && (
                <Tooltip><TooltipTrigger><AlertTriangle className="h-3.5 w-3.5 text-orange-500" /></TooltipTrigger><TooltipContent>Consider splitting this component</TooltipContent></Tooltip>
              )}
            </div>
          )}
        </TableCell>

        {/* Base Hours */}
        <TableCell className={cn(isAutoRolledUp ? "bg-blue-900/20" : c.is_hours_overridden ? "bg-orange-900/20" : "")}>
          <div className="flex items-center gap-1 group">
            <input
              type="number"
              min="0"
              value={c.base_hours}
              onChange={e => updateRow(c.id, { base_hours: Number(e.target.value), is_hours_overridden: hasSubtasks })}
              className="w-full bg-transparent border-none focus:ring-0 text-sm text-center p-0 h-auto font-medium"
            />
            {hasSubtasks && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={() => updateRow(c.id, { is_hours_overridden: !c.is_hours_overridden })}
                    className={cn("p-1 rounded hover:bg-[#1E2D45]", c.is_hours_overridden ? "text-orange-400" : "text-blue-400")}
                  >
                    {c.is_hours_overridden ? <Edit2 className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {c.is_hours_overridden ? "Manual Override Active" : "Auto-rolled up from sub-tasks"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>

        {/* Confidence */}
        <TableCell>
          <Select value={c.confidence_level} onValueChange={v => updateRow(c.id, { confidence_level: v as any })}>
            <SelectTrigger className="h-8 text-xs border-none bg-transparent hover:bg-[#1E2D45] shadow-none capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(CONFIDENCE_CONTINGENCY).map(conf => (
                <SelectItem key={conf} value={conf} className="text-xs capitalize">{conf}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>

        <TableCell className="text-right text-xs text-muted-foreground font-medium pr-4">{contingencyHrs.toFixed(1)}</TableCell>
        <TableCell className="text-right text-sm font-bold pr-4">{totalHrs.toFixed(1)}</TableCell>

        {/* Actions */}
        <TableCell className="p-0 text-right pr-2">
          <Button variant="ghost" size="icon-sm" onClick={() => saveToLibrary(c)} title="Save to Library" className="text-muted-foreground hover:text-sidebar mr-1">
            <BookPlus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={deleteRow} title="Delete" className="text-muted-foreground hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow className="bg-[#0D1526]/40 hover:bg-[#0D1526]/40">
          <TableCell />
          <TableCell colSpan={11} className="py-2 px-4 border-l-2 border-l-sidebar/20">
            <div className="grid grid-cols-2 gap-4">
              {/* Sub-tasks Section */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-sidebar flex items-center gap-1.5">
                  <Layers className="h-3 w-3" /> Sub-task Breakdown
                </h4>

                <div className="rounded border border-[#1E2D45] bg-[#111827] overflow-hidden">
                  <Table>
                    <TableHeader className="bg-[#0D1526]">
                      <TableRow className="h-6">
                        <TableHead className="text-[10px] py-0 px-2">Task Description</TableHead>
                        <TableHead className="text-[10px] py-0 px-2 w-[72px] text-center">Hours</TableHead>
                        <TableHead className="text-[10px] py-0 px-1 w-[32px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Committed rows + ghost in ONE flat array so React can match keys
                          across all siblings and reuse the ghost DOM element on commit. */}
                      {[
                        ...subtasks.map(s => (
                          <TableRow key={s.id} className="h-7">
                            <TableCell className="py-0 px-2">
                              <input
                                value={s.task_name}
                                onChange={e => updateSubtask(s.id, { task_name: e.target.value })}
                                onFocus={e => e.target.select()}
                                onBlur={e => handleSubtaskBlur(s.id, e.target.value)}
                                className="w-full bg-transparent border-none focus:ring-0 text-xs p-0 h-6"
                                placeholder="Task description"
                              />
                            </TableCell>
                            <TableCell className="py-0 px-2">
                              <input
                                type="number"
                                min="0"
                                value={s.hours}
                                onChange={e => updateSubtask(s.id, { hours: Number(e.target.value) })}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === 'Tab') {
                                    e.preventDefault()
                                    ghostTaskRef.current?.focus()
                                  }
                                }}
                                className="w-full bg-transparent border-none focus:ring-0 text-xs text-center p-0 h-6 font-medium"
                              />
                            </TableCell>
                            <TableCell className="py-0 px-1 text-right">
                              <Button variant="ghost" size="icon-sm" onClick={() => removeSubtask(s.id)} className="h-5 w-5 text-muted-foreground hover:text-red-600">
                                <X className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )),
                        // Ghost row shares the key pool with committed rows above, so when
                        // handleGhostNameChange rotates ghostIdRef and adds a committed subtask
                        // with the old ghost key, React sees the same key at the same list
                        // position and reuses the DOM element — preserving focus and the
                        // first typed character without any manual focus management.
                        <TableRow key={ghostIdRef.current} className="h-7 opacity-40 hover:opacity-90 focus-within:opacity-90 transition-opacity">
                          <TableCell className="py-0 px-2">
                            <input
                              ref={ghostTaskRef}
                              value={ghostName}
                              onChange={handleGhostNameChange}
                              className="w-full bg-transparent border-none focus:ring-0 text-xs p-0 h-6"
                              placeholder="+ Add sub-task…"
                            />
                          </TableCell>
                          <TableCell className="py-0 px-2">
                            <input
                              type="number"
                              min="0"
                              defaultValue={0}
                              readOnly
                              tabIndex={-1}
                              className="w-full bg-transparent border-none focus:ring-0 text-xs text-center p-0 h-6 font-medium opacity-0 pointer-events-none"
                            />
                          </TableCell>
                          <TableCell />
                        </TableRow>,
                      ]}
                      {subtasks.length > 0 && (
                        <TableRow className="bg-[#1E2D45]/30 font-bold border-t border-[#1E2D45]">
                          <TableCell className="py-1 px-2 text-[10px] uppercase">Roll-up Total</TableCell>
                          <TableCell className="py-1 px-2 text-xs text-center tabular-nums">{subtasksSum}</TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Notes Section */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-sidebar flex items-center gap-1.5">
                  <Info className="h-3 w-3" /> Notes
                </h4>
                <Textarea
                  value={c.notes || ""}
                  onChange={e => updateRow(c.id, { notes: e.target.value })}
                  placeholder="Assumptions, exclusions, discovery scope…"
                  className="min-h-[80px] text-xs leading-relaxed resize-none bg-[#111827]"
                />
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  )
}
