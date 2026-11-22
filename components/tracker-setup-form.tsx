"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { setupTrackerProject } from "@/lib/actions"
import type { ReportingCadence } from "@/lib/types"

interface TrackerSetupFormProps {
  estimatorProjectId: string
  projectName: string
  baselineCost: number
}

export function TrackerSetupForm({ estimatorProjectId, projectName, baselineCost }: TrackerSetupFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pmName, setPmName] = useState("")
  const [pmEmail, setPmEmail] = useState("")
  const [clientContact, setClientContact] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [actualStartDate, setActualStartDate] = useState("")
  const [cadence, setCadence] = useState<ReportingCadence>("monthly")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await setupTrackerProject(estimatorProjectId, {
        pmName,
        pmEmail,
        clientContact,
        clientEmail,
        actualStartDate,
        reportingCadence: cadence,
      })
      router.push(`/tracker/projects/${estimatorProjectId}/overview`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set up tracker")
      setSaving(false)
    }
  }

  const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Project context card */}
      <div className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Baseline Budget</p>
        <p className="text-2xl font-bold text-foreground">{fmt(baselineCost)}</p>
        <p className="text-xs text-muted-foreground">Locked at win for <span className="text-foreground">{projectName}</span></p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5 space-y-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Team Contacts</legend>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">PM Name</label>
              <input
                type="text"
                value={pmName}
                onChange={e => setPmName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-md border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">PM Email</label>
              <input
                type="email"
                value={pmEmail}
                onChange={e => setPmEmail(e.target.value)}
                placeholder="jane@company.com"
                className="w-full rounded-md border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Client Contact</label>
              <input
                type="text"
                value={clientContact}
                onChange={e => setClientContact(e.target.value)}
                placeholder="Client Name"
                className="w-full rounded-md border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Client Email</label>
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="client@org.com"
                className="w-full rounded-md border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-[#1E2D45] bg-[#0D1526] p-5 space-y-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Delivery Setup</legend>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Actual Start Date</label>
            <input
              type="date"
              value={actualStartDate}
              onChange={e => setActualStartDate(e.target.value)}
              className="w-full rounded-md border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[11px] text-muted-foreground">Used as the first period anchor for burn tracking.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">Reporting Cadence</label>
            <select
              value={cadence}
              onChange={e => setCadence(e.target.value as ReportingCadence)}
              className="w-full rounded-md border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly (every 2 weeks)</option>
              <option value="semimonthly">Semi-monthly (1st & 15th)</option>
              <option value="monthly">Monthly</option>
            </select>
            <p className="text-[11px] text-muted-foreground">How often you will enter burn actuals in the tracker.</p>
          </div>
        </fieldset>

        {error && (
          <p className="text-sm text-red-400 rounded-md border border-red-800/40 bg-red-900/10 px-4 py-2.5">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {saving ? "Setting up…" : "Launch Tracker"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-[#1E2D45] bg-transparent hover:bg-[#1E2D45]/40 px-4 py-2.5 text-sm text-muted-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
