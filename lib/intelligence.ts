import { getDb } from './db'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalibrationSuggestion {
  libraryId: string
  componentName: string
  category: string
  complexity: string
  currentEstimate: number
  avgActual: number
  minActual: number
  maxActual: number
  sampleCount: number
  variancePercent: number
  direction: 'over' | 'under'
  suggestedHours: number
  confidence: 'high' | 'medium' | 'low'
}

export interface ClientIntelligence {
  clientId: string
  totalPursued: number
  won: number
  lost: number
  winRate: number | null
  avgWinMargin: number | null
  avgWinValue: number | null
  topLossReason: string | undefined
  marginSuggestion: number | null
  pricingMessage: string
  lastEngagement: string | null
}

export interface SimilarProject {
  projectId: string
  projectName: string
  clientName: string
  status: string
  quotedPrice: number
  marginPercent: number
  componentCount: number
  totalHours: number
  similarityScore: number
  avgActualsVariance: number | null
}

export interface CapacityAnalysis {
  committedResources: number
  availableCapacity: number
  pipelineDemand: {
    maximum: number
    weighted: number
  }
  capacityGap: number
  monthlyBreakdown: Array<{
    month: string
    demand: number
    gap: number
  }>
  activeProjects: number
  pipelineDeals: number
}

export interface BidPrediction {
  predictedProbability: number | null
  confidence: 'high' | 'medium' | 'low' | 'insufficient_data'
  message: string
  historicalWinRate: number | null
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000

export function getCached<T>(key: string, calculator: () => T): T {
  const cached = cache.get(key)
  const now = Date.now()
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data as T
  }
  const data = calculator()
  cache.set(key, { data, timestamp: now })
  return data
}

export function invalidateCache(key?: string) {
  if (key) cache.delete(key)
  else cache.clear()
}

// ── COST_SUBQUERY ─────────────────────────────────────────────────────────────
// Matches the same pattern used in lib/actions.ts for consistent pricing

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

// ── Function 1: getCalibrationSuggestions ────────────────────────────────────

export async function getCalibrationSuggestions(): Promise<CalibrationSuggestion[]> {
  try {
    const db = getDb()

    const results = db.prepare(`
      SELECT
        cl.id as library_id,
        cl.component_name,
        cl.category,
        cl.complexity,
        cl.base_hours as current_estimate,
        AVG(ca.actual_hours) as avg_actual,
        MIN(ca.actual_hours) as min_actual,
        MAX(ca.actual_hours) as max_actual,
        COUNT(ca.id) as sample_count,
        ROUND(
          (AVG(ca.actual_hours) - cl.base_hours)
          / cl.base_hours * 100,
          1
        ) as variance_percent
      FROM component_library cl
      JOIN wbs_components wc
        ON LOWER(TRIM(wc.component_name)) =
           LOWER(TRIM(cl.component_name))
        AND wc.category = cl.category
      JOIN component_actuals ca
        ON ca.wbs_component_id = wc.id
        AND ca.actual_hours > 0
      WHERE ca.is_complete = 1
      GROUP BY cl.id, cl.component_name,
               cl.category, cl.base_hours
      HAVING COUNT(ca.id) >= 3
        AND ABS(
          (AVG(ca.actual_hours) - cl.base_hours)
          / cl.base_hours * 100
        ) > 15
      ORDER BY ABS(variance_percent) DESC
    `).all() as any[]

    return results.map(r => ({
      libraryId: r.library_id,
      componentName: r.component_name,
      category: r.category,
      complexity: r.complexity,
      currentEstimate: r.current_estimate,
      avgActual: Math.round(r.avg_actual),
      minActual: r.min_actual,
      maxActual: r.max_actual,
      sampleCount: r.sample_count,
      variancePercent: r.variance_percent,
      direction: r.variance_percent > 0 ? 'over' : 'under',
      suggestedHours: Math.round(r.avg_actual),
      confidence: r.sample_count >= 5 ? 'high' : r.sample_count >= 3 ? 'medium' : 'low',
    }))
  } catch { return [] }
}

// ── Function 2: getClientIntelligence ────────────────────────────────────────

export async function getClientIntelligence(clientId: string): Promise<ClientIntelligence> {
  try {
    const db = getDb()

    const history = db.prepare(`
      SELECT
        p.status,
        p.outcome_data,
        COALESCE((
          SELECT cc.margin_percent FROM commercials_config cc WHERE cc.project_id = p.id
        ), 0) as margin,
        ${COST_SUBQUERY.replace(/p\.id/g, 'p.id').replace(/p\.loading_period_type/g, 'p.loading_period_type')} as value,
        p.updated_at
      FROM projects p
      WHERE p.client_id = ?
        AND p.status IN ('won', 'lost')
      ORDER BY p.updated_at DESC
    `).all(clientId) as any[]

    const won = history.filter(h => h.status === 'won')
    const lost = history.filter(h => h.status === 'lost')

    const winRate = history.length > 0 ? (won.length / history.length) * 100 : null
    const avgWinMargin = won.length > 0
      ? won.reduce((sum, w) => sum + w.margin, 0) / won.length
      : null
    const avgWinValue = won.length > 0
      ? won.reduce((sum, w) => sum + w.value, 0) / won.length
      : null

    const lossReasons = lost
      .map(l => {
        try { return JSON.parse(l.outcome_data || '{}').lossReasons || [] }
        catch { return [] }
      })
      .flat()

    const reasonCounts = lossReasons.reduce(
      (acc: Record<string, number>, r: string) => { acc[r] = (acc[r] || 0) + 1; return acc },
      {}
    )
    const topLossReason = Object.entries(reasonCounts).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0]

    let marginSuggestion: number | null = null
    let pricingMessage = ''

    if (winRate === null) {
      pricingMessage = 'No history with this client yet.'
    } else if (winRate >= 70 && avgWinMargin) {
      marginSuggestion = avgWinMargin
      pricingMessage =
        `Strong relationship (${Math.round(winRate)}% win rate). ` +
        `Your winning margin of ${avgWinMargin.toFixed(1)}% works well here.`
    } else if (topLossReason === 'price_too_high' && avgWinMargin) {
      marginSuggestion = Math.max(avgWinMargin - 2, 10)
      pricingMessage = `Last loss was on price. Consider reducing margin by 2% to stay competitive.`
    } else if (winRate < 40 && avgWinMargin) {
      marginSuggestion = avgWinMargin - 1
      pricingMessage = `Win rate is low (${Math.round(winRate)}%). Review approach and pricing strategy.`
    } else if (avgWinMargin) {
      marginSuggestion = avgWinMargin
      pricingMessage = `Based on ${won.length} past wins with this client.`
    }

    return {
      clientId,
      totalPursued: history.length,
      won: won.length,
      lost: lost.length,
      winRate,
      avgWinMargin,
      avgWinValue,
      topLossReason,
      marginSuggestion,
      pricingMessage,
      lastEngagement: history[0]?.updated_at || null,
    }
  } catch {
    return {
      clientId,
      totalPursued: 0,
      won: 0,
      lost: 0,
      winRate: null,
      avgWinMargin: null,
      avgWinValue: null,
      topLossReason: undefined,
      marginSuggestion: null,
      pricingMessage: '',
      lastEngagement: null,
    }
  }
}

// ── Function 3: getSimilarProjects ────────────────────────────────────────────

export async function getSimilarProjects(projectId: string): Promise<SimilarProject[]> {
  try {
    const db = getDb()

    const current = db.prepare(`
      SELECT
        p.*,
        COUNT(wc.id) as component_count,
        ${COST_SUBQUERY} as value
      FROM projects p
      LEFT JOIN wbs_components wc ON wc.project_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `).get(projectId) as any

    if (!current) return []

    const minValue = current.value * 0.5
    const maxValue = current.value * 1.5

    const similar = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.client_name,
        p.vertical,
        p.service_line,
        p.status,
        COALESCE((
          SELECT cc.margin_percent FROM commercials_config cc WHERE cc.project_id = p.id
        ), 0) as margin_percent,
        COUNT(wc.id) as component_count,
        COALESCE(SUM(wc.base_hours), 0) as total_hours,
        ${COST_SUBQUERY} as quoted_price,
        (
          CASE WHEN p.vertical = ? THEN 30 ELSE 0 END +
          CASE WHEN p.service_line = ? THEN 30 ELSE 0 END +
          CASE WHEN (${COST_SUBQUERY}) BETWEEN ? AND ? THEN 20 ELSE 0 END +
          CASE WHEN p.status = 'won' THEN 20 ELSE 0 END
        ) as similarity_score
      FROM projects p
      LEFT JOIN wbs_components wc ON wc.project_id = p.id
      WHERE p.id != ?
        AND p.status IN ('won', 'lost')
      GROUP BY p.id
      HAVING similarity_score >= 30
      ORDER BY similarity_score DESC, p.updated_at DESC
      LIMIT 3
    `).all(
      current.vertical,
      current.service_line,
      minValue,
      maxValue,
      projectId
    ) as any[]

    return similar.map(s => {
      const actualsVariance = db.prepare(`
        SELECT
          AVG(
            CASE WHEN wc.base_hours > 0
            THEN (ca.actual_hours - wc.base_hours) / wc.base_hours * 100
            ELSE NULL END
          ) as avg_variance_percent
        FROM component_actuals ca
        JOIN wbs_components wc ON wc.id = ca.wbs_component_id
        JOIN tracker_projects tp ON tp.id = ca.tracker_project_id
        WHERE tp.project_id = ?
          AND ca.is_complete = 1
      `).get(s.id) as any

      return {
        projectId: s.id,
        projectName: s.name,
        clientName: s.client_name,
        status: s.status,
        quotedPrice: s.quoted_price,
        marginPercent: s.margin_percent,
        componentCount: s.component_count,
        totalHours: s.total_hours,
        similarityScore: s.similarity_score,
        avgActualsVariance: actualsVariance?.avg_variance_percent || null,
      }
    })
  } catch { return [] }
}

// ── Function 4: getCapacityAnalysis ──────────────────────────────────────────

export async function getCapacityAnalysis(): Promise<CapacityAnalysis> {
  try {
    const db = getDb()

    // Active pipeline deals with resource requirements
    const pipeline = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.expected_start_date,
        p.timeline_start,
        COALESCE(p.win_probability, 50) as win_probability,
        COUNT(DISTINCT r.id) as resource_count,
        COALESCE(SUM(rl.hours), 0) as total_hours
      FROM projects p
      LEFT JOIN resources r ON r.project_id = p.id
      LEFT JOIN resource_loading rl ON rl.project_id = p.id
      WHERE p.status IN ('draft', 'submitted')
      GROUP BY p.id
    `).all() as any[]

    // Active delivery projects (already committed capacity)
    const activeDelivery = db.prepare(`
      SELECT
        tp.id,
        p.name,
        p.project_target_end_date as end_date,
        COUNT(DISTINCT r.id) as resource_count
      FROM tracker_projects tp
      JOIN projects p ON p.id = tp.project_id
      LEFT JOIN resources r ON r.project_id = tp.project_id
      WHERE p.project_status = 'in_progress'
      GROUP BY tp.id
    `).all() as any[]

    const committedResources = activeDelivery.reduce((sum, d) => sum + d.resource_count, 0)
    const maxDemand = pipeline.reduce((sum, p) => sum + p.resource_count, 0)
    const weightedDemand = pipeline.reduce(
      (sum, p) => sum + (p.resource_count * p.win_probability / 100),
      0
    )

    const monthlyDemand: Record<string, number> = {}
    pipeline.forEach(p => {
      const start = p.expected_start_date || p.timeline_start
      if (!start) return
      const month = start.slice(0, 7)
      monthlyDemand[month] = (monthlyDemand[month] || 0) + p.resource_count
    })

    const totalTeamSize = db.prepare(`SELECT COUNT(*) as count FROM rate_card`).get() as { count: number }
    const availableCapacity = Math.max(0, totalTeamSize.count - committedResources)
    const capacityGap = Math.max(0, weightedDemand - availableCapacity)

    return {
      committedResources,
      availableCapacity,
      pipelineDemand: {
        maximum: maxDemand,
        weighted: Math.round(weightedDemand),
      },
      capacityGap: Math.round(capacityGap),
      monthlyBreakdown: Object.entries(monthlyDemand)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, demand]) => ({
          month,
          demand,
          gap: Math.max(0, demand - availableCapacity),
        })),
      activeProjects: activeDelivery.length,
      pipelineDeals: pipeline.length,
    }
  } catch {
    return {
      committedResources: 0,
      availableCapacity: 0,
      pipelineDemand: { maximum: 0, weighted: 0 },
      capacityGap: 0,
      monthlyBreakdown: [],
      activeProjects: 0,
      pipelineDeals: 0,
    }
  }
}

// ── Function 5: getBidScorePrediction ─────────────────────────────────────────

export function getBidScorePrediction(currentScores: Record<string, number>): BidPrediction {
  try {
    const db = getDb()

    const history = db.prepare(`
      SELECT
        p.status,
        p.outcome_data,
        p.win_probability
      FROM projects p
      WHERE p.status IN ('won', 'lost')
        AND p.outcome_data IS NOT NULL
      ORDER BY p.updated_at DESC
      LIMIT 50
    `).all() as any[]

    if (history.length < 5) {
      return {
        predictedProbability: null,
        confidence: 'insufficient_data',
        message: 'Need at least 5 completed deals to predict win probability.',
        historicalWinRate: null,
      }
    }

    const won = history.filter(h => h.status === 'won')
    const historicalWinRate = (won.length / history.length) * 100

    const wonScores = won.map(w => {
      try { return JSON.parse(w.outcome_data || '{}').bidScores || {} }
      catch { return {} }
    })

    const factors = Object.keys(currentScores)

    let totalAlignment = 0
    let factorCount = 0

    factors.forEach(factor => {
      const avgWonScore = wonScores.length > 0
        ? wonScores.reduce((sum, s) => sum + (s[factor] || 5), 0) / wonScores.length
        : 5

      const currentScore = currentScores[factor]
      const alignment = Math.min(currentScore / avgWonScore, 1)

      totalAlignment += alignment
      factorCount++
    })

    const alignmentScore = factorCount > 0 ? (totalAlignment / factorCount) * 100 : 50

    const predictedProbability = Math.round(
      (alignmentScore * 0.6) + (historicalWinRate * 0.4)
    )

    let message = ''
    if (predictedProbability >= 70) {
      message = 'Strong alignment with your historical winning profile. Pursue confidently.'
    } else if (predictedProbability >= 50) {
      message = 'Moderate alignment. Review lower-scored factors before submitting.'
    } else {
      message = 'Low alignment with winning patterns. Consider bid/no-bid decision carefully.'
    }

    return {
      predictedProbability,
      confidence: history.length >= 20 ? 'high' : history.length >= 10 ? 'medium' : 'low',
      message,
      historicalWinRate: Math.round(historicalWinRate),
    }
  } catch {
    return {
      predictedProbability: null,
      confidence: 'insufficient_data',
      message: 'Unable to calculate prediction.',
      historicalWinRate: null,
    }
  }
}

// ── Library calibration helper ────────────────────────────────────────────────

export async function getLibraryHealthSummary() {
  try {
    const db = getDb()
    const totalComponents = (db.prepare(`SELECT COUNT(*) as count FROM component_library`).get() as any).count
    const suggestions = await getCalibrationSuggestions()

    const allWithData = db.prepare(`
      SELECT
        cl.id,
        ABS(
          (AVG(ca.actual_hours) - cl.base_hours) / cl.base_hours * 100
        ) as variance_pct
      FROM component_library cl
      JOIN wbs_components wc
        ON LOWER(TRIM(wc.component_name)) = LOWER(TRIM(cl.component_name))
        AND wc.category = cl.category
      JOIN component_actuals ca ON ca.wbs_component_id = wc.id AND ca.actual_hours > 0
      WHERE ca.is_complete = 1
      GROUP BY cl.id
      HAVING COUNT(ca.id) >= 1
    `).all() as any[]

    const withData = allWithData.length
    const wellCalibrated = allWithData.filter(r => r.variance_pct <= 10).length
    const needsUpdate = suggestions.length
    const avgError = allWithData.length > 0
      ? allWithData.reduce((sum, r) => sum + r.variance_pct, 0) / allWithData.length
      : 0

    return {
      totalComponents,
      withData,
      wellCalibrated,
      needsUpdate,
      avgError: Math.round(avgError * 10) / 10,
    }
  } catch {
    return { totalComponents: 0, withData: 0, wellCalibrated: 0, needsUpdate: 0, avgError: 0 }
  }
}

export async function applyCalibrationUpdates(
  updates: { libraryId: string; newHours: number }[]
): Promise<void> {
  const db = getDb()
  const stmt = db.prepare('UPDATE component_library SET base_hours = ? WHERE id = ?')
  db.transaction(() => {
    for (const u of updates) stmt.run(u.newHours, u.libraryId)
  })()
  invalidateCache('calibration')
}
