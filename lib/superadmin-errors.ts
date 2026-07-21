export class SuperAdminForbiddenError extends Error {
  status = 403 as const

  constructor(message = "Acceso restringido al super administrador (403).") {
    super(message)
    this.name = "SuperAdminForbiddenError"
  }
}
