import type { LucideIcon } from "lucide-react"

interface AdminSectionPlaceholderProps {
  title: string
  description: string
  icon: LucideIcon
}

export function AdminSectionPlaceholder({
  title,
  description,
  icon: Icon,
}: AdminSectionPlaceholderProps) {
  return (
    <>
      <p className="text-sm font-medium text-violet-400">Tu Panel</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
        {title}
      </h1>
      <p className="mt-2 text-sm text-zinc-500">{description}</p>
      <div className="mt-8 grid min-h-96 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-center">
        <div>
          <Icon className="mx-auto size-10 text-zinc-700" aria-hidden="true" />
          <p className="mt-4 text-sm text-zinc-500">
            Módulo preparado para la próxima iteración.
          </p>
        </div>
      </div>
    </>
  )
}
