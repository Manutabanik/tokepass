"use client"

import { Globe, LoaderCircle } from "lucide-react"
import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  type AuthActionState,
} from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const initialState: AuthActionState = {
  error: null,
  success: null,
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-11 w-full bg-violet-600 text-white hover:bg-violet-700"
    >
      {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : label}
    </Button>
  )
}

function GoogleSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      className="h-12 w-full rounded-xl border-zinc-200 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50"
    >
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <Globe className="text-blue-600" aria-hidden="true" />
      )}
      {pending ? "Conectando con Google..." : "Continuar con Google"}
    </Button>
  )
}

function ActionMessage({ state }: { state: AuthActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="px-1 text-sm text-red-600">
        {state.error}
      </p>
    )
  }

  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
      >
        {state.success}
      </p>
    )
  }

  return null
}

export function AuthForms({
  initialError,
  initialMode = "login",
  nextPath,
}: {
  initialError?: string
  initialMode?: "login" | "register"
  nextPath?: string
}) {
  const [mode, setMode] = useState<"login" | "register">(initialMode)
  const [loginState, loginAction] = useActionState(
    signInWithEmail,
    initialState,
  )
  const [registerState, registerAction] = useActionState(
    signUpWithEmail,
    initialState,
  )

  const isLogin = mode === "login"
  const visibleLoginState =
    loginState.error || loginState.success
      ? loginState
      : { error: initialError ?? null, success: null }
  const safeNext =
    nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : null

  return (
    <div className="w-full rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-950/5">
      <p className="text-sm font-semibold text-violet-600">Bienvenido</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">
        {isLogin ? "Ingresa a Tokepass" : "Crea tu cuenta"}
      </h1>
      {safeNext ? (
        <p className="mt-2 text-sm text-zinc-500">
          Iniciá sesión para continuar con tu compra.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 rounded-xl bg-zinc-100 p-1">
        {(["login", "register"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              mode === item
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-500 hover:text-zinc-800",
            )}
          >
            {item === "login" ? "Ingresar" : "Registrarme"}
          </button>
        ))}
      </div>

      <form action={signInWithGoogle} className="mt-6">
        <GoogleSubmitButton />
      </form>

      <div className="my-6 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="shrink-0 text-xs font-medium text-zinc-400">
          O continúa con email
        </span>
        <Separator className="flex-1" />
      </div>

      {isLogin ? (
        <form action={loginAction} className="space-y-4">
          {safeNext ? (
            <input type="hidden" name="next" value={safeNext} />
          ) : null}
          <Input
            type="email"
            name="email"
            placeholder="tu@email.com"
            aria-label="Correo electrónico"
            autoComplete="email"
            required
            className="h-11"
          />
          <Input
            type="password"
            name="password"
            placeholder="Contraseña"
            aria-label="Contraseña"
            autoComplete="current-password"
            required
            className="h-11"
          />
          <ActionMessage state={visibleLoginState} />
          <SubmitButton label="Ingresar" pendingLabel="Ingresando..." />
        </form>
      ) : (
        <form action={registerAction} className="space-y-4">
          <Input
            type="text"
            name="fullName"
            placeholder="Nombre completo"
            aria-label="Nombre completo"
            autoComplete="name"
            className="h-11"
          />
          <Input
            type="email"
            name="email"
            placeholder="tu@email.com"
            aria-label="Correo electrónico"
            autoComplete="email"
            required
            className="h-11"
          />
          <Input
            type="password"
            name="password"
            placeholder="Mínimo 8 caracteres"
            aria-label="Contraseña"
            autoComplete="new-password"
            minLength={8}
            required
            className="h-11"
          />
          <ActionMessage state={registerState} />
          <SubmitButton
            label="Crear cuenta"
            pendingLabel="Creando cuenta..."
          />
        </form>
      )}
    </div>
  )
}
