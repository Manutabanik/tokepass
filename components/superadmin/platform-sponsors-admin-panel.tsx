"use client"

import { Handshake, LoaderCircle, Plus, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createPlatformSponsor,
  deletePlatformSponsor,
  updatePlatformSponsor,
} from "@/app/actions/platform-sponsors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { PlatformSponsor } from "@/types/database"

export function PlatformSponsorsAdminPanel({
  initialSponsors,
}: {
  initialSponsors: PlatformSponsor[]
}) {
  const [sponsors, setSponsors] = useState(initialSponsors)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [displayOrder, setDisplayOrder] = useState("100")
  const [logo, setLogo] = useState<File | null>(null)

  function resetForm() {
    setName("")
    setWebsiteUrl("")
    setDisplayOrder("100")
    setLogo(null)
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    const formData = new FormData()
    formData.set("name", name)
    formData.set("websiteUrl", websiteUrl)
    formData.set("displayOrder", displayOrder)
    if (logo) formData.set("logo", logo)

    startTransition(async () => {
      const result = await createPlatformSponsor(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setSponsors((current) =>
        [...current, result.sponsor].sort(
          (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
        ),
      )
      resetForm()
      toast.success("Partner agregado")
    })
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-border bg-card p-5"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Handshake className="size-4" aria-hidden />
          Nuevo partner global
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Logo PNG o SVG con fondo transparente. Se muestra en la landing.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre de la empresa"
            required
            className="h-11"
          />
          <Input
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            placeholder="https://…"
            className="h-11"
          />
          <Input
            type="number"
            value={displayOrder}
            onChange={(event) => setDisplayOrder(event.target.value)}
            placeholder="Orden"
            className="h-11"
          />
          <Input
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            className="h-11 pt-2"
            onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
          />
        </div>
        <Button type="submit" className="mt-4 min-h-11" disabled={pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Agregar partner
        </Button>
      </form>

      <ul className="space-y-3">
        {sponsors.map((sponsor) => (
          <li
            key={sponsor.id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center"
          >
            <span className="inline-flex h-12 min-w-20 items-center justify-center rounded-xl bg-white px-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sponsor.logo_url}
                alt=""
                className="max-h-8 w-auto object-contain"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{sponsor.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {sponsor.website_url ?? "Sin sitio"} · orden {sponsor.display_order}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Activo
                <Switch
                  checked={sponsor.is_active}
                  disabled={pending}
                  onCheckedChange={(checked) => {
                    const formData = new FormData()
                    formData.set("id", sponsor.id)
                    formData.set("name", sponsor.name)
                    formData.set("websiteUrl", sponsor.website_url ?? "")
                    formData.set("displayOrder", String(sponsor.display_order))
                    formData.set("isActive", String(checked))
                    startTransition(async () => {
                      const result = await updatePlatformSponsor(formData)
                      if (!result.success) {
                        toast.error(result.error)
                        return
                      }
                      setSponsors((current) =>
                        current.map((row) =>
                          row.id === result.sponsor.id ? result.sponsor : row,
                        ),
                      )
                    })
                  }}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-destructive"
                disabled={pending}
                aria-label={`Eliminar ${sponsor.name}`}
                onClick={() => {
                  startTransition(async () => {
                    const result = await deletePlatformSponsor(sponsor.id)
                    if (!result.success) {
                      toast.error(result.error)
                      return
                    }
                    setSponsors((current) =>
                      current.filter((row) => row.id !== sponsor.id),
                    )
                    toast.success("Partner eliminado")
                  })
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
