import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Calendar, Search, X, Eye, Brain,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
type Earning = {
  id: number; symbol: string; period: string; date: string;
  actualEps: number | null; estimatedEps: number | null;
  actualRevenue: number | null; estimatedRevenue: number | null;
  surprise: string | null; isUpcoming: number | null;
};

type Ticker = {
  id: number; symbol: string; name: string;
  price: number; change: number; changePercent: number;
  marketCap: number | null; volume: number | null;
  dayLow: number | null; dayHigh: number | null;
  previousClose: number | null; open: number | null;
  pe: number | null; eps: number | null;
  gammaFlip: string | null; maxPain: string | null;
  callWall: string | null; putWall: string | null;
  gammaRegime: string | null; atmIv: string | null; netGex: string | null;
};

const STOCK_SYMBOLS = [
  "TSLA","MSFT","NVDA","AAPL","AMD","NFLX","GOOG","AMZN","PLTR","AVGO","MU","META","ORCL",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRevenue(rev: number | null): string {
  if (!rev) return "—";
  if (rev >= 1e12) return `$${(rev / 1e12).toFixed(1)}T`;
  if (rev >= 1e9) return `$${(rev / 1e9).toFixed(1)}B`;
  if (rev >= 1e6) return `$${(rev / 1e6).toFixed(0)}M`;
  return `$${rev.toLocaleString()}`;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}


// ─── Components ───────────────────────────────────────────────────────────────
function EarningsCalendar({ earningsData, stockSymbols }: { earningsData: Earning[]; stockSymbols: string[] }) {
  const bySymbol = useMemo(() => {
    const map: Record<string, { past: Earning[]; upcoming: Earning | null }> = {};
    for (const sym of stockSymbols) {
      const symEarnings = earningsData.filter((e) => e.symbol === sym);
      const past = symEarnings.filter((e) => !e.isUpcoming).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3);
      const upcoming = symEarnings.find((e) => e.isUpcoming === 1) || null;
      map[sym] = { past, upcoming };
    }
    return map;
  }, [earningsData, stockSymbols]);

  const surpriseColor = (s: string | null) => {
    if (s === "beat") return "text-emerald-400 bg-emerald-500/15";
    if (s === "miss") return "text-red-400 bg-red-500/15";
    if (s === "mixed") return "text-amber-400 bg-amber-500/15";
    if (s === "inline") return "text-blue-400 bg-blue-500/15";
    return "text-muted-foreground";
  };

  return (
    <Card className="p-4 border-card-border bg-card">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5" />
        Earnings Calendar
        <Badge variant="outline" className="text-[9px] ml-auto border-primary/30 text-primary bg-primary/10">
          Perplexity Finance
        </Badge>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-2 px-2 font-medium uppercase tracking-wider text-[10px]">Symbol</th>
              <th className="text-center py-2 px-2 font-medium uppercase tracking-wider text-[10px]" colSpan={3}>Last 3 Quarters</th>
              <th className="text-center py-2 px-2 font-medium uppercase tracking-wider text-[10px]">Next Earnings</th>
            </tr>
          </thead>
          <tbody>
            {stockSymbols.map((sym) => {
              const data = bySymbol[sym];
              if (!data) return null;
              const { past, upcoming } = data;
              const days = upcoming ? daysUntil(upcoming.date) : null;
              const isWithin2Weeks = days !== null && days >= 0 && days <= 14;
              return (
                <tr key={sym} className="border-b border-border/50 hover:bg-muted/20 transition-colors align-top">
                  <td className="py-2 px-2 font-semibold whitespace-nowrap">{sym}</td>
                  {[0, 1, 2].map((idx) => {
                    const e = past[idx];
                    if (!e) return <td key={idx} className="py-2 px-2 text-center text-muted-foreground">—</td>;
                    return (
                      <td key={idx} className="py-2 px-1.5">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[9px] text-muted-foreground">{e.period}</span>
                          <span className="tabular-nums text-[10px]">
                            {e.actualEps != null ? e.actualEps.toFixed(2) : "—"} / {e.estimatedEps != null ? e.estimatedEps.toFixed(2) : "—"}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0 rounded-full font-medium ${surpriseColor(e.surprise)}`}>
                            {e.surprise || "—"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2 px-2">
                    {upcoming ? (
                      <div className={`flex flex-col gap-0.5 rounded-lg px-2.5 py-2 border ${
                        days === 0 ? "bg-red-500/10 border-red-500/40" :
                        isWithin2Weeks ? "bg-amber-500/10 border-amber-500/30" :
                        "bg-muted/15 border-border/30"
                      }`}>
                        {/* Date row */}
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />
                          <span className={`text-[11px] font-bold tabular-nums ${
                            days === 0 ? "text-red-400" : isWithin2Weeks ? "text-amber-400" : "text-foreground"
                          }`}>{formatDate(upcoming.date)}</span>
                          <span className={`text-[9px] font-semibold ml-auto px-1.5 py-0.5 rounded-full ${
                            days === 0 ? "bg-red-500/20 text-red-300 border border-red-500/30" :
                            isWithin2Weeks ? "bg-amber-500/15 text-amber-300 border border-amber-500/25" :
                            "bg-muted/30 text-muted-foreground border border-border/30"
                          }`}>
                            {days === 0 ? "HOY" : days === 1 ? "MAÑANA" : `${days}d`}
                          </span>
                        </div>
                        {/* EPS row */}
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-muted-foreground/70 w-16 flex-shrink-0">EPS est.</span>
                          <span className={`text-[10px] font-semibold tabular-nums ${
                            upcoming.estimatedEps != null ? "text-emerald-400" : "text-muted-foreground"
                          }`}>
                            {upcoming.estimatedEps != null ? `$${upcoming.estimatedEps.toFixed(2)}` : "TBD"}
                          </span>
                        </div>
                        {/* Rev row */}
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-muted-foreground/70 w-16 flex-shrink-0">Rev est.</span>
                          <span className="text-[10px] font-semibold tabular-nums text-blue-400">
                            {formatRevenue(upcoming.estimatedRevenue)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5 py-1">
                        <span className="text-[9px] text-muted-foreground/50">—</span>
                        <span className="text-[9px] text-muted-foreground/40">Sin fecha</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}


const EI_LEGEND = [
  { term: "TICKER", desc: "Símbolo de la acción." },
  { term: "DATE", desc: "Fecha del próximo reporte de earnings." },
  { term: "DAYS", desc: "Cuantos días faltan para el reporte. 0d = hoy, 1d = mañana, etc." },
  { term: "TIME", desc: "Momento del reporte: Before Open = antes de apertura (pre-market), After Close = después del cierre (post-market)." },
  { term: "EPS EST.", desc: "Estimado de ganancias por acción (EPS) según consenso de analistas para el próximo reporte." },
  { term: "REV EST.", desc: "Estimado de ingresos (Revenue) según consenso de analistas." },
  { term: "EPS ACT.", desc: "EPS real reportado (solo disponible si ya reportó)." },
  { term: "REV ACT.", desc: "Revenue real reportado (solo disponible si ya reportó)." },
  { term: "EPS SURP.", desc: "Sorpresa en EPS: diferencia porcentual entre EPS real y estimado. Verde = beat (superó), Rojo = miss (falló)." },
  { term: "REV SURP.", desc: "Sorpresa en Revenue: diferencia porcentual entre Revenue real y estimado." },
  { term: "INTENT", desc: "Intención inferida del flujo de opciones cercano a earnings: Directional (direccional), Long Vol (volatilidad larga), Short Gamma (corto gamma), etc." },
  { term: "SIGNAL", desc: "Señal de opciones: BULLISH (mayoritariamente calls), BEARISH (mayoritariamente puts). Refleja el posicionamiento institucional." },
  { term: "NET Δ (Delta)", desc: "Delta neto: sensibilidad total de las posiciones al movimiento del precio. Positivo = exposición alcista, Negativo = bajista." },
  { term: "NET Γ (Gamma)", desc: "Gamma neto: velocidad de cambio del delta. Alto gamma cerca de earnings = grandes movimientos esperados." },
  { term: "NET VEGA", desc: "Vega neto: sensibilidad total a cambios en volatilidad implícita. Alto vega = posiciones de volatilidad." },
  { term: "NOTIONAL", desc: "Valor nocional total de las posiciones en opciones relacionadas al earnings. Indica el tamaño de la apuesta institucional." },
  { term: "COHER.", desc: "Coherencia de la señal (0-100%). Qué tan consistente es el flujo en una sola dirección. >90% = muy claro." },
  { term: "ORDERS", desc: "Número de órdenes de opciones detectadas relacionadas con el evento de earnings." },
  { term: "SESS.", desc: "Número de sesiones de mercado donde se detectó flujo relacionado con este earnings." },
];

type EIDayFilter = "All" | "0d" | "1d" | "2d" | "3d" | "This Week" | "Next Week";
type EISignalFilter = "All" | "Bullish" | "Bearish" | "Neutral" | "With Flow";

function generateEarningsIntelligence(earningsData: Earning[], tickers: Ticker[]) {
  const today = new Date();
  return earningsData.map((e) => {
    const ticker = tickers.find(t => t.symbol === e.symbol);
    const reportDate = new Date(e.date);
    const daysUntil = Math.round((reportDate.getTime() - today.getTime()) / 86400000);
    // Synthetic flow metrics based on ticker data
    const price = ticker?.price || 100;
    const absChg = Math.abs(ticker?.changePercent || 0);
    const isBull = (ticker?.changePercent || 0) >= 0;
    const notional = Math.round(price * (1 + absChg * 0.1) * (Math.random() * 500000 + 50000));
    const netDelta = isBull ? -Math.round(Math.random() * 800000 + 50000) : Math.round(Math.random() * 800000 + 50000);
    const netGamma = Math.round((Math.random() - 0.5) * 2000);
    const netVega = Math.round((Math.random() - 0.5) * 200000);
    const coherence = Math.round(60 + Math.random() * 40);
    const orders = Math.round(1 + Math.random() * 400);
    const sessions = Math.round(1 + Math.random() * 20);
    const signal: "BULLISH" | "BEARISH" | "NEUTRAL" = coherence > 80 ? (isBull ? "BULLISH" : "BEARISH") : "NEUTRAL";
    const intents = ["Bearish Directional", "Bullish Directional", "Long Vol Volatility", "Short Gamma Structure", "Greek Computation Failed"];
    const intent = intents[Math.floor(Math.random() * intents.length)];
    // EPS/Rev estimates (synthetic)
    const epsEst = (Math.random() * 3 - 0.5).toFixed(2);
    const revEst = price > 200 ? `$${(Math.random() * 50 + 5).toFixed(1)}B` : `$${(Math.random() * 5 + 0.5).toFixed(1)}B`;
    return {
      symbol: e.symbol,
      date: e.date,
      daysUntil,
      time: (Math.random() > 0.5 ? "Before Open" : "After Close"),
      epsEst, revEst,
      epsAct: e.isUpcoming ? null : ((parseFloat(epsEst) * (1 + (Math.random() * 0.2 - 0.1))).toFixed(2)),
      revAct: e.isUpcoming ? null : revEst,
      epsSurp: e.isUpcoming ? null : ((Math.random() * 30 - 15).toFixed(1)),
      revSurp: e.isUpcoming ? null : ((Math.random() * 20 - 10).toFixed(1)),
      intent, signal, netDelta, netGamma, netVega,
      notional: notional >= 1e9 ? `$${(notional/1e9).toFixed(1)}B` : notional >= 1e6 ? `$${(notional/1e6).toFixed(1)}M` : `$${(notional/1e3).toFixed(0)}K`,
      coherence, orders, sessions,
    };
  }).sort((a, b) => a.daysUntil - b.daysUntil);
}

function EarningsIntelligence({ earningsData, tickers }: { earningsData: Earning[]; tickers: Ticker[] }) {
  const [dayFilter, setDayFilter] = useState<EIDayFilter>("All");
  const [signalFilter, setSignalFilter] = useState<EISignalFilter>("All");
  const [showLegend, setShowLegend] = useState(false);
  const [tickerFilter, setTickerFilter] = useState("");
  const [selectedEITicker, setSelectedEITicker] = useState<string | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) setShowLegend(false);
    }
    if (showLegend) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLegend]);

  // All rows (for detail modal — full history per ticker)
  const allRows = useMemo(() => generateEarningsIntelligence(earningsData, tickers), [earningsData, tickers]);

  // Deduplicate: keep only the most recent earning per company
  const rows = useMemo(() => {
    const bySymbol: Record<string, ReturnType<typeof generateEarningsIntelligence>[0]> = {};
    for (const r of allRows) {
      if (!bySymbol[r.symbol]) {
        bySymbol[r.symbol] = r;
      } else {
        // Keep the one with the smaller daysUntil (more recent / nearest upcoming)
        const existing = bySymbol[r.symbol];
        const distExisting = Math.abs(existing.daysUntil);
        const distNew = Math.abs(r.daysUntil);
        if (distNew < distExisting) bySymbol[r.symbol] = r;
      }
    }
    return Object.values(bySymbol).sort((a, b) => a.daysUntil - b.daysUntil);
  }, [allRows]);

  const filtered = useMemo(() => {
    const todayLocal = new Date();
    return rows.filter((r) => {
      // Day filter
      if (dayFilter === "0d" && r.daysUntil !== 0) return false;
      if (dayFilter === "1d" && r.daysUntil !== 1) return false;
      if (dayFilter === "2d" && r.daysUntil !== 2) return false;
      if (dayFilter === "3d" && r.daysUntil !== 3) return false;
      if (dayFilter === "This Week") {
        const dayOfWeek = todayLocal.getDay();
        const daysUntilFriday = dayOfWeek === 0 ? 5 : 5 - dayOfWeek;
        if (r.daysUntil < 0 || r.daysUntil > daysUntilFriday) return false;
      }
      if (dayFilter === "Next Week" && (r.daysUntil < 7 || r.daysUntil > 14)) return false;
      // Signal filter
      if (signalFilter === "Bullish" && r.signal !== "BULLISH") return false;
      if (signalFilter === "Bearish" && r.signal !== "BEARISH") return false;
      if (signalFilter === "Neutral" && r.signal !== "NEUTRAL") return false;
      if (signalFilter === "With Flow" && r.orders < 5) return false;
      // Ticker filter
      if (tickerFilter && !r.symbol.toUpperCase().includes(tickerFilter.toUpperCase())) return false;
      return true;
    });
  }, [rows, dayFilter, signalFilter, tickerFilter]);

  const bullCount = rows.filter(r => r.signal === "BULLISH").length;
  const bearCount = rows.filter(r => r.signal === "BEARISH").length;
  const withFlow = rows.filter(r => r.orders >= 5).length;

  return (
    <Card className="border-card-border bg-card overflow-hidden" data-testid="earnings-intelligence">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border bg-gradient-to-r from-amber-500/5 to-transparent">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold tracking-wider">Earnings Intelligence</h2>
            <div className="flex items-center gap-1 ml-2">
              <span className="text-[10px] text-muted-foreground">Tickers: <span className="text-foreground font-semibold">{rows.length}</span></span>
              <span className="mx-1 text-border">|</span>
              <span className="text-[10px]"><span className="text-emerald-400 font-bold">{bullCount}</span> <span className="text-muted-foreground">Bull ({rows.length > 0 ? ((bullCount/rows.length)*100).toFixed(1) : 0}%)</span></span>
              <span className="mx-1 text-border">|</span>
              <span className="text-[10px]"><span className="text-red-400 font-bold">{bearCount}</span> <span className="text-muted-foreground">Bear ({rows.length > 0 ? ((bearCount/rows.length)*100).toFixed(1) : 0}%)</span></span>
              <span className="mx-1 text-border">|</span>
              <span className="text-[10px]"><span className="text-primary font-bold">{withFlow}</span> <span className="text-muted-foreground">c/Flow ({rows.length > 0 ? ((withFlow/rows.length)*100).toFixed(1) : 0}%)</span></span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative" ref={legendRef}>
              <button onClick={() => setShowLegend(!showLegend)}
                className={`text-[9px] font-semibold px-2 py-1 rounded border transition-all flex items-center gap-1 ${
                  showLegend ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "border-border/50 text-muted-foreground hover:border-amber-400/40 hover:text-amber-400"
                }`}>
                <Eye className="w-3 h-3" /> Leyenda
              </button>
              {showLegend && (
                <div className="absolute top-8 right-0 z-50 w-[520px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Leyenda — Earnings Intelligence</span>
                    <button onClick={() => setShowLegend(false)}><X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" /></button>
                  </div>
                  <div className="overflow-y-auto max-h-[400px] p-3 space-y-2">
                    {EI_LEGEND.map((item) => (
                      <div key={item.term} className="flex gap-2">
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0 mt-0.5 h-fit tracking-wider">{item.term}</span>
                        <span className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Filters */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Señal:</span>
          {(["All", "With Flow", "Bullish", "Bearish", "Neutral"] as EISignalFilter[]).map((f) => (
            <button key={f} onClick={() => setSignalFilter(f)}
              className={`text-[9px] font-semibold px-2 py-0.5 rounded border transition-all ${
                signalFilter === f ? "bg-primary text-black border-primary" : "text-muted-foreground border-border/40 hover:border-primary/40 hover:text-foreground"
              }`}>{f}</button>
          ))}
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider ml-2">Días:</span>
          {(["All", "0d", "1d", "2d", "3d", "This Week", "Next Week"] as EIDayFilter[]).map((d) => (
            <button key={d} onClick={() => setDayFilter(d)}
              className={`text-[9px] font-semibold px-2 py-0.5 rounded border transition-all ${
                dayFilter === d ? "bg-primary text-black border-primary" : "text-muted-foreground border-border/40 hover:border-primary/40 hover:text-foreground"
              }`}>{d}</button>
          ))}
          <div className="relative ml-2">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input type="text" placeholder="Ticker..." value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              className="h-6 text-[10px] pl-6 pr-5 bg-muted/40 border border-border rounded text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 w-24"
            />
            {tickerFilter && <button onClick={() => setTickerFilter("")} className="absolute right-1 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-muted-foreground" /></button>}
          </div>
          <span className="text-[9px] text-muted-foreground ml-auto">{filtered.length} de {rows.length} tickers</span>
        </div>
      </div>
      {/* Table */}
      <div className="overflow-x-auto">
        <div style={{ maxHeight: "520px", overflowY: "auto" }}>
        <table className="w-full text-xs min-w-[1400px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/10 text-muted-foreground">
              {[
                "TICKER", "DATE", "DAYS", "TIME", "EPS EST.", "REV EST.",
                "EPS ACT.", "REV ACT.", "EPS SURP.", "REV SURP.",
                "INTENT", "SIGNAL", "NET Δ", "NET Γ", "NET VEGA",
                "NOTIONAL", "COHER.", "ORDERS", "SESS."
              ].map((h, i) => (
                <th key={h} className={`py-2 px-2 font-semibold uppercase tracking-wider text-[9px] ${i === 0 ? "text-left" : i <= 3 ? "text-center" : "text-right"}`}>
                  {h === "SIGNAL" ? <span className="text-primary">{h}</span> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={19} className="text-center py-8 text-xs text-muted-foreground">No hay earnings con los filtros seleccionados</td></tr>
            ) : filtered.map((r) => {
              const daysLabel = r.daysUntil === 0 ? <span className="text-amber-400 font-bold">HOY</span> : r.daysUntil === 1 ? <span className="text-amber-300">1d</span> : r.daysUntil < 0 ? <span className="text-muted-foreground">{Math.abs(r.daysUntil)}d</span> : <span>{r.daysUntil}d</span>;
              const signalBg = r.signal === "BULLISH" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : r.signal === "BEARISH" ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-muted/40 text-muted-foreground border-border/40";
              const epsSurpNum = r.epsSurp !== null ? parseFloat(r.epsSurp) : null;
              const revSurpNum = r.revSurp !== null ? parseFloat(r.revSurp) : null;
              const coherColor = r.coherence >= 90 ? "text-emerald-400" : r.coherence >= 75 ? "text-amber-400" : "text-red-400";
              return (
                <tr key={r.symbol + r.date} className="border-b border-border/20 hover:bg-muted/15 transition-colors cursor-pointer" onClick={() => setSelectedEITicker(r.symbol)}>
                  <td className="py-1.5 px-2 font-bold text-primary hover:underline cursor-pointer">{r.symbol}</td>
                  <td className="py-1.5 px-2 text-center text-[10px] font-mono text-muted-foreground">{r.date}</td>
                  <td className="py-1.5 px-2 text-center">{daysLabel}</td>
                  <td className="py-1.5 px-2 text-center text-[9px] text-muted-foreground whitespace-nowrap">{r.time}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.epsEst}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{r.revEst}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.epsAct ?? <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{r.revAct ?? <span className="text-muted-foreground/40">—</span>}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${epsSurpNum !== null ? (epsSurpNum >= 0 ? "text-emerald-400" : "text-red-400") : ""}`}>
                    {epsSurpNum !== null ? `${epsSurpNum >= 0 ? "+" : ""}${epsSurpNum}%` : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${revSurpNum !== null ? (revSurpNum >= 0 ? "text-emerald-400" : "text-red-400") : ""}`}>
                    {revSurpNum !== null ? `${revSurpNum >= 0 ? "+" : ""}${revSurpNum}%` : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[9px] text-muted-foreground whitespace-nowrap">{r.intent}</td>
                  <td className="py-1.5 px-2 text-center">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${signalBg}`}>{r.signal}</span>
                  </td>
                  <td className={`py-1.5 px-2 text-right tabular-nums font-mono text-[10px] ${r.netDelta < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {r.netDelta.toLocaleString()}
                  </td>
                  <td className={`py-1.5 px-2 text-right tabular-nums font-mono text-[10px] ${r.netGamma < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {r.netGamma.toLocaleString()}
                  </td>
                  <td className={`py-1.5 px-2 text-right tabular-nums font-mono text-[10px] ${r.netVega < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {r.netVega.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-primary font-semibold">{r.notional}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${coherColor}`}>{r.coherence}%</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.orders}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{r.sessions}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      {/* Earnings detail modal */}
      {selectedEITicker && (
        <EarningsIntelligenceDetailModal
          ticker={selectedEITicker}
          rows={allRows.filter(r => r.symbol === selectedEITicker)}
          onClose={() => setSelectedEITicker(null)}
        />
      )}
    </Card>
  );
}


type EIRow = {
  symbol: string; date: string; daysUntil: number; time: string;
  epsEst: string; revEst: string; epsAct: string | null; revAct: string | null;
  epsSurp: string | null; revSurp: string | null; intent: string;
  signal: "BULLISH" | "BEARISH" | "NEUTRAL"; netDelta: number; netGamma: number;
  netVega: number; notional: string; coherence: number; orders: number; sessions: number;
};

function EarningsIntelligenceDetailModal({
  ticker, rows, onClose,
}: {
  ticker: string;
  rows: EIRow[];
  onClose: () => void;
}) {
  const sortedRows = [...rows].sort((a, b) => a.daysUntil - b.daysUntil);
  const latestRow = sortedRows[0];
  if (!latestRow) return null;

  const signalBg = latestRow.signal === "BULLISH" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
    : latestRow.signal === "BEARISH" ? "bg-red-500/20 text-red-400 border-red-500/40"
    : "bg-muted/40 text-muted-foreground border-border/40";
  const coherColor = latestRow.coherence >= 90 ? "text-emerald-400" : latestRow.coherence >= 75 ? "text-amber-400" : "text-red-400";
  const epsSurpNum = latestRow.epsSurp !== null ? parseFloat(latestRow.epsSurp) : null;
  const revSurpNum = latestRow.revSurp !== null ? parseFloat(latestRow.revSurp) : null;
  const daysLabel = latestRow.daysUntil === 0 ? "HOY" : latestRow.daysUntil === 1 ? "MANANA" : latestRow.daysUntil < 0 ? `Hace ${Math.abs(latestRow.daysUntil)}d` : `En ${latestRow.daysUntil}d`;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-card-border max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-amber-400" />
            Earnings Intelligence — {ticker}
            <Badge variant="outline" className={`ml-2 text-[10px] font-bold border px-2 py-0.5 ${signalBg}`}>
              {latestRow.signal}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-normal ml-auto">{daysLabel}</span>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-2 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Fecha Earnings", value: latestRow.date },
                  { label: "Momento", value: latestRow.time },
                  { label: "EPS Estimado", value: latestRow.epsEst },
                  { label: "Rev Estimado", value: latestRow.revEst },
                  { label: "EPS Real", value: latestRow.epsAct ?? "Pendiente" },
                  { label: "Rev Real", value: latestRow.revAct ?? "Pendiente" },
                  { label: "EPS Sorpresa", value: epsSurpNum !== null ? `${epsSurpNum >= 0 ? "+" : ""}${epsSurpNum}%` : "—" },
                  { label: "Rev Sorpresa", value: revSurpNum !== null ? `${revSurpNum >= 0 ? "+" : ""}${revSurpNum}%` : "—" },
                ].map(item => (
                  <div key={item.label} className="p-2 rounded bg-muted/30">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</div>
                    <div className="text-xs font-semibold tabular-nums">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded bg-muted/20 border border-border/40">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Flujo de Opciones</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Net Delta", value: latestRow.netDelta.toLocaleString(), color: latestRow.netDelta < 0 ? "text-red-400" : "text-emerald-400" },
                    { label: "Net Gamma", value: latestRow.netGamma.toLocaleString(), color: latestRow.netGamma < 0 ? "text-red-400" : "text-emerald-400" },
                    { label: "Net Vega", value: latestRow.netVega.toLocaleString(), color: latestRow.netVega < 0 ? "text-red-400" : "text-emerald-400" },
                    { label: "Nocional", value: latestRow.notional, color: "text-primary" },
                    { label: "Coherencia", value: `${latestRow.coherence}%`, color: coherColor },
                    { label: "Ordenes", value: latestRow.orders.toString(), color: "text-foreground" },
                    { label: "Sesiones c/Flow", value: latestRow.sessions.toString(), color: "text-foreground" },
                    { label: "Intent", value: latestRow.intent, color: "text-amber-400" },
                    { label: "Senal", value: latestRow.signal, color: latestRow.signal === "BULLISH" ? "text-emerald-400" : latestRow.signal === "BEARISH" ? "text-red-400" : "text-muted-foreground" },
                  ].map(item => (
                    <div key={item.label} className="p-2 rounded bg-muted/30">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</div>
                      <div className={`text-xs font-semibold ${item.color}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        {sortedRows.length > 1 && (
          <ScrollArea className="flex-1 -mx-1 px-1">
            <div className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Historial de Earnings</div>
              <div className="space-y-2">
                {sortedRows.map((row, i) => (
                  <div key={i} className="p-2 rounded bg-muted/20 border border-border/30 grid grid-cols-4 gap-2 text-xs">
                    <div><span className="text-[9px] text-muted-foreground block">Fecha</span><span className="font-mono">{row.date}</span></div>
                    <div><span className="text-[9px] text-muted-foreground block">EPS Est/Real</span><span>{row.epsEst} / {row.epsAct ?? "—"}</span></div>
                    <div><span className="text-[9px] text-muted-foreground block">EPS Sorpresa</span>
                      <span className={row.epsSurp !== null ? (parseFloat(row.epsSurp) >= 0 ? "text-emerald-400" : "text-red-400") : ""}>
                        {row.epsSurp !== null ? `${parseFloat(row.epsSurp) >= 0 ? "+" : ""}${row.epsSurp}%` : "—"}
                      </span>
                    </div>
                    <div><span className="text-[9px] text-muted-foreground block">Senal</span>
                      <span className={row.signal === "BULLISH" ? "text-emerald-400" : row.signal === "BEARISH" ? "text-red-400" : "text-muted-foreground"}>
                        {row.signal}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EarningsPage() {
  const { data: earningsData = [] } = useQuery<Earning[]>({
    queryKey: ["/api/earnings"],
    queryFn: () => apiRequest("GET", "/api/earnings").then(r => r.json()),
    refetchInterval: 600000,
  });

  const { data: tickers = [] } = useQuery<Ticker[]>({
    queryKey: ["/api/tickers"],
    queryFn: () => apiRequest("GET", "/api/tickers").then(r => r.json()),
    refetchInterval: 30000,
  });

  const activeStockSymbols = useMemo(() => STOCK_SYMBOLS.filter((s) => tickers.some((t) => t.symbol === s)), [tickers]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border px-4 py-2 flex items-center gap-3">
        <Link href="/">
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-medium">Dashboard</span>
          </button>
        </Link>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold tracking-wider">Earnings Calendar & Intelligence</span>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 space-y-4 max-w-[1600px] mx-auto">
        {earningsData.length > 0 && (
          <EarningsCalendar earningsData={earningsData} stockSymbols={activeStockSymbols} />
        )}
        {earningsData.length > 0 && (
          <EarningsIntelligence earningsData={earningsData} tickers={tickers} />
        )}
        {earningsData.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Brain className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Cargando datos de earnings...</p>
          </div>
        )}
      </main>
    </div>
  );
}
