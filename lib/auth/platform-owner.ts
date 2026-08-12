/**
 * Platform owner = dueño de Tokepass.
 * En el esquema actual el rol canónico es `super_admin`
 * (alias de producto: PLATFORM_OWNER).
 */
export function isPlatformOwnerRole(
  role: string | null | undefined,
): boolean {
  return role === "super_admin"
}
