"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import {
  Box,
  Folder,
  Home,
  DollarSign,
  BarChart2,
  Brain,
  FileSearch,
  Award,
  PenLine,
  TrendingUp,
  Activity,
  GitBranch,
  LayoutDashboard,
  Target,
  Users,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

const navMain = [
  {
    title: "Dashboard",
    url: "/estimator",
    icon: Home,
  },
  {
    title: "Estimates",
    url: "/projects",
    icon: Folder,
  },
  {
    title: "Pipeline",
    url: "/pipeline",
    icon: Target,
  },
  {
    title: "Clients",
    url: "/clients",
    icon: Users,
  },
  {
    title: "Component Library",
    url: "/library",
    icon: Box,
  },
  {
    title: "Rate Card",
    url: "/rates",
    icon: DollarSign,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart2,
  },
  {
    title: "Calibration",
    url: "/analytics/calibration",
    icon: Activity,
  },
]

const navIntelligence = [
  {
    title: "Scope & RFP Analyzer",
    url: "/intelligence/rfp-analyzer",
    icon: FileSearch,
  },
]

const navTracker = [
  { title: "Dashboard",          url: "/tracker",            icon: LayoutDashboard },
  { title: "Active Projects",    url: "/tracker/projects",   icon: Folder          },
  { title: "Portfolio Analytics",url: "/tracker/analytics",  icon: BarChart2       },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { user } = useUser()
  const initials = user
    ? [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("") || "U"
    : "…"
  const displayName = user?.fullName ?? "Loading..."
  const displayRole = user?.primaryEmailAddress?.emailAddress ?? ""

  const isHome = pathname === "/"
  const isTracker = pathname.startsWith("/tracker")

  function isActive(url: string) {
    if (url === "/tracker") return pathname === "/tracker"
    if (url === "/") return pathname === "/"
    return pathname.startsWith(url)
  }

  function itemClass(active: boolean) {
    return cn(
      "h-10 transition-all rounded-xl",
      active
        ? "bg-[#1E56D0] text-white font-bold shadow-sm"
        : "text-zinc-400 font-medium hover:bg-white/5 hover:text-white"
    )
  }

  function iconClass(active: boolean) {
    return cn("h-4 w-4", active ? "text-white" : "text-zinc-400")
  }

  return (
    <Sidebar {...props} className="border-r-0">
      <SidebarHeader className="flex h-24 flex-col justify-center px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E56D0] p-2 text-white shadow-lg shadow-blue-900/20">
            <Box className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight text-white leading-tight">SKYNET 1.0</span>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-0.5 px-1.5 py-0.5 border border-zinc-800 rounded bg-zinc-900 w-fit">Beta</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-6 bg-[#1A1C23]">
        {/* ── Home link ── */}
        <SidebarMenu className="mb-3">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Home"
              className={itemClass(isHome)}
              render={<a href="/" />}
            >
              <Home className={iconClass(isHome)} />
              <span className="text-[13px] ml-1">Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* ── App switcher ── */}
        <div className="flex items-center gap-1 bg-[#111318] rounded-xl p-1 mb-5">
          <a
            href="/estimator"
            className={cn(
              "flex-1 text-center text-[11px] font-bold py-1.5 rounded-lg transition-all",
              !isTracker && !isHome ? "bg-[#1E56D0] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            ESTIMATOR
          </a>
          <a
            href="/tracker"
            className={cn(
              "flex-1 text-center text-[11px] font-bold py-1.5 rounded-lg transition-all",
              isTracker ? "bg-[#1E56D0] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            TRACKER
          </a>
        </div>

        {isTracker ? (
          /* ── Tracker navigation ── */
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {navTracker.map((item) => {
                  const active = isActive(item.url)
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        className={itemClass(active)}
                        render={<a href={item.url} />}
                      >
                        <item.icon className={iconClass(active)} />
                        <span className="text-[13px] ml-1">{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            {/* ── Estimator main navigation ── */}
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {navMain.map((item) => {
                    const active = isActive(item.url)
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          tooltip={item.title}
                          className={itemClass(active)}
                          render={<a href={item.url} />}
                        >
                          <item.icon className={iconClass(active)} />
                          <span className="text-[13px] ml-1">{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* ── Skynet AI section ── */}
            <SidebarGroup className="mt-8 p-0">
              <SidebarGroupLabel className="flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-2">
                Skynet AI
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {navIntelligence.map((item) => {
                    const active = isActive(item.url)
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          tooltip={item.title}
                          className={itemClass(active)}
                          render={<a href={item.url} />}
                        >
                          <item.icon className={iconClass(active)} />
                          <span className="text-[13px] ml-1">{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarRail />
      
      <div className="mt-auto p-4 border-t border-zinc-800/50 bg-[#1A1C23]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white shadow-md">{initials}</div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-white truncate">{displayName}</span>
            <span className="text-[10px] text-zinc-500 truncate">{displayRole}</span>
          </div>
        </div>
      </div>
    </Sidebar>
  )
}
