import { CloudSun, Leaf } from "lucide-react";

export function EnvironmentFooter({
  solarGeneration,
  buildingDemand,
  renewableShare,
  solarSurplus,
  cleanCharging,
}: {
  solarGeneration: number;
  buildingDemand: number;
  renewableShare: number;
  solarSurplus: number;
  cleanCharging: number;
}) {
  return (
    <>
      <section className="panel mt-5 grid overflow-hidden md:grid-cols-4">
        <div className="flex items-center gap-3 border-b border-border p-4 md:border-b-0 md:border-r">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-solar/25 bg-solar/10 text-solar">
            <CloudSun size={15} />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Renewable supply
            </p>
            <strong className="tnum font-mono text-sm">{solarGeneration} kW</strong>
          </div>
        </div>
        <div className="border-b border-border p-4 md:border-b-0 md:border-r">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Renewable share
          </p>
          <strong className="tnum mt-1 block font-mono text-sm text-solar">
            {renewableShare}%
          </strong>
        </div>
        <div className="border-b border-border p-4 md:border-b-0 md:border-r">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Solar surplus
          </p>
          <strong className="tnum mt-1 block font-mono text-sm">
            {solarSurplus.toFixed(1)} kW
          </strong>
        </div>
        <div className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Clean charging enabled
          </p>
          <strong className="tnum mt-1 flex items-center gap-2 font-mono text-sm text-primary">
            <Leaf size={14} />
            {cleanCharging.toFixed(1)} kW
          </strong>
        </div>
      </section>

      <footer className="mt-6 flex flex-col justify-between gap-2 border-t border-border pt-4 font-mono text-[9px] uppercase tracking-wider text-muted-foreground sm:flex-row">
        <span>GridPulse simulation environment</span>
        <span>No physical grid connection · telemetry generated locally</span>
      </footer>
    </>
  );
}
