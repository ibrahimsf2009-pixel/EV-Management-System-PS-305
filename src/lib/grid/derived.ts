import type { GridInputs } from "./types";

/**
 * Cluster-level derived metrics.
 *
 * Import semantics: the transformer carries `building + ev - solar` (grid
 * import after on-site generation). Solar can push import below zero, which
 * means export — clamped where a "demand" reading would be meaningless.
 */
export function computeDerived(inputs: GridInputs, evLoad: number) {
  const gridImport = inputs.buildingDemand + evLoad - inputs.solarGeneration;
  const totalDemand = Math.max(0, gridImport);
  const headroom = Math.max(0, inputs.gridCapacity - gridImport);
  const utilization = inputs.gridCapacity
    ? Math.round((Math.max(0, gridImport) / inputs.gridCapacity) * 100)
    : 0;
  const renewableShare = Math.min(
    100,
    Math.round((inputs.solarGeneration / Math.max(1, inputs.buildingDemand + evLoad)) * 100),
  );
  const solarSurplus = Math.max(0, inputs.solarGeneration - inputs.buildingDemand);
  const cleanCharging = Math.min(evLoad, inputs.solarGeneration);

  return {
    gridImport,
    totalDemand,
    headroom,
    utilization,
    renewableShare,
    solarSurplus,
    cleanCharging,
  };
}
