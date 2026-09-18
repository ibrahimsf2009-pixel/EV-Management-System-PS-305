import type { GridInputs } from "./types";

export function computeDerived(inputs: GridInputs, evLoad: number) {
  const netBuilding = Math.max(0, inputs.buildingDemand - inputs.solarGeneration);
  const totalDemand = netBuilding + evLoad;
  const headroom = Math.max(0, inputs.gridCapacity - totalDemand);
  const utilization = inputs.gridCapacity
    ? Math.round((totalDemand / inputs.gridCapacity) * 100)
    : 0;
  const renewableShare = Math.min(
    100,
    Math.round((inputs.solarGeneration / Math.max(1, inputs.buildingDemand + evLoad)) * 100),
  );
  const solarSurplus = Math.max(0, inputs.solarGeneration - inputs.buildingDemand);
  const cleanCharging = Math.min(evLoad, inputs.solarGeneration);

  return {
    netBuilding,
    totalDemand,
    headroom,
    utilization,
    renewableShare,
    solarSurplus,
    cleanCharging,
  };
}
