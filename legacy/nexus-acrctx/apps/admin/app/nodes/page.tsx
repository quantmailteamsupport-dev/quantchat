"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import {
  Wifi,
  WifiOff,
  AlertTriangle,
  Cpu,
  MemoryStick,
  Zap,
  RefreshCw,
  Globe,
} from "lucide-react";

interface NodeInfo {
  id: string;
  label: string;
  region: string;
  type: "peer" | "validator" | "rpc";
  status: "online" | "degraded" | "offline";
  latencyMs: number;
  cpuPct: number;
  memPct: number;
  peers: number;
  uptime: string;
  blockHeight: number;
}

interface LatencyPoint {
  time: string;
  [key: string]: number | string;
}

interface ScatterPoint {
  latency: number;
  throughput: number;
  node: string;
}

function jitter(base: number, spread: number): number {
  return Math.max(0, parseFloat((base + (Math.random() - 0.5) * spread * 2).toFixed(1)));
}

function nowTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const BASE_NODES: Omit<NodeInfo, "latencyMs" | "cpuPct" | "memPct" | "peers" | "blockHeight">[] = [
  { id: "nx-peer-01", label: "Peer Alpha", region: "US-East", type: "peer", status: "online", uptime: "99.98%" },
  { id: "nx-val-01", label: "Validator Σ", region: "EU-West", type: "validator", status: "online", uptime: "99.99%" },
  { id: "nx-rpc-01", label: "RPC Gateway", region: "AP-SE", type: "rpc", status: "degraded", uptime: "98.12%" },
  { id: "nx-peer-02", label: "Peer Beta", region: "US-West", type: "peer", status: "online", uptime: "99.95%" },
  { id: "nx-val-02", label: "Validator Ω", region: "EU-Central", type: "validator", status: "online", uptime: "100.00%" },
  { id: "nx-peer-03", label: "Peer Gamma", region: "SA-East", type: "peer", status: "offline", uptime: "94.20%" },
];

function refreshNodes(): NodeInfo[] {
  return BASE_NODES.map((n) => ({
    ...n,
    latencyMs: n.status === "offline" ? 0 : n.status === "degraded" ? jitter(320, 80) : jitter(28, 8),
    cpuPct: n.status === "offline" ? 0 : jitter(54, 22),
    memPct: n.status === "offline" ? 0 : jitter(61, 15),
    peers: n.status === "offline" ? 0 : Math.round(jitter(42, 10)),
    blockHeight: n.status === "offline" ? 0 : Math.round(jitter(4_892_445, 80)),
  }));
}

function generateLatencyHistory(
  count: number,
  nodeIds: string[]
): LatencyPoint[] {
  const base = Date.now() - count * 2000;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base + i * 2000);
    const pt: LatencyPoint = {
      time: d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
    nodeIds.forEach((id) => {
      pt[id] = BASE_NODES.find((n) => n.id === id)?.status === "offline"
        ? 0
        : BASE_NODES.find((n) => n.id === id)?.status === "degraded"
        ? jitter(320, 80)
        : jitter(28, 8);
    });
    return pt;
  });
}

const NODE_COLORS: Record<string, string> = {
  "nx-peer-01": "#00f3ff",
  "nx-val-01": "#8a2be2",
  "nx-rpc-01": "#ffb800",
  "nx-peer-02": "#00ff9f",
  "nx-val-02": "#ff007f",
  "nx-peer-03": "#6b7280",
};

const STATUS_CONFIG = {
  online: { color: "text-[var(--color-neon-green)]", bg: "bg-[var(--color-neon-green)]", icon: Wifi, label: "Online" },
  degraded: { color: "text-[var(--color-neon-amber)]", bg: "bg-[var(--color-neon-amber)]", icon: AlertTriangle, label: "Degraded" },
  offline: { color: "text-[var(--color-neon-pink)]", bg: "bg-[var(--color-neon-pink)]", icon: WifiOff, label: "Offline" },
};

const TYPE_BADGE: Record<NodeInfo["type"], string> = {
  peer: "bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)]",
  validator: "bg-[var(--color-neon-purple)]/20 text-[var(--color-neon-purple)]",
  rpc: "bg-[var(--color-neon-amber)]/20 text-[var(--color-neon-amber)]",
};

interface LatencyTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function LatencyTooltip({ active, payload, label }: LatencyTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass-panel border border-white/10 rounded-xl px-4 py-3 text-xs font-mono space-y-1 min-w-[180px]">
      <p className="text-gray-400 mb-1.5 border-b border-white/10 pb-1.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex justify-between gap-4">
          <span style={{ color: entry.color }} className="uppercase tracking-wider font-bold truncate max-w-[100px]">
            {entry.name}
          </span>
          <span className="text-white font-black">{entry.value > 0 ? `${entry.value}ms` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

const ACTIVE_NODE_IDS = ["nx-peer-01", "nx-val-01", "nx-rpc-01", "nx-peer-02", "nx-val-02"];

function createScatterData(nodes: NodeInfo[]): ScatterPoint[] {
  return nodes
    .filter((n) => n.status !== "offline")
    .map((n) => ({
      latency: n.latencyMs,
      throughput: parseFloat(jitter(42, 18).toFixed(1)),
      node: n.label,
    }));
}

export default function NodesPage() {
  const initialNodes = useMemo(() => refreshNodes(), []);
  const [nodes, setNodes] = useState<NodeInfo[]>(() => initialNodes);
  const [latencyData, setLatencyData] = useState<LatencyPoint[]>(() =>
    generateLatencyHistory(60, ACTIVE_NODE_IDS)
  );
  const [scatterData, setScatterData] = useState<ScatterPoint[]>(() =>
    createScatterData(initialNodes)
  );
  const [lastRefresh, setLastRefresh] = useState<string>(() => nowTime());

  const refreshAll = useCallback(() => {
    const updated = refreshNodes();
    setNodes(updated);
    setLastRefresh(nowTime());
    setScatterData(createScatterData(updated));
  }, []);

  useEffect(() => {
    const latencyId = setInterval(() => {
      setLatencyData((prev) => {
        const pt: LatencyPoint = { time: nowTime() };
        ACTIVE_NODE_IDS.forEach((id) => {
          pt[id] = BASE_NODES.find((n) => n.id === id)?.status === "degraded"
            ? jitter(320, 80)
            : jitter(28, 8);
        });
        return [...prev.slice(-59), pt];
      });
    }, 2000);

    const nodeId = setInterval(refreshAll, 3000);
    return () => {
      clearInterval(latencyId);
      clearInterval(nodeId);
    };
  }, [refreshAll]);

  const onlineCount = nodes.filter((n) => n.status === "online").length;
  const degradedCount = nodes.filter((n) => n.status === "degraded").length;
  const offlineCount = nodes.filter((n) => n.status === "offline").length;

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Page header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-white flex items-center gap-2">
            <Cpu size={22} className="text-[var(--color-neon-blue)]" />
            Active Node Monitor
          </h1>
          <p className="text-sm text-gray-400 mt-1 font-mono">
            Real-time telemetry across all network nodes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-500">
            Last refresh: <span className="text-gray-300">{lastRefresh}</span>
          </span>
          <button
            onClick={refreshAll}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-neon-blue)] hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-[var(--color-neon-blue)]/20 hover:border-white/20"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </header>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-white/5 text-center">
          <p className="text-3xl font-black text-[var(--color-neon-green)] neon-text-green">
            {onlineCount}
          </p>
          <p className="text-xs uppercase tracking-widest text-gray-500 mt-1 font-bold">Online</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-white/5 text-center">
          <p className="text-3xl font-black text-[var(--color-neon-amber)]">{degradedCount}</p>
          <p className="text-xs uppercase tracking-widest text-gray-500 mt-1 font-bold">Degraded</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-white/5 text-center">
          <p className="text-3xl font-black text-[var(--color-neon-pink)]">{offlineCount}</p>
          <p className="text-xs uppercase tracking-widest text-gray-500 mt-1 font-bold">Offline</p>
        </div>
      </div>

      {/* Node cards grid */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
          Node Registry
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {nodes.map((node) => {
            const sc = STATUS_CONFIG[node.status];
            const StatusIcon = sc.icon;
            return (
              <div
                key={node.id}
                className="glass-panel rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-all space-y-4"
              >
                {/* Node header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-black text-white text-base">{node.label}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${TYPE_BADGE[node.type]}`}
                      >
                        {node.type}
                      </span>
                      <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
                        <Globe size={10} />
                        {node.region}
                      </span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-bold ${sc.color}`}>
                    <div className={`w-2 h-2 rounded-full ${sc.bg} ${node.status === "online" ? "animate-pulse" : ""}`} />
                    <StatusIcon size={14} />
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-0.5">
                    <p className="text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1">
                      <Zap size={10} /> Latency
                    </p>
                    <p
                      className={`font-black font-mono text-base ${
                        node.status === "offline"
                          ? "text-gray-600"
                          : node.latencyMs > 100
                          ? "text-[var(--color-neon-amber)]"
                          : "text-[var(--color-neon-green)]"
                      }`}
                    >
                      {node.status === "offline" ? "—" : `${node.latencyMs}ms`}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-gray-500 uppercase tracking-wider font-bold">Peers</p>
                    <p className="font-black font-mono text-base text-[var(--color-neon-blue)]">
                      {node.status === "offline" ? "—" : node.peers}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1">
                      <Cpu size={10} /> CPU
                    </p>
                    <div className="w-full bg-white/5 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${node.cpuPct}%`,
                          backgroundColor:
                            node.cpuPct > 80
                              ? "var(--color-neon-pink)"
                              : node.cpuPct > 60
                              ? "var(--color-neon-amber)"
                              : "var(--color-neon-green)",
                        }}
                      />
                    </div>
                    <p className="font-mono text-gray-400">{node.status === "offline" ? "—" : `${node.cpuPct}%`}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1">
                      <MemoryStick size={10} /> Memory
                    </p>
                    <div className="w-full bg-white/5 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${node.memPct}%`,
                          backgroundColor:
                            node.memPct > 80
                              ? "var(--color-neon-pink)"
                              : node.memPct > 60
                              ? "var(--color-neon-amber)"
                              : "var(--color-neon-purple)",
                        }}
                      />
                    </div>
                    <p className="font-mono text-gray-400">{node.status === "offline" ? "—" : `${node.memPct}%`}</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs font-mono">
                  <span className="text-gray-600">
                    Block:{" "}
                    <span className="text-gray-400">
                      {node.status === "offline" ? "—" : node.blockHeight.toLocaleString()}
                    </span>
                  </span>
                  <span className={`font-bold ${sc.color}`}>{node.uptime} uptime</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Latency timeline chart */}
      <section className="glass-panel rounded-3xl p-6 border border-white/5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white mb-1 flex items-center gap-2">
          <Zap size={15} className="text-[var(--color-neon-amber)]" />
          Node Latency Timeline
        </h2>
        <p className="text-xs text-gray-500 font-mono mb-5">
          Real-time latency per active node (2-second resolution)
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={latencyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
              width={44}
              tickFormatter={(v: number) => `${v}ms`}
            />
            <Tooltip content={<LatencyTooltip />} />
            {ACTIVE_NODE_IDS.map((id) => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                name={BASE_NODES.find((n) => n.id === id)?.label ?? id}
                stroke={NODE_COLORS[id]}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: NODE_COLORS[id] }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Latency vs Throughput scatter */}
      <section className="glass-panel rounded-3xl p-6 border border-white/5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white mb-1 flex items-center gap-2">
          <Globe size={15} className="text-[var(--color-neon-blue)]" />
          Latency vs. Throughput (Scatter)
        </h2>
        <p className="text-xs text-gray-500 font-mono mb-5">
          Current snapshot — lower latency and higher throughput is optimal
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="latency"
              name="Latency"
              type="number"
              tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              label={{ value: "Latency (ms)", position: "insideBottomRight", offset: -8, fill: "#6b7280", fontSize: 10 }}
            />
            <YAxis
              dataKey="throughput"
              name="Throughput"
              type="number"
              tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `${v}M`}
              label={{ value: "MB/s", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 10 }}
            />
            <ZAxis range={[60, 200]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.1)" }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0]?.payload as ScatterPoint | undefined;
                if (!d) return null;
                return (
                  <div className="glass-panel border border-white/10 rounded-xl px-3 py-2 text-xs font-mono">
                    <p className="text-white font-bold mb-1">{d.node}</p>
                    <p className="text-[var(--color-neon-amber)]">Latency: {d.latency}ms</p>
                    <p className="text-[var(--color-neon-blue)]">Throughput: {d.throughput} MB/s</p>
                  </div>
                );
              }}
            />
            <Scatter data={scatterData} fill="#00f3ff" fillOpacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
