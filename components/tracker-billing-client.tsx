"use client"

import { useState, useMemo } from "react"
import { toast } from "sonner"
import { format, parseISO, differenceInDays } from "date-fns"
import {
  AlertTriangle, CheckCircle2, Clock, CreditCard, Lock, X,
} from "lucide-react"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts"
import { updateMilestoneStatus, updateBillingMilestoneField } from "@/lib/actions"
import type { BillingMilestone, InvoiceStatus } from "@/lib/types"

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

type InlineField = 'revised_date' | 'actual_date' | 'invoice_number' | 'milestone_notes'

// ── Date Status ───────────────────────────────────────────────────────────────

type MilestoneDateStatus = 'ok' | 'at_risk' | 'overdue' | 'revised_overdue' | 'invoiced'

function getMilestoneDateStatus(m: BillingMilestone): MilestoneDateStatus {
  if (m.invoice_status === 'invoiced' || m.invoice_status === 'paid') return 'invoiced'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const planned = m.planned_date ? new Date(m.planned_date) : null
  const revised = m.revised_date ? new Date(m.revised_date) : null
  if (!planned) return 'ok'
  if (revised && today > revised) return 'revised_overdue'
  if (today > planned && !revised) return 'overdue'
  if (today > planned && revised && today <= revised) return 'at_risk'
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const activeDate = revised ?? planned
  if (activeDate.getTime() - today.getTime() <= sevenDays) return 'at_risk'
  return 'ok'
}

function getEffectiveStatus(m: BillingMilestone): InvoiceStatus {
  if (m.invoice_status === 'invoiced' && m.planned_date) {
    const due = new Date(m.planned_date + "T12:00:00")
    due.setDate(due.getDate() + (m.payment_terms ?? 30))
    if (new Date() > due) return 'overdue'
  }
  return m.invoice_status
}

function getMilestoneRowStyle(status: MilestoneDateStatus, isPaid: boolean): string {
  if (isPaid) return 'border-l-4 border-green-500 bg-green-500/[0.03]'
  switch (status) {
    case 'revised_overdue': return 'border-l-4 border-red-500 bg-red-500/[0.06]'
    case 'overdue':         return 'border-l-4 border-red-500 bg-red-500/[0.06]'
    case 'at_risk':         return 'border-l-4 border-amber-500 bg-amber-500/[0.05]'
    case 'invoiced':        return 'border-l-4 border-green-500 bg-green-500/[0.03]'
    default:                return ''
  }
}

// ── Alert Panel ───────────────────────────────────────────────────────────────

function AlertPanel({ milestones }: { milestones: BillingMilestone[] }) {
  const [dismissed, setDismissed] = useState(false)

  const alerts = useMemo(() =>
    milestones
      .map(m => ({ m, status: getMilestoneDateStatus(m) }))
      .filter(({ status }) => status === 'overdue' || status === 'revised_overdue' || status === 'at_risk')
      .sort((a, b) => {
        const order = { revised_overdue: 0, overdue: 1, at_risk: 2 }
        return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3)
      })
  , [milestones])

  if (alerts.length === 0 || dismissed) return null
  const hasOverdue = alerts.some(a => a.status === 'overdue' || a.status === 'revised_overdue')

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${hasOverdue ? "border-red-700/50 bg-red-900/10" : "border-amber-700/50 bg-amber-900/10"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${hasOverdue ? "text-red-400" : "text-amber-400"}`} />
          <p className={`text-sm font-bold ${hasOverdue ? "text-red-300" : "text-amber-300"}`}>
            MILESTONE ALERTS ({alerts.length})
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2.5">
        {alerts.map(({ m, status }) => {
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const planned = m.planned_date ? new Date(m.planned_date) : null
          const revised = m.revised_date ? new Date(m.revised_date) : null
          const daysOverdue = planned ? differenceInDays(today, planned) : null
          return (
            <div key={m.id} className={`flex items-start gap-2 pl-3 border-l-2 ${status === 'at_risk' ? "border-amber-500" : "border-red-500"}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{m.title}</p>
                <p className={`text-xs mt-0.5 ${status === 'at_risk' ? "text-amber-400" : "text-red-400"}`}>
                  {status === 'overdue' && `Planned ${planned ? format(planned, "MMM d") : "—"} — ${daysOverdue}d overdue, no revised date set`}
                  {status === 'revised_overdue' && `Revised ${revised ? format(revised, "MMM d") : "—"} also passed — still not invoiced`}
                  {status === 'at_risk' && (() => {
                    const daysUntil = planned ? differenceInDays(planned, today) : null
                    return daysUntil !== null && daysUntil >= 0
                      ? `Due in ${daysUntil}d — ${format(planned!, "MMM d")}${revised ? ` · Revised ${format(revised, "MMM d")}` : ""}`
                      : `Planned ${planned ? format(planned, "MMM d") : "—"}${revised ? ` · Revised ${format(revised, "MMM d")}` : ""}`
                  })()}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function buildChartData(milestones: BillingMilestone[]) {
  const withDates = milestones.filter(m => m.planned_date).sort((a, b) => a.planned_date!.localeCompare(b.planned_date!))
  let plannedCum = 0, actualCum = 0
  return withDates.map(m => {
    plannedCum += m.amount
    const isCollected = m.invoice_status === 'paid' || m.invoice_status === 'invoiced'
    if (isCollected) actualCum += m.amount
    return {
      label: m.title.length > 18 ? m.title.slice(0, 16) + "…" : m.title,
      planned: plannedCum,
      actual: isCollected ? actualCum : null,
    }
  })
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string
  milestones: BillingMilestone[]
  totalContract: number
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TrackerBillingClient({ projectId, milestones: initialMilestones, totalContract }: Props) {
  const [milestones, setMilestones] = useState<BillingMilestone[]>(initialMilestones)
  const [flashingFields, setFlashingFields] = useState<Set<string>>(new Set())
  const [promptInvoiceFor, setPromptInvoiceFor] = useState<string | null>(null)
  const [confirmPaid, setConfirmPaid] = useState<BillingMilestone | null>(null)

  const kpis = useMemo(() => {
    const invoiced = milestones.filter(m => m.invoice_status === 'invoiced' || m.invoice_status === 'overdue').reduce((s, m) => s + m.amount, 0)
    const collected = milestones.filter(m => m.invoice_status === 'paid').reduce((s, m) => s + m.amount, 0)
    return { invoiced: invoiced + collected, collected, outstanding: invoiced - collected }
  }, [milestones])

  const nextInvoiceNumber = useMemo(() => {
    const nums = milestones
      .filter(m => m.invoice_number)
      .map(m => { const match = m.invoice_number!.match(/(\d+)$/); return match ? parseInt(match[1]) : 0 })
    const max = nums.length > 0 ? Math.max(...nums) : 0
    return `INV-${String(max + 1).padStart(3, '0')}`
  }, [milestones])

  const chartData = useMemo(() => buildChartData(milestones), [milestones])

  function handleFieldChange(id: string, field: string, value: string) {
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, [field]: value || null } : m))
    if (promptInvoiceFor && field !== 'actual_date') setPromptInvoiceFor(null)
  }

  function flash(id: string, field: string) {
    const key = `${id}:${field}`
    setFlashingFields(prev => new Set([...prev, key]))
    setTimeout(() => setFlashingFields(prev => { const next = new Set(prev); next.delete(key); return next }), 700)
  }

  async function saveField(id: string, field: InlineField) {
    const m = milestones.find(x => x.id === id)
    if (!m) return
    try {
      await updateBillingMilestoneField(id, projectId, field, (m as any)[field] ?? null)
      flash(id, field)
      if (field === 'actual_date' && (m as any).actual_date && m.invoice_status === 'not_invoiced') {
        setPromptInvoiceFor(id)
      }
    } catch {
      toast.error("Failed to save")
    }
  }

  async function handleStatusChange(m: BillingMilestone, newStatus: InvoiceStatus) {
    if (newStatus === m.invoice_status) return
    if (newStatus === 'paid') {
      setConfirmPaid(m)
      return
    }
    setPromptInvoiceFor(null)
    const today = new Date().toISOString().split('T')[0]
    const autoDate = (newStatus === 'invoiced' && !m.actual_date) ? today : undefined
    try {
      await updateMilestoneStatus(m.id, { invoice_status: newStatus, ...(autoDate ? { actual_date: autoDate } : {}) })
      setMilestones(prev => prev.map(x =>
        x.id === m.id ? { ...x, invoice_status: newStatus, ...(autoDate ? { actual_date: autoDate } : {}) } : x
      ))
      if (autoDate) toast.success("Actual date set to today. Update if different.")
    } catch {
      toast.error("Failed to update status")
    }
  }

  async function handleConfirmPaid() {
    if (!confirmPaid) return
    const today = new Date().toISOString().split('T')[0]
    try {
      await updateMilestoneStatus(confirmPaid.id, {
        invoice_status: 'paid',
        actual_date: confirmPaid.actual_date || today,
      })
      setMilestones(prev => prev.map(m =>
        m.id === confirmPaid.id ? { ...m, invoice_status: 'paid', actual_date: confirmPaid.actual_date || today } : m
      ))
      toast.success("Milestone marked as paid")
      setConfirmPaid(null)
    } catch {
      toast.error("Failed to mark as paid")
    }
  }

  // ── Input class builders ────────────────────────────────────────────────────

  function dateInputCls(m: BillingMilestone, field: 'revised_date' | 'actual_date') {
    const isPaid = m.invoice_status === 'paid'
    const val = (m as any)[field] as string | null
    const isFlashing = flashingFields.has(`${m.id}:${field}`)
    const ds = getMilestoneDateStatus(m)

    if (isPaid) {
      return 'h-7 w-[120px] rounded border border-transparent bg-transparent px-2 text-xs text-muted-foreground opacity-50 cursor-not-allowed focus:outline-none'
    }

    let border = val ? 'border-[#1E2D45]' : 'border-dashed border-[#1E2D45]/50'
    if (field === 'revised_date' && val) {
      if (ds === 'revised_overdue') border = 'border-red-500/70'
      else if (ds === 'at_risk') border = 'border-amber-500/70'
    }
    if (isFlashing) border = 'border-blue-500 ring-1 ring-blue-500/25'

    return `h-7 w-[120px] rounded border ${border} bg-[#0A1120] px-2 text-xs text-foreground hover:border-blue-500/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none transition-colors cursor-pointer`
  }

  function textInputCls(m: BillingMilestone, field: string) {
    const isPaid = m.invoice_status === 'paid'
    const val = (m as any)[field] as string | null
    const isFlashing = flashingFields.has(`${m.id}:${field}`)

    if (isPaid) {
      return 'h-7 w-full rounded border border-transparent bg-transparent px-2 text-xs text-muted-foreground opacity-50 cursor-not-allowed focus:outline-none'
    }

    let border = val ? 'border-[#1E2D45]' : 'border-dashed border-[#1E2D45]/50'
    if (isFlashing) border = 'border-blue-500 ring-1 ring-blue-500/25'

    return `h-7 w-full rounded border ${border} bg-[#0A1120] px-2 text-xs text-foreground placeholder:text-muted-foreground/40 hover:border-blue-500/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none transition-colors`
  }

  function textareaCls(m: BillingMilestone) {
    const isPaid = m.invoice_status === 'paid'
    const val = m.milestone_notes
    const isFlashing = flashingFields.has(`${m.id}:milestone_notes`)

    if (isPaid) {
      return 'w-full rounded border border-transparent bg-transparent px-2 py-1 text-xs text-muted-foreground opacity-50 cursor-not-allowed focus:outline-none resize-none'
    }

    let border = val ? 'border-[#1E2D45]' : 'border-dashed border-[#1E2D45]/50'
    if (isFlashing) border = 'border-blue-500 ring-1 ring-blue-500/25'

    return `w-full rounded border ${border} bg-[#0A1120] px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 hover:border-blue-500/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:outline-none transition-colors resize-none`
  }

  function statusSelectCls(status: InvoiceStatus) {
    const colors: Record<InvoiceStatus, string> = {
      not_invoiced: 'border-[#1E2D45] bg-[#0A1120] text-muted-foreground',
      invoiced:     'border-blue-800/50 bg-blue-950/50 text-blue-300',
      paid:         'border-green-800/50 bg-green-950/50 text-green-300',
      overdue:      'border-red-800/50 bg-red-950/50 text-red-300',
    }
    return `w-[120px] rounded border px-2 py-1 text-xs cursor-pointer focus:outline-none ${colors[status] ?? colors.not_invoiced}`
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Alert Panel */}
      <AlertPanel milestones={milestones} />

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Contract",   value: fmt(totalContract),    sub: `${milestones.length} milestones`,   icon: CreditCard,    color: "text-blue-400"   },
          { label: "Invoiced to Date", value: fmt(kpis.invoiced),   sub: `${totalContract > 0 ? Math.round((kpis.invoiced / totalContract) * 100) : 0}% of contract`, icon: Clock, color: "text-amber-400" },
          { label: "Collected",        value: fmt(kpis.collected),  sub: `${milestones.filter(m => m.invoice_status === 'paid').length} paid`,        icon: CheckCircle2, color: "text-green-400"  },
          { label: "Outstanding",      value: fmt(kpis.outstanding), sub: "Invoiced but not yet paid",          icon: AlertTriangle, color: kpis.outstanding > 0 ? "text-red-400" : "text-muted-foreground" },
        ].map(t => (
          <div key={t.label} className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
            <div className="flex items-center gap-2 mb-2">
              <t.icon className={`h-4 w-4 ${t.color}`} />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.label}</p>
            </div>
            <p className="text-2xl font-bold text-foreground">{t.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Milestone Table */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E2D45]">
          <p className="text-sm font-semibold text-foreground">Payment Milestones</p>
        </div>

        {milestones.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <CreditCard className="h-8 w-8 mx-auto text-muted-foreground opacity-30" />
            <p className="text-sm font-semibold text-muted-foreground">No payment milestones defined</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Define when you'll invoice the client and for how much. Add milestones in the Estimator → Commercials tab.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1300px]">
              <thead>
                <tr className="border-b border-[#1E2D45] bg-[#0A1120]">
                  <th className="w-[40px]  px-3 py-2.5 text-center text-[11px] font-bold text-muted-foreground">#</th>
                  <th className="w-[160px] px-3 py-2.5 text-left  text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Milestone</th>
                  <th className="w-[90px]  px-3 py-2.5 text-left  text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Trigger</th>
                  <th className="w-[140px] px-3 py-2.5 text-left  text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Deliverables</th>
                  <th className="w-[110px] px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Planned</th>
                  <th className="w-[130px] px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Revised</th>
                  <th className="w-[130px] px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actual</th>
                  <th className="w-[100px] px-3 py-2.5 text-left  text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Invoice #</th>
                  <th className="w-[180px] px-3 py-2.5 text-left  text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Notes</th>
                  <th className="w-[80px]  px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                  <th className="w-[130px] px-3 py-2.5 text-left  text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D45]">
                {milestones.map((m, idx) => {
                  const isPaid = m.invoice_status === 'paid'
                  const dateStatus = getMilestoneDateStatus(m)
                  const rowStyle = getMilestoneRowStyle(dateStatus, isPaid)
                  const effectiveStatus = getEffectiveStatus(m)

                  let plannedColor = 'text-muted-foreground'
                  if (dateStatus === 'overdue' || dateStatus === 'revised_overdue') plannedColor = 'text-red-400'
                  else if (dateStatus === 'at_risk') plannedColor = 'text-amber-400'

                  return (
                    <tr
                      key={m.id}
                      className={`transition-colors hover:bg-white/[0.015] ${rowStyle} ${isPaid ? 'opacity-80' : ''}`}
                      title={isPaid ? "Paid milestone is locked" : undefined}
                    >
                      {/* # */}
                      <td className="w-[40px] px-3 py-2.5 text-center">
                        <span className="text-[11px] text-muted-foreground/50 tabular-nums">{idx + 1}</span>
                      </td>

                      {/* Milestone */}
                      <td className="w-[160px] px-3 py-2.5">
                        <p className="font-medium text-xs text-foreground leading-tight truncate" title={m.title}>{m.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{fmt(m.amount)} · {m.percentage}%</p>
                        {isPaid && <Lock className="h-3 w-3 text-green-500/50 mt-0.5" />}
                      </td>

                      {/* Trigger */}
                      <td className="w-[90px] px-3 py-2.5">
                        <span className="text-xs text-muted-foreground capitalize">
                          {(m.trigger_type ?? "milestone").replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Deliverables */}
                      <td className="w-[140px] px-3 py-2.5">
                        {m.deliverables
                          ? <p className="text-xs text-muted-foreground truncate" title={m.deliverables}>{m.deliverables}</p>
                          : <span className="text-[11px] text-muted-foreground/30 italic">—</span>
                        }
                      </td>

                      {/* Planned (read-only) */}
                      <td className="w-[110px] px-3 py-2.5 text-right">
                        <span className={`text-xs tabular-nums ${plannedColor}`}>
                          {m.planned_date
                            ? format(parseISO(m.planned_date), "MMM d, yyyy")
                            : <span className="opacity-30">—</span>
                          }
                        </span>
                      </td>

                      {/* Revised Date — persistent input */}
                      <td className="w-[130px] px-3 py-2.5">
                        <input
                          type="date"
                          value={m.revised_date ?? ""}
                          min={m.planned_date ?? undefined}
                          readOnly={isPaid}
                          onChange={e => handleFieldChange(m.id, 'revised_date', e.target.value)}
                          onBlur={() => !isPaid && saveField(m.id, 'revised_date')}
                          className={dateInputCls(m, 'revised_date')}
                        />
                      </td>

                      {/* Actual Date — persistent input */}
                      <td className="w-[130px] px-3 py-2.5">
                        <div>
                          <input
                            type="date"
                            value={m.actual_date ?? ""}
                            readOnly={isPaid}
                            onChange={e => handleFieldChange(m.id, 'actual_date', e.target.value)}
                            onBlur={() => !isPaid && saveField(m.id, 'actual_date')}
                            className={dateInputCls(m, 'actual_date')}
                          />
                          {promptInvoiceFor === m.id && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] text-amber-400">Mark as Invoiced?</span>
                              <button
                                onMouseDown={e => { e.preventDefault(); handleStatusChange(m, 'invoiced'); setPromptInvoiceFor(null) }}
                                className="text-[10px] font-medium text-blue-400 hover:text-blue-300 underline underline-offset-1"
                              >
                                Yes
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Invoice # — persistent input */}
                      <td className="w-[100px] px-3 py-2.5">
                        <input
                          type="text"
                          value={m.invoice_number ?? ""}
                          readOnly={isPaid}
                          placeholder={nextInvoiceNumber}
                          onChange={e => handleFieldChange(m.id, 'invoice_number', e.target.value)}
                          onBlur={() => !isPaid && saveField(m.id, 'invoice_number')}
                          className={textInputCls(m, 'invoice_number')}
                        />
                      </td>

                      {/* Notes — expanding textarea */}
                      <td className="w-[180px] px-3 py-2.5">
                        <textarea
                          value={m.milestone_notes ?? ""}
                          readOnly={isPaid}
                          placeholder={isPaid ? "" : "Add notes…"}
                          rows={1}
                          onFocus={e => { e.currentTarget.rows = 3; setPromptInvoiceFor(null) }}
                          onBlur={e => { e.currentTarget.rows = 1; if (!isPaid) saveField(m.id, 'milestone_notes') }}
                          onChange={e => handleFieldChange(m.id, 'milestone_notes', e.target.value)}
                          className={textareaCls(m)}
                        />
                      </td>

                      {/* Actions */}
                      <td className="w-[80px] px-3 py-2.5 text-center">
                        {isPaid ? (
                          <span title="Paid — locked" className="flex justify-center">
                            <Lock className="h-3.5 w-3.5 text-green-500/40" />
                          </span>
                        ) : effectiveStatus === 'not_invoiced' ? (
                          <button
                            onClick={() => handleStatusChange(m, 'invoiced')}
                            className="text-[10px] font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
                          >
                            Invoice
                          </button>
                        ) : (effectiveStatus === 'invoiced' || effectiveStatus === 'overdue') ? (
                          <button
                            onClick={() => handleStatusChange(m, 'paid')}
                            className="text-[10px] font-medium text-green-400 hover:text-green-300 whitespace-nowrap"
                          >
                            Mark Paid
                          </button>
                        ) : null}
                      </td>

                      {/* Status — select (far right) */}
                      <td className="w-[130px] px-3 py-2.5">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 rounded border border-green-800/50 bg-green-950/50 text-green-300 px-2 py-1 text-xs font-medium">
                            ✅ Paid
                          </span>
                        ) : (
                          <select
                            value={effectiveStatus}
                            onChange={e => handleStatusChange(m, e.target.value as InvoiceStatus)}
                            className={statusSelectCls(effectiveStatus)}
                          >
                            <option value="not_invoiced">⏳ Not Invoiced</option>
                            <option value="invoiced">🕐 Invoiced</option>
                            <option value="overdue">⚠ Overdue</option>
                            <option value="paid">✅ Paid</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#2D3F5A] bg-[#0A1120]">
                  <td colSpan={2} className="px-3 py-2.5 text-xs font-bold text-foreground uppercase tracking-wider">
                    Total — {fmt(milestones.reduce((s, m) => s + m.amount, 0))}
                    <span className="text-muted-foreground font-normal ml-1">
                      ({Math.round(milestones.reduce((s, m) => s + m.percentage, 0) * 10) / 10}%)
                    </span>
                  </td>
                  <td colSpan={9} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Cash Flow Chart */}
      {chartData.length > 0 && (
        <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Cash Flow — Planned vs Collected</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} />
              <YAxis tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#6B7280" }} width={60} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0D1526", border: "1px solid #1E2D45", borderRadius: 8 }}
                labelStyle={{ color: "#E5E7EB", fontWeight: 600 }}
                formatter={(value: any) => [fmt(Number(value))]}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9CA3AF" }} />
              <Line type="monotone" dataKey="planned" name="Planned" stroke="#3B82F6" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: "#3B82F6", r: 3 }} connectNulls />
              <Line type="monotone" dataKey="actual" name="Collected" stroke="#10B981" strokeWidth={2} dot={{ fill: "#10B981", r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Confirm Paid Dialog */}
      {confirmPaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#1E2D45] bg-[#0D1526] shadow-2xl p-6 space-y-4">
            <p className="font-semibold text-foreground">
              Mark {fmt(confirmPaid.amount)} as paid?
            </p>
            <p className="text-sm text-muted-foreground">
              This will lock the milestone and mark it as fully settled.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmPaid(null)}
                className="flex-1 rounded-lg border border-[#1E2D45] py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPaid}
                className="flex-1 rounded-lg bg-green-700 hover:bg-green-600 py-2 text-sm font-semibold text-white transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
