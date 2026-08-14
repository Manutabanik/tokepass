"use client"

import { LoaderCircle } from "lucide-react"
import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  type AuthActionState,
} from "@/app/actions/auth"
import { BrandLogo } from "@/components/shared/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const initialState: AuthActionState = {
  error: null,
  success: null,
}

const AUTH_INPUT_CLASS =
  "h-12 min-h-12 rounded-xl border-border bg-background px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-violet-500/80 focus-visible:ring-2 focus-visible:ring-violet-500/20"

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
      className="h-12 w-full cursor-pointer rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-[0_0_25px_rgba(147,51,234,0.18)] transition-all hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed"
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
      disabled={pending}
      className="h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted"
    >
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          aria-hidden="true"
        >
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.54c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.39 13.86A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.86V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.62Z"
          />
          <path
            fill="#EA4335"
            d="M12 6.01c1.47 0 2.79.5 3.83 1.5l2.88-2.87A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z"
          />
        </svg>
      )}
      {pending ? "Conectando con Google..." : "Continuar con Google"}
    </Button>
  )
}

function ActionMessage({ state }: { state: AuthActionState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
      >
        {state.error}
      </p>
    )
  }

  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-300"
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
  nextPath?: string | null
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
  const safeNext = nextPath?.startsWith("/") && !nextPath.startsWith("//")
    ? nextPath
    : null

  return (
    <div className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-card/95 p-8 text-card-foreground shadow-2xl shadow-zinc-200/60 backdrop-blur-xl dark:shadow-black/40 sm:p-10">
      <div className="mb-5 flex justify-center">
        <BrandLogo href="/" size="lg" />
      </div>
      <span className="mb-2 block text-center font-mono text-xs font-bold uppercase tracking-widest text-violet-700 dark:text-purple-400">
        Bienvenido
      </span>
      <h1 className="mb-1.5 text-center text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        {isLogin ? "Ingresá a tu cuenta" : "Creá tu cuenta"}
      </h1>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        {isLogin
          ? "Tus entradas, beneficios y experiencias en un solo lugar."
          : "Registrate para descubrir eventos y guardar tus entradas."}
      </p>

      <div className="mb-6 grid grid-cols-2 rounded-2xl border border-border bg-muted/60 p-1.5">
        {(["login", "register"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            className={cn(
              "cursor-pointer rounded-xl border py-2.5 text-center text-sm transition-all",
              mode === item
                ? "border-border bg-background font-semibold text-foreground shadow-md"
                : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {item === "login" ? "Ingresar" : "Registrarme"}
          </button>
        ))}
      </div>

      <form action={signInWithGoogle}>
        <GoogleSubmitButton />
      </form>

      <div className="my-6 flex items-center gap-3">
        <Separator className="flex-1 bg-border" />
        <span className="shrink-0 px-3 font-mono text-xs uppercase text-muted-foreground">
          O continúa con email
        </span>
        <Separator className="flex-1 bg-border" />
      </div>

      {isLogin ? (
        <form action={loginAction}>
          {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}
          <div className="mb-6 space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Correo electrónico
              </label>
              <Input
                id="login-email"
                type="email"
                name="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Tu Email"
                autoComplete="email"
                required
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Contraseña
              </label>
              <Input
                id="login-password"
                type="password"
                name="password"
                placeholder="Ingresá tu contraseña"
                autoComplete="current-password"
                required
                className={AUTH_INPUT_CLASS}
              />
            </div>
          </div>
          <div className="space-y-4">
            <ActionMessage state={visibleLoginState} />
            <SubmitButton label="Ingresar" pendingLabel="Ingresando..." />
          </div>
        </form>
      ) : (
        <form action={registerAction}>
          {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}
          <div className="mb-6 space-y-4">
            <div>
              <label
                htmlFor="register-name"
                className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Nombre completo
              </label>
              <Input
                id="register-name"
                type="text"
                name="fullName"
                placeholder="Tu nombre"
                autoComplete="name"
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor="register-email"
                className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Correo electrónico
              </label>
              <Input
                id="register-email"
                type="email"
                name="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Tu Email"
                autoComplete="email"
                required
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <div>
              <label
                htmlFor="register-password"
                className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Contraseña
              </label>
              <Input
                id="register-password"
                type="password"
                name="password"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                minLength={8}
                required
                className={AUTH_INPUT_CLASS}
              />
            </div>
          </div>
          <div className="space-y-4">
            <ActionMessage state={registerState} />
            <SubmitButton
              label="Crear cuenta"
              pendingLabel="Creando cuenta..."
            />
          </div>
        </form>
      )}
    </div>
  )
}
