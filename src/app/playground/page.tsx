import { PlaygroundRouter } from "@/components/PlaygroundRouter";

export const metadata = {
  title: "Playground — Palmstone",
  description: "A personal sensory space — settle, focus, or give your hands something to do.",
};

export default function PlaygroundPage() {
  return <PlaygroundRouter />;
}
