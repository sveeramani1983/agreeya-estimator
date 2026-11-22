"use server"

import { getDb } from "@/lib/db"
import { v4 as uuidv4 } from "uuid"
import { revalidatePath } from "next/cache"
import type { WBSComponent, ComponentWithActual } from "@/lib/types"

// ── Component Actuals ─────────────────────────────────────────────────────────

export async function getComponentActuals(
  trackerId: string,
  estimatorProjectId: string
): Promise<ComponentWithActual[]> {
  try {
    const db = getDb()
    const components = db.prepare(`
      SELECT * FROM wbs_components
      WHERE project_id = ?
      ORDER BY category ASC, sort_order ASC
    `).all(estimatorProjectId) as WBSComponent[]

    const actuals = db.prepare(`
      SELECT * FROM component_actuals WHERE tracker_project_id = ?
    `).all(trackerId) as any[]

    return components
      .filter(c => c.complexity !== "spike" && c.base_hours > 0)
      .map(comp => {
        const actual = actuals.find(a => a.wbs_component_id === comp.id)
        const actualHours = actual?.actual_hours ?? 0
        const isComplete = actual ? actual.is_complete === 1 : false
        const hasRecord = !!actual

        const status: 'complete' | 'in_progress' | 'not_started' =
          isComplete ? 'complete'
          : hasRecord ? 'in_progress'
          : 'not_started'

        const remaining =
          isComplete ? 0
          : status === 'in_progress' ? Math.max(0, comp.base_hours - actualHours)
          : comp.base_hours

        const variance = actualHours - comp.base_hours
        const variancePct = comp.base_hours > 0 ? (variance / comp.base_hours) * 100 : 0

        return {
          ...comp,
          actual_hours: actualHours,
          is_complete: isComplete,
          as_of_date: actual?.as_of_date ?? null,
          notes: actual?.notes ?? null,
          variance,
          variance_percent: variancePct,
          status,
          remaining,
        }
      })
  } catch { return [] }
}

export async function saveComponentActuals(
  trackerId: string,
  actuals: {
    wbs_component_id: string
    actual_hours: number
    is_complete: boolean
    notes?: string
  }[],
  asOfDate: string
): Promise<void> {
  const db = getDb()

  const upsert = db.prepare(`
    INSERT INTO component_actuals
      (id, tracker_project_id, wbs_component_id, actual_hours, is_complete, as_of_date, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(tracker_project_id, wbs_component_id)
    DO UPDATE SET
      actual_hours = excluded.actual_hours,
      is_complete  = excluded.is_complete,
      as_of_date   = excluded.as_of_date,
      notes        = excluded.notes,
      updated_at   = CURRENT_TIMESTAMP
  `)

  db.transaction(() => {
    for (const a of actuals) {
      upsert.run(
        uuidv4(),
        trackerId,
        a.wbs_component_id,
        a.actual_hours,
        a.is_complete ? 1 : 0,
        asOfDate,
        a.notes ?? null
      )
    }
  })()

  const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(trackerId) as any
  if (tp) {
    revalidatePath(`/tracker/projects/${tp.project_id}/comparison`)
    revalidatePath(`/tracker/projects/${tp.project_id}/overview`)
  }
}

export async function getUnallocatedHours(trackerId: string): Promise<number> {
  try {
    const db = getDb()
    const periodTotal = db.prepare(`
      SELECT COALESCE(SUM(total_hours), 0) as total
      FROM period_burns WHERE tracker_project_id = ?
    `).get(trackerId) as { total: number }

    const componentTotal = db.prepare(`
      SELECT COALESCE(SUM(actual_hours), 0) as total
      FROM component_actuals WHERE tracker_project_id = ?
    `).get(trackerId) as { total: number }

    return Math.max(0, periodTotal.total - componentTotal.total)
  } catch { return 0 }
}

export async function getPeriodBurnsTotal(trackerId: string): Promise<number> {
  try {
    const db = getDb()
    const row = db.prepare(`
      SELECT COALESCE(SUM(total_hours), 0) as total
      FROM period_burns WHERE tracker_project_id = ? AND is_submitted = 1
    `).get(trackerId) as { total: number }
    return row.total
  } catch { return 0 }
}

// ── Component Health for Overview ─────────────────────────────────────────────

export interface ComponentHealthSummary {
  complete: number
  atRisk: number
  inProgress: number
  notStarted: number
  total: number
  topAtRisk: { name: string; variancePct: number }[]
  latestAsOfDate: string | null
}

export async function getComponentHealthSummary(
  trackerId: string,
  estimatorProjectId: string
): Promise<ComponentHealthSummary> {
  try {
    const components = await getComponentActuals(trackerId, estimatorProjectId)
    const complete   = components.filter(c => c.status === 'complete').length
    const inProgress = components.filter(c => c.status === 'in_progress').length
    const notStarted = components.filter(c => c.status === 'not_started').length
    const atRisk     = components.filter(c => c.variance_percent > 10 && c.status !== 'not_started').length

    const topAtRisk = components
      .filter(c => c.variance_percent > 10 && c.status !== 'not_started')
      .sort((a, b) => b.variance_percent - a.variance_percent)
      .slice(0, 2)
      .map(c => ({ name: c.component_name, variancePct: c.variance_percent }))

    const dates = components
      .filter(c => c.as_of_date)
      .map(c => c.as_of_date as string)
    const latestAsOfDate = dates.length > 0 ? dates.sort().reverse()[0] : null

    return { complete, atRisk, inProgress, notStarted, total: components.length, topAtRisk, latestAsOfDate }
  } catch {
    return { complete: 0, atRisk: 0, inProgress: 0, notStarted: 0, total: 0, topAtRisk: [], latestAsOfDate: null }
  }
}

// ── Portfolio Analytics ───────────────────────────────────────────────────────

export interface ComponentAccuracyByCategory {
  category: string
  avgEst: number
  avgActual: number
  variancePct: number
  sampleCount: number
}

export async function getComponentAccuracyByCategory(): Promise<ComponentAccuracyByCategory[]> {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        c.category,
        AVG(c.base_hours)      AS avg_est,
        AVG(ca.actual_hours)   AS avg_actual,
        COUNT(*)               AS sample_count
      FROM component_actuals ca
      JOIN wbs_components c ON ca.wbs_component_id = c.id
      WHERE ca.actual_hours > 0
      GROUP BY c.category
      ORDER BY COUNT(*) DESC
    `).all() as any[]

    return rows.map(r => ({
      category: r.category,
      avgEst: Math.round(r.avg_est * 10) / 10,
      avgActual: Math.round(r.avg_actual * 10) / 10,
      variancePct: r.avg_est > 0 ? Math.round(((r.avg_actual - r.avg_est) / r.avg_est) * 100) : 0,
      sampleCount: r.sample_count,
    }))
  } catch { return [] }
}

export interface CalibrationSuggestion {
  libraryId: string
  componentName: string
  category: string
  currentHours: number
  suggestedHours: number
  variancePct: number
  sampleCount: number
}

export async function getCalibrationSuggestions(): Promise<CalibrationSuggestion[]> {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        cl.id          AS library_id,
        c.component_name,
        c.category,
        cl.base_hours  AS current_hours,
        AVG(ca.actual_hours) AS avg_actual,
        COUNT(*)       AS sample_count
      FROM component_actuals ca
      JOIN wbs_components c  ON ca.wbs_component_id = c.id
      JOIN component_library cl
        ON cl.component_name = c.component_name
       AND cl.category       = c.category
      WHERE ca.actual_hours > 0
      GROUP BY cl.id, c.component_name, c.category, cl.base_hours
      HAVING COUNT(*) >= 1
         AND ABS((AVG(ca.actual_hours) - cl.base_hours) / cl.base_hours) > 0.15
      ORDER BY ABS((AVG(ca.actual_hours) - cl.base_hours) / cl.base_hours) DESC
      LIMIT 10
    `).all() as any[]

    return rows.map(r => ({
      libraryId: r.library_id,
      componentName: r.component_name,
      category: r.category,
      currentHours: Math.round(r.current_hours),
      suggestedHours: Math.round(r.avg_actual),
      variancePct: r.current_hours > 0
        ? Math.round(((r.avg_actual - r.current_hours) / r.current_hours) * 100)
        : 0,
      sampleCount: r.sample_count,
    }))
  } catch { return [] }
}

export async function applyCalibration(updates: { libraryId: string; newHours: number }[]): Promise<void> {
  const db = getDb()
  const stmt = db.prepare("UPDATE component_library SET base_hours = ? WHERE id = ?")
  db.transaction(() => {
    for (const u of updates) stmt.run(u.newHours, u.libraryId)
  })()
  revalidatePath("/tracker/analytics")
  revalidatePath("/projects")
}
