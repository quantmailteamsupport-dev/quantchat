"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface DataPoint {
  time: string;
  peers: number;
  validators: number;
  rpc: number;
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
  return Math.max(0, Math.round(base + (Math.random() - 0.5) * spread * 2));
}

function generatePoint(): DataPoint {
  return {
    time: now(),
    peers: jitter(248, 18),
    validators: jitter(64, 6),
    rpc: jitter(32, 4),
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
      peers: jitter(248, 18),
      validators: jitter(64, 6),
      rpc: jitter(32, 4),
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
          <span className="text-white font-black">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function NodeActivityChart() {
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
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
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
            width={36}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "11px", fontFamily: "monospace", paddingTop: "12px" }}
            formatter={(value) => (
              <span className="uppercase tracking-wider text-gray-300">{value}</span>
            )}
          />
          <ReferenceLine y={256} stroke="rgba(0,243,255,0.2)" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="peers"
            name="Peer Nodes"
            stroke="#00f3ff"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#00f3ff", filter: "url(#glow-blue)" }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="validators"
            name="Validators"
            stroke="#8a2be2"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#8a2be2" }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="rpc"
            name="RPC Nodes"
            stroke="#00ff9f"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#00ff9f" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
