import type { Activity, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

type Icon = typeof Activity;

export function Metric({
  label,
  value,
  unit,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: Icon;
  accent?: boolean;
}) {
  return (
    <div className="panel panel-interactive group relative overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={`grid h-7 w-7 place-items-center rounded-md border transition-colors ${
            accent
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-border bg-secondary/60 text-muted-foreground group-hover:text-foreground"
          }`}
        >
          <Icon size={14} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5 font-mono">
        <span
          className={`tnum text-2xl font-medium transition-colors ${
            accent ? "text-primary" : "text-foreground"
          }`}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

export function PanelTitle({
  eyebrow,
  title,
  icon: Icon,
  action,
}: {
  eyebrow: string;
  title: string;
  icon: Icon;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary">
          <Icon size={15} />
        </span>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-primary/80">{eyebrow}</p>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

export function FlowNode({
  icon: Icon,
  label,
  value,
  tone = "energy",
}: {
  icon: typeof Sun;
  label: string;
  value: string;
  tone?: "energy" | "solar" | "neutral";
}) {
  const toneClass =
    tone === "solar"
      ? "border-solar/30 bg-solar/10 text-solar"
      : tone === "neutral"
        ? "border-border bg-secondary/80 text-foreground"
        : "border-primary/25 bg-primary/10 text-primary";
  return (
    <div
      className={`relative z-10 flex min-w-28 flex-col items-center rounded-lg border p-3.5 shadow-[0_8px_20px_-14px_oklch(0_0_0/0.6)] transition-colors duration-300 ${toneClass}`}
    >
      <Icon size={20} />
      <span className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <strong className="tnum mt-1 font-mono text-sm">{value}</strong>
    </div>
  );
}

/**
 * Connector between flow nodes: a faint dashed line with drifting texture and
 * a small travelling pulse. Vertical on small screens, horizontal from lg up.
 */
export function FlowConnector() {
  return (
    <div className="relative h-9 w-px shrink-0 bg-border/60 lg:h-px lg:w-auto lg:min-w-10 lg:flex-1">
      <span className="flow-line absolute inset-0" aria-hidden="true" />
      <span
        className="flow-dot left-1/2 -translate-x-1/2 lg:left-0 lg:top-1/2 lg:-translate-y-1/2"
        aria-hidden="true"
      />
      <span
        className="flow-dot left-1/2 -translate-x-1/2 lg:left-0 lg:top-1/2 lg:-translate-y-1/2"
        style={{ animationDelay: "1.9s" }}
        aria-hidden="true"
      />
    </div>
  );
}

export function Control({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="tnum rounded-md border border-border bg-secondary/60 px-2 py-0.5 font-mono text-xs text-foreground">
          {value} {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={(next) => onChange(next[0] ?? value)}
        aria-label={label}
      />
    </div>
  );
}

/** Numeric field that clamps to [min, max] and never yields NaN. */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  className?: string;
}) {
  return (
    <label className={`space-y-2 text-xs text-muted-foreground ${className ?? ""}`}>
      {label}
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={String(value)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onValueChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </label>
  );
}
