export const WALLET_PATH = "/cuenta/entradas"

export const EMAIL_WALLET_CTA = "Ver mis entradas en la app"

export const LIVING_QR_EMAIL_DISCLAIMER =
  "TokePass utiliza tecnología anti-fraude. Tus entradas son dinámicas y no se pueden capturar ni imprimir. Accedé a tu billetera para verlas."

export function walletReceiptUrl(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}${WALLET_PATH}`
}
