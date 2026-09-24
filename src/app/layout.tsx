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

export const metadata: Metadata = {
  title: "Palmstone — sensory playground",
  description:
    "Ridiculously satisfying interactions for when you need to settle, focus, or just feel something.",
  applicationName: "Palmstone",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
