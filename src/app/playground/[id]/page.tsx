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
  return {
    title: exp ? `${exp.name} — Palmstone` : "Play — Palmstone",
    description: exp?.tagline ?? "Play a Palmstone experience.",
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
