import { Building2, CarFront, Sun, Zap } from "lucide-react";

import { FlowConnector, FlowNode, PanelTitle } from "./primitives";
import type { GridInputs } from "@/lib/grid/types";

export function EnergyFlowSection({
  inputs,
  totalDemand,
  evLoad,
}: {
  inputs: GridInputs;
  totalDemand: number;
  evLoad: number;
}) {
  return (
    <section className="panel">
      <PanelTitle
        eyebrow="Real-time topology"
        title="Live Energy Flow"
        icon={Zap}
        action={
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="pulse-ring absolute inset-0 rounded-full bg-primary" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Live
          </span>
        }
      />
      <div className="relative flex flex-col items-center justify-between gap-0 overflow-hidden rounded-b-[inherit] px-5 py-7 lg:flex-row">
        <FlowNode icon={Sun} label="Solar" value={`${inputs.solarGeneration} kW`} tone="solar" />
        <FlowConnector />
        <FlowNode
          icon={Building2}
          label="Building"
          value={`${inputs.buildingDemand} kW`}
          tone="neutral"
        />
        <FlowConnector />
        <FlowNode icon={Zap} label="Controller" value={`${totalDemand.toFixed(1)} kW`} />
        <FlowConnector />
        <FlowNode icon={CarFront} label="EV Cluster" value={`${evLoad.toFixed(1)} kW`} />
      </div>
    </section>
  );
}
