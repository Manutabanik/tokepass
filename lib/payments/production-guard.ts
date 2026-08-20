import { PaymentProviderNotSupportedError } from "@/lib/payments/core/errors"
import type { SupportedPaymentProvider } from "@/lib/payments/core/interfaces"

export function isPaymentsProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production"
}

export function assertSecondaryPspDisabledInProduction(
  provider: SupportedPaymentProvider,
): void {
  if (!isPaymentsProductionRuntime()) return
  if (provider === "payway" || provider === "naranjax") {
    throw new PaymentProviderNotSupportedError(provider)
  }
}
