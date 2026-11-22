"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, DollarSign, BarChart2, TrendingUp, FileText, GitPullRequest, CreditCard } from "lucide-react"
import { cn } from "@/lib/utils"

interface TrackerProjectTabsProps {
  projectId: string
  changeCount?: number
}

export function TrackerProjectTabs({ projectId, changeCount }: TrackerProjectTabsProps) {
  const pathname = usePathname()
  const base = `/tracker/projects/${projectId}`
  const segment = pathname.replace(base, "").split("/")[1] || "overview"

  const tabs = [
    { value: "overview",    label: "Overview",       Icon: LayoutDashboard  },
    { value: "actuals",     label: "Actuals Entry",  Icon: DollarSign       },
    { value: "comparison",  label: "Est vs Actual",  Icon: TrendingUp       },
    { value: "burn-rate",   label: "Burn Rate",      Icon: BarChart2        },
    { value: "billing",     label: "Billing",        Icon: CreditCard       },
    { value: "reports",     label: "Reports",        Icon: FileText, badge: changeCount },
  ]

  return (
    <nav className="flex items-end gap-0.5 print:hidden" aria-label="Tracker project navigation">
      {tabs.map(({ value, label, Icon, badge }) => {
        const isActive = segment === value
        return (
          <Link
            key={value}
            href={`${base}/${value}`}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2.5 text-sm rounded-t-md select-none transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              "after:absolute after:bottom-0 after:inset-x-3 after:h-[2px] after:rounded-full after:transition-colors after:duration-200",
              isActive
                ? "text-primary font-semibold cursor-default after:bg-primary"
                : "text-muted-foreground font-medium cursor-pointer after:bg-transparent hover:text-foreground hover:bg-muted/50 hover:after:bg-muted"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
            {badge != null && badge > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white leading-none">
                {badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
