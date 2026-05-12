"use client"

import { usePathname, useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calculator, Users, Settings, DollarSign, FileText, History, ShieldAlert } from "lucide-react"

interface ProjectTabsProps {
  projectId: string
  riskCount?: number
}

export function ProjectTabs({ projectId, riskCount }: ProjectTabsProps) {
  const pathname = usePathname()
  const router = useRouter()

  const segments = pathname.split("/")
  const currentTab = segments[segments.length - 1] || "estimate"

  const handleTabChange = (value: string) => {
    router.push(`/projects/${projectId}/${value}`)
  }

  const triggerCls = "gap-2 px-4 py-1.5 data-[state=active]:bg-[#111827] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all text-[#94A3B8] hover:text-white"

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-auto print:hidden">
      <TabsList className="bg-[#0D1526] border border-[#1E2D45] p-1 rounded-lg">
        <TabsTrigger value="estimate" className={triggerCls}>
          <Calculator className="h-4 w-4" />
          <span className="font-semibold">Estimate</span>
        </TabsTrigger>
        <TabsTrigger value="overhead" className={triggerCls}>
          <Settings className="h-4 w-4" />
          <span className="font-semibold">Overhead</span>
        </TabsTrigger>
        <TabsTrigger value="resources" className={triggerCls}>
          <Users className="h-4 w-4" />
          <span className="font-semibold">Resources</span>
        </TabsTrigger>
        <TabsTrigger value="commercials" className={triggerCls}>
          <DollarSign className="h-4 w-4" />
          <span className="font-semibold">Commercials</span>
        </TabsTrigger>
        <TabsTrigger value="risks" className={triggerCls}>
          <ShieldAlert className="h-4 w-4" />
          <span className="font-semibold">Risks</span>
          {riskCount != null && riskCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
              {riskCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="summary" className={triggerCls}>
          <FileText className="h-4 w-4" />
          <span className="font-semibold">Summary</span>
        </TabsTrigger>
        <TabsTrigger value="versions" className={triggerCls}>
          <History className="h-4 w-4" />
          <span className="font-semibold">Versions</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
