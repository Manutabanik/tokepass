import "server-only"

import { cookies } from "next/headers"

import {
  CHECKOUT_FULFILLMENT_COOKIE,
  checkoutFulfillmentCookieAttrs,
  fulfillmentTokenMatchesOrder,
  signCheckoutFulfillmentToken,
} from "@/lib/checkout/fulfillment-token"
import { logger } from "@/lib/logger"

export async function issueCheckoutFulfillmentCookie(
  orderId: string,
): Promise<void> {
  const clean = orderId.trim()
  if (!clean) return
  try {
    const token = await signCheckoutFulfillmentToken(clean)
    const store = await cookies()
    store.set(
      CHECKOUT_FULFILLMENT_COOKIE,
      token,
      checkoutFulfillmentCookieAttrs(),
    )
  } catch (error) {
    logger.error({
      context: "checkout/fulfillment-cookie",
      message: "issue_failed",
      error,
    })
  }
}

export async function hasCheckoutFulfillmentCookie(
  orderId: string,
): Promise<boolean> {
  const store = await cookies()
  const token = store.get(CHECKOUT_FULFILLMENT_COOKIE)?.value
  return fulfillmentTokenMatchesOrder(token, orderId)
}
