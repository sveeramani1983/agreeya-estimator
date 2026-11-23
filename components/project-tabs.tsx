"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calculator, Users, Settings, DollarSign, FileText, History, ShieldAlert, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProjectTabsProps {
  projectId: string
  riskCount?: number
}

export function ProjectTabs({ projectId, riskCount }: ProjectTabsProps) {
  const pathname = usePathname()
  const segments = pathname.split("/")
  const currentTab = segments[segments.length - 1] || "estimate"

  const tabs = [
    { value: "estimate",    label: "Estimate",    Icon: Calculator                   },
    { value: "overhead",    label: "Overhead",    Icon: Settings                     },
    { value: "resources",   label: "Resources",   Icon: Users                        },
    { value: "commercials", label: "Commercials", Icon: DollarSign                   },
    { value: "schedule",    label: "Schedule",    Icon: Calendar                     },
    { value: "risks",       label: "Risks",       Icon: ShieldAlert, badge: riskCount },
    { value: "summary",     label: "Summary",     Icon: FileText                     },
    { value: "versions",    label: "Versions",    Icon: History                      },
  ]

  return (
    <nav className="flex items-end gap-0.5 print:hidden" aria-label="Project navigation">
      {tabs.map(({ value, label, Icon, badge }) => {
        const isActive = currentTab === value
        return (
          <Link
            key={value}
            href={`/projects/${projectId}/${value}`}
            className={cn(
              // Layout & shape
              "relative flex items-center gap-2 px-4 py-2.5 text-sm rounded-t-md",
              // Behaviour
              "select-none transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:rounded-md",
              // Bottom indicator via pseudo-element (overlaps parent border-b)
              "after:absolute after:bottom-0 after:inset-x-3 after:h-[2px] after:rounded-full after:transition-colors after:duration-200",
              isActive
                ? // ── Active ─────────────────────────────────────────────
                  "text-primary font-semibold cursor-default after:bg-primary"
                : // ── Default + Hover ─────────────────────────────────────
                  "text-muted-foreground font-medium cursor-pointer after:bg-transparent " +
                  "hover:text-foreground hover:bg-muted/50 hover:after:bg-muted"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
            {badge != null && badge > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
                {badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
