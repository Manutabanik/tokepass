import { NaranjaXAdapter } from "@/lib/payments/adapters/naranjax.adapter"
import { MercadoPagoAdapter } from "@/lib/payments/adapters/mercadopago.adapter"
import { PaywayAdapter } from "@/lib/payments/adapters/payway.adapter"
import { PaymentProviderNotSupportedError } from "@/lib/payments/core/errors"
import type {
  IPaymentGatewayAdapter,
  SupportedPaymentProvider,
} from "@/lib/payments/core/interfaces"

export class PaymentGatewayFactory {
  static getAdapter(provider: SupportedPaymentProvider): IPaymentGatewayAdapter {
    switch (provider) {
      case "mercadopago":
        return new MercadoPagoAdapter()
      case "payway":
        return new PaywayAdapter()
      case "naranjax":
        return new NaranjaXAdapter()
      default:
        throw new PaymentProviderNotSupportedError(provider)
    }
  }
}
