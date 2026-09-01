"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { clearSupabaseAuthCookies } from "@/lib/auth/clear-auth-cookies"
import {
  AUTH_NEXT_COOKIE,
  authNextCookieOptions,
  buildAuthCallbackUrl,
  resolveAuthRequestOrigin,
} from "@/lib/auth/callback-url"
import {
  WALLET_DEVICE_FORM_FIELD,
  WALLET_DEVICE_MISMATCH_MESSAGE,
} from "@/lib/auth/wallet-device"
import { bindWalletDeviceForCurrentUser } from "@/lib/auth/wallet-device-server"
import {
  getFreshLoginProfile,
  postLoginDestination,
  safeInternalNextPath,
  type FreshLoginProfile,
} from "@/lib/auth/post-login"
import { logger } from "@/lib/logger"
import { DEFAULT_ORGANIZER_SERVICE_CHARGE_RATE } from "@/lib/pricing/event-fees"
import { getRequestIp } from "@/lib/request-ip"
import {
  AUTH_RATE_LIMIT_ERROR,
  consumeNamedRateLimit,
} from "@/lib/security/distributed-rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export interface AuthActionState {
  error: string | null
  success: string | null
}

async function assertAuthIpRateLimit(): Promise<AuthActionState | null> {
  const ip = await getRequestIp()
  const allowed = await consumeNamedRateLimit("authIp", ip)
  if (allowed) return null
  return { error: AUTH_RATE_LIMIT_ERROR, success: null }
}

async function resolveRequestAuthOrigin() {
  const requestHeaders = await headers()
  return resolveAuthRequestOrigin({
    origin: requestHeaders.get("origin"),
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    host: requestHeaders.get("host"),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  })
}

async function persistAuthNextPath(next?: string | null) {
  const store = await cookies()
  const safe = safeInternalNextPath(next)
  if (!safe) {
    store.delete(AUTH_NEXT_COOKIE)
    return
  }
  store.set(AUTH_NEXT_COOKIE, safe, authNextCookieOptions())
}

async function getAuthCallbackUrl(next?: string | null) {
  return buildAuthCallbackUrl(await resolveRequestAuthOrigin(), next)
}

function isInvalidLoginCredentials(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials")
  )
}

function mapAuthErrorMessage(message: string): string {
  const normalized = message.toLowerCase()
  if (isInvalidLoginCredentials(message)) {
    return "El mail o la contraseña no son correctos. Revisalos y probá otra vez"
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirmá tu email antes de ingresar. Revisá tu bandeja de entrada."
  }
  if (
    normalized.includes("user already registered") ||
    normalized.includes("already been registered")
  ) {
    return "Este email ya está registrado. Iniciá sesión o recuperá tu contraseña."
  }
  if (normalized.includes("password should be at least")) {
    return "Tiene que tener al menos 8 caracteres"
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Demasiados intentos. Esperá un momento e intentá de nuevo."
  }
  if (normalized.includes("signup is disabled")) {
    return "El registro está temporalmente deshabilitado."
  }
  if (normalized.includes("is invalid") && normalized.includes("email")) {
    return "Escribí un correo válido (ej: nombre@gmail.com)"
  }
  if (normalized.includes("otp") || normalized.includes("magic")) {
    return "No pudimos enviar el enlace. Revisá el email e intentá de nuevo."
  }
  return message
}

function mapOtpVerifyError(message: string): string {
  const normalized = message.toLowerCase()
  if (
    normalized.includes("invalid") ||
    normalized.includes("expired") ||
    normalized.includes("otp") ||
    normalized.includes("token")
  ) {
    return "El código no es válido o venció. Pedí uno nuevo."
  }
  return mapAuthErrorMessage(message)
}

async function destroyAuthSession(): Promise<void> {
  const supabase = await createClient()
  try {
    await supabase.auth.signOut({ scope: "local" })
  } catch {
    // Las cookies se borran igual para no dejar una sesión zombie.
  }
  await clearSupabaseAuthCookies()
}

async function bindWalletDeviceFromForm(formData?: FormData): Promise<void> {
  await bindWalletDeviceForCurrentUser(
    formData?.get(WALLET_DEVICE_FORM_FIELD),
  )
}

function readCredentials(formData: FormData) {
  const email = formData.get("email")
  const password = formData.get("password")

  if (typeof email !== "string" || !email.trim()) {
    return {
      ok: false,
      error: "El correo electrónico es obligatorio.",
    } as const
  }

  if (typeof password !== "string" || !password) {
    return { ok: false, error: "La contraseña es obligatoria." } as const
  }

  return {
    ok: true,
    email: email.trim().toLowerCase(),
    password,
    next: safeInternalNextPath(formData.get("next")),
  } as const
}

async function resolveLoginProfile(
  userId: string,
): Promise<FreshLoginProfile | null> {
  try {
    return await getFreshLoginProfile(userId)
  } catch (profileError) {
    logger.error({
      context: "auth/login",
      message: "fresh_profile_lookup_failed_fallback",
      userId,
      error: profileError,
    })

    // Fallback: own-profile RLS (login must not hard-fail if service role hiccups).
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("role, organizer_approval_status")
      .eq("id", userId)
      .maybeSingle()

    if (error) {
      throw new Error(`profile_fallback_failed: ${error.message}`)
    }
    if (!data) return null

    return {
      role: data.role,
      organizerApprovalStatus: data.organizer_approval_status,
    }
  }
}

export async function signUpWithEmail(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const limited = await assertAuthIpRateLimit()
  if (limited) return limited

  const credentials = readCredentials(formData)

  if (!credentials.ok) {
    return { error: credentials.error, success: null }
  }

  if (credentials.password.length < 8) {
    return {
      error: "Tiene que tener al menos 8 caracteres",
      success: null,
    }
  }

  const fullName = formData.get("fullName")
  const emailRedirectTo = await getAuthCallbackUrl()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: {
      data: {
        full_name:
          typeof fullName === "string" && fullName.trim()
            ? fullName.trim()
            : null,
      },
      emailRedirectTo,
    },
  })

  if (error) {
    return { error: mapAuthErrorMessage(error.message), success: null }
  }

  // Supabase may return a fake user with empty identities when email exists.
  if (data.user && !data.user.identities?.length) {
    return {
      error:
        "Este email ya está registrado. Iniciá sesión o utilizá otra cuenta.",
      success: null,
    }
  }

  if (data.session) {
    await bindWalletDeviceFromForm(formData)
    redirect(credentials.next || "/")
  }

  return {
    error: null,
    success: "Cuenta creada. Revisá tu correo para confirmar el registro.",
  }
}

export async function signUpOrganizer(): Promise<AuthActionState> {
  redirect("/register-organizador")
}

async function promoteProfileToOrganizer(
  userId: string,
  extras?: {
    email?: string
    fullName?: string | null
    phone?: string | null
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: existing } = await admin
    .from("profiles")
    .select("organizer_approval_status")
    .eq("id", userId)
    .maybeSingle()

  const currentStatus = existing?.organizer_approval_status
  if (
    currentStatus === "approved" ||
    currentStatus === "rejected" ||
    currentStatus === "suspended"
  ) {
    return { ok: true }
  }

  const patch = {
    role: "admin" as const,
    organizer_approval_status: "pending" as const,
    updated_at: now,
    ...(extras?.fullName?.trim() ? { full_name: extras.fullName.trim() } : {}),
    ...(extras?.phone?.trim() ? { phone: extras.phone.trim() } : {}),
  }

  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("id")
    .maybeSingle()

  if (data) return { ok: true }

  if (extras?.email) {
    const { error: upsertError } = await admin.from("profiles").upsert({
      id: userId,
      email: extras.email,
      full_name: extras.fullName?.trim() || null,
      public_name: extras.fullName?.trim() || null,
      public_bio: null,
      avatar_url: null,
      phone: extras.phone?.trim() || null,
      role: "admin",
      organizer_approval_status: "pending",
      service_charge_rate: DEFAULT_ORGANIZER_SERVICE_CHARGE_RATE,
    })
    if (!upsertError) return { ok: true }
    logger.error({
      context: "auth/organizer-signup",
      message: "promote_upsert_failed",
      userId,
      error: upsertError,
    })
    return { ok: false, error: upsertError.message }
  }

  logger.error({
    context: "auth/organizer-signup",
    message: "promote_update_failed",
    userId,
    error,
  })
  return {
    ok: false,
    error: error?.message ?? "No se pudo activar tu cuenta de organizador.",
  }
}

export async function signUpOrganizerAccount(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const limited = await assertAuthIpRateLimit()
  if (limited) return limited

  const credentials = readCredentials(formData)

  if (!credentials.ok) {
    return { error: credentials.error, success: null }
  }

  if (credentials.password.length < 8) {
    return {
      error: "Tiene que tener al menos 8 caracteres",
      success: null,
    }
  }

  const fullNameRaw = formData.get("fullName")
  const phoneRaw = formData.get("phone")
  const fullName =
    typeof fullNameRaw === "string" && fullNameRaw.trim()
      ? fullNameRaw.trim()
      : null
  const phone =
    typeof phoneRaw === "string" && phoneRaw.trim() ? phoneRaw.trim() : null

  const emailRedirectTo = await getAuthCallbackUrl("/admin")
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: {
      data: {
        full_name: fullName,
        phone,
      },
      emailRedirectTo,
    },
  })

  if (error) {
    return { error: mapAuthErrorMessage(error.message), success: null }
  }

  if (data.user && !data.user.identities?.length) {
    return {
      error:
        "Este email ya está registrado. Iniciá sesión o utilizá otra cuenta.",
      success: null,
    }
  }

  if (data.user) {
    const promoted = await promoteProfileToOrganizer(data.user.id, {
      email: credentials.email,
      fullName,
      phone,
    })
    if (!promoted.ok) {
      return {
        error:
          "La cuenta se creó, pero no se pudo dejar la productora en revisión. Escribí a soporte de TokePass.",
        success: null,
      }
    }
  }

  if (data.session) {
    await bindWalletDeviceFromForm(formData)
    redirect(credentials.next || "/admin")
  }

  return {
    error: null,
    success:
      "Cuenta creada. Quedó pendiente de aprobación. Revisá tu correo y después entrá a Tu Panel.",
  }
}

export async function signInWithEmail(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const limited = await assertAuthIpRateLimit()
  if (limited) return limited

  const credentials = readCredentials(formData)

  if (!credentials.ok) {
    return { error: credentials.error, success: null }
  }

  const loginSource = formData.get("loginSource")
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  })

  if (error) {
    if (
      loginSource === "organizer" &&
      isInvalidLoginCredentials(error.message)
    ) {
      let hasOrganizerAccount = true
      try {
        const admin = createAdminClient()
        const { data: existing, error: lookupError } = await admin
          .from("profiles")
          .select("role")
          .eq("email", credentials.email)
          .maybeSingle()
        if (!lookupError) {
          hasOrganizerAccount =
            existing?.role === "admin" || existing?.role === "super_admin"
        }
      } catch (lookupError) {
        logger.error({
          context: "auth/login",
          message: "organizer_account_lookup_failed",
          error: lookupError,
        })
      }
      if (!hasOrganizerAccount) {
        return {
          error:
            "No hay una cuenta con ese email. Creá tu cuenta de organizador para entrar al panel.",
          success: null,
        }
      }
    }
    return { error: mapAuthErrorMessage(error.message), success: null }
  }

  // Validate the newly written cookie against Supabase Auth instead of trusting
  // only the session object returned by signInWithPassword.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    await destroyAuthSession()
    return {
      error: "No se pudo validar la nueva sesión. Intentá nuevamente.",
      success: null,
    }
  }

  let profile: FreshLoginProfile | null
  try {
    profile = await resolveLoginProfile(user.id)
  } catch (profileError) {
    logger.error({
      context: "auth/login",
      message: "profile_lookup_failed",
      userId: user.id,
      error: profileError,
    })
    await destroyAuthSession()
    return {
      error: "No se pudo verificar tu perfil. Intentá nuevamente.",
      success: null,
    }
  }

  if (
    profile?.role === "admin" &&
    profile.organizerApprovalStatus === "rejected"
  ) {
    await destroyAuthSession()
    return {
      error: "Tu solicitud de organizador fue rechazada.",
      success: null,
    }
  }

  if (
    profile?.role === "admin" &&
    profile.organizerApprovalStatus === "suspended"
  ) {
    await destroyAuthSession()
    return {
      error:
        "Tu productora está suspendida. Contactá a soporte de TokePass para revisar el caso.",
      success: null,
    }
  }

  if (
    loginSource === "organizer" &&
    profile?.role !== "admin" &&
    profile?.role !== "super_admin"
  ) {
    const promoted = await promoteProfileToOrganizer(user.id, {
      email: user.email ?? credentials.email,
    })
    if (!promoted.ok) {
      await destroyAuthSession()
      return {
        error:
          "No se pudo activar tu cuenta de organizador. Intentá de nuevo o escribinos a soporte.",
        success: null,
      }
    }
    await bindWalletDeviceFromForm(formData)
    redirect(credentials.next || "/admin")
  }

  await bindWalletDeviceFromForm(formData)
  const fallback = postLoginDestination(profile?.role)
  redirect(credentials.next || fallback)
}

export async function signInWithMagicLink(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const limited = await assertAuthIpRateLimit()
  if (limited) return limited

  const emailRaw = formData.get("email")
  if (typeof emailRaw !== "string" || !emailRaw.trim()) {
    return { error: "El correo electrónico es obligatorio.", success: null }
  }

  const email = emailRaw.trim().toLowerCase()
  const next = safeInternalNextPath(formData.get("next"))
  await persistAuthNextPath(next)
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: await getAuthCallbackUrl(next),
    },
  })

  if (error) {
    return { error: mapAuthErrorMessage(error.message), success: null }
  }

  return {
    error: null,
    success:
      "Te enviamos un enlace y un código de 6 dígitos. Completá el código acá o abrí el enlace desde este dispositivo.",
  }
}

export async function verifyEmailOtp(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const limited = await assertAuthIpRateLimit()
  if (limited) return limited

  const emailRaw = formData.get("email")
  const tokenRaw = formData.get("token")
  if (typeof emailRaw !== "string" || !emailRaw.trim()) {
    return { error: "El correo electrónico es obligatorio.", success: null }
  }
  if (typeof tokenRaw !== "string" || !/^\d{6}$/.test(tokenRaw.trim())) {
    return { error: "Ingresá el código de 6 dígitos.", success: null }
  }

  const email = emailRaw.trim().toLowerCase()
  const token = tokenRaw.trim()
  const next = safeInternalNextPath(formData.get("next"))
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  })

  if (error) {
    return { error: mapOtpVerifyError(error.message), success: null }
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    await destroyAuthSession()
    return {
      error: "No se pudo validar la nueva sesión. Intentá nuevamente.",
      success: null,
    }
  }

  await bindWalletDeviceFromForm(formData)
  redirect(next || "/cuenta/entradas")
}

export async function signInWithGoogle(formData?: FormData): Promise<void> {
  const limited = await assertAuthIpRateLimit()
  if (limited) {
    const next = safeInternalNextPath(formData?.get("next"))
    const loginUrl = new URL("/login", "http://localhost")
    loginUrl.searchParams.set("error", limited.error ?? AUTH_RATE_LIMIT_ERROR)
    if (next) loginUrl.searchParams.set("next", next)
    redirect(`${loginUrl.pathname}${loginUrl.search}`)
  }

  const supabase = await createClient()
  const next = safeInternalNextPath(formData?.get("next"))
  await persistAuthNextPath(next)
  const redirectTo = await getAuthCallbackUrl()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account",
      },
    },
  })

  if (error || !data.url) {
    const loginUrl = new URL("/login", redirectTo)
    loginUrl.searchParams.set(
      "error",
      mapAuthErrorMessage(
        error?.message ?? "No se pudo iniciar sesión con Google.",
      ),
    )
    redirect(loginUrl.toString())
  }

  redirect(data.url)
}

export async function signOut(): Promise<void> {
  await destroyAuthSession()
  redirect("/")
}

export async function signOutDueToWalletDeviceMismatch(
  nextPath?: string,
): Promise<void> {
  await destroyAuthSession()
  const loginUrl = new URL("/login", "http://localhost")
  loginUrl.searchParams.set("error", WALLET_DEVICE_MISMATCH_MESSAGE)
  const next = safeInternalNextPath(nextPath)
  if (next) loginUrl.searchParams.set("next", next)
  redirect(`${loginUrl.pathname}${loginUrl.search}`)
}

export async function purgeStaleAuthSession(): Promise<void> {
  await destroyAuthSession()
}
