import Link from "next/link"
import Image from "next/image"

import { BrandLogo } from "@/components/shared/brand-logo"
import {
  AFIP_DATA_FISCAL_HREF,
  LEGAL_ENTITY_NAME,
  LEGAL_NAV,
} from "@/lib/legal/site"

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-border bg-background pt-10 pb-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div className="flex min-w-0 flex-col gap-2 sm:max-w-xs">
          <BrandLogo size="sm" href="/" className="w-fit" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            © 2026 {LEGAL_ENTITY_NAME}. Todos los derechos reservados.
          </p>
        </div>

        <nav
          aria-label="Producto"
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          <Link
            href="/beneficios"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Beneficios
          </Link>
          <Link
            href="/organizadores"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Organizadores
          </Link>
        </nav>

        <nav
          aria-label="Información legal"
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          {LEGAL_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <a
          href={AFIP_DATA_FISCAL_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit shrink-0"
          aria-label="Data Fiscal AFIP (se abre en una pestaña nueva)"
        >
          <Image
            src="/brand/data-fiscal.svg"
            alt="Data Fiscal AFIP"
            width={40}
            height={53}
            unoptimized
            className="h-auto w-10 grayscale transition-all hover:grayscale-0"
          />
        </a>
      </div>
    </footer>
  )
}
