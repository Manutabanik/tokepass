export function shouldFallbackSandboxFinalize(input: {
  errorMessage?: string | null
  code?: string | null
}): boolean {
  if (input.code === "invalid_provider") return true
  const message = input.errorMessage ?? ""
  return /could not find|schema cache|does not exist/i.test(message)
}
