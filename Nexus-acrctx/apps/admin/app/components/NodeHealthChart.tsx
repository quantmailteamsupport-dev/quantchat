"use client";

import { useEffect, useState } from "react";
import {
  RadialBarChart,
  RadialBar,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface HealthMetric {
  name: string;
  value: number;
  fill: string;
}

function jitter(base: number, spread: number): number {
  return Math.min(100, Math.max(0, parseFloat((base + (Math.random() - 0.5) * spread * 2).toFixed(1))));
}

function generateMetrics(): HealthMetric[] {
  return [
    { name: "Uptime", value: jitter(99.8, 0.3), fill: "#00ff9f" },
    { name: "CPU", value: jitter(72, 15), fill: "#00f3ff" },
    { name: "Memory", value: jitter(58, 12), fill: "#8a2be2" },
    { name: "Network", value: jitter(95, 5), fill: "#ffb800" },
  ];
}

interface TooltipPayload {
  payload?: HealthMetric;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const metric = payload[0]?.payload;
  if (!metric) return null;
  return (
    <div className="glass-panel border border-white/10 rounded-xl px-3 py-2 text-xs font-mono">
      <span style={{ color: metric.fill }} className="font-bold uppercase tracking-wider">
        {metric.name}
      </span>
      <span className="text-white font-black ml-2">{metric.value}%</span>
    </div>
  );
}

export default function NodeHealthChart() {
  const [metrics, setMetrics] = useState<HealthMetric[]>(generateMetrics());

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics(generateMetrics());
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="chart-container">
      {/* Metric badges */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {metrics.map((m) => (
          <div
            key={m.name}
            className="glass-panel rounded-xl px-3 py-2 flex items-center justify-between border border-white/5"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {m.name}
            </span>
            <span style={{ color: m.fill }} className="text-sm font-black font-mono">
              {m.value}%
            </span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <RadialBarChart
          innerRadius="30%"
          outerRadius="90%"
          data={metrics}
          startAngle={180}
          endAngle={-180}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={6}
            background={{ fill: "rgba(255,255,255,0.04)" }}
            label={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconSize={10}
            wrapperStyle={{ fontSize: "11px", fontFamily: "monospace" }}
            formatter={(value) => (
              <span className="uppercase tracking-wider text-gray-300">{value}</span>
            )}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}
