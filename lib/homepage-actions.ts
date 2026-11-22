import { getDb } from "@/lib/db"

const COST_SUBQUERY = `
  COALESCE((
    SELECT SUM(rl.hours * r.rate_per_hour)
    FROM resources r
    LEFT JOIN resource_loading rl ON r.id = rl.resource_id
    WHERE r.project_id = p.id
    AND (
      (COALESCE(p.loading_period_type, 'weekly') = 'weekly' AND length(rl.period_label) = 10) OR
      (p.loading_period_type = 'monthly' AND length(rl.period_label) = 7)
    )
  ), 0)
`

export interface EstimatorStats {
  activeEstimates: number
  submitted: number
  dueThisWeek: number
}

export interface TrackerStats {
  activeProjects: number
  atRisk: number
  needsAttention: number
  onTrack: number
}

export interface PipelineStats {
  activePursuits: number
  totalValue: number
  weightedForecast: number
  winRateYTD: number
}

export interface HomepageAlert {
  severity: 'red' | 'amber'
  projectName: string
  text: string
  date: string | null
  url: string
}

export interface ActivityItem {
  projectName: string
  projectId: string
  action: string
  timestamp: string
  url: string
}

export function getEstimatorStats(): EstimatorStats {
  try {
    const db = getDb()
    const activeEstimates = (db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'draft'").get() as any).c
    const submitted = (db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'submitted'").get() as any).c
    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const dueThisWeek = (db.prepare(`
      SELECT COUNT(*) as c FROM projects
      WHERE status IN ('draft','submitted')
        AND timeline_end IS NOT NULL AND timeline_end <= ?
    `).get(sevenDays) as any).c
    return { activeEstimates, submitted, dueThisWeek }
  } catch {
    return { activeEstimates: 0, submitted: 0, dueThisWeek: 0 }
  }
}

export function getTrackerStats(): TrackerStats {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT tp.id, tp.project_id, tp.baseline_total_cost, tp.baseline_total_hours
      FROM tracker_projects tp
      JOIN projects p ON tp.project_id = p.id
      WHERE p.project_status = 'in_progress'
    `).all() as any[]

    const burnMap: Record<string, number> = {}
    for (const b of db.prepare(`
      SELECT tracker_project_id, COALESCE(SUM(total_hours), 0) as total_hours
      FROM period_burns WHERE is_submitted = 1 GROUP BY tracker_project_id
    `).all() as any[]) burnMap[b.tracker_project_id] = b.total_hours

    const billingOverdue = new Set<string>()
    const billingAtRisk = new Set<string>()
    for (const b of db.prepare(`
      SELECT project_id,
        SUM(CASE WHEN invoice_status NOT IN ('invoiced','paid')
          AND planned_date < date('now') AND revised_date IS NULL THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN invoice_status NOT IN ('invoiced','paid') AND (
          (revised_date IS NULL AND planned_date >= date('now') AND julianday(planned_date) - julianday('now') <= 7) OR
          (revised_date IS NOT NULL AND revised_date >= date('now') AND julianday(revised_date) - julianday('now') <= 7)
        ) THEN 1 ELSE 0 END) as at_risk_count
      FROM billing_milestones GROUP BY project_id
    `).all() as any[]) {
      if (b.overdue_count > 0) billingOverdue.add(b.project_id)
      if (b.at_risk_count > 0) billingAtRisk.add(b.project_id)
    }

    let atRisk = 0, needsAttention = 0, onTrack = 0
    for (const row of rows) {
      const totalHours = burnMap[row.id] || 0
      const blendedRate = row.baseline_total_hours > 0 ? row.baseline_total_cost / row.baseline_total_hours : 0
      const actualCost = totalHours * blendedRate
      const budgetPct = row.baseline_total_cost > 0 ? (actualCost / row.baseline_total_cost) * 100 : 0
      if (budgetPct > 85 || billingOverdue.has(row.project_id)) atRisk++
      else if (budgetPct > 70 || billingAtRisk.has(row.project_id)) needsAttention++
      else onTrack++
    }

    return { activeProjects: rows.length, atRisk, needsAttention, onTrack }
  } catch {
    return { activeProjects: 0, atRisk: 0, needsAttention: 0, onTrack: 0 }
  }
}

export function getPipelineStats(): PipelineStats {
  try {
    const db = getDb()
    const pipeline = db.prepare(`
      SELECT COALESCE(p.win_probability, 50) as win_probability,
        ${COST_SUBQUERY} as quoted_price
      FROM projects p
      WHERE p.status IN ('draft', 'submitted')
    `).all() as { win_probability: number; quoted_price: number }[]

    const totalValue = pipeline.reduce((s, p) => s + p.quoted_price, 0)
    const weightedForecast = pipeline.reduce((s, p) => s + p.quoted_price * (p.win_probability / 100), 0)

    const wonCount = (db.prepare(`
      SELECT COUNT(*) as c FROM projects
      WHERE status = 'won' AND strftime('%Y', updated_at) = strftime('%Y', 'now')
    `).get() as any).c
    const lostCount = (db.prepare(`
      SELECT COUNT(*) as c FROM projects
      WHERE status = 'lost' AND strftime('%Y', updated_at) = strftime('%Y', 'now')
    `).get() as any).c
    const winRateYTD = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0

    return { activePursuits: pipeline.length, totalValue, weightedForecast, winRateYTD }
  } catch {
    return { activePursuits: 0, totalValue: 0, weightedForecast: 0, winRateYTD: 0 }
  }
}

export function getHomepageAlerts(): HomepageAlert[] {
  try {
    const db = getDb()
    const alerts: HomepageAlert[] = []
    const today = new Date().toISOString().split('T')[0]
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Overdue billing milestones
    for (const b of db.prepare(`
      SELECT bm.title as alert_title, p.name as project_name, p.id as project_id,
             bm.planned_date, tp.id as tracker_id
      FROM billing_milestones bm
      JOIN projects p ON p.id = bm.project_id
      LEFT JOIN tracker_projects tp ON tp.project_id = p.id
      WHERE bm.invoice_status = 'not_invoiced'
        AND bm.planned_date < ?
        AND bm.revised_date IS NULL
      ORDER BY bm.planned_date ASC
      LIMIT 3
    `).all(today) as any[]) {
      alerts.push({
        severity: 'red',
        projectName: b.project_name,
        text: `Billing milestone "${b.alert_title}" overdue`,
        date: b.planned_date,
        url: b.tracker_id ? `/tracker/projects/${b.tracker_id}/billing` : `/projects/${b.project_id}`,
      })
    }

    // Submitted bids with no client response in 30+ days
    for (const p of db.prepare(`
      SELECT p.name, p.id, p.updated_at FROM projects p
      WHERE p.status = 'submitted' AND p.updated_at < ?
      ORDER BY p.updated_at ASC LIMIT 3
    `).all(thirtyDaysAgo) as any[]) {
      alerts.push({
        severity: 'red',
        projectName: p.name,
        text: 'Submitted bid — follow up with client',
        date: p.updated_at,
        url: `/projects/${p.id}/commercials`,
      })
    }

    // Active tracker projects with no actuals in 14 days
    for (const p of db.prepare(`
      SELECT tp.id as tracker_id, p.name, p.id as project_id, MAX(pb.created_at) as last_actuals
      FROM tracker_projects tp
      JOIN projects p ON p.id = tp.project_id
      LEFT JOIN period_burns pb ON pb.tracker_project_id = tp.id
      WHERE p.project_status = 'in_progress'
      GROUP BY tp.id
      HAVING last_actuals IS NULL OR last_actuals < ?
      LIMIT 3
    `).all(fourteenDaysAgo) as any[]) {
      alerts.push({
        severity: 'amber',
        projectName: p.name,
        text: 'No actuals logged in 14+ days',
        date: p.last_actuals,
        url: `/tracker/projects/${p.tracker_id}/actuals`,
      })
    }

    // Stale submitted estimates (45+ days)
    for (const p of db.prepare(`
      SELECT p.id, p.name, p.updated_at FROM projects p
      WHERE p.status = 'submitted' AND p.updated_at < ?
      LIMIT 2
    `).all(fortyFiveDaysAgo) as any[]) {
      alerts.push({
        severity: 'amber',
        projectName: p.name,
        text: 'Submitted 45+ days ago — update status',
        date: p.updated_at,
        url: `/projects/${p.id}`,
      })
    }

    return alerts
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'red' ? -1 : 1
        return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
      })
      .slice(0, 8)
  } catch {
    return []
  }
}

export function getRecentActivity(): ActivityItem[] {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM (
        SELECT p.id as project_id, p.name as project_name,
               'Estimate updated' as action,
               p.updated_at as timestamp,
               '/projects/' || p.id || '/estimate' as url
        FROM projects p
        UNION ALL
        SELECT p.id as project_id, p.name as project_name,
               'Project kicked off' as action,
               tp.kicked_off_at as timestamp,
               '/tracker/projects/' || tp.id as url
        FROM tracker_projects tp
        JOIN projects p ON tp.project_id = p.id
        UNION ALL
        SELECT p.id as project_id, p.name as project_name,
               'Actuals logged (' || pb.period_label || ')' as action,
               pb.created_at as timestamp,
               '/tracker/projects/' || tp.id || '/actuals' as url
        FROM period_burns pb
        JOIN tracker_projects tp ON tp.id = pb.tracker_project_id
        JOIN projects p ON tp.project_id = p.id
        UNION ALL
        SELECT p.id as project_id, p.name as project_name,
               'Status report created' as action,
               sr.created_at as timestamp,
               '/tracker/projects/' || tp.id as url
        FROM status_reports sr
        JOIN tracker_projects tp ON tp.id = sr.tracker_project_id
        JOIN projects p ON tp.project_id = p.id
      )
      WHERE timestamp IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 8
    `).all() as any[]

    return rows.map(r => ({
      projectName: r.project_name,
      projectId: r.project_id,
      action: r.action,
      timestamp: r.timestamp,
      url: r.url,
    }))
  } catch {
    return []
  }
}
