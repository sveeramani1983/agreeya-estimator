"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, Users, DollarSign, TrendingUp, Plus, Search, ExternalLink, Archive, Trash2, MoreHorizontal, Phone, Mail, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ClientSlideOver } from "@/components/client-slide-over"
import { archiveClient, deleteClient } from "@/lib/actions"
import type { Client } from "@/lib/types"

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n)}`
}

interface Props {
  initialClients: Client[]
}

export function ClientsClient({ initialClients }: Props) {
  const router = useRouter()
  const [clients, setClients] = useState(initialClients)
  const [search, setSearch] = useState("")
  const [industryFilter, setIndustryFilter] = useState<string>("all")
  const [slideOpen, setSlideOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const industries = Array.from(new Set(clients.map(c => c.industry).filter(Boolean))) as string[]

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchesSearch = !q || c.name.toLowerCase().includes(q) ||
      (c.industry ?? "").toLowerCase().includes(q) ||
      (c.city ?? "").toLowerCase().includes(q) ||
      (c.primary_contact_name ?? "").toLowerCase().includes(q)
    const matchesIndustry = industryFilter === "all" || c.industry === industryFilter
    return matchesSearch && matchesIndustry
  })

  const totalPipeline = clients.reduce((s, c) => s + (c.total_pipeline ?? 0), 0)
  const totalWon = clients.reduce((s, c) => s + (c.total_won ?? 0), 0)
  const totalProjects = clients.reduce((s, c) => s + (c.project_count ?? 0), 0)

  function openNew() { setEditingClient(null); setSlideOpen(true) }
  function openEdit(c: Client) { setEditingClient(c); setSlideOpen(true) }

  async function handleArchive(id: string) {
    try {
      await archiveClient(id)
      setClients(cs => cs.filter(c => c.id !== id))
      toast.success("Client archived")
    } catch { toast.error("Failed to archive client") }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteClient(deleteId)
      setClients(cs => cs.filter(c => c.id !== deleteId))
      toast.success("Client deleted")
    } catch { toast.error("Failed to delete client") } finally { setDeleteId(null) }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-foreground">Clients</h2>
          <p className="text-muted-foreground mt-1">Master list of all client organizations.</p>
        </div>
        <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Plus className="h-4 w-4" /> New Client
        </Button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Clients", value: clients.length, sub: "active organizations", icon: Building2, color: "text-blue-400" },
          { label: "Total Projects", value: totalProjects, sub: "across all clients", icon: Users, color: "text-purple-400" },
          { label: "Active Pipeline", value: fmt(totalPipeline), sub: "draft + submitted", icon: TrendingUp, color: "text-amber-400" },
          { label: "Total Won", value: fmt(totalWon), sub: "closed revenue", icon: DollarSign, color: "text-green-400" },
        ].map(t => (
          <div key={t.label} className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.label}</p>
              <t.icon className={`h-4 w-4 ${t.color}`} />
            </div>
            <p className="text-2xl font-black text-foreground">{t.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="pl-9 bg-[#0D1526] border-[#1E2D45] text-foreground"
          />
        </div>
        <select
          value={industryFilter}
          onChange={e => setIndustryFilter(e.target.value)}
          className="rounded-md border border-[#1E2D45] bg-[#0D1526] text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All Industries</option>
          {industries.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      {/* Client grid */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-[#1E2D45] p-16 text-center">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground opacity-20 mb-3" />
          <p className="font-semibold text-muted-foreground">
            {clients.length === 0 ? "No clients yet" : "No clients match your filters"}
          </p>
          {clients.length === 0 && (
            <p className="text-sm text-muted-foreground mt-1">Create your first client to start building your client master list.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(client => (
            <div key={client.id} className="group rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5 hover:border-blue-800/60 transition-colors">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-blue-900/30 border border-blue-800/40 flex items-center justify-center shrink-0">
                    <span className="text-sm font-black text-blue-300">
                      {client.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-bold text-foreground hover:text-primary transition-colors truncate block leading-tight"
                    >
                      {client.name}
                    </Link>
                    {client.industry && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{client.industry}</p>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}>
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => openEdit(client)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem render={<Link href={`/clients/${client.id}`} />}>
                      View Detail
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleArchive(client.id)} className="text-amber-400">
                      <Archive className="h-4 w-4 mr-2" /> Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeleteId(client.id)} className="text-red-400">
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Contact info */}
              <div className="space-y-1 mb-3">
                {client.primary_contact_name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3 w-3 shrink-0" />
                    {client.primary_contact_name}
                  </p>
                )}
                {(client.city || client.state) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[client.city, client.state].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>

              {/* Metrics */}
              <div className="flex items-center gap-4 pt-3 border-t border-[#1E2D45]">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projects</p>
                  <p className="text-sm font-bold text-foreground">{client.project_count ?? 0}</p>
                </div>
                {(client.total_pipeline ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pipeline</p>
                    <p className="text-sm font-bold text-amber-400">{fmt(client.total_pipeline ?? 0)}</p>
                  </div>
                )}
                {(client.total_won ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Won</p>
                    <p className="text-sm font-bold text-green-400">{fmt(client.total_won ?? 0)}</p>
                  </div>
                )}
                <Link
                  href={`/clients/${client.id}`}
                  className="ml-auto flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  View <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <ClientSlideOver
        open={slideOpen}
        onOpenChange={setSlideOpen}
        client={editingClient}
        onSaved={id => {
          router.refresh()
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the client record. Projects linked to this client will be unlinked but not deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete Client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
