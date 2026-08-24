import * as Sentry from "@sentry/nextjs"

import {
  getSentryInitOptions,
  getSentryReplaySessionSampleRate,
  getSentryTracesSampleRate,
} from "@/lib/sentry/options"

Sentry.init({
  ...getSentryInitOptions(),
  tracesSampleRate: getSentryTracesSampleRate(),
  replaysSessionSampleRate: getSentryReplaySessionSampleRate(),
  replaysOnErrorSampleRate: 1.0,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
