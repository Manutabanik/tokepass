import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type {
  OrganizerApprovalStatus,
  UserRole,
} from "@/types/database"

export type FreshLoginProfile = {
  role: UserRole
  organizerApprovalStatus: OrganizerApprovalStatus
}

/** Only same-origin relative paths (open-redirect safe). */
export function safeInternalNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const path = raw.trim()
  if (!path.startsWith("/") || path.startsWith("//")) return null
  if (path.includes("://") || path.includes("\\")) return null
  return path
}

/**
 * Reads authorization state directly from Postgres through the service role.
 * The access token is used only to identify the authenticated user; JWT claims
 * never decide the post-login destination.
 */
export async function getFreshLoginProfile(
  userId: string,
): Promise<FreshLoginProfile | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(`fresh_profile_lookup_failed: ${error.message}`)
  }

  if (!data) return null

  return {
    role: data.role,
    organizerApprovalStatus: data.organizer_approval_status,
  }
}

export function postLoginDestination(
  role: UserRole | null | undefined,
): "/superadmin" | "/admin" | "/cuenta" {
  if (role === "super_admin") return "/superadmin"
  if (role === "admin") return "/admin"
  return "/cuenta"
}
