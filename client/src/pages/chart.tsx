import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useRef, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from "lightweight-charts";
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  Zap,
  Shield,
  Target,
  Flame,
  BarChart3,
  Clock,
  Loader2,
  HelpCircle,
  ChevronRight,
  X,
  BookOpen,
  Crosshair,
  AlertTriangle,
  Sun,
  Moon,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ─────────────────────────────────────────────────────────────────────

type LevelsData = {
  symbol: string; name: string; price: number; change: number; changePercent: number;
  gammaFlip: number | null; maxPain: number | null; callWall: number | null; putWall: number | null;
  gammaRegime: string | null; atmIv: string | null; netGex: string | null;
  dayHigh: number | null; dayLow: number | null; open: number | null; volume: number | null;
};

type OHLCVBar = { time: number; open: number; high: number; low: number; close: number; volume: number };
type HistoryResponse = { symbol: string; interval: string; count: number; bars: OHLCVBar[] };
type TvExport = { data: string; updatedAt: string };

const TICKERS = [
  "SPY", "QQQ", "SPX", "TSLA", "NVDA", "AAPL", "MSFT", "AMD",
  "AMZN", "GOOG", "META", "NFLX", "PLTR", "AVGO", "MU", "ORCL",
  "DIA", "IWM", "SOXL", "USO", "SLV", "GLD",
];

const INTERVALS = [
  { value: "1min", label: "1m" },
  { value: "5min", label: "5m" },
  { value: "15min", label: "15m" },
  { value: "30min", label: "30m" },
  { value: "1hour", label: "1H" },
  { value: "4hour", label: "4H" },
  { value: "1day", label: "1D" },
  { value: "1week", label: "1W" },
];

const LEVEL_COLORS: Record<string, { color: string; label: string; shortLabel: string; icon: string }> = {
  gammaFlip: { color: "#FF9800", label: "Gamma Flip", shortLabel: "GF", icon: "⚡" },
  maxPain:   { color: "#E91E63", label: "Max Pain",   shortLabel: "MP", icon: "🎯" },
  callWall:  { color: "#00BCD4", label: "Call Wall",   shortLabel: "CW", icon: "🛡" },
  putWall:   { color: "#F44336", label: "Put Wall",    shortLabel: "PW", icon: "🔻" },
  emHigh:    { color: "#FFD700", label: "EM High",     shortLabel: "EM+", icon: "📈" },
  emLow:     { color: "#FFD700", label: "EM Low",      shortLabel: "EM-", icon: "📉" },
};

// ─── DTE Config ─────────────────────────────────────────────────────────────────
type DteMode = "0DTE" | "1DTE" | "2DTE" | "Weekly";
const DTE_CONFIG: Record<DteMode, { gammaFlipMult: number; maxPainMult: number; callWallMult: number; putWallMult: number; desc: string }> = {
  "0DTE":   { gammaFlipMult: 1.000, maxPainMult: 1.000, callWallMult: 0.996, putWallMult: 1.004, desc: "Expira hoy" },
  "1DTE":   { gammaFlipMult: 1.002, maxPainMult: 1.002, callWallMult: 0.998, putWallMult: 1.002, desc: "Expira mañana" },
  "2DTE":   { gammaFlipMult: 1.004, maxPainMult: 1.004, callWallMult: 1.001, putWallMult: 0.999, desc: "2 días" },
  "Weekly": { gammaFlipMult: 1.008, maxPainMult: 1.008, callWallMult: 1.005, putWallMult: 0.995, desc: "Viernes" },
};
const DTE_OPTIONS: DteMode[] = ["0DTE", "1DTE", "2DTE", "Weekly"];

function applyDteMult(val: number | null, mult: number): number | null {
  if (!val) return null;
  return Math.round(val * mult * 100) / 100;
}

// EDT offset: UTC-4 = -4 hours in seconds
const ET_OFFSET_SEC = -4 * 3600;
// RTH: 9:30 AM - 4:00 PM ET = 13:30 - 20:00 UTC (during EDT)
// We convert bar UTC time -> ET hour/minute, then check if within 9:30-16:00
function filterRTHBars(bars: OHLCVBar[]): OHLCVBar[] {
  return bars.filter((bar) => {
    // Convert UTC timestamp to ET by adding offset
    const etSeconds = bar.time + ET_OFFSET_SEC;
    // Get hour and minute in ET
    const d = new Date(etSeconds * 1000);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const totalMins = h * 60 + m;
    // RTH = 9:30 (570 min) to 16:00 (960 min)
    return totalMins >= 570 && totalMins < 960;
  });
}

// ─── Main Chart Component ──────────────────────────────────────────────────────

export default function ChartPage() {
  const [selectedTicker, setSelectedTicker] = useState("SPY");
  const [selectedInterval, setSelectedInterval] = useState("5min");
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [chartDte, setChartDte] = useState<DteMode>("0DTE");
  const [showEM, setShowEM] = useState(true);
  const [sessionType, setSessionType] = useState<"RTH" | "ETH">("RTH");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch all levels (polled every 15s)
  const { data: allLevels } = useQuery<Record<string, LevelsData>>({
    queryKey: ["/api/levels"],
    refetchInterval: 15000,
    staleTime: 0,
    refetchIntervalInBackground: true,
  });

  // Fetch historical OHLCV data
  const { data: historyData, isLoading: historyLoading, isFetching: historyFetching } = useQuery<HistoryResponse>({
    queryKey: ["/api/history", selectedTicker, selectedInterval],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/history/${selectedTicker}?interval=${selectedInterval}`);
      return res.json();
    },
    refetchInterval: selectedInterval === "1min" ? 30000 : selectedInterval === "5min" ? 60000 : 120000,
    staleTime: 0,
    refetchIntervalInBackground: true,
  });

  // Fetch TV export string
  const { data: tvExport } = useQuery<TvExport>({
    queryKey: ["/api/tv-export"],
    refetchInterval: 30000,
  });

  // Fetch exposure data for Expected Move
  const { data: allExposures = [] } = useQuery<any[]>({
    queryKey: ["/api/exposure"],
    queryFn: () => apiRequest("GET", "/api/exposure").then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 0,
    refetchIntervalInBackground: true,
  });
  const tickerExposure = allExposures.find((e: any) => e.symbol === selectedTicker);

  const levels = allLevels?.[selectedTicker];

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ─── Chart setup ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0A0E14" },
        textColor: "#6B7280",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.02)" },
        horzLines: { color: "rgba(255,255,255,0.02)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(88,166,255,0.3)", width: 1, labelBackgroundColor: "#1C2128" },
        horzLine: { color: "rgba(88,166,255,0.3)", width: 1, labelBackgroundColor: "#1C2128" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
      watermark: {
        text: selectedTicker,
        color: "rgba(255,255,255,0.03)",
        visible: true,
        fontSize: 72,
        fontFamily: "'JetBrains Mono', monospace",
        fontStyle: "bold",
        horzAlign: "center",
        vertAlign: "center",
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00C9A7",
      downColor: "#FF6B6B",
      borderUpColor: "#00C9A7",
      borderDownColor: "#FF6B6B",
      wickUpColor: "rgba(0,201,167,0.6)",
      wickDownColor: "rgba(255,107,107,0.6)",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#00C9A7",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update watermark when ticker changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        watermark: {
          text: selectedTicker,
          color: "rgba(255,255,255,0.03)",
          visible: true,
          fontSize: 72,
          fontFamily: "'JetBrains Mono', monospace",
          fontStyle: "bold",
          horzAlign: "center",
          vertAlign: "center",
        },
      });
    }
  }, [selectedTicker]);

  // ─── Filter bars based on session type (RTH vs ETH) ──────────────────────
  const displayBars = useMemo(() => {
    if (!historyData?.bars?.length) return [];
    if (sessionType === "RTH") {
      // Only filter for intraday intervals (not daily/weekly)
      const isIntraday = ["1min", "5min", "15min", "30min", "1hour", "4hour"].includes(selectedInterval);
      if (isIntraday) return filterRTHBars(historyData.bars);
    }
    return historyData.bars;
  }, [historyData?.bars, sessionType, selectedInterval]);

  // ─── Update chart with OHLCV data ───────────────────────────────────────────

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;

    // If no bars returned, clear the chart to avoid showing stale data from previous ticker
    if (!displayBars.length) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      for (const pl of priceLinesRef.current) {
        try { candleSeries.removePriceLine(pl); } catch {}
      }
      priceLinesRef.current = [];
      return;
    }

    // Offset timestamps from UTC to ET (UTC-4 EDT / UTC-5 EST)
    // lightweight-charts has no native timezone support, so we shift timestamps
    const ET_OFFSET = -4 * 3600; // EDT = UTC-4

    const candles: CandlestickData[] = displayBars.map((b) => ({
      time: (b.time + ET_OFFSET) as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    const volumes = displayBars.map((b) => ({
      time: (b.time + ET_OFFSET) as Time,
      value: b.volume,
      color: b.close >= b.open ? "rgba(0,201,167,0.15)" : "rgba(255,107,107,0.15)",
    }));

    candleSeries.setData(candles);
    volumeSeries.setData(volumes);

    // Force price scale to auto-fit the new data range
    // This is critical when switching tickers with very different price ranges
    const chart = chartRef.current;
    if (chart) {
      chart.priceScale('right').applyOptions({ autoScale: true });
    }

    // Remove old price lines
    for (const pl of priceLinesRef.current) {
      try { candleSeries.removePriceLine(pl); } catch {}
    }
    priceLinesRef.current = [];

    // Add key level lines (with DTE multipliers)
    if (levels) {
      const cfg = DTE_CONFIG[chartDte];
      const addLevel = (val: number | null, mult: number, key: string) => {
        const adjusted = applyDteMult(val, mult);
        if (!adjusted) return;
        const conf = LEVEL_COLORS[key];
        priceLinesRef.current.push(candleSeries.createPriceLine({
          price: adjusted,
          color: conf.color,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: conf.shortLabel + " " + adjusted.toFixed(2),
        }));
      };
      addLevel(levels.gammaFlip, cfg.gammaFlipMult, "gammaFlip");
      addLevel(levels.maxPain, cfg.maxPainMult, "maxPain");
      addLevel(levels.callWall, cfg.callWallMult, "callWall");
      addLevel(levels.putWall, cfg.putWallMult, "putWall");
    }

    // Add Expected Move lines (toggled by showEM state)
    if (showEM && tickerExposure) {
      const emH = tickerExposure.expectedMoveHigh;
      const emL = tickerExposure.expectedMoveLow;
      if (emH) {
        priceLinesRef.current.push(candleSeries.createPriceLine({
          price: emH,
          color: "#FFD700",
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: "EM+ " + emH.toFixed(2),
        }));
      }
      if (emL) {
        priceLinesRef.current.push(candleSeries.createPriceLine({
          price: emL,
          color: "#FFD700",
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: "EM- " + emL.toFixed(2),
        }));
      }
    }

    chartRef.current?.timeScale().fitContent();
  }, [displayBars, historyData, levels, chartDte, tickerExposure, showEM, sessionType]);

  // ─── Confluence logic ────────────────────────────────────────────────────────

  const confluence = (() => {
    if (!levels) return { bias: "NEUTRAL", score: 0, color: "#6B7280", details: [] as string[] };
    const p = levels.price;
    const gf = levels.gammaFlip;
    const mp = levels.maxPain;
    const cw = levels.callWall;
    const pw = levels.putWall;
    const pct = 0.003;
    const details: string[] = [];

    let bull = 0, bear = 0;
    if (gf && p > gf) { bull++; details.push("Sobre Gamma Flip"); }
    if (gf && p < gf) { bear++; details.push("Bajo Gamma Flip"); }
    if (mp && p > mp) { bull++; details.push("Sobre Max Pain"); }
    if (mp && p < mp) { bear++; details.push("Bajo Max Pain"); }
    if (pw && Math.abs(p - pw) / pw <= pct && gf && p > gf) { bull++; details.push("Cerca Put Wall (soporte)"); }
    if (cw && Math.abs(p - cw) / cw <= pct && gf && p < gf) { bear++; details.push("Cerca Call Wall (resistencia)"); }
    if (gf && Math.abs(p - gf) / gf <= pct && p > gf) { bull++; details.push("Cerca Gamma Flip (arriba)"); }
    if (gf && Math.abs(p - gf) / gf <= pct && p < gf) { bear++; details.push("Cerca Gamma Flip (abajo)"); }

    if (bull >= 3) return { bias: "ALCISTA", score: bull, color: "#00C9A7", details };
    if (bear >= 3) return { bias: "BAJISTA", score: bear, color: "#FF6B6B", details };
    if (gf && p > gf) return { bias: "Neutral+", score: bull, color: "#4CAF50", details };
    return { bias: "Neutral-", score: bear, color: "#FF5722", details };
  })();

  // ─── Copy TV export ──────────────────────────────────────────────────────────

  const handleCopyExport = async () => {
    if (!tvExport?.data) return;
    try {
      await navigator.clipboard.writeText(tvExport.data);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = tvExport.data;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const lastBar = displayBars.length > 0 ? displayBars[displayBars.length - 1] : undefined;
  const prevBar = displayBars.length > 1 ? displayBars[displayBars.length - 2] : undefined;
  const priceChange = lastBar && prevBar ? lastBar.close - prevBar.close : 0;
  const isUp = priceChange >= 0;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-[#C9D1D9] font-mono flex flex-col select-none">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-[rgba(255,255,255,0.06)] bg-[#0D1117]">
        <Link href="/">
          <button className="flex items-center gap-1 text-[#6B7280] hover:text-white transition-colors text-[11px] px-1.5 py-1 rounded hover:bg-white/5" data-testid="back-to-dashboard">
            <ArrowLeft size={12} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </Link>

        <div className="w-px h-3.5 bg-[rgba(255,255,255,0.08)]" />

        {/* Ticker selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-md hover:border-[rgba(88,166,255,0.4)] transition-all"
            data-testid="ticker-selector"
          >
            <span className="text-sm font-bold text-white tracking-wide">{selectedTicker}</span>
            {levels && (
              <>
                <span className="text-[12px] font-semibold text-white">${levels.price.toFixed(2)}</span>
                <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${levels.changePercent >= 0 ? "bg-[#00C9A7]/10 text-[#00C9A7]" : "bg-[#FF6B6B]/10 text-[#FF6B6B]"}`}>
                  {levels.changePercent >= 0 ? "+" : ""}{levels.changePercent.toFixed(2)}%
                </span>
              </>
            )}
            <ChevronDown size={10} className="text-[#6B7280] ml-0.5" />
          </button>

          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-[#131820] border border-[rgba(255,255,255,0.1)] rounded-lg shadow-2xl shadow-black/60 max-h-80 overflow-y-auto w-56 backdrop-blur-sm">
              {TICKERS.map((t) => {
                const tData = allLevels?.[t];
                return (
                  <button
                    key={t}
                    onClick={() => { setSelectedTicker(t); setShowDropdown(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                      t === selectedTicker ? "bg-[rgba(88,166,255,0.08)] text-[#58A6FF]" : "text-[#C9D1D9] hover:bg-[rgba(255,255,255,0.04)]"
                    }`}
                    data-testid={`ticker-option-${t}`}
                  >
                    <span className="font-bold">{t}</span>
                    {tData && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#8B949E]">${tData.price.toFixed(2)}</span>
                        <span className={`text-[9px] font-bold ${tData.changePercent >= 0 ? "text-[#00C9A7]" : "text-[#FF6B6B]"}`}>
                          {tData.changePercent >= 0 ? "+" : ""}{tData.changePercent.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="w-px h-3.5 bg-[rgba(255,255,255,0.08)]" />

        {/* Timeframe selector */}
        <div className="flex items-center bg-[rgba(255,255,255,0.02)] rounded-md p-0.5" data-testid="interval-selector">
          {INTERVALS.map((itv) => (
            <button
              key={itv.value}
              onClick={() => setSelectedInterval(itv.value)}
              className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                selectedInterval === itv.value
                  ? "bg-[#58A6FF]/15 text-[#58A6FF] shadow-sm shadow-[#58A6FF]/10"
                  : "text-[#6B7280] hover:text-white"
              }`}
              data-testid={`interval-${itv.value}`}
            >
              {itv.label}
            </button>
          ))}
        </div>

        <div className="w-px h-3.5 bg-[rgba(255,255,255,0.08)]" />

        {/* Confluence badge */}
        <Badge
          className="text-[9px] px-1.5 py-0 font-bold border-0 gap-1"
          style={{ backgroundColor: confluence.color + "18", color: confluence.color }}
          data-testid="confluence-badge"
        >
          <Zap size={8} />
          {confluence.bias} {confluence.score}/4
        </Badge>

        <div className="flex-1" />

        {/* Loading indicator */}
        {(historyLoading || historyFetching) && (
          <div className="flex items-center gap-1 text-[9px] text-[#58A6FF]/70">
            <Loader2 size={10} className="animate-spin" />
          </div>
        )}

        {/* Bar count */}
        {historyData && (
          <span className="text-[9px] text-[#3B4252]">
            {displayBars.length} barras
          </span>
        )}

        <div className="w-px h-3.5 bg-[rgba(255,255,255,0.08)]" />

        {/* Legend toggle */}
        <button
          onClick={() => setShowLegend(!showLegend)}
          className={`flex items-center gap-1 px-1.5 py-1 text-[10px] rounded transition-all ${
            showLegend ? "bg-[#58A6FF]/15 text-[#58A6FF]" : "text-[#6B7280] hover:text-white hover:bg-white/5"
          }`}
          data-testid="toggle-legend"
          title="Leyenda y guia"
        >
          <BookOpen size={11} />
          <span className="hidden sm:inline">Guia</span>
        </button>

        {/* EM toggle */}
        <button
          onClick={() => setShowEM(!showEM)}
          className={`flex items-center gap-1 px-1.5 py-1 text-[10px] rounded transition-all ${
            showEM ? "bg-[#FFD700]/15 text-[#FFD700]" : "text-[#6B7280] hover:text-white hover:bg-white/5"
          }`}
          data-testid="toggle-em"
          title="Mostrar/ocultar Expected Move lines"
        >
          <Target size={11} />
          <span className="hidden sm:inline">EM</span>
        </button>

        <div className="w-px h-3.5 bg-[rgba(255,255,255,0.08)]" />

        {/* RTH / ETH toggle */}
        <div className="flex items-center bg-[rgba(255,255,255,0.02)] rounded-md p-0.5 border border-[rgba(255,255,255,0.06)]" data-testid="session-toggle">
          <button
            onClick={() => setSessionType("RTH")}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
              sessionType === "RTH"
                ? "bg-[#00C9A7]/15 text-[#00C9A7] shadow-sm shadow-[#00C9A7]/10"
                : "text-[#6B7280] hover:text-white"
            }`}
            data-testid="session-rth"
            title="Regular Trading Hours (9:30 AM - 4:00 PM ET)"
          >
            <Sun size={9} />
            RTH
          </button>
          <button
            onClick={() => setSessionType("ETH")}
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
              sessionType === "ETH"
                ? "bg-[#A855F7]/15 text-[#A855F7] shadow-sm shadow-[#A855F7]/10"
                : "text-[#6B7280] hover:text-white"
            }`}
            data-testid="session-eth"
            title="Extended Trading Hours (Pre-market + After-hours)"
          >
            <Moon size={9} />
            ETH
          </button>
        </div>

        {/* Copy TradingView export */}
        <button
          onClick={handleCopyExport}
          className="flex items-center gap-1 px-1.5 py-1 text-[10px] rounded text-[#6B7280] hover:text-white hover:bg-white/5 transition-all"
          data-testid="copy-tv-export"
          title="Copiar datos para Pine Script"
        >
          {copied ? <Check size={10} className="text-[#00C9A7]" /> : <Copy size={10} />}
          {copied ? "Copiado" : "Pine"}
        </button>

        {/* Auto-refresh */}
        <div className="flex items-center gap-1 text-[8px] text-[#2D333B]">
          <RefreshCw size={8} className="animate-spin" style={{ animationDuration: "4s" }} />
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Chart area */}
        <div className="flex-1 flex flex-col relative">
          <div className="relative flex-1">
            <div ref={chartContainerRef} className="absolute inset-0" data-testid="chart-container" />
            {/* UTC-4 session label */}
            <div className="absolute bottom-[1px] left-2 z-10 flex items-center gap-1.5 text-[10px] font-mono pointer-events-none select-none">
              <span className="text-[#4B5563]">UTC-4</span>
              <span className={sessionType === "RTH" ? "text-[#00C9A7]/60" : "text-[#A855F7]/60"}>{sessionType}</span>
              {sessionType === "RTH" && <span className="text-[#3B4252]">9:30a-4:00p</span>}
            </div>
          </div>

          {/* ── Floating Options Confluence Scanner ── */}
          {allLevels && (
            <ConfluenceScanner
              allLevels={allLevels}
              selectedTicker={selectedTicker}
              onSelectTicker={(t) => setSelectedTicker(t)}
              dte={chartDte}
              onDteChange={setChartDte}
            />
          )}

          {/* Loading overlay */}
          {historyLoading && !historyData && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0A0E14]/90 z-10 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Loader2 size={28} className="animate-spin text-[#58A6FF]" />
                  <div className="absolute inset-0 animate-ping">
                    <Loader2 size={28} className="text-[#58A6FF]/20" />
                  </div>
                </div>
                <span className="text-xs text-[#6B7280]">Cargando {selectedTicker} {INTERVALS.find(i => i.value === selectedInterval)?.label}...</span>
              </div>
            </div>
          )}

          {/* Floating OHLCV bar at bottom-left */}
          {lastBar && (
            <div className="absolute bottom-2 left-2 flex items-center gap-2 text-[9px] font-mono z-5 bg-[#0A0E14]/60 backdrop-blur-sm rounded px-2 py-1 border border-[rgba(255,255,255,0.04)]">
              <span className="text-[#6B7280]">O</span><span className="text-white">{lastBar.open.toFixed(2)}</span>
              <span className="text-[#6B7280]">H</span><span className="text-[#00C9A7]">{lastBar.high.toFixed(2)}</span>
              <span className="text-[#6B7280]">L</span><span className="text-[#FF6B6B]">{lastBar.low.toFixed(2)}</span>
              <span className="text-[#6B7280]">C</span><span className={isUp ? "text-[#00C9A7]" : "text-[#FF6B6B]"}>{lastBar.close.toFixed(2)}</span>
              <span className="text-[#6B7280]">V</span><span className="text-[#8B949E]">{(lastBar.volume / 1e6).toFixed(1)}M</span>
            </div>
          )}
        </div>

        {/* ── Right panel — Key Levels ── */}
        <div className="w-56 border-l border-[rgba(255,255,255,0.06)] bg-[#0D1117] flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity size={10} className="text-[#58A6FF]" />
                <span className="text-[10px] font-bold text-white">KEY LEVELS</span>
              </div>
              <span className="text-[10px] font-bold text-[#58A6FF]">{selectedTicker}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1 h-1 rounded-full bg-[#00C9A7] animate-pulse" />
              <span className="text-[8px] text-[#3B4252]">En vivo — actualizado cada 15s</span>
            </div>
          </div>

          {/* Level cards */}
          <div className="p-1.5 space-y-1">
            {Object.entries(LEVEL_COLORS).map(([key, conf]) => {
              const val = key === "emHigh" ? (tickerExposure?.expectedMoveHigh ?? null)
                : key === "emLow" ? (tickerExposure?.expectedMoveLow ?? null)
                : levels?.[key as keyof typeof levels] as number | null;
              const distance = val && levels?.price ? ((levels.price - val) / val * 100) : null;
              const isNear = distance != null && Math.abs(distance) < 0.5;
              return (
                <div
                  key={key}
                  className={`rounded-md p-2 border transition-all ${
                    isNear
                      ? "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)]"
                      : "border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.01)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: conf.color }} />
                      <span className="text-[9px] text-[#6B7280]">{conf.label}</span>
                    </div>
                    <span className="text-[12px] font-bold tabular-nums" style={{ color: conf.color }}>
                      {val ? `$${val.toFixed(2)}` : "—"}
                    </span>
                  </div>
                  {distance != null && (
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[7px] text-[#3B4252]">Distancia</span>
                      <span className={`text-[8px] font-bold tabular-nums ${
                        distance >= 0 ? "text-[#00C9A7]" : "text-[#FF6B6B]"
                      }`}>
                        {distance >= 0 ? "+" : ""}{distance.toFixed(2)}%
                        {isNear && <span className="ml-0.5 text-[#FF9800]">●</span>}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-2"><div className="border-t border-[rgba(255,255,255,0.04)]" /></div>

          {/* Market data */}
          <div className="p-2 space-y-0.5">
            <div className="text-[8px] text-[#3B4252] font-bold uppercase tracking-widest mb-1">Market Data</div>
            <DataRow icon={<BarChart3 size={8} />} label="Precio" value={levels?.price ? `$${levels.price.toFixed(2)}` : "—"} bold />
            <DataRow
              icon={levels?.changePercent && levels.changePercent >= 0 ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
              label="Cambio"
              value={levels?.changePercent != null ? `${levels.changePercent >= 0 ? "+" : ""}${levels.changePercent.toFixed(2)}%` : "—"}
              color={levels?.changePercent != null ? (levels.changePercent >= 0 ? "#00C9A7" : "#FF6B6B") : undefined}
            />
            <DataRow icon={<Target size={8} />} label="Rango" value={levels ? `${levels.dayLow?.toFixed(0) ?? "—"} — ${levels.dayHigh?.toFixed(0) ?? "—"}` : "—"} />
            <DataRow icon={<Shield size={8} />} label="Gamma" value={levels?.gammaRegime ?? "—"} color={levels?.gammaRegime?.includes("Positive") ? "#00C9A7" : levels?.gammaRegime?.includes("Negative") ? "#FF6B6B" : undefined} />
            <DataRow icon={<Flame size={8} />} label="ATM IV" value={levels?.atmIv ?? "—"} />
            <DataRow icon={<Zap size={8} />} label="Net GEX" value={levels?.netGex ?? "—"} />
          </div>

          <div className="px-2"><div className="border-t border-[rgba(255,255,255,0.04)]" /></div>

          {/* Confluence */}
          <div className="p-2">
            <div className="text-[8px] text-[#3B4252] font-bold uppercase tracking-widest mb-1">Confluencia</div>
            <div className="rounded-md p-2 border" style={{ borderColor: confluence.color + "30", backgroundColor: confluence.color + "08" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold" style={{ color: confluence.color }}>{confluence.bias}</span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: confluence.color }}>{confluence.score}/4</span>
              </div>
              {/* Progress bar */}
              <div className="flex gap-0.5 mb-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex-1 h-1 rounded-full transition-all"
                    style={{ backgroundColor: i <= confluence.score ? confluence.color : "rgba(255,255,255,0.05)" }}
                  />
                ))}
              </div>
              {/* Detail checks */}
              <div className="space-y-0.5">
                {confluence.details.map((d, i) => (
                  <div key={i} className="text-[8px] text-[#6B7280] flex items-center gap-1">
                    <span style={{ color: confluence.color }}>●</span> {d}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-auto px-2 py-1.5 border-t border-[rgba(255,255,255,0.04)]">
            <div className="text-[7px] text-[#2D333B] flex items-center gap-1">
              <Clock size={7} />
              Pine Script: Boton "Pine" → pegar en text_area()
            </div>
          </div>
        </div>

                {/* ── Legend / Guide overlay ── */}
        {showLegend && (
          <div className="absolute inset-0 z-20 flex" data-testid="legend-overlay">
            {/* Backdrop */}
            <div className="flex-1 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowLegend(false)} />
            {/* Panel */}
            <div className="w-[340px] bg-[#0D1117] border-l border-[rgba(255,255,255,0.08)] overflow-y-auto shadow-2xl shadow-black/50 animate-in slide-in-from-right">
              {/* Legend header */}
              <div className="sticky top-0 z-10 bg-[#0D1117] px-4 py-3 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-[#58A6FF]" />
                  <span className="text-[13px] font-bold text-white">Guia del Chart</span>
                </div>
                <button onClick={() => setShowLegend(false)} className="text-[#6B7280] hover:text-white transition-colors p-1 rounded hover:bg-white/5" data-testid="close-legend">
                  <X size={14} />
                </button>
              </div>

              <div className="p-4 space-y-5">
                {/* Key Levels section */}
                <LegendSection
                  title="Niveles Clave"
                  icon={<Crosshair size={12} />}
                  items={[
                    { color: "#FF9800", label: "Gamma Flip (GF)", desc: "Punto de equilibrio donde los market makers cambian de cobertura. Sobre GF = dealers compran dips (estabilidad). Bajo GF = dealers venden rallies (volatilidad)." },
                    { color: "#E91E63", label: "Max Pain (MP)", desc: "Precio donde el mayor numero de contratos de opciones expiran sin valor. El precio tiende a gravitar hacia este nivel al cierre de cada semana." },
                    { color: "#00BCD4", label: "Call Wall (CW)", desc: "Strike con mayor open interest en calls. Actua como resistencia — los dealers venden acciones aqui para cubrirse. Precio rara vez supera este nivel sin catalizador." },
                    { color: "#F44336", label: "Put Wall (PW)", desc: "Strike con mayor open interest en puts. Actua como soporte — los dealers compran acciones aqui para cubrirse. Precio rara vez cae por debajo sin catalizador." },
                    { color: "#FFD700", label: "Expected Move (EM+/EM-)", desc: "Rango esperado del precio para el dia basado en la volatilidad implicita ATM. EM+ = limite superior, EM- = limite inferior. El precio tiene ~68% probabilidad de quedarse dentro de este rango." },
                  ]}
                />

                {/* Expected Move info panel */}
                {tickerExposure && (
                  <div className="bg-[rgba(255,215,0,0.05)] border border-[rgba(255,215,0,0.15)] rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Target size={11} className="text-[#FFD700]" />
                      <span className="text-[11px] font-bold text-[#FFD700]">Expected Move — {selectedTicker}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div><span className="text-[hsl(var(--muted-foreground))]">EM High:</span> <span className="text-emerald-400 font-mono font-bold">${tickerExposure.expectedMoveHigh.toFixed(2)}</span></div>
                      <div><span className="text-[hsl(var(--muted-foreground))]">EM Low:</span> <span className="text-rose-400 font-mono font-bold">${tickerExposure.expectedMoveLow.toFixed(2)}</span></div>
                      <div><span className="text-[hsl(var(--muted-foreground))]">EM $:</span> <span className="text-amber-400 font-mono font-bold">{"\u00B1"}${tickerExposure.expectedMove.toFixed(2)}</span></div>
                      <div><span className="text-[hsl(var(--muted-foreground))]">EM %:</span> <span className="text-amber-400 font-mono font-bold">{"\u00B1"}{tickerExposure.expectedMovePct.toFixed(2)}%</span></div>
                      <div><span className="text-[hsl(var(--muted-foreground))]">ATM IV:</span> <span className="text-[hsl(var(--foreground))] font-mono">{tickerExposure.atmIv.toFixed(1)}%</span></div>
                      <div><span className="text-[hsl(var(--muted-foreground))]">Price:</span> <span className="text-[hsl(var(--foreground))] font-mono">${tickerExposure.price.toFixed(2)}</span></div>
                    </div>
                  </div>
                )}

                {/* Confluence section */}
                <LegendSection
                  title="Sistema de Confluencia"
                  icon={<Zap size={12} />}
                  items={[
                    { color: "#00C9A7", label: "ALCISTA (3-4/4)", desc: "Multiples señales bullish alineadas: precio sobre GF, sobre MP, cerca de soporte en PW, y/o en zona GF al alza. Alta probabilidad de movimiento alcista." },
                    { color: "#FF6B6B", label: "BAJISTA (3-4/4)", desc: "Multiples señales bearish alineadas: precio bajo GF, bajo MP, cerca de resistencia en CW, y/o en zona GF a la baja. Alta probabilidad de movimiento bajista." },
                    { color: "#4CAF50", label: "Neutral+", desc: "Precio sobre GF pero sin confluencia completa. Sesgo alcista leve — dealers compran dips." },
                    { color: "#FF5722", label: "Neutral-", desc: "Precio bajo GF sin confluencia completa. Sesgo bajista leve — dealers venden rallies." },
                  ]}
                />

                {/* Gamma Regime */}
                <LegendSection
                  title="Regimen Gamma"
                  icon={<Shield size={12} />}
                  items={[
                    { color: "#00C9A7", label: "Positive Gamma", desc: "Dealers tienen gamma positivo — compran cuando baja, venden cuando sube. Esto REDUCE volatilidad y crea movimientos lentos y estables. Ideal para vender premium." },
                    { color: "#FF6B6B", label: "Negative Gamma", desc: "Dealers tienen gamma negativo — venden cuando baja, compran cuando sube. Esto AMPLIFICA volatilidad y crea movimientos rapidos y explosivos. Ideal para comprar opciones 0DTE." },
                  ]}
                />

                {/* Chart Indicators */}
                <LegendSection
                  title="Indicadores del Chart"
                  icon={<BarChart3 size={12} />}
                  items={[
                    { color: "#00C9A7", label: "Velas Verdes / Volumen Verde", desc: "Cierre mayor que apertura — presion compradora." },
                    { color: "#FF6B6B", label: "Velas Rojas / Volumen Rojo", desc: "Cierre menor que apertura — presion vendedora." },
                    { color: "#58A6FF", label: "Lineas Punteadas", desc: "Niveles clave horizontales (GF, MP, CW, PW) con etiqueta y precio en el eje Y. Cada linea se identifica por su color." },
                    { color: "#6B7280", label: "Barra OHLCV", desc: "Open-High-Low-Close-Volume de la ultima vela, mostrado en la esquina inferior izquierda del chart." },
                  ]}
                />

                {/* How to use with TradingView */}
                <LegendSection
                  title="Uso con TradingView"
                  icon={<Copy size={12} />}
                  items={[
                    { color: "#58A6FF", label: "Boton 'Pine'", desc: "Copia un string codificado con los niveles de TODOS los tickers. En TradingView, pega este string en el campo 'Bulk Data' del indicador OptionFlow Key Levels v3." },
                    { color: "#FF9800", label: "Auto-deteccion", desc: "El indicador detecta automaticamente que ticker estas viendo en TradingView y muestra solo esos niveles. No necesitas configurar nada mas." },
                  ]}
                />

                {/* Tips */}
                <div className="bg-[rgba(88,166,255,0.05)] border border-[rgba(88,166,255,0.15)] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={11} className="text-[#FF9800]" />
                    <span className="text-[10px] font-bold text-[#FF9800]">Tips para 0DTE</span>
                  </div>
                  <div className="space-y-1.5 text-[9px] text-[#8B949E] leading-relaxed">
                    <p>● Usa temporalidad <strong className="text-white">1m o 5m</strong> para entradas precisas en 0DTE</p>
                    <p>● Cuando confluencia sea <strong className="text-[#00C9A7]">ALCISTA 3+/4</strong>, busca CALL sweeps</p>
                    <p>● Cuando confluencia sea <strong className="text-[#FF6B6B]">BAJISTA 3+/4</strong>, busca PUT sweeps</p>
                    <p>● El <strong className="text-[#FF9800]">Gamma Flip</strong> es el nivel MAS importante — define el regimen del mercado</p>
                    <p>● En <strong className="text-[#00C9A7]">+Gamma</strong> el mercado es estable; en <strong className="text-[#FF6B6B]">-Gamma</strong> es explosivo</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Confluence Scanner Table ───────────────────────────────────────────────────

const ALL_AVAILABLE_TICKERS = ["SPY", "QQQ", "SPX", "TSLA", "NVDA", "AAPL", "MSFT", "AMD", "AMZN", "GOOG", "META", "NFLX", "PLTR", "AVGO", "MU", "ORCL", "DIA", "IWM", "SOXL", "USO", "SLV", "GLD"];
const DEFAULT_SCANNER_TICKERS = [...ALL_AVAILABLE_TICKERS];

function computeConfluence(l: LevelsData, dteCfg: typeof DTE_CONFIG["0DTE"]) {
  const p = l.price;
  const gf = applyDteMult(l.gammaFlip, dteCfg.gammaFlipMult);
  const mp = applyDteMult(l.maxPain, dteCfg.maxPainMult);
  const cw = applyDteMult(l.callWall, dteCfg.callWallMult);
  const pw = applyDteMult(l.putWall, dteCfg.putWallMult);
  const pct = 0.003;

  let bull = 0, bear = 0;
  if (gf && p > gf) bull++;
  if (gf && p < gf) bear++;
  if (mp && p > mp) bull++;
  if (mp && p < mp) bear++;
  if (pw && Math.abs(p - pw) / pw <= pct && gf && p > gf) bull++;
  if (cw && Math.abs(p - cw) / cw <= pct && gf && p < gf) bear++;
  if (gf && Math.abs(p - gf) / gf <= pct && p > gf) bull++;
  if (gf && Math.abs(p - gf) / gf <= pct && p < gf) bear++;

  if (bull >= 3) return { bias: "ALCISTA" as const, score: bull, color: "#00C9A7" };
  if (bear >= 3) return { bias: "BAJISTA" as const, score: bear, color: "#FF6B6B" };
  if (gf && p > gf) return { bias: "Neutral+" as const, score: bull, color: "#4CAF50" };
  return { bias: "Neutral-" as const, score: bear, color: "#FF5722" };
}

function ConfluenceScanner({ allLevels, selectedTicker, onSelectTicker, dte, onDteChange }: {
  allLevels: Record<string, LevelsData>;
  selectedTicker: string;
  onSelectTicker: (t: string) => void;
  dte: DteMode;
  onDteChange: (d: DteMode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [scannerTickers, setScannerTickers] = useState<string[]>(DEFAULT_SCANNER_TICKERS);
  const [showTickerPicker, setShowTickerPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowTickerPicker(false);
      }
    }
    if (showTickerPicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTickerPicker]);

  const dteCfg = DTE_CONFIG[dte];

  const rows = useMemo(() => {
    return scannerTickers
      .filter((t) => allLevels[t])
      .map((t) => {
        const l = allLevels[t];
        const conf = computeConfluence(l, dteCfg);
        const gf = applyDteMult(l.gammaFlip, dteCfg.gammaFlipMult);
        const gfDist = gf ? ((l.price - gf) / gf * 100) : null;
        return {
          symbol: t, data: l, confluence: conf, gfDist,
          adjCW: applyDteMult(l.callWall, dteCfg.callWallMult),
          adjPW: applyDteMult(l.putWall, dteCfg.putWallMult),
        };
      })
      .sort((a, b) => b.confluence.score - a.confluence.score);
  }, [allLevels, scannerTickers, dteCfg]);

  const removeTicker = (t: string) => {
    setScannerTickers((prev) => prev.filter((x) => x !== t));
  };

  const addTicker = (t: string) => {
    if (!scannerTickers.includes(t)) {
      setScannerTickers((prev) => [...prev, t]);
    }
    setShowTickerPicker(false);
  };

  const availableToAdd = ALL_AVAILABLE_TICKERS.filter((t) => !scannerTickers.includes(t));

  if (rows.length === 0 && scannerTickers.length === 0) return null;

  return (
    <div
      className="absolute bottom-2 right-[232px] z-10 rounded-lg border border-[rgba(255,255,255,0.08)] overflow-visible"
      style={{
        background: 'rgba(13,17,23,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        maxWidth: expanded ? '660px' : '180px',
        transition: 'max-width 0.25s ease',
      }}
      data-testid="confluence-scanner"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[rgba(255,255,255,0.06)]">
        <div
          className="flex items-center gap-2 cursor-pointer select-none hover:bg-[rgba(255,255,255,0.02)] rounded px-1 -mx-1 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="relative">
            <Zap size={10} className="text-[#58A6FF]" />
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#00C9A7] animate-pulse" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#8B949E]">Confluence</span>
          <ChevronDown size={10} className={`text-[#6B7280] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>

        {/* DTE Selector + Ticker Picker */}
        {expanded && (
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-[#3B4252] mr-1">DTE:</span>
            <div className="flex items-center gap-0.5 p-0.5 rounded bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
              {DTE_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => onDteChange(d)}
                  className={`text-[8px] font-bold px-2 py-0.5 rounded transition-all ${
                    dte === d
                      ? 'bg-[#58A6FF] text-black shadow-sm'
                      : 'text-[#6B7280] hover:text-white'
                  }`}
                  data-testid={`dte-btn-${d}`}
                >
                  {d}
                </button>
              ))}
            </div>
            {/* Add ticker button */}
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowTickerPicker(!showTickerPicker)}
                className="ml-1 w-5 h-5 rounded flex items-center justify-center text-[#6B7280] hover:text-[#58A6FF] hover:bg-[rgba(88,166,255,0.1)] transition-all border border-[rgba(255,255,255,0.06)]"
                title="Agregar/quitar tickers"
                data-testid="scanner-add-ticker"
              >
                <span className="text-[11px] font-bold leading-none">+</span>
              </button>
              {/* Ticker picker dropdown */}
              {showTickerPicker && (
                <div className="absolute bottom-full right-0 mb-1 w-44 max-h-52 overflow-y-auto rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#0D1117] shadow-xl z-50">
                  <div className="px-2 py-1.5 border-b border-[rgba(255,255,255,0.06)]">
                    <span className="text-[8px] font-bold uppercase tracking-wider text-[#8B949E]">Agregar ticker</span>
                  </div>
                  <div className="p-1">
                    {availableToAdd.length === 0 ? (
                      <div className="text-[9px] text-[#4B5563] text-center py-2">Todos agregados</div>
                    ) : (
                      availableToAdd.map((t) => (
                        <button
                          key={t}
                          onClick={() => addTicker(t)}
                          className="w-full text-left px-2 py-1 text-[9px] font-mono text-[#C9D1D9] hover:bg-[rgba(88,166,255,0.1)] rounded transition-colors"
                          data-testid={`add-ticker-${t}`}
                        >
                          {t}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {expanded && (
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 280 }}>
          <table className="w-full text-[9px] font-mono" data-testid="confluence-table">
            <thead className="sticky top-0 z-10" style={{ background: 'rgba(13,17,23,0.98)' }}>
              <tr className="text-[#4B5563] border-b border-[rgba(255,255,255,0.04)]">
                <th className="text-left font-bold uppercase tracking-wider px-2.5 py-1.5">Ticker</th>
                <th className="text-right font-bold uppercase tracking-wider px-2 py-1.5">Price</th>
                <th className="text-right font-bold uppercase tracking-wider px-2 py-1.5">%Chg</th>
                <th className="text-center font-bold uppercase tracking-wider px-2 py-1.5">Bias</th>
                <th className="text-center font-bold uppercase tracking-wider px-2 py-1.5">Score</th>
                <th className="text-center font-bold uppercase tracking-wider px-2 py-1.5">Gamma</th>
                <th className="text-right font-bold uppercase tracking-wider px-2 py-1.5">GF Dist</th>
                <th className="text-right font-bold uppercase tracking-wider px-2 py-1.5">CW</th>
                <th className="text-right font-bold uppercase tracking-wider px-2 py-1.5">PW</th>
                <th className="w-4"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = row.symbol === selectedTicker;
                const chgPct = row.data.changePercent;
                const gammaLabel = row.data.gammaRegime?.includes('Positive') ? '+GEX' : row.data.gammaRegime?.includes('Negative') ? '-GEX' : 'N/A';
                const gammaColor = gammaLabel === '+GEX' ? '#00C9A7' : gammaLabel === '-GEX' ? '#FF6B6B' : '#4B5563';
                return (
                  <tr
                    key={row.symbol}
                    className={`border-b border-[rgba(255,255,255,0.03)] cursor-pointer transition-colors group/row ${
                      isSelected
                        ? 'bg-[rgba(88,166,255,0.08)]'
                        : 'hover:bg-[rgba(255,255,255,0.03)]'
                    }`}
                    onClick={() => onSelectTicker(row.symbol)}
                    data-testid={`scanner-row-${row.symbol}`}
                  >
                    <td className="px-2.5 py-1.5">
                      <span className={`font-bold ${isSelected ? 'text-[#58A6FF]' : 'text-white'}`}>{row.symbol}</span>
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <span className="text-[#C9D1D9] tabular-nums">${row.data.price.toFixed(2)}</span>
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <span className={`tabular-nums font-semibold ${chgPct >= 0 ? 'text-[#00C9A7]' : 'text-[#FF6B6B]'}`}>
                        {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="text-center px-2 py-1.5">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold"
                        style={{ backgroundColor: row.confluence.color + '18', color: row.confluence.color }}
                      >
                        {row.confluence.bias === 'ALCISTA' ? '\u25b2 Alcista' : row.confluence.bias === 'BAJISTA' ? '\u25bc Bajista' : row.confluence.bias === 'Neutral+' ? '\u2014 Neutral+' : '\u2014 Neutral-'}
                      </span>
                    </td>
                    <td className="text-center px-2 py-1.5">
                      <div className="flex items-center justify-center gap-0.5">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: i <= row.confluence.score ? row.confluence.color : 'rgba(255,255,255,0.08)' }}
                          />
                        ))}
                        <span className="text-[8px] ml-1 tabular-nums" style={{ color: row.confluence.color }}>{row.confluence.score}/4</span>
                      </div>
                    </td>
                    <td className="text-center px-2 py-1.5">
                      <span className="text-[8px] font-bold" style={{ color: gammaColor }}>{gammaLabel}</span>
                    </td>
                    <td className="text-right px-2 py-1.5">
                      {row.gfDist != null ? (
                        <span className={`tabular-nums font-medium ${row.gfDist >= 0 ? 'text-[#00C9A7]' : 'text-[#FF6B6B]'}`}>
                          {row.gfDist >= 0 ? '+' : ''}{row.gfDist.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-[#3B4252]">\u2014</span>
                      )}
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <span className="text-[#00BCD4] tabular-nums">{row.adjCW ? `$${row.adjCW.toFixed(0)}` : '\u2014'}</span>
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <span className="text-[#F44336] tabular-nums">{row.adjPW ? `$${row.adjPW.toFixed(0)}` : '\u2014'}</span>
                    </td>
                    {/* Remove ticker button */}
                    <td className="px-0.5 py-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); removeTicker(row.symbol); }}
                        className="opacity-0 group-hover/row:opacity-100 w-4 h-4 flex items-center justify-center rounded text-[#6B7280] hover:text-[#FF6B6B] hover:bg-[rgba(255,107,107,0.1)] transition-all"
                        title={`Quitar ${row.symbol}`}
                        data-testid={`remove-ticker-${row.symbol}`}
                      >
                        <X size={8} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-2.5 py-1 border-t border-[rgba(255,255,255,0.04)] flex items-center justify-between sticky bottom-0" style={{ background: 'rgba(13,17,23,0.98)' }}>
            <span className="text-[8px] text-[#3B4252]">{rows.length} activos {" \u00b7 "} {dte}</span>
            <span className="text-[8px] text-[#3B4252]">Niveles ajustados por DTE</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────────

function DataRow({ icon, label, value, color, bold }: { icon: React.ReactNode; label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-center gap-1 text-[#4B5563]">
        {icon}
        <span className="text-[8px]">{label}</span>
      </div>
      <span className={`text-[9px] tabular-nums ${bold ? "font-bold" : "font-medium"}`} style={{ color: color || "#C9D1D9" }}>{value}</span>
    </div>
  );
}

function LegendSection({ title, icon, items }: { title: string; icon: React.ReactNode; items: { color: string; label: string; desc: string }[] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[#58A6FF]">{icon}</span>
        <span className="text-[11px] font-bold text-white">{title}</span>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <div className="w-1 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: item.color, minHeight: "16px" }} />
            <div>
              <span className="text-[9px] font-bold" style={{ color: item.color }}>{item.label}</span>
              <p className="text-[8px] text-[#6B7280] leading-relaxed mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
