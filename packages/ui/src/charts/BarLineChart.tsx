"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export interface BarLineChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  barKey: string;
  lineKey?: string;
  barColor?: string;
  lineColor?: string;
  height?: number;
  dualAxis?: boolean;
}

export function BarLineChart({
  data,
  xKey,
  barKey,
  lineKey,
  barColor = "#fca5a5",
  lineColor = "#dc2626",
  height = 280,
  dualAxis = false
}: BarLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        {dualAxis && (
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        )}
        <Tooltip />
        <Bar yAxisId="left" dataKey={barKey} fill={barColor} radius={[4, 4, 0, 0]} />
        {lineKey && (
          <Line
            yAxisId={dualAxis ? "right" : "left"}
            type="monotone"
            dataKey={lineKey}
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
