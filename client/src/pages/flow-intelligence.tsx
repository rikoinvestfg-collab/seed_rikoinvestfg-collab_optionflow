import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  ArrowLeft, Brain, TrendingUp, TrendingDown, MinusCircle,
  Shield, Target, AlertTriangle, Flame, Snowflake,
  Activity, BarChart3, Waves, Clock, RefreshCw,
} from "lucide-react";
import { useState, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
interface FlowIntelSignal {
  symbol:         string;
  marketMode:     string;
  bias:           string;
  setup:          string;
  entry:          string;
  confirmations:  string[];
  stopLoss:       string;
  takeProfit:     string;
  confidence:     string;
  reasoning:      string;
  keyLevels: {
    gammaFlip: string;
    callWall:  string;
    putWall:   string;
    maxPain:   string;
  };
  flowSummary:    string;
  liquiditySummary: string;
  session:        string;
  timestamp:      string;
}

interface IntelReport {
  symbol:    string;
  signal:    FlowIntelSignal;
  timestamp: string;
}

interface FlowIntelResponse {
  reports:      IntelReport[];
  lastAnalysis: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getSetupColor(setup: string) {
  if (setup === "Long")  return { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", glow: "shadow-emerald-500/20" };
  if (setup === "Short") return { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", glow: "shadow-red-500/20" };
  return { bg: "bg-zinc-500/10", border: "border-zinc-500/30", text: "text-zinc-400", glow: "shadow-zinc-500/20" };
}

function getBiasIcon(bias: string) {
  if (bias.toLowerCase().includes("alcista")) return <TrendingUp className="w-4 h-4 text-emerald-400" />;
  if (bias.toLowerCase().includes("bajista")) return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <MinusCircle className="w-4 h-4 text-zinc-400" />;
}

function getConfidenceIcon(conf: string) {
  if (conf === "Alta") return <Flame className="w-4 h-4 text-orange-400" />;
  if (conf === "Media") return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  return <Snowflake className="w-4 h-4 text-blue-400" />;
}

function getConfidenceBadge(conf: string) {
  if (conf === "Alta") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (conf === "Media") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}

function getSessionBadge(session: string) {
  if (session === "MERCADO")     return { label: "MERCADO ABIERTO", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
  if (session === "PRE-MARKET")  return { label: "PRE-MARKET", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
  if (session === "POST-MARKET") return { label: "POST-MARKET", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
  return { label: "CERRADO", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" };
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Justo ahora";
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `Hace ${hrs}h ${mins % 60}m`;
}

// ── Signal Card Component ────────────────────────────────────────────────────
function SignalCard({ report }: { report: IntelReport }) {
  const sig = report.signal;
  const colors = getSetupColor(sig.setup);
  const sessionInfo = getSessionBadge(sig.session);

  return (
    <div
      data-testid={`flow-intel-card-${sig.symbol}`}
      className={`rounded-lg border ${colors.border} ${colors.bg} shadow-lg ${colors.glow} overflow-hidden`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${colors.bg} border ${colors.border}`}>
            <Brain className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-white">{sig.symbol}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${colors.border} ${colors.text} ${colors.bg}`}>
                {sig.setup === "Long" ? "LONG" : sig.setup === "Short" ? "SHORT" : "NO TRADE"}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] border ${getConfidenceBadge(sig.confidence)}`}>
                {getConfidenceIcon(sig.confidence)}
                <span className="ml-1">{sig.confidence}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-1.5 py-0.5 rounded text-[9px] border ${sessionInfo.color}`}>{sessionInfo.label}</span>
              <span className="text-[10px] text-zinc-500">{timeAgo(report.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="px-4 py-3 border-b border-white/5">
        <p className="text-xs text-zinc-300 leading-relaxed">{sig.reasoning}</p>
      </div>

      {/* Grid: Market Mode + Bias + Key Levels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-b border-white/5">
        {/* Market Mode */}
        <div className="px-4 py-3 border-b md:border-b-0 md:border-r border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity className="w-3 h-3 text-purple-400" />
            <span className="text-[10px] uppercase tracking-wide text-purple-400 font-medium">Market Mode</span>
          </div>
          <p className="text-xs text-zinc-300 font-mono">{sig.marketMode}</p>
        </div>

        {/* Bias */}
        <div className="px-4 py-3 border-b md:border-b-0 md:border-r border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            {getBiasIcon(sig.bias)}
            <span className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium">Bias</span>
          </div>
          <p className="text-xs text-zinc-300 font-mono">{sig.bias}</p>
        </div>

        {/* Key Levels */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Target className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] uppercase tracking-wide text-cyan-400 font-medium">Niveles Clave</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div className="flex justify-between">
              <span className="text-[10px] text-zinc-500">Gamma Flip</span>
              <span className="text-[10px] text-zinc-300 font-mono">{sig.keyLevels.gammaFlip}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-zinc-500">Call Wall</span>
              <span className="text-[10px] text-emerald-400 font-mono">{sig.keyLevels.callWall}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-zinc-500">Max Pain</span>
              <span className="text-[10px] text-zinc-300 font-mono">{sig.keyLevels.maxPain}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-zinc-500">Put Wall</span>
              <span className="text-[10px] text-red-400 font-mono">{sig.keyLevels.putWall}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Setup Details (only if actionable) */}
      {sig.setup !== "No Trade" && (
        <div className="grid grid-cols-3 gap-0 border-b border-white/5">
          <div className="px-4 py-2.5 border-r border-white/5">
            <span className="text-[9px] uppercase text-zinc-500 block mb-0.5">Entrada</span>
            <span className="text-xs text-white font-mono font-medium">{sig.entry}</span>
          </div>
          <div className="px-4 py-2.5 border-r border-white/5">
            <span className="text-[9px] uppercase text-red-400 block mb-0.5">Stop Loss</span>
            <span className="text-xs text-red-300 font-mono font-medium">{sig.stopLoss}</span>
          </div>
          <div className="px-4 py-2.5">
            <span className="text-[9px] uppercase text-emerald-400 block mb-0.5">Take Profit</span>
            <span className="text-xs text-emerald-300 font-mono font-medium">{sig.takeProfit}</span>
          </div>
        </div>
      )}

      {/* Confirmations */}
      {sig.confirmations.length > 0 && (
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wide text-emerald-400 font-medium">Confirmaciones</span>
          </div>
          <div className="space-y-1">
            {sig.confirmations.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-emerald-400 text-xs mt-px">{'>'}</span>
                <span className="text-xs text-zinc-300">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flow + Liquidity summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        <div className="px-4 py-3 border-r border-white/5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <BarChart3 className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] uppercase tracking-wide text-amber-400 font-medium">Flujo Institucional</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">{sig.flowSummary}</p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Waves className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] uppercase tracking-wide text-blue-400 font-medium">Liquidez</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">{sig.liquiditySummary}</p>
        </div>
      </div>
    </div>
  );
}

// ── Waiting / Empty State ────────────────────────────────────────────────────
function WaitingState() {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full border-2 border-purple-500/30 flex items-center justify-center animate-pulse">
          <Brain className="w-8 h-8 text-purple-400" />
        </div>
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500 animate-ping" />
      </div>
      <p className="text-sm text-zinc-400 font-mono">Analizando estructura de mercado{dots}</p>
      <p className="text-[10px] text-zinc-600 mt-2">
        El motor analiza los 22 tickers cada 60s durante horas de mercado
      </p>
      <p className="text-[10px] text-zinc-600">
        Gamma, flujo institucional, dark pools, liquidez y timing
      </p>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function FlowIntelligencePage() {
  const { data, isLoading } = useQuery<FlowIntelResponse>({
    queryKey: ["/api/flow-intelligence"],
    refetchInterval: 15000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const reports = data?.reports ?? [];
  const lastAnalysis = data?.lastAnalysis;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" data-testid="flow-intelligence-page">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0a0a0f]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors" data-testid="btn-back-dashboard">
                <ArrowLeft className="w-3.5 h-3.5" />
                Dashboard
              </button>
            </Link>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="font-mono text-sm font-bold text-white tracking-wide">Flow Intelligence</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastAnalysis && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] text-zinc-500 font-mono">{timeAgo(lastAnalysis)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/20">
              <RefreshCw className={`w-3 h-3 text-purple-400 ${isLoading ? "animate-spin" : ""}`} />
              <span className="text-[10px] text-purple-400">Auto 15s</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Philosophy Banner */}
        <div className="mb-6 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <div className="flex items-start gap-2">
            <Brain className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[11px] text-purple-300 font-medium mb-1">Trader Institucional AI — 22 Tickers 0DTE</p>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Interpreta la estructura del mercado: GEX, posicionamiento de dealers, flujo institucional, liquidez y timing intradía.
                Piensa como market maker: ¿Qué están obligados a hacer los dealers? ¿Dónde está la liquidez? ¿Quién está atrapado?
                Mínimo 2 confirmaciones fuertes para cada setup.
              </p>
            </div>
          </div>
        </div>

        {/* Signal Cards */}
        {reports.length === 0 ? (
          <WaitingState />
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <SignalCard key={`${report.symbol}-${report.timestamp}`} report={report} />
            ))}
          </div>
        )}

        {/* Footer disclaimer */}
        <div className="mt-8 pb-6 text-center">
          <p className="text-[9px] text-zinc-600">
            No es asesoría financiera. Las señales se basan en análisis de estructura de mercado y flujo institucional en tiempo real.
          </p>
        </div>
      </main>
    </div>
  );
}
