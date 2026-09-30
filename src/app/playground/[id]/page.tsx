import { ExperiencePlayer } from "@/components/ExperiencePlayer";
import { CATALOG } from "@/engine/catalog";

export function generateStaticParams() {
  return CATALOG.map((e) => ({ id: e.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const exp = CATALOG.find((e) => e.id === id);
  const title = exp ? `${exp.name} — Palmstone` : "Play — Palmstone";
  const description = exp?.tagline ?? "Play a Palmstone experience.";
  const image = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/og.png`;
  return {
    title,
    description,
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExperiencePlayer experienceId={id} />;
}
