"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { X, Building2, Globe, MapPin, Phone, Mail, Briefcase } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet"
import { saveClient } from "@/lib/actions"
import type { Client } from "@/lib/types"

const INDUSTRIES = [
  "State Government", "Local Government", "Federal Government",
  "Healthcare", "Financial Services", "Technology", "Manufacturing",
  "Education", "Retail", "Energy & Utilities", "Transportation",
  "Non-Profit", "Real Estate", "Media & Entertainment", "Other",
]

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  client?: Client | null
  onSaved?: (id: string) => void
}

export function ClientSlideOver({ open, onOpenChange, client, onSaved }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "", industry: "", website: "", address: "", city: "", state: "",
    country: "USA", phone: "", email: "", notes: "",
  })

  useEffect(() => {
    if (open) {
      setForm({
        name: client?.name ?? "",
        industry: client?.industry ?? "",
        website: client?.website ?? "",
        address: client?.address ?? "",
        city: client?.city ?? "",
        state: client?.state ?? "",
        country: client?.country ?? "USA",
        phone: client?.phone ?? "",
        email: client?.email ?? "",
        notes: client?.notes ?? "",
      })
    }
  }, [open, client])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Client name is required"); return }
    setSaving(true)
    try {
      const { id } = await saveClient({ ...(client?.id ? { id: client.id } : {}), ...form, name: form.name.trim() })
      toast.success(client?.id ? "Client updated" : "Client created")
      onOpenChange(false)
      onSaved?.(id)
      router.refresh()
    } catch {
      toast.error("Failed to save client")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-[#0D1526] border-l border-[#1E2D45] overflow-y-auto p-0">
        <SheetHeader className="px-6 py-5 border-b border-[#1E2D45]">
          <SheetTitle className="text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-400" />
            {client?.id ? "Edit Client" : "New Client"}
          </SheetTitle>
          <SheetDescription className="text-muted-foreground">
            {client?.id ? "Update client information." : "Add a new client to your master list."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-5 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Basic Info</p>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Client Name <span className="text-red-400">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="e.g. State of California"
                className="bg-[#0A1120] border-[#1E2D45] text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Briefcase className="h-3 w-3" /> Industry
              </Label>
              <Select value={form.industry} onValueChange={v => set("industry", v ?? "")}>
                <SelectTrigger className="bg-[#0A1120] border-[#1E2D45] text-foreground">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Globe className="h-3 w-3" /> Website
              </Label>
              <Input
                value={form.website}
                onChange={e => set("website", e.target.value)}
                placeholder="https://example.gov"
                className="bg-[#0A1120] border-[#1E2D45] text-foreground"
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> Phone
                </Label>
                <Input
                  value={form.phone}
                  onChange={e => set("phone", e.target.value)}
                  placeholder="(555) 000-0000"
                  className="bg-[#0A1120] border-[#1E2D45] text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <Input
                  value={form.email}
                  onChange={e => set("email", e.target.value)}
                  placeholder="info@client.com"
                  className="bg-[#0A1120] border-[#1E2D45] text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> Address
            </p>
            <div className="space-y-2">
              <Input
                value={form.address}
                onChange={e => set("address", e.target.value)}
                placeholder="Street address"
                className="bg-[#0A1120] border-[#1E2D45] text-foreground"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Input
                  value={form.city}
                  onChange={e => set("city", e.target.value)}
                  placeholder="City"
                  className="bg-[#0A1120] border-[#1E2D45] text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Input
                  value={form.state}
                  onChange={e => set("state", e.target.value)}
                  placeholder="State"
                  className="bg-[#0A1120] border-[#1E2D45] text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Input
                  value={form.country}
                  onChange={e => set("country", e.target.value)}
                  placeholder="Country"
                  className="bg-[#0A1120] border-[#1E2D45] text-foreground"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Any additional context about this client..."
              rows={3}
              className="bg-[#0A1120] border-[#1E2D45] text-foreground resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#1E2D45] flex gap-3">
          <Button
            variant="outline"
            className="flex-1 border-[#1E2D45]"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : client?.id ? "Update Client" : "Create Client"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
