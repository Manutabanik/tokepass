import "server-only"

import { importPKCS8, SignJWT } from "jose"

import type { MyTicket } from "@/app/actions/tickets"
import { getSeoOrigin } from "@/lib/seo/site"
import { isGoogleWalletConfigured } from "@/lib/wallet-cache"
import { buildGoogleWalletResources, buildWalletPassFields } from "@/lib/wallet/pass-fields"
import { parseGoogleServiceAccount } from "@/lib/wallet/pem"

export async function buildGoogleWalletSaveUrl(ticket: MyTicket): Promise<string> {
  if (!isGoogleWalletConfigured()) {
    throw new Error("google_wallet_not_configured")
  }

  const account = parseGoogleServiceAccount()
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim()
  if (!account || !issuerId) {
    throw new Error("google_wallet_not_configured")
  }

  const fields = buildWalletPassFields(ticket)
  const resources = buildGoogleWalletResources(
    fields,
    issuerId,
    process.env.GOOGLE_WALLET_CLASS_ID,
  )

  const key = await importPKCS8(account.privateKey, "RS256")
  const origin = getSeoOrigin()
  const jwt = await new SignJWT({
    iss: account.clientEmail,
    aud: "google",
    origins: [origin],
    typ: "savetowallet",
    payload: {
      eventTicketClasses: [resources.eventTicketClass],
      eventTicketObjects: [resources.eventTicketObject],
    },
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
      ...(account.privateKeyId ? { kid: account.privateKeyId } : {}),
    })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key)

  return `https://pay.google.com/gp/v/save/${jwt}`
}
