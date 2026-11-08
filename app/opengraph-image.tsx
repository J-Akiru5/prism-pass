import { ImageResponse } from "next/og";
import { BRAND_DESCRIPTOR, BRAND_NAME, BRAND_TAGLINE } from "@/components/brand/logo";

export const runtime = "nodejs";
export const alt = "Prism Pass — attendance you can prove";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK = (
  <svg width="112" height="112" viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="9" fill="#0F172A" />
    <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="8.4" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="1.2" fill="none" />
    <path d="M16 4.9 25.4 10.45v11.1L16 27.1 6.6 21.55v-11.1z" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M5.6 16h11.2" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    <path d="M16 16 24.2 11.2" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" />
    <path d="M16 16h8.8" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
    <path d="M16 16 24.2 20.8" stroke="#34D399" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Open Graph card: brand lockup, tagline, and the descriptor line. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FFFFFF",
          color: "#0F172A",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/svg+xml;base64,${Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0F172A"/><path d="M16 4.9 25.4 10.45v11.1L16 27.1 6.6 21.55v-11.1z" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round"/><path d="M5.6 16h11.2" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><path d="M16 16 24.2 11.2" stroke="#60A5FA" stroke-width="2" stroke-linecap="round"/><path d="M16 16h8.8" stroke="#A78BFA" stroke-width="2" stroke-linecap="round"/><path d="M16 16 24.2 20.8" stroke="#34D399" stroke-width="2" stroke-linecap="round"/></svg>`
            ).toString("base64")}`}
            width={112}
            height={112}
            alt=""
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.03em" }}>{BRAND_NAME}</span>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.2em", color: "#64748B" }}>
              {BRAND_DESCRIPTOR.toUpperCase()}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", width: 96, height: 6, background: "#2563EB" }} />
          <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{BRAND_TAGLINE}.</span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#94A3B8",
          }}
        >
          <span>Verified attendance</span>
          <span>Syntaxure Labs</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
