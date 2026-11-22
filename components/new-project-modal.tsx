"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, Building2, ChevronDown, BarChart2, X } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { createProject, getClients, getClientIntelligenceAction } from "@/lib/actions"
import type { Client, ProjectStatus } from "@/lib/types"
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
        <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
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
          <p className="text-muted-foreground">Avg Value</p>
          <p className="font-semibold text-foreground">{fmtValue(intel.avgWinValue)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Last Win</p>
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

// ── Modal ─────────────────────────────────────────────────────────────────────

export function NewProjectModal() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [clientValue, setClientValue] = useState<{ id: string | null; name: string }>({ id: null, name: "" })
  const [clientIntel, setClientIntel] = useState<ClientIntelligence | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (open) {
      getClients().then(setClients).catch(() => {})
      setClientValue({ id: null, name: "" })
      setClientIntel(null)
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const name = formData.get("name") as string

    if (!name.trim()) {
      toast.error("Project Name is required.")
      return
    }
    if (!clientValue.name.trim()) {
      toast.error("Client is required.")
      return
    }

    setLoading(true)
    try {
      const { id } = await createProject({
        name: name.trim(),
        client_name: clientValue.name.trim(),
        client_id: clientValue.id,
        description: formData.get("description") as string,
        status: (formData.get("status") as ProjectStatus) || "draft",
      })
      toast.success("Project created successfully")
      setOpen(false)
      router.push(`/projects/${id}/estimate`)
    } catch (error) {
      toast.error("Failed to create project")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-sidebar hover:bg-sidebar-accent text-white gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Enter the project details to start a new estimation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Project Name <span className="text-red-500">*</span></Label>
              <Input id="name" name="name" placeholder="e.g. E-commerce Platform" required />
            </div>
            <div className="grid gap-2">
              <Label>Client <span className="text-red-500">*</span></Label>
              <ClientPicker clients={clients} value={clientValue} onChange={setClientValue} />
              {clientIntel && <ClientIntelligenceCard intel={clientIntel} />}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Initial Status</Label>
              <Select name="status" defaultValue="draft">
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Briefly describe the project scope..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-sidebar text-white hover:bg-sidebar-accent">
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
