import { HomeDiscoverySkeleton } from "@/components/public/b2c-skeletons"

export default function PublicHomeLoading() {
  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-x-clip bg-[#f4f2f8] dark:bg-[#030712]">
      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-2 sm:px-6 lg:px-8">
        <HomeDiscoverySkeleton />
      </div>
    </div>
  )
}
