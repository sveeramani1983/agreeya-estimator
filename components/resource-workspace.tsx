"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import {
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Users,
  Wand2,
  MapPin,
} from "lucide-react"
import { v4 as uuidv4 } from "uuid"
import debounce from "lodash.debounce"
import {
  format,
  addWeeks,
  addMonths,
  isBefore,
  isAfter,
  parseISO,
  differenceInWeeks,
  differenceInMonths,
  eachWeekOfInterval,
  eachMonthOfInterval,
  min,
  max,
} from "date-fns"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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

import { Resource, ResourceLoading, RateCardItem, Project } from "@/lib/types"
import {
  updateResource,
  deleteResource,
  updateManyResourceLoading,
  deleteManyResourceLoading,
  updateProject,
} from "@/lib/actions"

function roundToNearest10(n: number): number {
  return Math.round(n / 10) * 10
}

function rateForLocation(rc: RateCardItem, location: 'onsite' | 'offshore'): number {
  if (location === 'offshore') return rc.offshore_rate || rc.standard_rate
  return rc.onsite_rate || rc.standard_rate
}

interface ResourceWorkspaceProps {
  projectId: string
  initialProject: Project
  initialResources: Resource[]
  initialLoading: ResourceLoading[]
  rateCard: RateCardItem[]
  totalEstimatedHours: number
  wbsConfidenceHours: number
}

type TimelineState = {
  mode: "range" | "duration"
  start: string
  end: string
  durationValue: number
  durationUnit: "weeks" | "months"
}

export function ResourceWorkspace({
  projectId,
  initialProject,
  initialResources,
  initialLoading,
  rateCard,
  totalEstimatedHours,
  wbsConfidenceHours,
}: ResourceWorkspaceProps) {
  const [resources, setResources] = useState<Resource[]>(
    initialResources.map(r => ({ ...r, location: (r.location ?? 'onsite') as 'onsite' | 'offshore' }))
  )
  const [loadingData, setLoadingData] = useState<ResourceLoading[]>(initialLoading)
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">(
    (initialProject.loading_period_type as "weekly" | "monthly") || "weekly"
  )
  const [periodSwitchPending, setPeriodSwitchPending] = useState<"weekly" | "monthly" | null>(null)
  const [saving, setSaving] = useState(false)
  const saveCount = useRef(0)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [applyTimelineOpen, setApplyTimelineOpen] = useState(false)

  // Onsite/Offshore toggle state
  const [rateOverrides, setRateOverrides] = useState<Record<string, boolean>>({})
  const [locationSwitchPending, setLocationSwitchPending] = useState<{
    resourceId: string
    targetLocation: 'onsite' | 'offshore'
    currentRate: number
    standardRate: number
  } | null>(null)

  // Grid trim dialog (Feature 7)
  const [gridTrimDialog, setGridTrimDialog] = useState<{
    removedPeriods: { key: string; label: string; hours: number }[]
    totalHours: number
    resourceCount: number
    pendingToCommit?: TimelineState
    pendingEffectiveEnd?: string
  } | null>(null)

  // Timeline state — pending = form inputs, committed = grid/roster source of truth
  const initialTimeline: TimelineState = {
    mode: (initialProject.timeline_mode as "range" | "duration") || "range",
    start: initialProject.timeline_start || "",
    end: initialProject.timeline_end || "",
    durationValue: initialProject.timeline_duration_value || 16,
    durationUnit: (initialProject.timeline_duration_unit as "weeks" | "months") || "weeks",
  }
  const [committedTimeline, setCommittedTimeline] = useState<TimelineState>(initialTimeline)
  const [pendingTimeline, setPendingTimeline] = useState<TimelineState>(initialTimeline)
  // Aliases — all downstream grid/roster code reads from committed timeline
  const timelineMode = committedTimeline.mode
  const timelineStart = committedTimeline.start

  // Pending end date — for form display only
  const pendingEffectiveEnd = useMemo(() => {
    if (pendingTimeline.mode !== "duration") return pendingTimeline.end
    if (!pendingTimeline.start || !pendingTimeline.durationValue) return ""
    try {
      const start = parseISO(pendingTimeline.start)
      if (isNaN(start.getTime())) return ""
      const end =
        pendingTimeline.durationUnit === "weeks"
          ? addWeeks(start, pendingTimeline.durationValue)
          : addMonths(start, pendingTimeline.durationValue)
      return format(end, "yyyy-MM-dd")
    } catch {
      return ""
    }
  }, [pendingTimeline])

  // Committed end date — drives the loading grid and roster date constraints
  const committedEffectiveEnd = useMemo(() => {
    if (committedTimeline.mode !== "duration") return committedTimeline.end
    if (!committedTimeline.start || !committedTimeline.durationValue) return ""
    try {
      const start = parseISO(committedTimeline.start)
      if (isNaN(start.getTime())) return ""
      const end =
        committedTimeline.durationUnit === "weeks"
          ? addWeeks(start, committedTimeline.durationValue)
          : addMonths(start, committedTimeline.durationValue)
      return format(end, "yyyy-MM-dd")
    } catch {
      return ""
    }
  }, [committedTimeline])

  // Alias — all grid/roster code reads this without knowing about staged state
  const effectiveTimelineEnd = committedEffectiveEnd

  // Duration display in range mode — uses pending values for live form feedback
  const rangeDuration = useMemo(() => {
    if (pendingTimeline.mode !== "range" || !pendingTimeline.start || !pendingTimeline.end) return null
    try {
      const s = parseISO(pendingTimeline.start)
      const e = parseISO(pendingTimeline.end)
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return null
      return { weeks: differenceInWeeks(e, s), months: differenceInMonths(e, s) }
    } catch {
      return null
    }
  }, [pendingTimeline])

  // Timeline summary for display + apply dialog
  const timelineSummary = useMemo(() => {
    if (!timelineStart || !effectiveTimelineEnd) return null
    try {
      const s = parseISO(timelineStart)
      const e = parseISO(effectiveTimelineEnd)
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return null
      return {
        weeks: Math.round(differenceInWeeks(e, s)),
        startStr: format(s, "MMM d, yyyy"),
        endStr: format(e, "MMM d, yyyy"),
      }
    } catch {
      return null
    }
  }, [timelineStart, effectiveTimelineEnd])

  const timelineWeeks = timelineSummary?.weeks ?? 0

  // Keep loadingData accessible in async handlers without stale closure
  const loadingDataRef = useRef(loadingData)
  useEffect(() => { loadingDataRef.current = loadingData }, [loadingData])

  // Grid periods — union of timeline + resource allocations
  const periods = useMemo(() => {
    let earliest: Date | null = null
    let latest: Date | null = null

    if (timelineStart && effectiveTimelineEnd) {
      try {
        const s = parseISO(timelineStart)
        const e = parseISO(effectiveTimelineEnd)
        if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && s <= e) {
          earliest = s
          latest = e
        }
      } catch {}
    }

    const validResources = resources.filter((r) => r.allocation_start && r.allocation_end)
    if (validResources.length > 0) {
      const startDates = validResources
        .map((r) => parseISO(r.allocation_start))
        .filter((d) => !isNaN(d.getTime()))
      const endDates = validResources
        .map((r) => parseISO(r.allocation_end))
        .filter((d) => !isNaN(d.getTime()))
      if (startDates.length > 0) {
        const resEarliest = min(startDates)
        const resLatest = max(endDates)
        if (!earliest || isBefore(resEarliest, earliest)) earliest = resEarliest
        if (!latest || isAfter(resLatest, latest)) latest = resLatest
      }
    }

    if (!earliest || !latest || earliest > latest) return []

    if (periodType === "weekly") {
      return eachWeekOfInterval({ start: earliest, end: latest }).map((date) => ({
        label: format(date, "MMM d, yyyy"),
        key: format(date, "yyyy-MM-dd"),
      }))
    } else {
      return eachMonthOfInterval({ start: earliest, end: latest }).map((date) => ({
        label: format(date, "MMM yyyy"),
        key: format(date, "yyyy-MM"),
      }))
    }
  }, [resources, periodType, timelineStart, effectiveTimelineEnd])

  // Check whether a period falls outside the project timeline
  const isOutsideTimeline = useCallback(
    (periodKey: string): boolean => {
      if (!timelineStart || !effectiveTimelineEnd) return false
      try {
        if (periodType === "weekly") {
          const d = parseISO(periodKey)
          return (
            isBefore(d, parseISO(timelineStart)) || isAfter(d, parseISO(effectiveTimelineEnd))
          )
        } else {
          const tlStart = format(parseISO(timelineStart), "yyyy-MM")
          const tlEnd = format(parseISO(effectiveTimelineEnd), "yyyy-MM")
          return periodKey < tlStart || periodKey > tlEnd
        }
      } catch {
        return false
      }
    },
    [timelineStart, effectiveTimelineEnd, periodType]
  )

  // Grid totals — derived from (resources × periods) so any column removal
  // automatically drops from all row totals, column totals, and grand total.
  const totals = useMemo(() => {
    // O(1) lookup: resourceId → periodKey → hours
    const lookup: Record<string, Record<string, number>> = {}
    for (const item of loadingData) {
      if (!lookup[item.resource_id]) lookup[item.resource_id] = {}
      lookup[item.resource_id][item.period_label] = item.hours || 0
    }

    const rowTotals: Record<string, number> = {}
    const colTotals: Record<string, number> = {}
    let grandTotal = 0

    for (const resource of resources) {
      let rowTotal = 0
      for (const period of periods) {
        const hours = lookup[resource.id]?.[period.key] ?? 0
        rowTotal += hours
        colTotals[period.key] = (colTotals[period.key] || 0) + hours
        grandTotal += hours
      }
      rowTotals[resource.id] = rowTotal
    }

    return { rowTotals, colTotals, grandTotal }
  }, [resources, periods, loadingData])

  // Team composition (Feature 5)
  const teamComposition = useMemo(() => {
    const onsiteResources = resources.filter(r => r.location !== 'offshore')
    const offshoreResources = resources.filter(r => r.location === 'offshore')
    const onsiteHours = onsiteResources.reduce((acc, r) => acc + (totals.rowTotals[r.id] || 0), 0)
    const offshoreHours = offshoreResources.reduce((acc, r) => acc + (totals.rowTotals[r.id] || 0), 0)
    const onsiteCost = onsiteResources.reduce((acc, r) => acc + (totals.rowTotals[r.id] || 0) * r.rate_per_hour, 0)
    const offshoreCost = offshoreResources.reduce((acc, r) => acc + (totals.rowTotals[r.id] || 0) * r.rate_per_hour, 0)
    const totalHours = onsiteHours + offshoreHours
    const totalCost = onsiteCost + offshoreCost
    const blendedRate = totalHours > 0 ? totalCost / totalHours : 0
    return { onsite: onsiteResources.length, offshore: offshoreResources.length, onsiteHours, offshoreHours, onsiteCost, offshoreCost, totalHours, totalCost, blendedRate }
  }, [resources, totals.rowTotals])

  // Auto-save roster
  const debouncedSaveRoster = useCallback(
    debounce((allResources: Resource[]) => {
      saveCount.current += 1
      setSaving(true)
      Promise.all(allResources.map((res) => updateResource(projectId, res)))
        .then(() => {
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
        .catch(() => {
          toast.error("Failed to save resources")
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
    }, 800),
    [projectId]
  )

  // Auto-save loading
  const debouncedSaveLoading = useCallback(
    debounce((items: ResourceLoading[]) => {
      saveCount.current += 1
      setSaving(true)
      updateManyResourceLoading(items)
        .then(() => {
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
        .catch(() => {
          toast.error("Failed to save loading")
          saveCount.current -= 1
          if (saveCount.current <= 0) { saveCount.current = 0; setSaving(false) }
        })
    }, 800),
    [projectId]
  )

  // Resource handlers
  const addResource = () => {
    const today = new Date()
    const firstRole = rateCard[0]
    const newRes: Resource = {
      id: uuidv4(),
      project_id: projectId,
      name: "New Resource",
      role: firstRole?.role_title || "Developer",
      rate_per_hour: firstRole ? rateForLocation(firstRole, 'onsite') : 150,
      allocation_start: timelineStart || format(today, "yyyy-MM-dd"),
      allocation_end: effectiveTimelineEnd || format(addMonths(today, 3), "yyyy-MM-dd"),
      location: 'onsite',
    }
    setResources((prev) => [...prev, newRes])
    updateResource(projectId, newRes).catch(() => {
      toast.error("Failed to add resource")
      setResources((prev) => prev.filter((r) => r.id !== newRes.id))
    })
  }

  const removeResource = async () => {
    if (!deleteId) return
    const id = deleteId
    setResources(resources.filter((r) => r.id !== id))
    setLoadingData(loadingData.filter((l) => l.resource_id !== id))
    await deleteResource(id)
    setDeleteId(null)
    toast.success("Resource removed")
  }

  const handleResourceUpdate = (id: string, updates: Partial<Resource>) => {
    setResources((prev) => {
      const next = prev.map((r) => {
        if (r.id !== id) return r
        if (updates.rate_per_hour !== undefined && updates.rate_per_hour < 0) updates.rate_per_hour = 0
        const updated = { ...r, ...updates }
        // When role changes, pull the correct rate based on current location and clear override
        if (updates.role) {
          const roleData = rateCard.find((rc) => rc.role_title === updates.role)
          if (roleData) {
            updated.rate_per_hour = rateForLocation(roleData, updated.location ?? 'onsite')
            setRateOverrides(prev => { const n = { ...prev }; delete n[id]; return n })
          }
        }
        return updated
      })
      debouncedSaveRoster(next)
      return next
    })
  }

  // Manual rate edit — marks as overridden
  const handleRateChange = (resourceId: string, rate: number) => {
    setRateOverrides(prev => ({ ...prev, [resourceId]: true }))
    setResources(prev => {
      const next = prev.map(r => r.id === resourceId ? { ...r, rate_per_hour: Math.max(0, rate) } : r)
      debouncedSaveRoster(next)
      return next
    })
  }

  // Location toggle (Feature 2)
  const handleLocationToggle = (resourceId: string, targetLocation: 'onsite' | 'offshore') => {
    const res = resources.find(r => r.id === resourceId)
    if (!res || res.location === targetLocation) return

    // Look up the role-specific rate for the target location
    const rateEntry = rateCard.find(rc => rc.role_title === res.role)
    const standardRate = rateEntry
      ? rateForLocation(rateEntry, targetLocation)
      : (targetLocation === 'onsite' ? 150 : 45)

    if (rateOverrides[resourceId]) {
      setLocationSwitchPending({ resourceId, targetLocation, currentRate: res.rate_per_hour, standardRate })
    } else {
      setResources(prev => {
        const next = prev.map(r => r.id === resourceId ? { ...r, location: targetLocation, rate_per_hour: standardRate } : r)
        debouncedSaveRoster(next)
        return next
      })
    }
  }

  const confirmLocationSwitch = (updateRate: boolean) => {
    if (!locationSwitchPending) return
    const { resourceId, targetLocation, standardRate } = locationSwitchPending
    setResources(prev => {
      const next = prev.map(r => {
        if (r.id !== resourceId) return r
        return { ...r, location: targetLocation, rate_per_hour: updateRate ? standardRate : r.rate_per_hour }
      })
      debouncedSaveRoster(next)
      return next
    })
    if (updateRate) {
      setRateOverrides(prev => { const n = { ...prev }; delete n[resourceId]; return n })
    }
    setLocationSwitchPending(null)
  }

  // Date validation helper (Feature 3)
  const getDateError = (res: Resource, field: 'start' | 'end'): string | null => {
    const value = field === 'start' ? res.allocation_start : res.allocation_end
    if (!value) return null
    if (field === 'start' && timelineStart && value < timelineStart) return "Before project start"
    if (field === 'end' && effectiveTimelineEnd && value > effectiveTimelineEnd) return "After project end"
    if (field === 'end' && res.allocation_start && value <= res.allocation_start) return "Must be after start"
    return null
  }

  const handlePeriodTypeChange = async (newType: "weekly" | "monthly") => {
    if (newType === periodType) return
    
    // If there is existing data, ask for confirmation
    if (loadingData.some(l => (l.hours || 0) > 0)) {
      setPeriodSwitchPending(newType)
    } else {
      await commitPeriodTypeChange(newType)
    }
  }

  const commitPeriodTypeChange = async (newType: "weekly" | "monthly") => {
    setPeriodType(newType)
    setLoadingData([])
    setPeriodSwitchPending(null)
    try {
      await Promise.all([
        updateProject(projectId, { loading_period_type: newType }),
        clearAllResourceLoading(projectId)
      ])
      toast.success(`Switched to ${newType} view. Existing data cleared.`)
    } catch {
      toast.error("Failed to update period type")
    }
  }

  // Loading grid handlers
  const handleLoadingChange = (resourceId: string, periodKey: string, hours: number) => {
    const safeHours = Math.max(0, hours)
    const existingIndex = loadingData.findIndex(
      (l) => l.resource_id === resourceId && l.period_label === periodKey
    )
    const newLoading = [...loadingData]
    if (existingIndex > -1) {
      newLoading[existingIndex] = { ...newLoading[existingIndex], hours: safeHours }
    } else {
      newLoading.push({
        id: uuidv4(),
        resource_id: resourceId,
        project_id: projectId,
        period_label: periodKey,
        hours: safeHours,
      })
    }
    setLoadingData(newLoading)
  }

  // Round to nearest 10 on blur (Feature 4)
  const handleLoadingBlur = (resourceId: string, periodKey: string) => {
    setLoadingData(prev => {
      const item = prev.find(l => l.resource_id === resourceId && l.period_label === periodKey)
      if (!item) return prev
      const rounded = roundToNearest10(item.hours)
      const updated = { ...item, hours: rounded }
      debouncedSaveLoading([updated])
      if (rounded === item.hours) return prev
      return prev.map(l => l.resource_id === resourceId && l.period_label === periodKey ? updated : l)
    })
  }

  // Auto-fill defaults: weekly=40, monthly=170 (Feature 4)
  const defaultHours = periodType === "weekly" ? 40 : 170

  const handleAutoFillRow = (resourceId: string) => {
    const newItems: ResourceLoading[] = []
    let newLoading = [...loadingData]

    for (const p of periods) {
      const existing = newLoading.find(
        (l) => l.resource_id === resourceId && l.period_label === p.key
      )
      if (!existing || (existing.hours ?? 0) === 0) {
        const newItem: ResourceLoading = {
          id: existing?.id || uuidv4(),
          resource_id: resourceId,
          project_id: projectId,
          period_label: p.key,
          hours: defaultHours,
        }
        newItems.push(newItem)
        const idx = newLoading.findIndex(
          (l) => l.resource_id === resourceId && l.period_label === p.key
        )
        if (idx > -1) {
          newLoading[idx] = newItem
        } else {
          newLoading = [...newLoading, newItem]
        }
      }
    }

    if (newItems.length === 0) {
      toast.info("No empty cells to fill in this row")
      return
    }
    setLoadingData(newLoading)
    debouncedSaveLoading(newItems)
    toast.success(`Filled ${newItems.length} cell${newItems.length !== 1 ? "s" : ""} with ${defaultHours} hrs`)
  }

  const handleAutoFillAll = () => {
    const newItems: ResourceLoading[] = []
    let newLoading = [...loadingData]

    for (const res of resources) {
      for (const p of periods) {
        const existing = newLoading.find(
          (l) => l.resource_id === res.id && l.period_label === p.key
        )
        if (!existing || (existing.hours ?? 0) === 0) {
          const newItem: ResourceLoading = {
            id: existing?.id || uuidv4(),
            resource_id: res.id,
            project_id: projectId,
            period_label: p.key,
            hours: defaultHours,
          }
          newItems.push(newItem)
          const idx = newLoading.findIndex(
            (l) => l.resource_id === res.id && l.period_label === p.key
          )
          if (idx > -1) {
            newLoading[idx] = newItem
          } else {
            newLoading = [...newLoading, newItem]
          }
        }
      }
    }

    if (newItems.length === 0) {
      toast.info("No empty cells to fill")
      return
    }
    setLoadingData(newLoading)
    debouncedSaveLoading(newItems)
    toast.success(
      `Filled ${newItems.length} empty cell${newItems.length !== 1 ? "s" : ""} with ${defaultHours} hrs`
    )
  }

  // Apply timeline dates to all resource allocations
  const handleApplyTimeline = async () => {
    if (!timelineStart || !effectiveTimelineEnd) return
    const updatedResources = resources.map((r) => ({
      ...r,
      allocation_start: timelineStart,
      allocation_end: effectiveTimelineEnd,
    }))
    setResources(updatedResources)
    setApplyTimelineOpen(false)
    try {
      await Promise.all(updatedResources.map((r) => updateResource(projectId, r)))
      toast.success("Timeline applied to all resources")
    } catch {
      toast.error("Failed to apply timeline")
    }
  }

  // Whether the form has uncommitted changes
  const isDirty =
    pendingTimeline.mode !== committedTimeline.mode ||
    pendingTimeline.start !== committedTimeline.start ||
    pendingTimeline.end !== committedTimeline.end ||
    pendingTimeline.durationValue !== committedTimeline.durationValue ||
    pendingTimeline.durationUnit !== committedTimeline.durationUnit

  // Persist a timeline state to DB and update committed
  const doCommit = async (tl: TimelineState, newEffEnd: string) => {
    setCommittedTimeline(tl)
    await updateProject(projectId, {
      timeline_mode: tl.mode,
      timeline_start: tl.start || null,
      timeline_end: newEffEnd || null,
      timeline_duration_value: tl.durationValue,
      timeline_duration_unit: tl.durationUnit,
    } as Partial<Project>)
  }

  // Commit staged timeline — validates, checks for data loss, saves to DB
  const handleCommitTimeline = async () => {
    const newEnd = pendingEffectiveEnd
    if (!pendingTimeline.start || !newEnd) {
      toast.error("Please set both a start date and an end date.")
      return
    }
    if (newEnd <= pendingTimeline.start) {
      toast.error("End date must be after start date.")
      return
    }

    const prevEnd = effectiveTimelineEnd
    const isShrinking = prevEnd && newEnd < prevEnd

    if (isShrinking) {
      const ld = loadingDataRef.current
      const cutoff = periodType === "monthly"
        ? format(parseISO(newEnd), "yyyy-MM")
        : newEnd

      const affectedWithHours = ld.filter(l => {
        const key = periodType === "monthly" ? l.period_label.slice(0, 7) : l.period_label
        return key > cutoff && (l.hours || 0) > 0
      })

      if (affectedWithHours.length > 0) {
        const byPeriod: Record<string, number> = {}
        for (const l of affectedWithHours) {
          byPeriod[l.period_label] = (byPeriod[l.period_label] || 0) + l.hours
        }
        setGridTrimDialog({
          removedPeriods: Object.entries(byPeriod).map(([key, hours]) => ({ key, label: key, hours })),
          totalHours: affectedWithHours.reduce((a, b) => a + b.hours, 0),
          resourceCount: new Set(affectedWithHours.map(l => l.resource_id)).size,
          pendingToCommit: pendingTimeline,
          pendingEffectiveEnd: newEnd,
        })
        return
      }
    }

    // No data-loss conflict — commit immediately
    try {
      await doCommit(pendingTimeline, newEnd)
      if (isShrinking) {
        // no hours beyond cutoff but still shrinking — grid columns just disappear
      } else if (prevEnd && newEnd > prevEnd) {
        toast.info("Timeline extended — new periods are now available in the loading grid.")
      } else {
        toast.success("Timeline saved.")
      }
    } catch {
      toast.error("Failed to save timeline.")
    }
  }

  const handleResetTimeline = () => setPendingTimeline(committedTimeline)

  const handleTimelineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleCommitTimeline() }
    if (e.key === "Escape") { e.preventDefault(); handleResetTimeline() }
  }

  // Confirm grid trim — deletes loading data beyond new end, then commits pending timeline
  const confirmGridTrim = async () => {
    if (!gridTrimDialog) return
    const { totalHours, resourceCount, pendingToCommit, pendingEffectiveEnd: pendingEnd } = gridTrimDialog

    // Cutoff is the new (pending) effective end date
    const newEnd = pendingEnd || effectiveTimelineEnd || ""
    const cutoff = periodType === "monthly"
      ? format(parseISO(newEnd), "yyyy-MM")
      : newEnd

    // Collect ALL period labels beyond the cutoff (including zero-hour records)
    const allAffectedLabels = [
      ...new Set(
        loadingData
          .filter(l => {
            const key = periodType === "monthly" ? l.period_label.slice(0, 7) : l.period_label
            return key > cutoff
          })
          .map(l => l.period_label)
      ),
    ]

    setLoadingData(prev =>
      prev.filter(l => {
        const key = periodType === "monthly" ? l.period_label.slice(0, 7) : l.period_label
        return key <= cutoff
      })
    )
    setGridTrimDialog(null)

    try {
      if (allAffectedLabels.length > 0) {
        await deleteManyResourceLoading(projectId, allAffectedLabels)
      }
      toast.success(`Removed ${totalHours.toFixed(0)} hrs from ${resourceCount} resource${resourceCount !== 1 ? 's' : ''}`)
      // Now commit the pending timeline that triggered the trim
      if (pendingToCommit && pendingEnd) {
        await doCommit(pendingToCommit, pendingEnd)
      }
    } catch {
      toast.error("Failed to remove loading data")
    }
  }

  // Validation metrics
  const coverage = totalEstimatedHours > 0 ? (totals.grandTotal / totalEstimatedHours) * 100 : 0
  const shortfall = totalEstimatedHours - totals.grandTotal
  const recommendedWeeklyPace = timelineWeeks > 0 ? totalEstimatedHours / timelineWeeks : 0
  const currentWeeklyPace = timelineWeeks > 0 ? totals.grandTotal / timelineWeeks : 0

  const validationStatus =
    coverage >= 95
      ? { icon: "🟢", text: "Resource plan fully covers the estimated effort." }
      : coverage >= 85
      ? { icon: "🟡", text: "You are within 15% of target. Review before finalizing." }
      : { icon: "🔴", text: `You are ${Math.abs(shortfall).toFixed(1)} hours short. Add capacity or extend the timeline.` }

  const cardBorder =
    coverage >= 95
      ? "border-l-green-500"
      : coverage >= 85
      ? "border-l-yellow-500"
      : "border-l-red-500"

  const variance = totals.grandTotal - totalEstimatedHours
  const variancePercent = totalEstimatedHours > 0 ? (variance / totalEstimatedHours) * 100 : 0

  return (
    <TooltipProvider>
      <div className="space-y-10 pb-20">

        {/* ── Project Timeline ─────────────────────────────────── */}
        <section>
          <Card className="border-sidebar/20 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-sidebar" />
                  <CardTitle className="text-lg">Project Timeline</CardTitle>
                </div>
                {timelineStart && effectiveTimelineEnd && resources.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setApplyTimelineOpen(true)}
                    className="gap-2 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Apply Timeline to All Resources
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Amber banner — uncommitted changes */}
              {isDirty && (
                <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5">
                  <p className="text-sm text-amber-800">
                    You have unsaved timeline changes. Click <strong>Apply</strong> to update the grid, or <strong>Reset</strong> to discard.
                  </p>
                  <div className="flex shrink-0 gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetTimeline}
                      className="h-7 px-3 text-xs text-amber-700 hover:bg-amber-100"
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCommitTimeline}
                      className="h-7 px-3 text-xs bg-amber-600 text-white hover:bg-amber-700"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              )}

              {/* Mode toggle */}
              <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
                <Button
                  size="sm"
                  variant={pendingTimeline.mode === "range" ? "secondary" : "ghost"}
                  className="h-8 px-4 text-xs"
                  onClick={() => setPendingTimeline(prev => ({ ...prev, mode: "range" }))}
                >
                  Set by Date Range
                </Button>
                <Button
                  size="sm"
                  variant={pendingTimeline.mode === "duration" ? "secondary" : "ghost"}
                  className="h-8 px-4 text-xs"
                  onClick={() => setPendingTimeline(prev => ({ ...prev, mode: "duration" }))}
                >
                  Set by Duration
                </Button>
              </div>

              {/* Option A — Date Range */}
              {pendingTimeline.mode === "range" && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="tl-range-start">Start Date</Label>
                    <Input
                      id="tl-range-start"
                      type="date"
                      value={pendingTimeline.start}
                      onChange={(e) => setPendingTimeline(prev => ({ ...prev, start: e.target.value }))}
                      onKeyDown={handleTimelineKeyDown}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tl-range-end">End Date</Label>
                    <Input
                      id="tl-range-end"
                      type="date"
                      value={pendingTimeline.end}
                      min={pendingTimeline.start || undefined}
                      onChange={(e) => setPendingTimeline(prev => ({ ...prev, end: e.target.value }))}
                      onKeyDown={handleTimelineKeyDown}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Duration (calculated)</Label>
                    <div className="flex h-10 items-center rounded-md bg-muted px-3 text-sm text-muted-foreground">
                      {rangeDuration
                        ? `${rangeDuration.weeks} weeks / ${rangeDuration.months} months`
                        : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Option B — Duration */}
              {pendingTimeline.mode === "duration" && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="tl-dur-start">Start Date</Label>
                    <Input
                      id="tl-dur-start"
                      type="date"
                      value={pendingTimeline.start}
                      onChange={(e) => setPendingTimeline(prev => ({ ...prev, start: e.target.value }))}
                      onKeyDown={handleTimelineKeyDown}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tl-dur-value">Duration</Label>
                    <Input
                      id="tl-dur-value"
                      type="number"
                      min={1}
                      value={pendingTimeline.durationValue}
                      onChange={(e) =>
                        setPendingTimeline(prev => ({ ...prev, durationValue: Math.max(1, Number(e.target.value)) }))
                      }
                      onKeyDown={handleTimelineKeyDown}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tl-dur-unit">Unit</Label>
                    <Select
                      value={pendingTimeline.durationUnit}
                      onValueChange={(v) => setPendingTimeline(prev => ({ ...prev, durationUnit: v as "weeks" | "months" }))}
                    >
                      <SelectTrigger id="tl-dur-unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weeks">Weeks</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">End Date (calculated)</Label>
                    <div className="flex h-10 items-center rounded-md bg-muted px-3 text-sm text-muted-foreground">
                      {pendingEffectiveEnd
                        ? format(parseISO(pendingEffectiveEnd), "MMM d, yyyy")
                        : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Apply / Reset buttons */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleCommitTimeline}
                  disabled={!isDirty}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  Apply Timeline
                </Button>
                {isDirty && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetTimeline}
                    className="text-muted-foreground"
                  >
                    Reset
                  </Button>
                )}
              </div>

              {/* Committed summary line */}
              {timelineSummary && (
                <p className="rounded-md border border-[#1E2D45] bg-[#0F1922] px-4 py-2 text-sm text-muted-foreground">
                  Grid reflects{" "}
                  <strong className="text-foreground">{timelineSummary.weeks} weeks</strong>{" "}
                  ({timelineSummary.startStr} — {timelineSummary.endStr})
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── Resource Roster ───────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-sidebar" />
              <h2 className="text-xl font-bold">Resource Roster</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                {saving ? (
                  <>
                    <Save className="h-3 w-3 animate-pulse" /> Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-green-500" /> Saved
                  </>
                )}
              </div>
              <Button
                onClick={addResource}
                className="gap-2 bg-sidebar text-white hover:bg-sidebar-accent"
              >
                <Plus className="h-4 w-4" /> Add Resource
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-[#1E2D45] bg-[#111827] shadow-sm">
            <Table>
              <TableHeader className="bg-[#0D1526]">
                <TableRow>
                  <TableHead>Resource Name</TableHead>
                  <TableHead className="w-[180px]">Role</TableHead>
                  <TableHead className="w-[160px]">Location</TableHead>
                  <TableHead className="w-[110px]">Rate ($/hr)</TableHead>
                  <TableHead className="w-[170px]">Start Date</TableHead>
                  <TableHead className="w-[170px]">End Date</TableHead>
                  <TableHead className="w-[70px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((res) => {
                  const startErr = getDateError(res, 'start')
                  const endErr = getDateError(res, 'end')
                  return (
                    <TableRow key={res.id}>
                      <TableCell>
                        <Input
                          value={res.name}
                          onChange={(e) => handleResourceUpdate(res.id, { name: e.target.value })}
                          className="h-8 border-none bg-transparent focus-visible:ring-1"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={res.role || ""}
                          onValueChange={(v) => handleResourceUpdate(res.id, { role: v })}
                        >
                          <SelectTrigger className="h-8 border-none bg-transparent capitalize">
                            <SelectValue placeholder="Select role..." />
                          </SelectTrigger>
                          <SelectContent>
                            {rateCard.map((rc) => (
                              <SelectItem key={rc.id} value={rc.role_title}>
                                {rc.role_title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      {/* Location toggle (Feature 2) */}
                      <TableCell>
                        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5 w-fit">
                          <button
                            onClick={() => handleLocationToggle(res.id, 'onsite')}
                            className={`px-2.5 py-1 text-xs rounded transition-all ${
                              res.location !== 'offshore'
                                ? 'bg-[#1E2D45] shadow-sm text-blue-300 font-semibold'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Onsite
                          </button>
                          <button
                            onClick={() => handleLocationToggle(res.id, 'offshore')}
                            className={`px-2.5 py-1 text-xs rounded transition-all ${
                              res.location === 'offshore'
                                ? 'bg-[#1E2D45] shadow-sm text-emerald-300 font-semibold'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Offshore
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            value={res.rate_per_hour}
                            onChange={(e) => handleRateChange(res.id, Number(e.target.value))}
                            className={`h-8 border-none bg-transparent ${rateOverrides[res.id] ? 'text-amber-700' : ''}`}
                          />
                          {rateOverrides[res.id] && (
                            <Tooltip>
                              <TooltipTrigger className="absolute right-1 top-1/2 -translate-y-1/2">
                                <AlertTriangle className="h-3 w-3 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>Custom rate override</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      {/* Start Date (Feature 3) */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <Input
                            type="date"
                            value={res.allocation_start}
                            min={timelineStart || undefined}
                            max={effectiveTimelineEnd || undefined}
                            onChange={(e) =>
                              handleResourceUpdate(res.id, { allocation_start: e.target.value })
                            }
                            className={`h-8 border-none bg-transparent ${startErr ? 'border border-red-700 bg-red-900/20' : ''}`}
                          />
                          {startErr && <p className="text-[10px] text-red-600 px-1">{startErr}</p>}
                        </div>
                      </TableCell>
                      {/* End Date (Feature 3) */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <Input
                            type="date"
                            value={res.allocation_end}
                            min={res.allocation_start || timelineStart || undefined}
                            max={effectiveTimelineEnd || undefined}
                            onChange={(e) =>
                              handleResourceUpdate(res.id, { allocation_end: e.target.value })
                            }
                            className={`h-8 border-none bg-transparent ${endErr ? 'border border-red-300 bg-red-50' : ''}`}
                          />
                          {endErr && <p className="text-[10px] text-red-600 px-1">{endErr}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteId(res.id)}
                          className="text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {resources.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <Users className="h-8 w-8 text-muted-foreground opacity-20" />
                        <p className="text-sm text-muted-foreground">
                          No resources assigned to this project yet.
                        </p>
                        <Button onClick={addResource} variant="outline" size="sm">
                          Add First Resource
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* ── Loading Grid ──────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-sidebar" />
              <h2 className="text-xl font-bold">Loading Grid</h2>
            </div>
            <div className="flex items-center gap-3">
              {resources.length > 0 && periods.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFillAll}
                  className="gap-2 text-xs"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Auto-fill All ({defaultHours} hrs/{periodType === "weekly" ? "week" : "month"})
                </Button>
              )}
              <div className="flex rounded-lg bg-muted p-1">
                <Button
                  variant={periodType === "weekly" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handlePeriodTypeChange("weekly")}
                  className="h-8 px-4 text-xs shadow-sm"
                >
                  Weekly
                </Button>
                <Button
                  variant={periodType === "monthly" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handlePeriodTypeChange("monthly")}
                  className="h-8 px-4 text-xs shadow-sm"
                >
                  Monthly
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-[#1E2D45] bg-[#111827] shadow-sm">
            <table className="w-full border-collapse">
              <thead className="border-b border-[#1E2D45] bg-[#0D1526]">
                <tr>
                  <th className="sticky left-0 z-10 w-[220px] border-r border-[#1E2D45] bg-[#0D1526] p-3 text-left text-xs font-semibold text-muted-foreground">
                    Resource
                  </th>
                  {periods.map((p) => {
                    const outside = isOutsideTimeline(p.key)
                    return (
                      <th
                        key={p.key}
                        className={`min-w-[100px] border-r p-3 text-center text-xs font-semibold text-muted-foreground ${outside ? "bg-[#1E2D45] text-[#64748B]" : ""}`}
                      >
                        {p.label}
                        {outside && (
                          <div className="text-[9px] font-normal text-zinc-400">
                            outside timeline
                          </div>
                        )}
                      </th>
                    )
                  })}
                  <th className="min-w-[100px] bg-[#1E2D45]/50 p-3 text-right text-xs font-bold text-sidebar">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {resources.map((res) => (
                  <tr key={res.id} className="border-b border-[#1E2D45] hover:bg-[#162032]/50">
                    <td className="sticky left-0 border-r border-[#1E2D45] bg-[#111827] p-3 text-sm font-medium">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{res.name}</span>
                          <span className={`shrink-0 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold ${res.location === 'offshore' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                            {res.location === 'offshore' ? 'OFF' : 'ON'}
                          </span>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleAutoFillRow(res.id)}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-50 hover:bg-muted hover:text-sidebar hover:opacity-100"
                            >
                              <Wand2 className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Auto-fill empty cells with {defaultHours} hrs
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                    {periods.map((p) => {
                      const loading = loadingData.find(
                        (l) => l.resource_id === res.id && l.period_label === p.key
                      )
                      const hours = loading?.hours || 0
                      const isOverloaded = hours > (periodType === "weekly" ? 45 : 180)
                      const outside = isOutsideTimeline(p.key)

                      const cellCls = [
                        "p-1 border-r text-center",
                        outside
                          ? "bg-[#1E2D45]/50"
                          : isOverloaded
                          ? "bg-red-50/50"
                          : hours > 0
                          ? "bg-blue-50/30"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")

                      return (
                        <td
                          key={p.key}
                          className={cellCls}
                          title={outside ? "Outside project timeline" : undefined}
                        >
                          <input
                            type="number"
                            min="0"
                            step="10"
                            value={hours || ""}
                            placeholder="0"
                            onChange={(e) =>
                              handleLoadingChange(res.id, p.key, Number(e.target.value))
                            }
                            onBlur={() => handleLoadingBlur(res.id, p.key)}
                            className={`h-8 w-full rounded border-none bg-transparent text-center text-sm tabular-nums focus:ring-1 focus:ring-sidebar ${outside ? "text-zinc-400 placeholder:text-zinc-300" : ""}`}
                          />
                        </td>
                      )
                    })}
                    <td className="bg-[#0D1526]/50 p-3 text-right text-sm font-bold tabular-nums">
                      {totals.rowTotals[res.id]?.toFixed(1) || "0.0"}
                    </td>
                  </tr>
                ))}
                {resources.length > 0 && (
                  <tr className="border-t-2 border-[#1E2D45] bg-[#0D1526] font-bold">
                    <td className="sticky left-0 border-r border-[#1E2D45] bg-[#0D1526] p-3 text-xs uppercase tracking-wider text-muted-foreground">
                      Total Hrs
                    </td>
                    {periods.map((p) => (
                      <td
                        key={p.key}
                        className="border-r p-3 text-center text-sm tabular-nums"
                      >
                        {totals.colTotals[p.key]?.toFixed(1) || "0.0"}
                      </td>
                    ))}
                    <td className="p-3 text-right text-lg font-black tabular-nums text-sidebar">
                      {totals.grandTotal.toFixed(1)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {resources.length === 0 && (
              <div className="flex h-24 items-center justify-center text-sm italic text-muted-foreground">
                Add resources to the roster above to enable the loading grid.
              </div>
            )}
          </div>
        </section>

        {/* ── Validation Panel ──────────────────────────────────── */}
        <section>
          <Card className={`border-l-4 ${cardBorder}`}>
            <CardContent className="pt-6 space-y-6">
              {timelineWeeks > 0 ? (
                <>
                  {/* Top row — 3 key metrics */}
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Project Timeline
                      </p>
                      <p className="text-2xl font-bold">{timelineWeeks} weeks</p>
                      {timelineSummary && (
                        <p className="text-xs text-muted-foreground">
                          {timelineSummary.startStr} — {timelineSummary.endStr}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Total Estimated Hours
                      </p>
                      <p className="text-2xl font-bold">
                        {totalEstimatedHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                      </p>
                      {wbsConfidenceHours > 0 && (
                        <p className="text-xs text-muted-foreground">
                          incl. +{wbsConfidenceHours.toFixed(1)} hrs contingency
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Total Hours Loaded
                      </p>
                      <p className="text-2xl font-bold">
                        {totals.grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} hrs
                      </p>
                    </div>
                  </div>

                  <Separator className="opacity-50" />

                  {/* Bottom row — pace metrics */}
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Coverage
                      </p>
                      <p className="text-2xl font-bold">{coverage.toFixed(1)}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Recommended Weekly Pace
                      </p>
                      <p className="text-2xl font-bold">{recommendedWeeklyPace.toFixed(1)} hrs/wk</p>
                      <p className="text-xs text-muted-foreground">
                        estimated ÷ {timelineWeeks} weeks
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Current Weekly Pace
                      </p>
                      <p className="text-2xl font-bold">{currentWeeklyPace.toFixed(1)} hrs/wk</p>
                      <p className="text-xs text-muted-foreground">
                        loaded ÷ {timelineWeeks} weeks
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                /* Fallback — no timeline set */
                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Overhead Plan Target
                    </p>
                    <p className="text-2xl font-bold">{totalEstimatedHours.toFixed(1)} hrs</p>
                    {wbsConfidenceHours > 0 && (
                      <p className="text-xs text-muted-foreground">
                        WBS contingency: +{wbsConfidenceHours.toFixed(1)} hrs
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Planned Capacity (Grid)
                    </p>
                    <p className="text-2xl font-bold">{totals.grandTotal.toFixed(1)} hrs</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Variance
                    </p>
                    <p
                      className={`text-2xl font-bold ${Math.abs(variancePercent) <= 5 ? "text-green-600" : "text-red-600"}`}
                    >
                      {variance > 0 ? "+" : ""}
                      {variance.toFixed(1)} hrs ({variancePercent.toFixed(1)}%)
                    </p>
                  </div>
                </div>
              )}

              <Separator className="opacity-50" />

              {/* Status line */}
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-xl">{validationStatus.icon}</span>
                <div className="space-y-1">
                  <p className="font-semibold">{validationStatus.text}</p>
                  <p className="text-sm text-muted-foreground">
                    Your resource plan covers{" "}
                    {((totals.grandTotal / (totalEstimatedHours || 1)) * 100).toFixed(1)}% of the
                    estimated effort.
                  </p>
                </div>
              </div>

              {/* Team Composition (Feature 5) */}
              {resources.length > 0 && (
                <>
                  <Separator className="opacity-50" />
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-sidebar" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Team Composition
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Onsite</p>
                        <p className="text-xl font-bold">
                          {teamComposition.onsite}{" "}
                          <span className="text-sm font-normal text-muted-foreground">
                            resource{teamComposition.onsite !== 1 ? "s" : ""}
                          </span>
                        </p>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {teamComposition.onsiteHours.toFixed(0)} hrs · ${teamComposition.onsiteCost.toLocaleString('en-US')}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Offshore</p>
                        <p className="text-xl font-bold">
                          {teamComposition.offshore}{" "}
                          <span className="text-sm font-normal text-muted-foreground">
                            resource{teamComposition.offshore !== 1 ? "s" : ""}
                          </span>
                        </p>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          {teamComposition.offshoreHours.toFixed(0)} hrs · ${teamComposition.offshoreCost.toLocaleString('en-US')}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Blended Rate</p>
                        <p className="text-xl font-bold">
                          ${teamComposition.blendedRate.toFixed(2)}<span className="text-sm font-normal">/hr</span>
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Total Cost</p>
                        <p className="text-xl font-bold">
                          ${teamComposition.totalCost.toLocaleString('en-US')}
                        </p>
                      </div>
                    </div>

                    {/* Stacked bar */}
                    {teamComposition.totalHours > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex h-4 overflow-hidden rounded-full bg-[#1E2D45]">
                          <div
                            className="bg-blue-500 transition-all"
                            style={{ width: `${(teamComposition.onsiteHours / teamComposition.totalHours) * 100}%` }}
                          />
                          <div
                            className="bg-emerald-400 transition-all"
                            style={{ width: `${(teamComposition.offshoreHours / teamComposition.totalHours) * 100}%` }}
                          />
                        </div>
                        <div className="flex gap-5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                            Onsite {teamComposition.totalHours > 0 ? ((teamComposition.onsiteHours / teamComposition.totalHours) * 100).toFixed(0) : 0}%
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                            Offshore {teamComposition.totalHours > 0 ? ((teamComposition.offshoreHours / teamComposition.totalHours) * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Delete resource dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove resource?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this team member and all their loaded hours from the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={removeResource}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apply timeline dialog */}
      <AlertDialog open={applyTimelineOpen} onOpenChange={setApplyTimelineOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply timeline to all resources?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the allocation dates for all {resources.length} resource
              {resources.length !== 1 ? "s" : ""} to match the project timeline (
              {timelineSummary?.startStr} — {timelineSummary?.endStr}). Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApplyTimeline}
              className="bg-sidebar text-white hover:bg-sidebar-accent"
            >
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Location switch confirmation dialog (Feature 2) */}
      <AlertDialog open={!!locationSwitchPending} onOpenChange={(open) => !open && setLocationSwitchPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to standard rate?</AlertDialogTitle>
            <AlertDialogDescription>
              Switch to the standard{" "}
              <strong className="capitalize">{locationSwitchPending?.targetLocation}</strong>{" "}
              rate (${locationSwitchPending?.standardRate}/hr) for{" "}
              <strong>
                {resources.find(r => r.id === locationSwitchPending?.resourceId)?.role || "this role"}
              </strong>
              ?{" "}
              This will replace your custom rate of ${locationSwitchPending?.currentRate}/hr.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => confirmLocationSwitch(false)}>
              Keep Custom Rate (${locationSwitchPending?.currentRate}/hr)
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmLocationSwitch(true)}
              className="bg-sidebar text-white hover:bg-sidebar-accent"
            >
              Use Standard Rate (${locationSwitchPending?.standardRate}/hr)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grid trim confirmation dialog (Feature 7) */}
      <AlertDialog open={!!gridTrimDialog} onOpenChange={(open) => !open && setGridTrimDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove loading data?</AlertDialogTitle>
            <AlertDialogDescription>
              Shrinking the timeline will remove{" "}
              {gridTrimDialog?.totalHours.toFixed(0)} hours from{" "}
              {gridTrimDialog?.resourceCount} resource{gridTrimDialog?.resourceCount !== 1 ? "s" : ""}{" "}
              loaded in those periods. Confirm to delete that data, or cancel to keep the current timeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmGridTrim}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Period type switch confirmation dialog */}
      <AlertDialog open={!!periodSwitchPending} onOpenChange={(open) => !open && setPeriodSwitchPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear existing loading data?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching from <strong className="capitalize">{periodType}</strong> to <strong className="capitalize">{periodSwitchPending}</strong> will clear all currently entered resource loading hours.
              This is because Weekly and Monthly estimates are maintained separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => periodSwitchPending && commitPeriodTypeChange(periodSwitchPending)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Clear Data & Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
