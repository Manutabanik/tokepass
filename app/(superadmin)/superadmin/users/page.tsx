import { Search, Users } from "lucide-react"
import type { Metadata } from "next"

import { getPlatformUsers } from "@/app/actions/platform"
import { RoleBadge } from "@/components/superadmin/badges"
import { PageHeading } from "@/components/superadmin/page-heading"
import { UserRoleManager } from "@/components/superadmin/user-role-manager"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, getInitials } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Usuarios",
}

export default async function SuperAdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const [users, supabase] = await Promise.all([
    getPlatformUsers(q),
    createClient(),
  ])
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  return (
    <>
      <PageHeading
        eyebrow="Gobierno de usuarios"
        title="Usuarios de la plataforma"
        description="Consulta y administra los roles de todas las cuentas. Los cambios se aplican de inmediato."
      />

      <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b border-white/8 px-5 py-5 sm:px-6">
          <div>
            <CardTitle className="text-base text-white">
              {users.length} {users.length === 1 ? "usuario" : "usuarios"}
            </CardTitle>
          </div>
          <form className="relative w-full max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600"
              aria-hidden="true"
            />
            <Input
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Buscar por nombre o email"
              aria-label="Buscar usuarios"
              className="h-10 border-white/10 bg-black/20 pl-9"
            />
          </form>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="pl-6 text-zinc-600">Usuario</TableHead>
                  <TableHead className="text-zinc-600">Rol</TableHead>
                  <TableHead className="text-zinc-600">Registro</TableHead>
                  <TableHead className="pr-6 text-right text-zinc-600">
                    Gestionar rol
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((platformUser) => (
                  <TableRow
                    key={platformUser.id}
                    className="border-white/8 hover:bg-white/[0.025]"
                  >
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-xs font-medium text-zinc-300">
                          {getInitials(platformUser.name, platformUser.email)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-200">
                            {platformUser.name}
                          </p>
                          <p className="truncate text-xs text-zinc-600">
                            {platformUser.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={platformUser.role} />
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {formatDate(platformUser.joinedAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <UserRoleManager
                        userId={platformUser.id}
                        currentRole={platformUser.role}
                        isSelf={platformUser.id === currentUser?.id}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/5 text-zinc-500">
                  <Users className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm text-zinc-500">
                  No se encontraron usuarios con ese criterio.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
