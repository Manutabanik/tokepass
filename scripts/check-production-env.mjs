const enforce =
  process.env.VERCEL_ENV === "production" ||
  process.env.REQUIRE_PRODUCTION_ENV === "1"

if (!enforce) process.exit(0)

const errors = []

function firstConfigured(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value && !/your-|xxxxxxxxx|example/i.test(value)) return { name, value }
  }
  return null
}

const requiredGroups = [
  ["NEXT_PUBLIC_SUPABASE_URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  ["SUPABASE_SERVICE_ROLE_KEY"],
  ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BASE_URL"],
  ["MERCADOPAGO_ACCESS_TOKEN", "MP_ACCESS_TOKEN"],
  ["MERCADOPAGO_WEBHOOK_SECRET", "MP_WEBHOOK_SECRET"],
  ["CRON_SECRET"],
  ["RESEND_API_KEY"],
  ["CHECKOUT_FULFILLMENT_SECRET"],
  ["GUEST_TICKET_SECRET"],
  ["UPSTASH_REDIS_REST_URL"],
  ["UPSTASH_REDIS_REST_TOKEN"],
  ["WAITING_ROOM_SECRET"],
  [
    "TURNSTILE_SECRET_KEY",
    "CLOUDFLARE_TURNSTILE_SECRET_KEY",
    "RECAPTCHA_SECRET_KEY",
    "RECAPTCHA_SECRET",
  ],
  ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "NEXT_PUBLIC_RECAPTCHA_SITE_KEY"],
]

for (const group of requiredGroups) {
  const found = firstConfigured(...group)
  if (!found) {
    errors.push(
      group.length === 1
        ? `${group[0]} no está configurada`
        : `${group.join(" o ")} no está configurada`,
    )
  }
}

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BASE_URL"]) {
  const value = process.env[name]?.trim()
  if (!value) continue

  try {
    const url = new URL(value)
    if (url.protocol !== "https:") errors.push(`${name} debe usar HTTPS`)
    if (
      (name === "NEXT_PUBLIC_SITE_URL" || name === "NEXT_PUBLIC_BASE_URL") &&
      (url.pathname !== "/" ||
        url.search ||
        url.hash ||
        ["localhost", "127.0.0.1"].includes(url.hostname))
    ) {
      errors.push(`${name} debe ser únicamente el origen público`)
    }
  } catch {
    errors.push(`${name} no es una URL válida`)
  }
}

for (const group of [
  ["SUPABASE_SERVICE_ROLE_KEY"],
  ["MERCADOPAGO_ACCESS_TOKEN", "MP_ACCESS_TOKEN"],
  ["MERCADOPAGO_WEBHOOK_SECRET", "MP_WEBHOOK_SECRET"],
  ["CRON_SECRET"],
  ["CHECKOUT_FULFILLMENT_SECRET"],
  ["GUEST_TICKET_SECRET"],
  ["RESEND_API_KEY"],
  ["UPSTASH_REDIS_REST_TOKEN"],
  ["WAITING_ROOM_SECRET"],
]) {
  const found = firstConfigured(...group)
  if (found && found.value.length < 24) {
    errors.push(`${found.name} es demasiado corta`)
  }
}

if (process.env.MP_FORCE_SANDBOX === "1") {
  errors.push("MP_FORCE_SANDBOX=1 no está permitido en producción")
}

const mpToken = firstConfigured("MERCADOPAGO_ACCESS_TOKEN", "MP_ACCESS_TOKEN")
if (mpToken?.value.startsWith("TEST-")) {
  errors.push(`${mpToken.name} no puede ser un token TEST- en producción`)
}

if (errors.length > 0) {
  console.error("Configuración de producción inválida:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log("Configuración de producción validada.")
