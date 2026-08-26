import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/admin"

export async function freezeSeatHoldsForPayment(orderId: string): Promise<void> {
  const id = orderId.trim()
  if (!id) return
  const admin = createAdminClient()
  const { error } = await admin.rpc("freeze_seat_holds_for_payment", {
    p_order_id: id,
  })
  if (
    error &&
    !/could not find|schema cache|does not exist|pgrst202/i.test(error.message)
  ) {
    logger.error({
      context: "payments/freeze-holds",
      message: "freeze_seat_holds_failed",
      orderId: id,
      error: error.message,
    })
  }
}
