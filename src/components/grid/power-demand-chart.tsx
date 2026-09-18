import { Activity } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PanelTitle } from "./primitives";
import type { ChartPoint } from "@/lib/grid/types";

export function PowerDemandChart({ data }: { data: ChartPoint[] }) {
  return (
    <section className="panel-strong min-w-0">
      <PanelTitle
        eyebrow="Rolling 40-minute window"
        title="Power Demand"
        icon={Activity}
        action={<span className="font-mono text-[10px] text-muted-foreground">kW</span>}
      />
      {/* Data-dense surface: opaque panel-strong background, no hover motion. */}
      <div className="h-[320px] px-2 py-5 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="evFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--energy)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--energy)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid-line)" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              contentStyle={{
                background: "var(--popover)",
                backdropFilter: "blur(8px)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                boxShadow: "0 12px 32px -16px oklch(0 0 0 / 0.7)",
                fontSize: 11,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
            <Area
              type="monotone"
              dataKey="ev"
              name="EV load"
              stroke="var(--energy)"
              fill="url(#evFill)"
              strokeWidth={2}
              activeDot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="building"
              name="Building"
              stroke="var(--foreground)"
              strokeOpacity={0.85}
              dot={false}
              strokeWidth={1.5}
            />
            <Line
              type="monotone"
              dataKey="solar"
              name="Solar"
              stroke="var(--solar)"
              dot={false}
              strokeWidth={1.5}
            />
            <Line
              type="step"
              dataKey="limit"
              name="Grid limit"
              stroke="var(--warning)"
              strokeDasharray="5 5"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
