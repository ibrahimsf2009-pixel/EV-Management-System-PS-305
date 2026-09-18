import { useState } from "react";
import { BatteryCharging, CarFront, ChevronDown, Clock3, Gauge, Info, Zap } from "lucide-react";

import { PanelTitle } from "./primitives";
import { STATUS_META } from "@/lib/grid/charging-status";
import { formatEta } from "@/lib/grid/allocation";
import type { Allocation } from "@/lib/grid/types";

/**
 * Compact battery visualization: charge bar with target marker, showing at a
 * glance where the vehicle is and where it needs to be.
 */
function BatteryBar({ battery, target }: { battery: number; target: number }) {
  return (
    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
      {/* Target marker: where this vehicle needs to get to */}
      <div
        className="absolute top-0 h-full w-px bg-foreground/40"
        style={{ left: `${Math.min(100, target)}%` }}
        aria-hidden="true"
      />
      <div
        className={`h-full rounded-full ${STATUS_META.charging.bar} transition-[width] duration-500 ease-out`}
        style={{ width: `${Math.min(100, battery)}%` }}
      />
    </div>
  );
}

/** Status chip with explanatory tooltip (also shown expanded for a11y). */
function StatusChip({ allocation }: { allocation: Allocation }) {
  const meta = STATUS_META[allocation.status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${meta.chip}`}
      title={meta.description}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/**
 * One vehicle row. The visible layer answers "what is happening"; the
 * expandable layer answers "why" — priority factors, allocation reasoning,
 * and the constraint that decided the power level.
 */
function VehicleRow({ allocation }: { allocation: Allocation }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[allocation.status];
  const isCharging = allocation.power > 0;
  const eta = formatEta(allocation);

  return (
    <div
      className={`transition-colors duration-200 ${open ? "bg-accent/40" : "hover:bg-accent/40"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="grid w-full cursor-pointer grid-cols-[1fr_auto] gap-4 px-5 py-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="font-mono text-xs">{allocation.id}</strong>
            <StatusChip allocation={allocation} />
            <span className="truncate text-[10px] text-muted-foreground">
              Departs {allocation.departure}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="tnum w-8 shrink-0 font-mono text-[10px] text-foreground">
              {allocation.battery}%
            </span>
            <BatteryBar battery={allocation.battery} target={allocation.target} />
            <span className="tnum shrink-0 font-mono text-[9px] text-muted-foreground">
              →{allocation.target}%
            </span>
          </div>
          <div className="tnum mt-1.5 flex items-center gap-3 font-mono text-[9px] text-muted-foreground">
            <span>
              {allocation.maxPower} kW max
              {isCharging && allocation.power < allocation.maxPower
                ? ` · ${allocation.power} kW now`
                : ""}
            </span>
            <span>·</span>
            <span>ETA {eta}</span>
          </div>
        </div>
        <div className="flex flex-col items-end justify-between">
          <strong
            className={`tnum font-mono text-sm transition-colors ${
              isCharging ? meta.text : "text-muted-foreground"
            }`}
          >
            {allocation.power.toFixed(1)} kW
          </strong>
          <span className="mt-1 flex items-center gap-2">
            <span
              className={`tnum rounded-full border px-2 py-0.5 font-mono text-[9px] ${
                allocation.priority >= 65
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : allocation.priority >= 40
                    ? "border-solar/30 bg-solar/10 text-solar"
                    : "border-border bg-secondary/60 text-muted-foreground"
              }`}
            >
              P{allocation.priority}
            </span>
            <ChevronDown
              size={12}
              className={`text-muted-foreground transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 bg-secondary/30 px-5 py-4">
          {/* WHY this priority */}
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <Info size={10} /> Why this priority
            </p>
            <p className="mt-1.5 text-xs leading-5 text-foreground">{allocation.priorityReason}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ["Battery", allocation.priorityFactors.batteryUrgency],
                  ["Departure", allocation.priorityFactors.departureUrgency],
                  ["Deficit", allocation.priorityFactors.energyDeficit],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <div className="flex items-center justify-between font-mono text-[9px] text-muted-foreground">
                    <span>{label}</span>
                    <span className="tnum">{Math.round(value * 100)}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.round(value * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* WHY this power (or lack of it) */}
          <div>
            <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <Zap size={10} /> Why this allocation
            </p>
            <p className="mt-1.5 text-xs leading-5 text-foreground">{allocation.powerReason}</p>
            {allocation.notes.map((note) => (
              <p
                key={note}
                className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-warning"
              >
                <Clock3 size={12} className="mt-0.5 shrink-0" />
                {note}
              </p>
            ))}
          </div>

          {/* Decision context */}
          <div className="tnum flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-2.5 font-mono text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <BatteryCharging size={10} />
              Need {allocation.energyNeededKwh} kWh
            </span>
            <span className="flex items-center gap-1.5">
              <Gauge size={10} />
              Cluster budget {allocation.capacityBudgetKw} kW
            </span>
            <span className="flex items-center gap-1.5">
              <CarFront size={10} />
              Pack {allocation.batteryPackKwh} kWh
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

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
      {allocations.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          No vehicles connected. Add an EV to start the simulation.
        </div>
      ) : (
        <div className="scroll-slim max-h-[420px] divide-y divide-border overflow-y-auto">
          {allocations.map((allocation) => (
            <VehicleRow key={allocation.id} allocation={allocation} />
          ))}
        </div>
      )}
    </section>
  );
}
