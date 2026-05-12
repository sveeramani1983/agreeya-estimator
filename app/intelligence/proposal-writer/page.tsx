import { ComingSoonBanner } from "@/components/intelligence/coming-soon-banner"
import { DisabledFeature } from "@/components/intelligence/disabled-feature"
import { FeatureFeedback } from "@/components/intelligence/feature-feedback"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, Pencil, Copy, Sparkles, ChevronDown } from "lucide-react"

const EXAMPLE_REQUIREMENT =
  `Section 4.2 — Accessibility Compliance

Describe your firm's approach to ensuring WCAG 2.1 Level AA accessibility compliance throughout the full software development lifecycle, including design, development, testing, and post-launch support. Include specific tools, methodologies, and examples of prior work demonstrating accessibility expertise.`

const EXAMPLE_RESPONSE =
  `AgreeYa's Accessibility-First Development Approach

AgreeYa embeds accessibility into every phase of delivery — not as a final audit, but as a continuous quality gate. Here's how we approach WCAG 2.1 AA compliance end-to-end:

Design Phase
Our UX team conducts accessibility-inclusive design from the first wireframe. We run automated color contrast checks (APCA), ensure keyboard navigation flows are documented in all design specifications, and test prototypes with NVDA and VoiceOver before a single line of code is written.

Development Phase
Every developer follows our internal Accessible Component Handbook, which documents approved patterns for focus management, ARIA labeling, and error messaging. Our component library is pre-tested against WCAG 2.1 AA criteria.

QA & Testing Phase
We run automated accessibility scans using Axe Core (integrated into our CI/CD pipeline), WAVE browser extension manual reviews, and biweekly manual testing sessions with screen readers (NVDA on Windows, VoiceOver on macOS/iOS). Every sprint includes an accessibility regression check.

Prior Work
On the Metro Transit Customer App (delivered Q2 2024), we achieved a zero-critical-finding audit report from Oregon Department of Administrative Services. On the City of Austin Digital Services Portal, we trained the client's in-house team on accessibility maintenance.

Post-Launch
We provide a 90-day warranty period during which all reported accessibility issues are treated as P1 defects, resolved within 3 business days.`

const TONE_OPTIONS = ["Professional", "Technical", "Concise", "Persuasive"]
const SECTION_OPTIONS = [
  "Section 4.1 — Technical Approach",
  "Section 4.2 — Accessibility Compliance",
  "Section 4.3 — Project Management Methodology",
  "Section 4.4 — Team Qualifications",
  "Section 4.5 — References and Past Performance",
]

export default function ProposalWriterPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tight text-foreground">
            Proposal Writer
          </h2>
          <p className="text-muted-foreground">
            Paste an RFP section and get a draft response generated from your past wins and company profile.
          </p>
        </div>
        <ComingSoonBanner />
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        <DisabledFeature>
          <div className="flex items-center gap-2 rounded-lg border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm shadow-sm">
            <span className="text-muted-foreground">Section:</span>
            <span className="font-medium text-foreground">Section 4.2 — Accessibility Compliance</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </DisabledFeature>
        <DisabledFeature>
          <div className="flex items-center gap-2 rounded-lg border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm shadow-sm">
            <span className="text-muted-foreground">Tone:</span>
            <span className="font-medium text-foreground">Professional</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </DisabledFeature>
        <DisabledFeature>
          <div className="flex items-center gap-2 rounded-lg border border-[#1E2D45] bg-[#111827] px-3 py-2 text-sm shadow-sm">
            <span className="text-muted-foreground">Length:</span>
            <span className="font-medium text-foreground">Standard (~400 words)</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </DisabledFeature>
      </div>

      {/* Split panel */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Input Panel ── */}
        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold text-[#94A3B8]">
              RFP Requirement
            </CardTitle>
            <Badge className="bg-[#1E2D45] text-[#94A3B8] border-[#1E2D45] text-xs">
              Section 4.2
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <DisabledFeature>
              <div className="min-h-[320px] w-full rounded-lg border border-[#1E2D45] bg-[#0D1526] p-4 text-sm text-[#94A3B8] whitespace-pre-wrap font-mono leading-relaxed">
                {EXAMPLE_REQUIREMENT}
              </div>
            </DisabledFeature>
            <div className="mt-3 flex gap-2">
              <DisabledFeature>
                <Button className="flex-1 gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  Generate Response
                </Button>
              </DisabledFeature>
            </div>
          </CardContent>
        </Card>

        {/* ── Output Panel ── */}
        <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold text-[#94A3B8]">
              AI-Generated Response
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge className="bg-green-900/30 text-green-300 border-green-800/50 text-xs">
                ✓ Generated
              </Badge>
              <span className="text-xs text-muted-foreground">~420 words</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="min-h-[320px] rounded-lg border border-[#1E2D45] bg-[#111827] p-4 text-sm text-[#94A3B8] whitespace-pre-wrap leading-relaxed overflow-y-auto">
              {EXAMPLE_RESPONSE}
            </div>
            <div className="flex gap-2">
              <DisabledFeature>
                <Button variant="outline" className="gap-1.5">
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </Button>
              </DisabledFeature>
              <DisabledFeature>
                <Button variant="outline" className="gap-1.5">
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              </DisabledFeature>
              <DisabledFeature>
                <Button variant="outline" className="gap-1.5 ml-auto">
                  <Copy className="h-4 w-4" />
                  Copy All
                </Button>
              </DisabledFeature>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section navigator */}
      <Card className="shadow-sm border-[#1E2D45] bg-[#111827]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-[#94A3B8]">
            All RFP Sections
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {SECTION_OPTIONS.map((section, i) => (
              <DisabledFeature key={section}>
                <button
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    i === 1
                      ? "border-primary bg-primary text-white"
                      : "border-[#1E2D45] bg-[#111827] text-[#94A3B8] hover:border-[#2D3F5A]"
                  }`}
                >
                  {section}
                </button>
              </DisabledFeature>
            ))}
          </div>
        </CardContent>
      </Card>

      <FeatureFeedback feature="proposal-writer" />
    </div>
  )
}
