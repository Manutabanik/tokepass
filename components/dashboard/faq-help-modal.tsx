"use client"

import { ChevronDown, LifeBuoy, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { listActiveSupportFaqs, type SupportFaqItem } from "@/app/actions/support-faqs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { OPEN_ORGANIZER_SUPPORT_EVENT } from "@/lib/support-events"
import {
  FAQ_CATEGORIES,
  faqCategoryLabel,
} from "@/lib/support-faqs"
import { cn } from "@/lib/utils"
import type { SupportFaqCategory } from "@/types/database"

function normalizeQuery(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function supportMailto() {
  const email =
    process.env.NEXT_PUBLIC_TOKEPASS_SUPPORT_EMAIL?.trim() ||
    "soporte@tokepass.com.ar"
  return `mailto:${email}?subject=${encodeURIComponent("Consulta tecnica TokePass")}`
}

export function FaqHelpModal({
  open,
  onOpenChange,
  canChat = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canChat?: boolean
}) {
  const [query, setQuery] = useState("")
  const [faqs, setFaqs] = useState<SupportFaqItem[]>([])
  const [loading, setLoading] = useState(false)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void listActiveSupportFaqs()
      .then((rows) => {
        if (!cancelled) setFaqs(rows.filter((item) => item.isActive))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const filtered = useMemo(() => {
    const needle = normalizeQuery(query)
    if (!needle) return faqs
    return faqs.filter((faq) => {
      const haystack = normalizeQuery(
        `${faq.question} ${faq.answer} ${faqCategoryLabel(faq.category)}`,
      )
      return haystack.includes(needle)
    })
  }, [faqs, query])

  const grouped = useMemo(() => {
    const byCategory = new Map<SupportFaqCategory, SupportFaqItem[]>()
    for (const category of FAQ_CATEGORIES) {
      byCategory.set(category.id, [])
    }
    for (const faq of filtered) {
      byCategory.get(faq.category)?.push(faq)
    }
    return FAQ_CATEGORIES.map((category) => ({
      ...category,
      items: byCategory.get(category.id) ?? [],
    })).filter((group) => group.items.length > 0)
  }, [filtered])

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function contactSupport() {
    onOpenChange(false)
    if (canChat) {
      window.dispatchEvent(new Event(OPEN_ORGANIZER_SUPPORT_EVENT))
      return
    }
    window.location.href = supportMailto()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>Ayuda y FAQ</SheetTitle>
          <SheetDescription>
            Buscá por palabras clave o abrí la categoría que necesites.
          </SheetDescription>
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="retiro de dinero, scanner, RRPP"
              aria-label="Buscar preguntas"
              className="pl-9"
            />
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando preguntas...</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No encontramos una pregunta con esa búsqueda. Escribile a soporte.
            </p>
          ) : (
            <div className="space-y-5">
              {grouped.map((group) => (
                <section key={group.id}>
                  <h3 className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    {group.label}
                  </h3>
                  <div className="space-y-2">
                    {group.items.map((faq) => {
                      const expanded = openIds.has(faq.id)
                      return (
                        <article
                          key={faq.id}
                          className="rounded-xl border border-border bg-card"
                        >
                          <button
                            type="button"
                            onClick={() => toggle(faq.id)}
                            aria-expanded={expanded}
                            className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
                          >
                            <span className="text-sm font-medium text-foreground">
                              {faq.question}
                            </span>
                            <ChevronDown
                              className={cn(
                                "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                                expanded && "rotate-180",
                              )}
                              aria-hidden="true"
                            />
                          </button>
                          {expanded ? (
                            <p className="border-t border-border px-3 py-3 text-sm leading-6 text-muted-foreground whitespace-pre-wrap">
                              {faq.answer}
                            </p>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <SheetFooter className="border-t border-border px-5 py-4">
          <Button type="button" className="w-full" onClick={contactSupport}>
            <LifeBuoy className="size-4" aria-hidden="true" />
            Hablar con soporte tecnico
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
