"use client"

import { useState } from "react"
import { ThumbsUp, ThumbsDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { recordFeatureInterest } from "@/lib/actions"
import { toast } from "sonner"

export function FeatureFeedback({ feature }: { feature: string }) {
  const [voted, setVoted] = useState<"up" | "down" | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleVote(vote: "up" | "down") {
    if (voted || loading) return
    setLoading(true)
    try {
      await recordFeatureInterest(feature, vote)
      setVoted(vote)
      toast.success("Thanks! Your vote helps us prioritize.")
    } catch {
      toast.error("Couldn't save your feedback.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-[#1E2D45] pt-6">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <p className="text-muted-foreground">
          Interested in this feature? Share your feedback →
        </p>
        {voted ? (
          <span className="font-medium text-green-600">
            Thanks for your vote! {voted === "up" ? "👍" : "👎"}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleVote("up")}
              disabled={loading}
              className="gap-1.5"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              Yes, build this
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleVote("down")}
              disabled={loading}
              className="gap-1.5"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              Not a priority
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
