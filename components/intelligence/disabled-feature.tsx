"use client"

import { Lock } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function DisabledFeature({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed items-center">
          <span className="pointer-events-none select-none opacity-50">{children}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span className="flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          Available in Skynet v2
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
