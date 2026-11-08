import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { DemoModeBanner } from "@/components/demo-mode-banner";

// Government-grade type system: Public Sans (USWDS-derived civic grotesque)
// for UI, Fraunces for archival display authority, IBM Plex Mono for
// credential / tabular data. No Inter, no system fallback stack as voice.
const sans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

// Absolute URLs are required for social cards. APP_URL is the deployment-wide
// base URL already documented in the README; the localhost fallback keeps
// development honest instead of pointing at a domain we do not own.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_URL ?? "http://localhost:3000";

const description =
  "One people directory, one QR pass per person, and one attendance record your office can verify.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Prism Pass — Attendance you can prove",
    template: "%s · Prism Pass",
  },
  description,
  applicationName: "Prism Pass",
  openGraph: {
    type: "website",
    siteName: "Prism Pass",
    title: "Prism Pass — Attendance you can prove, not just record",
    description,
    url: "/",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Prism Pass — unified attendance and verification",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Prism Pass — Attendance you can prove, not just record",
    description,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }}>
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans`}>
        <DemoModeBanner />
        {children}
      </body>
    </html>
  );
}
