/**
 * Render the OG card to a PNG without running `next build` (memory constrained).
 *
 *   pnpm brand:og [out.png]
 *
 * The route uses automatic JSX runtime inside Next; tsx uses the classic
 * runtime, so React is placed on globalThis before the dynamic import.
 * This verifies the ImageResponse composition and the outlined SVG assets.
 */
import React from "react";
import { writeFileSync } from "node:fs";

(globalThis as unknown as { React: typeof React }).React = React;

async function main() {
  const { default: OpengraphImage } = await import("../../app/opengraph-image");
  const res = OpengraphImage();
  const buf = Buffer.from(await res.arrayBuffer());
  const out = process.argv[2] ?? "og-preview.png";
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${buf.length} bytes)`);
}

main();
