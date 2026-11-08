import { ImageResponse } from "next/og";

/**
 * Social share card (1200×630) rendered at request time by `next/og`.
 * No fonts or images are fetched: the bundled fallback font is used and the
 * prism mark is inlined as an SVG data URI, so the route works offline and
 * adds no runtime dependency.
 *
 * Geometry mirrors `components/brand/prism-pass-logo.tsx` and `app/icon.svg`.
 */
export const alt = "Prism Pass — attendance you can prove, not just record.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C9D6EE"/>
    </linearGradient>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE6F7"/>
    </linearGradient>
    <linearGradient id="m" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#C9A24B"/><stop offset="1" stop-color="#E4CD8E"/>
    </linearGradient>
  </defs>
  <path d="M24 8 L41 36 L24 36 Z" fill="url(#b)"/>
  <path d="M24 8 L7 36 L24 36 Z" fill="url(#f)"/>
  <path d="M24 8 L24 36" stroke="#0C1B36" stroke-opacity="0.28" stroke-width="1"/>
  <path d="M24 8 L7 36" stroke="#E4CD8E" stroke-opacity="0.55" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="M0.6 30 H11.4" stroke="url(#m)" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M11.4 30 L35.3 26.6" stroke="#C9A24B" stroke-opacity="0.7" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M35.3 26.6 L47.4 17.8" stroke="#4C7BE0" stroke-width="1.9" stroke-linecap="round"/>
  <path d="M35.3 26.6 L47.4 24.1" stroke="#C9A24B" stroke-width="1.9" stroke-linecap="round"/>
  <path d="M35.3 26.6 L47.4 30.2" stroke="#E4CD8E" stroke-width="1.9" stroke-linecap="round"/>
</svg>`;

const markSrc = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "radial-gradient(120% 90% at 8% 0%, #1B3A6B 0%, #0C1B36 52%, #070F22 100%)",
          color: "#F7F5F0",
          padding: 76,
        }}
      >
        {/* lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={92} height={92} alt="" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1 }}>Prism Pass</div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 4, color: "#E4CD8E" }}>
              ATTENDANCE &amp; VERIFICATION
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 64, maxWidth: 940 }}>
          <div style={{ display: "flex", fontSize: 74, fontWeight: 700, letterSpacing: -2.4, lineHeight: 1.06 }}>
            Attendance you can&nbsp;<span style={{ color: "#E4CD8E" }}>prove</span>,
          </div>
          <div style={{ display: "flex", fontSize: 74, fontWeight: 700, letterSpacing: -2.4, lineHeight: 1.06 }}>not just record.</div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 24, lineHeight: 1.45, color: "#B9C6DA", maxWidth: 800 }}>
            One directory, one verifiable identity pass, one attendance engine — scoped to your organization and
            verified on the server.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", width: 26, height: 26, borderRadius: 7, background: "#C9A24B", color: "#0C1B36", fontSize: 15, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>
              S
            </div>
            <div style={{ fontSize: 18, color: "#7F92B4" }}>Powered by Syntaxure Labs</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, fontWeight: 700, letterSpacing: 2.6, color: "#E4CD8E" }}>
            <div style={{ display: "flex", width: 8, height: 8, borderRadius: 4, background: "#C9A24B" }} />
            IDENTITY · ATTENDANCE · AUDIT
          </div>
        </div>
      </div>
    ),
    size,
  );
}
