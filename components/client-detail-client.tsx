"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Building2, Users, FolderOpen, FileText, Plus, Trash2, Star, Mail, Phone,
  Globe, MapPin, MoreHorizontal, ExternalLink, Edit, MessageSquare, ChevronRight,
  CheckCircle2, Activity, DollarSign, Target,
} from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { ClientSlideOver } from "@/components/client-slide-over"
import {
  saveClientContact, deleteClientContact, saveClientNote, deleteClientNote,
} from "@/lib/actions"
import type { Client, ClientContact, ClientNote, Project } from "@/lib/types"

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n)}`
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-700/40 text-gray-400 border-gray-600/40",
  submitted: "bg-blue-900/40 text-blue-300 border-blue-800/40",
  won: "bg-green-900/40 text-green-300 border-green-800/40",
  lost: "bg-red-900/40 text-red-300 border-red-800/40",
}

const NOTE_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "meeting", label: "Meeting Notes" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "opportunity", label: "Opportunity" },
]

const noteCatColors: Record<string, string> = {
  general: "bg-gray-700/40 text-gray-400",
  meeting: "bg-blue-900/40 text-blue-300",
  follow_up: "bg-amber-900/40 text-amber-300",
  opportunity: "bg-purple-900/40 text-purple-300",
}

type TabId = "overview" | "projects" | "contacts" | "notes"

interface Props {
  client: Client
  contacts: ClientContact[]
  notes: ClientNote[]
  projects: Project[]
}

// ── Contacts Tab ──────────────────────────────────────────────────────────────

function ContactsTab({ clientId, initialContacts }: { clientId: string; initialContacts: ClientContact[] }) {
  const router = useRouter()
  const [contacts, setContacts] = useState(initialContacts)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<ClientContact | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", title: "", email: "", phone: "", is_primary: false, notes: "" })

  function openNew() {
    setEditingContact(null)
    setForm({ name: "", title: "", email: "", phone: "", is_primary: contacts.length === 0, notes: "" })
    setDialogOpen(true)
  }
  function openEdit(c: ClientContact) {
    setEditingContact(c)
    setForm({ name: c.name, title: c.title ?? "", email: c.email ?? "", phone: c.phone ?? "", is_primary: c.is_primary, notes: c.notes ?? "" })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return }
    setSaving(true)
    try {
      await saveClientContact({
        ...(editingContact ? { id: editingContact.id } : {}),
        client_id: clientId,
        name: form.name.trim(),
        title: form.title || null,
        email: form.email || null,
        phone: form.phone || null,
        is_primary: form.is_primary,
        notes: form.notes || null,
      })
      toast.success(editingContact ? "Contact updated" : "Contact added")
      setDialogOpen(false)
      router.refresh()
    } catch { toast.error("Failed to save contact") } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteClientContact(deleteId, clientId)
      toast.success("Contact removed")
      router.refresh()
    } catch { toast.error("Failed to delete contact") } finally { setDeleteId(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{initialContacts.length} Contact{initialContacts.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" /> Add Contact
        </Button>
      </div>

      {initialContacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#1E2D45] p-10 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground opacity-20 mb-2" />
          <p className="text-sm text-muted-foreground">No contacts yet. Add key stakeholders and decision-makers.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialContacts.map(c => (
            <div key={c.id} className="group rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-blue-900/30 border border-blue-800/40 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-blue-300">{c.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground text-sm">{c.name}</p>
                      {c.is_primary && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-900/30 border border-amber-800/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          <Star className="h-2.5 w-2.5" /> Primary
                        </span>
                      )}
                    </div>
                    {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                    <div className="flex gap-4 mt-1.5">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" />}>
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => openEdit(c)}>Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDeleteId(c.id)} className="text-red-400">Remove</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm bg-[#0D1526] border border-[#1E2D45]">
          <DialogHeader>
            <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Full Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-[#0A1120] border-[#1E2D45]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title / Role</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Program Director" className="bg-[#0A1120] border-[#1E2D45]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="bg-[#0A1120] border-[#1E2D45]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="bg-[#0A1120] border-[#1E2D45]" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
                className="rounded"
              />
              <span className="text-xs text-muted-foreground">Primary contact</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="border-[#1E2D45]">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Contact?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the contact from this client.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Notes Tab ─────────────────────────────────────────────────────────────────

function NotesTab({ clientId, initialNotes }: { clientId: string; initialNotes: ClientNote[] }) {
  const router = useRouter()
  const [composing, setComposing] = useState(false)
  const [content, setContent] = useState("")
  const [category, setCategory] = useState<string>("general")
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function handleSave() {
    if (!content.trim()) { toast.error("Note content is required"); return }
    setSaving(true)
    try {
      await saveClientNote({ client_id: clientId, content: content.trim(), category })
      toast.success("Note added")
      setContent(""); setCategory("general"); setComposing(false)
      router.refresh()
    } catch { toast.error("Failed to save note") } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteClientNote(deleteId, clientId)
      toast.success("Note deleted")
      router.refresh()
    } catch { toast.error("Failed to delete note") } finally { setDeleteId(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{initialNotes.length} Note{initialNotes.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => setComposing(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" /> Add Note
        </Button>
      </div>

      {composing && (
        <div className="rounded-lg border border-blue-800/40 bg-blue-900/10 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Select value={category} onValueChange={(v) => { if (v) setCategory(v) }}>
              <SelectTrigger className="w-40 h-7 text-xs bg-[#0A1120] border-[#1E2D45]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your note here…"
            rows={4}
            className="bg-[#0A1120] border-[#1E2D45] text-foreground resize-none"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => { setComposing(false); setContent(""); }} className="border-[#1E2D45] h-8 text-xs">Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs">
              {saving ? "Saving…" : "Save Note"}
            </Button>
          </div>
        </div>
      )}

      {initialNotes.length === 0 && !composing ? (
        <div className="rounded-lg border border-dashed border-[#1E2D45] p-10 text-center">
          <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground opacity-20 mb-2" />
          <p className="text-sm text-muted-foreground">No notes yet. Track meetings, follow-ups, and opportunities.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialNotes.map(note => {
            const cat = NOTE_CATEGORIES.find(c => c.value === note.category)
            return (
              <div key={note.id} className="group rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${noteCatColors[note.category] ?? noteCatColors.general}`}>
                    {cat?.label ?? note.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy")}
                    </span>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                      onClick={() => setDeleteId(note.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note?</AlertDialogTitle>
            <AlertDialogDescription>This note will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ClientDetailClient({ client, contacts, notes, projects }: Props) {
  const [tab, setTab] = useState<TabId>("overview")
  const [editOpen, setEditOpen] = useState(false)
  const router = useRouter()

  const pipeline = projects.filter(p => ["draft", "submitted"].includes(p.status))
  const won = projects.filter(p => p.status === "won")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-blue-900/30 border border-blue-800/40 flex items-center justify-center shrink-0">
            <span className="text-xl font-black text-blue-300">{client.name.slice(0, 2).toUpperCase()}</span>
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground">{client.name}</h2>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              {client.industry && (
                <span className="text-sm text-muted-foreground">{client.industry}</span>
              )}
              {(client.city || client.state) && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {[client.city, client.state].filter(Boolean).join(", ")}
                </span>
              )}
              {client.website && (
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  Website
                </a>
              )}
            </div>
          </div>
        </div>
        <Button onClick={() => setEditOpen(true)} variant="outline" className="border-[#1E2D45] gap-2 shrink-0">
          <Edit className="h-4 w-4" /> Edit
        </Button>
      </div>

      {/* Quick metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Projects", value: projects.length, icon: FolderOpen, color: "text-blue-400" },
          { label: "Active Pipeline", value: fmt(client.total_pipeline ?? 0), icon: Target, color: "text-amber-400" },
          { label: "Won Revenue", value: fmt(client.total_won ?? 0), icon: DollarSign, color: "text-green-400" },
          { label: "Contacts", value: contacts.length, icon: Users, color: "text-purple-400" },
        ].map(t => (
          <div key={t.label} className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.label}</p>
              <t.icon className={`h-4 w-4 ${t.color}`} />
            </div>
            <p className="text-xl font-black text-foreground">{t.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-[#1E2D45]">
        <div className="flex gap-1">
          {(["overview", "projects", "contacts", "notes"] as TabId[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "projects" ? `Projects (${projects.length})` :
               t === "contacts" ? `Contacts (${contacts.length})` :
               t === "notes" ? `Notes (${notes.length})` : "Overview"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* About */}
          <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5">
            <p className="text-sm font-semibold text-foreground mb-4">About</p>
            <div className="space-y-3">
              {client.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`tel:${client.phone}`} className="text-sm text-foreground hover:text-primary">{client.phone}</a>
                </div>
              )}
              {client.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${client.email}`} className="text-sm text-foreground hover:text-primary">{client.email}</a>
                </div>
              )}
              {client.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground">
                    <p>{client.address}</p>
                    <p>{[client.city, client.state, client.country].filter(Boolean).join(", ")}</p>
                  </div>
                </div>
              )}
              {client.notes && (
                <div className="pt-3 border-t border-[#1E2D45]">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
              {!client.phone && !client.email && !client.address && !client.notes && (
                <p className="text-sm text-muted-foreground">No contact information recorded.</p>
              )}
            </div>
          </div>

          {/* Primary contact */}
          <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">Key Contacts</p>
              <button onClick={() => setTab("contacts")} className="text-xs text-primary hover:text-primary/80">
                View all →
              </button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts added yet.</p>
            ) : (
              <div className="space-y-3">
                {contacts.slice(0, 3).map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-900/30 border border-blue-800/40 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-blue-300">{c.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        {c.name}
                        {c.is_primary && <Star className="h-3 w-3 text-amber-400" />}
                      </p>
                      {c.title && <p className="text-xs text-muted-foreground truncate">{c.title}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent projects */}
          <div className="lg:col-span-2 rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">Recent Projects</p>
              <button onClick={() => setTab("projects")} className="text-xs text-primary hover:text-primary/80">
                View all →
              </button>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects linked to this client.</p>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 5).map(p => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}/estimate`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusColors[p.status]}`}>
                        {p.status}
                      </span>
                      <span className="text-sm text-foreground truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {(p.total_cost ?? 0) > 0 && (
                        <span className="text-xs font-semibold text-muted-foreground tabular-nums">{fmt(p.total_cost ?? 0)}</span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "projects" && (
        <div className="space-y-4">
          {projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#1E2D45] p-10 text-center">
              <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground opacity-20 mb-2" />
              <p className="text-sm text-muted-foreground">No projects linked to this client yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-[#1E2D45] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E2D45] bg-[#0A1120]">
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Project</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Value</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2D45]">
                  {projects.map(p => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusColors[p.status]}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                        {(p.total_cost ?? 0) > 0 ? fmt(p.total_cost ?? 0) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                        {format(new Date(p.updated_at), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/projects/${p.id}/estimate`} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 justify-end">
                          Open <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "contacts" && (
        <ContactsTab clientId={client.id} initialContacts={contacts} />
      )}

      {tab === "notes" && (
        <NotesTab clientId={client.id} initialNotes={notes} />
      )}

      <ClientSlideOver
        open={editOpen}
        onOpenChange={setEditOpen}
        client={client}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}
