import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NumberField } from "./primitives";
import { DERIVED_RANGES, defaultVehicleForm, isValidVehicleId } from "@/lib/grid/constants";
import type { Vehicle } from "@/lib/grid/types";

function DepartureField({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-xs text-muted-foreground">
      {label}
      <Input type="time" value={value} onChange={(event) => onValueChange(event.target.value)} />
    </label>
  );
}

export function VehicleDialog({
  vehicles,
  onAdd,
}: {
  vehicles: Vehicle[];
  onAdd: (vehicle: Vehicle) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Vehicle>(defaultVehicleForm(vehicles.length));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const cleanId = form.id.trim().toUpperCase();
    if (!cleanId) {
      setError("Vehicle ID is required.");
      return;
    }
    if (!isValidVehicleId(cleanId)) {
      setError("ID may only contain A-Z, 0-9 and dashes (max 16 chars).");
      return;
    }
    if (vehicles.some((item) => item.id === cleanId)) {
      setError(`A vehicle with ID ${cleanId} is already connected.`);
      return;
    }
    setError(null);
    onAdd({ ...form, id: cleanId });
    setForm(defaultVehicleForm(vehicles.length + 1));
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button className="flex-1">
          <Plus size={14} /> Add EV
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/70 bg-popover/95 shadow-[0_24px_64px_-24px_oklch(0_0_0/0.8)] backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Add vehicle</DialogTitle>
          <DialogDescription>
            Connect a simulated EV to the GridPulse charging cluster.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <label className="space-y-2 text-xs text-muted-foreground">
            Vehicle ID
            <Input
              value={form.id}
              onChange={(event) => setForm({ ...form, id: event.target.value })}
              aria-invalid={Boolean(error)}
            />
            {error && <span className="block text-[10px] text-destructive">{error}</span>}
          </label>
          <DepartureField
            label="Departure"
            value={form.departure}
            onValueChange={(departure) => setForm({ ...form, departure })}
          />
          <NumberField
            label="Battery %"
            value={form.battery}
            min={DERIVED_RANGES.battery.min}
            max={DERIVED_RANGES.battery.max}
            onValueChange={(battery) => setForm({ ...form, battery })}
          />
          <NumberField
            label="Required %"
            value={form.target}
            min={DERIVED_RANGES.target.min}
            max={DERIVED_RANGES.target.max}
            onValueChange={(target) => setForm({ ...form, target })}
          />
          <NumberField
            label="Maximum power (kW)"
            value={form.maxPower}
            min={DERIVED_RANGES.maxPower.min}
            max={DERIVED_RANGES.maxPower.max}
            onValueChange={(maxPower) => setForm({ ...form, maxPower })}
            className="sm:col-span-2"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Connect EV</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
