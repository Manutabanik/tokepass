import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ReferralCapture } from "@/components/public/referral-capture";
import { InstallBanner } from "@/components/pwa/install-banner";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Tokepass",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "http://localhost:3000",
  ),
  title: {
    default: "Tokepass — Vive el evento",
    template: "%s | Tokepass",
  },
  description:
    "Descubre eventos y compra entradas digitales de forma simple y segura.",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Tokepass",
    title: "Tokepass — Vive el evento",
    description:
      "Descubre eventos y compra entradas digitales de forma simple y segura.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tokepass — Vive el evento",
    description:
      "Descubre eventos y compra entradas digitales de forma simple y segura.",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tokepass",
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  colorScheme: "dark light",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <Suspense fallback={null}>
            <ReferralCapture />
          </Suspense>
          {children}
          <PwaRegister />
          <InstallBanner />
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
