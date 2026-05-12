"use client"

import { useState } from "react"
import { Plus, Trash2, Save, CheckCircle2, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"

import { RateCardItem } from "@/lib/types"
import { createRateCard, updateRateCard, deleteRateCard } from "@/lib/actions"

interface AddForm {
  role_title: string
  onsite_rate: string
  offshore_rate: string
  notes: string
}

const EMPTY_FORM: AddForm = { role_title: "", onsite_rate: "", offshore_rate: "", notes: "" }

function offshoreOverOnsite(item: RateCardItem): boolean {
  return item.offshore_rate > 0 && item.onsite_rate > 0 && item.offshore_rate > item.onsite_rate
}

export function RateCardManager({ initialRateCard }: { initialRateCard: RateCardItem[] }) {
  const [rates, setRates] = useState<RateCardItem[]>(initialRateCard)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState<AddForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof AddForm, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  // ── Inline edit handlers ────────────────────────────────────────────────

  const handleUpdate = (id: string, updates: Partial<RateCardItem>) => {
    setRates(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
  }

  const handleBlur = async (item: RateCardItem) => {
    setSavingId(item.id)
    try {
      await updateRateCard(item.id, item)
    } catch {
      toast.error("Failed to save changes")
    } finally {
      setTimeout(() => setSavingId(null), 600)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteRateCard(id)
      setRates(prev => prev.filter(r => r.id !== id))
      toast.success("Role deleted")
    } catch {
      toast.error("Failed to delete role")
    }
  }

  // ── Add Role dialog ─────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    const next: Partial<Record<keyof AddForm, string>> = {}
    if (!form.role_title.trim()) next.role_title = "Role title is required"
    const onsite = parseFloat(form.onsite_rate)
    const offshore = parseFloat(form.offshore_rate)
    if (!form.onsite_rate || isNaN(onsite) || onsite <= 0) next.onsite_rate = "Must be greater than 0"
    if (!form.offshore_rate || isNaN(offshore) || offshore <= 0) next.offshore_rate = "Must be greater than 0"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const offshoreWarnInForm =
    parseFloat(form.offshore_rate) > 0 &&
    parseFloat(form.onsite_rate) > 0 &&
    parseFloat(form.offshore_rate) > parseFloat(form.onsite_rate)

  const handleAddSubmit = async () => {
    if (!validateForm()) return
    setSubmitting(true)
    const onsite = parseFloat(form.onsite_rate)
    const offshore = parseFloat(form.offshore_rate)
    const newItem: RateCardItem = {
      id: uuidv4(),
      role_title: form.role_title.trim(),
      standard_rate: onsite,
      onsite_rate: onsite,
      offshore_rate: offshore,
      notes: form.notes.trim() || null,
    }
    try {
      await createRateCard({ role_title: newItem.role_title, onsite_rate: onsite, offshore_rate: offshore, notes: newItem.notes })
      setRates(prev => [...prev, newItem])
      setAddOpen(false)
      setForm(EMPTY_FORM)
      setErrors({})
      toast.success(`${newItem.role_title} added to rate card`)
    } catch {
      toast.error("Failed to add role")
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setAddOpen(open)
    if (!open) { setForm(EMPTY_FORM); setErrors({}) }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define onsite and offshore billing rates per role. These auto-populate when adding resources to a project.
        </p>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-sidebar text-white hover:bg-sidebar-accent gap-2"
        >
          <Plus className="h-4 w-4" /> Add Role
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-[#1E2D45] bg-[#111827] shadow-sm">
        <Table>
          <TableHeader className="bg-[#0D1526]">
            <TableRow>
              <TableHead className="w-[220px]">Role Title</TableHead>
              <TableHead className="w-[150px]">Onsite Rate ($/hr)</TableHead>
              <TableHead className="w-[160px]">Offshore Rate ($/hr)</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-[70px] text-center">Status</TableHead>
              <TableHead className="w-[70px] text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.map(rate => {
              const warn = offshoreOverOnsite(rate)
              return (
                <TableRow key={rate.id} className={warn ? "bg-amber-50/40" : undefined}>
                  <TableCell>
                    <Input
                      value={rate.role_title}
                      onChange={e => handleUpdate(rate.id, { role_title: e.target.value })}
                      onBlur={() => handleBlur(rate)}
                      className="h-8 border-none bg-transparent font-medium focus-visible:ring-1"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        min="0"
                        value={rate.onsite_rate ?? rate.standard_rate}
                        onChange={e => handleUpdate(rate.id, { onsite_rate: Number(e.target.value) })}
                        onBlur={() => handleBlur({ ...rate })}
                        className="h-8 border-none bg-transparent tabular-nums focus-visible:ring-1"
                      />
                      <span className="text-xs text-muted-foreground">/hr</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        min="0"
                        value={rate.offshore_rate ?? 0}
                        onChange={e => handleUpdate(rate.id, { offshore_rate: Number(e.target.value) })}
                        onBlur={() => handleBlur({ ...rate })}
                        className={`h-8 border-none bg-transparent tabular-nums focus-visible:ring-1 ${warn ? "text-amber-700" : ""}`}
                      />
                      <span className="text-xs text-muted-foreground">/hr</span>
                      {warn && (
                        <span title="Offshore rate exceeds onsite rate">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={rate.notes || ""}
                      onChange={e => handleUpdate(rate.id, { notes: e.target.value })}
                      onBlur={() => handleBlur(rate)}
                      placeholder="Optional notes..."
                      className="h-8 border-none bg-transparent focus-visible:ring-1"
                    />
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {savingId === rate.id ? (
                      <Save className="h-4 w-4 mx-auto animate-pulse text-blue-500" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mx-auto text-green-500 opacity-50" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(rate.id)}
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {rates.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No roles defined yet. Click Add Role to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Add Role dialog ── */}
      <Dialog open={addOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Role</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-title">Role Title <span className="text-red-500">*</span></Label>
              <Input
                id="add-title"
                placeholder="e.g. DevOps Engineer"
                value={form.role_title}
                onChange={e => setForm(f => ({ ...f, role_title: e.target.value }))}
                className={errors.role_title ? "border-red-400 focus-visible:ring-red-300" : ""}
              />
              {errors.role_title && <p className="text-xs text-red-600">{errors.role_title}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="add-onsite">Onsite Rate ($/hr) <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    id="add-onsite"
                    type="number"
                    min="1"
                    placeholder="155"
                    value={form.onsite_rate}
                    onChange={e => setForm(f => ({ ...f, onsite_rate: e.target.value }))}
                    className={`pl-6 ${errors.onsite_rate ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                  />
                </div>
                {errors.onsite_rate && <p className="text-xs text-red-600">{errors.onsite_rate}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-offshore">Offshore Rate ($/hr) <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    id="add-offshore"
                    type="number"
                    min="1"
                    placeholder="50"
                    value={form.offshore_rate}
                    onChange={e => setForm(f => ({ ...f, offshore_rate: e.target.value }))}
                    className={`pl-6 ${errors.offshore_rate ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                  />
                </div>
                {errors.offshore_rate && <p className="text-xs text-red-600">{errors.offshore_rate}</p>}
              </div>
            </div>

            {offshoreWarnInForm && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p>
                  Offshore rate is higher than onsite rate. Please confirm this is correct.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="add-notes">Notes <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Input
                id="add-notes"
                placeholder="e.g. Available for projects starting Q3"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSubmit}
              disabled={submitting}
              className="bg-sidebar text-white hover:bg-sidebar-accent"
            >
              {submitting ? "Adding…" : "Add Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
