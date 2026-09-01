/** MP ya devolvió el cobro: un retry no debe tumbar el cron ni el webhook. */
export function isMercadoPagoAlreadyRefundedError(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${error.message} ${error.name}`
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? "")
  return /already refunded|already has a refund|payment refunded|status.?refunded|collected_money_refunded/i.test(
    text,
  )
}
