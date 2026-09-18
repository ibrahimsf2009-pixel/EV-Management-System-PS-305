import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, BatteryCharging, Bolt, Building2,
  CarFront, ChevronRight, CircleGauge, Clock3, CloudSun, Gauge, Leaf,
  Minus, Plus, RotateCcw, Settings2, ShieldCheck, Sun, Zap,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

type Vehicle = {
  id: string;
  battery: number;
  target: number;
  departure: string;
  maxPower: number;
};

type Allocation = Vehicle & {
  priority: number;
  power: number;
  reason: string;
};

type Scenario = "normal" | "peak" | "solar";
type View = "dashboard" | "vehicles" | "energy" | "analytics" | "settings";

const initialVehicles: Vehicle[] = [
  { id: "EV-07", battery: 18, target: 85, departure: "09:15", maxPower: 11 },
  { id: "EV-03", battery: 42, target: 80, departure: "11:30", maxPower: 7 },
  { id: "EV-11", battery: 76, target: 90, departure: "16:45", maxPower: 7 },
  { id: "EV-04", battery: 63, target: 90, departure: "14:20", maxPower: 11 },
  { id: "EV-09", battery: 31, target: 75, departure: "12:10", maxPower: 7 },
];

const chartSeed = [
  { time: "08:00", building: 14, ev: 13, solar: 5, total: 22, limit: 50 },
  { time: "08:10", building: 16, ev: 17, solar: 7, total: 26, limit: 50 },
  { time: "08:20", building: 20, ev: 18, solar: 11, total: 27, limit: 50 },
  { time: "08:30", building: 22, ev: 20, solar: 14, total: 28, limit: 50 },
  { time: "08:40", building: 19, ev: 21, solar: 17, total: 23, limit: 50 },
];

function scoreVehicle(vehicle: Vehicle) {
  const parts = vehicle.departure.split(":").map(Number);
  const hours = parts[0] ?? 12;
  const minutes = parts[1] ?? 0;
  const departureMinutes = (Number.isFinite(hours) ? hours : 12) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  const currentMinutes = 8 * 60 + 40;
  const urgency = Math.max(0, 1 - Math.max(0, departureMinutes - currentMinutes) / 600);
  const deficit = Math.max(0, vehicle.target - vehicle.battery) / 100;
  const lowBattery = (100 - vehicle.battery) / 100;
  return Math.round((lowBattery * 0.4 + urgency * 0.35 + deficit * 0.25) * 100);
}

function allocate(vehicles: Vehicle[], capacity: number, building: number, solar: number): Allocation[] {
  let budget = Math.max(0, capacity - Math.max(0, building - solar));
  return [...vehicles]
    .sort((a, b) => scoreVehicle(b) - scoreVehicle(a))
    .map((vehicle) => {
      const priority = scoreVehicle(vehicle);
      const power = Math.min(vehicle.maxPower, Math.max(0, budget));
      budget -= power;
      const urgent = vehicle.battery < 30 || priority >= 65;
      const reason = power === vehicle.maxPower
        ? urgent ? "Full allocation · low battery + early departure" : "Full allocation · capacity available"
        : power > 0 ? "Reduced allocation · transformer headroom protected" : "Paused · higher-priority vehicles protected";
      return { ...vehicle, priority, power: Number(power.toFixed(1)), reason };
    });
}

function Metric({ label, value, unit, icon: Icon, accent = false }: { label: string; value: string | number; unit?: string; icon: typeof Activity; accent?: boolean }) {
  return (
    <div className="group relative overflow-hidden border border-border bg-card p-4 transition-colors hover:border-primary/45">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
        <Icon className={accent ? "text-primary" : "text-muted-foreground"} size={16} aria-hidden="true" />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5 font-mono">
        <span className={accent ? "text-2xl font-medium text-primary" : "text-2xl font-medium text-foreground"}>{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function PanelTitle({ eyebrow, title, icon: Icon, action }: { eyebrow: string; title: string; icon: typeof Activity; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center border border-primary/25 bg-energy-soft/40 text-primary"><Icon size={16} /></span>
        <div><p className="font-mono text-[9px] uppercase text-primary">{eyebrow}</p><h2 className="text-sm font-semibold text-foreground">{title}</h2></div>
      </div>
      {action}
    </div>
  );
}

function FlowNode({ icon: Icon, label, value, tone = "energy" }: { icon: typeof Sun; label: string; value: string; tone?: "energy" | "solar" | "neutral" }) {
  const toneClass = tone === "solar" ? "border-solar/40 bg-solar/5 text-solar" : tone === "neutral" ? "border-border bg-secondary text-foreground" : "border-primary/40 bg-energy-soft/30 text-primary";
  return (
    <div className={`relative z-10 flex min-w-28 flex-col items-center border p-3 ${toneClass}`}>
      <Icon size={20} />
      <span className="mt-2 text-[9px] font-semibold uppercase text-muted-foreground">{label}</span>
      <strong className="mt-1 font-mono text-sm">{value}</strong>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="relative h-8 w-px shrink-0 bg-border lg:h-px lg:w-auto lg:flex-1">
      <span className="scan-bar absolute left-0 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)] lg:left-0" />
    </div>
  );
}

function Control({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><span className="font-mono text-xs text-foreground">{value} {unit}</span></div>
      <Slider value={[value]} min={min} max={max} step={1} onValueChange={(next) => onChange(next[0] ?? value)} aria-label={label} />
    </div>
  );
}

export function GridPulseDashboard() {
  const [view, setView] = useState<View>("dashboard");
  const [gridCapacity, setGridCapacity] = useState(50);
  const [buildingDemand, setBuildingDemand] = useState(17);
  const [solarGeneration, setSolarGeneration] = useState(17);
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [chartData, setChartData] = useState(chartSeed);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Vehicle>({ id: "EV-12", battery: 25, target: 80, departure: "13:30", maxPower: 7 });
  const [synced, setSynced] = useState(false);

  const allocations = useMemo(() => allocate(vehicles, gridCapacity, buildingDemand, solarGeneration), [vehicles, gridCapacity, buildingDemand, solarGeneration]);
  const evLoad = allocations.reduce((sum, vehicle) => sum + vehicle.power, 0);
  const netBuilding = Math.max(0, buildingDemand - solarGeneration);
  const totalDemand = netBuilding + evLoad;
  const headroom = Math.max(0, gridCapacity - totalDemand);
  const utilization = gridCapacity ? Math.round(totalDemand / gridCapacity * 100) : 0;
  const isConstrained = utilization >= 90 || allocations.some((vehicle) => vehicle.power < vehicle.maxPower);
  const renewableShare = Math.min(100, Math.round(solarGeneration / Math.max(1, buildingDemand + evLoad) * 100));

  useEffect(() => {
    let active = true;
    supabase.from("gridpulse_demo_state").select("*").eq("id", "main").maybeSingle().then(({ data }) => {
      if (!active) return;
      if (data) {
        setGridCapacity(Number(data.grid_capacity));
        setBuildingDemand(Number(data.building_demand));
        setSolarGeneration(Number(data.solar_generation));
        if (Array.isArray(data.vehicles) && data.vehicles.length) setVehicles(data.vehicles as unknown as Vehicle[]);
      }
      setSynced(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!synced) return;
    const timer = window.setTimeout(() => {
      void supabase.from("gridpulse_demo_state").upsert({
        id: "main", grid_capacity: gridCapacity, building_demand: buildingDemand,
        solar_generation: solarGeneration, vehicles, updated_at: new Date().toISOString(),
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [synced, gridCapacity, buildingDemand, solarGeneration, vehicles]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setChartData((previous) => [...previous.slice(-8), {
        time: stamp, building: buildingDemand, ev: Number(evLoad.toFixed(1)), solar: solarGeneration,
        total: Number(totalDemand.toFixed(1)), limit: gridCapacity,
      }]);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [buildingDemand, evLoad, solarGeneration, totalDemand, gridCapacity]);

  const applyScenario = useCallback((next: Scenario) => {
    setScenario(next);
    if (next === "normal") { setGridCapacity(50); setBuildingDemand(17); setSolarGeneration(17); }
    if (next === "peak") { setGridCapacity(50); setBuildingDemand(42); setSolarGeneration(4); }
    if (next === "solar") { setGridCapacity(50); setBuildingDemand(19); setSolarGeneration(34); }
  }, []);

  const addVehicle = () => {
    const cleanId = form.id.trim().toUpperCase();
    if (!cleanId || vehicles.some((item) => item.id === cleanId)) return;
    setVehicles((current) => [...current, { ...form, id: cleanId }]);
    setDialogOpen(false);
    setForm({ id: `EV-${String(vehicles.length + 8).padStart(2, "0")}`, battery: 25, target: 80, departure: "13:30", maxPower: 7 });
  };

  const nav: { id: View; label: string }[] = [
    { id: "dashboard", label: "Dashboard" }, { id: "vehicles", label: "Vehicles" },
    { id: "energy", label: "Energy" }, { id: "analytics", label: "Analytics" }, { id: "settings", label: "Settings" },
  ];

  return (
    <main className="control-grid min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 lg:px-7">
          <div className="flex items-center gap-8">
            <button type="button" onClick={() => setView("dashboard")} className="flex items-center gap-2" aria-label="Open dashboard">
              <span className="grid h-8 w-8 place-items-center border border-primary/50 bg-primary text-primary-foreground"><Bolt size={17} fill="currentColor" /></span>
              <span className="font-mono text-base font-medium uppercase">Grid<span className="text-primary">Pulse</span></span>
            </button>
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
              {nav.map((item) => <Button key={item.id} variant={view === item.id ? "secondary" : "ghost"} size="sm" onClick={() => setView(item.id)} className={view === item.id ? "text-primary" : "text-muted-foreground"}>{item.label}</Button>)}
            </nav>
          </div>
          <div className="flex items-center gap-3 border border-primary/20 bg-energy-soft/20 px-3 py-2">
            <span className="relative flex h-2 w-2"><span className="pulse-ring absolute inset-0 rounded-full bg-primary" /><span className="relative h-2 w-2 rounded-full bg-primary" /></span>
            <span className="font-mono text-[10px] uppercase text-primary">System operational</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-7">
        <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="font-mono text-[10px] uppercase text-primary">Localized cluster // GP-01</p><h1 className="mt-1 text-2xl font-semibold">{view === "dashboard" ? "Live Energy Operations" : view.charAt(0).toUpperCase() + view.slice(1)}</h1></div>
          <div className="flex overflow-x-auto border border-border bg-card p-1 lg:hidden">{nav.map((item) => <Button key={item.id} variant={view === item.id ? "secondary" : "ghost"} size="sm" onClick={() => setView(item.id)}>{item.label}</Button>)}</div>
          <div className="hidden items-center gap-2 md:flex"><span className="font-mono text-[10px] text-muted-foreground">LIVE TELEMETRY</span><span className="h-px w-12 bg-primary/50" /><span className="font-mono text-[10px] text-primary">SYNCED</span></div>
        </div>

        {view !== "dashboard" && (
          <section className="mb-4 border border-border bg-card">
            <PanelTitle eyebrow="Focused view" title={view === "vehicles" ? "Vehicle Fleet" : view === "energy" ? "Energy Network" : view === "analytics" ? "Performance Analytics" : "Simulation Settings"} icon={view === "vehicles" ? CarFront : view === "energy" ? Zap : view === "analytics" ? BarChart3 : Settings2} />
            <div className="p-5 text-sm text-muted-foreground">This focused view uses the same live simulation. Controls and telemetry remain synchronized with the main operations board.</div>
          </section>
        )}

        <section className="grid grid-cols-2 border-l border-t border-border md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Active EVs" value={vehicles.length} icon={CarFront} />
          <Metric label="Total demand" value={totalDemand.toFixed(1)} unit="kW" icon={Activity} />
          <Metric label="Grid capacity" value={gridCapacity} unit="kW" icon={Gauge} />
          <Metric label="Grid headroom" value={headroom.toFixed(1)} unit="kW" icon={CircleGauge} accent />
          <Metric label="Solar generation" value={solarGeneration} unit="kW" icon={Sun} />
          <Metric label="EV charging" value={evLoad.toFixed(1)} unit="kW" icon={BatteryCharging} accent />
        </section>

        {isConstrained && (
          <div className="mt-4 flex flex-col justify-between gap-3 border border-warning/40 bg-warning/10 px-4 py-3 md:flex-row md:items-center" role="alert">
            <div className="flex items-center gap-3"><AlertTriangle className="text-warning" size={20} /><div><p className="text-sm font-semibold text-warning">Grid constraint detected</p><p className="text-xs text-muted-foreground">EV charging automatically optimized · transformer limit protected</p></div></div>
            <span className="font-mono text-[10px] uppercase text-warning">{utilization}% utilized</span>
          </div>
        )}

        <section className="mt-4 border border-border bg-card">
          <PanelTitle eyebrow="Real-time topology" title="Live Energy Flow" icon={Zap} action={<span className="font-mono text-[10px] text-primary">● LIVE</span>} />
          <div className="relative flex flex-col items-center justify-between gap-0 overflow-hidden px-5 py-7 lg:flex-row">
            <FlowNode icon={Sun} label="Solar" value={`${solarGeneration} kW`} tone="solar" /><FlowConnector />
            <FlowNode icon={Building2} label="Building" value={`${buildingDemand} kW`} tone="neutral" /><FlowConnector />
            <FlowNode icon={Bolt} label="Controller" value={`${totalDemand.toFixed(1)} kW`} /><FlowConnector />
            <FlowNode icon={CarFront} label="EV Cluster" value={`${evLoad.toFixed(1)} kW`} />
          </div>
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <section className="min-w-0 border border-border bg-card">
            <PanelTitle eyebrow="Rolling 40-minute window" title="Power Demand" icon={Activity} action={<span className="font-mono text-[10px] text-muted-foreground">kW</span>} />
            <div className="h-[320px] px-2 py-5 sm:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs><linearGradient id="evFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--energy)" stopOpacity={0.24}/><stop offset="100%" stopColor="var(--energy)" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid stroke="var(--grid-line)" vertical={false} />
                  <XAxis dataKey="time" stroke="var(--muted-foreground)" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area type="monotone" dataKey="ev" name="EV load" stroke="var(--energy)" fill="url(#evFill)" strokeWidth={2} />
                  <Line type="monotone" dataKey="building" name="Building" stroke="var(--foreground)" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="solar" name="Solar" stroke="var(--solar)" dot={false} strokeWidth={1.5} />
                  <Line type="step" dataKey="limit" name="Grid limit" stroke="var(--warning)" strokeDasharray="5 5" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="border border-border bg-card">
            <PanelTitle eyebrow="Priority queue" title="Active Vehicles" icon={CarFront} action={<span className="font-mono text-[10px] text-primary">{vehicles.length} CONNECTED</span>} />
            <div className="max-h-[320px] divide-y divide-border overflow-y-auto">
              {allocations.map((vehicle) => (
                <div key={vehicle.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 transition-colors hover:bg-accent/30">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><strong className="font-mono text-xs">{vehicle.id}</strong><span className={`h-1.5 w-1.5 rounded-full ${vehicle.power > 0 ? "bg-primary" : "bg-warning"}`} /><span className="truncate text-[10px] text-muted-foreground">Departs {vehicle.departure}</span></div>
                    <div className="mt-2 flex items-center gap-3"><span className="w-8 font-mono text-[10px] text-foreground">{vehicle.battery}%</span><div className="h-1.5 flex-1 overflow-hidden bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${vehicle.battery}%` }} /></div><span className="font-mono text-[9px] text-muted-foreground">→{vehicle.target}%</span></div>
                  </div>
                  <div className="text-right"><strong className="font-mono text-sm text-primary">{vehicle.power.toFixed(1)} kW</strong><p className="mt-1 font-mono text-[9px] text-muted-foreground">P{vehicle.priority}</p></div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <section className="border border-border bg-card">
            <PanelTitle eyebrow="Transparent decision engine" title="Smart Allocation" icon={ShieldCheck} />
            <div className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              {allocations.slice(0, 3).map((vehicle, index) => (
                <div key={vehicle.id} className="p-5"><div className="flex items-center justify-between"><span className="font-mono text-xs text-foreground">{vehicle.id}</span><span className={index === 0 ? "font-mono text-[10px] text-primary" : "font-mono text-[10px] text-muted-foreground"}>PRIORITY {vehicle.priority}</span></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{vehicle.reason}</p><div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground"><Clock3 size={12}/><span>{vehicle.departure}</span><ChevronRight size={12}/><span className="text-foreground">{vehicle.power.toFixed(1)} kW</span></div></div>
              ))}
            </div>
          </section>

          <section className="border border-border bg-card">
            <PanelTitle eyebrow="Adaptive inputs" title="Simulation Controls" icon={Settings2} />
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-3 gap-2">
                {(["normal", "peak", "solar"] as Scenario[]).map((item) => <Button key={item} variant={scenario === item ? "default" : "outline"} size="sm" onClick={() => applyScenario(item)} className="px-2 text-[10px] uppercase">{item === "solar" ? "Solar surplus" : item}</Button>)}
              </div>
              <Control label="Grid capacity" value={gridCapacity} min={30} max={90} unit="kW" onChange={(value) => { setGridCapacity(value); setScenario("normal"); }} />
              <Control label="Building demand" value={buildingDemand} min={5} max={60} unit="kW" onChange={(value) => { setBuildingDemand(value); setScenario("normal"); }} />
              <Control label="Solar generation" value={solarGeneration} min={0} max={50} unit="kW" onChange={(value) => { setSolarGeneration(value); setScenario("normal"); }} />
              <div className="flex gap-2 pt-1">
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild><Button className="flex-1"><Plus size={14}/> Add EV</Button></DialogTrigger>
                  <DialogContent className="border-border bg-popover">
                    <DialogHeader><DialogTitle>Add vehicle</DialogTitle><DialogDescription>Connect a simulated EV to the GridPulse charging cluster.</DialogDescription></DialogHeader>
                    <div className="grid gap-4 py-2 sm:grid-cols-2">
                      <label className="space-y-2 text-xs text-muted-foreground">Vehicle ID<Input value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} /></label>
                      <label className="space-y-2 text-xs text-muted-foreground">Departure<Input type="time" value={form.departure} onChange={(event) => setForm({ ...form, departure: event.target.value })} /></label>
                      <label className="space-y-2 text-xs text-muted-foreground">Battery %<Input type="number" min={1} max={99} value={form.battery} onChange={(event) => setForm({ ...form, battery: Number(event.target.value) })} /></label>
                      <label className="space-y-2 text-xs text-muted-foreground">Required %<Input type="number" min={1} max={100} value={form.target} onChange={(event) => setForm({ ...form, target: Number(event.target.value) })} /></label>
                      <label className="space-y-2 text-xs text-muted-foreground sm:col-span-2">Maximum power (kW)<Input type="number" min={1} max={22} value={form.maxPower} onChange={(event) => setForm({ ...form, maxPower: Number(event.target.value) })} /></label>
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={addVehicle}>Connect EV</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" size="icon" onClick={() => setVehicles((current) => current.slice(0, -1))} disabled={!vehicles.length} title="Remove last EV"><Minus size={14}/><span className="sr-only">Remove last EV</span></Button>
                <Button variant="outline" size="icon" onClick={() => { setVehicles(initialVehicles); applyScenario("normal"); }} title="Reset simulation"><RotateCcw size={14}/><span className="sr-only">Reset simulation</span></Button>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-4 grid border border-border bg-card md:grid-cols-4">
          <div className="flex items-center gap-3 border-b border-border p-4 md:border-b-0 md:border-r"><CloudSun className="text-solar" size={20}/><div><p className="text-[10px] uppercase text-muted-foreground">Renewable supply</p><strong className="font-mono text-sm">{solarGeneration} kW</strong></div></div>
          <div className="border-b border-border p-4 md:border-b-0 md:border-r"><p className="text-[10px] uppercase text-muted-foreground">Renewable share</p><strong className="mt-1 block font-mono text-sm text-solar">{renewableShare}%</strong></div>
          <div className="border-b border-border p-4 md:border-b-0 md:border-r"><p className="text-[10px] uppercase text-muted-foreground">Solar surplus</p><strong className="mt-1 block font-mono text-sm">{Math.max(0, solarGeneration - buildingDemand).toFixed(1)} kW</strong></div>
          <div className="p-4"><p className="text-[10px] uppercase text-muted-foreground">Clean charging enabled</p><strong className="mt-1 flex items-center gap-2 font-mono text-sm text-primary"><Leaf size={14}/>{Math.min(evLoad, solarGeneration).toFixed(1)} kW</strong></div>
        </section>

        <footer className="mt-5 flex flex-col justify-between gap-2 border-t border-border pt-4 font-mono text-[9px] uppercase text-muted-foreground sm:flex-row"><span>GridPulse simulation environment</span><span>No physical grid connection · telemetry generated locally</span></footer>
      </div>
    </main>
  );
}