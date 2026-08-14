import { Skeleton } from "@/components/ui/skeleton"

export function HomeDiscoverySkeleton() {
  return (
    <div className="space-y-8 pt-4" aria-busy="true" aria-label="Cargando eventos">
      <div className="mx-auto max-w-4xl space-y-4 px-1 text-center">
        <Skeleton className="mx-auto h-10 w-3/4 max-w-md rounded-2xl" />
        <Skeleton className="mx-auto h-4 w-full max-w-lg rounded-full" />
        <Skeleton className="mx-auto h-14 w-full max-w-xl rounded-full" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-40 rounded-full" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton
              key={`feat-${index}`}
              className="h-48 min-w-[78%] flex-none rounded-3xl sm:min-w-[40%]"
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`card-${index}`}
            className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/60 dark:border-white/8 dark:bg-zinc-950/40"
          >
            <Skeleton className="aspect-[16/10] w-full rounded-none" />
            <div className="space-y-3 p-4">
              <Skeleton className="h-5 w-4/5 rounded-full" />
              <Skeleton className="h-4 w-2/3 rounded-full" />
              <Skeleton className="h-10 w-full rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EventDetailSkeleton() {
  return (
    <div
      className="min-h-screen bg-background pb-28"
      aria-busy="true"
      aria-label="Cargando evento"
    >
      <Skeleton className="h-[32vh] min-h-[220px] w-full rounded-none" />
      <div className="space-y-5 px-4 pt-5">
        <Skeleton className="h-9 w-4/5 rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-12 w-48 rounded-2xl" />
        <div className="space-y-3 pt-4">
          <Skeleton className="h-6 w-32 rounded-full" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`tier-${index}`} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    </div>
  )
}
