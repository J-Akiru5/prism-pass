import { ImageResponse } from "next/og";
import { ogLockupSvg, ogValuePropSvg } from "../components/brand/wordmark-geometry";

export const runtime = "nodejs";
export const alt = "Prism Pass — unified attendance and verification";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function dataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Open Graph card: the horizontal lockup and the one-line value proposition.
 * Both are outlined SVG, so the card is independent of installed fonts.
 */
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
          background: "#0C1B36",
          color: "#F7F5F0",
          padding: "64px 80px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri(ogLockupSvg())} width={358} height={125} alt="" />

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", width: 96, height: 6, background: "#C9A24B" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri(ogValuePropSvg())} width={1001} height={79} alt="" />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#8FA0BD",
          }}
        >
          <span>Prism Pass</span>
          <span>Syntaxure Labs</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
