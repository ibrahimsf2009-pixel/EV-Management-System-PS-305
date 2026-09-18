import { Clock3, ChevronRight, ShieldCheck } from "lucide-react";

import { PanelTitle } from "./primitives";
import type { Allocation } from "@/lib/grid/types";

export function SmartAllocationSection({ allocations }: { allocations: Allocation[] }) {
  return (
    <section className="panel">
      <PanelTitle
        eyebrow="Transparent decision engine"
        title="Smart Allocation"
        icon={ShieldCheck}
      />
      <div className="grid divide-y divide-border p-3 sm:grid-cols-3 sm:gap-3 sm:divide-y-0">
        {allocations.slice(0, 3).map((vehicle, index) => (
          <div
            key={vehicle.id}
            className="rounded-lg border border-transparent p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-secondary/50 sm:bg-secondary/30"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-foreground">{vehicle.id}</span>
              <span
                className={`tnum rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                  index === 0
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-secondary/60 text-muted-foreground"
                }`}
              >
                P{vehicle.priority}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{vehicle.reason}</p>
            <div className="tnum mt-4 flex items-center gap-2 text-[10px] text-muted-foreground">
              <Clock3 size={12} />
              <span>{vehicle.departure}</span>
              <ChevronRight size={12} />
              <span className="text-foreground">{vehicle.power.toFixed(1)} kW</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
