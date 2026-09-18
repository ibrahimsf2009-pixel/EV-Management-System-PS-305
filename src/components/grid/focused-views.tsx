import { useMemo } from "react";
import {
  Activity,
  BarChart3,
  BatteryCharging,
  CarFront,
  Clock3,
  Gauge,
  Leaf,
  Settings2,
  ShieldCheck,
  Sun,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";

import { Metric, PanelTitle, Control } from "./primitives";
import { VehicleQueueSection } from "./vehicle-queue";
import { EnvironmentFooter } from "./environment-footer";
import { formatEta } from "@/lib/grid/allocation";
import {
  BUILDING_DEMAND_RANGE,
  GRID_CAPACITY_RANGE,
  SOLAR_RANGE,
  scenarioPresets,
} from "@/lib/grid/constants";
import { STATUS_META } from "@/lib/grid/charging-status";
import { computeDerived } from "@/lib/grid/derived";
import type { Allocation, ChartPoint, GridInputs, Scenario, Vehicle } from "@/lib/grid/types";

type ViewProps = {
  inputs: GridInputs;
  vehicles: Vehicle[];
  allocations: Allocation[];
  chartData: ChartPoint[];
  derived: ReturnType<typeof computeDerived>;
  evLoad: number;
  scenario: Scenario;
  onScenario: (next: Scenario) => void;
  onInput: (key: keyof GridInputs, value: number) => void;
  onReset: () => void;
};

/** ── Vehicles view: full fleet table with every decision column ────────── */
export function VehiclesView({ inputs, vehicles, allocations, derived, evLoad }: ViewProps) {
  const totalKwhNeeded = allocations.reduce((sum, a) => sum + a.energyNeededKwh, 0);
  const chargingCount = allocations.filter((a) => a.power > 0).length;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Fleet size" value={vehicles.length} icon={CarFront} />
        <Metric label="Charging now" value={chargingCount} icon={BatteryCharging} accent />
        <Metric
          label="Energy needed"
          value={totalKwhNeeded.toFixed(1)}
          unit="kWh"
          icon={Zap}
          accent
        />
        <Metric label="Fleet draw" value={evLoad.toFixed(1)} unit="kW" icon={Activity} />
        <Metric label="Headroom" value={derived.headroom.toFixed(1)} unit="kW" icon={Gauge} />
        <Metric
          label="Avg battery"
          value={
            vehicles.length
              ? Math.round(vehicles.reduce((s, v) => s + v.battery, 0) / vehicles.length)
              : 0
          }
          unit="%"
          icon={TrendingUp}
        />
      </section>

      <VehicleQueueSection allocations={allocations} />

      <section className="panel">
        <PanelTitle
          eyebrow="Full specification"
          title="Fleet Technical Sheet"
          icon={CarFront}
          action={
            <span className="tnum font-mono text-[10px] text-muted-foreground">
              {vehicles.length} vehicles
            </span>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">ID</th>
                <th className="px-3 py-3 font-medium">Battery</th>
                <th className="px-3 py-3 font-medium">Target</th>
                <th className="px-3 py-3 font-medium">Pack</th>
                <th className="px-3 py-3 font-medium">Max rate</th>
                <th className="px-3 py-3 font-medium">Departs</th>
                <th className="px-3 py-3 font-medium">Granted</th>
                <th className="px-5 py-3 font-medium">ETA</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => {
                const meta = STATUS_META[a.status];
                return (
                  <tr
                    key={a.id}
                    className="tnum border-b border-border/60 font-mono text-xs transition-colors last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-5 py-3">
                      <span className="font-semibold">{a.id}</span>
                      <span
                        className={`ml-2 inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`}
                        title={meta.label}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className={a.battery < 30 ? "text-warning" : ""}>{a.battery}%</span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{a.target}%</td>
                    <td className="px-3 py-3 text-muted-foreground">{a.batteryPackKwh} kWh</td>
                    <td className="px-3 py-3 text-muted-foreground">{a.maxPower} kW</td>
                    <td className="px-3 py-3">{a.departure}</td>
                    <td
                      className={`px-3 py-3 ${a.power > 0 ? meta.text : "text-muted-foreground"}`}
                    >
                      {a.power.toFixed(1)} kW
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{formatEta(a)}</td>
                  </tr>
                );
              })}
              {allocations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    No vehicles connected. Add one from the dashboard controls.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** ── Energy view: grid network detail with import/export breakdown ─────── */
export function EnergyView({ inputs, derived, evLoad, chartData }: ViewProps) {
  const rows: { label: string; value: string; tone?: string | undefined }[] = [
    { label: "Grid capacity", value: `${inputs.gridCapacity} kW` },
    { label: "Building demand", value: `${inputs.buildingDemand} kW` },
    { label: "Solar generation", value: `${inputs.solarGeneration} kW`, tone: "text-solar" },
    { label: "EV cluster load", value: `${evLoad.toFixed(1)} kW`, tone: "text-primary" },
    {
      label: "Transformer import",
      value: `${Math.max(0, derived.gridImport).toFixed(1)} kW`,
    },
    {
      label: "Export to grid",
      value: derived.gridImport < 0 ? `${Math.abs(derived.gridImport).toFixed(1)} kW` : "0.0 kW",
      tone: derived.gridImport < 0 ? "text-solar" : undefined,
    },
    { label: "Headroom", value: `${derived.headroom.toFixed(1)} kW`, tone: "text-primary" },
    { label: "Utilization", value: `${derived.utilization}%` },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="panel">
          <PanelTitle
            eyebrow="Node balance"
            title="Grid Import Ledger"
            icon={Zap}
            action={
              <span
                className={`tnum font-mono text-[10px] ${derived.utilization >= 90 ? "text-warning" : "text-primary"}`}
              >
                {derived.utilization}% load
              </span>
            }
          />
          <div className="divide-y divide-border/70">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-5 py-3">
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <strong className={`tnum font-mono text-sm ${row.tone ?? ""}`}>{row.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel-strong min-w-0">
          <PanelTitle
            eyebrow="Live window"
            title="Demand Trace"
            icon={Activity}
            action={<span className="font-mono text-[10px] text-muted-foreground">kW</span>}
          />
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            {chartData
              .slice(-4)
              .reverse()
              .map((point) => (
                <div
                  key={point.time}
                  className="tnum rounded-lg border border-border bg-secondary/40 p-3 font-mono text-xs"
                >
                  <p className="text-[10px] text-muted-foreground">{point.time}</p>
                  <p className="mt-1.5 text-sm">
                    {point.total}{" "}
                    <span className="text-[10px] text-muted-foreground">kW total</span>
                  </p>
                  <p className="mt-1 text-[10px] text-solar">☀ {point.solar} kW</p>
                  <p className="text-[10px] text-primary">⚡ {point.ev} kW EV</p>
                </div>
              ))}
            {chartData.length === 0 && (
              <p className="col-span-4 py-6 text-center text-xs text-muted-foreground">
                Waiting for telemetry…
              </p>
            )}
          </div>
        </section>
      </div>

      <EnvironmentFooter
        solarGeneration={inputs.solarGeneration}
        buildingDemand={inputs.buildingDemand}
        renewableShare={derived.renewableShare}
        solarSurplus={derived.solarSurplus}
        cleanCharging={derived.cleanCharging}
      />
    </div>
  );
}

/** ── Analytics view: computed performance indicators ───────────────────── */
export function AnalyticsView({ allocations, derived, inputs, evLoad, chartData }: ViewProps) {
  const stats = useMemo(() => {
    const charging = allocations.filter((a) => a.power > 0);
    const completed = allocations.filter((a) => a.status === "completed");
    const atRisk = allocations.filter((a) => a.notes.length > 0);
    const avgPriority = allocations.length
      ? Math.round(allocations.reduce((s, a) => s + a.priority, 0) / allocations.length)
      : 0;
    const servedKwhPerHour = charging.reduce((s, a) => s + a.power, 0);
    const fairness =
      charging.length > 1
        ? Math.round(
            (1 -
              Math.min(...charging.map((a) => a.power)) /
                Math.max(...charging.map((a) => a.power))) *
              100,
          )
        : 0;
    const peakTotal = chartData.reduce((max, p) => Math.max(max, p.total), 0);
    return { charging, completed, atRisk, avgPriority, servedKwhPerHour, fairness, peakTotal };
  }, [allocations, chartData]);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="Vehicles served"
          value={`${stats.charging.length}/${allocations.length}`}
          icon={BatteryCharging}
          accent
        />
        <Metric label="Completed" value={stats.completed.length} icon={ShieldCheck} />
        <Metric label="At risk" value={stats.atRisk.length} icon={Clock3} />
        <Metric label="Avg priority" value={stats.avgPriority} icon={BarChart3} />
        <Metric
          label="Delivery rate"
          value={stats.servedKwhPerHour.toFixed(1)}
          unit="kWh/h"
          icon={Zap}
          accent
        />
        <Metric
          label="Peak demand"
          value={stats.peakTotal.toFixed(1)}
          unit="kW"
          icon={TrendingUp}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <PanelTitle eyebrow="Decision engine" title="Priority Distribution" icon={BarChart3} />
          <div className="space-y-3 p-5">
            {allocations.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <span className="tnum w-14 shrink-0 font-mono text-xs">{a.id}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${
                      a.priority >= 65
                        ? "bg-gradient-to-r from-primary/70 to-primary"
                        : a.priority >= 40
                          ? "bg-gradient-to-r from-solar/70 to-solar"
                          : "bg-muted-foreground/50"
                    }`}
                    style={{ width: `${a.priority}%` }}
                  />
                </div>
                <span className="tnum w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {a.priority}
                </span>
              </div>
            ))}
            {allocations.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">No data yet.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <PanelTitle eyebrow="Quality of service" title="Efficiency Indicators" icon={Gauge} />
          <div className="grid grid-cols-2 gap-3 p-5">
            <Indicator
              label="Renewable share"
              value={`${derived.renewableShare}%`}
              note="solar vs total load"
              tone="solar"
            />
            <Indicator
              label="Clean charging"
              value={`${derived.cleanCharging.toFixed(1)} kW`}
              note="EV load covered by solar"
              tone="primary"
            />
            <Indicator
              label="Capacity utilization"
              value={`${derived.utilization}%`}
              note="transformer headroom used"
            />
            <Indicator
              label="Power spread"
              value={stats.fairness ? `${stats.fairness}%` : "even"}
              note="gap between highest & lowest grant"
            />
            <Indicator
              label="Solar surplus"
              value={`${derived.solarSurplus.toFixed(1)} kW`}
              note="exportable generation"
              tone="solar"
            />
            <Indicator
              label="Cluster budget"
              value={`${inputs.gridCapacity - inputs.buildingDemand + inputs.solarGeneration} kW`}
              note="available to EVs now"
              tone="primary"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Indicator({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "primary" | "solar";
}) {
  const toneClass =
    tone === "solar" ? "text-solar" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <strong className={`tnum mt-1 block font-mono text-lg ${toneClass}`}>{value}</strong>
      <p className="mt-1 text-[10px] text-muted-foreground">{note}</p>
    </div>
  );
}

/** ── Settings view: scenario presets, live sliders, allocator reference ── */
export function SettingsView({
  inputs,
  scenario,
  onScenario,
  onInput,
  onReset,
  allocations,
}: ViewProps) {
  const ranges = {
    gridCapacity: GRID_CAPACITY_RANGE,
    buildingDemand: BUILDING_DEMAND_RANGE,
    solarGeneration: SOLAR_RANGE,
  } as const;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <section className="panel">
        <PanelTitle eyebrow="Simulation" title="Grid Controls" icon={Settings2} />
        <div className="space-y-6 p-5">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Scenario preset</p>
            <div className="grid grid-cols-3 gap-2">
              {(["normal", "peak", "solar"] as Scenario[]).map((item) => {
                const preset = scenarioPresets[item];
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onScenario(item)}
                    className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                      scenario === item
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-secondary/40 hover:border-border hover:bg-secondary/70"
                    }`}
                  >
                    <span
                      className={`font-mono text-[10px] uppercase tracking-wider ${
                        scenario === item ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {item === "solar" ? "Solar surplus" : item}
                    </span>
                    <span className="tnum mt-1.5 block font-mono text-[10px] text-muted-foreground">
                      {preset.gridCapacity} kW cap · {preset.buildingDemand} kW bld ·{" "}
                      {preset.solarGeneration} kW sun
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Control
            label="Grid capacity"
            value={inputs.gridCapacity}
            min={ranges.gridCapacity.min}
            max={ranges.gridCapacity.max}
            unit="kW"
            onChange={(value) => onInput("gridCapacity", value)}
          />
          <Control
            label="Building demand"
            value={inputs.buildingDemand}
            min={ranges.buildingDemand.min}
            max={ranges.buildingDemand.max}
            unit="kW"
            onChange={(value) => onInput("buildingDemand", value)}
          />
          <Control
            label="Solar generation"
            value={inputs.solarGeneration}
            min={ranges.solarGeneration.min}
            max={ranges.solarGeneration.max}
            unit="kW"
            onChange={(value) => onInput("solarGeneration", value)}
          />

          <button
            type="button"
            onClick={onReset}
            className="cursor-pointer rounded-md border border-warning/40 bg-warning/10 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-warning transition-colors hover:bg-warning/20"
          >
            Reset simulation to defaults
          </button>
        </div>
      </section>

      <section className="panel">
        <PanelTitle
          eyebrow="How decisions are made"
          title="Allocator Reference"
          icon={ShieldCheck}
        />
        <div className="space-y-4 p-5 text-xs leading-6 text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Budget:</span> the EV cluster may draw{" "}
            <span className="tnum font-mono text-primary">
              {Math.max(0, inputs.gridCapacity - inputs.buildingDemand + inputs.solarGeneration)} kW
            </span>{" "}
            — grid capacity minus building load plus on-site solar. The transformer can never be
            overloaded, even during solar surplus.
          </p>
          <p>
            <span className="font-semibold text-foreground">Priority score:</span> 40% battery
            urgency + 35% departure urgency + 25% energy deficit, recomputed against the real clock.
          </p>
          <p>
            <span className="font-semibold text-foreground">Two phases:</span> the highest-priority
            vehicles are served at full rate first; remaining headroom is shared fairly
            (water-filling) among the rest.
          </p>
          <div className="rounded-lg border border-border bg-secondary/40 p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Live queue snapshot
            </p>
            {allocations.slice(0, 4).map((a) => (
              <p key={a.id} className="tnum font-mono text-[11px]">
                <span className="text-foreground">{a.id}</span>{" "}
                <span className="text-muted-foreground">
                  P{a.priority} · {a.power.toFixed(1)}/{a.maxPower} kW
                </span>
              </p>
            ))}
            {allocations.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No vehicles connected.</p>
            )}
          </div>
          <p className="flex items-center gap-2 text-[10px]">
            <Timer size={12} className="text-primary" />
            All decisions recompute automatically every 30 seconds.
          </p>
          <p className="flex items-center gap-2 text-[10px]">
            <Leaf size={12} className="text-solar" />
            State persists to Supabase and survives reloads.
          </p>
        </div>
      </section>
    </div>
  );
}
