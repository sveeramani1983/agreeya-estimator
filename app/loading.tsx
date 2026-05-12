import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="space-y-2">
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-6 w-[450px]" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
      
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
           <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
        <div className="space-y-6">
           <Skeleton className="h-[250px] w-full rounded-xl" />
           <Skeleton className="h-[150px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
