import type { ReactNode } from "react"

interface PageHeadingProps {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: PageHeadingProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-sky-400">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            {description}
          </p>
        )}
      </div>
      {actions ? (
        <div className="w-full sm:w-auto sm:max-w-xs">{actions}</div>
      ) : null}
    </div>
  )
}
