import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import { PKPass } from "passkit-generator"

import type { MyTicket } from "@/app/actions/tickets"
import { isAppleWalletConfigured } from "@/lib/wallet-cache"
import { buildApplePassJson, buildWalletPassFields } from "@/lib/wallet/pass-fields"
import { decodeCertEnv } from "@/lib/wallet/pem"

const APPLE_WWDR_G4 =
  "https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer"

let wwdrCache: Buffer | null = null
let iconCache: Buffer | null = null

async function loadWwdr(): Promise<Buffer> {
  const fromEnv = decodeCertEnv(process.env.APPLE_PASS_WWDR_CERT)
  if (fromEnv) return fromEnv
  if (wwdrCache) return wwdrCache
  const response = await fetch(APPLE_WWDR_G4, { cache: "force-cache" })
  if (!response.ok) {
    throw new Error("No se pudo obtener el certificado WWDR de Apple")
  }
  wwdrCache = Buffer.from(await response.arrayBuffer())
  return wwdrCache
}

async function loadBrandPng(): Promise<Buffer> {
  if (iconCache) return iconCache
  iconCache = await readFile(
    path.join(process.cwd(), "public", "icons", "icon-192x192.png"),
  )
  return iconCache
}

async function loadStripPng(flyerUrl: string | null): Promise<Buffer | null> {
  if (!flyerUrl || !/^https?:\/\//i.test(flyerUrl)) return null
  try {
    const response = await fetch(flyerUrl, { cache: "no-store" })
    if (!response.ok) return null
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("png")) {
      return null
    }
    return Buffer.from(await response.arrayBuffer())
  } catch {
    return null
  }
}

export async function buildApplePkpass(ticket: MyTicket): Promise<Buffer> {
  if (!isAppleWalletConfigured()) {
    throw new Error("apple_wallet_not_configured")
  }

  const fields = buildWalletPassFields(ticket)
  const passJson = buildApplePassJson(fields, {
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID!.trim(),
    teamIdentifier: process.env.APPLE_TEAM_ID!.trim(),
  })

  const [wwdr, icon, strip] = await Promise.all([
    loadWwdr(),
    loadBrandPng(),
    loadStripPng(fields.flyerUrl),
  ])

  const signerCert = decodeCertEnv(process.env.APPLE_PASS_SIGNER_CERT)
  const signerKey = decodeCertEnv(process.env.APPLE_PASS_SIGNER_KEY)
  if (!signerCert || !signerKey) {
    throw new Error("apple_wallet_not_configured")
  }

  const buffers: Record<string, Buffer> = {
    "icon.png": icon,
    "icon@2x.png": icon,
    "icon@3x.png": icon,
    "logo.png": icon,
    "logo@2x.png": icon,
    "logo@3x.png": icon,
  }
  if (strip) buffers["strip.png"] = strip

  const pass = new PKPass(buffers, {
    wwdr,
    signerCert,
    signerKey,
    signerKeyPassphrase: process.env.APPLE_PASS_SIGNER_KEY_PASSPHRASE || undefined,
  }, passJson)

  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: fields.barcodeValue,
    messageEncoding: "iso-8859-1",
    altText: fields.barcodeAlt,
  })

  return pass.getAsBuffer()
}
