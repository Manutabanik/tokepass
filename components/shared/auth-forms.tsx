"use client"

import { LoaderCircle, Mail } from "lucide-react"
import Link from "next/link"
import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"

import {
  signInWithGoogle,
  signInWithMagicLink,
  verifyEmailOtp,
  type AuthActionState,
} from "@/app/actions/auth"
import { WalletDeviceField } from "@/components/auth/wallet-device-field"
import { BrandLogo } from "@/components/shared/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

const initialState: AuthActionState = {
  error: null,
  success: null,
}

const AUTH_INPUT_CLASS =
  "h-12 min-h-12 rounded-xl border-border bg-background px-4 py-3.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-violet-500/80 focus-visible:ring-2 focus-visible:ring-violet-500/20 aria-invalid:border-red-500 aria-invalid:ring-2 aria-invalid:ring-red-500/20"

const RESEND_COOLDOWN_SECONDS = 60

function MagicLinkSubmit({ cooldownSeconds }: { cooldownSeconds: number }) {
  const { pending } = useFormStatus()
  const waiting = cooldownSeconds > 0

  return (
    <Button
      type="submit"
      disabled={pending || waiting}
      className="h-12 w-full cursor-pointer rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-[0_0_25px_rgba(147,51,234,0.18)] transition-all hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed"
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Mail className="size-4" />}
      {pending
        ? "Enviando enlace..."
        : waiting
          ? `Reenviar en ${cooldownSeconds}s`
          : "Enviar enlace de acceso"}
    </Button>
  )
}

/**
 * Vive dentro del form del OTP y apunta a otra acción con `formAction`.
 * `formNoValidate` es necesario porque el input del token es `required` y el
 * navegador bloquearía este submit con el campo vacío.
 */
function ResendOtpButton({
  action,
  cooldownSeconds,
}: {
  action: (formData: FormData) => void
  cooldownSeconds: number
}) {
  const { pending } = useFormStatus()
  const waiting = cooldownSeconds > 0

  return (
    <button
      type="submit"
      formAction={action}
      formNoValidate
      disabled={pending || waiting}
      aria-live="polite"
      className="w-full cursor-pointer text-center text-xs font-medium text-muted-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
    >
      {waiting ? `Reenviar en ${cooldownSeconds}s` : "Solicitar nuevo código"}
    </button>
  )
}

function VerifyOtpSubmit() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-12 w-full cursor-pointer rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-[0_0_25px_rgba(147,51,234,0.18)] transition-all hover:from-purple-500 hover:to-indigo-500 disabled:cursor-not-allowed"
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {pending ? "Verificando..." : "Verificar Código"}
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
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
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
  useEffect(() => {
    if (state.error) {
      toast.error(state.error, { duration: 5000 })
    }
    if (state.success) {
      toast.success(state.success, { duration: 5000 })
    }
  }, [state.error, state.success])

  if (state.error) {
    return (
      <p role="alert" className="text-xs font-medium text-red-500">
        {state.error}
      </p>
    )
  }

  if (state.success) {
    return (
      <p role="status" className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
        {state.success}
      </p>
    )
  }

  return null
}

export function AuthForms({
  initialError,
  nextPath,
}: {
  initialError?: string
  initialMode?: "login" | "register"
  nextPath?: string | null
}) {
  const [isOtpSent, setIsOtpSent] = useState(false)
  const [email, setEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [cooldown, setCooldown] = useState<{
    email: string
    until: number
  } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [magicState, magicAction] = useActionState(
    async (previous: AuthActionState, formData: FormData) => {
      const result = await signInWithMagicLink(previous, formData)
      if (result.success) {
        setIsOtpSent(true)
        // Reenviar invalida el código anterior; dejarlo tipeado sólo produce
        // un "código inválido" al verificar.
        setOtpCode("")
        setCooldown({
          email: String(formData.get("email") ?? "").trim().toLowerCase(),
          until: Date.now() + RESEND_COOLDOWN_SECONDS * 1000,
        })
        setSecondsLeft(RESEND_COOLDOWN_SECONDS)
      }
      return result
    },
    initialState,
  )
  const [otpState, otpAction] = useActionState(verifyEmailOtp, initialState)

  // Se recalcula desde la fecha límite en vez de restar 1 por tick: una pestaña
  // en segundo plano throttlea los timers y un contador decremental se atrasaría.
  // El valor inicial lo fija quien pide el código, no este efecto.
  useEffect(() => {
    if (!cooldown) return

    const { until } = cooldown
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) setCooldown(null)
    }, 250)

    return () => clearInterval(timer)
  }, [cooldown])

  // El cooldown es por dirección: corregir un mail mal tipeado no debe esperar,
  // pero pedir otro código para el mismo destino sí.
  const cooldownSeconds =
    cooldown && cooldown.email === email.trim().toLowerCase() ? secondsLeft : 0

  const bannerError =
    magicState.error || magicState.success || otpState.error
      ? null
      : (initialError ?? null)
  const safeNext =
    nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : null

  return (
    <div className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-card/95 p-8 text-card-foreground shadow-2xl shadow-zinc-200/60 backdrop-blur-xl dark:shadow-black/40 sm:p-10">
      <div className="mb-5 flex justify-center">
        <BrandLogo href="/" size="lg" />
      </div>
      <span className="mb-2 block text-center font-mono text-xs font-bold uppercase tracking-widest text-violet-700 dark:text-purple-400">
        Acceso rápido
      </span>
      <h1 className="mb-1.5 text-center text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        Ingresar a mi cuenta
      </h1>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        Google o un enlace al mail. Sin contraseña. Tus entradas quedan en tu
        cuenta.
      </p>

      {bannerError ? (
        <p role="alert" className="mb-4 text-center text-xs font-medium text-red-500">
          {bannerError}
        </p>
      ) : null}

      <form action={signInWithGoogle}>
        {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}
        <WalletDeviceField />
        <GoogleSubmitButton />
      </form>

      <div className="my-6 flex items-center gap-3">
        <Separator className="flex-1 bg-border" />
        <span className="shrink-0 px-3 font-mono text-xs uppercase text-muted-foreground">
          O con email
        </span>
        <Separator className="flex-1 bg-border" />
      </div>

      {isOtpSent ? (
        <form action={otpAction}>
          {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}
          <input type="hidden" name="email" value={email} />
          <WalletDeviceField />
          <div className="mb-6 space-y-4">
            <div>
              <label
                htmlFor="login-otp"
                className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Código de 6 dígitos
              </label>
              <Input
                id="login-otp"
                type="text"
                name="token"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="000000"
                value={otpCode}
                onChange={(event) =>
                  setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                aria-invalid={Boolean(otpState.error)}
                className={`${AUTH_INPUT_CLASS} tracking-[0.35em]`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Enviado a {email || "tu correo"}.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <ActionMessage
              state={otpState.error ? otpState : magicState}
            />
            <VerifyOtpSubmit />
            <ResendOtpButton
              action={magicAction}
              cooldownSeconds={cooldownSeconds}
            />
            <button
              type="button"
              onClick={() => {
                setIsOtpSent(false)
                setOtpCode("")
              }}
              className="w-full text-center text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Usar otro correo
            </button>
          </div>
        </form>
      ) : (
        <form action={magicAction}>
          {safeNext ? <input type="hidden" name="next" value={safeNext} /> : null}
          <WalletDeviceField />
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
                placeholder="tu@email.com"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(magicState.error)}
                className={AUTH_INPUT_CLASS}
              />
            </div>
          </div>
          <div className="space-y-4">
            <ActionMessage state={magicState} />
            <MagicLinkSubmit cooldownSeconds={cooldownSeconds} />
          </div>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        ¿Organizás eventos?{" "}
        <Link
          href="/login-organizador"
          className="font-semibold text-foreground underline-offset-4 hover:underline"
        >
          Entrar al panel
        </Link>
      </p>
    </div>
  )
}
