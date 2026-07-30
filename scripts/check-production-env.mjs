const enforce =
  process.env.VERCEL_ENV === "production" ||
  process.env.REQUIRE_PRODUCTION_ENV === "1"

if (!enforce) process.exit(0)

const errors = []
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
  "CRON_SECRET",
]

for (const name of required) {
  const value = process.env[name]?.trim()
  if (!value || /your-|xxxxxxxxx|example/i.test(value)) {
    errors.push(`${name} no está configurada`)
  }
}

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
  const value = process.env[name]?.trim()
  if (!value) continue

  try {
    const url = new URL(value)
    if (url.protocol !== "https:") errors.push(`${name} debe usar HTTPS`)
    if (
      name === "NEXT_PUBLIC_SITE_URL" &&
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

for (const name of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
  "CRON_SECRET",
]) {
  const value = process.env[name]?.trim()
  if (value && value.length < 24) {
    errors.push(`${name} es demasiado corta`)
  }
}

if (errors.length > 0) {
  console.error("Configuración de producción inválida:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log("Configuración de producción validada.")
