"use client"

import { Handshake, ImagePlus, LoaderCircle, Plus, Trash2 } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createPlatformSponsor,
  deletePlatformSponsor,
  updatePlatformSponsor,
} from "@/app/actions/platform-sponsors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { PlatformSponsor } from "@/types/database"

const LOGO_ACCEPT = "image/png,image/svg+xml,image/jpeg,image/webp"

function LogoDropzone({
  file,
  onFile,
  disabled = false,
}: {
  file: File | null
  onFile: (file: File | null) => void
  disabled?: boolean
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  )

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function takeFile(list: FileList | null) {
    const next = list?.[0] ?? null
    onFile(next)
    if (!next && inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Logo
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={LOGO_ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => takeFile(event.target.files)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          takeFile(event.dataTransfer.files)
        }}
        className={cn(
          "flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
          dragOver
            ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-300"
            : "border-zinc-300 bg-zinc-50 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800",
        )}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt=""
              className="max-h-10 w-auto object-contain"
            />
            <span className="max-w-full truncate text-xs font-medium">
              {file?.name}
            </span>
          </>
        ) : (
          <>
            <ImagePlus className="size-5" aria-hidden="true" />
            <span className="text-sm font-medium">
              Seleccionar logo (PNG/SVG)
            </span>
            <span className="text-xs text-muted-foreground">
              Arrastrá el archivo o hacé clic. También se acepta JPG o WEBP.
            </span>
          </>
        )}
      </button>
    </div>
  )
}

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
      toast.success("Sponsor agregado")
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
          Nuevo sponsor o marca
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Logo PNG o SVG con fondo transparente. Se muestra en la landing
          pública.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Nombre de la marca / sponsor
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nombre de la marca"
              required
              className="h-11"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              URL del sitio web
            </span>
            <Input
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://..."
              inputMode="url"
              autoComplete="url"
              className="h-11"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Orden de aparición
            </span>
            <Input
              type="number"
              min={0}
              value={displayOrder}
              onChange={(event) => setDisplayOrder(event.target.value)}
              placeholder="100"
              className="h-11"
            />
          </label>
          <LogoDropzone file={logo} onFile={setLogo} disabled={pending} />
        </div>
        <Button type="submit" className="mt-4 min-h-11" disabled={pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Agregar sponsor
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
                    toast.success("Sponsor eliminado")
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
