import { SignJWT, jwtVerify } from "jose"

export const CHECKOUT_FULFILLMENT_COOKIE = "tp_fulfillment"
export const CHECKOUT_FULFILLMENT_PURPOSE = "checkout-fulfillment"
export const CHECKOUT_FULFILLMENT_TTL_SECONDS = 20 * 60

export function checkoutFulfillmentCookieAttrs() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHECKOUT_FULFILLMENT_TTL_SECONDS,
  }
}

let localDevSecret: Uint8Array | null = null

function fulfillmentSecret(): Uint8Array {
  const raw = process.env.CHECKOUT_FULFILLMENT_SECRET?.trim() || ""
  if (raw) return new TextEncoder().encode(raw)
  if (process.env.NODE_ENV === "production") {
    throw new Error("CHECKOUT_FULFILLMENT_SECRET is required in production")
  }
  if (!localDevSecret) {
    localDevSecret = crypto.getRandomValues(new Uint8Array(32))
  }
  return localDevSecret
}

export async function signCheckoutFulfillmentToken(
  orderId: string,
): Promise<string> {
  const sub = orderId.trim()
  if (!sub) {
    throw new Error("order_id required")
  }
  return new SignJWT({ purpose: CHECKOUT_FULFILLMENT_PURPOSE })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${CHECKOUT_FULFILLMENT_TTL_SECONDS}s`)
    .sign(fulfillmentSecret())
}

export async function verifyCheckoutFulfillmentToken(
  token: string | undefined | null,
): Promise<string | null> {
  if (!token?.trim()) return null
  try {
    const { payload } = await jwtVerify(token, fulfillmentSecret(), {
      algorithms: ["HS256"],
    })
    if (payload.purpose !== CHECKOUT_FULFILLMENT_PURPOSE) return null
    const orderId = typeof payload.sub === "string" ? payload.sub.trim() : ""
    return orderId || null
  } catch {
    return null
  }
}

export async function fulfillmentTokenMatchesOrder(
  token: string | undefined | null,
  orderId: string,
): Promise<boolean> {
  const bound = await verifyCheckoutFulfillmentToken(token)
  if (!bound) return false
  return bound === orderId.trim()
}
