import { createFileRoute } from "@tanstack/react-router";
import { GridPulseDashboard } from "@/components/gridpulse-dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GridPulse — Smart EV Energy Control" },
      {
        name: "description",
        content: "Live smart EV charging and localized grid management simulation.",
      },
      { property: "og:title", content: "GridPulse — Smart EV Energy Control" },
      {
        property: "og:description",
        content: "Coordinate EV charging, renewable generation, and grid capacity in real time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GridPulseDashboard,
});
