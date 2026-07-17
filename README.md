# Tokepass

Base de una plataforma de boletería digital construida con Next.js App Router,
TypeScript, Tailwind CSS, Shadcn UI y Supabase.

## Desarrollo local

1. Copia `.env.example` a `.env.local`.
2. Completa la URL y la clave anónima de tu proyecto Supabase.
3. Instala dependencias y ejecuta el servidor:

```bash
npm install
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`.

## Arquitectura

- `app/(public)`: tienda, búsqueda y acceso de compradores.
- `app/(admin)`: Command Center protegido para organizadores.
- `components/ui`: componentes generados por Shadcn.
- `components/shared`: navegación y piezas compartidas de producto.
- `lib/supabase`: clientes browser/server y sincronización de sesión.
- `hooks`: hooks de cliente para autenticación y estado.
- `types/database.ts`: contrato tipado del dominio y de Supabase.
- `proxy.ts`: refresco de sesión y protección de las rutas `/admin`.

## Verificación

```bash
npm run lint
npx tsc --noEmit
npm run build
```
