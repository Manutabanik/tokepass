"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import {
  getFreshLoginProfile,
  postLoginDestination,
  safeInternalNextPath,
  type FreshLoginProfile,
} from "@/lib/auth/post-login"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export interface AuthActionState {
  error: string | null
  success: string | null
}

async function getAuthCallbackUrl(next?: string | null) {
  const requestHeaders = await headers()
  const origin = requestHeaders.get("origin")
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    origin ||
    "http://localhost:3000"
  ).replace(/\/$/, "")

  const base = `${siteUrl}/auth/callback`
  const safeNext = safeInternalNextPath(next)
  if (!safeNext) return base
  return `${base}?next=${encodeURIComponent(safeNext)}`
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
    return "Email o contraseña incorrectos."
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
    return "La contraseña debe tener al menos 8 caracteres."
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Demasiados intentos. Esperá un momento e intentá de nuevo."
  }
  if (normalized.includes("signup is disabled")) {
    return "El registro está temporalmente deshabilitado."
  }
  if (normalized.includes("is invalid") && normalized.includes("email")) {
    return "Ingresá un email válido."
  }
  if (normalized.includes("otp") || normalized.includes("magic")) {
    return "No pudimos enviar el enlace. Revisá el email e intentá de nuevo."
  }
  return message
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
  const credentials = readCredentials(formData)

  if (!credentials.ok) {
    return { error: credentials.error, success: null }
  }

  if (credentials.password.length < 8) {
    return {
      error: "La contraseña debe tener al menos 8 caracteres.",
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
    redirect(credentials.next || "/")
  }

  return {
    error: null,
    success: "Cuenta creada. Revisá tu correo para confirmar el registro.",
  }
}

export async function signUpOrganizer(): Promise<AuthActionState> {
  redirect("/organizadores#solicitud")
}

export async function signInWithEmail(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
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
        redirect("/organizadores#solicitud")
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
    await supabase.auth.signOut()
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
    await supabase.auth.signOut()
    return {
      error: "No se pudo verificar tu perfil. Intentá nuevamente.",
      success: null,
    }
  }

  // Governance restrictions only apply to organizer accounts. A customer with
  // an organizer application pending/rejected can still use the B2C catalog.
  if (
    profile?.role === "admin" &&
    profile.organizerApprovalStatus === "pending"
  ) {
    await supabase.auth.signOut()
    return {
      error:
        "Tu solicitud de organizador sigue pendiente de aprobación. Te avisamos cuando esté activa.",
      success: null,
    }
  }

  if (
    profile?.role === "admin" &&
    profile.organizerApprovalStatus === "rejected"
  ) {
    await supabase.auth.signOut()
    return {
      error: "Tu solicitud de organizador fue rechazada.",
      success: null,
    }
  }

  if (
    profile?.role === "admin" &&
    profile.organizerApprovalStatus === "suspended"
  ) {
    await supabase.auth.signOut()
    return {
      error:
        "Tu productora está suspendida. Contactá a soporte de Tokepass para revisar el caso.",
      success: null,
    }
  }

  // Pending organizer applicants (still role=customer) logging into the
  // organizer portal should see a clear message instead of a silent / redirect.
  if (
    loginSource === "organizer" &&
    profile?.organizerApprovalStatus === "pending" &&
    profile.role !== "admin" &&
    profile.role !== "super_admin"
  ) {
    await supabase.auth.signOut()
    return {
      error:
        "Tu solicitud de organizador sigue pendiente de aprobación. Te avisamos cuando esté activa.",
      success: null,
    }
  }

  if (
    loginSource === "organizer" &&
    profile?.role !== "admin" &&
    profile?.role !== "super_admin"
  ) {
    await supabase.auth.signOut()
    redirect("/organizadores#solicitud")
  }

  const fallback = postLoginDestination(profile?.role)
  redirect(credentials.next || fallback)
}

export async function signInWithMagicLink(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const emailRaw = formData.get("email")
  if (typeof emailRaw !== "string" || !emailRaw.trim()) {
    return { error: "El correo electrónico es obligatorio.", success: null }
  }

  const email = emailRaw.trim().toLowerCase()
  const next = safeInternalNextPath(formData.get("next"))
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
    success: "Te enviamos un enlace. Abrilo desde este dispositivo para entrar.",
  }
}

export async function signInWithGoogle(formData?: FormData): Promise<void> {
  const supabase = await createClient()
  const next = safeInternalNextPath(formData?.get("next"))
  const redirectTo = await getAuthCallbackUrl(next)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
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
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}
