"use client"

import { LoaderCircle, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useActionState, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"

import {
  signUpOrganizerAccount,
  type AuthActionState,
} from "@/app/actions/auth"
import { BrandLogo } from "@/components/shared/brand-logo"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: AuthActionState = {
  error: null,
  success: null,
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-11 w-full bg-violet-600 text-white hover:bg-violet-500"
    >
      {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      {pending ? "Creando cuenta..." : "Crear cuenta de Organizador"}
    </Button>
  )
}

export function OrganizerRegisterForm({
  initialError,
  nextPath,
}: {
  initialError?: string
  nextPath?: string | null
}) {
  const [state, registerAction] = useActionState(
    signUpOrganizerAccount,
    initialState,
  )
  const visibleError = state.error || initialError
  useEffect(() => {
    if (visibleError) toast.error(visibleError, { duration: 5000 })
  }, [visibleError])
  const safeNext =
    nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : null

  return (
    <Card className="w-full border border-border bg-card py-0 text-card-foreground shadow-2xl shadow-zinc-200/50 dark:shadow-black/30">
      <CardHeader className="border-b border-border px-7 py-7 text-center">
        <div className="mb-4 flex justify-center">
          <BrandLogo
            href="/"
            tagline="Organizadores"
            size="lg"
            className="flex-col items-center gap-3"
          />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
          Crear cuenta de Organizador
        </CardTitle>
        <CardDescription className="mx-auto max-w-sm leading-6 text-muted-foreground">
          Armá tu evento en el panel. La venta al público se habilita después
          de la auditoría de TokePass.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-7 py-7">
        <form action={registerAction} className="space-y-4">
          {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}

          <div className="grid gap-2">
            <Label htmlFor="organizer-full-name">Nombre</Label>
            <Input
              id="organizer-full-name"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="Tu nombre o productora"
              required
              minLength={2}
              className="h-11"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="organizer-register-email">Email</Label>
            <Input
              id="organizer-register-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="nombre@empresa.com"
              required
              className="h-11"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="organizer-register-password">Contraseña</Label>
            <Input
              id="organizer-register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="Tiene que tener al menos 8 caracteres"
              required
              className="h-11"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="organizer-register-phone">
              WhatsApp <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="organizer-register-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="11 1234 5678"
              className="h-11"
            />
          </div>

          {visibleError && (
            <p role="alert" className="text-sm text-red-400">
              {visibleError}
            </p>
          )}

          {state.success && (
            <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">
              {state.success}
            </p>
          )}

          <SubmitButton />
        </form>

        <div className="mt-5 flex flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground sm:flex-row sm:gap-2">
          <span>¿Ya tenés cuenta?</span>
          <Link
            href="/login-organizador"
            className="font-medium text-violet-700 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300"
          >
            Entrar a Tu Panel
          </Link>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
          Sin CUIT ni DNI para crear la cuenta. Cada evento se audita antes de
          habilitar la venta al público.
        </div>
      </CardContent>
    </Card>
  )
}
