"use client";

/**
 * Root boundary: replaces the whole document when the layout itself fails, so it
 * must not assume any provider, theme or component kit is available.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F7F5F0",
          color: "#0C1B36",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "2rem" }}>
          <p style={{ fontSize: "11px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#5C6773", margin: 0 }}>
            Prism Pass
          </p>
          <h1 style={{ fontSize: "1.75rem", lineHeight: 1.2, margin: "0.5rem 0 0.75rem" }}>
            The application could not start
          </h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#5C6773", margin: 0 }}>
            Reload the page. If it keeps failing, quote the reference below to support.
          </p>
          <p style={{ marginTop: "1rem", fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#5C6773" }}>
            {error.digest ?? "no digest issued"}
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: "1.5rem",
              padding: "0.6rem 1rem",
              borderRadius: "0.5rem",
              background: "#0C1B36",
              color: "#FFFFFF",
              textDecoration: "none",
              fontSize: "0.875rem",
            }}
          >
            Back to home
          </a>
        </main>
      </body>
    </html>
  );
}
