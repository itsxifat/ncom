import Script from 'next/script'

/**
 * The tenant's own tags, and how they coexist with the server-side half.
 *
 * When a store also reports from the server (see
 * server/services/trackingService.ts), these tags stop being the source of
 * truth and become one of two halves — and the two halves are kept from
 * counting the same event twice in two different ways, because the platforms
 * differ in what they can deduplicate:
 *
 *   Meta gets both copies, each carrying the same `eventID`, and collapses
 *   them. Sending both is Meta's own recommendation: the browser contributes
 *   cookies the server cannot see, the server contributes a verified order that
 *   an ad blocker cannot suppress.
 *
 *   GA4 gets one copy, from the server only, because GA4 deduplicates nothing
 *   and two copies would be two conversions in the revenue report. `gtag` is
 *   still loaded — it owns the `_ga` cookies that let a server-reported sale
 *   join the session that produced it — but `send_page_view` is turned off so
 *   it reports nothing itself.
 *
 * Renders only on the public tenant site — never the dashboard.
 */

export interface ServerTrackingHints {
  /** Meta Conversions API is live, so the pixel's events need dedup ids. */
  meta: boolean
  /** GA4 Measurement Protocol is live, so gtag must stop sending page views. */
  ga4: boolean
  /** Shared with the server's copy of this render's PageView. */
  pageViewEventId: string
  /** Null when the page has nothing to sell, so ViewContent would be a lie. */
  viewContentEventId: string | null
}

export interface IntegrationScriptsConfig {
  gaMeasurementId: string | null
  gtmContainerId: string | null
  metaPixelId: string | null
  customHeadScript: string | null
  /** Null when this store reports from the browser only, as before. */
  serverTracking: ServerTrackingHints | null
}

export function IntegrationScripts({
  gaMeasurementId,
  gtmContainerId,
  metaPixelId,
  customHeadScript,
  serverTracking,
}: IntegrationScriptsConfig) {
  // Only suppressed when something is definitely taking over. A store with a
  // measurement id but no API secret keeps the behaviour it has always had.
  const gaConfigOptions = serverTracking?.ga4
    ? ", { 'send_page_view': false }"
    : ''

  const metaPageView = serverTracking?.meta
    ? `fbq('track', 'PageView', {}, { eventID: ${JSON.stringify(serverTracking.pageViewEventId)} });`
    : `fbq('track', 'PageView');`

  // Only paired with the server's copy. Firing it browser-only would start
  // sending a new event type to stores that never asked for one.
  const metaViewContent =
    serverTracking?.meta && serverTracking.viewContentEventId
      ? `fbq('track', 'ViewContent', {}, { eventID: ${JSON.stringify(serverTracking.viewContentEventId)} });`
      : ''

  return (
    <>
      {gaMeasurementId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaMeasurementId}'${gaConfigOptions});`}
          </Script>
        </>
      )}
      {gtmContainerId && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
            var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
            j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
            f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${gtmContainerId}');`}
        </Script>
      )}
      {metaPixelId && (
        <Script id="meta-pixel-init" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${metaPixelId}');
            ${metaPageView}
            ${metaViewContent}`}
        </Script>
      )}
      {customHeadScript && (
        <Script id="custom-head-script" strategy="afterInteractive">
          {customHeadScript}
        </Script>
      )}
    </>
  )
}
