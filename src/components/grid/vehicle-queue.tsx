import { CarFront } from "lucide-react";

import { PanelTitle } from "./primitives";
import type { Allocation } from "@/lib/grid/types";

export function VehicleQueueSection({ allocations }: { allocations: Allocation[] }) {
  return (
    <section className="panel-strong flex flex-col overflow-hidden">
      <PanelTitle
        eyebrow="Priority queue"
        title="Active Vehicles"
        icon={CarFront}
        action={
          <span className="tnum font-mono text-[10px] uppercase tracking-wider text-primary">
            {allocations.length} connected
          </span>
        }
      />
      <div className="scroll-slim max-h-[320px] divide-y divide-border overflow-y-auto">
        {allocations.map((vehicle) => (
          <div
            key={vehicle.id}
            className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 transition-colors duration-200 hover:bg-accent/40"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <strong className="font-mono text-xs">{vehicle.id}</strong>
                <span
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    vehicle.power > 0
                      ? "bg-primary shadow-[0_0_6px_oklch(0.84_0.13_180/0.6)]"
                      : "bg-warning"
                  }`}
                />
                <span className="truncate text-[10px] text-muted-foreground">
                  Departs {vehicle.departure}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="tnum w-8 font-mono text-[10px] text-foreground">
                  {vehicle.battery}%
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${vehicle.battery}%` }}
                  />
                </div>
                <span className="tnum font-mono text-[9px] text-muted-foreground">
                  →{vehicle.target}%
                </span>
              </div>
            </div>
            <div className="text-right">
              <strong
                className={`tnum font-mono text-sm transition-colors ${
                  vehicle.power > 0 ? "text-primary" : "text-warning"
                }`}
              >
                {vehicle.power.toFixed(1)} kW
              </strong>
              <p className="tnum mt-1 font-mono text-[9px] text-muted-foreground">
                P{vehicle.priority}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
