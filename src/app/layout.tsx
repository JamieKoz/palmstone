import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { SiteAudio } from "@/components/SiteAudio";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const siteOrigin = "https://jamiekoz.github.io";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const shareImage = `${basePath}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "Palmstone — sensory playground",
  description:
    "Ridiculously satisfying interactions for when you need to settle, focus, or just feel something.",
  applicationName: "Palmstone",
  appleWebApp: {
    capable: true,
    title: "Palmstone",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Palmstone — sensory playground",
    description:
      "Ridiculously satisfying interactions for when you need to settle, focus, or just feel something.",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Palmstone — sensory playground",
    description:
      "Ridiculously satisfying interactions for when you need to settle, focus, or just feel something.",
    images: [shareImage],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1412",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full font-[family-name:var(--font-body)]">
        <SiteAudio />
        {children}
      </body>
    </html>
  );
}
