import * as Sentry from "@sentry/nextjs"

import {
  getSentryInitOptions,
  getSentryTracesSampleRate,
} from "@/lib/sentry/options"

Sentry.init({
  ...getSentryInitOptions(),
  tracesSampleRate: getSentryTracesSampleRate(),
})
