import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Palmstone",
    short_name: "Palmstone",
    description:
      "Ridiculously satisfying interactions for when you need to settle, focus, or just feel something.",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#0f1412",
    theme_color: "#0f1412",
    icons: [
      { src: "./icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "./icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "./apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
