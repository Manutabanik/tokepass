"use client"

import {
  Camera,
  Check,
  KeyRound,
  LoaderCircle,
  Shield,
  UserRound,
} from "lucide-react"
import { useRouter } from "next/navigation"
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react"
import { toast } from "sonner"

import {
  requestPasswordResetEmail,
  updateMyAccountProfile,
  uploadMyAvatar,
} from "@/app/actions/account"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getInitials } from "@/lib/format"

function splitFullName(fullName: string): { first: string; last: string } {
  const trimmed = fullName.trim()
  if (!trimmed) return { first: "", last: "" }
  const space = trimmed.indexOf(" ")
  if (space < 0) return { first: trimmed, last: "" }
  return {
    first: trimmed.slice(0, space).trim(),
    last: trimmed.slice(space + 1).trim(),
  }
}

export function AccountProfileForm({
  initial,
}: {
  initial: {
    email: string
    fullName: string
    dni: string
    phone: string
    avatarUrl: string | null
  }
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const split = useMemo(
    () => splitFullName(initial.fullName),
    [initial.fullName],
  )
  const [firstName, setFirstName] = useState(split.first)
  const [lastName, setLastName] = useState(split.last)
  const [dni, setDni] = useState(initial.dni)
  const [phone, setPhone] = useState(initial.phone)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)
  const [pending, startTransition] = useTransition()
  const [avatarPending, startAvatarTransition] = useTransition()
  const [passwordPending, startPasswordTransition] = useTransition()

  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || initial.email
  const initials = getInitials(displayName, initial.email)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const fullName = [firstName.trim(), lastName.trim()]
      .filter(Boolean)
      .join(" ")

    if (fullName.length < 2) {
      toast.error("Ingresá tu nombre y apellido.")
      return
    }

    const dniDigits = dni.replace(/\D/g, "")
    if (dniDigits && (dniDigits.length < 7 || dniDigits.length > 11)) {
      toast.error("El DNI / CUIL no parece válido. Usá solo números.")
      return
    }

    const phoneDigits = phone.replace(/\D/g, "")
    if (phone.trim() && phoneDigits.length < 8) {
      toast.error("El teléfono no parece válido. Incluí el código de área.")
      return
    }

    startTransition(async () => {
      const result = await updateMyAccountProfile({ fullName, dni, phone })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Cambios guardados")
      router.refresh()
    })
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error("La foto no puede superar los 2 MB.")
      event.target.value = ""
      return
    }
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Usá JPG, PNG o WEBP.")
      event.target.value = ""
      return
    }

    const formData = new FormData()
    formData.set("avatar", file)

    startAvatarTransition(async () => {
      const result = await uploadMyAvatar(formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setAvatarUrl(result.url)
      toast.success("Foto de perfil actualizada")
      router.refresh()
    })
  }

  function handlePasswordReset() {
    startPasswordTransition(async () => {
      const result = await requestPasswordResetEmail()
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Te enviamos un email para cambiar la contraseña.")
    })
  }

  return (
    <div className="space-y-8">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative">
          <Avatar className="size-24 bg-emerald-500/15 ring-2 ring-emerald-500/25">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt="" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-gradient-to-br from-emerald-500/25 to-teal-500/15 text-2xl font-bold text-emerald-100">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            disabled={avatarPending}
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 grid size-10 place-items-center rounded-full border border-white/15 bg-zinc-900 text-white shadow-lg transition hover:bg-zinc-800 disabled:opacity-60"
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
            className="sr-only"
            onChange={handleAvatarChange}
          />
        </div>
        <div className="text-center sm:pt-2 sm:text-left">
          <p className="text-base font-semibold text-white">{displayName}</p>
          <p className="text-sm text-zinc-500">{initial.email}</p>
          <p className="mt-2 text-xs text-zinc-500">
            JPG, PNG o WEBP · máx. 2 MB
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-emerald-400" aria-hidden="true" />
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-300/90">
              Datos personales
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-first">Nombre</Label>
              <Input
                id="account-first"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="Ej. Ana"
                autoComplete="given-name"
                required
                className="min-h-12 border-white/10 bg-black/30 text-base text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-last">Apellido</Label>
              <Input
                id="account-last"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Ej. Pérez"
                autoComplete="family-name"
                className="min-h-12 border-white/10 bg-black/30 text-base text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-dni">DNI</Label>
            <Input
              id="account-dni"
              inputMode="numeric"
              value={dni}
              onChange={(event) =>
                setDni(event.target.value.replace(/\D/g, "").slice(0, 11))
              }
              placeholder="Solo números"
              autoComplete="off"
              className="min-h-12 border-white/10 bg-black/30 text-base text-white"
            />
            <p className="text-xs leading-relaxed text-amber-200/80">
              El DNI se utiliza para validar tus entradas físicas si no tenés el
              celular encima.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-phone">Teléfono / WhatsApp</Label>
            <Input
              id="account-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Ej. 11 2345 6789"
              autoComplete="tel"
              className="min-h-12 border-white/10 bg-black/30 text-base text-white"
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-violet-300" aria-hidden="true" />
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-violet-300/90">
              Cuenta y seguridad
            </h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={initial.email}
              disabled
              className="min-h-12 border-white/10 bg-black/30 text-base text-zinc-400"
            />
            <p className="text-xs text-zinc-500">
              Es tu acceso a Tokepass y no se edita acá.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={passwordPending}
            onClick={handlePasswordReset}
            className="min-h-12 w-full rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            {passwordPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Cambiar contraseña
          </Button>
        </section>

        <Button
          type="submit"
          disabled={pending}
          className="min-h-12 w-full rounded-2xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-500"
        >
          {pending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Guardar cambios
        </Button>
      </form>
    </div>
  )
}
