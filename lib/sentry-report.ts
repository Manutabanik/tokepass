/**
 * Optional Sentry bridge — no SDK required.
 * When SENTRY_DSN is set, error logs are forwarded to the Store API.
 * Parse failures are swallowed so logging never breaks request paths.
 */

type SentryDsn = {
  publicKey: string
  host: string
  projectId: string
}

function parseDsn(dsn: string): SentryDsn | null {
  try {
    const url = new URL(dsn)
    const projectId = url.pathname.replace(/^\//, "").split("/")[0]
    if (!url.username || !projectId) return null
    return {
      publicKey: url.username,
      host: url.host,
      projectId,
    }
  } catch {
    return null
  }
}

export function reportErrorToSentry(payload: {
  message: string
  context: string
  stack?: string
  extra?: Record<string, unknown>
}) {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  const parsed = parseDsn(dsn)
  if (!parsed) return

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    server_name: process.env.VERCEL_URL ?? "tokepass",
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    message: payload.message,
    logger: payload.context,
    exception: payload.stack
      ? {
          values: [
            {
              type: "Error",
              value: payload.message,
              stacktrace: {
                frames: payload.stack
                  .split("\n")
                  .slice(0, 40)
                  .map((line) => ({ filename: line.trim() })),
              },
            },
          ],
        }
      : undefined,
    extra: payload.extra,
    tags: { context: payload.context },
  }

  const endpoint = `https://${parsed.host}/api/${parsed.projectId}/store/`
  const auth = `Sentry sentry_version=7, sentry_client=tokepass-logger/1.0, sentry_key=${parsed.publicKey}`

  void fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": auth,
    },
    body: JSON.stringify(event),
  }).catch(() => {
    /* never throw from observability */
  })
}
