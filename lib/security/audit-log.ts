import "server-only"

import { logger } from "@/lib/logger"
import { getRequestIp, getRequestUserAgent } from "@/lib/request-ip"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/types/database"

export async function writeSecurityAuditLog(input: {
  actorId?: string | null
  action: string
  entity: string
  entityId?: string | null
  details?: Json
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const ip = await getRequestIp()
    const userAgent = await getRequestUserAgent()
    const { error } = await admin.rpc("write_security_audit_log", {
      p_action: input.action,
      p_entity: input.entity,
      p_entity_id: input.entityId ?? null,
      p_ip: ip,
      p_user_agent: userAgent,
      p_details: input.details ?? {},
      p_actor_id: input.actorId ?? null,
    })
    if (error) {
      logger.error({
        context: "security/audit",
        message: "write_failed",
        action: input.action,
        error: error.message,
      })
    }
  } catch (error) {
    logger.error({
      context: "security/audit",
      message: "write_failed",
      action: input.action,
      error,
    })
  }
}
