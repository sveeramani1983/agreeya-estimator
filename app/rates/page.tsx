import { getRateCard } from "@/lib/actions"
import { RateCardManager } from "@/components/rate-card-manager"
import { DollarSign } from "lucide-react"

export default async function RatesPage() {
  const rateCard = await getRateCard()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="h-6 w-6 text-sidebar" />
        <h2 className="text-2xl font-bold tracking-tight">Rate Card Manager</h2>
      </div>
      
      <RateCardManager initialRateCard={rateCard} />
    </div>
  )
}
