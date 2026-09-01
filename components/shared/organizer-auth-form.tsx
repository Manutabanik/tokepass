"use client"

import { LoaderCircle, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useActionState, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"

import { signInWithEmail, type AuthActionState } from "@/app/actions/auth"
import { WalletDeviceField } from "@/components/auth/wallet-device-field"
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
      {pending ? "Procesando..." : "Entrar a Tu Panel"}
    </Button>
  )
}

export function OrganizerAuthForm({
  initialError,
  nextPath,
}: {
  initialError?: string
  nextPath?: string | null
}) {
  const [state, loginAction] = useActionState(signInWithEmail, initialState)
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
          Acceso para organizadores
        </CardTitle>
        <CardDescription className="mx-auto max-w-sm leading-6 text-muted-foreground">
          Gestioná eventos, ventas, accesos y equipos desde un solo lugar.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-7 py-7">
        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="loginSource" value="organizer" />
          {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}
          <WalletDeviceField />

          <div className="grid gap-2">
            <Label htmlFor="organizer-email">Email profesional</Label>
            <Input
              id="organizer-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="nombre@empresa.com"
              required
              className="h-11"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="organizer-password">Contraseña</Label>
            <Input
              id="organizer-password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              placeholder="Tiene que tener al menos 8 caracteres"
              required
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
          <span>¿Todavía no tenés cuenta?</span>
          <Link
            href="/register-organizador"
            className="font-medium text-violet-700 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300"
          >
            Crear cuenta de Organizador
          </Link>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
          Podés crear la cuenta y armar el evento. La venta al público se
          habilita después de la auditoría de TokePass.
        </div>
      </CardContent>
    </Card>
  )
}
