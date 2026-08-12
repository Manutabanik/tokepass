"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function EventAboutExpandable({
  description,
}: {
  description: string
}) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncate = description.length > 180

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold tracking-tight text-white">Acerca de</h2>
      <p
        className={cn(
          "whitespace-pre-wrap text-[15px] leading-7 text-zinc-400",
          !expanded && needsTruncate && "line-clamp-3",
        )}
      >
        {description}
      </p>
      {needsTruncate ? (
        <Button
          type="button"
          variant="link"
          className="h-auto px-0 text-sm font-semibold text-emerald-400"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Ver menos" : "Leer más…"}
        </Button>
      ) : null}
    </section>
  )
}
