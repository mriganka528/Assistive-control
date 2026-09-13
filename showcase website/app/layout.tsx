import type { Metadata, Viewport } from "next";
import { Header } from "../components/header";
import { Footer } from "../components/footer";
import "./globals.css";

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (productionHost ? `https://${productionHost}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Assistive Control — Small movements. More independence.", template: "%s | Assistive Control" },
  description: "Control your Windows computer with the face and hand movements that work for you. Discover Assistive Control, see the app, and download the installer or portable version.",
  applicationName: "Assistive Control",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  openGraph: {
    type: "website", locale: "en_US", siteName: "Assistive Control",
    title: "Small movements. More independence.",
    description: "A more personal way to control your computer. Face and hand tracking, personalized controls, and local processing for Windows.",
    images: [{ url: "/social-preview.png", width: 1200, height: 630, alt: "Assistive Control: Small movements. More independence." }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#f6f8fb", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><Header />{children}<Footer /></body></html>;
}
