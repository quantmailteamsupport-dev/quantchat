"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DataPoint {
  time: string;
  sent: number;
  received: number;
  failed: number;
}

function nowMinute(): string {
  const d = new Date();
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function jitter(base: number, spread: number): number {
  return Math.max(0, Math.round(base + (Math.random() - 0.5) * spread * 2));
}

function generatePoint(): DataPoint {
  const sent = jitter(1840, 220);
  return {
    time: nowMinute(),
    sent,
    received: jitter(sent * 0.97, 60),
    failed: jitter(18, 12),
  };
}

function generateHistory(count: number): DataPoint[] {
  const points: DataPoint[] = [];
  const baseTime = Date.now() - count * 30000;
  for (let i = 0; i < count; i++) {
    const d = new Date(baseTime + i * 30000);
    const label = d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const sent = jitter(1840, 220);
    points.push({
      time: label,
      sent,
      received: jitter(sent * 0.97, 60),
      failed: jitter(18, 12),
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
          <span className="text-white font-black">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function MessageFlowChart() {
  const [data, setData] = useState<DataPoint[]>(() => generateHistory(15));

  const addPoint = useCallback(() => {
    setData((prev) => [...prev.slice(-14), generatePoint()]);
  }, []);

  useEffect(() => {
    const id = setInterval(addPoint, 5000);
    return () => clearInterval(id);
  }, [addPoint]);

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            interval={2}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "11px", fontFamily: "monospace", paddingTop: "12px" }}
            formatter={(value) => (
              <span className="uppercase tracking-wider text-gray-300">{value}</span>
            )}
          />
          <Bar dataKey="sent" name="Sent" radius={[3, 3, 0, 0]} maxBarSize={18}>
            {data.map((_, index) => (
              <Cell key={index} fill="#8a2be2" fillOpacity={0.85} />
            ))}
          </Bar>
          <Bar dataKey="received" name="Received" radius={[3, 3, 0, 0]} maxBarSize={18}>
            {data.map((_, index) => (
              <Cell key={index} fill="#00f3ff" fillOpacity={0.85} />
            ))}
          </Bar>
          <Bar dataKey="failed" name="Failed" radius={[3, 3, 0, 0]} maxBarSize={18}>
            {data.map((_, index) => (
              <Cell key={index} fill="#ff007f" fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
