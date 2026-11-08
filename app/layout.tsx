import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { DemoModeBanner } from "@/components/demo-mode-banner";

const inter = Inter({ subsets: ["latin"] });

// Absolute URLs are required for social cards. APP_URL is the deployment-wide
// base URL already documented in the README; the localhost fallback keeps
// development honest instead of pointing at a domain we do not own.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_URL ?? "http://localhost:3000";

const description =
  "One people directory, one verifiable QR identity pass, and one canonical attendance engine — scoped to your organization and verified on the server.";

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
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5F0" },
    { media: "(prefers-color-scheme: dark)", color: "#0C1B36" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <DemoModeBanner />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
