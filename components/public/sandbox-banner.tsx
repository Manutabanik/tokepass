import { AlertTriangle } from "lucide-react"

import { SANDBOX_BANNER_TEXT } from "@/lib/preview/sandbox"

export function SandboxBanner() {
  return (
    <div
      className="sticky top-0 z-50 border-b border-amber-700/25 bg-amber-100 text-amber-950 shadow-sm pt-[max(env(safe-area-inset-top),16px)] dark:border-amber-500/30 dark:bg-amber-200 dark:text-amber-950"
      role="status"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <AlertTriangle
          className="size-5 shrink-0 text-amber-800"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold leading-5 tracking-tight">
          {SANDBOX_BANNER_TEXT}
        </p>
      </div>
    </div>
  )
}
