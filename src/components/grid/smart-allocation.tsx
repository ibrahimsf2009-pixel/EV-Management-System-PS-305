import { Clock3, ChevronRight, ShieldCheck } from "lucide-react";

import { PanelTitle } from "./primitives";
import { STATUS_META } from "@/lib/grid/charging-status";
import type { Allocation } from "@/lib/grid/types";

/**
 * Decision-engine panel: shows the top of the queue with the system's own
 * reasoning — why the vehicle ranks where it does, and why it receives the
 * power it does. Deterministic control logic, explained honestly.
 */
export function SmartAllocationSection({ allocations }: { allocations: Allocation[] }) {
  return (
    <section className="panel">
      <PanelTitle
        eyebrow="Transparent decision engine"
        title="Smart Allocation"
        icon={ShieldCheck}
      />
      {allocations.length === 0 ? (
        <div className="p-5 text-xs text-muted-foreground">
          Connect a vehicle to see allocation decisions.
        </div>
      ) : (
        <div className="grid divide-y divide-border p-3 sm:grid-cols-3 sm:gap-3 sm:divide-y-0">
          {allocations.slice(0, 3).map((allocation, index) => {
            const meta = STATUS_META[allocation.status];
            return (
              <div
                key={allocation.id}
                className="rounded-lg border border-transparent p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-secondary/50 sm:bg-secondary/30"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-foreground">{allocation.id}</span>
                  <span
                    className={`tnum rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                      index === 0
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-secondary/60 text-muted-foreground"
                    }`}
                  >
                    P{allocation.priority}
                  </span>
                </div>
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${meta.chip}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </div>
                {/* Why this rank */}
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {allocation.priorityReason}
                </p>
                {/* Why this power */}
                <p className="mt-2 text-xs leading-5 text-foreground">{allocation.powerReason}</p>
                <div className="tnum mt-4 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Clock3 size={12} />
                  <span>{allocation.departure}</span>
                  <ChevronRight size={12} />
                  <span className="text-foreground">
                    {allocation.power.toFixed(1)} / {allocation.maxPower} kW
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
