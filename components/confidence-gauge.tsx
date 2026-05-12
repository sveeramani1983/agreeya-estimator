"use client"

import { cn } from "@/lib/utils"

export function ConfidenceGauge({ score = 82, className }: { score?: number, className?: string }) {
  const radius = 52
  const strokeWidth = 10
  const normalizedRadius = radius - strokeWidth / 2
  const circumference = normalizedRadius * 2 * Math.PI
  // Only half a circle
  const strokeDashoffset = circumference - (score / 100) * (circumference / 2)

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className="relative w-40 h-20 overflow-hidden flex items-end justify-center">
        <svg
          width="160"
          height="80"
          viewBox="0 0 160 80"
          className="absolute top-0 left-0"
        >
          {/* Background Arc */}
          <path
            d="M 20 80 A 60 60 0 0 1 140 80"
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
            className="text-[#1E2D45]"
          />
          {/* Progress Arc */}
          <path
            d="M 20 80 A 60 60 0 0 1 140 80"
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-blue-600 transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="flex flex-col items-center z-10 -mb-2">
          <span className="text-3xl font-black text-foreground tracking-tight flex items-baseline leading-none">
            {score}% <span className="text-green-500 ml-1 text-xl">↗</span>
          </span>
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-2">
        Confidence Score
      </span>
    </div>
  )
}
