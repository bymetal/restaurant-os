"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

export interface SparklineProps {
  data: Array<{ value: number }>;
  color?: string;
}

export function Sparkline({ data, color = "#dc2626" }: SparklineProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
