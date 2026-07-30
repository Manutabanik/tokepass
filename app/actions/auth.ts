"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export interface AuthActionState {
  error: string | null
  success: string | null
}

async function getAuthCallbackUrl() {
  const requestHeaders = await headers()
  const origin = requestHeaders.get("origin")
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    origin ||
    "http://localhost:3000"
  ).replace(/\/$/, "")

  return `${siteUrl}/auth/callback`
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
  } as const
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
    return { error: error.message, success: null }
  }

  if (data.session) {
    redirect("/")
  }

  return {
    error: null,
    success: "Cuenta creada. Revisa tu correo para confirmar el registro.",
  }
}

export async function signUpOrganizer(
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

  const fullNameValue = formData.get("fullName")
  const fullName =
    typeof fullNameValue === "string" && fullNameValue.trim()
      ? fullNameValue.trim()
      : null
  const emailRedirectTo = await getAuthCallbackUrl()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: {
      data: {
        full_name: fullName,
        registration_type: "organizer",
      },
      emailRedirectTo,
    },
  })

  if (error || !data.user) {
    return {
      error: error?.message ?? "No se pudo crear la cuenta de organizador.",
      success: null,
    }
  }

  // Supabase puede ocultar que un email ya existe devolviendo un usuario sin
  // identities. Nunca promovemos cuentas preexistentes desde este endpoint.
  if (!data.user.identities?.length) {
    return {
      error:
        "Este email ya está registrado. Inicia sesión o utiliza otra cuenta.",
      success: null,
    }
  }

  try {
    const inviteOnly =
      process.env.ORGANIZER_INVITE_ONLY === "true" ||
      process.env.ORGANIZER_INVITE_ONLY === "1"
    const inviteCode = process.env.ORGANIZER_INVITE_CODE?.trim()
    const submittedInvite = formData.get("inviteCode")
    const inviteValue =
      typeof submittedInvite === "string" ? submittedInvite.trim() : ""

    if (inviteOnly) {
      if (!inviteCode || inviteValue !== inviteCode) {
        return {
          error:
            "Registro de organizadores solo por invitación. Código inválido o ausente.",
          success: null,
        }
      }
    }

    const admin = createAdminClient()
    // Never grant admin immediately — Platform OS must approve.
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: data.user.id,
        email: credentials.email,
        full_name: fullName,
        role: "customer",
        organizer_approval_status: "pending",
      } as never,
      { onConflict: "id" },
    )

    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id)
      return {
        error: `No se pudo registrar la solicitud: ${profileError.message}`,
        success: null,
      }
    }
  } catch {
    return {
      error:
        "El registro de organizadores requiere SUPABASE_SERVICE_ROLE_KEY en el servidor.",
      success: null,
    }
  }

  return {
    error: null,
    success:
      "Solicitud enviada. Tu cuenta queda pendiente de aprobación antes de acceder al Command Center.",
  }
}

export async function signInWithEmail(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = readCredentials(formData)

  if (!credentials.ok) {
    return { error: credentials.error, success: null }
  }

  const nextValue = formData.get("next")
  const nextPath =
    typeof nextValue === "string" &&
    nextValue.startsWith("/") &&
    !nextValue.startsWith("//")
      ? nextValue
      : null

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(credentials)

  if (error) {
    return { error: error.message, success: null }
  }

  // Customer destinations only require a valid Auth session. A missing
  // application profile must not lock buyers out of their ticket wallet.
  // Organizer/platform routes still enforce profile roles in middleware.
  if (nextPath) {
    redirect(nextPath)
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", data.user.id)
    .single()

  if (profileError || !profile) {
    // Auth succeeded; keep the customer session usable. Missing profiles are
    // repaired by migration 00004, while privileged routes remain denied.
    redirect("/")
  }

  const approval = (profile as { organizer_approval_status?: string })
    .organizer_approval_status
  if (approval === "pending") {
    await supabase.auth.signOut()
    return {
      error:
        "Tu solicitud de organizador sigue pendiente de aprobación. Te avisamos cuando esté activa.",
      success: null,
    }
  }

  if (approval === "rejected") {
    await supabase.auth.signOut()
    return {
      error: "Tu solicitud de organizador fue rechazada.",
      success: null,
    }
  }

  redirect(
    profile.role === "admin" || profile.role === "super_admin"
      ? "/admin"
      : "/",
  )
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient()
  const redirectTo = await getAuthCallbackUrl()
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
      error?.message ?? "No se pudo iniciar sesión con Google.",
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
