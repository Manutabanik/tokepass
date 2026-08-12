"use client"

import { LoaderCircle, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import {
  signInWithEmail,
  signUpOrganizer,
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

function SubmitButton({ mode }: { mode: "login" | "register" }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-11 w-full bg-violet-600 text-white hover:bg-violet-500"
    >
      {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      {pending
        ? "Procesando..."
        : mode === "login"
          ? "Entrar a Tu Panel"
          : "Crear cuenta de organizador"}
    </Button>
  )
}

export function OrganizerAuthForm({
  mode,
  initialError,
}: {
  mode: "login" | "register"
  initialError?: string
}) {
  const [loginState, loginAction] = useActionState(
    signInWithEmail,
    initialState,
  )
  const [registerState, registerAction] = useActionState(
    signUpOrganizer,
    initialState,
  )
  const state = mode === "login" ? loginState : registerState
  const visibleError = state.error || initialError

  return (
    <Card className="w-full border-0 bg-white/[0.04] py-0 text-white ring-1 ring-white/10 shadow-2xl shadow-black/30">
      <CardHeader className="border-b border-white/8 px-7 py-7 text-center">
        <div className="mb-4 flex justify-center">
          <BrandLogo
            inverted
            href="/"
            tagline="Organizadores"
            size="lg"
            className="flex-col items-center gap-3"
          />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          {mode === "login"
            ? "Acceso para organizadores"
            : "Creá tu organización"}
        </CardTitle>
        <CardDescription className="mx-auto max-w-sm leading-6 text-zinc-500">
          {mode === "login"
            ? "Gestioná eventos, ventas, accesos y equipos desde un solo lugar."
            : "Publicá experiencias y administrá toda tu operación con Tokepass."}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-7 py-7">
        <form
          action={mode === "login" ? loginAction : registerAction}
          className="space-y-4"
        >
          {mode === "register" && (
            <div className="grid gap-2">
              <Label htmlFor="organizer-name" className="text-zinc-300">
                Nombre completo
              </Label>
              <Input
                id="organizer-name"
                name="fullName"
                autoComplete="name"
                placeholder="Tu nombre"
                required
                className="h-11 border-white/10 bg-black/20"
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="organizer-email" className="text-zinc-300">
              Email profesional
            </Label>
            <Input
              id="organizer-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="nombre@empresa.com"
              required
              className="h-11 border-white/10 bg-black/20"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="organizer-password" className="text-zinc-300">
              Contraseña
            </Label>
            <Input
              id="organizer-password"
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={8}
              placeholder="Mínimo 8 caracteres"
              required
              className="h-11 border-white/10 bg-black/20"
            />
          </div>

          {mode === "register" ? (
            <div className="grid gap-2">
              <Label htmlFor="organizer-invite" className="text-zinc-300">
                Código de invitación{" "}
                <span className="text-zinc-600">(si aplica)</span>
              </Label>
              <Input
                id="organizer-invite"
                name="inviteCode"
                autoComplete="off"
                placeholder="Solo si el registro es invite-only"
                className="h-11 border-white/10 bg-black/20"
              />
            </div>
          ) : null}

          {visibleError && (
            <p role="alert" className="text-sm text-red-400">
              {visibleError}
            </p>
          )}

          {state.success && (
            <p
              role="status"
              className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"
            >
              {state.success}
            </p>
          )}

          <SubmitButton mode={mode} />
        </form>

        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-zinc-500">
          {mode === "login" ? "¿Primera vez en Tokepass?" : "¿Ya tienes cuenta?"}
          <Link
            href={
              mode === "login"
                ? "/register-organizador"
                : "/login-organizador"
            }
            className="font-medium text-violet-400 hover:text-violet-300"
          >
            {mode === "login" ? "Crear organización" : "Ingresar"}
          </Link>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl bg-white/[0.025] p-3 text-xs leading-5 text-zinc-500">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet-400" />
          El acceso al panel se valida en el servidor y requiere un perfil de
          organizador activo.
        </div>
      </CardContent>
    </Card>
  )
}
