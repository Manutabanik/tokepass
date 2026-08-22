import { cn } from "@/lib/utils"

/** Inputs / selects / textareas del estudio de evento (Light + Dark). */
export const STUDIO_CONTROL_CLASS = cn(
  "w-full h-11 px-4 rounded-xl border transition-colors outline-none",
  "bg-white text-slate-900 border-slate-200 placeholder:text-slate-400",
  "focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20",
  "dark:bg-zinc-900/90 dark:text-white dark:border-zinc-800 dark:placeholder:text-zinc-500",
  "dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20",
  "aria-invalid:border-red-500 aria-invalid:ring-2 aria-invalid:ring-red-500/20",
  "dark:aria-invalid:border-red-500 dark:aria-invalid:ring-red-500/20",
)

export const STUDIO_SELECT_CONTENT_CLASS = cn(
  "max-h-60 overflow-y-auto rounded-xl border shadow-2xl",
  "border-slate-200 bg-white text-slate-900",
  "dark:border-zinc-800 dark:bg-zinc-900 dark:text-white",
)

export const STUDIO_LABEL_CLASS =
  "mb-1.5 text-sm font-bold text-slate-800 dark:text-zinc-200"

export const STUDIO_MODALITY_IDLE_CLASS = cn(
  "bg-slate-100 text-slate-600 border border-transparent",
  "dark:bg-zinc-800 dark:text-zinc-400",
)

export const STUDIO_MODALITY_ACTIVE_CLASS = cn(
  "bg-emerald-500/10 border border-emerald-500 text-emerald-600",
  "dark:text-emerald-400",
)

export const STUDIO_SECONDARY_BUTTON_CLASS = cn(
  "bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 h-11 rounded-xl transition-colors",
  "dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200",
)
