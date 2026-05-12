"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  time: string;
  inbound: number;
  outbound: number;
}

function now(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function jitter(base: number, spread: number): number {
  return Math.max(0, parseFloat((base + (Math.random() - 0.5) * spread * 2).toFixed(2)));
}

function generatePoint(): DataPoint {
  return {
    time: now(),
    inbound: jitter(42.5, 12),
    outbound: jitter(28.3, 9),
  };
}

function generateHistory(count: number): DataPoint[] {
  const points: DataPoint[] = [];
  const baseTime = Date.now() - count * 2000;
  for (let i = 0; i < count; i++) {
    const d = new Date(baseTime + i * 2000);
    points.push({
      time: d.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      inbound: jitter(42.5, 12),
      outbound: jitter(28.3, 9),
    });
  }
  return points;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass-panel border border-white/10 rounded-xl px-4 py-3 text-xs font-mono space-y-1.5 min-w-[160px]">
      <p className="text-gray-400 mb-2 border-b border-white/10 pb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex justify-between gap-4 items-center">
          <span style={{ color: entry.color }} className="uppercase tracking-wider font-bold">
            {entry.name}
          </span>
          <span className="text-white font-black">{entry.value} MB/s</span>
        </div>
      ))}
    </div>
  );
}

export default function NetworkThroughputChart() {
  const [data, setData] = useState<DataPoint[]>(() => generateHistory(60));

  const addPoint = useCallback(() => {
    setData((prev) => [...prev.slice(-59), generatePoint()]);
  }, []);

  useEffect(() => {
    const id = setInterval(addPoint, 2000);
    return () => clearInterval(id);
  }, [addPoint]);

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="gradInbound" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00f3ff" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#00f3ff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradOutbound" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff007f" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ff007f" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(v: number) => `${v}M`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "11px", fontFamily: "monospace", paddingTop: "12px" }}
            formatter={(value) => (
              <span className="uppercase tracking-wider text-gray-300">{value}</span>
            )}
          />
          <Area
            type="monotone"
            dataKey="inbound"
            name="Inbound"
            stroke="#00f3ff"
            strokeWidth={2}
            fill="url(#gradInbound)"
            dot={false}
            activeDot={{ r: 4, fill: "#00f3ff" }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="outbound"
            name="Outbound"
            stroke="#ff007f"
            strokeWidth={2}
            fill="url(#gradOutbound)"
            dot={false}
            activeDot={{ r: 4, fill: "#ff007f" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
