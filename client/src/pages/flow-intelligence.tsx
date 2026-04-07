/**
 * Flow Intelligence — Agente 0DTE Scalping Agent
 * ─────────────────────────────────────────────────
 * Layout identical to reference image:
 *  - Left panel: ticker selector + real-time metrics (VWAP, GF, MaxPain, etc.)
 *  - Center: Chain-of-Thought animated steps + structured result block
 *  - Right sidebar: prompt / system card + legend
 *  - Bottom: option flow table
 */

import { useQuery } from "@tanstack/react-query";
import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  Brain, TrendingUp, TrendingDown, Minus,
  ChevronRight, Activity, Target, Zap,
  Clock, RefreshCw, Circle, CheckCircle2,
  ArrowLeft, Newspaper, Twitter, ExternalLink, X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface FlowIntelSignal {
  symbol:          string;
  marketMode:      string;
  bias:            string;
  setup:           "Long" | "Short" | "No Trade";
  entry:           string;
  confirmations:   string[];
  stopLoss:        string;
  takeProfit:      string;
  confidence:      string;
  reasoning:       string;
  keyLevels:       { gammaFlip: string; callWall: string; putWall: string; maxPain: string };
  flowSummary:     string;
  liquiditySummary: string;
  session:         string;
  timestamp:       string;
  contractRec?:    string;
  technicals?: {
    vwap:         number;
    vwapDistPct:  number;
    bbUpper:      number;
    bbLower:      number;
    ema9:         number;
    ema21:        number;
    dayRangePct:  number;
    overExtended: boolean;
  };
  // Quantitative output fields (new structured format)
  sesgo?:          string;  // BULLISH / BEARISH / NEUTRAL
  nivelGatillo?:   string;  // exact entry price
  justificacion?:  string;  // brief technical confluence summary
  metricaOpcion?:  string;  // "CALL 290C 0DTE | Delta 0.61 | IV 52.3% | Theta -0.38/día"
  confianza?:      number;  // 0-100
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

interface TickerData {
  symbol:        string;
  price:         number;
  change:        number;
  changePercent: number;
  volume?:       number;
  atmIv?:        string;
  gammaFlip?:    string;
  maxPain?:      string;
  callWall?:     string;
  putWall?:      string;
  gammaRegime?:  string;
  netGex?:       string;
}

interface OptionsFlowEntry {
  id:        number;
  symbol:    string;
  type:      string;
  strike:    string;
  expiry:    string;
  premium:   string;
  volume?:   string;
  sentiment: string;
  signal:    string;
  timestamp: string;
  details?:  string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TICKERS = [
  "SPY","QQQ","TSLA","NVDA","AAPL","MSFT","AMD","NFLX",
  "GOOG","AMZN","PLTR","AVGO","MU","META","ORCL",
  "SPX","DIA","IWM","SOXL","USO","SLV","GLD",
];

// Chain-of-thought steps matching the reference image
const COT_STEPS = [
  "Inicializando agente 0DTE cuantitativo...",
  "[Paso 1] Evaluando Key Levels: VWAP, Gamma Flip, Max Pain...",
  "[Paso 2] Analizando cadena de opciones — Vol vs OI, Delta, Gamma...",
  "[Paso 3] Detectando flujos de smart money y sweeps institucionales...",
  "[Paso 4] Validando confluencia técnica en velas 1m/5m...",
  "[Paso 5] Verificando Theta decay y ratio riesgo-beneficio...",
  "✓ Análisis completado",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function nyTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function parseSesgo(sig: FlowIntelSignal): { label: string; color: string; bg: string; icon: React.ReactNode } {
  // Use structured sesgo field if available, else derive from bias/setup
  const raw = sig.sesgo || (
    sig.setup === "Long" ? "BULLISH" :
    sig.setup === "Short" ? "BEARISH" : "NEUTRAL"
  );
  if (raw === "BULLISH" || raw.includes("BULL") || sig.bias?.toLowerCase().includes("alcista")) {
    return { label: "BULLISH", color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/40", icon: <TrendingUp className="w-3.5 h-3.5" /> };
  }
  if (raw === "BEARISH" || raw.includes("BEAR") || sig.bias?.toLowerCase().includes("bajista")) {
    return { label: "BEARISH", color: "text-red-400", bg: "bg-red-500/20 border-red-500/40", icon: <TrendingDown className="w-3.5 h-3.5" /> };
  }
  return { label: "NEUTRAL", color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/40", icon: <Minus className="w-3.5 h-3.5" /> };
}

function parseConfidence(sig: FlowIntelSignal): number {
  if (sig.confianza != null) return sig.confianza;
  if (sig.confidence === "Alta")  return 72 + Math.floor(Math.random() * 15);
  if (sig.confidence === "Media") return 45 + Math.floor(Math.random() * 20);
  return 20 + Math.floor(Math.random() * 20);
}

function formatVolume(raw: string | undefined): { contracts: string; notional: string; dir: string; conf: string; signal: string } {
  if (!raw) return { contracts: "—", notional: "—", dir: "—", conf: "—", signal: "—" };
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      contracts: v.contracts ? v.contracts.toLocaleString() : "—",
      notional:  v.notional || "—",
      dir:       v.direction || "—",
      conf:      v.confidence ? `${v.confidence}%` : "—",
      signal:    v.optionContract || "—",
    };
  } catch { return { contracts: "—", notional: "—", dir: raw, conf: "—", signal: "—" }; }
}

function sentimentBadge(s: string) {
  if (s === "bullish") return "text-emerald-400";
  if (s === "bearish") return "text-red-400";
  return "text-yellow-400";
}

function signalBadge(s: string) {
  if (s === "sweep") return "bg-orange-500/20 text-orange-400 border-orange-500/40";
  if (s === "block") return "bg-blue-500/20 text-blue-400 border-blue-500/40";
  if (s === "unusual") return "bg-purple-500/20 text-purple-400 border-purple-500/40";
  return "bg-zinc-700/50 text-zinc-400 border-zinc-600";
}

// ── Chain-of-Thought Animator ─────────────────────────────────────────────────
function ChainOfThought({ running, onDone }: { running: boolean; onDone?: () => void }) {
  const [step, setStep] = useState(0);
  const [dots, setDots] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    if (!running) { setStep(0); doneRef.current = false; return; }
    doneRef.current = false;
    setStep(0);
    let s = 0;
    const iv = setInterval(() => {
      s++;
      setStep(s);
      if (s >= COT_STEPS.length - 1) {
        clearInterval(iv);
        if (!doneRef.current) { doneRef.current = true; onDone?.(); }
      }
    }, 420);
    return () => clearInterval(iv);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 400);
    return () => clearInterval(iv);
  }, [running]);

  return (
    <div className="font-mono text-[11px] space-y-1 py-2">
      {COT_STEPS.map((s, i) => {
        const active  = i === step && running;
        const done    = i < step;
        const pending = i > step;
        return (
          <div key={i} className={`flex items-start gap-2 transition-opacity duration-300 ${pending ? "opacity-20" : "opacity-100"}`}>
            <span className="mt-0.5 flex-shrink-0">
              {done    ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> :
               active  ? <Circle className="w-3 h-3 text-cyan-400 animate-spin" style={{ animationDuration: "1s" }} /> :
                         <Circle className="w-3 h-3 text-zinc-600" />}
            </span>
            <span className={`leading-tight ${
              done   ? "text-zinc-500" :
              active ? "text-cyan-300" :
                       "text-zinc-600"
            }`}>
              {s}{active && i < COT_STEPS.length - 1 ? dots : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Confidence Bar ─────────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? "bg-emerald-500" : value >= 50 ? "bg-yellow-400" : "bg-red-500";
  const label = value >= 70 ? "Alta" : value >= 50 ? "Media" : "Baja";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Confianza de la señal</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold uppercase ${value >= 70 ? "text-emerald-400" : value >= 50 ? "text-yellow-400" : "text-red-400"}`}>{label}</span>
          <span className="text-[11px] font-mono font-bold text-white">{value}%</span>
        </div>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ── Metric Row ─────────────────────────────────────────────────────────────────
function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-white/[0.04]">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</span>
      <span className={`text-[11px] font-mono font-semibold ${color || "text-zinc-200"}`}>{value}</span>
    </div>
  );
}

// ── Signal Result Block ────────────────────────────────────────────────────────
function SignalResult({ sig, confidence }: { sig: FlowIntelSignal; confidence: number }) {
  const sesgo   = parseSesgo(sig);
  const isLong  = sig.setup === "Long";
  const isShort = sig.setup === "Short";
  const noTrade = sig.setup === "No Trade";

  // Derive NIVEL GATILLO from entry text (extract price)
  const gatillo = sig.nivelGatillo || sig.entry || "—";
  // Derive MÉTRICA OPCIÓN from contractRec + technicals
  const metrica = sig.metricaOpcion || sig.contractRec || "Analizando cadena...";
  // Justificación
  const justif  = sig.justificacion || sig.reasoning || sig.flowSummary || "";

  return (
    <div className={`rounded-lg border overflow-hidden ${
      isLong  ? "border-emerald-500/30" :
      isShort ? "border-red-500/30" :
                "border-zinc-700/50"
    }`}>

      {/* ── SESGO row ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/40 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Sesgo</span>
          <span className={`px-2.5 py-0.5 rounded border text-[11px] font-bold flex items-center gap-1 ${sesgo.bg} ${sesgo.color}`}>
            {sesgo.icon}
            {sesgo.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-600 font-mono">{new Date(sig.timestamp).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} ET</span>
          {!noTrade && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isLong ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/50" : "bg-red-900/40 text-red-300 border-red-700/50"}`}>
              {isLong ? "LONG ▲" : "SHORT ▼"}
            </span>
          )}
        </div>
      </div>

      {noTrade ? (
        <div className="px-4 py-4">
          {/* Header warning */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
            <Minus className="w-4 h-4 text-zinc-500" />
            <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">Sin Entrada — Esperando Condiciones</span>
          </div>

          {/* GEX Levels grid — always available */}
          {sig.keyLevels && (
            <div className="mb-4">
              <span className="text-[9px] uppercase tracking-widest text-zinc-600 block mb-2">Niveles GEX del Día</span>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-emerald-900/20 border border-emerald-700/30 rounded px-3 py-2">
                  <div className="text-[9px] text-emerald-500 uppercase tracking-widest mb-0.5">Call Wall</div>
                  <div className="text-sm font-mono font-bold text-emerald-300">{sig.keyLevels.callWall}</div>
                </div>
                <div className="bg-red-900/20 border border-red-700/30 rounded px-3 py-2">
                  <div className="text-[9px] text-red-500 uppercase tracking-widest mb-0.5">Put Wall</div>
                  <div className="text-sm font-mono font-bold text-red-300">{sig.keyLevels.putWall}</div>
                </div>
                <div className="bg-purple-900/20 border border-purple-700/30 rounded px-3 py-2">
                  <div className="text-[9px] text-purple-400 uppercase tracking-widest mb-0.5">Gamma Flip</div>
                  <div className="text-sm font-mono font-bold text-purple-200">{sig.keyLevels.gammaFlip}</div>
                </div>
                <div className="bg-zinc-800/40 border border-zinc-700/30 rounded px-3 py-2">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">Max Pain</div>
                  <div className="text-sm font-mono font-bold text-zinc-300">{sig.keyLevels.maxPain}</div>
                </div>
              </div>
            </div>
          )}

          {/* VWAP + BB context */}
          {sig.technicals && (
            <div className="mb-4">
              <span className="text-[9px] uppercase tracking-widest text-zinc-600 block mb-2">Contexto Técnico</span>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center bg-black/30 rounded px-3 py-1.5">
                  <span className="text-[10px] text-zinc-500">VWAP</span>
                  <span className={`text-[11px] font-mono font-bold ${sig.technicals.vwapDistPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    ${sig.technicals.vwap} <span className="text-[9px]">({sig.technicals.vwapDistPct >= 0 ? "+" : ""}{sig.technicals.vwapDistPct}%)</span>
                  </span>
                </div>
                <div className="flex justify-between items-center bg-black/30 rounded px-3 py-1.5">
                  <span className="text-[10px] text-zinc-500">BB Upper / Lower</span>
                  <span className="text-[11px] font-mono text-zinc-400">${sig.technicals.bbUpper} / ${sig.technicals.bbLower}</span>
                </div>
                <div className="flex justify-between items-center bg-black/30 rounded px-3 py-1.5">
                  <span className="text-[10px] text-zinc-500">EMA 9 / EMA 21</span>
                  <span className="text-[11px] font-mono text-purple-300">${sig.technicals.ema9} / ${sig.technicals.ema21}</span>
                </div>
              </div>
            </div>
          )}

          {/* Métrica opción si hay IV disponible */}
          {sig.metricaOpcion && (
            <div className="bg-amber-900/10 border border-amber-700/20 rounded px-3 py-2">
              <div className="text-[9px] text-amber-500 uppercase tracking-widest mb-1">Contexto de Opciones</div>
              <p className="text-[11px] font-mono text-amber-200/80">{sig.metricaOpcion}</p>
            </div>
          )}

          {/* Justificación si hay */}
          {sig.justificacion && (
            <div className="mt-3 bg-black/30 rounded px-3 py-2">
              <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Análisis</div>
              <p className="text-[11px] font-mono text-zinc-400 leading-relaxed">{sig.justificacion}</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── NIVEL GATILLO ── */}
          <div className="px-4 py-3 border-b border-white/5 bg-black/20">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Nivel Gatillo</span>
            <p className={`text-sm font-mono font-semibold leading-snug ${isLong ? "text-emerald-200" : "text-red-200"}`}>
              {gatillo}
            </p>
          </div>

          {/* ── SL / TP ── */}
          <div className="grid grid-cols-2 border-b border-white/5">
            <div className="px-4 py-3 border-r border-white/5">
              <span className="text-[10px] uppercase tracking-widest text-red-400 block mb-1">Stop Loss</span>
              <span className="text-base font-mono font-bold text-red-300">{sig.stopLoss}</span>
            </div>
            <div className="px-4 py-3">
              <span className="text-[10px] uppercase tracking-widest text-emerald-400 block mb-1">Take Profit</span>
              <span className="text-base font-mono font-bold text-emerald-300">{sig.takeProfit}</span>
            </div>
          </div>

          {/* ── JUSTIFICACIÓN TÉCNICA ── */}
          <div className="px-4 py-3 border-b border-white/5 bg-black/10">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 block mb-1.5">Justificación Técnica</span>
            <p className="text-[11px] font-mono text-zinc-300 leading-relaxed">{justif}</p>
          </div>

          {/* ── MÉTRICA OPCIÓN ── */}
          <div className="px-4 py-3 border-b border-white/5">
            <span className="text-[10px] uppercase tracking-widest text-amber-500 block mb-1.5">Métrica Opción</span>
            <p className="text-[12px] font-mono font-semibold text-amber-200">{metrica}</p>
          </div>
        </>
      )}

      {/* ── CONFIANZA bar ── */}
      <div className="px-4 py-3 bg-black/30">
        <ConfidenceBar value={confidence} />
      </div>
    </div>
  );
}

// ── Left Panel: Metrics sidebar ───────────────────────────────────────────────
function MetricsPanel({ ticker, sig, atmIv }: { ticker: string; sig: FlowIntelSignal | null; atmIv?: string }) {
  const tech = sig?.technicals;
  const kl   = sig?.keyLevels;

  // IV: prefer real ticker atmIv, fallback to parsing from bias string
  const ivDisplay = atmIv || sig?.bias?.match(/[\d.]+%/)?.[0] || '—';
  // Delta/Theta from structured metricaOpcion field
  const deltaFromMetrica = (sig as any)?.metricaOpcion?.match(/Delta ([\d.]+)/)?.[1];
  const thetaFromMetrica = (sig as any)?.metricaOpcion?.match(/Theta (-[\d.]+)/)?.[1];

  return (
    <div className="space-y-0">
      <MetricRow
        label="VWAP"
        value={tech ? `$${tech.vwap}` : '—'}
        color={tech ? (tech.vwapDistPct >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-zinc-400'}
      />
      <MetricRow label="Gamma Flip"  value={kl?.gammaFlip || '—'} color="text-purple-300" />
      <MetricRow label="Max Pain"    value={kl?.maxPain    || '—'} color="text-zinc-300" />
      <MetricRow label="Call Wall"   value={kl?.callWall   || '—'} color="text-emerald-400" />
      <MetricRow label="Put Wall"    value={kl?.putWall    || '—'} color="text-red-400" />
      <MetricRow label="IV ATM"      value={ivDisplay}               color="text-cyan-300" />
      {tech && (
        <>
          <MetricRow label="BB Upper"    value={`$${tech.bbUpper}`}   color="text-zinc-400" />
          <MetricRow label="BB Lower"    value={`$${tech.bbLower}`}   color="text-zinc-400" />
          <MetricRow label="EMA 9"       value={`$${tech.ema9}`}      color="text-purple-300" />
          <MetricRow label="EMA 21"      value={`$${tech.ema21}`}     color="text-purple-400" />
          <MetricRow
            label="Day Range"
            value={tech.dayRangePct ? `${tech.dayRangePct}%` : '—'}
            color={tech.overExtended ? 'text-orange-400' : 'text-zinc-300'}
          />
        </>
      )}
      {deltaFromMetrica && <MetricRow label="Δ Delta" value={`${deltaFromMetrica}`} color="text-emerald-300" />}
      {thetaFromMetrica && <MetricRow label="Θ Theta/D" value={thetaFromMetrica} color="text-red-300" />}

      {/* SMA 15min section */}
      {tech && (tech as any).sma20_15m != null && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">SMA 15min</div>
          {([20, 40, 100, 200] as const).map((p) => {
            const val = (tech as any)[`sma${p}_15m`] as number | undefined;
            if (val == null) return null;
            return (
              <MetricRow
                key={`sma${p}15`}
                label={`SMA${p}`}
                value={`$${val}`}
                color={(sig as any)?.setup === "Long" ? "text-emerald-300/80" : (sig as any)?.setup === "Short" ? "text-red-300/80" : "text-zinc-400"}
              />
            );
          })}
          <div className={`text-[8px] mt-1 px-1 py-0.5 rounded text-center font-bold ${
            (tech as any).smaAligned15m === "bullish" ? "bg-emerald-900/30 text-emerald-400" :
            (tech as any).smaAligned15m === "bearish" ? "bg-red-900/30 text-red-400" :
            "bg-zinc-800/40 text-zinc-500"
          }`}>
            15m: {((tech as any).smaAligned15m || "neutral").toUpperCase()}
          </div>
        </div>
      )}

      {/* SMA 1H section */}
      {tech && (tech as any).sma20_1h != null && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">SMA 1H</div>
          {([20, 40, 100, 200] as const).map((p) => {
            const val = (tech as any)[`sma${p}_1h`] as number | undefined;
            if (val == null) return null;
            return (
              <MetricRow
                key={`sma${p}1h`}
                label={`SMA${p}`}
                value={`$${val}`}
                color={(sig as any)?.setup === "Long" ? "text-emerald-300/80" : (sig as any)?.setup === "Short" ? "text-red-300/80" : "text-zinc-400"}
              />
            );
          })}
          <div className={`text-[8px] mt-1 px-1 py-0.5 rounded text-center font-bold ${
            (tech as any).smaAligned1h === "bullish" ? "bg-emerald-900/30 text-emerald-400" :
            (tech as any).smaAligned1h === "bearish" ? "bg-red-900/30 text-red-400" :
            "bg-zinc-800/40 text-zinc-500"
          }`}>
            1H: {((tech as any).smaAligned1h || "neutral").toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Options Flow Table ─────────────────────────────────────────────────────────
function OptionsFlowTable({ ticker, onRowClick }: { ticker: string; onRowClick?: (row: any) => void }) {
  const { data } = useQuery<OptionsFlowEntry[]>({
    queryKey: ["/api/options-flow"],
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const rows = (data || [])
    .filter(f => ticker === "ALL" || f.symbol === ticker)
    .slice(0, 12);

  if (rows.length === 0) {
    return <p className="text-[10px] text-zinc-600 text-center py-4">Sin flujo reciente para {ticker}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">TIME</th>
            <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">TYPE</th>
            <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">TICKER</th>
            <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">STRIKE</th>
            <th className="text-left py-1.5 px-2 text-zinc-500 font-medium">EXP</th>
            <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">PREM</th>
            <th className="text-right py-1.5 px-2 text-zinc-500 font-medium">VOL</th>
            <th className="text-center py-1.5 px-2 text-zinc-500 font-medium">SENT</th>
            <th className="text-center py-1.5 px-2 text-zinc-500 font-medium">SIGNAL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const vol = formatVolume(row.volume);
            const t = new Date(row.timestamp).toLocaleTimeString("en-US", {
              timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });
            return (
              <tr key={row.id} onClick={() => onRowClick && onRowClick({ ...row, _volumeParsed: vol })} className={`border-b border-white/[0.03] transition-colors ${onRowClick ? "cursor-pointer hover:bg-white/[0.04] hover:border-[#00C9A7]/10" : "hover:bg-white/[0.02]"}`}>
                <td className="py-1.5 px-2 text-zinc-500">{t}</td>
                <td className="py-1.5 px-2">
                  <span className="text-zinc-400">{row.type?.toUpperCase()}</span>
                </td>
                <td className="py-1.5 px-2 text-white font-bold">{row.symbol}</td>
                <td className="py-1.5 px-2 text-zinc-300">{row.strike}</td>
                <td className="py-1.5 px-2 text-zinc-400">{row.expiry?.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3") || row.expiry}</td>
                <td className="py-1.5 px-2 text-right text-zinc-200">{row.premium}</td>
                <td className="py-1.5 px-2 text-right text-zinc-400">{vol.contracts}</td>
                <td className="py-1.5 px-2 text-center">
                  <span className={`font-bold uppercase ${sentimentBadge(row.sentiment)}`}>
                    {row.sentiment === "bullish" ? "BULL" : row.sentiment === "bearish" ? "BEAR" : "NEUT"}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-center">
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${signalBadge(row.signal)}`}>
                    {row.signal}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Right Sidebar: System Prompt Card ────────────────────────────────────────
function PromptCard() {
  return (
    <div className="rounded-lg border border-zinc-700/50 bg-black/30 overflow-hidden text-[10px]">
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <Brain className="w-3.5 h-3.5 text-purple-400" />
        <span className="font-mono text-purple-300 font-semibold text-[11px]">Agente 0DTE v1.0</span>
      </div>
      <div className="px-3 py-2.5 space-y-2.5 text-zinc-500 leading-relaxed">
        <div>
          <span className="text-zinc-400 font-semibold block mb-0.5">ROL:</span>
          Analista cuantitativo senior — scalping 0DTE institucional
        </div>
        <div>
          <span className="text-zinc-400 font-semibold block mb-0.5">PASO 1 — Key Levels:</span>
          Soporte/resistencia institucional, VWAP, Gamma Flip, Max Pain
        </div>
        <div>
          <span className="text-zinc-400 font-semibold block mb-0.5">PASO 2 — Option Chain:</span>
          Vol vs OI, cambios Delta/Gamma en RT, sweeps de smart money
        </div>
        <div>
          <span className="text-zinc-400 font-semibold block mb-0.5">PASO 3 — Confluencia:</span>
          Momentum y estructura de mercado en velas 1m y 5m
        </div>
        <div>
          <span className="text-zinc-400 font-semibold block mb-0.5">PASO 4 — Riesgo:</span>
          Theta decay, IV skew, ratio riesgo-beneficio óptimo para scalp
        </div>
        <div className="pt-1 border-t border-white/5">
          <span className="text-zinc-400 font-semibold block mb-0.5">RESTRICCIONES:</span>
          Extremadamente lacónico. No alucinar niveles. Señales contradictorias → "SIN ENTRADA CLARA"
        </div>
        <div className="pt-1 border-t border-white/5">
          <span className="text-zinc-400 font-semibold block mb-0.5">FORMATO SALIDA:</span>
          SESGO / NIVEL GATILLO / JUSTIFICACIÓN / OPCIÓN / SL/TP / CONFIANZA
        </div>
      </div>
    </div>
  );
}

function LegendCard() {
  return (
    <div className="rounded-lg border border-zinc-700/50 bg-black/30 px-3 py-2.5">
      <span className="text-[9px] uppercase tracking-widest text-zinc-600 block mb-2">Leyenda</span>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block flex-shrink-0" />
          <span className="text-[10px] text-zinc-500">Bullish / Call signal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block flex-shrink-0" />
          <span className="text-[10px] text-zinc-500">Bearish / Put signal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block flex-shrink-0" />
          <span className="text-[10px] text-zinc-500">Neutral / Mixed signal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-400 inline-block flex-shrink-0" />
          <span className="text-[10px] text-zinc-500">Ojo / Strong divergence</span>
        </div>
      </div>
    </div>
  );
}


// ── Flow Detail Modal ─────────────────────────────────────────────────────────
function FlowDetailModal({ flow, onClose }: { flow: any; onClose: () => void }) {
  if (!flow) return null;

  // Parse the JSON-encoded volume field
  let details: any = {};
  try { details = JSON.parse(flow.volume || "{}"); } catch {}

  const isBull = flow.sentiment === "bullish";
  const isBear = flow.sentiment === "bearish";
  const accentColor = isBull ? "emerald" : isBear ? "red" : "zinc";

  const expFormatted = flow.expiry?.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3/$1") || flow.expiry;
  const timeET = new Date(flow.timestamp).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-[520px] max-w-[95vw] rounded-xl border bg-[#0a0a14] shadow-2xl overflow-hidden ${
          isBull ? "border-emerald-500/30" : isBear ? "border-red-500/30" : "border-zinc-600/40"
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${
          isBull ? "border-emerald-500/20 bg-emerald-900/10" :
          isBear ? "border-red-500/20 bg-red-900/10" :
          "border-zinc-700/30 bg-zinc-800/20"
        }`}>
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-lg font-bold text-white">{flow.symbol}</span>
                <span className="text-sm font-mono text-zinc-400">{flow.strike}</span>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${
                  isBull ? "border-emerald-500/40 bg-emerald-900/30 text-emerald-300" :
                  isBear ? "border-red-500/40 bg-red-900/30 text-red-300" :
                  "border-zinc-600/40 bg-zinc-800/30 text-zinc-300"
                }`}>{details.callPut || (isBull ? "CALL" : "PUT")}</span>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${
                  flow.signal === "sweep" ? "border-amber-500/40 bg-amber-900/30 text-amber-300" :
                  flow.signal === "block" ? "border-blue-500/40 bg-blue-900/30 text-blue-300" :
                  "border-zinc-600/40 bg-zinc-700/30 text-zinc-300"
                }`}>{flow.signal?.toUpperCase()}</span>
              </div>
              <div className="text-[10px] text-zinc-500">{timeET} ET · Exp {expFormatted}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">

          {/* Key metrics row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Premium", value: flow.premium, color: "text-white" },
              { label: "Contratos", value: details.contracts ? details.contracts.toLocaleString() : "—", color: "text-zinc-200" },
              { label: "Notional", value: details.notional || flow.premium, color: "text-amber-300" },
              { label: "# Trades", value: details.trades || "1", color: "text-zinc-200" },
            ].map(m => (
              <div key={m.label} className="bg-black/40 rounded-lg px-3 py-2 border border-white/5">
                <div className="text-[8px] uppercase tracking-widest text-zinc-600 mb-1">{m.label}</div>
                <div className={`text-sm font-mono font-bold ${m.color}`}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Price execution */}
          {(details.first || details.last) && (
            <div className="bg-black/30 rounded-lg px-4 py-3 border border-white/5">
              <div className="text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Ejecución de Precio</div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Primer Print", value: details.first ? `$${details.first}` : "—" },
                  { label: "Último Print", value: details.last ? `$${details.last}` : "—" },
                  { label: "Bid", value: details.bid ? `$${details.bid}` : "—" },
                  { label: "Ask", value: details.ask ? `$${details.ask}` : "—" },
                ].map(p => (
                  <div key={p.label}>
                    <div className="text-[8px] text-zinc-600 mb-0.5">{p.label}</div>
                    <div className="text-[11px] font-mono text-zinc-200">{p.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Direction + Confidence */}
          {details.direction && (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-black/30 rounded-lg px-4 py-2.5 border border-white/5">
                <div className="text-[8px] uppercase tracking-widest text-zinc-600 mb-1">Dirección</div>
                <div className={`text-sm font-bold ${isBull ? "text-emerald-300" : isBear ? "text-red-300" : "text-zinc-300"}`}>
                  {details.direction}
                </div>
              </div>
              {details.confidence && (
                <div className="flex-1 bg-black/30 rounded-lg px-4 py-2.5 border border-white/5">
                  <div className="text-[8px] uppercase tracking-widest text-zinc-600 mb-1">Confianza</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isBull ? "bg-emerald-400" : isBear ? "bg-red-400" : "bg-zinc-500"}`}
                        style={{ width: `${details.confidence}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-zinc-200">{details.confidence}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contract info */}
          <div className="bg-black/30 rounded-lg px-4 py-3 border border-white/5">
            <div className="text-[9px] uppercase tracking-widest text-zinc-600 mb-2">Contrato</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-mono text-zinc-300">{details.optionContract || flow.details?.split(" | ")[0] || "—"}</div>
                {details.exchanges && (
                  <div className="text-[9px] text-zinc-600 mt-0.5">{details.exchanges} {details.exchanges === 1 ? "exchange" : "exchanges"} · {details.durationMs ? `${details.durationMs}ms` : ""}</div>
                )}
              </div>
              <div className={`px-3 py-1 rounded border text-[11px] font-bold ${
                isBull ? "border-emerald-500/30 bg-emerald-900/20 text-emerald-300" :
                         "border-red-500/30 bg-red-900/20 text-red-300"
              }`}>
                {isBull ? "▲ ALCISTA" : isBear ? "▼ BAJISTA" : "◆ NEUTRAL"}
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-white/5 bg-black/30 flex items-center justify-between">
          <span className="text-[9px] text-zinc-600">OptionFlow · Datos en tiempo real</span>
          <button onClick={onClose} className="px-3 py-1 rounded border border-zinc-700/50 text-[10px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FlowIntelligencePage() {
  const [activeTicker, setActiveTicker] = useState("TSLA");
  const [cotRunning, setCotRunning]     = useState(false);
  const [showResult, setShowResult]     = useState(true);
  const [clock, setClock]               = useState(nyTime());

  // Flow Intel data — NO auto-refresh, only updates when user presses ANALIZAR
  const { data, isLoading, dataUpdatedAt, refetch: refetchAnalysis } = useQuery<FlowIntelResponse>({
    queryKey: ["/api/flow-intelligence"],
    refetchInterval: false,
    refetchIntervalInBackground: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Ticker data (real prices + changePercent + IV)
  const { data: tickerData } = useQuery<TickerData[]>({
    queryKey: ["/api/tickers"],
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // Live clock
  useEffect(() => {
    const iv = setInterval(() => setClock(nyTime()), 1000);
    return () => clearInterval(iv);
  }, []);

  // When ticker changes, run CoT animation
  useEffect(() => {
    setShowResult(false);
    setCotRunning(true);
  }, [activeTicker]);

  // Also re-animate when data refreshes
  useEffect(() => {
    if (!dataUpdatedAt) return;
    setShowResult(false);
    setCotRunning(true);
  }, [dataUpdatedAt]);

  const reports = data?.reports ?? [];
  const activeReport = reports.find(r => r.symbol === activeTicker);
  const activeSig    = activeReport?.signal as any;
  const confidence   = activeSig ? parseConfidence(activeSig) : 0;

  // News feed (filtered by active ticker)
  const { data: newsData } = useQuery<any[]>({
    queryKey: ["/api/news"],
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    staleTime: 30000,
  });

  // Tweets feed (all — filtered client-side)
  const { data: tweetsData } = useQuery<any[]>({
    queryKey: ["/api/tweets"],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 15000,
  });

  // Selected flow for detail modal
  const [selectedFlow, setSelectedFlow] = useState<any | null>(null);

  // Helper to find real ticker info
  const getTickerInfo = (sym: string): TickerData | undefined =>
    tickerData?.find(t => t.symbol === sym);
  const activeTick = getTickerInfo(activeTicker);

  // Filtered news for active ticker
  const activeNews = (newsData || []).filter(n => {
    const haystack = (n.title + " " + (n.summary || "") + " " + (n.relatedTicker || "")).toLowerCase();
    return haystack.includes(activeTicker.toLowerCase());
  }).slice(0, 8);

  // Filtered tweets for active ticker
  const activeTweets = (tweetsData || []).filter(t => {
    const haystack = (t.text || "").toLowerCase();
    return haystack.includes(activeTicker.toLowerCase()) || haystack.includes("$" + activeTicker.toLowerCase());
  }).slice(0, 6);

  function handleCotDone() {
    setCotRunning(false);
    setShowResult(true);
  }

  return (
    <div className="min-h-screen bg-[#090910] text-white font-mono" data-testid="flow-intelligence-page">

      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-50 bg-[#0a0a12]/95 backdrop-blur border-b border-white/5">
        <div className="px-4 py-2 flex items-center justify-between">
          {/* Left: back button + title */}
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-zinc-700/50 bg-zinc-800/40 text-zinc-400 text-[10px] hover:border-zinc-500 hover:text-zinc-200 transition-colors">
                <ArrowLeft className="w-3 h-3" />
                Dashboard
              </button>
            </Link>
            <div className="w-px h-4 bg-zinc-700/50" />
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#00C9A7]" />
              <span className="text-sm font-bold text-[#00C9A7] tracking-wide">FLOW INTEL</span>
              <span className="text-[10px] text-zinc-600 ml-1">0DTE SCALPING AGENT</span>
            </div>
          </div>
          {/* Right: live clock + status */}
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-zinc-500">▶ LIVE</span>
            <span className="text-[11px] font-mono text-zinc-300 tabular-nums">{clock}</span>
            <span className="text-[10px] text-zinc-600">ACCOUNT: LIVE</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00C9A7] animate-pulse" />
          </div>
        </div>

        {/* Ticker strip */}
        <div className="px-4 py-1.5 border-t border-white/5 flex items-center gap-3 overflow-x-auto scrollbar-none">
          {TICKERS.map((t, idx) => {
            const rep  = reports.find(r => r.symbol === t);
            const s    = rep?.signal as any;
            const tick = getTickerInfo(t);
            // Use real changePercent from ticker API; fallback to vwapDistPct
            const chg  = tick?.changePercent ?? s?.technicals?.vwapDistPct;
            const isUp = chg != null && chg >= 0;
            const col  = s?.setup === "Long" ? (isUp ? "text-emerald-400" : "text-red-400")
                       : s?.setup === "Short" ? "text-red-400"
                       : isUp ? "text-emerald-400" : "text-red-400";
            return (
              <React.Fragment key={t}>
                {idx === 8 && <span className="text-zinc-700 flex-shrink-0">·</span>}
                <button
                  onClick={() => setActiveTicker(t)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-all flex-shrink-0 ${
                    activeTicker === t
                      ? "bg-[#00C9A7]/15 text-[#00C9A7] border border-[#00C9A7]/40"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span className="font-bold">{t}</span>
                  {chg != null && (
                    <span className={`text-[9px] ${activeTicker === t ? "text-[#00C9A7]/80" : col}`}>
                      {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <RefreshCw className={`w-3 h-3 text-zinc-600 ${isLoading ? "animate-spin" : ""}`} />
            <span className="text-[9px] text-zinc-600">Auto 15s</span>
          </div>
        </div>
      </div>

      {/* ── Main body: 3-column layout ── */}
      <div className="flex h-[calc(100vh-88px)]">

        {/* ── Column 1: Left panel (metrics) ── */}
        <div className="w-48 flex-shrink-0 border-r border-white/5 bg-black/20 overflow-y-auto">
          <div className="p-3">
            {/* Active ticker header with real price + change */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm font-bold text-white">{activeTicker}</span>
                {activeTick?.changePercent != null && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                    activeTick.changePercent >= 0
                      ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                      : "text-red-400 border-red-500/40 bg-red-500/10"
                  }`}>
                    {activeTick.changePercent >= 0 ? "+" : ""}{activeTick.changePercent.toFixed(2)}%
                  </span>
                )}
              </div>
              {activeTick?.price != null && (
                <div className="text-[13px] font-mono font-semibold text-zinc-200">
                  ${activeTick.price.toFixed(2)}
                  {activeTick.change != null && (
                    <span className={`text-[10px] ml-1 ${activeTick.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {activeTick.change >= 0 ? "+" : ""}{activeTick.change.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
              {/* ATM IV from real ticker data */}
              {activeTick?.atmIv && (
                <div className="text-[10px] text-cyan-400/70 mt-0.5">IV: {activeTick.atmIv}</div>
              )}
            </div>

            {/* Metrics */}
            {activeSig ? (
              <MetricsPanel ticker={activeTicker} sig={activeSig} atmIv={activeTick?.atmIv} />
            ) : (
              <div className="space-y-1">
                {["VWAP","Gamma Flip","Max Pain","Call Wall","Put Wall","IV ATM","BB Upper","BB Lower","EMA9","EMA21"].map(k => (
                  <MetricRow key={k} label={k} value="—" />
                ))}
              </div>
            )}

            {/* Net GEX + Gamma Regime */}
            {activeTick && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">GEX / Regime</div>
                <MetricRow label="Net GEX" value={activeTick.netGex || "—"} color="text-purple-300" />
                <MetricRow label="Regime"  value={activeTick.gammaRegime || "—"}
                  color={activeTick.gammaRegime?.includes("Negative") ? "text-red-400" : "text-emerald-400"}
                />
              </div>
            )}

            {/* Flow signal legend */}
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-2">Señales</div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[9px] text-zinc-600">Long / Calls</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span className="text-[9px] text-zinc-600">Short / Puts</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  <span className="text-[9px] text-zinc-600">Neutral / Espera</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Column 2: Main center ── */}
        <div className="flex-1 overflow-y-auto bg-[#090910]">
          <div className="p-4 space-y-4">

            {/* Agent header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-bold text-white">Agente 0DTE — Análisis Cuantitativo</span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  Scalping Institucional · {timeAgo(activeReport?.timestamp || new Date().toISOString())} · <span className="text-[#00C9A7]">{activeTicker}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setCotRunning(true);
                    setShowResult(false);
                    refetchAnalysis();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#00C9A7]/40 bg-[#00C9A7]/10 text-[#00C9A7] text-[11px] hover:bg-[#00C9A7]/20 transition-colors"
                  data-testid="btn-analyze"
                >
                  <Zap className="w-3.5 h-3.5" />
                  ANALIZAR {activeTicker}
                </button>
              </div>
            </div>

            {/* Chain-of-Thought */}
            <div className="rounded-lg border border-white/5 bg-black/30 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] uppercase tracking-widest text-cyan-400">Chain-Of-Thought Log</span>
              </div>
              <ChainOfThought running={cotRunning} onDone={handleCotDone} />
            </div>

            {/* Result */}
            {showResult && activeSig ? (
              <SignalResult sig={activeSig} confidence={confidence} />
            ) : showResult && !activeSig ? (
              <div className="rounded-lg border border-zinc-700/50 bg-black/30 px-4 py-8 text-center">
                <Activity className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
                <p className="text-[11px] text-zinc-500">Sin datos de análisis para {activeTicker}</p>
                <p className="text-[10px] text-zinc-700 mt-1">El motor analiza cada 60s durante horas de mercado</p>
              </div>
            ) : null}

            {/* Options flow table */}
            <div className="rounded-lg border border-white/5 bg-black/30 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] text-amber-400 font-semibold uppercase tracking-wide">Option Flow</span>
                  <span className="text-[9px] text-zinc-600">▸ {activeTicker}</span>
                </div>
                <span className="text-[9px] text-zinc-600">Live · Auto 10s</span>
              </div>
              <OptionsFlowTable ticker={activeTicker} onRowClick={(row) => setSelectedFlow(row)} />
            </div>

            {/* Disclaimer */}
            <p className="text-[9px] text-zinc-700 text-center pb-4">
              ✦ Señal generada con datos simulados · Solo con fines educativos y de demostración · No constituye consejo de inversión
            </p>
          </div>
        </div>

        {/* ── Column 3: Right sidebar — News + Tweets + Tickers ── */}
        <div className="w-56 flex-shrink-0 border-l border-white/5 bg-black/20 overflow-y-auto">
          <div className="p-3 space-y-3">

            {/* News feed for active ticker */}
            <div className="rounded-lg border border-zinc-700/50 bg-black/30 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5 flex items-center gap-1.5">
                <Newspaper className="w-3 h-3 text-blue-400" />
                <span className="text-[9px] uppercase tracking-widest text-blue-400">Noticias · {activeTicker}</span>
              </div>
              <div className="divide-y divide-white/[0.03]">
                {activeNews.length > 0 ? activeNews.map((n: any, i: number) => (
                  <a key={i} href={n.url || "#"} target="_blank" rel="noopener noreferrer"
                    className="block px-3 py-2 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-start justify-between gap-1 mb-0.5">
                      <p className="text-[10px] text-zinc-300 leading-tight group-hover:text-white transition-colors line-clamp-3">{n.title}</p>
                      <ExternalLink className="w-2.5 h-2.5 text-zinc-700 group-hover:text-zinc-400 flex-shrink-0 mt-0.5 transition-colors" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[8px] text-zinc-600">{n.source}</span>
                      <span className={`text-[8px] px-1 rounded ${
                        n.sentiment === "bullish" ? "text-emerald-400/70 bg-emerald-900/20" :
                        n.sentiment === "bearish" ? "text-red-400/70 bg-red-900/20" :
                        "text-zinc-600"
                      }`}>{n.sentiment || ""}</span>
                    </div>
                  </a>
                )) : (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[10px] text-zinc-600">Sin noticias para {activeTicker}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Tweets feed for active ticker */}
            <div className="rounded-lg border border-zinc-700/50 bg-black/30 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5 flex items-center gap-1.5">
                <Twitter className="w-3 h-3 text-sky-400" />
                <span className="text-[9px] uppercase tracking-widest text-sky-400">Tweets · {activeTicker}</span>
              </div>
              <div className="divide-y divide-white/[0.03]">
                {activeTweets.length > 0 ? activeTweets.map((t: any, i: number) => (
                  <a key={i} href={t.url || "#"} target="_blank" rel="noopener noreferrer"
                    className="block px-3 py-2 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-bold text-sky-300">@{t.username}</span>
                      <span className="text-[8px] text-zinc-600">{new Date(t.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" })}</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-tight group-hover:text-zinc-200 transition-colors line-clamp-3">{t.text}</p>
                  </a>
                )) : (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[10px] text-zinc-600">Sin tweets para {activeTicker}</p>
                    <p className="text-[9px] text-zinc-700 mt-1">Se muestran tweets generales del mercado</p>
                    {/* Show latest 3 general tweets as fallback */}
                    {(tweetsData || []).slice(0, 3).map((t: any, i: number) => (
                      <a key={i} href={t.url || "#"} target="_blank" rel="noopener noreferrer"
                        className="block text-left px-0 py-1.5 hover:bg-white/[0.02] transition-colors group mt-2">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[9px] font-bold text-sky-300">@{t.username}</span>
                        </div>
                        <p className="text-[9px] text-zinc-500 leading-tight line-clamp-2">{t.text}</p>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* All tickers overview */}
            <div className="rounded-lg border border-zinc-700/50 bg-black/30 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5">
                <span className="text-[9px] uppercase tracking-widest text-zinc-600">Todos los Tickers</span>
              </div>
              <div className="divide-y divide-white/[0.03]">
                {reports.map(r => {
                  const s    = r.signal as any;
                  const tick = getTickerInfo(r.symbol);
                  const col  = s.setup === "Long" ? "text-emerald-400" : s.setup === "Short" ? "text-red-400" : "text-zinc-500";
                  const dot  = s.setup === "Long" ? "bg-emerald-400" : s.setup === "Short" ? "bg-red-400" : "bg-zinc-600";
                  const chg  = tick?.changePercent;
                  return (
                    <button
                      key={r.symbol}
                      onClick={() => setActiveTicker(r.symbol)}
                      className={`w-full flex items-center justify-between px-3 py-1 hover:bg-white/[0.02] transition-colors text-left ${activeTicker === r.symbol ? "bg-white/[0.04]" : ""}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                        <span className="text-[10px] font-bold text-zinc-300">{r.symbol}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`text-[9px] font-bold ${col}`}>
                          {s.setup === "Long" ? "LONG" : s.setup === "Short" ? "SHORT" : "—"}
                        </span>
                        {chg != null && (
                          <span className={`text-[8px] ${chg >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
      {/* Flow Detail Modal */}
      {selectedFlow && (
        <FlowDetailModal flow={selectedFlow} onClose={() => setSelectedFlow(null)} />
      )}
    </div>
  );
}
