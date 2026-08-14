import type { ReactNode } from "react"

export function LegalDocument({
  kicker = "Legal",
  title,
  lead,
  children,
}: {
  kicker?: string
  title: string
  lead?: string
  children: ReactNode
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300/90">
        {kicker}
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      {lead ? (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {lead}
        </p>
      ) : null}
      <div className="mt-10 space-y-6 text-[15px] leading-relaxed text-foreground/80">
        {children}
      </div>
    </article>
  )
}

export function LegalSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}
