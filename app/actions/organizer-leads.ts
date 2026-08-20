"use server"

import { logger } from "@/lib/logger"
import { getRequestIp } from "@/lib/request-ip"
import { createAdminClient } from "@/lib/supabase/admin"
import { organizerLeadSchema } from "@/lib/validations/organizer-lead"

export type OrganizerLeadState = {
  error: string | null
  success: string | null
}

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX = 4
const recentByIp = new Map<string, number[]>()

function allowLead(ip: string): boolean {
  const now = Date.now()
  const previous = (recentByIp.get(ip) ?? []).filter(
    (stamp) => now - stamp < RATE_WINDOW_MS,
  )
  if (previous.length >= RATE_MAX) {
    recentByIp.set(ip, previous)
    return false
  }
  previous.push(now)
  recentByIp.set(ip, previous)
  return true
}

export async function submitOrganizerLead(
  _previous: OrganizerLeadState,
  formData: FormData,
): Promise<OrganizerLeadState> {
  if (!allowLead(await getRequestIp())) {
    return {
      error: "Demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.",
      success: null,
    }
  }

  const parsed = organizerLeadSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    eventName: formData.get("eventName"),
    estimatedAttendance: formData.get("estimatedAttendance"),
  })

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos del formulario.",
      success: null,
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("organizer_leads").insert({
    full_name: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    event_name: parsed.data.eventName,
    estimated_attendance: parsed.data.estimatedAttendance,
  })

  if (error) {
    logger.error({
      context: "organizer-leads",
      message: "insert_failed",
      error: error.message,
    })
    return {
      error: "No pudimos guardar la solicitud. Probá de nuevo en un momento.",
      success: null,
    }
  }

  return {
    error: null,
    success:
      "Recibimos tu solicitud. El equipo de TokePass te contacta para armar el evento.",
  }
}
