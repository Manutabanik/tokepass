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
  deleteAccount,
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
  const [deletePending, startDeleteTransition] = useTransition()
  const [deleteConfirm, setDeleteConfirm] = useState("")

  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") || initial.email
  const initials = getInitials(displayName, initial.email)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const fullName = [firstName.trim(), lastName.trim()]
      .filter(Boolean)
      .join(" ")

    if (fullName.length < 2) {
      toast.error("Escribí tu nombre y apellido tal como figuran en tu DNI")
      return
    }

    const dniDigits = dni.replace(/\D/g, "")
    if (dniDigits && (dniDigits.length < 7 || dniDigits.length > 11)) {
      toast.error("Ingresá un DNI válido (solo números, sin puntos)")
      return
    }

    const phoneDigits = phone.replace(/\D/g, "")
    if (phone.trim() && phoneDigits.length < 8) {
      toast.error("Ingresá un número de celular válido")
      return
    }

    startTransition(async () => {
      const result = await updateMyAccountProfile({ fullName, dni, phone })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("¡Listo! Cambios guardados correctamente")
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
            <AvatarFallback className="bg-gradient-to-br from-emerald-500/25 to-teal-500/15 text-2xl font-bold text-emerald-800 dark:text-emerald-100">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            disabled={avatarPending}
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 grid size-10 place-items-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:bg-muted disabled:opacity-60"
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
          <p className="text-base font-semibold text-foreground">{displayName}</p>
          <p className="text-sm text-muted-foreground">{initial.email}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            JPG, PNG o WEBP · máx. 2 MB
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <UserRound
              className="size-4 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300/90">
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
                className="min-h-12 border-input bg-background text-base text-foreground placeholder:text-muted-foreground/70"
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
                className="min-h-12 border-input bg-background text-base text-foreground placeholder:text-muted-foreground/70"
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
              className="min-h-12 border-input bg-background text-base text-foreground placeholder:text-muted-foreground/70"
            />
            <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/80">
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
              className="min-h-12 border-input bg-background text-base text-foreground placeholder:text-muted-foreground/70"
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield
              className="size-4 text-violet-700 dark:text-violet-300"
              aria-hidden="true"
            />
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300/90">
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
              className="min-h-12 border-input bg-muted text-base text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Es tu acceso a TokePass y no se edita acá.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={passwordPending}
            onClick={handlePasswordReset}
            className="min-h-12 w-full rounded-2xl border-border bg-background text-foreground hover:bg-muted"
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
          className="min-h-12 w-full rounded-2xl bg-emerald-500 text-base font-bold text-black hover:bg-emerald-600"
        >
          {pending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Guardar cambios
        </Button>
      </form>

      <section className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-destructive">
          Eliminar cuenta
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Anonimizamos tu nombre, email, DNI, telefono y titulares de entradas.
          Conservamos comprobantes de pago y liquidaciones por obligación
          contable (Ley 25.326).
        </p>
        <Label htmlFor="account-delete-confirm">
          Escribí ELIMINAR para confirmar
        </Label>
        <Input
          id="account-delete-confirm"
          value={deleteConfirm}
          onChange={(event) => setDeleteConfirm(event.target.value)}
          autoComplete="off"
          className="min-h-12 border-input bg-background text-base"
        />
        <Button
          type="button"
          variant="destructive"
          disabled={deletePending || deleteConfirm.trim().toUpperCase() !== "ELIMINAR"}
          onClick={() => {
            startDeleteTransition(async () => {
              const result = await deleteAccount()
              if (result && "success" in result && result.success === false) {
                toast.error(result.error)
              }
            })
          }}
          className="min-h-12 w-full rounded-2xl"
        >
          {deletePending ? (
            <LoaderCircle className="animate-spin" />
          ) : null}
          Eliminar mi cuenta
        </Button>
      </section>
    </div>
  )
}
