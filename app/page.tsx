import { currentUser } from "@clerk/nextjs/server"
import {
  getEstimatorStats,
  getTrackerStats,
  getPipelineStats,
  getHomepageAlerts,
  getRecentActivity,
} from "@/lib/homepage-actions"
import { Homepage } from "@/components/homepage"

export default async function HomePage() {
  const [user, estimatorStats, trackerStats, pipelineStats, alerts, recentActivity] = await Promise.all([
    currentUser(),
    Promise.resolve(getEstimatorStats()),
    Promise.resolve(getTrackerStats()),
    Promise.resolve(getPipelineStats()),
    Promise.resolve(getHomepageAlerts()),
    Promise.resolve(getRecentActivity()),
  ])

  return (
    <Homepage
      firstName={user?.firstName ?? null}
      estimatorStats={estimatorStats}
      trackerStats={trackerStats}
      pipelineStats={pipelineStats}
      alerts={alerts}
      recentActivity={recentActivity}
    />
  )
}
