"use client"

import { useEffect, useMemo } from "react"
import { format, parseISO, differenceInDays } from "date-fns"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Totals {
  totalLaborCost: number
  totalAdditionalCosts: number
  totalProjectCost: number
  quotedPrice: number
}

interface PDFDocumentProps {
  project: any
  wbsComponents: any[]
  phases: any[]
  billingMilestones: any[]
  assumptions: any[]
  risks: any[]
  laborCosts: any[]
  additionalCosts: any[]
  commercialsConfig: any
  totals: Totals
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString()}`
}

function triggerLabel(t: string) {
  const map: Record<string, string> = {
    date: "By date",
    milestone: "On milestone",
    phase_complete: "Phase complete",
    client_approval: "Client approval",
    contract_signing: "Contract signing",
  }
  return map[t] ?? t
}

// ─── Sub-components (all inline styles, no Tailwind, no CSS vars) ─────────────

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="section-header">
      <span className="section-number">{number}</span>
      <span className="section-title">{title}</span>
    </div>
  )
}

function PageFooter({ project, page, total }: { project: any; page: number; total: number }) {
  return (
    <div className="page-footer">
      <span>{project.name} · {project.client_name}</span>
      <span>Confidential &amp; Proprietary</span>
      <span>Page {page} of {total}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PDFDocument({
  project,
  wbsComponents,
  phases,
  billingMilestones,
  assumptions,
  risks,
  laborCosts,
  additionalCosts,
  commercialsConfig,
  totals,
}: PDFDocumentProps) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 500)
    return () => clearTimeout(timer)
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────────

  const categoryRollups = useMemo(() => {
    const byCategory: Record<string, number> = {}
    for (const c of wbsComponents) byCategory[c.category] = (byCategory[c.category] || 0) + c.base_hours
    const total = Object.values(byCategory).reduce((a, b) => a + b, 0)
    return Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([category, hours]) => ({
        category,
        hours,
        percentage: total > 0 ? Math.round((hours / total) * 100) : 0,
      }))
  }, [wbsComponents])

  const onsiteLabor = useMemo(() => laborCosts.filter((l: any) => l.location !== "offshore"), [laborCosts])
  const offshoreLabor = useMemo(() => laborCosts.filter((l: any) => l.location === "offshore"), [laborCosts])
  const onsiteHours = useMemo(() => onsiteLabor.reduce((a: number, l: any) => a + (l.total_hours || 0), 0), [onsiteLabor])
  const offshoreHours = useMemo(() => offshoreLabor.reduce((a: number, l: any) => a + (l.total_hours || 0), 0), [offshoreLabor])
  const onsiteCost = useMemo(() => onsiteLabor.reduce((a: number, l: any) => a + (l.total_cost || 0), 0), [onsiteLabor])
  const offshoreCost = useMemo(() => offshoreLabor.reduce((a: number, l: any) => a + (l.total_cost || 0), 0), [offshoreLabor])
  const totalLoadedHours = onsiteHours + offshoreHours
  const blendedRate = totalLoadedHours > 0 ? Math.round(totals.totalLaborCost / totalLoadedHours) : 0
  const deliveryModel = offshoreHours === 0 ? "Onsite" : onsiteHours === 0 ? "Offshore" : "Hybrid"
  const offshorePercent = totalLoadedHours > 0 ? Math.round((offshoreHours / totalLoadedHours) * 100) : 0

  const durationWeeks = useMemo(() => {
    if (!project.timeline_start || !project.timeline_end) return null
    try {
      return Math.round(differenceInDays(parseISO(project.timeline_end), parseISO(project.timeline_start)) / 7)
    } catch { return null }
  }, [project.timeline_start, project.timeline_end])

  const offshoreSavings = useMemo(() => {
    if (offshoreHours === 0 || onsiteHours === 0) return 0
    const onsiteRate = onsiteCost / onsiteHours
    return Math.max(0, Math.round(offshoreHours * onsiteRate - offshoreCost))
  }, [offshoreHours, onsiteHours, onsiteCost, offshoreCost])

  const openAssumptions = assumptions.filter((a: any) => a.status === "open")
  const highRisks = risks.filter((r: any) => (r.risk_score ?? 0) >= 6 && r.status === "open")

  const taxMode = project.tax_mode ?? "not_applicable"
  const taxApplicable = taxMode !== "not_applicable" && (project.tax_percent ?? 0) > 0
  const taxLabel = project.tax_label || "Sales Tax"
  const taxPercent = project.tax_percent ?? 0
  const taxAmount = taxApplicable ? Math.round(totals.quotedPrice * taxPercent / 100) : 0

  const paymentTerms = billingMilestones[0]?.payment_terms ?? 30
  const versionLabel = project.status === "won" ? "Final" : project.status === "submitted" ? "Rev 1" : "Draft"
  const todayStr = format(new Date(), "MMMM d, yyyy")
  const executiveSummary = project.executive_summary || commercialsConfig.quote_narrative || ""

  const TOTAL_PAGES = 7

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html, body {
          background: white;
          color: #1a1a1a;
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @page {
          size: A4 portrait;
          margin: 18mm 18mm 22mm 18mm;
        }

        @page :first {
          margin: 0;
        }

        .pdf-page {
          width: 210mm;
          max-width: 210mm;
          min-height: 297mm;
          background: white;
          position: relative;
          page-break-after: always;
          break-after: page;
          overflow: hidden;
        }

        .pdf-page:last-of-type {
          page-break-after: auto;
          break-after: auto;
        }

        .pdf-content {
          padding: 36px 48px 64px 48px;
          max-width: 174mm;
        }

        .cover-content {
          padding: 56px;
          min-height: 297mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        /* Typography */
        .pdf-h1 {
          font-size: 30pt;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.2;
          margin-bottom: 12px;
        }

        /* Section header */
        .section-header {
          display: flex;
          align-items: center;
          gap: 14px;
          padding-bottom: 14px;
          border-bottom: 2px solid #e5e7eb;
          margin-bottom: 28px;
        }

        .section-number {
          font-size: 10pt;
          font-weight: 700;
          color: #2563eb;
          letter-spacing: 0.1em;
        }

        .section-title {
          font-size: 17pt;
          font-weight: 700;
          color: #0f172a;
        }

        /* Tables */
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        th {
          background-color: #f8fafc !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          font-size: 9pt;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6b7280;
          padding: 9px 12px;
          text-align: left;
          border-bottom: 2px solid #e5e7eb;
        }

        td {
          padding: 9px 12px;
          font-size: 10.5pt;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
          vertical-align: top;
          word-wrap: break-word;
          overflow-wrap: break-word;
          word-break: break-word;
        }

        tr:last-child td {
          border-bottom: 2px solid #e5e7eb;
        }

        .total-row td {
          font-weight: 700;
          color: #0f172a;
          font-size: 11pt;
          border-top: 2px solid #0f172a;
          border-bottom: none;
          background-color: #f8fafc !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .text-right { text-align: right; }
        .text-center { text-align: center; }

        /* Fact grid — 2 cols to avoid overflow */
        .fact-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
          margin-bottom: 32px;
        }

        .fact-card {
          background-color: #f8fafc !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 14px;
        }

        .fact-label {
          font-size: 8.5pt;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          margin-bottom: 4px;
        }

        .fact-value {
          font-size: 15pt;
          font-weight: 700;
          color: #0f172a;
        }

        /* Info boxes */
        .info-box-green {
          background-color: #f0fdf4 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          padding: 16px;
          margin-top: 16px;
        }

        .info-box-red {
          background-color: #fef2f2 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          border: 1px solid #fecaca;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 8px;
        }

        .info-box-gray {
          background-color: #f9fafb !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 24px;
        }

        /* Badges */
        .badge-onsite {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 8.5pt;
          font-weight: 600;
          background-color: #eff6ff !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color: #1d4ed8;
        }

        .badge-offshore {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 8.5pt;
          font-weight: 600;
          background-color: #f0fdf4 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          color: #15803d;
        }

        /* Accent bars */
        .accent-bar-top {
          height: 8px;
          background-color: #2563eb !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          width: 100%;
        }

        .accent-bar-bottom {
          height: 4px;
          background-color: #2563eb !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          width: 100%;
        }

        /* Page footer */
        .page-footer {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 8px 48px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 8pt;
          color: #9ca3af;
          background: white;
        }

        /* Column widths per table */
        .scope-table th:nth-child(1) { width: 60%; }
        .scope-table th:nth-child(2) { width: 22%; }
        .scope-table th:nth-child(3) { width: 18%; }

        .phases-table th:nth-child(1) { width: 40%; }
        .phases-table th:nth-child(2) { width: 20%; }
        .phases-table th:nth-child(3) { width: 20%; }
        .phases-table th:nth-child(4) { width: 20%; }

        .team-table th:nth-child(1) { width: 45%; }
        .team-table th:nth-child(2) { width: 25%; }
        .team-table th:nth-child(3) { width: 30%; }

        .invest-table th:nth-child(1) { width: 70%; }
        .invest-table th:nth-child(2) { width: 30%; }

        .payment-table th:nth-child(1) { width: 5%; }
        .payment-table th:nth-child(2) { width: 28%; }
        .payment-table th:nth-child(3) { width: 20%; }
        .payment-table th:nth-child(4) { width: 17%; }
        .payment-table th:nth-child(5) { width: 12%; }
        .payment-table th:nth-child(6) { width: 18%; }

        .terms-table td:nth-child(1) { width: 35%; font-weight: 600; color: #374151; font-size: 10pt; }
        .terms-table td:nth-child(2) { color: #374151; font-size: 10pt; }

        /* Assumption list */
        .assumption-item {
          display: flex;
          gap: 12px;
          margin-bottom: 10px;
          align-items: flex-start;
        }

        .assumption-number {
          font-weight: 700;
          color: #2563eb;
          min-width: 20px;
          font-size: 10pt;
          flex-shrink: 0;
        }

        .assumption-text {
          font-size: 10pt;
          color: #374151;
        }

        /* Screen preview styles */
        @media screen {
          body {
            background: #f1f5f9;
          }
          .pdf-page {
            margin: 16px auto;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
          }
        }

        /* Print styles */
        @media print {
          body { background: white; }
          .pdf-page {
            margin: 0;
            box-shadow: none;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ── Screen preview bar ── */}
      <div className="no-print" style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "#1e3a5f",
        padding: "12px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ color: "white", fontSize: "13pt", fontWeight: 600 }}>
          PDF Preview — {project.name}
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => window.print()}
            style={{
              padding: "8px 20px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: "11pt",
              fontWeight: 600,
            }}
          >
            🖨 Print / Save as PDF
          </button>
          <button
            onClick={() => window.close()}
            style={{
              padding: "8px 20px",
              background: "transparent",
              color: "white",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: "11pt",
            }}
          >
            Close
          </button>
        </div>
      </div>
      <div className="no-print" style={{ height: 56 }} />

      {/* ══════════════════════════════════════════════════════════
          PAGE 1 — COVER
          ══════════════════════════════════════════════════════════ */}
      <div className="pdf-page">
        <div className="accent-bar-top" />
        <div className="cover-content">
          {/* Top section */}
          <div>
            <div style={{
              fontSize: "13pt",
              fontWeight: 700,
              color: "#2563eb",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 56,
            }}>
              AgreeYa Solutions
              <span style={{
                color: "#94a3b8",
                fontSize: "10pt",
                marginLeft: 12,
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: 0,
              }}>
                A Computacenter Company
              </span>
            </div>

            <div style={{
              fontSize: "30pt",
              fontWeight: 700,
              color: "#0f172a",
              lineHeight: 1.2,
              marginBottom: 14,
              maxWidth: 460,
              wordWrap: "break-word",
            }}>
              {project.name}
            </div>

            <div style={{ fontSize: "14pt", color: "#64748b", marginBottom: 36 }}>
              Project Proposal &amp; Cost Estimate
            </div>

            <div style={{ fontSize: "13pt", color: "#0f172a", fontWeight: 500 }}>
              Prepared for: {project.client_name}
            </div>
          </div>

          {/* Bottom section */}
          <div>
            {/* Key facts — 3 column using percentage widths */}
            <div style={{
              display: "flex",
              gap: "2%",
              marginBottom: 40,
              padding: 24,
              background: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}>
              {[
                { label: "Total Investment", value: fmt(totals.quotedPrice) },
                { label: "Duration", value: durationWeeks ? `${durationWeeks} weeks` : "TBD" },
                { label: "Delivery Model", value: deliveryModel },
              ].map(f => (
                <div key={f.label} style={{ width: "32%" }}>
                  <div style={{
                    fontSize: "8.5pt",
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 4,
                  }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: "18pt", fontWeight: 700, color: "#0f172a" }}>
                    {f.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer meta */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "9pt",
              color: "#94a3b8",
              borderTop: "1px solid #e2e8f0",
              paddingTop: 14,
            }}>
              <span>Prepared: {todayStr}</span>
              <span>{versionLabel}</span>
              <span>Confidential &amp; Proprietary</span>
              <span>Valid 30 days from issue</span>
            </div>
          </div>
        </div>
        <div className="accent-bar-bottom" />
      </div>

      {/* ══════════════════════════════════════════════════════════
          PAGE 2 — EXECUTIVE SUMMARY
          ══════════════════════════════════════════════════════════ */}
      <div className="pdf-page">
        <div className="pdf-content">
          <SectionHeader number="01" title="Executive Summary" />

          <p style={{
            fontSize: "11pt",
            lineHeight: 1.8,
            color: "#374151",
            marginBottom: 28,
            wordWrap: "break-word",
          }}>
            {executiveSummary || "Please add an executive summary in the Summary tab."}
          </p>

          <div className="fact-grid">
            {[
              { label: "Total Investment", value: fmt(totals.quotedPrice) },
              { label: "Project Duration", value: durationWeeks ? `${durationWeeks} weeks` : "TBD" },
              { label: "Total Effort", value: `${totalLoadedHours.toLocaleString()} hours` },
              { label: "Team Size", value: `${laborCosts.length} resource${laborCosts.length !== 1 ? "s" : ""}` },
              { label: "Delivery Model", value: deliveryModel },
              { label: "Effective Rate", value: blendedRate > 0 ? `${fmt(blendedRate)}/hr blended` : "N/A" },
            ].map(f => (
              <div key={f.label} className="fact-card">
                <div className="fact-label">{f.label}</div>
                <div className="fact-value">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
        <PageFooter project={project} page={2} total={TOTAL_PAGES} />
      </div>

      {/* ══════════════════════════════════════════════════════════
          PAGE 3 — SCOPE OF WORK
          ══════════════════════════════════════════════════════════ */}
      <div className="pdf-page">
        <div className="pdf-content">
          <SectionHeader number="02" title="Scope of Work" />

          <p style={{ color: "#64748b", marginBottom: 20, fontSize: "10.5pt" }}>
            Estimated effort by work area. Detailed component breakdown is available upon request.
          </p>

          <table className="scope-table">
            <thead>
              <tr>
                <th>Work Area</th>
                <th className="text-right">Estimated Hours</th>
                <th className="text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {categoryRollups.map(cat => (
                <tr key={cat.category}>
                  <td>{cat.category}</td>
                  <td className="text-right">{cat.hours.toLocaleString()} hrs</td>
                  <td className="text-right">{cat.percentage}%</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>TOTAL EFFORT</td>
                <td className="text-right">
                  {wbsComponents.reduce((a: number, c: any) => a + c.base_hours, 0).toLocaleString()} hrs
                </td>
                <td className="text-right">100%</td>
              </tr>
            </tbody>
          </table>

          {commercialsConfig.quote_narrative && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontWeight: 600, color: "#374151", marginBottom: 8, fontSize: "11pt" }}>
                Inclusions &amp; Notes
              </div>
              <p style={{
                color: "#374151",
                fontSize: "10pt",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
                wordWrap: "break-word",
              }}>
                {commercialsConfig.quote_narrative}
              </p>
            </div>
          )}
        </div>
        <PageFooter project={project} page={3} total={TOTAL_PAGES} />
      </div>

      {/* ══════════════════════════════════════════════════════════
          PAGE 4 — DELIVERY APPROACH
          ══════════════════════════════════════════════════════════ */}
      <div className="pdf-page">
        <div className="pdf-content">
          <SectionHeader number="03" title="Delivery Approach" />

          {phases.length > 0 && (
            <div style={{ marginBottom: 36 }}>
              <div style={{ fontWeight: 600, color: "#374151", marginBottom: 14, fontSize: "11pt" }}>
                Project Timeline
              </div>
              <table className="phases-table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Start</th>
                    <th>End</th>
                    <th className="text-right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {phases.map((phase: any) => {
                    const s = parseISO(phase.start_date)
                    const e = parseISO(phase.end_date)
                    const weeks = Math.round((differenceInDays(e, s) + 1) / 7)
                    return (
                      <tr key={phase.id}>
                        <td>
                          <span style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: phase.color,
                            marginRight: 8,
                            verticalAlign: "middle",
                            flexShrink: 0,
                          }} />
                          {phase.name}
                        </td>
                        <td>{format(s, "MMM d, yyyy")}</td>
                        <td>{format(e, "MMM d, yyyy")}</td>
                        <td className="text-right">{weeks}w</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <div style={{ fontWeight: 600, color: "#374151", marginBottom: 14, fontSize: "11pt" }}>
              Proposed Team
            </div>
            <table className="team-table">
              <thead>
                <tr>
                  <th>Role / Resource</th>
                  <th>Location</th>
                  <th className="text-right">Total Hours</th>
                </tr>
              </thead>
              <tbody>
                {laborCosts.map((r: any) => (
                  <tr key={r.resource_id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{r.role || r.name}</div>
                      {r.role && r.name !== r.role && (
                        <div style={{ fontSize: "9pt", color: "#64748b" }}>{r.name}</div>
                      )}
                    </td>
                    <td>
                      <span className={r.location === "offshore" ? "badge-offshore" : "badge-onsite"}>
                        {r.location === "offshore" ? "Offshore" : "Onsite"}
                      </span>
                    </td>
                    <td className="text-right">{Number(r.total_hours).toFixed(0)} hrs</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={2}>TOTAL</td>
                  <td className="text-right">{totalLoadedHours.toFixed(0)} hrs</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <PageFooter project={project} page={4} total={TOTAL_PAGES} />
      </div>

      {/* ══════════════════════════════════════════════════════════
          PAGE 5 — INVESTMENT SUMMARY
          ══════════════════════════════════════════════════════════ */}
      <div className="pdf-page">
        <div className="pdf-content">
          <SectionHeader number="04" title="Investment Summary" />

          <table className="invest-table" style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Cost Category</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {onsiteHours > 0 && (
                <tr>
                  <td>Onsite Labor ({onsiteHours.toFixed(0)} hrs)</td>
                  <td className="text-right">{fmt(onsiteCost)}</td>
                </tr>
              )}
              {offshoreHours > 0 && (
                <tr>
                  <td>Offshore Labor ({offshoreHours.toFixed(0)} hrs)</td>
                  <td className="text-right">{fmt(offshoreCost)}</td>
                </tr>
              )}
              {onsiteHours === 0 && offshoreHours === 0 && (
                <tr>
                  <td>Labor</td>
                  <td className="text-right">{fmt(totals.totalLaborCost)}</td>
                </tr>
              )}
              {additionalCosts.map((cost: any) => {
                const total = cost.cost_type === "monthly"
                  ? cost.amount * cost.duration_months
                  : cost.amount
                return (
                  <tr key={cost.id}>
                    <td style={{ paddingLeft: 24 }}>{cost.label}</td>
                    <td className="text-right">{fmt(total)}</td>
                  </tr>
                )
              })}
              <tr className="total-row">
                <td>TOTAL INVESTMENT</td>
                <td className="text-right">{fmt(totals.quotedPrice)}</td>
              </tr>
            </tbody>
          </table>

          {blendedRate > 0 && (
            <p style={{ fontSize: "9pt", color: "#94a3b8", marginBottom: 20 }}>
              * Effective blended rate: {fmt(blendedRate)}/hr across all resources.
              Detailed rate card available upon request.
            </p>
          )}

          {taxApplicable && (
            <div className="info-box-gray">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "11pt" }}>
                <span>Subtotal</span>
                <span>{fmt(totals.quotedPrice)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "11pt" }}>
                <span>{taxLabel} ({taxPercent}%)</span>
                <span>{fmt(taxAmount)}</span>
              </div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
                fontSize: "13pt",
                borderTop: "1px solid #e5e7eb",
                paddingTop: 8,
              }}>
                <span>Total including {taxLabel}</span>
                <span>{fmt(totals.quotedPrice + taxAmount)}</span>
              </div>
            </div>
          )}

          {offshoreSavings > 0 && (
            <div className="info-box-green">
              <div style={{ fontWeight: 600, color: "#15803d", marginBottom: 4, fontSize: "11pt" }}>
                Offshore Delivery Value
              </div>
              <p style={{ fontSize: "10pt", color: "#374151" }}>
                By leveraging our offshore delivery center for {offshorePercent}% of the work,
                this engagement delivers {fmt(offshoreSavings)} in savings compared to an
                all-onsite delivery model.
              </p>
            </div>
          )}
        </div>
        <PageFooter project={project} page={5} total={TOTAL_PAGES} />
      </div>

      {/* ══════════════════════════════════════════════════════════
          PAGE 6 — PAYMENT SCHEDULE
          ══════════════════════════════════════════════════════════ */}
      <div className="pdf-page">
        <div className="pdf-content">
          <SectionHeader number="05" title="Payment Schedule" />

          {billingMilestones.length > 0 ? (
            <>
              <table className="payment-table" style={{ marginBottom: 20 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Milestone</th>
                    <th>Payment Trigger</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">%</th>
                    <th>Planned Date</th>
                  </tr>
                </thead>
                <tbody>
                  {billingMilestones.map((m: any, i: number) => (
                    <tr key={m.id}>
                      <td style={{ color: "#94a3b8" }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.title}</div>
                        {m.deliverables && (
                          <div style={{ fontSize: "9pt", color: "#64748b", marginTop: 2, wordWrap: "break-word" }}>
                            {m.deliverables}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: "10pt", color: "#64748b" }}>
                        {triggerLabel(m.trigger_type)}
                      </td>
                      <td className="text-right" style={{ fontWeight: 600 }}>
                        {fmt(m.amount)}
                      </td>
                      <td className="text-right" style={{ color: "#64748b" }}>
                        {m.percentage}%
                      </td>
                      <td style={{ fontSize: "10pt" }}>
                        {m.planned_date
                          ? format(parseISO(m.planned_date), "MMM d, yyyy")
                          : "TBD"}
                      </td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={3}>TOTAL</td>
                    <td className="text-right">{fmt(totals.quotedPrice)}</td>
                    <td className="text-right">100%</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: "9pt", color: "#94a3b8" }}>
                Payment terms: Net {paymentTerms} days from invoice date unless otherwise agreed.
              </p>
            </>
          ) : (
            <p style={{ color: "#94a3b8", fontSize: "11pt" }}>
              Payment schedule to be agreed upon contract execution.
            </p>
          )}
        </div>
        <PageFooter project={project} page={6} total={TOTAL_PAGES} />
      </div>

      {/* ══════════════════════════════════════════════════════════
          PAGE 7 — ASSUMPTIONS & TERMS
          ══════════════════════════════════════════════════════════ */}
      <div className="pdf-page">
        <div className="pdf-content">
          <SectionHeader number="06" title="Assumptions &amp; Terms" />

          {openAssumptions.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontWeight: 600, color: "#374151", marginBottom: 8, fontSize: "11pt" }}>
                Key Assumptions
              </div>
              <p style={{ fontSize: "10pt", color: "#64748b", marginBottom: 12 }}>
                This estimate is based on the following assumptions. Changes may impact scope, timeline, and cost.
              </p>
              {openAssumptions.slice(0, 8).map((a: any, i: number) => (
                <div key={a.id} className="assumption-item">
                  <span className="assumption-number">{i + 1}.</span>
                  <div>
                    <div className="assumption-text" style={{ fontWeight: 500 }}>{a.title}</div>
                    {a.description && (
                      <div style={{ color: "#64748b", fontSize: "9pt", marginTop: 2, wordWrap: "break-word" }}>
                        {a.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {highRisks.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontWeight: 600, color: "#dc2626", marginBottom: 10, fontSize: "11pt" }}>
                Key Risks
              </div>
              {highRisks.slice(0, 3).map((risk: any) => (
                <div key={risk.id} className="info-box-red">
                  <div style={{ fontWeight: 600, color: "#dc2626", fontSize: "10pt" }}>{risk.title}</div>
                  {risk.mitigation && (
                    <div style={{ fontSize: "9pt", color: "#374151", marginTop: 4 }}>
                      Mitigation: {risk.mitigation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontWeight: 600, color: "#374151", marginBottom: 10, fontSize: "11pt" }}>
              Commercial Terms
            </div>
            <table className="terms-table">
              <tbody>
                {([
                  ["Estimate Validity", "30 days from date of issue"],
                  ["Contract Type", "Fixed Price"],
                  ["Change Management", "Changes to scope require written approval and may impact timeline and cost"],
                  ["Payment Terms", `Net ${paymentTerms} days from invoice`],
                  ["Intellectual Property", "All deliverables transfer to client upon final payment"],
                  ["Warranty Period", "30 days post go-live for defect resolution"],
                ] as [string, string][]).map(([term, value]) => (
                  <tr key={term}>
                    <td>{term}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <PageFooter project={project} page={7} total={TOTAL_PAGES} />
      </div>
    </>
  )
}
