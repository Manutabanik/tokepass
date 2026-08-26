import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { CheckoutHoldGuard } from "@/components/checkout/checkout-hold-guard";
import { NavigationProgressBar } from "@/components/navigation/navigation-progress-bar";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ReferralCapture } from "@/components/public/referral-capture";
import { InstallBanner } from "@/components/pwa/install-banner";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { Toaster } from "@/components/ui/sonner";

import { getMetadataBaseUrl } from "@/lib/seo/site";

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
  applicationName: "TokePass",
  metadataBase: getMetadataBaseUrl(),
  title: {
    default: "TokePass — Vive el evento",
    template: "%s | TokePass",
  },
  description:
    "Tu entrada en el celular, en segundos y sin filas. Boletería digital 100% segura.",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "TokePass",
    title: "TokePass — Vive el evento",
    description:
      "Tu entrada en el celular, en segundos y sin filas. Boletería digital 100% segura.",
  },
  twitter: {
    card: "summary_large_image",
    title: "TokePass — Vive el evento",
    description:
      "Tu entrada en el celular, en segundos y sin filas. Boletería digital 100% segura.",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TokePass",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full max-w-[100vw] overflow-x-clip antialiased`}
    >
      <body className="flex min-h-dvh w-full max-w-[100vw] flex-col overflow-x-clip bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <NavigationProgressBar />
          <Suspense fallback={null}>
            <ReferralCapture />
          </Suspense>
          {children}
          <CheckoutHoldGuard />
          <Suspense fallback={null}>
            <PwaRegister />
          </Suspense>
          <InstallBanner />
          <Toaster position="top-center" offset={24} richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
