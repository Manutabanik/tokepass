export function buildSupportEscalateMessage(faqQuestion?: string | null): string {
  const question = faqQuestion?.trim()
  if (question) {
    return `Consulté la pregunta: ${question}\n\nNecesito hablar con soporte.`
  }
  return "Necesito hablar con soporte."
}
