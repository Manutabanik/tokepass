"use client"

import { Camera, LoaderCircle, Save, UserRound } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  updateOrganizerProfile,
  uploadOrganizerAvatar,
  type OrganizerPublicProfile,
} from "@/app/actions/organizer-profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function OrganizerProfileForm({
  initial,
}: {
  initial: OrganizerPublicProfile
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [avatarPending, startAvatarTransition] = useTransition()
  const [publicName, setPublicName] = useState(
    initial.publicName || initial.fullName || "",
  )
  const [publicBio, setPublicBio] = useState(
    initial.publicBio || "Productora en Tokepass",
  )
  const [fullName, setFullName] = useState(initial.fullName)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)
  const displayName = publicName.trim() || fullName.trim() || "Productora"
  const initials = initialsFromName(displayName) || "TP"

  function onSave() {
    startTransition(async () => {
      const result = await updateOrganizerProfile({
        publicName,
        publicBio,
        fullName,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Perfil actualizado")
      router.refresh()
    })
  }

  function onAvatarChange(file: File | null) {
    if (!file) return
    const formData = new FormData()
    formData.set("avatar", file)
    startAvatarTransition(async () => {
      const result = await uploadOrganizerAvatar(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setAvatarUrl(result.data.url)
      toast.success("Foto actualizada")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-400/90">
          Tu Panel
        </p>
        <h1 className="text-3xl font-black tracking-tight text-white">
          Mi perfil de organizador
        </h1>
        <p className="text-sm leading-6 text-zinc-400">
          Así te van a ver los compradores en la ficha de tus eventos: logo,
          nombre público y una bajada corta.
        </p>
      </header>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-6 sm:p-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative">
            <div className="relative size-24 overflow-hidden rounded-full bg-violet-500/20 ring-2 ring-violet-500/30">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  fill
                  className="object-cover"
                  sizes="96px"
                  unoptimized
                />
              ) : (
                <span className="grid size-full place-items-center text-2xl font-black text-violet-200">
                  {initials}
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={avatarPending}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full",
                "border border-zinc-700 bg-zinc-900 text-zinc-200 shadow-lg hover:bg-zinc-800",
                avatarPending && "opacity-60",
              )}
              aria-label="Cambiar foto de perfil"
            >
              {avatarPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) =>
                onAvatarChange(event.target.files?.[0] ?? null)
              }
            />
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-white sm:justify-start">
              <UserRound className="size-4 text-zinc-500" aria-hidden="true" />
              Vista previa
            </p>
            <p className="mt-1 truncate text-lg font-bold text-white">
              {displayName}
            </p>
            <p className="mt-0.5 text-sm text-zinc-500">
              {publicBio.trim() || "Productora en Tokepass"}
            </p>
            <p className="mt-2 text-xs text-zinc-600">{initial.email}</p>
          </div>
        </div>

        <div className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="public-name">Nombre público</Label>
            <Input
              id="public-name"
              value={publicName}
              onChange={(event) => setPublicName(event.target.value)}
              placeholder='Ej: "Productora Tokepass", "En Vivo Producciones"'
              maxLength={80}
              className="h-11 border-zinc-800 bg-zinc-950"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="public-bio">Bajada / descripción corta</Label>
            <Textarea
              id="public-bio"
              value={publicBio}
              onChange={(event) => setPublicBio(event.target.value)}
              placeholder='Ej: "Productora en Tokepass", "Eventos masivos"'
              maxLength={160}
              rows={3}
              className="resize-none border-zinc-800 bg-zinc-950"
            />
            <p className="text-xs text-zinc-600">
              {publicBio.length}/160 · se muestra debajo de tu nombre en el
              evento.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full-name">Nombre interno (opcional)</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Nombre de la cuenta / contacto"
              className="h-11 border-zinc-800 bg-zinc-950"
            />
            <p className="text-xs text-zinc-600">
              Solo para tu panel. El público ve el nombre público.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <Button
            type="button"
            disabled={pending}
            onClick={onSave}
            className="h-11 rounded-xl bg-emerald-500 px-5 font-bold text-zinc-950 hover:bg-emerald-400"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar cambios
          </Button>
        </div>
      </section>
    </div>
  )
}
