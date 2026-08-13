"use client"

import Script from "next/script"
import { useEffect, useRef } from "react"

import {
  hasActivePixels,
  trackViewContent,
  type EventPixelConfig,
} from "@/lib/analytics/pixels"

type AnalyticsTrackerProps = {
  config: EventPixelConfig
  /** Dispara ViewContent al montar (ficha de evento). */
  trackPageView?: boolean
  contentName?: string
  contentIds?: string[]
  value?: number
}

/**
 * Inyecta de forma segura Meta Pixel (fbq), TikTok Pixel (ttq) y GA4 (gtag)
 * según la configuración del evento.
 */
export function AnalyticsTracker({
  config,
  trackPageView = false,
  contentName,
  contentIds,
  value,
}: AnalyticsTrackerProps) {
  const metaId =
    config.metaPixelEnabled && config.metaPixelId?.trim()
      ? config.metaPixelId.trim()
      : null
  const tiktokId =
    config.tiktokPixelEnabled && config.tiktokPixelId?.trim()
      ? config.tiktokPixelId.trim()
      : null
  const ga4Id =
    config.ga4Enabled && config.ga4MeasurementId?.trim()
      ? config.ga4MeasurementId.trim()
      : null

  const viewFired = useRef(false)

  useEffect(() => {
    if (!trackPageView || viewFired.current) return
    if (!hasActivePixels(config)) return

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const metaReady = !metaId || typeof window.fbq === "function"
      const tiktokReady = !tiktokId || Boolean(window.ttq?.track)
      const ga4Ready = !ga4Id || typeof window.gtag === "function"
      if ((metaReady && tiktokReady && ga4Ready) || attempts >= 24) {
        window.clearInterval(timer)
        if (viewFired.current) return
        viewFired.current = true
        trackViewContent({
          contentName,
          contentIds: contentIds ?? [],
          value,
          currency: "ARS",
        })
      }
    }, 250)

    return () => window.clearInterval(timer)
  }, [
    config,
    contentIds,
    contentName,
    ga4Id,
    metaId,
    tiktokId,
    trackPageView,
    value,
  ])

  if (!metaId && !tiktokId && !ga4Id) return null

  return (
    <>
      {metaId ? (
        <>
          <Script id={`meta-pixel-${metaId}`} strategy="afterInteractive">
            {`
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${metaId}');
fbq('track','PageView');
            `.trim()}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${encodeURIComponent(metaId)}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      ) : null}

      {tiktokId ? (
        <Script id={`tiktok-pixel-${tiktokId}`} strategy="afterInteractive">
          {`
!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");
o.type="text/javascript";o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;
var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
ttq.load('${tiktokId}');ttq.page()}(window,document,'ttq');
          `.trim()}
        </Script>
      ) : null}

      {ga4Id ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`}
            strategy="afterInteractive"
          />
          <Script id={`ga4-${ga4Id}`} strategy="afterInteractive">
            {`
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
window.gtag=gtag;
gtag('js',new Date());
gtag('config','${ga4Id}',{send_page_view:true});
            `.trim()}
          </Script>
        </>
      ) : null}
    </>
  )
}
