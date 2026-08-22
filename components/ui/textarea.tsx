import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "scheme-light dark:scheme-dark flex field-sizing-content min-h-16 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-base font-medium text-slate-900 transition-colors outline-none placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-white dark:placeholder:text-zinc-500 dark:disabled:bg-input/80 dark:focus-visible:border-emerald-500 dark:focus-visible:ring-emerald-500/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
