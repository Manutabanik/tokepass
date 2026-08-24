import * as Sentry from "@sentry/nextjs"

import { getSentryInitOptions } from "@/lib/sentry/options"

Sentry.init({
  ...getSentryInitOptions(),
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
})
