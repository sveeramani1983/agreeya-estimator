"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { format, parseISO, differenceInDays } from "date-fns"
import {
  AlertTriangle, Award, BarChart2, ChevronDown, DollarSign,
  ExternalLink, Filter, Loader2, Search, Target, TrendingUp, X,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from "recharts"
import { updateProjectPursuitData, updateProjectOutcome, getBidScorePredictionAction } from "@/lib/actions"
import type { PipelineData, PipelineProject, ProjectVertical, ServiceLine, DealSizeCategory } from "@/lib/types"
import type { BidPrediction } from "@/lib/intelligence"

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}

function probColor(p: number) {
  if (p >= 70) return "#059669"
  if (p >= 40) return "#D97706"
  return "#DC2626"
}

function probClasses(p: number) {
  if (p >= 70) return "bg-green-900/20 text-green-400 border-green-800/40"
  if (p >= 40) return "bg-amber-900/20 text-amber-400 border-amber-800/40"
  return "bg-red-900/20 text-red-400 border-red-800/40"
}

function isStale(project: PipelineProject): boolean {
  if (project.status !== "submitted") return false
  return differenceInDays(new Date(), new Date(project.updated_at)) > 30
}

function isPriority(project: PipelineProject): boolean {
  return project.quoted_price > 200_000 && (project.win_probability ?? 50) >= 60
}

const VERTICAL_LABELS: Record<string, string> = {
  state_government: "State Government",
  local_government: "Local Government",
  federal: "Federal",
  healthcare: "Healthcare",
  enterprise: "Enterprise",
  other: "Other",
}

const SERVICE_LINE_LABELS: Record<string, string> = {
  custom_build: "Custom Build",
  platform_impl: "Platform Impl",
  integration: "Integration",
  data_analytics: "Data & Analytics",
  cloud_infra: "Cloud / Infra",
  ai_ml: "AI / ML",
  other: "Other",
}

const DEAL_SIZE_LABELS: Record<string, string> = {
  small: "Small (<$50K)",
  medium: "Medium ($50–200K)",
  large: "Large ($200–500K)",
  strategic: "Strategic (>$500K)",
}

function dealSizeFromValue(v: number): DealSizeCategory {
  if (v < 50_000) return "small"
  if (v < 200_000) return "medium"
  if (v < 500_000) return "large"
  return "strategic"
}

// ── Inline Probability Cell ───────────────────────────────────────────────────

function ProbCell({ project, onSaved }: { project: PipelineProject; onSaved?: () => void }) {
  const router = useRouter()
  const [val, setVal] = useState(project.win_probability ?? 50)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    setEditing(false)
    const clamped = Math.min(100, Math.max(0, val))
    setVal(clamped)
    if (clamped === (project.win_probability ?? 50)) return
    setSaving(true)
    try {
      await updateProjectPursuitData(project.id, { win_probability: clamped })
      onSaved?.()
      router.refresh()
    } catch { toast.error("Failed to save") }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <input
        type="number" min={0} max={100} autoFocus value={val}
        onChange={e => setVal(Number(e.target.value))}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save() }}
        className="w-14 rounded border border-[#1E2D45] bg-[#0A1120] px-1.5 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)} disabled={saving}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold hover:opacity-80 transition-opacity ${probClasses(val)}`}
      title="Click to edit"
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: probColor(val) }} />
      {val}%
    </button>
  )
}

// ── Quick Edit Slide-Over ─────────────────────────────────────────────────────

interface EditPanelProps {
  project: PipelineProject
  onClose: () => void
}

const BID_FACTORS = [
  { key: 'technical_fit', label: 'Technical Fit' },
  { key: 'client_relationship', label: 'Client Relationship' },
  { key: 'price_competitiveness', label: 'Price Competitiveness' },
  { key: 'solution_uniqueness', label: 'Solution Uniqueness' },
  { key: 'delivery_confidence', label: 'Delivery Confidence' },
]

function QuickEditPanel({ project, onClose }: EditPanelProps) {
  const router = useRouter()
  const [prob, setProb] = useState(project.win_probability ?? 50)
  const [owner, setOwner] = useState(project.pursuit_owner ?? "")
  const [startDate, setStartDate] = useState(project.expected_start_date ?? "")
  const [vertical, setVertical] = useState(project.vertical ?? "")
  const [serviceLine, setServiceLine] = useState(project.service_line ?? "")
  const [saving, setSaving] = useState(false)

  // Bid scorecard state
  const existingScores = (() => {
    try { return JSON.parse(project.outcome_data || '{}').bidScores || {} } catch { return {} }
  })()
  const [bidScores, setBidScores] = useState<Record<string, number>>(
    () => BID_FACTORS.reduce((acc, f) => ({ ...acc, [f.key]: existingScores[f.key] ?? 5 }), {})
  )
  const [prediction, setPrediction] = useState<BidPrediction | null>(null)
  const [predLoading, setPredLoading] = useState(false)

  useEffect(() => {
    setPredLoading(true)
    getBidScorePredictionAction(bidScores)
      .then(setPrediction)
      .catch(() => setPrediction(null))
      .finally(() => setPredLoading(false))
  }, [bidScores])

  async function handleSave() {
    setSaving(true)
    try {
      // Merge bid scores into outcome_data
      let od: Record<string, any> = {}
      try { od = JSON.parse(project.outcome_data || '{}') } catch {}
      od.bidScores = bidScores
      await updateProjectPursuitData(project.id, {
        win_probability: Math.min(100, Math.max(0, prob)),
        pursuit_owner: owner || undefined,
        expected_start_date: startDate || undefined,
        vertical: vertical as ProjectVertical || undefined,
        service_line: serviceLine as ServiceLine || undefined,
        deal_size_category: project.quoted_price > 0 ? dealSizeFromValue(project.quoted_price) : undefined,
        outcome_data: JSON.stringify(od),
      })
      toast.success("Pursuit data saved")
      router.refresh()
      onClose()
    } catch { toast.error("Failed to save") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-sm bg-[#0D1526] border-l border-[#1E2D45] flex flex-col h-full overflow-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2D45]">
          <div>
            <h3 className="font-semibold text-foreground">Quick Edit</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{project.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {/* Win Probability slider */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Win Probability</label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} value={prob}
                onChange={e => setProb(Number(e.target.value))}
                className="flex-1 accent-blue-500"
              />
              <span className="text-sm font-bold tabular-nums" style={{ color: probColor(prob) }}>
                {prob}%
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0% (Lost)</span><span>50% (Even)</span><span>100% (Won)</span>
            </div>
          </div>

          {/* Expected Start Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Expected Start Date</label>
            <input
              type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full h-9 rounded-md border border-[#1E2D45] bg-[#111827] px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Pursuit Owner */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pursuit Owner</label>
            <input
              type="text" value={owner} placeholder="e.g. John Smith"
              onChange={e => setOwner(e.target.value)}
              className="w-full h-9 rounded-md border border-[#1E2D45] bg-[#111827] px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Vertical */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vertical</label>
            <select
              value={vertical}
              onChange={e => setVertical(e.target.value)}
              className="w-full h-9 rounded-md border border-[#1E2D45] bg-[#111827] px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Select —</option>
              {Object.entries(VERTICAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Service Line */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Service Line</label>
            <select
              value={serviceLine}
              onChange={e => setServiceLine(e.target.value)}
              className="w-full h-9 rounded-md border border-[#1E2D45] bg-[#111827] px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Select —</option>
              {Object.entries(SERVICE_LINE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Value summary */}
          {project.quoted_price > 0 && (
            <div className="rounded-md border border-[#1E2D45] bg-[#0A1120] px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-xs text-muted-foreground">Value</p>
                <p className="text-sm font-bold text-foreground">{fmt(project.quoted_price)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Weighted</p>
                <p className="text-sm font-bold" style={{ color: probColor(prob) }}>
                  {fmt(project.quoted_price * prob / 100)}
                </p>
              </div>
            </div>
          )}

          {/* Surface 4: Bid Scorecard */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bid Scorecard (1–10)</label>
            {BID_FACTORS.map(f => (
              <div key={f.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-bold tabular-nums" style={{ color: bidScores[f.key] >= 7 ? '#059669' : bidScores[f.key] >= 5 ? '#D97706' : '#DC2626' }}>
                    {bidScores[f.key]}
                  </span>
                </div>
                <input
                  type="range" min={1} max={10} value={bidScores[f.key]}
                  onChange={e => setBidScores(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                  className="w-full accent-blue-500"
                />
              </div>
            ))}
          </div>

          {/* Win Probability Prediction */}
          {prediction && (
            prediction.predictedProbability !== null ? (
              <div
                style={{
                  background: 'color-mix(in srgb, #2563EB 6%, #111827)',
                  border: '1px solid color-mix(in srgb, #2563EB 30%, #1E2D45)',
                  borderRadius: 8,
                  padding: '12px 16px',
                }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart2 className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Win Probability Estimate</span>
                </div>
                <div className="text-3xl font-black text-foreground mb-1">{prediction.predictedProbability}%</div>
                <p className="text-xs text-muted-foreground mb-2">
                  {prediction.historicalWinRate !== null && `Your historical win rate: ${prediction.historicalWinRate}%`}
                </p>
                <p className="text-xs text-blue-200 leading-relaxed">{prediction.message}</p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Confidence: <span className="capitalize">{prediction.confidence}</span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                Win prediction available after 5+ completed deals.
              </p>
            )
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#1E2D45] flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-md border border-[#1E2D45] text-sm text-muted-foreground hover:text-foreground hover:border-[#2E3D55] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave} disabled={saving}
            className="flex-1 h-9 rounded-md bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pipeline Tab ──────────────────────────────────────────────────────────────

function PipelineTab({ pipeline }: { pipeline: PipelineProject[] }) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "submitted">("all")
  const [filterVertical, setFilterVertical] = useState("")
  const [filterServiceLine, setFilterServiceLine] = useState("")
  const [filterOwner, setFilterOwner] = useState("")
  const [filterSize, setFilterSize] = useState("")
  const [editPanel, setEditPanel] = useState<PipelineProject | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const owners = useMemo(() => [...new Set(pipeline.map(p => p.pursuit_owner).filter(Boolean))], [pipeline])
  const [filterClient, setFilterClient] = useState("")
  const clients = useMemo(() => [...new Set(pipeline.map(p => p.client_name).filter(Boolean))].sort(), [pipeline])

  const filtered = useMemo(() => {
    return pipeline.filter(p => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false
      if (filterVertical && p.vertical !== filterVertical) return false
      if (filterServiceLine && p.service_line !== filterServiceLine) return false
      if (filterOwner && p.pursuit_owner !== filterOwner) return false
      if (filterClient && p.client_name !== filterClient) return false
      if (filterSize) {
        const sz = p.deal_size_category ?? (p.quoted_price > 0 ? dealSizeFromValue(p.quoted_price) : null)
        if (sz !== filterSize) return false
      }
      if (search) {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q)
      }
      return true
    })
  }, [pipeline, filterStatus, filterVertical, filterServiceLine, filterOwner, filterClient, filterSize, search])

  const totals = useMemo(() => ({
    total: filtered.reduce((s, p) => s + p.quoted_price, 0),
    weighted: filtered.reduce((s, p) => s + p.quoted_price * ((p.win_probability ?? 50) / 100), 0),
  }), [filtered])

  async function markAs(project: PipelineProject, status: "won" | "lost") {
    setMarkingId(project.id)
    try {
      await updateProjectOutcome(project.id, status, null)
      toast.success(`${project.name} marked as ${status}`)
      router.refresh()
    } catch { toast.error("Failed to update status") }
    finally { setMarkingId(null) }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {["all", "draft", "submitted"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s as any)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize ${filterStatus === s ? "bg-blue-600 text-white border-blue-600" : "border-[#1E2D45] text-muted-foreground hover:text-foreground"}`}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
        <div className="h-5 border-l border-[#1E2D45]" />
        <select
          value={filterVertical}
          onChange={e => setFilterVertical(e.target.value)}
          className="h-8 rounded-md border border-[#1E2D45] bg-[#111827] px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Vertical ∨</option>
          {Object.entries(VERTICAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          value={filterServiceLine}
          onChange={e => setFilterServiceLine(e.target.value)}
          className="h-8 rounded-md border border-[#1E2D45] bg-[#111827] px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Service Line ∨</option>
          {Object.entries(SERVICE_LINE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {owners.length > 0 && (
          <select
            value={filterOwner}
            onChange={e => setFilterOwner(e.target.value)}
            className="h-8 rounded-md border border-[#1E2D45] bg-[#111827] px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Owner ∨</option>
            {owners.map(o => <option key={o!} value={o!}>{o}</option>)}
          </select>
        )}
        <select
          value={filterSize}
          onChange={e => setFilterSize(e.target.value)}
          className="h-8 rounded-md border border-[#1E2D45] bg-[#111827] px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Size ∨</option>
          {Object.entries(DEAL_SIZE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {clients.length > 1 && (
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="h-8 rounded-md border border-[#1E2D45] bg-[#111827] px-2 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Client ∨</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2 border border-[#1E2D45] rounded-md px-3 h-8 bg-[#111827]">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search deals…"
            className="w-36 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {search && <button onClick={() => setSearch("")}><X className="h-3 w-3 text-muted-foreground" /></button>}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="h-8 w-8 mx-auto text-muted-foreground opacity-20 mb-3" />
            <p className="text-sm text-muted-foreground">No deals match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-[#1E2D45] bg-[#0A1120]">
                  <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Project / Client</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vertical</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Service Line</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Value</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Win %</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Weighted</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Owner</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Exp. Start</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D45]">
                {filtered.map(p => {
                  const stale = isStale(p)
                  const priority = isPriority(p)
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-white/[0.02] transition-colors relative"
                      style={stale ? { borderLeft: "2px solid #D97706" } : priority ? { borderLeft: "2px solid #2563EB" } : {}}
                    >
                      <td className="px-4 py-3">
                        <Link href={`/projects/${p.id}/estimate`} className="font-medium text-foreground hover:text-primary transition-colors line-clamp-1">
                          {p.name}
                          {stale && <span className="ml-1.5 text-[10px] text-amber-400 font-normal">stale</span>}
                          {priority && !stale && <span className="ml-1.5 text-[10px] text-blue-400 font-normal">priority</span>}
                        </Link>
                        <p className="text-[10px] text-muted-foreground truncate">{p.client_name}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {p.vertical ? VERTICAL_LABELS[p.vertical] ?? p.vertical : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {p.service_line ? SERVICE_LINE_LABELS[p.service_line] ?? p.service_line : "—"}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-xs text-muted-foreground">
                        {p.quoted_price > 0 ? fmt(p.quoted_price) : <span className="italic opacity-40">Not quoted</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <ProbCell project={p} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium text-foreground text-xs">
                        {p.quoted_price > 0 ? fmt(p.quoted_price * ((p.win_probability ?? 50) / 100)) : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{p.pursuit_owner || "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                        {p.expected_start_date ? format(parseISO(p.expected_start_date), "MMM d, yy") : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${p.status === "submitted" ? "bg-blue-900/40 text-blue-300 border-blue-800/40" : "bg-gray-700/40 text-gray-400 border-gray-600/40"}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setEditPanel(p)}
                            className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => markAs(p, "won")}
                            disabled={markingId === p.id}
                            className="text-xs text-green-400 hover:text-green-300 font-medium transition-colors"
                          >
                            Won
                          </button>
                          <button
                            onClick={() => markAs(p, "lost")}
                            disabled={markingId === p.id}
                            className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
                          >
                            Lost
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#1E2D45] bg-[#0A1120]">
                  <td colSpan={3} className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Total — {filtered.length} deal{filtered.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold text-foreground text-xs">{fmt(totals.total)}</td>
                  <td />
                  <td className="px-3 py-3 text-right tabular-nums font-bold text-foreground text-xs">{fmt(totals.weighted)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {editPanel && <QuickEditPanel project={editPanel} onClose={() => setEditPanel(null)} />}
    </div>
  )
}

// ── Won/Lost Tab ──────────────────────────────────────────────────────────────

function WonLostTab({ wonThisYear, lostThisYear, allWon, allLost }: Pick<PipelineData, "wonThisYear" | "lostThisYear" | "allWon" | "allLost">) {
  const [scope, setScope] = useState<"this_year" | "all_time">("this_year")

  const won = scope === "this_year" ? wonThisYear : allWon
  const lost = scope === "this_year" ? lostThisYear : allLost

  const wonTotal = won.reduce((s, p) => s + p.quoted_price, 0)
  const lostTotal = lost.reduce((s, p) => s + p.quoted_price, 0)
  const winRate = won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : 0
  const winRateValue = wonTotal + lostTotal > 0 ? Math.round(wonTotal / (wonTotal + lostTotal) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {([["this_year", "This Year"], ["all_time", "All Time"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setScope(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${scope === v ? "bg-blue-600 text-white border-blue-600" : "border-[#1E2D45] text-muted-foreground hover:text-foreground"}`}
          >{l}</button>
        ))}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Won", value: fmt(wonTotal), sub: `${won.length} deals, avg ${won.length > 0 ? fmt(wonTotal / won.length) : "—"}`, color: "text-green-400" },
          { label: "Lost", value: fmt(lostTotal), sub: `${lost.length} deals, avg ${lost.length > 0 ? fmt(lostTotal / lost.length) : "—"}`, color: "text-red-400" },
          { label: "Win Rate (count)", value: `${winRate}%`, sub: `${won.length} of ${won.length + lost.length}`, color: winRate >= 50 ? "text-green-400" : "text-amber-400" },
          { label: "Win Rate (value)", value: `${winRateValue}%`, sub: "By deal size", color: winRateValue >= 50 ? "text-green-400" : "text-amber-400" },
        ].map(t => (
          <div key={t.label} className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t.label}</p>
            <p className={`text-2xl font-black ${t.color}`}>{t.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Won table */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1E2D45]">
          <p className="text-sm font-semibold text-green-400">Won Deals</p>
        </div>
        {won.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm text-muted-foreground">No won deals yet.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E2D45] bg-[#0A1120]">
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Project</th>
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Value</th>
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Close Date</th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vertical</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D45]">
              {won.map(p => (
                <tr key={p.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    <Link href={`/projects/${p.id}/estimate`} className="font-medium text-foreground hover:text-primary transition-colors">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.client_name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-green-400 text-xs">{fmt(p.quoted_price)}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {format(new Date(p.updated_at), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {p.vertical ? VERTICAL_LABELS[p.vertical] : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lost table */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1E2D45]">
          <p className="text-sm font-semibold text-red-400">Lost Deals</p>
        </div>
        {lost.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm text-muted-foreground">No lost deals recorded.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E2D45] bg-[#0A1120]">
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Project</th>
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Value</th>
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vertical</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D45]">
              {lost.map(p => (
                <tr key={p.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{p.client_name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-400 font-medium text-xs">{fmt(p.quoted_price)}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {format(new Date(p.updated_at), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {p.vertical ? VERTICAL_LABELS[p.vertical] : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Forecast Tab ──────────────────────────────────────────────────────────────

function ForecastTab({ monthlyForecast, metrics }: { monthlyForecast: PipelineData["monthlyForecast"]; metrics: PipelineData["metrics"] }) {
  const [view, setView] = useState<"month" | "quarter">("month")

  // Quarter rollup
  const quarterData = useMemo(() => {
    const quarters: Record<string, { total: number; weighted: number; deals: number }> = {}
    for (const m of monthlyForecast) {
      const d = parseISO(m.month + "-01")
      const q = `Q${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`
      if (!quarters[q]) quarters[q] = { total: 0, weighted: 0, deals: 0 }
      quarters[q].total += m.total
      quarters[q].weighted += m.weighted
      quarters[q].deals += m.deals
    }
    return Object.entries(quarters).map(([label, v]) => ({ label, ...v }))
  }, [monthlyForecast])

  const chartData = view === "month"
    ? monthlyForecast.map(m => ({
        label: format(parseISO(m.month + "-01"), "MMM yy"),
        total: Math.round(m.total),
        weighted: Math.round(m.weighted),
        deals: m.deals,
      }))
    : quarterData.map(q => ({ label: q.label, total: Math.round(q.total), weighted: Math.round(q.weighted), deals: q.deals }))

  const bestCase = metrics.totalPipeline
  const expected = metrics.weightedPipeline
  const worstCase = monthlyForecast.reduce((s, m) => s, 0) // placeholder — computed below

  // Worst case: only deals with >70% probability
  const displayData = view === "month" ? monthlyForecast : quarterData

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {([["month", "By Month"], ["quarter", "By Quarter"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${view === v ? "bg-blue-600 text-white border-blue-600" : "border-[#1E2D45] text-muted-foreground hover:text-foreground"}`}
          >{l}</button>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Revenue Forecast</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} barGap={4} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11, fill: "#6B7280" }} width={55} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0D1526", border: "1px solid #1E2D45", borderRadius: 8 }}
                labelStyle={{ color: "#E5E7EB", fontWeight: 600 }}
                formatter={(v: any, name: any) => [fmt(Number(v)), name === "total" ? "Total Pipeline" : "Weighted Forecast"]}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9CA3AF" }} formatter={v => v === "total" ? "Total Pipeline" : "Weighted"} />
              <ReferenceLine y={bestCase / Math.max(chartData.length, 1)} stroke="#4B5563" strokeDasharray="4 2" label={{ value: "Best Case", fill: "#4B5563", fontSize: 10 }} />
              <Bar dataKey="total" name="total" fill="rgba(37,99,235,0.25)" radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="weighted" name="weighted" fill="#2563EB" radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-6 mt-3 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-sm bg-[rgba(37,99,235,0.25)]" />Total Pipeline</div>
            <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-sm bg-blue-600" />Weighted Forecast</div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-12 text-center">
          <p className="text-sm text-muted-foreground">No forecast data yet. Set expected start dates on pipeline deals to see them here.</p>
        </div>
      )}

      {/* Forecast table */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1E2D45] bg-[#0A1120]">
              <th className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{view === "month" ? "Month" : "Quarter"}</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Deals</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</th>
              <th className="text-right px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Weighted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2D45]">
            {displayData.map((row: any) => (
              <tr key={row.month ?? row.label} className="hover:bg-white/[0.02]">
                <td className="px-5 py-3 font-medium text-foreground">
                  {row.month ? format(parseISO(row.month + "-01"), "MMM yyyy") : row.label}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.deals}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(row.total)}</td>
                <td className="px-5 py-3 text-right tabular-nums font-bold text-foreground">{fmt(row.weighted)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#1E2D45] bg-[#0A1120]">
              <td className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-foreground">{metrics.dealCount}</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-foreground">{fmt(metrics.totalPipeline)}</td>
              <td className="px-5 py-3 text-right tabular-nums font-bold text-foreground">{fmt(metrics.weightedPipeline)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function winRateRows<K extends string>(
  allWon: PipelineProject[],
  allLost: PipelineProject[],
  keyFn: (p: PipelineProject) => K | null | undefined,
  labelMap: Record<string, string>
) {
  const keys = [...new Set([...allWon, ...allLost].map(keyFn).filter(Boolean))] as K[]
  return keys.map(k => {
    const won = allWon.filter(p => keyFn(p) === k).length
    const lost = allLost.filter(p => keyFn(p) === k).length
    return {
      key: k,
      label: labelMap[k] ?? k,
      won,
      lost,
      total: won + lost,
      winRate: won + lost > 0 ? Math.round(won / (won + lost) * 100) : 0,
    }
  }).filter(r => r.total > 0).sort((a, b) => b.total - a.total)
}

function AnalyticsTab({ allWon, allLost, pipeline }: { allWon: PipelineProject[]; allLost: PipelineProject[]; pipeline: PipelineProject[] }) {
  const verticalRows = winRateRows(allWon, allLost, p => p.vertical, VERTICAL_LABELS)
  const serviceRows  = winRateRows(allWon, allLost, p => p.service_line, SERVICE_LINE_LABELS)
  const sizeRows     = winRateRows(allWon, allLost, p => p.deal_size_category ?? (p.quoted_price > 0 ? dealSizeFromValue(p.quoted_price) : null) as any, DEAL_SIZE_LABELS)
  const ownerRows    = winRateRows(allWon, allLost, p => p.pursuit_owner as any, {})

  const avgWonSize = allWon.length > 0 ? allWon.reduce((s, p) => s + p.quoted_price, 0) / allWon.length : 0
  const avgLostSize = allLost.length > 0 ? allLost.reduce((s, p) => s + p.quoted_price, 0) / allLost.length : 0

  const coverageRatio = allWon.length > 0
    ? (pipeline.reduce((s, p) => s + p.quoted_price, 0) / (allWon.reduce((s, p) => s + p.quoted_price, 0) / Math.max(1, allWon.length / 12))).toFixed(1)
    : "—"

  function WinRateTable({ rows, title }: { rows: ReturnType<typeof winRateRows>; title: string }) {
    if (rows.length === 0) return (
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5">
        <p className="text-sm font-semibold text-foreground mb-2">{title}</p>
        <p className="text-xs text-muted-foreground">No data yet — tag your deals with {title.toLowerCase()} to see win rates.</p>
      </div>
    )
    return (
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1E2D45]">
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1E2D45] bg-[#0A1120]">
              <th className="text-left px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Group</th>
              <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Won</th>
              <th className="text-right px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lost</th>
              <th className="text-right px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Win Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E2D45]">
            {rows.map(r => (
              <tr key={r.key} className="hover:bg-white/[0.02]">
                <td className="px-5 py-2.5 font-medium text-foreground">{r.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{r.won}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-400">{r.lost}</td>
                <td className="px-5 py-2.5 text-right">
                  <span className="font-bold tabular-nums" style={{ color: probColor(r.winRate) }}>
                    {r.winRate}%
                  </span>
                  <span className="text-muted-foreground text-[10px] ml-1">({r.total} deals)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {allWon.length === 0 && allLost.length === 0 ? (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526]/40 p-12 text-center">
          <BarChart2 className="h-8 w-8 mx-auto text-muted-foreground opacity-20 mb-3" />
          <p className="text-sm text-muted-foreground font-medium">No win/loss history yet</p>
          <p className="text-xs text-muted-foreground mt-1">Mark deals as Won or Lost to build win rate analytics over time.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <WinRateTable rows={verticalRows} title="Win Rate by Vertical" />
            <WinRateTable rows={serviceRows} title="Win Rate by Service Line" />
            <WinRateTable rows={sizeRows} title="Win Rate by Deal Size" />
            {ownerRows.length > 0 && <WinRateTable rows={ownerRows} title="Win Rate by Pursuit Owner" />}
          </div>

          {/* Average deal metrics */}
          <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5 space-y-4">
            <p className="text-sm font-semibold text-foreground">Average Deal Metrics</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Avg Won Deal", value: avgWonSize > 0 ? fmt(avgWonSize) : "—", color: "text-green-400" },
                { label: "Avg Lost Deal", value: avgLostSize > 0 ? fmt(avgLostSize) : "—", color: "text-red-400" },
                { label: "Total Won", value: allWon.length.toString(), color: "text-foreground" },
                { label: "Pipeline Coverage", value: `${coverageRatio}×`, color: "text-blue-400" },
              ].map(t => (
                <div key={t.label} className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.label}</p>
                  <p className={`text-xl font-black ${t.color}`}>{t.value}</p>
                </div>
              ))}
            </div>
            {coverageRatio !== "—" && (
              <p className="text-xs text-muted-foreground border-t border-[#1E2D45] pt-3">
                Pipeline coverage: {coverageRatio}× — For every $1 of historical win rate, you have ${coverageRatio} of pipeline.
                {" "}<span className="text-amber-400">Healthy range is 3–4×.</span>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Root Component ────────────────────────────────────────────────────────────

type TabId = "pipeline" | "won_lost" | "forecast" | "analytics"

interface Props {
  data: PipelineData
}

export function PipelineClient({ data }: Props) {
  const [tab, setTab] = useState<TabId>("pipeline")

  const tabs: { id: TabId; label: string }[] = [
    { id: "pipeline",   label: "Pipeline"   },
    { id: "won_lost",   label: "Won / Lost" },
    { id: "forecast",   label: "Forecast"   },
    { id: "analytics",  label: "Analytics"  },
  ]

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="border-b border-[#1E2D45]">
        <nav className="flex gap-0.5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-5 py-2.5 text-sm font-medium rounded-t-md transition-colors after:absolute after:bottom-0 after:inset-x-3 after:h-[2px] after:rounded-full after:transition-colors ${
                tab === t.id
                  ? "text-primary font-semibold after:bg-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30 after:bg-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === "pipeline"  && <PipelineTab pipeline={data.pipeline} />}
      {tab === "won_lost"  && <WonLostTab wonThisYear={data.wonThisYear} lostThisYear={data.lostThisYear} allWon={data.allWon} allLost={data.allLost} />}
      {tab === "forecast"  && <ForecastTab monthlyForecast={data.monthlyForecast} metrics={data.metrics} />}
      {tab === "analytics" && <AnalyticsTab allWon={data.allWon} allLost={data.allLost} pipeline={data.pipeline} />}
    </div>
  )
}
