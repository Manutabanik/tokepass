"use client"

import { Handshake, LoaderCircle, Plus, Trash2 } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createEventSponsor,
  deleteEventSponsor,
  listEventSponsorsForOrganizer,
} from "@/app/actions/event-sponsors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MAX_EVENT_SPONSORS } from "@/lib/sponsors"
import type { EventSponsor } from "@/types/database"

export function EventSponsorsManager({
  eventId,
  initialSponsors,
}: {
  eventId: string | null
  initialSponsors?: EventSponsor[]
}) {
  const [sponsors, setSponsors] = useState(initialSponsors ?? [])
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [tier, setTier] = useState<"main" | "regular">("regular")
  const [logo, setLogo] = useState<File | null>(null)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    void listEventSponsorsForOrganizer(eventId).then((rows) => {
      if (!cancelled) setSponsors(rows)
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  if (!eventId) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5 dark:border-zinc-800 dark:bg-zinc-950/40">
        <p className="text-sm font-semibold text-foreground">
          Sponsors del evento
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Guardá el borrador una vez para poder subir logos de auspiciantes.
        </p>
      </div>
    )
  }

  function handleCreate() {
    if (!eventId) return
    const formData = new FormData()
    formData.set("name", name)
    formData.set("websiteUrl", websiteUrl)
    formData.set("tier", tier)
    if (logo) formData.set("logo", logo)

    startTransition(async () => {
      const result = await createEventSponsor(eventId, formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setSponsors((current) => [...current, result.data])
      setName("")
      setWebsiteUrl("")
      setTier("regular")
      setLogo(null)
      toast.success("Sponsor agregado")
    })
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
        <Handshake className="size-3.5" aria-hidden />
        Sponsors del evento
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        PNG o SVG transparente. Aparecen en la ficha pública y en la entrada
        digital. Máximo {MAX_EVENT_SPONSORS}.
      </p>

      {sponsors.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {sponsors.map((sponsor) => (
            <li
              key={sponsor.id}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white py-1.5 pl-2 pr-1 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-white px-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sponsor.logo_url}
                  alt=""
                  className="max-h-6 w-auto object-contain"
                />
              </span>
              <span className="max-w-[8rem] truncate text-xs font-medium text-foreground">
                {sponsor.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 text-zinc-500 hover:text-destructive"
                disabled={pending}
                aria-label={`Quitar ${sponsor.name}`}
                onClick={() => {
                  startTransition(async () => {
                    const result = await deleteEventSponsor(eventId, sponsor.id)
                    if (!result.success) {
                      toast.error(result.error)
                      return
                    }
                    setSponsors((current) =>
                      current.filter((row) => row.id !== sponsor.id),
                    )
                  })
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre del auspiciante"
          className="h-11"
        />
        <Input
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          placeholder="Sitio web (opcional)"
          className="h-11"
        />
        <Select
          value={tier}
          onValueChange={(value) =>
            setTier(value === "main" ? "main" : "regular")
          }
          items={[
            { value: "main", label: "Principal" },
            { value: "regular", label: "Regular" },
          ]}
        >
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="Nivel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="main">Principal</SelectItem>
            <SelectItem value="regular">Regular</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          className="h-11 pt-2"
          onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
        />
        <div className="sm:col-span-2">
          <Button type="button" disabled={pending} className="min-h-11" onClick={handleCreate}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Agregar sponsor
          </Button>
        </div>
      </div>
    </div>
  )
}
