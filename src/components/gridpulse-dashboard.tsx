import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BatteryCharging,
  Bolt,
  CarFront,
  CircleGauge,
  Gauge,
  Minus,
  RotateCcw,
  Settings2,
  Sun,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { EnergyFlowSection } from "@/components/grid/energy-flow";
import { EnvironmentFooter } from "@/components/grid/environment-footer";
import { Metric, Control, PanelTitle } from "@/components/grid/primitives";
import { PowerDemandChart } from "@/components/grid/power-demand-chart";
import { SmartAllocationSection } from "@/components/grid/smart-allocation";
import { VehicleDialog } from "@/components/grid/vehicle-dialog";
import { VehicleQueueSection } from "@/components/grid/vehicle-queue";
import { allocate, minutesOfDay } from "@/lib/grid/allocation";
import {
  BUILDING_DEMAND_RANGE,
  GRID_CAPACITY_RANGE,
  SOLAR_RANGE,
  chartSeed,
  initialVehicles,
  scenarioPresets,
} from "@/lib/grid/constants";
import { computeDerived } from "@/lib/grid/derived";
import { DEMO_STATE_ID, mapDemoStateRow, supabase } from "@/lib/grid/persistence";
import type { ChartPoint, Scenario, View } from "@/lib/grid/types";

const NAV: { id: View; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "vehicles", label: "Vehicles" },
  { id: "energy", label: "Energy" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

const VIEW_TITLES: Record<Exclude<View, "dashboard">, { panel: string; icon: typeof Zap }> = {
  vehicles: { panel: "Vehicle Fleet", icon: CarFront },
  energy: { panel: "Energy Network", icon: Zap },
  analytics: { panel: "Performance Analytics", icon: BarChart3 },
  settings: { panel: "Simulation Settings", icon: Settings2 },
};

export function GridPulseDashboard() {
  const [view, setView] = useState<View>("dashboard");
  const [gridCapacity, setGridCapacity] = useState<number>(scenarioPresets.normal.gridCapacity);
  const [buildingDemand, setBuildingDemand] = useState<number>(
    scenarioPresets.normal.buildingDemand,
  );
  const [solarGeneration, setSolarGeneration] = useState<number>(
    scenarioPresets.normal.solarGeneration,
  );
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [chartData, setChartData] = useState<ChartPoint[]>(chartSeed);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [synced, setSynced] = useState(false);

  // Real-clock urgency: departure priorities now follow the actual time of day.
  const [nowMinutes, setNowMinutes] = useState(() => minutesOfDay(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setNowMinutes(minutesOfDay(new Date())), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Load persisted demo state. Only mark as synced when the load itself
  // succeeded — otherwise a later save would wipe the remote row with defaults.
  useEffect(() => {
    let active = true;
    supabase
      .from("gridpulse_demo_state")
      .select("*")
      .eq("id", DEMO_STATE_ID)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("[GridPulse] failed to load saved state:", error.message);
          toast.error("Couldn't load saved state — running on local defaults.");
        } else {
          const mapped = mapDemoStateRow(data as unknown as Record<string, unknown> | null);
          if (mapped) {
            setGridCapacity(mapped.gridCapacity);
            setBuildingDemand(mapped.buildingDemand);
            setSolarGeneration(mapped.solarGeneration);
            if (mapped.vehicles.length) setVehicles(mapped.vehicles);
          }
          setSynced(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Debounced save, gated on a successful initial load.
  useEffect(() => {
    if (!synced) return;
    const timer = window.setTimeout(() => {
      void supabase
        .from("gridpulse_demo_state")
        .upsert({
          id: DEMO_STATE_ID,
          grid_capacity: gridCapacity,
          building_demand: buildingDemand,
          solar_generation: solarGeneration,
          vehicles,
          updated_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) {
            console.error("[GridPulse] failed to save state:", error.message);
            toast.error("Saving simulation state failed.");
          }
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [synced, gridCapacity, buildingDemand, solarGeneration, vehicles]);

  // Rolling telemetry window.
  const allocations = useMemo(
    () => allocate(vehicles, { gridCapacity, buildingDemand, solarGeneration }, nowMinutes),
    [vehicles, gridCapacity, buildingDemand, solarGeneration, nowMinutes],
  );
  const evLoad = allocations.reduce((sum, vehicle) => sum + vehicle.power, 0);
  const derived = useMemo(
    () => computeDerived({ gridCapacity, buildingDemand, solarGeneration }, evLoad),
    [gridCapacity, buildingDemand, solarGeneration, evLoad],
  );
  const isConstrained =
    derived.utilization >= 90 || allocations.some((vehicle) => vehicle.power < vehicle.maxPower);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setChartData((previous) => [
        ...previous.slice(-8),
        {
          time: stamp,
          building: buildingDemand,
          ev: Number(evLoad.toFixed(1)),
          solar: solarGeneration,
          total: Number(derived.totalDemand.toFixed(1)),
          limit: gridCapacity,
        },
      ]);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [buildingDemand, evLoad, solarGeneration, derived.totalDemand, gridCapacity]);

  const applyScenario = useCallback((next: Scenario) => {
    setScenario(next);
    setGridCapacity(scenarioPresets[next].gridCapacity);
    setBuildingDemand(scenarioPresets[next].buildingDemand);
    setSolarGeneration(scenarioPresets[next].solarGeneration);
  }, []);

  const addVehicle = useCallback((vehicle: (typeof vehicles)[number]) => {
    setVehicles((current) => [...current, vehicle]);
  }, []);

  return (
    <main className="control-grid min-h-screen text-foreground">
      <Toaster position="bottom-right" />

      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 lg:px-7">
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => setView("dashboard")}
              className="group flex items-center gap-2.5"
              aria-label="Open dashboard"
            >
              <span className="grid h-8 w-8 place-items-center rounded-md border border-primary/30 bg-primary/15 text-primary shadow-[0_0_14px_-4px_oklch(0.84_0.13_180/0.5)] transition-colors group-hover:bg-primary/25">
                <Bolt size={16} fill="currentColor" />
              </span>
              <span className="font-mono text-base font-medium uppercase tracking-wide">
                Grid<span className="text-primary">Pulse</span>
              </span>
            </button>
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
              {NAV.map((item) => (
                <Button
                  key={item.id}
                  variant={view === item.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setView(item.id)}
                  className={
                    view === item.id
                      ? "border border-primary/20 bg-primary/10 text-primary"
                      : "text-muted-foreground"
                  }
                >
                  {item.label}
                </Button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="pulse-ring absolute inset-0 rounded-full bg-primary" />
              <span className="relative h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
              System operational
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-7">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-primary/80">
              Localized cluster // GP-01
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold">
              {view === "dashboard"
                ? "Live Energy Operations"
                : view.charAt(0).toUpperCase() + view.slice(1)}
            </h1>
          </div>
          <div className="flex overflow-x-auto rounded-lg border border-border bg-card p-1 backdrop-blur-sm lg:hidden">
            {NAV.map((item) => (
              <Button
                key={item.id}
                variant={view === item.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="hidden items-center gap-2.5 md:flex">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Live telemetry
            </span>
            <span className="h-px w-12 bg-gradient-to-r from-primary/60 to-transparent" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
              Synced
            </span>
          </div>
        </div>

        {view !== "dashboard" && (
          <section className="panel mb-5">
            <PanelTitle
              eyebrow="Focused view"
              title={VIEW_TITLES[view].panel}
              icon={VIEW_TITLES[view].icon}
            />
            <div className="p-5 text-sm text-muted-foreground">
              This focused view uses the same live simulation. Controls and telemetry remain
              synchronized with the main operations board.
            </div>
          </section>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Active EVs" value={vehicles.length} icon={CarFront} />
          <Metric
            label="Total demand"
            value={derived.totalDemand.toFixed(1)}
            unit="kW"
            icon={Activity}
          />
          <Metric label="Grid capacity" value={gridCapacity} unit="kW" icon={Gauge} />
          <Metric
            label="Grid headroom"
            value={derived.headroom.toFixed(1)}
            unit="kW"
            icon={CircleGauge}
            accent
          />
          <Metric label="Solar generation" value={solarGeneration} unit="kW" icon={Sun} />
          <Metric
            label="EV charging"
            value={evLoad.toFixed(1)}
            unit="kW"
            icon={BatteryCharging}
            accent
          />
        </section>

        {isConstrained && (
          <div
            className="mt-4 flex flex-col justify-between gap-3 rounded-lg border border-warning/35 bg-warning/10 px-4 py-3 shadow-[0_10px_28px_-18px_oklch(0.77_0.15_65/0.5)] backdrop-blur-sm transition-colors md:flex-row md:items-center"
            role="alert"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="shrink-0 text-warning" size={20} />
              <div>
                <p className="text-sm font-semibold text-warning">Grid constraint detected</p>
                <p className="text-xs text-muted-foreground">
                  EV charging automatically optimized · transformer limit protected
                </p>
              </div>
            </div>
            <span className="tnum font-mono text-[10px] uppercase tracking-wider text-warning">
              {derived.utilization}% utilized
            </span>
          </div>
        )}

        <div className="mt-5">
          <EnergyFlowSection
            inputs={{ gridCapacity, buildingDemand, solarGeneration }}
            totalDemand={derived.totalDemand}
            evLoad={evLoad}
          />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <PowerDemandChart data={chartData} />
          <VehicleQueueSection allocations={allocations} />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <SmartAllocationSection allocations={allocations} />

          <section className="panel">
            <PanelTitle eyebrow="Adaptive inputs" title="Simulation Controls" icon={Settings2} />
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-3 gap-2">
                {(["normal", "peak", "solar"] as Scenario[]).map((item) => (
                  <Button
                    key={item}
                    variant={scenario === item ? "default" : "outline"}
                    size="sm"
                    onClick={() => applyScenario(item)}
                    className="px-1.5 text-[9px] uppercase tracking-wider sm:px-2 sm:text-[10px]"
                  >
                    {item === "solar" ? "Solar surplus" : item}
                  </Button>
                ))}
              </div>
              <Control
                label="Grid capacity"
                value={gridCapacity}
                min={GRID_CAPACITY_RANGE.min}
                max={GRID_CAPACITY_RANGE.max}
                unit="kW"
                onChange={(value) => {
                  setGridCapacity(value);
                  setScenario("normal");
                }}
              />
              <Control
                label="Building demand"
                value={buildingDemand}
                min={BUILDING_DEMAND_RANGE.min}
                max={BUILDING_DEMAND_RANGE.max}
                unit="kW"
                onChange={(value) => {
                  setBuildingDemand(value);
                  setScenario("normal");
                }}
              />
              <Control
                label="Solar generation"
                value={solarGeneration}
                min={SOLAR_RANGE.min}
                max={SOLAR_RANGE.max}
                unit="kW"
                onChange={(value) => {
                  setSolarGeneration(value);
                  setScenario("normal");
                }}
              />
              <div className="flex gap-2 pt-1">
                <VehicleDialog vehicles={vehicles} onAdd={addVehicle} />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setVehicles((current) => current.slice(0, -1))}
                  disabled={!vehicles.length}
                  title="Remove last EV"
                >
                  <Minus size={14} />
                  <span className="sr-only">Remove last EV</span>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setVehicles(initialVehicles);
                    applyScenario("normal");
                  }}
                  title="Reset simulation"
                >
                  <RotateCcw size={14} />
                  <span className="sr-only">Reset simulation</span>
                </Button>
              </div>
            </div>
          </section>
        </div>

        <EnvironmentFooter
          solarGeneration={solarGeneration}
          buildingDemand={buildingDemand}
          renewableShare={derived.renewableShare}
          solarSurplus={derived.solarSurplus}
          cleanCharging={derived.cleanCharging}
        />
      </div>
    </main>
  );
}
