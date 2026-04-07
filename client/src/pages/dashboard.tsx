import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  TrendingUp, TrendingDown, Minus, Activity, Zap, Shield, Target,
  ArrowUpCircle, ArrowDownCircle, Radio, Clock, BarChart3, ChevronRight,
  Search, Calendar, Globe, RefreshCw, Filter, X, Twitter, ExternalLink,
  Repeat2, FileText, Eye, Layers, Brain, AlertTriangle, Flame, Newspaper,
  TrendingUp as TrendUp, ChevronDown, ChevronUp, BarChart2, Cpu, HelpCircle, Info, DollarSign, CalendarDays,
  Sun, Send, BookOpen, MessageCircle, Sparkles,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type News = {
  id: number; title: string; summary: string | null;
  source: string | null; url: string | null;
  relatedTicker: string | null; timestamp: string; sentiment: string | null;
};

type OptionsFlow = {
  id: number; symbol: string; type: string;
  strike: string | null; expiry: string | null;
  premium: string | null; volume: string | null;
  openInterest: string | null; sentiment: string | null;
  signal: string | null; timestamp: string; details: string | null;
};

type Tweet = {
  username: string; displayName: string; text: string;
  timestamp: string; url: string; isRetweet: boolean;
};

type FlowVolumeData = {
  optionContract?: string; direction?: string; contracts?: number;
  notional?: number; trades?: number; time?: string; durationMs?: number;
  first?: number; last?: number; bid?: number; ask?: number;
  exchanges?: number; confidence?: number; callPut?: string;
};

type AIReport = {
  ticker: string; generatedAt: string; price: number; changePercent: number;
  sections: {
    optionFlow: { title: string; content: string };
    abnormalFlow: { title: string; content: string };
    marketStructure: { title: string; content: string };
    marketData: { title: string; price: number; changePercent: number; gammaFlip: string; maxPain: string; callWall: string; putWall: string; atmIv: string; netGex: string; volume: number; dayHigh: number; dayLow: number };
    fundamentals: { title: string; content: string };
    newsSentiment: { title: string; score: number; bullish: number; bearish: number; neutral: number; topHeadlines: { title: string; sentiment: string | null; source: string | null; url: string | null }[] };
    debate: { title: string; bullCase: string; bearCase: string };
    risk: { title: string; level: string; content: string };
    fullReport: { title: string; recommendation: string; confidence: number; summary: string };
  };
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return "—";
  const p = Number(price);
  if (isNaN(p)) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toFixed(2);
}

function formatMarketCap(cap: number | null): string {
  if (!cap) return "—";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(1)}M`;
  return `$${cap.toLocaleString()}`;
}

function formatVolume(vol: number | null): string {
  if (!vol) return "—";
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return vol.toLocaleString();
}

function formatRevenue(rev: number | null): string {
  if (!rev) return "—";
  if (rev >= 1e12) return `$${(rev / 1e12).toFixed(1)}T`;
  if (rev >= 1e9) return `$${(rev / 1e9).toFixed(1)}B`;
  if (rev >= 1e6) return `$${(rev / 1e6).toFixed(0)}M`;
  return `$${rev.toLocaleString()}`;
}

function formatNotional(n: number | null | undefined): string {
  if (n == null) return "—";
  const v = Number(n);
  if (isNaN(v)) return "—";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function timeAgo(timestamp: string): string {
  if (/^\d+[mhd]\s+ago$/i.test(timestamp) || /just now/i.test(timestamp)) return timestamp;
  const parsed = new Date(timestamp).getTime();
  if (isNaN(parsed)) return timestamp;
  const diff = Date.now() - parsed;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTweetDateTime(timestamp: string): string {
  if (/^\d+[mhd]\s+ago$/i.test(timestamp) || /just now/i.test(timestamp)) return timestamp;
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return timestamp;
  // Always show full date + time in ET, same style as News Feed
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York"
  });
  const dateStr = d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "America/New_York"
  });
  return `${dateStr} · ${timeStr} ET`;
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

function parseFlowVolume(volumeStr: string | null): FlowVolumeData {
  if (!volumeStr) return {};
  try {
    const raw = JSON.parse(volumeStr) as Record<string, unknown>;
    const numFields = ['first', 'last', 'bid', 'ask', 'notional', 'contracts', 'trades', 'durationMs', 'exchanges', 'confidence'];
    for (const field of numFields) {
      if (typeof raw[field] === 'string') {
        const cleaned = (raw[field] as string).replace(/[$,K]/g, '');
        const val = parseFloat(cleaned);
        raw[field] = isNaN(val) ? undefined : val;
      }
    }
    return raw as FlowVolumeData;
  } catch { return {}; }
}

// Parse expiry from contract name: TSLA260403P00360000 → Apr 3, 2026
function parseExpiryFromContract(contractName: string): string {
  const match = contractName.match(/^[A-Z]+(\d{2})(\d{2})(\d{2})[CP]/);
  if (!match) return "";
  const [, yy, mm, dd] = match;
  const year = 2000 + parseInt(yy);
  const month = parseInt(mm) - 1;
  const day = parseInt(dd);
  const d = new Date(year, month, day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// NY timezone time formatter
// The server stores time strings like "07:13:43 PM" which are in UTC (server time).
// We convert them to ET (UTC-5) by parsing as UTC then formatting in NY timezone.
function formatTimeNY(isoOrStr: string): string {
  // If it looks like HH:MM:SS AM/PM — treat as UTC time-of-day for today
  const ampmMatch = isoOrStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1]);
    const minutes = parseInt(ampmMatch[2]);
    const seconds = parseInt(ampmMatch[3] || "0");
    const period = ampmMatch[4].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    // Build a UTC Date for today with these hours/minutes/seconds
    const now = new Date();
    const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes, seconds));
    return utcDate.toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: true, timeZone: "America/New_York"
    }) + " ET";
  }
  const d = new Date(isoOrStr);
  if (isNaN(d.getTime())) return isoOrStr;
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true, timeZone: "America/New_York"
  }) + " ET";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STOCK_SYMBOLS = [
  "TSLA","MSFT","NVDA","AAPL","AMD","NFLX","GOOG","AMZN","PLTR","AVGO","MU","META","ORCL",
];
const ETF_SYMBOLS = ["SPX","QQQ","DIA","IWM","SPY","SOXL","USO","SLV","GLD"];

// ─── LiveClock ────────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="tabular-nums text-xs text-muted-foreground">
      {time.toLocaleTimeString("en-US", {
        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "America/New_York",
      })}{" "}EDT
    </span>
  );
}

// ─── TickerRow ────────────────────────────────────────────────────────────────

function TickerRow({
  ticker, isSelected, onClick, onNewsClick,
}: {
  ticker: Ticker; isSelected: boolean;
  onClick: () => void; onNewsClick?: () => void;
}) {
  const chg = Number(ticker.change) || 0;
  const chgPct = Number(ticker.changePercent) || 0;
  const isPositive = chg >= 0;
  const changeColor = isPositive ? "text-emerald-400" : "text-red-400";
  const bgColor = isSelected
    ? "bg-primary/10 border-primary/30"
    : "border-transparent hover:bg-muted/50";

  return (
    <div className="group relative" data-testid={`ticker-row-${ticker.symbol}`}>
      <button
        onClick={onClick}
        className={`w-full text-left px-3 py-2.5 border rounded-lg transition-all duration-150 ${bgColor}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-wide">{ticker.symbol}</span>
            <span className="text-[10px] text-muted-foreground leading-tight truncate max-w-[100px]">
              {ticker.name.split(",")[0].split(" ").slice(0, 2).join(" ")}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-sm font-semibold tabular-nums">${formatPrice(ticker.price)}</span>
            <span className={`text-[11px] tabular-nums font-medium ${changeColor} flex items-center gap-0.5`}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isPositive ? "+" : ""}{chgPct.toFixed(2)}%
            </span>
          </div>
        </div>
      </button>
      {/* News quick-access button */}
      {onNewsClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onNewsClick(); }}
          className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
          title={`News for ${ticker.symbol}`}
          data-testid={`btn-ticker-news-${ticker.symbol}`}
        >
          <Newspaper className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ─── TickerNewsModal ───────────────────────────────────────────────────────────

type SentimentSummary = {
  ticker: string; period: string; total: number;
  bullish: number; bearish: number; neutral: number;
  ratio: number; bias: string;
};

function SentimentRatioBar({ sentiment }: { sentiment: SentimentSummary }) {
  const { bullish, bearish, neutral, total, ratio, bias } = sentiment;
  if (total === 0) return (
    <div className="text-center py-2 text-[10px] text-muted-foreground">Sin noticias en 7 días</div>
  );
  const bullPct = total > 0 ? (bullish / total) * 100 : 0;
  const bearPct = total > 0 ? (bearish / total) * 100 : 0;
  const neutPct = total > 0 ? (neutral / total) * 100 : 0;
  const biasColor = bias === "bullish" ? "text-emerald-400" : bias === "bearish" ? "text-red-400" : "text-amber-400";
  const biasLabel = bias === "bullish" ? "ALCISTA" : bias === "bearish" ? "BAJISTA" : "NEUTRAL";

  return (
    <div className="px-3 py-2.5 border-b border-border/50 bg-muted/20" data-testid="sentiment-ratio-bar">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sentimiento 7D</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold ${biasColor}`}>{biasLabel}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">Ratio: <span className={`font-bold ${biasColor}`}>{ratio.toFixed(2)}</span></span>
        </div>
      </div>
      {/* Visual bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-muted/40 mb-1.5">
        {bullPct > 0 && (
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${bullPct}%` }}
            title={`Alcista: ${bullish} (${bullPct.toFixed(0)}%)`}
          />
        )}
        {neutPct > 0 && (
          <div
            className="h-full bg-amber-500/60 transition-all duration-500"
            style={{ width: `${neutPct}%` }}
            title={`Neutral: ${neutral} (${neutPct.toFixed(0)}%)`}
          />
        )}
        {bearPct > 0 && (
          <div
            className="h-full bg-red-500 transition-all duration-500"
            style={{ width: `${bearPct}%` }}
            title={`Bajista: ${bearish} (${bearPct.toFixed(0)}%)`}
          />
        )}
      </div>
      {/* Legend counts */}
      <div className="flex items-center justify-between text-[9px] tabular-nums">
        <span className="text-emerald-400">▲ Alcista: {bullish}</span>
        <span className="text-amber-400">— Neutral: {neutral}</span>
        <span className="text-red-400">▼ Bajista: {bearish}</span>
        <span className="text-muted-foreground">Total: {total}</span>
      </div>
    </div>
  );
}

function TickerNewsModal({
  ticker, open, onClose,
}: {
  ticker: string | null; open: boolean; onClose: () => void;
}) {
  const { data: news = [], isLoading } = useQuery<News[]>({
    queryKey: ["/api/news", ticker],
    queryFn: () => apiRequest("GET", `/api/news/${ticker}`).then(r => r.json()),
    enabled: open && !!ticker,
    refetchInterval: 15000,
    staleTime: 0,
  });

  const { data: sentiment } = useQuery<SentimentSummary>({
    queryKey: ["/api/news-sentiment", ticker],
    queryFn: () => apiRequest("GET", `/api/news-sentiment/${ticker}`).then(r => r.json()),
    enabled: open && !!ticker,
    refetchInterval: 30000,
    staleTime: 0,
    refetchIntervalInBackground: true,
  });

  const [selectedNews, setSelectedNews] = useState<News | null>(null);

  if (!ticker) return null;

  const sentimentColor = (s: string | null) =>
    s === "bullish" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
    : s === "bearish" ? "text-red-400 bg-red-500/10 border-red-500/30"
    : "text-amber-400 bg-amber-500/10 border-amber-500/30";

  return (
    <>
      <Dialog open={open && !selectedNews} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="bg-card border-card-border max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-primary" />
              {ticker} — Live News
              <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10 ml-auto">
                <Radio className="w-2.5 h-2.5 mr-1 animate-pulse" />
                LIVE
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              Auto-refreshes every 15s · {news.length} articles found
            </DialogDescription>
          </DialogHeader>

          {/* 7-day sentiment ratio */}
          {sentiment && <SentimentRatioBar sentiment={sentiment} />}

          <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
            {isLoading ? (
              <div className="space-y-3 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : news.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground">
                No recent news found for {ticker}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {news.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 px-2 hover:bg-muted/30 rounded-lg cursor-pointer transition-colors"
                    onClick={() => setSelectedNews(item)}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`p-1 rounded border ${sentimentColor(item.sentiment)} mt-0.5 flex-shrink-0`}>
                        {item.sentiment === "bullish" ? <TrendingUp className="w-3 h-3" />
                          : item.sentiment === "bearish" ? <TrendingDown className="w-3 h-3" />
                          : <Minus className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {timeAgo(item.timestamp)}
                          </span>
                          {item.source && (
                            <span className="text-[9px] text-muted-foreground/70">{item.source}</span>
                          )}
                        </div>
                        <p className="text-xs font-medium leading-snug">{item.title}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Article detail modal */}
      <NewsModal item={selectedNews} open={!!selectedNews} onClose={() => setSelectedNews(null)} />
    </>
  );
}

// ─── DTE multipliers for key level adjustments ────────────────────────────────
type DteMode = "0DTE" | "1DTE" | "2DTE" | "Weekly";

const DTE_CONFIG: Record<DteMode, { label: string; gammaFlipMult: number; maxPainMult: number; callWallMult: number; putWallMult: number; ivMult: number; desc: string }> = {
  "0DTE":   { label: "0DTE",   gammaFlipMult: 1.000, maxPainMult: 1.000, callWallMult: 0.996, putWallMult: 1.004, ivMult: 1.25, desc: "Expira hoy" },
  "1DTE":   { label: "1DTE",   gammaFlipMult: 1.002, maxPainMult: 1.002, callWallMult: 0.998, putWallMult: 1.002, ivMult: 1.10, desc: "Expira mañana" },
  "2DTE":   { label: "2DTE",   gammaFlipMult: 1.004, maxPainMult: 1.004, callWallMult: 1.001, putWallMult: 0.999, ivMult: 1.05, desc: "2 días" },
  "Weekly": { label: "Weekly", gammaFlipMult: 1.008, maxPainMult: 1.008, callWallMult: 1.005, putWallMult: 0.995, ivMult: 0.92, desc: "Viernes" },
};

function applyDteToLevel(value: string | null | undefined, mult: number): string {
  if (!value) return "—";
  const num = parseFloat(value.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return value;
  const adjusted = Math.round(num * mult);
  return `$${adjusted.toLocaleString()}`;
}

// ─── KeyLevelsCard ────────────────────────────────────────────────────────────

function KeyLevelsCard({ ticker }: { ticker: Ticker }) {
  const [dte, setDte] = useState<DteMode>("0DTE");
  const cfg = DTE_CONFIG[dte];

  const levels = [
    { label: "Gamma Flip", value: applyDteToLevel(ticker.gammaFlip, cfg.gammaFlipMult), icon: Zap, color: "text-amber-400", desc: "Regime boundary" },
    { label: "Max Pain",   value: applyDteToLevel(ticker.maxPain,   cfg.maxPainMult),   icon: Target, color: "text-purple-400", desc: "Expiry magnet" },
    { label: "Call Wall",  value: applyDteToLevel(ticker.callWall,  cfg.callWallMult),  icon: ArrowUpCircle, color: "text-emerald-400", desc: "Resistance" },
    { label: "Put Wall",   value: applyDteToLevel(ticker.putWall,   cfg.putWallMult),   icon: ArrowDownCircle, color: "text-red-400", desc: "Support" },
  ];

  const rawIv = parseFloat((ticker.atmIv || "0").replace(/[^0-9.]/g, ""));
  const adjustedIv = rawIv ? (rawIv * cfg.ivMult).toFixed(1) + "%" : "—";
  const isPositiveGamma = ticker.gammaRegime?.toLowerCase().includes("positive");

  return (
    <Card className="p-4 border-card-border bg-card" data-testid="key-levels-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Key Levels</h3>
          <span className="text-[9px] text-muted-foreground/50">{cfg.desc}</span>
        </div>
        <div className="flex items-center gap-1">
          {(["0DTE", "1DTE", "2DTE", "Weekly"] as DteMode[]).map((d) => (
            <button
              key={d}
              onClick={() => setDte(d)}
              className={`text-[9px] font-semibold px-2 py-0.5 rounded transition-all border ${
                dte === d
                  ? "bg-primary text-black border-primary"
                  : "text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {levels.map((level) => (
          <div key={level.label} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30">
            <div className="flex items-center gap-2">
              <level.icon className={`w-3.5 h-3.5 ${level.color}`} />
              <div>
                <span className={`text-xs font-medium ${level.color}`}>{level.label}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5">{level.desc}</span>
              </div>
            </div>
            <span className="text-sm font-semibold tabular-nums">{level.value}</span>
          </div>
        ))}
      </div>
      <Separator className="my-3" />
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-2 rounded-md bg-muted/30">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">ATM IV <span className="text-primary/60">({dte})</span></div>
          <div className="text-sm font-semibold tabular-nums text-amber-400">{adjustedIv}</div>
        </div>
        <div className="text-center p-2 rounded-md bg-muted/30">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Net GEX</div>
          <div className="text-sm font-semibold tabular-nums text-primary">{ticker.netGex || "—"}</div>
        </div>
      </div>
    </Card>
  );
}

// ─── TickerDetail ─────────────────────────────────────────────────────────────

function TickerDetail({ ticker }: { ticker: Ticker }) {
  const chg = Number(ticker.change) || 0;
  const chgPct = Number(ticker.changePercent) || 0;
  const isPositive = chg >= 0;
  return (
    <Card className="p-4 border-card-border bg-card" data-testid="ticker-detail-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold tracking-wide">{ticker.symbol}</h2>
          <p className="text-xs text-muted-foreground">{ticker.name}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums">${formatPrice(ticker.price)}</div>
          <div className={`text-sm tabular-nums font-medium flex items-center justify-end gap-1 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isPositive ? "+" : ""}{chg.toFixed(2)} ({isPositive ? "+" : ""}{chgPct.toFixed(2)}%)
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Open", value: `$${formatPrice(ticker.open)}` },
          { label: "Day High", value: `$${formatPrice(ticker.dayHigh)}` },
          { label: "Day Low", value: `$${formatPrice(ticker.dayLow)}` },
          { label: "Prev Close", value: `$${formatPrice(ticker.previousClose)}` },
          { label: "Volume", value: formatVolume(ticker.volume) },
          { label: "Market Cap", value: formatMarketCap(ticker.marketCap) },
          { label: "P/E", value: ticker.pe ? Number(ticker.pe).toFixed(2) : "—" },
          { label: "EPS", value: ticker.eps ? `$${Number(ticker.eps).toFixed(2)}` : "—" },
        ].map((item) => (
          <div key={item.label} className="p-2 rounded-md bg-muted/30">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</div>
            <div className="text-sm font-semibold tabular-nums">{item.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── GammaBar ─────────────────────────────────────────────────────────────────

function GammaBar({ ticker }: { ticker: Ticker }) {
  const [dte, setDte] = useState<DteMode>("0DTE");
  const cfg = DTE_CONFIG[dte];

  const rawPut  = parseFloat((ticker.putWall  || "0").replace(/[$,]/g, ""));
  const rawCall = parseFloat((ticker.callWall || "0").replace(/[$,]/g, ""));
  const rawFlip = parseFloat((ticker.gammaFlip || "0").replace(/[$,]/g, ""));
  const putVal  = Math.round(rawPut  * cfg.putWallMult);
  const callVal = Math.round(rawCall * cfg.callWallMult);
  const flipVal = rawFlip ? Math.round(rawFlip * cfg.gammaFlipMult) : 0;
  const price = ticker.price;
  if (!putVal || !callVal || !price) return null;
  const allVals = [putVal, callVal, price];
  if (flipVal) allVals.push(flipVal);
  const min = Math.min(...allVals) * 0.99;
  const max = Math.max(...allVals) * 1.01;
  const range = max - min;
  const toPct = (v: number) => Math.max(0, Math.min(100, ((v - min) / range) * 100));
  const pricePct = toPct(price);
  const putPct = toPct(putVal);
  const callPct = toPct(callVal);
  const flipPct = flipVal ? toPct(flipVal) : null;

  // Determine price zone
  const aboveGamma = flipVal ? price > flipVal : true;
  const zoneLabel = aboveGamma ? "BULLISH ZONE" : "BEARISH ZONE";
  const zoneColor = aboveGamma ? "text-emerald-400" : "text-red-400";

  return (
    <Card className="relative p-4 border-card-border bg-card overflow-hidden" data-testid="gamma-bar-card">
      {/* Subtle top glow */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-4 rounded-full bg-primary" />
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/80">Price vs Options Levels</h3>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${zoneColor} ml-1`}>{zoneLabel}</span>
        </div>
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/30 border border-border/30">
          {(["0DTE", "1DTE", "2DTE", "Weekly"] as DteMode[]).map((d) => (
            <button key={d} onClick={() => setDte(d)}
              className={`text-[9px] font-bold px-2.5 py-1 rounded transition-all ${
                dte === d ? "bg-primary text-black shadow-sm shadow-primary/30" : "text-muted-foreground hover:text-foreground"
              }`}>{d}</button>
          ))}
        </div>
      </div>

      {/* Main bar — futuristic layered design */}
      <div className="relative h-12 rounded-lg overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.2) 100%)' }}>
        {/* Grid lines */}
        <div className="absolute inset-0 flex justify-between px-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="w-px h-full bg-white/[0.03]" />
          ))}
        </div>

        {/* Put wall zone — left gradient */}
        <div className="absolute top-0 bottom-0 rounded-l-lg" style={{ left: 0, width: `${putPct}%`, background: 'linear-gradient(90deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 100%)' }} />
        
        {/* Call wall zone — right gradient */}
        <div className="absolute top-0 bottom-0 rounded-r-lg" style={{ left: `${callPct}%`, right: 0, background: 'linear-gradient(270deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%)' }} />
        
        {/* Put Wall marker */}
        <div className="absolute top-0 bottom-0 flex flex-col items-center justify-center" style={{ left: `${putPct}%`, transform: 'translateX(-50%)' }}>
          <div className="w-0.5 h-full bg-red-400/80" style={{ boxShadow: '0 0 8px rgba(239,68,68,0.4)' }} />
        </div>

        {/* Call Wall marker */}
        <div className="absolute top-0 bottom-0 flex flex-col items-center justify-center" style={{ left: `${callPct}%`, transform: 'translateX(-50%)' }}>
          <div className="w-0.5 h-full bg-emerald-400/80" style={{ boxShadow: '0 0 8px rgba(16,185,129,0.4)' }} />
        </div>

        {/* Gamma Flip marker */}
        {flipPct !== null && (
          <div className="absolute top-0 bottom-0" style={{ left: `${flipPct}%`, transform: 'translateX(-50%)' }}>
            <div className="w-px h-full bg-amber-400/60" style={{ boxShadow: '0 0 6px rgba(251,191,36,0.3)' }} />
            <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-bold text-amber-400/80 whitespace-nowrap">γ</div>
          </div>
        )}

        {/* Price cursor — prominent glowing line */}
        <div className="absolute top-0 bottom-0 z-10" style={{ left: `${pricePct}%`, transform: 'translateX(-50%)' }}>
          <div className="w-[3px] h-full bg-white rounded-full" style={{ boxShadow: '0 0 12px rgba(255,255,255,0.5), 0 0 4px rgba(255,255,255,0.8)' }} />
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white" style={{ boxShadow: '0 0 8px rgba(255,255,255,0.6)' }} />
        </div>
      </div>

      {/* Level labels below the bar */}
      <div className="flex items-center justify-between mt-3 px-0.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-400/80" style={{ boxShadow: '0 0 6px rgba(239,68,68,0.4)' }} />
          <span className="text-[10px] text-red-400 font-semibold tabular-nums">PW ${putVal}</span>
        </div>
        {flipPct !== null && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-400/80" style={{ boxShadow: '0 0 6px rgba(251,191,36,0.4)' }} />
            <span className="text-[10px] text-amber-400 font-semibold tabular-nums">γFlip ${flipVal}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-white" style={{ boxShadow: '0 0 8px rgba(255,255,255,0.4)' }} />
          <span className="text-[10px] text-white font-bold tabular-nums">${formatPrice(ticker.price)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400/80" style={{ boxShadow: '0 0 6px rgba(16,185,129,0.4)' }} />
          <span className="text-[10px] text-emerald-400 font-semibold tabular-nums">CW ${callVal}</span>
        </div>
      </div>
    </Card>
  );
}

// ─── NewsItem ─────────────────────────────────────────────────────────────────

// Decode HTML entities like &#x2013; → –
function decodeHTMLEntities(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function NewsItem({ item, onClick }: { item: News; onClick: () => void }) {
  const isBull = item.sentiment === "bullish";
  const isBear = item.sentiment === "bearish";
  const accentColor = isBull ? "rgb(52,211,153)" : isBear ? "rgb(248,113,113)" : "rgb(251,191,36)";
  const accentClass = isBull ? "text-emerald-400" : isBear ? "text-red-400" : "text-amber-400";
  const bgHover = isBull ? "hover:bg-emerald-500/[0.04]" : isBear ? "hover:bg-red-500/[0.04]" : "hover:bg-amber-500/[0.04]";
  const SentimentIcon = isBull ? TrendingUp : isBear ? TrendingDown : Minus;
  const decodedTitle = decodeHTMLEntities(item.title);
  return (
    <div className={`group relative py-3 px-3 ${bgHover} transition-all duration-200 cursor-pointer`} data-testid={`news-item-${item.id}`} onClick={onClick}>
      {/* Left accent bar */}
      <div className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: accentColor }} />
      
      <div className="flex items-start gap-2.5">
        {/* Sentiment icon with glow */}
        <div className="relative mt-0.5 flex-shrink-0">
          <div className={`p-1.5 rounded-md ${accentClass} bg-current/10`} style={{ boxShadow: `0 0 8px ${accentColor}20` }}>
            <SentimentIcon className="w-3 h-3" style={{ color: accentColor }} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {item.relatedTicker && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider text-primary bg-primary/10 border border-primary/20">
                {item.relatedTicker}
              </span>
            )}
            <span className="text-[9px] text-muted-foreground/60 flex items-center gap-1 tabular-nums">
              <Clock className="w-2.5 h-2.5" />{timeAgo(item.timestamp)}
            </span>
          </div>
          <p className="text-[11px] font-medium leading-snug text-foreground/90 group-hover:text-foreground transition-colors">{decodedTitle}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[9px] text-muted-foreground/50 font-medium uppercase tracking-wider">{item.source}</span>
            <div className={`w-1 h-1 rounded-full`} style={{ backgroundColor: accentColor, boxShadow: `0 0 4px ${accentColor}` }} />
            <span className={`text-[9px] font-semibold uppercase tracking-wider ${accentClass}`}>{item.sentiment}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NewsModal ────────────────────────────────────────────────────────────────

function NewsModal({ item, open, onClose }: { item: News | null; open: boolean; onClose: () => void }) {
  if (!item) return null;
  const sentimentColor =
    item.sentiment === "bullish" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
    : item.sentiment === "bearish" ? "text-red-400 bg-red-500/10 border-red-500/30"
    : "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-card-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold leading-snug pr-6">{decodeHTMLEntities(item.title)}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                {item.relatedTicker && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-semibold tracking-wider">
                    {item.relatedTicker}
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-medium ${sentimentColor}`}>
                  {item.sentiment === "bullish" ? "Bullish" : item.sentiment === "bearish" ? "Bearish" : "Neutral"}
                </Badge>
              </div>
              {item.summary && <p className="text-xs text-foreground/80 leading-relaxed">{decodeHTMLEntities(item.summary)}</p>}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                {item.source && <span className="font-medium">{item.source}</span>}
                <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{timeAgo(item.timestamp)}</span>
              </div>
              {item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-block text-[11px] text-primary hover:underline mt-1">
                  Read full article →
                </a>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

// ─── GEX Chart Modal ─────────────────────────────────────────────────────────────────────────────────────────
function generateGEXData(ticker: Ticker) {
  const price = ticker.price || 100;
  const callWall = parseFloat((ticker.callWall || "").replace(/[^0-9.]/g, "")) || price * 1.05;
  const putWall = parseFloat((ticker.putWall || "").replace(/[^0-9.]/g, "")) || price * 0.95;
  const gammaFlip = parseFloat((ticker.gammaFlip || "").replace(/[^0-9.]/g, "")) || price;
  const maxPain = parseFloat((ticker.maxPain || "").replace(/[^0-9.]/g, "")) || price;

  const step = price < 20 ? 0.5 : price < 100 ? 1 : price < 500 ? 5 : 10;
  const low = Math.floor((putWall * 0.92) / step) * step;
  const high = Math.ceil((callWall * 1.08) / step) * step;

  const data: { strike: number; call: number; put: number }[] = [];

  for (let s = low; s <= high; s = Math.round((s + step) * 1000) / 1000) {
    const distFromCallWall = (s - callWall) / price;
    const distFromPutWall = (s - putWall) / price;
    const distFromPrice = (s - price) / price;
    const distFromMaxPain = (s - maxPain) / price;
    const distFromGammaFlip = (s - gammaFlip) / price;

    const callBase = Math.exp(-Math.pow(distFromCallWall * 14, 2)) * 48
      + Math.exp(-Math.pow(distFromMaxPain * 12, 2)) * 22
      + Math.exp(-Math.pow(distFromPrice * 7, 2)) * 12;
    const call = Math.max(0, callBase + (Math.random() - 0.5) * 6);

    const putBase = Math.exp(-Math.pow(distFromPutWall * 14, 2)) * 45
      + Math.exp(-Math.pow(distFromGammaFlip * 11, 2)) * 18
      + Math.exp(-Math.pow(distFromPrice * 6, 2)) * 10;
    const put = -Math.max(0, putBase + (Math.random() - 0.5) * 6);

    data.push({ strike: Math.round(s * 100) / 100, call: Math.round(call), put: Math.round(put) });
  }
  return { data, price, callWall, putWall, gammaFlip, maxPain };
}

function GEXChart({ ticker, onClose }: { ticker: Ticker; onClose: () => void }) {
  const { data: chartData, price, callWall, putWall, gammaFlip, maxPain } = useMemo(
    () => generateGEXData(ticker),
    [ticker.symbol, ticker.price]
  );
  const maxAbsVal = Math.max(...chartData.map(d => Math.max(Math.abs(d.call), Math.abs(d.put))), 1);
  const domain: [number, number] = [-Math.ceil(maxAbsVal * 1.15), Math.ceil(maxAbsVal * 1.15)];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="border-border max-w-2xl"
        style={{ background: "#0d1117" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="w-4 h-4 text-primary" />
            {ticker.symbol} GEX by Strike
            <span className="text-[10px] text-muted-foreground font-normal ml-2">Structural Gamma Exposure</span>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-1">
              {/* Level legend */}
              <div className="flex flex-wrap gap-3 mb-4">
                {[
                  { label: `Call Wall $${callWall.toFixed(0)}`, color: "#34d399" },
                  { label: `Spot $${price.toFixed(1)}`, color: "#60a5fa" },
                  { label: `Put Wall $${putWall.toFixed(0)}`, color: "#f87171" },
                  { label: `γFlip $${gammaFlip.toFixed(0)}`, color: "#fbbf24" },
                  { label: `Max Pain $${maxPain.toFixed(0)}`, color: "#c084fc" },
                ].map(item => (
                  <span key={item.label} className="flex items-center gap-1 text-[10px]">
                    <span className="inline-block w-5 h-0" style={{ borderTop: `2px dashed ${item.color}` }} />
                    <span style={{ color: item.color }}>{item.label}</span>
                  </span>
                ))}
              </div>

              <div style={{ width: "100%", height: 380 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 110, left: 12, bottom: 20 }}
                    barCategoryGap="8%"
                    barGap={0}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2836" horizontal={true} vertical={false} />
                    <XAxis
                      type="number"
                      domain={domain}
                      tickFormatter={(v: number) => `${Math.round(v)}M`}
                      tick={{ fontSize: 9, fill: "#6b7280" }}
                      axisLine={{ stroke: "#374151" }}
                      tickLine={false}
                      label={{ value: "Structural GEX", position: "insideBottom", offset: -12, fontSize: 9, fill: "#6b7280" }}
                    />
                    <YAxis
                      type="number"
                      dataKey="strike"
                      domain={["dataMin", "dataMax"]}
                      tickCount={15}
                      tick={{ fontSize: 8, fill: "#6b7280" }}
                      axisLine={false}
                      tickLine={false}
                      width={42}
                      label={{ value: "Strike", angle: -90, position: "insideLeft", offset: 14, fontSize: 9, fill: "#6b7280" }}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0d1117", border: "1px solid #374151", borderRadius: 6, fontSize: 10, color: "#e5e7eb" }}
                      labelStyle={{ color: "#e5e7eb", fontWeight: 600 }}
                      itemStyle={{ color: "#e5e7eb" }}
                      formatter={(value: number, name: string) => [
                        `${Math.abs(value).toFixed(0)}M`,
                        name === "call" ? "Call GEX ↑" : "Put GEX ↓"
                      ]}
                      labelFormatter={(l: unknown) => `Strike: $${l}`}
                    />
                    {/* Reference lines — horizontal lines across the bars (layout=vertical → y matches category dataKey) */}
                    <ReferenceLine y={Math.round(callWall)} stroke="#34d399" strokeDasharray="5 3" strokeWidth={1.5} ifOverflow="extendDomain"
                      label={{ value: `Call Wall $${Math.round(callWall)}`, position: "insideRight", fontSize: 8, fill: "#34d399", dx: 2 }} />
                    <ReferenceLine y={Math.round(price * 10) / 10} stroke="#60a5fa" strokeDasharray="3 3" strokeWidth={1.5} ifOverflow="extendDomain"
                      label={{ value: `Spot $${price.toFixed(1)}`, position: "insideRight", fontSize: 8, fill: "#60a5fa", dx: 2 }} />
                    <ReferenceLine y={Math.round(putWall)} stroke="#f87171" strokeDasharray="5 3" strokeWidth={1.5} ifOverflow="extendDomain"
                      label={{ value: `Put Wall $${Math.round(putWall)}`, position: "insideRight", fontSize: 8, fill: "#f87171", dx: 2 }} />
                    <ReferenceLine y={Math.round(gammaFlip)} stroke="#fbbf24" strokeDasharray="4 3" strokeWidth={1} ifOverflow="extendDomain"
                      label={{ value: `γFlip $${Math.round(gammaFlip)}`, position: "insideRight", fontSize: 8, fill: "#fbbf24", dx: 2 }} />
                    <ReferenceLine y={Math.round(maxPain)} stroke="#c084fc" strokeDasharray="4 3" strokeWidth={1} ifOverflow="extendDomain"
                      label={{ value: `MaxPain $${Math.round(maxPain)}`, position: "insideRight", fontSize: 8, fill: "#c084fc", dx: 2 }} />

                    <Bar dataKey="call" maxBarSize={9}>
                      {chartData.map((_entry, index) => (
                        <Cell key={`call-${index}`} fill="#34d399" fillOpacity={0.85} />
                      ))}
                    </Bar>
                    <Bar dataKey="put" maxBarSize={9}>
                      {chartData.map((_entry, index) => (
                        <Cell key={`put-${index}`} fill="#f87171" fillOpacity={0.80} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 flex items-center gap-5 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm inline-block bg-emerald-400/80" /> Call GEX — Presión alcista</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm inline-block bg-red-400/80" /> Put GEX — Presión bajista</span>
                <span className="ml-auto opacity-70">GEX positivo = precio estable · GEX negativo = movimientos amplificados</span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

// ─── AllKeyLevelsTable ────────────────────────────────────────────────────────────────────────────────────────
function AllKeyLevelsTable({ tickers }: { tickers: Ticker[] }) {
  const [gexTicker, setGexTicker] = useState<Ticker | null>(null);
  const [tableDte, setTableDte] = useState<DteMode>("0DTE");
  const tableCfg = DTE_CONFIG[tableDte];

  return (
    <>
      <Card className="p-4 border-card-border bg-card" data-testid="all-key-levels-table">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" />Portfolio Key Levels Overview
            <span className="text-[9px] text-muted-foreground/60 font-normal">• Click ticker → GEX Chart</span>
          </h3>
          <div className="flex items-center gap-1">
            {(["0DTE", "1DTE", "2DTE", "Weekly"] as DteMode[]).map((d) => (
              <button key={d} onClick={() => setTableDte(d)}
                className={`text-[9px] font-semibold px-2 py-0.5 rounded transition-all border ${
                  tableDte === d ? "bg-primary text-black border-primary" : "text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground"
                }`}>{d}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                {["Symbol","Price","Chg%","Gamma Flip","Max Pain","Call Wall","Put Wall","Regime","GEX"].map((h, i) => (
                  <th key={h} className={`py-2 px-2 font-medium uppercase tracking-wider text-[10px] ${i === 0 ? "text-left" : i <= 2 ? "text-right" : i === 7 || i === 8 ? "text-center" : "text-right"}`}>
                    <span className={i === 3 ? "text-amber-400" : i === 4 ? "text-purple-400" : i === 5 ? "text-emerald-400" : i === 6 ? "text-red-400" : i === 8 ? "text-primary" : ""}>{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickers.map((t) => {
                const isPositive = (Number(t.change) || 0) >= 0;
                const isPositiveGamma = t.gammaRegime?.toLowerCase().includes("positive");
                return (
                  <tr
                    key={t.symbol}
                    className="border-b border-border/50 hover:bg-primary/5 transition-colors cursor-pointer group"
                    onClick={() => setGexTicker(t)}
                    data-testid={`key-levels-row-${t.symbol}`}
                  >
                    <td className="py-2 px-2 font-semibold">
                      <span className="group-hover:text-primary transition-colors flex items-center gap-1">
                        {t.symbol}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">${formatPrice(t.price)}</td>
                    <td className={`py-2 px-2 text-right tabular-nums font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                      {isPositive ? "+" : ""}{(Number(t.changePercent) || 0).toFixed(2)}%
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-amber-400">{applyDteToLevel(t.gammaFlip, tableCfg.gammaFlipMult)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-purple-400">{applyDteToLevel(t.maxPain, tableCfg.maxPainMult)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-400">{applyDteToLevel(t.callWall, tableCfg.callWallMult)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-red-400">{applyDteToLevel(t.putWall, tableCfg.putWallMult)}</td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${isPositiveGamma ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className={`text-[9px] ${isPositiveGamma ? "text-emerald-400" : "text-red-400"}`}>{isPositiveGamma ? "+" : "-"}GEX</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className="text-[9px] text-primary/50 group-hover:text-primary border border-primary/20 group-hover:border-primary/50 group-hover:bg-primary/10 px-1.5 py-0.5 rounded transition-all">
                        Ver →
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {gexTicker && <GEXChart ticker={gexTicker} onClose={() => setGexTicker(null)} />}
    </>
  );
}


// ─── OptionsFlowDetailModal ───────────────────────────────────────────────────

function OptionsFlowDetailModal({ flow, open, onClose }: { flow: OptionsFlow | null; open: boolean; onClose: () => void }) {
  if (!flow) return null;
  const vd = parseFlowVolume(flow.volume);
  const isCall = (vd.callPut || flow.type || "").toUpperCase().includes("C");
  const isBuy = (vd.direction || "").toUpperCase().includes("BUY");
  const confidence = vd.confidence ?? 0;
  const confColor = confidence >= 90 ? "text-emerald-400" : confidence >= 75 ? "text-amber-400" : "text-red-400";
  const contractName = vd.optionContract || `${flow.symbol}${flow.expiry || ""}${isCall ? "C" : "P"}${flow.strike || ""}`;
  const expiryDisplay = vd.optionContract ? parseExpiryFromContract(vd.optionContract) : flow.expiry || "—";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-card-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold font-mono">{contractName}</DialogTitle>
          <DialogDescription asChild>
            <div className="pt-3 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className={`text-[10px] font-semibold ${isCall ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-red-500/20 text-red-400 border-red-500/40"}`} variant="outline">
                  {isCall ? "CALL" : "PUT"}
                </Badge>
                <Badge className={`text-[10px] font-semibold ${isBuy ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-red-500/20 text-red-400 border-red-500/40"}`} variant="outline">
                  {vd.direction || "—"}
                </Badge>
                {flow.signal && (
                  <Badge className="text-[10px] font-semibold bg-amber-500/20 text-amber-400 border-amber-500/40" variant="outline">
                    {flow.signal.toUpperCase()}
                  </Badge>
                )}
                {confidence > 0 && (
                  <Badge className={`text-[10px] font-semibold ${confColor}`} variant="outline">CONF {confidence}%</Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Símbolo", value: flow.symbol },
                  { label: "Strike", value: flow.strike || "—" },
                  { label: "Vencimiento", value: expiryDisplay },
                  { label: "Contratos", value: vd.contracts?.toLocaleString() || "—" },
                  { label: "Nocional", value: formatNotional(vd.notional ?? null) },
                  { label: "Prima", value: flow.premium || formatNotional(vd.notional ?? null) },
                  { label: "Nº Trades", value: vd.trades?.toString() || "—" },
                  { label: "Duración (ms)", value: vd.durationMs?.toString() || "—" },
                  { label: "Exchanges", value: vd.exchanges?.toString() || "—" },
                  { label: "Primer Fill", value: vd.first ? `$${Number(vd.first).toFixed(2)}` : "—" },
                  { label: "Último Fill", value: vd.last ? `$${Number(vd.last).toFixed(2)}` : "—" },
                  { label: "Bid / Ask", value: vd.bid && vd.ask ? `$${Number(vd.bid).toFixed(2)} / $${Number(vd.ask).toFixed(2)}` : "—" },
                  { label: "Hora (NY ET)", value: vd.time ? formatTimeNY(vd.time) : "—" },
                  { label: "Interés Abierto", value: flow.openInterest || "—" },
                  { label: "Sentimiento", value: flow.sentiment === "bullish" ? "Alcista" : flow.sentiment === "bearish" ? "Bajista" : flow.sentiment || "—" },
                ].map((item) => (
                  <div key={item.label} className="p-2 rounded bg-muted/30">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{item.label}</div>
                    <div className="text-xs font-semibold tabular-nums">{item.value}</div>
                  </div>
                ))}
              </div>
              {flow.details && (
                <div className="p-3 rounded bg-muted/20 border border-border/40">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Details</div>
                  <p className="text-xs leading-relaxed text-foreground/80">{flow.details}</p>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

// ─── AI Report Modal ──────────────────────────────────────────────────────────

function AIReportModal({
  ticker, open, onClose,
}: {
  ticker: string | null; open: boolean; onClose: () => void;
}) {
  const mutation = useMutation<AIReport, Error, string>({
    mutationFn: (sym: string) =>
      apiRequest("POST", "/api/ai-report", { ticker: sym }).then((r) => r.json()),
  });

  useEffect(() => {
    if (open && ticker && !mutation.data) {
      mutation.mutate(ticker);
    }
  }, [open, ticker]);

  useEffect(() => {
    if (!open) mutation.reset();
  }, [open]);

  const report = mutation.data;

  const riskColor = (level: string) =>
    level === "HIGH" ? "text-red-400 bg-red-500/15 border-red-500/40"
    : level === "MEDIUM" ? "text-amber-400 bg-amber-500/15 border-amber-500/40"
    : "text-emerald-400 bg-emerald-500/15 border-emerald-500/40";

  const recColor = (rec: string) =>
    rec === "BUY" ? "text-emerald-400 bg-emerald-500/20 border-emerald-500/50"
    : rec === "SELL" ? "text-red-400 bg-red-500/20 border-red-500/50"
    : "text-amber-400 bg-amber-500/20 border-amber-500/50";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-card-border max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            Reporte AI Whale — {ticker}
            {report && (
              <span className="text-[10px] text-muted-foreground font-normal ml-auto">
                Generado {new Date(report.generatedAt).toLocaleTimeString("es-US", { timeZone: "America/New_York" })} ET
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Análisis AI en 9 secciones: flujo de opciones, estructura de mercado, fundamentales, sentimiento y recomendación final
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {mutation.isPending && (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
              <div className="text-center text-xs text-muted-foreground mt-4">Generando análisis AI... ⚡</div>
            </div>
          )}
          {mutation.isError && (
            <div className="text-center py-8 text-xs text-red-400">Error al generar el reporte. Inténtalo de nuevo.</div>
          )}
          {report && (
            <div className="p-4 space-y-4">
              {/* Price header */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
                <div>
                  <div className="text-lg font-bold">{report.ticker}</div>
                  <div className="text-xs text-muted-foreground">Current Price</div>
                </div>
                <div className="text-xl font-bold tabular-nums">${report.price.toFixed(2)}</div>
                <div className={`text-sm font-medium ${report.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {report.changePercent >= 0 ? "+" : ""}{report.changePercent.toFixed(2)}%
                </div>
                {/* Full report badge */}
                <div className="ml-auto flex items-center gap-2">
                  <Badge className={`text-xs font-bold px-3 py-1 border ${recColor(report.sections.fullReport.recommendation)}`} variant="outline">
                    {report.sections.fullReport.recommendation}
                  </Badge>
                  <div className="text-center">
                    <div className={`text-lg font-bold ${report.sections.fullReport.confidence >= 75 ? "text-emerald-400" : "text-amber-400"}`}>
                      {report.sections.fullReport.confidence}%
                    </div>
                    <div className="text-[9px] text-muted-foreground">Confidence</div>
                  </div>
                </div>
              </div>

              {/* Secciones */}
              <div className="grid grid-cols-1 gap-3">
                {/* 1. Flujo de Opciones */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">1. Interpretación del Flujo de Opciones</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{report.sections.optionFlow.content}</p>
                </div>
                {/* 2. Flujo Anormal */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-orange-400">2. Análisis de Flujo Anormal</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{report.sections.abnormalFlow.content}</p>
                </div>
                {/* 3. Estructura de Mercado */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">3. Estructura de Mercado</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{report.sections.marketStructure.content}</p>
                </div>
                {/* 4. Datos de Mercado */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">4. Datos de Mercado</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Precio", value: `$${report.sections.marketData.price.toFixed(2)}` },
                      { label: "Máximo del Día", value: `$${(report.sections.marketData.dayHigh || 0).toFixed(2)}` },
                      { label: "Mínimo del Día", value: `$${(report.sections.marketData.dayLow || 0).toFixed(2)}` },
                      { label: "Volumen", value: formatVolume(report.sections.marketData.volume) },
                      { label: "Gamma Flip", value: report.sections.marketData.gammaFlip },
                      { label: "Max Pain", value: report.sections.marketData.maxPain },
                      { label: "Call Wall", value: report.sections.marketData.callWall },
                      { label: "Put Wall", value: report.sections.marketData.putWall },
                    ].map(item => (
                      <div key={item.label} className="p-2 rounded bg-muted/30">
                        <div className="text-[9px] text-muted-foreground uppercase">{item.label}</div>
                        <div className="text-xs font-semibold tabular-nums">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* 5. Fundamentales */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400">5. Fundamentales</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{report.sections.fundamentals.content}</p>
                </div>
                {/* 6. Sentimiento de Noticias */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Newspaper className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">6. Sentimiento de Noticias</span>
                  </div>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="text-center">
                      <div className={`text-xl font-bold ${report.sections.newsSentiment.score >= 60 ? "text-emerald-400" : report.sections.newsSentiment.score <= 40 ? "text-red-400" : "text-amber-400"}`}>
                        {report.sections.newsSentiment.score}%
                      </div>
                      <div className="text-[9px] text-muted-foreground">Puntaje Alcista</div>
                    </div>
                    <div className="flex gap-3">
                      <div className="text-center"><div className="text-sm font-bold text-emerald-400">{report.sections.newsSentiment.bullish}</div><div className="text-[9px] text-muted-foreground">Alcista</div></div>
                      <div className="text-center"><div className="text-sm font-bold text-red-400">{report.sections.newsSentiment.bearish}</div><div className="text-[9px] text-muted-foreground">Bajista</div></div>
                      <div className="text-center"><div className="text-sm font-bold text-amber-400">{report.sections.newsSentiment.neutral}</div><div className="text-[9px] text-muted-foreground">Neutral</div></div>
                    </div>
                  </div>
                  {report.sections.newsSentiment.topHeadlines.map((h, i) => (
                    <div key={i} className="text-[10px] text-foreground/70 py-0.5 border-t border-border/20">
                      {h.url ? <a href={h.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">{h.title}</a> : h.title}
                    </div>
                  ))}
                </div>
                {/* 7. Debate Toro vs Oso */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Cpu className="w-3.5 h-3.5 text-pink-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-pink-400">7. Debate: Toro vs Oso</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <div className="text-[10px] font-bold text-emerald-400 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> CASO ALCISTA</div>
                      <p className="text-[10px] text-foreground/80 leading-relaxed">{report.sections.debate.bullCase}</p>
                    </div>
                    <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                      <div className="text-[10px] font-bold text-red-400 mb-1 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> CASO BAJISTA</div>
                      <p className="text-[10px] text-foreground/80 leading-relaxed">{report.sections.debate.bearCase}</p>
                    </div>
                  </div>
                </div>
                {/* 8. Evaluación de Riesgo */}
                <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">8. Evaluación de Riesgo</span>
                    <Badge variant="outline" className={`text-[9px] ml-auto border ${riskColor(report.sections.risk.level)}`}>
                      RIESGO {report.sections.risk.level === "HIGH" ? "ALTO" : report.sections.risk.level === "MEDIUM" ? "MEDIO" : "BAJO"}
                    </Badge>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{report.sections.risk.content}</p>
                </div>
                {/* 9. Reporte Completo */}
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">9. Reporte Completo y Recomendación</span>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <Badge variant="outline" className={`text-sm font-bold px-4 py-1 border ${recColor(report.sections.fullReport.recommendation)}`}>
                      {report.sections.fullReport.recommendation === "BUY" ? "COMPRAR" : report.sections.fullReport.recommendation === "SELL" ? "VENDER" : "MANTENER"}
                    </Badge>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${report.sections.fullReport.confidence >= 75 ? "text-emerald-400" : "text-amber-400"}`}>
                        {report.sections.fullReport.confidence}% confianza
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{report.sections.fullReport.summary}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => mutation.mutate(ticker!)}
                      disabled={mutation.isPending}
                      className="text-[10px] text-muted-foreground hover:text-foreground border border-border/40 px-2 py-1 rounded transition-colors"
                    >
                      {mutation.isPending ? "Regenerando..." : "↻ Regenerar Reporte"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Flow Intelligence Table ──────────────────────────────────────────────────

// ─── Leyenda del Flow Intelligence ──────────────────────────────────────────
const FLOW_LEGEND = [
  { term: "OPTION", desc: "Nombre del contrato de opción. Formato: TICKER + AÑO + MES + DÍA + TIPO (C=Call/P=Put) + STRIKE x100." },
  { term: "TYPE", desc: "Tipo de ejecución: SWEEP = orden agresiva que barre múltiples exchanges rápido; BURST = ráfaga de órdenes en corto tiempo; BLOCK = operación grande única; SINGLE = orden simple." },
  { term: "DIR", desc: "Dirección: BUY = compra (alcista en CALLs, bajista en PUTs); SELL = venta. El porcentaje indica cuántos trades fueron en esa dirección." },
  { term: "CONTRACTS", desc: "Número de contratos negociados. Cada contrato representa 100 acciones." },
  { term: "NOTIONAL", desc: "Valor total nocional de la posición (contratos × precio de acción × 100). Indica el tamaño real de la apuesta." },
  { term: "PREMIUM", desc: "Prima total pagada por la opción (contratos × precio de la opción × 100). Es el dinero real gastado." },
  { term: "TRADES", desc: "Número de ejecuciones parciales que forman esta orden. Muchos trades en poco tiempo = sweep agresivo." },
  { term: "TIME (NY ET)", desc: "Hora de la primera ejecución en Eastern Time (Nueva York, UTC-5). Mercado abre 9:30 AM y cierra 4:00 PM ET." },
  { term: "DUR(MS)", desc: "Duración en milisegundos entre el primer y último trade de la orden. Menos de 1000ms = muy agresivo." },
  { term: "FIRST / LAST", desc: "Precio del primer y último fill de la orden. Si LAST > FIRST en un BUY, la demanda era urgente." },
  { term: "BID / ASK", desc: "Precio de compra (Bid) y venta (Ask) en el momento de la orden. Comparar con FIRST/LAST para saber si se ejecutó al mejor precio." },
  { term: "EXCH", desc: "Número de exchanges donde se ejecutó. Más de 3 exchanges = sweep (barre toda la liquidez disponible)." },
  { term: "CONF", desc: "Confianza del algoritmo (0-100%). >90% = señal muy clara; 75-89% = señal moderada; <75% = señal débil." },
  { term: "BULL/BEAR/MIXED", desc: "Clasificación de la intención: BULL = flujo mayoritariamente alcista; BEAR = bajista; MIXED = sin dirección clara." },
  { term: "Gamma Flip", desc: "Nivel de precio donde los dealers cambian de cobertura. Por encima = mercado estable (gamma largo); Por debajo = movimientos amplificados." },
  { term: "ACUMULACIÓN", desc: "Pestaña que muestra flujos institucionales a mediano/largo plazo (5+ DTE). Indica las posiciones que las instituciones están construyendo para semanas/meses." },
  { term: "CALL OI / PUT OI", desc: "Open Interest acumulado en contratos CALL y PUT para ese strike en la sesión. Número alto = posición institucional significativa." },
  { term: "CALL $ / PUT $", desc: "Valor nocional total en dólares del interés abierto en Calls y Puts para ese strike. Indica el tamaño real de la apuesta institucional." },
  { term: "RATIO C/P", desc: "Proporción de CALLS vs PUTS en la barra de progreso. Verde = predominio de Calls (alcista); Rojo = predominio de Puts (bajista)." },
  { term: "SESIÓN DTE", desc: "Promedio de días hasta vencimiento de los contratos acumulados en ese strike. Más DTE = mayor plazo de la apuesta institucional." },
  { term: "VENCIMIENTO(S)", desc: "Fechas de expiración de los contratos detectados en ese strike. Múltiples fechas = posición escalonada (ladder)." },
  { term: "BIAS", desc: "Sesión direccional: ALCISTA (>65% Calls), BAJISTA (<35% Calls), NEUTRAL (35-65%). Indica la intención predominante de las instituciones." },
];

function FlowLegendPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute top-12 right-0 z-50 w-[520px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Leyenda — Flow Intelligence</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="overflow-y-auto max-h-[400px] p-3 space-y-2">
        {FLOW_LEGEND.map((item) => (
          <div key={item.term} className="flex gap-2">
            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0 mt-0.5 h-fit tracking-wider">{item.term}</span>
            <span className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AccumulationTickerModal ───────────────────────────────────────────────────
type AccumulationRow = {
  ticker: string; strike: string; callOI: number; putOI: number;
  callNotional: number; putNotional: number; ratio: number;
  bias: string; expiries: string; dte: string;
  contractsByExpiry: { expiry: string; callContracts: number; putContracts: number; callNotional: number; putNotional: number }[];
};

function AccumulationTickerModal({
  ticker, rows, allRows, onClose,
}: {
  ticker: string;
  rows: AccumulationRow[];
  allRows: AccumulationRow[];
  onClose: () => void;
}) {
  const [expandedStrike, setExpandedStrike] = useState<string | null>(null);
  const totalCallOI = rows.reduce((s, r) => s + r.callOI, 0);
  const totalPutOI = rows.reduce((s, r) => s + r.putOI, 0);
  const totalCallNotional = rows.reduce((s, r) => s + r.callNotional, 0);
  const totalPutNotional = rows.reduce((s, r) => s + r.putNotional, 0);
  const totalNotional = totalCallNotional + totalPutNotional;
  const totalContracts = rows.reduce((s, r) => s + r.callOI + r.putOI, 0);
  const overallRatio = totalCallOI + totalPutOI > 0 ? totalCallOI / (totalCallOI + totalPutOI) : 0;
  const overallBias = overallRatio > 0.65 ? "ALCISTA" : overallRatio < 0.35 ? "BAJISTA" : "NEUTRAL";
  const biasColor = overallBias === "ALCISTA" ? "text-emerald-400" : overallBias === "BAJISTA" ? "text-red-400" : "text-amber-400";
  const biasRingColor = overallBias === "ALCISTA" ? "border-emerald-500/40 bg-emerald-500/5" : overallBias === "BAJISTA" ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5";
  const biasGradient = overallBias === "ALCISTA" ? "from-emerald-500/10" : overallBias === "BAJISTA" ? "from-red-500/10" : "from-amber-500/10";

  // Rank this ticker among all tickers by total notional
  const uniqueTickers = Array.from(new Set(allRows.map(r => r.ticker)));
  const tickerTotals: Record<string, number> = {};
  for (const t of uniqueTickers) {
    const tr = allRows.filter(r => r.ticker === t);
    tickerTotals[t] = tr.reduce((s, r) => s + r.callNotional + r.putNotional, 0);
  }
  const rankList = Object.entries(tickerTotals).sort((a, b) => (b[1] as number) - (a[1] as number));
  const rankIdx = rankList.findIndex(([t]) => t === ticker);
  const rank = rankIdx >= 0 ? rankIdx + 1 : "N/A";

  const fmtNotional = (n: number) => n >= 1 ? `$${n.toFixed(1)}M` : `$${(n * 1000).toFixed(0)}K`;
  const fmtDate = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  };
  const calcDte = (d: string) => Math.round((new Date(d).getTime() - Date.now()) / 86400000);

  // Aggregate contracts per expiry across all strikes
  const allExpiries = useMemo(() => {
    const expMap: Record<string, { callContracts: number; putContracts: number; callNotional: number; putNotional: number }> = {};
    for (const row of rows) {
      for (const ce of row.contractsByExpiry) {
        if (!expMap[ce.expiry]) expMap[ce.expiry] = { callContracts: 0, putContracts: 0, callNotional: 0, putNotional: 0 };
        expMap[ce.expiry].callContracts += ce.callContracts;
        expMap[ce.expiry].putContracts += ce.putContracts;
        expMap[ce.expiry].callNotional += ce.callNotional;
        expMap[ce.expiry].putNotional += ce.putNotional;
      }
    }
    return Object.entries(expMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([expiry, data]) => ({ expiry, ...data, totalContracts: data.callContracts + data.putContracts, totalNotional: data.callNotional + data.putNotional }));
  }, [rows]);

  const sortedRows = [...rows].sort((a, b) => (b.callNotional + b.putNotional) - (a.callNotional + a.putNotional));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-card-border max-w-3xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* Header with gradient */}
        <div className={`px-5 pt-4 pb-3 bg-gradient-to-r ${biasGradient} to-transparent border-b border-border/60`}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-wider font-mono">{ticker}</span>
                <span className="text-sm text-muted-foreground">— Acumulación Institucional</span>
                <Badge variant="outline" className={`text-[10px] font-bold border px-2 py-0.5 ${biasRingColor} ${biasColor}`}>
                  {overallBias}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-muted-foreground">Rank #{rank} por nocional</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{rows.length} strike{rows.length !== 1 ? "s" : ""} detectado{rows.length !== 1 ? "s" : ""}</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{totalContracts.toLocaleString()} contratos totales</span>
              </div>
            </div>
            <button onClick={onClose} className="w-6 h-6 rounded-full bg-muted/40 hover:bg-muted/70 flex items-center justify-center transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Call OI Total", value: totalCallOI.toLocaleString(), sub: `${Math.round(overallRatio*100)}% del total`, color: "text-emerald-400", border: "border-emerald-500/20 bg-emerald-500/5" },
                { label: "Put OI Total", value: totalPutOI.toLocaleString(), sub: `${100 - Math.round(overallRatio*100)}% del total`, color: "text-red-400", border: "border-red-500/20 bg-red-500/5" },
                { label: "Call Nocional", value: fmtNotional(totalCallNotional), sub: "posición larga", color: "text-emerald-400", border: "border-emerald-500/20 bg-emerald-500/5" },
                { label: "Put Nocional", value: fmtNotional(totalPutNotional), sub: "posición bajista", color: "text-red-400", border: "border-red-500/20 bg-red-500/5" },
              ].map(item => (
                <div key={item.label} className={`p-2.5 rounded-lg border ${item.border} text-center`}>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">{item.label}</div>
                  <div className={`text-sm font-bold tabular-nums ${item.color}`}>{item.value}</div>
                  <div className="text-[9px] text-muted-foreground/60 mt-0.5">{item.sub}</div>
                </div>
              ))}
            </div>

            {/* Overall ratio bar */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ratio Calls / Puts global</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-emerald-400 font-bold">{Math.round(overallRatio * 100)}% CALLS</span>
                  <span className="text-[10px] text-muted-foreground">/</span>
                  <span className="text-[10px] text-red-400 font-bold">{100 - Math.round(overallRatio * 100)}% PUTS</span>
                </div>
              </div>
              <div className="flex h-4 rounded-lg overflow-hidden bg-muted/40 border border-border/30">
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full transition-all flex items-center justify-center" style={{ width: `${Math.round(overallRatio * 100)}%` }}>
                  {Math.round(overallRatio * 100) > 20 && <span className="text-[9px] font-bold text-emerald-950">{Math.round(overallRatio * 100)}%</span>}
                </div>
                <div className="bg-gradient-to-r from-red-400 to-red-500 h-full transition-all flex items-center justify-center" style={{ width: `${100 - Math.round(overallRatio * 100)}%` }}>
                  {(100 - Math.round(overallRatio * 100)) > 20 && <span className="text-[9px] font-bold text-red-950">{100 - Math.round(overallRatio * 100)}%</span>}
                </div>
              </div>
              <div className="flex items-center justify-center mt-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-2">Nocional Total:</span>
                <span className="text-sm font-bold text-primary">{fmtNotional(totalNotional)}</span>
              </div>
            </div>

            {/* Contracts per expiry — key section */}
            {allExpiries.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contratos por Vencimiento</span>
                  <Badge variant="outline" className="text-[9px] border-primary/30 text-primary bg-primary/5 ml-auto">{allExpiries.length} fechas</Badge>
                </div>
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/40">
                        {["VENCIMIENTO","DTE","CALL CTRS","PUT CTRS","TOTAL CTRS","CALL $","PUT $","RATIO"].map(h => (
                          <th key={h} className="py-2 px-2.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allExpiries.map((ex, i) => {
                        const dte = calcDte(ex.expiry);
                        const isPast = dte < 0;
                        const isNear = dte >= 0 && dte <= 7;
                        const exRatio = ex.totalContracts > 0 ? ex.callContracts / ex.totalContracts : 0;
                        return (
                          <tr key={i} className={`border-b border-border/20 hover:bg-muted/10 transition-colors ${isPast ? "opacity-40" : ""} ${isNear ? "bg-amber-500/5" : ""}`}>
                            <td className="py-2 px-2.5">
                              <span className={`font-mono font-semibold text-[11px] ${isNear ? "text-amber-400" : "text-foreground"}`}>{fmtDate(ex.expiry)}</span>
                              {isPast && <span className="ml-1.5 text-[9px] text-muted-foreground/60 bg-muted/30 px-1 rounded">VENCIDO</span>}
                              {isNear && !isPast && <span className="ml-1.5 text-[9px] text-amber-400 bg-amber-500/10 px-1 rounded border border-amber-500/30">PRÓX</span>}
                            </td>
                            <td className="py-2 px-2.5 tabular-nums">
                              <span className={`text-[10px] font-mono ${dte < 0 ? "text-muted-foreground" : dte <= 7 ? "text-amber-400" : "text-muted-foreground"}`}>{dte < 0 ? `${Math.abs(dte)}d` : `${dte}d`}</span>
                            </td>
                            <td className="py-2 px-2.5 tabular-nums text-emerald-400 font-semibold">{ex.callContracts.toLocaleString()}</td>
                            <td className="py-2 px-2.5 tabular-nums text-red-400 font-semibold">{ex.putContracts.toLocaleString()}</td>
                            <td className="py-2 px-2.5 tabular-nums font-bold text-foreground">{ex.totalContracts.toLocaleString()}</td>
                            <td className="py-2 px-2.5 tabular-nums text-emerald-400 text-[10px]">{fmtNotional(ex.callNotional)}</td>
                            <td className="py-2 px-2.5 tabular-nums text-red-400 text-[10px]">{fmtNotional(ex.putNotional)}</td>
                            <td className="py-2 px-2.5">
                              <div className="flex items-center gap-1.5">
                                <div className="flex h-2.5 w-16 rounded overflow-hidden bg-muted/40">
                                  <div className="bg-emerald-400/80 h-full" style={{ width: `${Math.round(exRatio*100)}%` }} />
                                  <div className="bg-red-400/80 h-full" style={{ width: `${100-Math.round(exRatio*100)}%` }} />
                                </div>
                                <span className={`text-[9px] font-medium ${exRatio > 0.6 ? "text-emerald-400" : exRatio < 0.4 ? "text-red-400" : "text-amber-400"}`}>{Math.round(exRatio*100)}%C</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Per-strike breakdown */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Strikes Detectados ({rows.length})</span>
              </div>
              {rows.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">Sin datos de acumulación para {ticker}</div>
              ) : (
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/40">
                        {["STRIKE","CALL OI","PUT OI","CALL $","PUT $","RATIO C/P","DTE","VENCIMIENTOS","BIAS",""].map(h => (
                          <th key={h} className="py-2 px-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, i) => {
                        const rb = row.bias === "ALCISTA" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : row.bias === "BAJISTA" ? "text-red-400 bg-red-500/10 border-red-500/30" : "text-amber-400 bg-amber-500/10 border-amber-500/30";
                        const rp = Math.round(row.ratio * 100);
                        const isExpanded = expandedStrike === row.strike;
                        return (
                          <>
                            <tr key={i} className="border-b border-border/20 hover:bg-muted/10 cursor-pointer" onClick={() => setExpandedStrike(isExpanded ? null : row.strike)}>
                              <td className="py-1.5 px-2 font-mono font-bold text-foreground">{row.strike}</td>
                              <td className="py-1.5 px-2 tabular-nums text-emerald-400">{row.callOI.toLocaleString()}</td>
                              <td className="py-1.5 px-2 tabular-nums text-red-400">{row.putOI.toLocaleString()}</td>
                              <td className="py-1.5 px-2 tabular-nums text-emerald-400">{fmtNotional(row.callNotional)}</td>
                              <td className="py-1.5 px-2 tabular-nums text-red-400">{fmtNotional(row.putNotional)}</td>
                              <td className="py-1.5 px-2">
                                <div className="flex items-center gap-1">
                                  <div className="flex h-2 w-12 rounded overflow-hidden bg-muted/40">
                                    <div className="bg-emerald-400/80 h-full" style={{ width: `${rp}%` }} />
                                    <div className="bg-red-400/80 h-full" style={{ width: `${100 - rp}%` }} />
                                  </div>
                                  <span className="text-[9px] text-muted-foreground">{rp}%</span>
                                </div>
                              </td>
                              <td className="py-1.5 px-2 text-muted-foreground text-[10px]">{row.dte}</td>
                              <td className="py-1.5 px-2 text-[9px] text-muted-foreground font-mono">{row.expiries}</td>
                              <td className="py-1.5 px-2">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${rb}`}>{row.bias}</span>
                              </td>
                              <td className="py-1.5 px-2 text-muted-foreground">
                                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                              </td>
                            </tr>
                            {isExpanded && row.contractsByExpiry.length > 0 && (
                              <tr key={`${i}-exp`} className="bg-muted/10">
                                <td colSpan={10} className="py-2 px-4">
                                  <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Desglose por vencimiento — Strike {row.strike}</div>
                                  <div className="grid gap-1">
                                    {row.contractsByExpiry.map((ce, ci) => {
                                      const ceRatio = (ce.callContracts + ce.putContracts) > 0 ? ce.callContracts / (ce.callContracts + ce.putContracts) : 0;
                                      const ceDte = calcDte(ce.expiry);
                                      return (
                                        <div key={ci} className="flex items-center gap-3 py-1 px-2 rounded bg-muted/20 border border-border/20">
                                          <span className="font-mono text-[10px] font-semibold text-primary w-24 flex-shrink-0">{fmtDate(ce.expiry)}</span>
                                          <span className="text-[9px] text-muted-foreground w-10">{ceDte >= 0 ? `${ceDte}d` : "venc."}</span>
                                          <span className="text-[9px] text-emerald-400">{ce.callContracts.toLocaleString()} C</span>
                                          <span className="text-[9px] text-red-400">{ce.putContracts.toLocaleString()} P</span>
                                          <span className="text-[9px] text-foreground font-bold">{(ce.callContracts + ce.putContracts).toLocaleString()} total</span>
                                          <div className="flex h-2 w-20 rounded overflow-hidden bg-muted/40 ml-1">
                                            <div className="bg-emerald-400/80 h-full" style={{ width: `${Math.round(ceRatio*100)}%` }} />
                                            <div className="bg-red-400/80 h-full" style={{ width: `${100-Math.round(ceRatio*100)}%` }} />
                                          </div>
                                          <span className="text-[9px] text-muted-foreground">{Math.round(ceRatio*100)}%C</span>
                                          <span className="text-[9px] text-muted-foreground ml-auto">{fmtNotional(ce.callNotional + ce.putNotional)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}


// ─── Institutional Flow Panel (Smart Money) ──────────────────────────────────

interface InstitutionalSignalUI {
  id: string;
  symbol: string;
  type: "equity_block" | "options_sweep" | "options_block" | "dark_pool";
  side: "BUY" | "SELL";
  size: number;
  notional: number;
  price: number;
  vwap?: number;
  percentOfVolume: number;
  exchange: string;
  time: string;
  timestamp: string;
  confidence: number;
  description: string;
  optionContract?: string;
  callPut?: "CALL" | "PUT";
  strike?: number;
  expiry?: string;
  premium?: number;
  smartMoneyScore: number;
}

const INST_FLOW_LEGEND = [
  { term: "EQUITY TAB", desc: "Muestra block trades institucionales — compras/ventas grandes de acciones (>5,000 shares). Estos trades representan movimientos de fondos, hedge funds, y bancos de inversión." },
  { term: "OPTIONS TAB", desc: "Muestra sweeps y blocks de opciones institucionales. SWEEP = orden agresiva que barre múltiples exchanges simultáneamente (urgencia). BLOCK = una sola orden grande negociada OTC." },
  { term: "SIDE (BUY/SELL)", desc: "Dirección del trade. BUY = acumulación institucional (bullish). SELL = distribución institucional (bearish). En equity, BUY con alto %VOL es la señal más fuerte." },
  { term: "SHARES / CONTRACTS", desc: "Tamaño de la operación. En equity: número de acciones. En opciones: número de contratos (cada contrato = 100 acciones). Más grande = más convicción institucional." },
  { term: "NOTIONAL / PREMIUM", desc: "Valor total en dólares. NOTIONAL = shares × precio. PREMIUM = contratos × precio opción × 100. Trades >$1M son altamente significativos, >$5M son raros y muy informativos." },
  { term: "%VOL", desc: "Porcentaje del volumen diario que representa este trade. >0.5% es significativo, >1% es muy grande. Indica impacto real en el mercado." },
  { term: "SMART MONEY SCORE", desc: "Puntuación 1-10 basada en: tamaño del trade ($), % del volumen diario, volatilidad del ticker, y timing. ●●●●●●●●●● (7+) = señal institucional fuerte (dorado). ●●●●●●(4-6) = señal moderada (teal). ●●● (1-3) = señal débil." },
  { term: "C/P (CALL/PUT)", desc: "Solo en opciones. CALL = apuesta alcista. PUT = apuesta bajista. Combinado con SIDE: BUY CALL = muy bullish, BUY PUT = muy bearish, SELL CALL = bearish (vendiendo upside), SELL PUT = bullish (vendiendo downside)." },
  { term: "STRIKE", desc: "Precio de ejercicio de la opción. Comparar con precio actual: ITM (in-the-money) = más convicción, OTM (out-of-the-money) = más especulativo pero mayor potencial." },
  { term: "EXCH", desc: "Exchange donde se ejecutó. NYSE/NASDAQ = mercado abierto. CBOE/ISE/PHLX = exchanges de opciones. IEX = exchange con protección anti-HFT." },
];

function InstitutionalFlowPanel({ institutionalFlow, lastUpdated }: { institutionalFlow: InstitutionalSignalUI[]; lastUpdated?: number }) {
  const [activeTab, setActiveTab] = useState<"equity" | "options">("equity");
  const [tickerFilter, setTickerFilter] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) setShowLegend(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const equitySignals = institutionalFlow.filter(s => s.type === "equity_block");
  const optionsSignals = institutionalFlow.filter(s => s.type === "options_sweep" || s.type === "options_block");

  const signals = activeTab === "equity" ? equitySignals : optionsSignals;
  const filtered = tickerFilter
    ? signals.filter(s => s.symbol.toLowerCase().includes(tickerFilter.toLowerCase()))
    : signals;

  const fmtMoney = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(v/1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-[hsl(var(--foreground))]">Institutional Flow</h3>
          <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded font-mono">{institutionalFlow.length} signals</span>
          {/* Live pulse */}
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-emerald-400 font-mono uppercase tracking-widest">Live</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Last updated timestamp */}
          {lastUpdated && (
            <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono tabular-nums">
              Actualizado: {new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "America/New_York" })} ET
            </span>
          )}
          {/* Legend toggle */}
          <div className="relative" ref={legendRef}>
            <button
              className={`p-1.5 rounded transition-colors ${showLegend ? "bg-amber-500/20 text-amber-400" : "text-[hsl(var(--muted-foreground))] hover:text-amber-400"}`}
              onClick={() => setShowLegend(!showLegend)}
              data-testid="inst-legend-btn"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
            {showLegend && (
              <div className="absolute right-0 top-full mt-1 w-[420px] max-h-[500px] overflow-y-auto bg-[hsl(var(--card))] border border-amber-500/30 rounded-lg shadow-2xl z-50 p-4">
                <div className="flex items-center gap-2 mb-3 border-b border-[hsl(var(--border))] pb-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400">Leyenda — Institutional Flow</span>
                </div>
                <div className="space-y-3">
                  {INST_FLOW_LEGEND.map((item, i) => (
                    <div key={i}>
                      <div className="text-[10px] font-bold text-amber-400 mb-0.5">{item.term}</div>
                      <div className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">{item.desc}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-2 border-t border-[hsl(var(--border))]">
                  <div className="text-[9px] text-[hsl(var(--muted-foreground))] italic">
                    💡 Tip: Haz click en cualquier fila para ver información detallada del trade.
                  </div>
                </div>
              </div>
            )}
          </div>
          <input
            className="bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded px-2 py-1 text-xs w-24 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
            placeholder="Ticker..."
            value={tickerFilter}
            onChange={e => setTickerFilter(e.target.value)}
            data-testid="inst-flow-ticker-filter"
          />
          <div className="flex rounded overflow-hidden border border-[hsl(var(--border))]">
            <button
              className={`px-3 py-1 text-[10px] font-bold transition-colors ${activeTab === "equity" ? "bg-teal-600 text-white" : "bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"}`}
              onClick={() => { setActiveTab("equity"); setExpandedRow(null); }}
              data-testid="inst-tab-equity"
            >EQUITY ({equitySignals.length})</button>
            <button
              className={`px-3 py-1 text-[10px] font-bold transition-colors ${activeTab === "options" ? "bg-teal-600 text-white" : "bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"}`}
              onClick={() => { setActiveTab("options"); setExpandedRow(null); }}
              data-testid="inst-tab-options"
            >OPTIONS ({optionsSignals.length})</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[hsl(var(--card))] z-10">
            <tr className="border-b border-[hsl(var(--border))]">
              <th className="px-3 py-2 text-left text-[10px] font-medium text-[hsl(var(--muted-foreground))]">TIME</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-[hsl(var(--muted-foreground))]">TICKER</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-[hsl(var(--muted-foreground))]">SIDE</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-[hsl(var(--muted-foreground))]">{activeTab === "equity" ? "SHARES" : "CONTRACTS"}</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-[hsl(var(--muted-foreground))]">{activeTab === "equity" ? "NOTIONAL" : "PREMIUM"}</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-[hsl(var(--muted-foreground))]">PRICE</th>
              {activeTab === "options" && <th className="px-3 py-2 text-center text-[10px] font-medium text-[hsl(var(--muted-foreground))]">C/P</th>}
              {activeTab === "options" && <th className="px-3 py-2 text-right text-[10px] font-medium text-[hsl(var(--muted-foreground))]">STRIKE</th>}
              <th className="px-3 py-2 text-center text-[10px] font-medium text-[hsl(var(--muted-foreground))]">%VOL</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-[hsl(var(--muted-foreground))]">SMART</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-[hsl(var(--muted-foreground))]">EXCH</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">No institutional signals</td></tr>
            )}
            {filtered.slice(0, 50).map(sig => (
              <Fragment key={sig.id}>
                <tr
                  className={`border-b border-[hsl(var(--border))]/50 hover:bg-[hsl(var(--accent))]/30 transition-colors cursor-pointer ${expandedRow === sig.id ? "bg-amber-500/10" : ""}`}
                  onClick={() => setExpandedRow(expandedRow === sig.id ? null : sig.id)}
                  data-testid={`inst-row-${sig.id}`}
                >
                  <td className="px-3 py-1.5 font-mono text-[hsl(var(--muted-foreground))]">{sig.time}</td>
                  <td className="px-3 py-1.5 font-bold text-[hsl(var(--foreground))]">
                    <div className="flex items-center gap-1">
                      {sig.symbol}
                      <ChevronDown className={`w-3 h-3 text-[hsl(var(--muted-foreground))] transition-transform ${expandedRow === sig.id ? "rotate-180" : ""}`} />
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sig.side === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                      {sig.side}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[hsl(var(--foreground))]">{sig.size.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-amber-400">{fmtMoney(activeTab === "options" ? (sig.premium || sig.notional) : sig.notional)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-[hsl(var(--foreground))]">${sig.price.toFixed(2)}</td>
                  {activeTab === "options" && (
                    <td className="px-3 py-1.5 text-center">
                      <span className={`text-[10px] font-bold ${sig.callPut === "CALL" ? "text-emerald-400" : "text-rose-400"}`}>{sig.callPut}</span>
                    </td>
                  )}
                  {activeTab === "options" && (
                    <td className="px-3 py-1.5 text-right font-mono text-[hsl(var(--foreground))]">${sig.strike?.toFixed(0)}</td>
                  )}
                  <td className="px-3 py-1.5 text-center font-mono text-[hsl(var(--muted-foreground))]">{sig.percentOfVolume.toFixed(1)}%</td>
                  <td className="px-3 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < sig.smartMoneyScore ? (sig.smartMoneyScore >= 7 ? "bg-amber-400" : sig.smartMoneyScore >= 4 ? "bg-teal-400" : "bg-gray-500") : "bg-gray-700"}`} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">{sig.exchange}</td>
                </tr>
                {/* Expanded detail row */}
                {expandedRow === sig.id && (
                  <tr className="bg-amber-500/5 border-b border-amber-500/20">
                    <td colSpan={11} className="px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
                        <div className="bg-[hsl(var(--background))] rounded p-2 border border-[hsl(var(--border))]">
                          <div className="text-[hsl(var(--muted-foreground))] mb-0.5">Descripción</div>
                          <div className="text-[hsl(var(--foreground))] font-medium">{sig.description}</div>
                        </div>
                        <div className="bg-[hsl(var(--background))] rounded p-2 border border-[hsl(var(--border))]">
                          <div className="text-[hsl(var(--muted-foreground))] mb-0.5">Smart Money Score</div>
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${sig.smartMoneyScore >= 7 ? "text-amber-400" : sig.smartMoneyScore >= 4 ? "text-teal-400" : "text-gray-400"}`}>{sig.smartMoneyScore}/10</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${sig.smartMoneyScore >= 7 ? "bg-amber-500/20 text-amber-400" : sig.smartMoneyScore >= 4 ? "bg-teal-500/20 text-teal-400" : "bg-gray-500/20 text-gray-400"}`}>
                              {sig.smartMoneyScore >= 7 ? "ALTA CONVICCIÓN" : sig.smartMoneyScore >= 4 ? "MODERADO" : "DÉBIL"}
                            </span>
                          </div>
                        </div>
                        <div className="bg-[hsl(var(--background))] rounded p-2 border border-[hsl(var(--border))]">
                          <div className="text-[hsl(var(--muted-foreground))] mb-0.5">Confianza</div>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${sig.confidence >= 90 ? "bg-emerald-500" : sig.confidence >= 75 ? "bg-teal-500" : "bg-gray-500"}`} style={{ width: `${sig.confidence}%` }} />
                            </div>
                            <span className="text-[hsl(var(--foreground))] font-mono font-bold">{sig.confidence}%</span>
                          </div>
                        </div>
                        <div className="bg-[hsl(var(--background))] rounded p-2 border border-[hsl(var(--border))]">
                          <div className="text-[hsl(var(--muted-foreground))] mb-0.5">Impacto en Volumen</div>
                          <div className="text-[hsl(var(--foreground))]">
                            <span className={`font-mono font-bold ${sig.percentOfVolume >= 1 ? "text-amber-400" : sig.percentOfVolume >= 0.5 ? "text-teal-400" : "text-[hsl(var(--foreground))]"}`}>{sig.percentOfVolume.toFixed(2)}%</span>
                            <span className="text-[hsl(var(--muted-foreground))] ml-1">del vol. diario</span>
                          </div>
                        </div>
                        {activeTab === "equity" && sig.vwap && (
                          <div className="bg-[hsl(var(--background))] rounded p-2 border border-[hsl(var(--border))]">
                            <div className="text-[hsl(var(--muted-foreground))] mb-0.5">VWAP</div>
                            <div className="text-[hsl(var(--foreground))] font-mono">${sig.vwap.toFixed(2)}
                              <span className={`ml-1 text-[9px] ${sig.price > sig.vwap ? "text-emerald-400" : "text-rose-400"}`}>
                                ({sig.price > sig.vwap ? "ABOVE" : "BELOW"})
                              </span>
                            </div>
                          </div>
                        )}
                        {activeTab === "options" && (
                          <>
                            <div className="bg-[hsl(var(--background))] rounded p-2 border border-[hsl(var(--border))]">
                              <div className="text-[hsl(var(--muted-foreground))] mb-0.5">Contrato</div>
                              <div className="text-[hsl(var(--foreground))] font-mono text-[9px]">{sig.optionContract}</div>
                            </div>
                            <div className="bg-[hsl(var(--background))] rounded p-2 border border-[hsl(var(--border))]">
                              <div className="text-[hsl(var(--muted-foreground))] mb-0.5">Expiración</div>
                              <div className="text-[hsl(var(--foreground))] font-mono">{sig.expiry}</div>
                            </div>
                            <div className="bg-[hsl(var(--background))] rounded p-2 border border-[hsl(var(--border))]">
                              <div className="text-[hsl(var(--muted-foreground))] mb-0.5">Señal</div>
                              <div className={`font-bold ${
                                (sig.side === "BUY" && sig.callPut === "CALL") || (sig.side === "SELL" && sig.callPut === "PUT") ? "text-emerald-400" : "text-rose-400"
                              }`}>
                                {(sig.side === "BUY" && sig.callPut === "CALL") ? "🟢 MUY BULLISH" :
                                 (sig.side === "BUY" && sig.callPut === "PUT") ? "🔴 MUY BEARISH" :
                                 (sig.side === "SELL" && sig.callPut === "PUT") ? "🟢 BULLISH (venta de put)" :
                                 "🔴 BEARISH (venta de call)"}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Exposure Dashboard (Dark Pool + Flow + Sentiment + GEX/DEX + Expected Move) ─

interface TickerExposureUI {
  symbol: string;
  price: number;
  darkPoolVolume: number;
  darkPoolPercent: number;
  darkPoolSentiment: "bullish" | "bearish" | "neutral";
  darkPoolNetDelta: number;
  flowBias: "bullish" | "bearish" | "neutral";
  flowBullPct: number;
  flowBearPct: number;
  newsSentiment: "bullish" | "bearish" | "neutral";
  overallSentiment: "bullish" | "bearish" | "neutral";
  sentimentScore: number;
  gammaExposure: number;
  deltaExposure: number;
  gammaFlip: number | null;
  expectedMove: number;
  expectedMovePct: number;
  expectedMoveHigh: number;
  expectedMoveLow: number;
  atmIv: number;
}

interface DarkPoolPrintUI {
  id: string;
  symbol: string;
  price: number;
  size: number;
  notional: number;
  time: string;
  timestamp: string;
  exchange: string;
  aboveVwap: boolean;
  percentOfVolume: number;
  blockSize: boolean;
  sentiment: "bullish" | "bearish" | "neutral";
}

const EXPOSURE_LEGEND = [
  { term: "DARK POOL (DP)", desc: "Exchanges privados donde instituciones ejecutan órdenes grandes sin mover el precio público. El DP% muestra qué porcentaje del volumen total se negocia 'en la oscuridad'. Normal: 38-55%. Más alto = más actividad institucional oculta.", category: "darkpool" },
  { term: "DP SENTIMENT", desc: "Se basa en si los trades de dark pool se ejecutan ABOVE o BELOW el VWAP. ABOVE VWAP = los compradores pagan más (bullish, demanda agresiva). BELOW VWAP = los vendedores aceptan menos (bearish, oferta agresiva).", category: "darkpool" },
  { term: "VS VWAP (Dark Pool Feed)", desc: "VWAP = Volume Weighted Average Price. Es el precio promedio ponderado por volumen del día. Trades ABOVE VWAP indican compra agresiva — el comprador acepta pagar más que el promedio. BELOW VWAP = venta agresiva.", category: "darkpool" },
  { term: "BLOCK (Dark Pool Feed)", desc: "Trade de >10,000 acciones. Los block trades son exclusivamente institucionales — ningún retail trader mueve esa cantidad. Un block ABOVE VWAP es una de las señales más fuertes de compra institucional.", category: "darkpool" },
  { term: "FLOW BIAS", desc: "Dirección del flujo de opciones basado en: BUY Call + SELL Put = Bullish | BUY Put + SELL Call = Bearish. Se pondera por el valor nocional × confianza de dirección. Bull% >55% = sesgo alcista claro.", category: "flow" },
  { term: "NEWS SENTIMENT", desc: "Análisis de sentimiento de las noticias recientes del ticker. Se calcula contando noticias bullish vs bearish en las últimas horas.", category: "flow" },
  { term: "SCORE (-100 a +100)", desc: "Puntuación compuesta que combina: Dark Pool sentiment (25pts), Flow bias (±50pts), News sentiment (±variable), y Price action (±variable). >+30 = fuerte bullish, <-30 = fuerte bearish, entre -15 y +15 = neutral.", category: "flow" },
  { term: "GEX (Gamma Exposure)", desc: "En millones. GEX positivo = dealers compran cuando baja y venden cuando sube → REDUCE volatilidad (mercado estable, movimientos lentos). GEX negativo = dealers amplifican movimientos → AUMENTA volatilidad (movimientos explosivos). Para 0DTE: +GEX = vender premium, -GEX = comprar opciones.", category: "greeks" },
  { term: "DEX (Delta Exposure)", desc: "En millones. Mide la exposición direccional neta de los market makers. DEX positivo = dealers están long (el mercado tiende a subir). DEX negativo = dealers están short (presión bajista). Cambios bruscos en DEX predicen movimientos de precio.", category: "greeks" },
  { term: "EM (Expected Move)", desc: "Rango esperado del precio para el día basado en la volatilidad implícita ATM. Fórmula: Precio × (IV/100) × √(1/252). El precio tiene ~68% probabilidad de quedarse dentro del rango EM+ / EM-. Si el precio rompe EM+ o EM-, espera un movimiento extendido.", category: "expected" },
  { term: "IV % (Implied Volatility)", desc: "Volatilidad implícita ATM. Mide cuánto espera el mercado que se mueva el precio. IV alta = opciones caras (bueno para vender premium). IV baja = opciones baratas (bueno para comprar). Compare con IV histórico del ticker para contexto.", category: "expected" },
];

const EXPOSURE_STRATEGY_TIPS = [
  { title: "🎯 Confluencia de señales", desc: "La señal más fuerte es cuando Dark Pool, Flow, y News apuntan en la misma dirección. Score >+50 o <-50 con las 3 señales alineadas = alta probabilidad." },
  { title: "🏦 Dark Pool vs Precio", desc: "Si el precio baja PERO el Dark Pool muestra compra agresiva (ABOVE VWAP, blocks grandes), las instituciones están acumulando en el dip. Es una de las señales contrarias más fiables." },
  { title: "⚡ GEX para timing de 0DTE", desc: "Con +GEX: el precio tiende a revertir a la media → vender premium (iron condors, credit spreads). Con -GEX: el precio explota en una dirección → comprar opciones direccionales." },
  { title: "📊 Expected Move como stop-loss", desc: "Usa EM+ y EM- como niveles naturales de take-profit y stop-loss. Si abres un trade bullish, tu stop debería estar cerca de EM-. Si el precio rompe EM+, es señal de momentum extremo." },
  { title: "🔄 Dark Pool Feed en tiempo real", desc: "Monitorea los block trades (>10K shares) en el feed. Una ráfaga de blocks en una dirección (todos ABOVE o todos BELOW VWAP) indica que una institución está construyendo una posición grande. Sigue al dinero grande." },
];

function ExposureDashboard({ exposures, darkPoolPrints, lastUpdated }: { exposures: TickerExposureUI[]; darkPoolPrints: DarkPoolPrintUI[]; lastUpdated?: number }) {
  const [activeTab, setActiveTab] = useState<"summary" | "darkpool">("summary");
  const [sortCol, setSortCol] = useState<string>("sentimentScore");
  const [sortAsc, setSortAsc] = useState(false);
  const [dpFilter, setDpFilter] = useState("");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) setShowLegend(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const sorted = [...exposures].sort((a: any, b: any) => {
    const av = a[sortCol], bv = b[sortCol];
    if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
    return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const filteredPrints = dpFilter
    ? darkPoolPrints.filter(p => p.symbol.toLowerCase().includes(dpFilter.toLowerCase()))
    : darkPoolPrints;

  const fmtMoney = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(v/1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  const sentBadge = (s: "bullish"|"bearish"|"neutral") => {
    const cls = s === "bullish" ? "bg-emerald-500/20 text-emerald-400" : s === "bearish" ? "bg-rose-500/20 text-rose-400" : "bg-gray-500/20 text-gray-400";
    return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${cls}`}>{s === "bullish" ? "BULL" : s === "bearish" ? "BEAR" : "NEUT"}</span>;
  };

  const SortHeader = ({ col, label, align = "right" }: { col: string; label: string; align?: string }) => (
    <th
      className={`px-2 py-2 text-[9px] font-medium text-[hsl(var(--muted-foreground))] cursor-pointer hover:text-[hsl(var(--foreground))] select-none ${align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right"}`}
      onClick={() => handleSort(col)}
    >
      {label} {sortCol === col ? (sortAsc ? "▲" : "▼") : ""}
    </th>
  );

  return (
    <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-bold text-[hsl(var(--foreground))]">Dark Pool + Flow Exposure</h3>
          <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded font-mono">{exposures.length} tickers</span>
          {/* Live pulse */}
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-emerald-400 font-mono uppercase tracking-widest">Live</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Last updated timestamp */}
          {lastUpdated && (
            <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono tabular-nums">
              Actualizado: {new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "America/New_York" })} ET
            </span>
          )}
          {/* Legend toggle */}
          <div className="relative" ref={legendRef}>
            <button
              className={`p-1.5 rounded transition-colors ${showLegend ? "bg-purple-500/20 text-purple-400" : "text-[hsl(var(--muted-foreground))] hover:text-purple-400"}`}
              onClick={() => setShowLegend(!showLegend)}
              data-testid="exposure-legend-btn"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
            {showLegend && (
              <div className="absolute right-0 top-full mt-1 w-[480px] max-h-[600px] overflow-y-auto bg-[hsl(var(--card))] border border-purple-500/30 rounded-lg shadow-2xl z-50 p-4">
                <div className="flex items-center gap-2 mb-3 border-b border-[hsl(var(--border))] pb-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-purple-400">Leyenda — Dark Pool + Flow Exposure</span>
                </div>

                {/* Columns legend */}
                {["darkpool", "flow", "greeks", "expected"].map(cat => {
                  const catLabel = cat === "darkpool" ? "Dark Pool" : cat === "flow" ? "Flow & Sentimiento" : cat === "greeks" ? "Greeks (GEX/DEX)" : "Expected Move & IV";
                  const catColor = cat === "darkpool" ? "text-cyan-400" : cat === "flow" ? "text-purple-400" : cat === "greeks" ? "text-amber-400" : "text-emerald-400";
                  return (
                    <div key={cat} className="mb-3">
                      <div className={`text-[10px] font-bold ${catColor} mb-1.5 uppercase`}>{catLabel}</div>
                      <div className="space-y-2">
                        {EXPOSURE_LEGEND.filter(l => l.category === cat).map((item, i) => (
                          <div key={i}>
                            <div className="text-[10px] font-bold text-[hsl(var(--foreground))] mb-0.5">{item.term}</div>
                            <div className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">{item.desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Strategy tips */}
                <div className="mt-3 pt-3 border-t border-purple-500/20">
                  <div className="text-[10px] font-bold text-purple-400 mb-2 uppercase">Estrategias para sacar provecho</div>
                  <div className="space-y-2.5">
                    {EXPOSURE_STRATEGY_TIPS.map((tip, i) => (
                      <div key={i} className="bg-purple-500/5 border border-purple-500/10 rounded p-2">
                        <div className="text-[10px] font-bold text-[hsl(var(--foreground))] mb-0.5">{tip.title}</div>
                        <div className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">{tip.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-[hsl(var(--border))]">
                  <div className="text-[9px] text-[hsl(var(--muted-foreground))] italic">
                    💡 Tip: Haz click en cualquier ticker en la tabla para ver un desglose detallado de todas las métricas.
                  </div>
                </div>
              </div>
            )}
          </div>
          {activeTab === "darkpool" && (
            <input
              className="bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded px-2 py-1 text-xs w-24 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
              placeholder="Ticker..."
              value={dpFilter}
              onChange={e => setDpFilter(e.target.value)}
              data-testid="dp-ticker-filter"
            />
          )}
          <div className="flex rounded overflow-hidden border border-[hsl(var(--border))]">
            <button
              className={`px-3 py-1 text-[10px] font-bold transition-colors ${activeTab === "summary" ? "bg-purple-600 text-white" : "bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"}`}
              onClick={() => { setActiveTab("summary"); setExpandedTicker(null); }}
              data-testid="exposure-tab-summary"
            >SUMMARY TABLE</button>
            <button
              className={`px-3 py-1 text-[10px] font-bold transition-colors ${activeTab === "darkpool" ? "bg-purple-600 text-white" : "bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"}`}
              onClick={() => { setActiveTab("darkpool"); setExpandedTicker(null); }}
              data-testid="exposure-tab-darkpool"
            >DARK POOL FEED ({darkPoolPrints.length})</button>
          </div>
        </div>
      </div>

      {/* Summary Table */}
      {activeTab === "summary" && (
        <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[hsl(var(--card))] z-10">
              <tr className="border-b border-[hsl(var(--border))]">
                <SortHeader col="symbol" label="TICKER" align="left" />
                <SortHeader col="price" label="PRICE" />
                <SortHeader col="darkPoolPercent" label="DP %" />
                <th className="px-2 py-2 text-center text-[9px] font-medium text-[hsl(var(--muted-foreground))]">DP SENT</th>
                <th className="px-2 py-2 text-center text-[9px] font-medium text-[hsl(var(--muted-foreground))]">FLOW</th>
                <SortHeader col="flowBullPct" label="BULL%" align="center" />
                <th className="px-2 py-2 text-center text-[9px] font-medium text-[hsl(var(--muted-foreground))]">NEWS</th>
                <SortHeader col="sentimentScore" label="SCORE" align="center" />
                <th className="px-2 py-2 text-center text-[9px] font-medium text-[hsl(var(--muted-foreground))]">OVERALL</th>
                <SortHeader col="gammaExposure" label="GEX (M)" />
                <SortHeader col="deltaExposure" label="DEX (M)" />
                <SortHeader col="expectedMovePct" label="EM %" />
                <SortHeader col="expectedMove" label="EM $" />
                <SortHeader col="atmIv" label="IV %" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(exp => {
                const scoreColor = exp.sentimentScore > 30 ? "text-emerald-400" : exp.sentimentScore > 0 ? "text-emerald-400/70" : exp.sentimentScore < -30 ? "text-rose-400" : exp.sentimentScore < 0 ? "text-rose-400/70" : "text-gray-400";
                const gexColor = exp.gammaExposure > 0 ? "text-emerald-400" : exp.gammaExposure < 0 ? "text-rose-400" : "text-gray-400";
                const dexColor = exp.deltaExposure > 0 ? "text-emerald-400" : exp.deltaExposure < 0 ? "text-rose-400" : "text-gray-400";
                const isExpanded = expandedTicker === exp.symbol;
                return (
                  <Fragment key={exp.symbol}>
                    <tr
                      className={`border-b border-[hsl(var(--border))]/50 hover:bg-[hsl(var(--accent))]/30 transition-colors cursor-pointer ${isExpanded ? "bg-purple-500/10" : ""}`}
                      onClick={() => setExpandedTicker(isExpanded ? null : exp.symbol)}
                      data-testid={`exposure-row-${exp.symbol}`}
                    >
                      <td className="px-2 py-1.5 font-bold text-[hsl(var(--foreground))]">
                        <div className="flex items-center gap-1">
                          {exp.symbol}
                          <ChevronDown className={`w-3 h-3 text-[hsl(var(--muted-foreground))] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-[hsl(var(--foreground))]">${exp.price.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-cyan-400">{exp.darkPoolPercent.toFixed(1)}%</td>
                      <td className="px-2 py-1.5 text-center">{sentBadge(exp.darkPoolSentiment)}</td>
                      <td className="px-2 py-1.5 text-center">{sentBadge(exp.flowBias)}</td>
                      <td className="px-2 py-1.5 text-center">
                        <div className="flex items-center gap-0.5 justify-center">
                          <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${exp.flowBullPct}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${exp.flowBearPct}%` }} />
                          </div>
                          <span className="text-[9px] font-mono text-[hsl(var(--muted-foreground))]">{exp.flowBullPct}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">{sentBadge(exp.newsSentiment)}</td>
                      <td className={`px-2 py-1.5 text-center font-mono font-bold ${scoreColor}`}>{exp.sentimentScore > 0 ? "+" : ""}{exp.sentimentScore}</td>
                      <td className="px-2 py-1.5 text-center">{sentBadge(exp.overallSentiment)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${gexColor}`}>{exp.gammaExposure > 0 ? "+" : ""}{exp.gammaExposure.toFixed(1)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${dexColor}`}>{exp.deltaExposure > 0 ? "+" : ""}{exp.deltaExposure.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-amber-400">{"±"}{exp.expectedMovePct.toFixed(2)}%</td>
                      <td className="px-2 py-1.5 text-right font-mono text-amber-400">{"±"}${exp.expectedMove.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-[hsl(var(--muted-foreground))]">{exp.atmIv.toFixed(1)}%</td>
                    </tr>
                    {/* Expanded detail */}
                    {isExpanded && (
                      <tr className="bg-purple-500/5 border-b border-purple-500/20">
                        <td colSpan={14} className="px-4 py-3">
                          <div className="grid grid-cols-3 gap-3">
                            {/* Dark Pool Details */}
                            <div className="bg-[hsl(var(--background))] rounded-lg p-3 border border-cyan-500/20">
                              <div className="text-[10px] font-bold text-cyan-400 mb-2 flex items-center gap-1"><Eye className="w-3 h-3" /> DARK POOL</div>
                              <div className="space-y-1.5 text-[10px]">
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Volumen DP:</span><span className="font-mono text-[hsl(var(--foreground))]">{(exp.darkPoolVolume/1e6).toFixed(1)}M shares</span></div>
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">% del Total:</span><span className="font-mono text-cyan-400">{exp.darkPoolPercent.toFixed(1)}%</span></div>
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Net Delta ($):</span><span className={`font-mono ${exp.darkPoolNetDelta > 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtMoney(exp.darkPoolNetDelta)}</span></div>
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Sentiment:</span>{sentBadge(exp.darkPoolSentiment)}</div>
                              </div>
                            </div>
                            {/* Flow & Sentiment */}
                            <div className="bg-[hsl(var(--background))] rounded-lg p-3 border border-purple-500/20">
                              <div className="text-[10px] font-bold text-purple-400 mb-2 flex items-center gap-1"><Layers className="w-3 h-3" /> FLOW & SENTIMIENTO</div>
                              <div className="space-y-1.5 text-[10px]">
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Flow Bias:</span>{sentBadge(exp.flowBias)}</div>
                                <div className="flex justify-between items-center"><span className="text-[hsl(var(--muted-foreground))]">Bull/Bear:</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-emerald-400 font-mono">{exp.flowBullPct}%</span>
                                    <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden flex">
                                      <div className="bg-emerald-500 h-full" style={{ width: `${exp.flowBullPct}%` }} />
                                      <div className="bg-rose-500 h-full" style={{ width: `${exp.flowBearPct}%` }} />
                                    </div>
                                    <span className="text-rose-400 font-mono">{exp.flowBearPct}%</span>
                                  </div>
                                </div>
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">News:</span>{sentBadge(exp.newsSentiment)}</div>
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Score Total:</span><span className={`font-mono font-bold text-sm ${scoreColor}`}>{exp.sentimentScore > 0 ? "+" : ""}{exp.sentimentScore}</span></div>
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Overall:</span>{sentBadge(exp.overallSentiment)}</div>
                              </div>
                            </div>
                            {/* Greeks & Expected Move */}
                            <div className="bg-[hsl(var(--background))] rounded-lg p-3 border border-amber-500/20">
                              <div className="text-[10px] font-bold text-amber-400 mb-2 flex items-center gap-1"><Target className="w-3 h-3" /> GREEKS & EXPECTED MOVE</div>
                              <div className="space-y-1.5 text-[10px]">
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">GEX:</span><span className={`font-mono font-bold ${gexColor}`}>{exp.gammaExposure > 0 ? "+" : ""}{exp.gammaExposure.toFixed(1)}M</span></div>
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">DEX:</span><span className={`font-mono font-bold ${dexColor}`}>{exp.deltaExposure > 0 ? "+" : ""}{exp.deltaExposure.toFixed(1)}M</span></div>
                                {exp.gammaFlip && <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Gamma Flip:</span><span className="font-mono text-[#FF9800]">${exp.gammaFlip.toFixed(2)}</span></div>}
                                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">ATM IV:</span><span className="font-mono text-[hsl(var(--foreground))]">{exp.atmIv.toFixed(1)}%</span></div>
                                <div className="mt-1 pt-1 border-t border-[hsl(var(--border))]">
                                  <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">EM Range:</span><span className="font-mono text-amber-400">{"±"}${exp.expectedMove.toFixed(2)} ({"±"}{exp.expectedMovePct.toFixed(2)}%)</span></div>
                                  <div className="flex justify-between mt-0.5"><span className="text-[hsl(var(--muted-foreground))]">EM High:</span><span className="font-mono text-emerald-400">${exp.expectedMoveHigh.toFixed(2)}</span></div>
                                  <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">EM Low:</span><span className="font-mono text-rose-400">${exp.expectedMoveLow.toFixed(2)}</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dark Pool Real-Time Feed */}
      {activeTab === "darkpool" && (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[hsl(var(--card))] z-10">
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="px-3 py-2 text-left text-[9px] font-medium text-[hsl(var(--muted-foreground))]">TIME</th>
                <th className="px-3 py-2 text-left text-[9px] font-medium text-[hsl(var(--muted-foreground))]">TICKER</th>
                <th className="px-3 py-2 text-right text-[9px] font-medium text-[hsl(var(--muted-foreground))]">PRICE</th>
                <th className="px-3 py-2 text-right text-[9px] font-medium text-[hsl(var(--muted-foreground))]">SIZE</th>
                <th className="px-3 py-2 text-right text-[9px] font-medium text-[hsl(var(--muted-foreground))]">NOTIONAL</th>
                <th className="px-3 py-2 text-center text-[9px] font-medium text-[hsl(var(--muted-foreground))]">VS VWAP</th>
                <th className="px-3 py-2 text-center text-[9px] font-medium text-[hsl(var(--muted-foreground))]">%VOL</th>
                <th className="px-3 py-2 text-center text-[9px] font-medium text-[hsl(var(--muted-foreground))]">BLOCK</th>
                <th className="px-3 py-2 text-left text-[9px] font-medium text-[hsl(var(--muted-foreground))]">VENUE</th>
                <th className="px-3 py-2 text-center text-[9px] font-medium text-[hsl(var(--muted-foreground))]">SENT</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrints.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]">No dark pool prints</td></tr>
              )}
              {filteredPrints.slice(0, 100).map(p => (
                <tr key={p.id} className={`border-b border-[hsl(var(--border))]/50 hover:bg-[hsl(var(--accent))]/30 transition-colors ${p.blockSize ? "bg-amber-500/5" : ""}`}>
                  <td className="px-3 py-1.5 font-mono text-[hsl(var(--muted-foreground))]">{p.time}</td>
                  <td className="px-3 py-1.5 font-bold text-[hsl(var(--foreground))]">{p.symbol}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-[hsl(var(--foreground))]">${p.price.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-[hsl(var(--foreground))]">{p.size.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-amber-400">{fmtMoney(p.notional)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`text-[10px] font-bold ${p.aboveVwap ? "text-emerald-400" : "text-rose-400"}`}>
                      {p.aboveVwap ? "ABOVE" : "BELOW"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center font-mono text-[hsl(var(--muted-foreground))]">{p.percentOfVolume.toFixed(3)}%</td>
                  <td className="px-3 py-1.5 text-center">
                    {p.blockSize && <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[9px] font-bold">BLOCK</span>}
                  </td>
                  <td className="px-3 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">{p.exchange}</td>
                  <td className="px-3 py-1.5 text-center">{sentBadge(p.sentiment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ─── Flow Intelligence Table ──────────────────────────────────────────────────

function FlowIntelligenceTable({
  flowData, allTickers, lastUpdated,
}: {
  flowData: OptionsFlow[]; allTickers: Ticker[]; lastUpdated?: number;
}) {
  const [activeTab, setActiveTab] = useState<"abnormal" | "accumulation" | "momentum" | "ai">("abnormal");
  const [selectedFlow, setSelectedFlow] = useState<OptionsFlow | null>(null);
  const [aiReportTicker, setAiReportTicker] = useState<string | null>(null);
  const [tickerFilter, setTickerFilter] = useState("");
  const [showLegend, setShowLegend] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);
  const [selectedAccTicker, setSelectedAccTicker] = useState<string | null>(null);

  // Close legend when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) setShowLegend(false);
    }
    if (showLegend) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLegend]);

  // Filter flow data by ticker
  const filteredFlow = useMemo(() => {
    if (!tickerFilter.trim()) return flowData;
    const f = tickerFilter.toUpperCase().trim();
    return flowData.filter(flow => flow.symbol.toUpperCase().includes(f));
  }, [flowData, tickerFilter]);

  const tabs = [
    { key: "abnormal" as const, label: "Abnormal Trades", icon: Flame },
    { key: "accumulation" as const, label: "Acumulación", icon: Layers },
    { key: "momentum" as const, label: "Intent Momentum", icon: TrendUp },
    { key: "ai" as const, label: "AI Whale Reports", icon: Brain },
  ];

  // Accumulation tab: aggregate long-dated OI by strike per ticker
  const accumulationData = useMemo(() => {
    type StrikeData = { callOI: number; putOI: number; callNotional: number; putNotional: number; expiries: Map<string, { callContracts: number; putContracts: number; callNotional: number; putNotional: number }> };
    const byTicker: Record<string, { ticker: string; strikes: Record<string, StrikeData> }> = {};
    for (const f of flowData) {
      const vd = parseFlowVolume(f.volume);
      // Only include medium/long-dated flows (not 0DTE)
      const expiry = f.expiry || "";
      if (!expiry) continue;
      const expDate = new Date(expiry);
      const today = new Date();
      const dte = Math.round((expDate.getTime() - today.getTime()) / 86400000);
      if (dte < 5) continue; // Skip 0-4 DTE, focus on 5+ DTE
      const sym = f.symbol;
      if (!byTicker[sym]) byTicker[sym] = { ticker: sym, strikes: {} };
      const strikeKey = f.strike || "ATM";
      if (!byTicker[sym].strikes[strikeKey]) byTicker[sym].strikes[strikeKey] = { callOI: 0, putOI: 0, callNotional: 0, putNotional: 0, expiries: new Map() };
      const sk = byTicker[sym].strikes[strikeKey];
      const isCall = (vd.callPut || "").toUpperCase().includes("C");
      const notional = parseFloat(String(vd.notional || "0").replace(/[$KMB,]/g, "")) || 0;
      const contracts = vd.contracts || 0;
      if (isCall) { sk.callOI += contracts; sk.callNotional += notional; }
      else { sk.putOI += contracts; sk.putNotional += notional; }
      // Track per-expiry contracts
      if (!sk.expiries.has(expiry)) sk.expiries.set(expiry, { callContracts: 0, putContracts: 0, callNotional: 0, putNotional: 0 });
      const exEntry = sk.expiries.get(expiry)!;
      if (isCall) { exEntry.callContracts += contracts; exEntry.callNotional += notional; }
      else { exEntry.putContracts += contracts; exEntry.putNotional += notional; }
    }
    // Flatten to rows sorted by total notional desc
    const rows: AccumulationRow[] = [];
    for (const [sym, data] of Object.entries(byTicker)) {
      for (const [strike, sk] of Object.entries(data.strikes)) {
        const totalNotional = sk.callNotional + sk.putNotional;
        if (totalNotional < 0.1) continue;
        const ratio = sk.callOI > 0 && sk.putOI > 0 ? sk.callOI / (sk.callOI + sk.putOI) : sk.callOI > 0 ? 1 : 0;
        const bias = ratio > 0.65 ? "ALCISTA" : ratio < 0.35 ? "BAJISTA" : "NEUTRAL";
        const expList = Array.from(sk.expiries.keys()).sort().slice(0, 3).join(", ");
        const allExpKeys = Array.from(sk.expiries.keys());
        const avgDte = allExpKeys.map(e => Math.round((new Date(e).getTime() - Date.now()) / 86400000)).reduce((a, b) => a + b, 0) / (allExpKeys.length || 1);
        const contractsByExpiry = Array.from(sk.expiries.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([expiry, ev]) => ({ expiry, callContracts: ev.callContracts, putContracts: ev.putContracts, callNotional: ev.callNotional, putNotional: ev.putNotional }));
        rows.push({ ticker: sym, strike, callOI: sk.callOI, putOI: sk.putOI, callNotional: sk.callNotional, putNotional: sk.putNotional, ratio, bias, expiries: expList, dte: `${Math.round(avgDte)}d`, contractsByExpiry });
      }
    }
    rows.sort((a, b) => (b.callNotional + b.putNotional) - (a.callNotional + a.putNotional));
    // Filter by tickerFilter
    const f = tickerFilter.toUpperCase().trim();
    return f ? rows.filter(r => r.ticker.includes(f) || r.strike.includes(f)) : rows;
  }, [flowData, tickerFilter]);

  function getTypeBadge(signal: string | null) {
    switch ((signal || "").toLowerCase()) {
      case "sweep": return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">SWEEP</span>;
      case "burst": return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">BURST</span>;
      case "block": return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">BLOCK</span>;
      default: return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/40">SINGLE</span>;
    }
  }

  // Flow sentiment ratio when filtered by ticker
  // Sentiment logic: BUY Call / SELL Put = Bullish | BUY Put / SELL Call = Bearish
  // Weighted by notional × direction confidence %
  const flowSentimentRatio = useMemo(() => {
    if (!tickerFilter.trim() || filteredFlow.length === 0) return null;
    let bullishNotional = 0, bearishNotional = 0;
    let bullishCount = 0, bearishCount = 0;
    let callCount = 0, putCount = 0;
    let buyCount = 0, sellCount = 0;
    let totalNotional = 0;
    for (const f of filteredFlow) {
      const vd = parseFlowVolume(f.volume);
      const dirStr = (vd.direction || "").toUpperCase();
      const isBuy = dirStr.includes("BUY");
      const isSell = dirStr.includes("SELL");
      // Extract direction confidence % (e.g. "BUY 97%" -> 0.97)
      const dirPctMatch = dirStr.match(/(\d+)%/);
      const dirPct = dirPctMatch ? parseInt(dirPctMatch[1]) / 100 : 0.5;
      const notional = Number(vd.notional) || 0;
      // Detect call/put from callPut field, type field, or contract name
      const contractName = vd.optionContract || "";
      const cpFromContract = contractName.match(/[A-Z]\d{6}([CP])\d/) ? contractName.match(/[A-Z]\d{6}([CP])\d/)![1] : "";
      const cpField = (vd.callPut || f.type || cpFromContract || "").toUpperCase();
      const isCall = cpField.includes("C");
      const isPut = cpField.includes("P") && !isCall;
      if (isCall) callCount++;
      if (isPut) putCount++;
      if (isBuy) buyCount++;
      if (isSell) sellCount++;
      // Weighted notional = notional × direction confidence
      const weightedNotional = notional * dirPct;
      totalNotional += notional;
      // BUY Call or SELL Put = Bullish
      // BUY Put or SELL Call = Bearish
      if ((isBuy && isCall) || (isSell && isPut)) {
        bullishNotional += weightedNotional;
        bullishCount++;
      } else if ((isBuy && isPut) || (isSell && isCall)) {
        bearishNotional += weightedNotional;
        bearishCount++;
      } else {
        // Fallback: if can't detect C/P, use direction as proxy
        if (isBuy) { bullishNotional += weightedNotional * 0.5; bearishNotional += weightedNotional * 0.5; }
        else if (isSell) { bearishNotional += weightedNotional * 0.5; bullishNotional += weightedNotional * 0.5; }
      }
    }
    const totalSentiment = bullishNotional + bearishNotional;
    const bullPct = totalSentiment > 0 ? (bullishNotional / totalSentiment) * 100 : 50;
    const bearPct = totalSentiment > 0 ? (bearishNotional / totalSentiment) * 100 : 50;
    const ratio = bearishNotional > 0 ? +(bullishNotional / bearishNotional).toFixed(2) : bullishNotional > 0 ? 99.99 : 0;
    const bias = bullPct > 55 ? "bullish" : bearPct > 55 ? "bearish" : "neutral";
    const total = filteredFlow.length;
    return { bullishCount, bearishCount, bullishNotional, bearishNotional, callCount, putCount, buyCount, sellCount, total, bullPct, bearPct, ratio, bias, totalNotional, ticker: tickerFilter.toUpperCase().trim() };
  }, [filteredFlow, tickerFilter]);

  // Intent Momentum: rank tickers by flow activity
  const momentumRanking = useMemo(() => {
    const byTicker: Record<string, { bullish: number; bearish: number; total: number; sweeps: number; bursts: number; notional: number; ticker: Ticker | undefined }> = {};
    for (const f of flowData) {
      if (!byTicker[f.symbol]) {
        byTicker[f.symbol] = { bullish: 0, bearish: 0, total: 0, sweeps: 0, bursts: 0, notional: 0, ticker: allTickers.find(t => t.symbol === f.symbol) };
      }
      const b = byTicker[f.symbol];
      b.total++;
      if (f.sentiment === "bullish") b.bullish++;
      else if (f.sentiment === "bearish") b.bearish++;
      if (f.signal === "sweep") b.sweeps++;
      if (f.signal === "burst") b.bursts++;
      const vd = parseFlowVolume(f.volume);
      b.notional += Number(vd.notional) || 0;
    }
    return Object.entries(byTicker)
      .map(([sym, data]) => ({ symbol: sym, ...data }))
      .sort((a, b) => b.notional - a.notional);
  }, [flowData, allTickers]);

  return (
    <Card className="border-card-border bg-card overflow-hidden" data-testid="flow-intelligence-table">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-2 flex-wrap">
          <Zap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wider">Flow Intelligence</h2>
          <span className="text-[10px] text-muted-foreground ml-2 hidden sm:block">
            Abnormal Trades · Intent Momentum · AI Whale Reports
          </span>
          {/* Ticker Filter */}
          <div className="relative ml-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filtrar por ticker (TSLA...)"
              value={tickerFilter}
              onChange={(e) => setTickerFilter(e.target.value)}
              className="h-6 text-[10px] pl-7 pr-6 bg-muted/40 border border-border rounded text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 w-44"
              data-testid="flow-ticker-filter"
            />
            {tickerFilter && (
              <button onClick={() => setTickerFilter("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 bg-amber-500/10 ml-auto">
            {filteredFlow.length}{tickerFilter ? `/${flowData.length}` : ""} signals
          </Badge>
          {/* Live pulse + timestamp */}
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-emerald-400 font-mono uppercase tracking-widest">Live</span>
          </span>
          {lastUpdated ? (
            <span className="text-[9px] text-muted-foreground font-mono tabular-nums">
              {new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, timeZone: "America/New_York" })} ET
            </span>
          ) : null}
          {/* Leyenda toggle */}
          <div className="relative" ref={legendRef}>
            <button
              onClick={() => setShowLegend(!showLegend)}
              className={`flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-semibold transition-colors ${
                showLegend ? "border-primary/50 text-primary bg-primary/10" : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
              title="Ver leyenda"
              data-testid="btn-flow-legend"
            >
              <Eye className="w-3 h-3" />
              Leyenda
            </button>
            {showLegend && <FlowLegendPanel onClose={() => setShowLegend(false)} />}
          </div>
        </div>
      </div>
      {/* Tab Bar */}
      <div className="flex items-center border-b border-border bg-muted/20">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
            data-testid={`flow-tab-${tab.key}`}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Abnormal Trades ── */}
      {activeTab === "abnormal" && (
        <div className="p-0">
          <div className="px-3 py-2 bg-muted/10 border-b border-border/50">
            <p className="text-[10px] text-muted-foreground">
              Órdenes estadísticamente inusuales vs el historial propio de cada ticker. Haz clic en cualquier fila para ver el detalle completo de la estrategia.
              {tickerFilter && <span className="ml-2 text-amber-400 font-semibold">Mostrando: {tickerFilter.toUpperCase()} ({filteredFlow.length} señales)</span>}
            </p>
          </div>

          {/* Flow Sentiment Ratio Bar — only when filtered */}
          {flowSentimentRatio && (
            <div className="px-3 py-2.5 border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent" data-testid="flow-sentiment-ratio">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Activity className="w-3 h-3 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sentimiento Flow — {flowSentimentRatio.ticker}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] font-bold ${
                    flowSentimentRatio.bias === "bullish" ? "text-emerald-400" : flowSentimentRatio.bias === "bearish" ? "text-red-400" : "text-amber-400"
                  }`}>
                    {flowSentimentRatio.bias === "bullish" ? "▲ ALCISTA" : flowSentimentRatio.bias === "bearish" ? "▼ BAJISTA" : "— NEUTRAL"}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    Bull/Bear: <span className={`font-bold ${
                      flowSentimentRatio.bias === "bullish" ? "text-emerald-400" : flowSentimentRatio.bias === "bearish" ? "text-red-400" : "text-amber-400"
                    }`}>{flowSentimentRatio.ratio}</span>
                  </span>
                </div>
              </div>
              {/* Visual ratio bar */}
              <div className="h-3 rounded-full overflow-hidden flex bg-muted/40 mb-1.5">
                {flowSentimentRatio.bullPct > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500 relative"
                    style={{ width: `${flowSentimentRatio.bullPct}%` }}
                  >
                    {flowSentimentRatio.bullPct > 15 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90">
                        {flowSentimentRatio.bullPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                )}
                {flowSentimentRatio.bearPct > 0 && (
                  <div
                    className="h-full bg-red-500 transition-all duration-500 relative"
                    style={{ width: `${flowSentimentRatio.bearPct}%` }}
                  >
                    {flowSentimentRatio.bearPct > 15 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90">
                        {flowSentimentRatio.bearPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Stats row */}
              <div className="flex items-center justify-between text-[9px] tabular-nums">
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400">▲ Bullish: {flowSentimentRatio.bullishCount} <span className="text-muted-foreground/60">({formatNotional(flowSentimentRatio.bullishNotional)})</span></span>
                  <span className="text-red-400">▼ Bearish: {flowSentimentRatio.bearishCount} <span className="text-muted-foreground/60">({formatNotional(flowSentimentRatio.bearishNotional)})</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400/70">Calls: {flowSentimentRatio.callCount}</span>
                  <span className="text-red-400/70">Puts: {flowSentimentRatio.putCount}</span>
                  <span className="text-muted-foreground">BUY: {flowSentimentRatio.buyCount} · SELL: {flowSentimentRatio.sellCount} · Total: {flowSentimentRatio.total}</span>
                </div>
              </div>
            </div>
          )}

          {filteredFlow.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {tickerFilter ? `No hay señales de flow para "${tickerFilter.toUpperCase()}"` : "No hay señales de options flow"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ maxHeight: "480px", overflowY: "auto" }}>
              <table className="w-full text-xs min-w-[1100px]">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-muted/10 text-muted-foreground">
                    {[
                      { label: "OPTION", align: "left" },
                      { label: "TYPE", align: "center" },
                      { label: "DIR", align: "center" },
                      { label: "CONTRACTS", align: "right" },
                      { label: "NOTIONAL", align: "right" },
                      { label: "PREMIUM", align: "right" },
                      { label: "TRADES", align: "right" },
                      { label: "TIME (NY ET)", align: "center" },
                      { label: "DUR(MS)", align: "right" },
                      { label: "FIRST", align: "right" },
                      { label: "LAST", align: "right" },
                      { label: "BID", align: "right" },
                      { label: "ASK", align: "right" },
                      { label: "EXCH", align: "right" },
                      { label: "CONF", align: "right" },
                    ].map((col) => (
                      <th key={col.label} className={`py-2 px-2 font-semibold uppercase tracking-wider text-[9px] text-${col.align}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredFlow.map((f) => {
                    const vd = parseFlowVolume(f.volume);
                    const isCall = (vd.callPut || f.type || "").toUpperCase().includes("C");
                    const dirStr = (vd.direction || "").toUpperCase();
                    const isBuy = dirStr.includes("BUY");
                    const conf = vd.confidence ?? 0;
                    const confColor = conf >= 90 ? "text-emerald-400" : conf >= 75 ? "text-amber-400" : "text-red-400";
                    const contractName = vd.optionContract || `${f.symbol}${f.expiry || ""}${isCall ? "C" : "P"}${f.strike || ""}`;
                    // Fix time: show NY ET time
                    const timeDisplay = vd.time ? formatTimeNY(vd.time) : timeAgo(f.timestamp);

                    return (
                      <tr
                        key={f.id}
                        className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => setSelectedFlow(f)}
                        data-testid={`flow-row-${f.id}`}
                      >
                        <td className="py-1.5 px-2 font-mono text-[10px] whitespace-nowrap">
                          <span className={`font-semibold ${isCall ? "text-emerald-400" : "text-red-400"}`}>{contractName}</span>
                        </td>
                        <td className="py-1.5 px-2 text-center">{getTypeBadge(f.signal)}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`text-[10px] font-bold ${isBuy ? "text-emerald-400" : "text-red-400"}`}>
                            {dirStr || (isBuy ? "BUY" : "SELL")}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-medium">{vd.contracts?.toLocaleString() || "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-amber-400 font-medium">{formatNotional(vd.notional ?? null)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-primary font-medium">{f.premium || formatNotional(vd.notional ?? null)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{vd.trades?.toString() || "—"}</td>
                        <td className="py-1.5 px-2 text-center tabular-nums text-muted-foreground text-[10px] whitespace-nowrap">{timeDisplay}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{vd.durationMs?.toString() || "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{vd.first ? `$${Number(vd.first).toFixed(2)}` : "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{vd.last ? `$${Number(vd.last).toFixed(2)}` : "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-red-400/80">{vd.bid ? `$${Number(vd.bid).toFixed(2)}` : "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-emerald-400/80">{vd.ask ? `$${Number(vd.ask).toFixed(2)}` : "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{vd.exchanges?.toString() || "—"}</td>
                        <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${confColor}`}>{conf > 0 ? `${conf}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Acumulación Institucional ── */}
      {activeTab === "accumulation" && (
        <div className="p-0">
          <div className="px-3 py-2 bg-muted/10 border-b border-border/50">
            <p className="text-[10px] text-muted-foreground">
              Flujos de acumulación institucional a mediano/largo plazo (5+ DTE) agrupados por strike. Muestra las intenciones direccionales de las instituciones.
              {tickerFilter && <span className="ml-2 text-amber-400 font-semibold">Filtro: {tickerFilter.toUpperCase()} ({accumulationData.length} strikes)</span>}
            </p>
          </div>
          {accumulationData.length === 0 ? (
            <div className="text-center py-10 text-xs text-muted-foreground">
              <Layers className="w-6 h-6 mx-auto mb-2 opacity-30" />
              {tickerFilter ? `No hay acumulación institucional para "${tickerFilter.toUpperCase()}"` : "Acumulando datos intradiarios..."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="border-b border-border bg-muted/10 text-muted-foreground">
                    {[
                      { label: "TICKER", align: "left" },
                      { label: "STRIKE", align: "right" },
                      { label: "CALL OI", align: "right" },
                      { label: "PUT OI", align: "right" },
                      { label: "CALL $", align: "right" },
                      { label: "PUT $", align: "right" },
                      { label: "RATIO C/P", align: "center" },
                      { label: "SESIÓN DTE", align: "center" },
                      { label: "VENCIMIENTO(S)", align: "left" },
                      { label: "BIAS", align: "center" },
                    ].map((col) => (
                      <th key={col.label} className={`py-2 px-2 font-semibold uppercase tracking-wider text-[9px] text-${col.align}`}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accumulationData.map((row, i) => {
                    const biasColor = row.bias === "ALCISTA" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : row.bias === "BAJISTA" ? "text-red-400 bg-red-500/10 border-red-500/30" : "text-amber-400 bg-amber-500/10 border-amber-500/30";
                    const callFmt = row.callNotional >= 1 ? `$${row.callNotional.toFixed(1)}M` : `$${(row.callNotional * 1000).toFixed(0)}K`;
                    const putFmt = row.putNotional >= 1 ? `$${row.putNotional.toFixed(1)}M` : `$${(row.putNotional * 1000).toFixed(0)}K`;
                    const ratioPct = Math.round(row.ratio * 100);
                    return (
                      <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                        <td className="py-1.5 px-2 font-bold text-primary cursor-pointer hover:underline" onClick={() => setSelectedAccTicker(row.ticker)}>{row.ticker}</td>
                        <td className="py-1.5 px-2 text-right font-mono font-semibold">{row.strike}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-emerald-400">{row.callOI.toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-red-400">{row.putOI.toLocaleString()}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-emerald-400">{callFmt}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-red-400">{putFmt}</td>
                        <td className="py-1.5 px-2 text-center">
                          <div className="flex items-center gap-1 justify-center">
                            <div className="flex h-2 w-16 rounded overflow-hidden bg-muted/40">
                              <div className="bg-emerald-400/80 h-full" style={{ width: `${ratioPct}%` }} />
                              <div className="bg-red-400/80 h-full" style={{ width: `${100 - ratioPct}%` }} />
                            </div>
                            <span className="text-[9px] text-muted-foreground">{ratioPct}%</span>
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-center text-muted-foreground">{row.dte}</td>
                        <td className="py-1.5 px-2 text-left text-[9px] text-muted-foreground font-mono">{row.expiries}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${biasColor}`}>{row.bias}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Intent Momentum ── */}
      {activeTab === "momentum" && (
        <div className="p-4">
          <div className="mb-3 px-1 py-2 bg-muted/10 rounded-lg border border-border/40">
            <p className="text-[10px] text-muted-foreground">
              Tickers rankeados por convicción clasificada por AI y aceleración del flujo direccional. Haz clic en cualquier fila para ver el Reporte AI Whale.
            </p>
          </div>
          {momentumRanking.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">No flow data available</div>
          ) : (
            <div className="space-y-2">
              {momentumRanking.map((item, idx) => {
                const bullPct = item.total > 0 ? Math.round((item.bullish / item.total) * 100) : 50;
                const bearPct = 100 - bullPct;
                const ticker = item.ticker;
                const chgPct = Number(ticker?.changePercent) || 0;
                return (
                  <div
                    key={item.symbol}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => { setAiReportTicker(item.symbol); setActiveTab("ai"); }}
                  >
                    <div className="w-6 text-center text-[10px] text-muted-foreground font-bold">#{idx + 1}</div>
                    <div className="w-14">
                      <div className="text-sm font-bold">{item.symbol}</div>
                      <div className={`text-[10px] tabular-nums ${chgPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%
                      </div>
                    </div>
                    <div className="flex-1">
                      {/* Conviction bar */}
                      <div className="flex items-center gap-1 mb-1">
                        <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-l-full" style={{ width: `${bullPct}%` }} />
                        </div>
                        <span className="text-[9px] text-emerald-400 tabular-nums w-6">{bullPct}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-muted-foreground">{item.sweeps} sweeps · {item.bursts} bursts · {item.total} signals</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-amber-400">{formatNotional(item.notional)}</div>
                      <div className="text-[9px] text-muted-foreground">notional</div>
                    </div>
                    <div className={`text-[10px] font-bold px-2 py-1 rounded ${bullPct > 60 ? "text-emerald-400 bg-emerald-500/15" : bullPct < 40 ? "text-red-400 bg-red-500/15" : "text-amber-400 bg-amber-500/15"}`}>
                      {bullPct > 60 ? "BULL" : bullPct < 40 ? "BEAR" : "MIXED"}
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: AI Whale Reports ── */}
      {activeTab === "ai" && (
        <div className="p-4">
          <div className="mb-3 px-1 py-2 bg-muted/10 rounded-lg border border-border/40">
            <p className="text-[10px] text-muted-foreground">
              Genera un análisis AI completo para cualquier ticker. 9 secciones: Flujo de opciones, Análisis anormal, Estructura de mercado, Datos de mercado, Fundamentales, Sentimiento de noticias, Debate Toro/Oso, Riesgo y Recomendación final.
            </p>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            {[...STOCK_SYMBOLS, ...ETF_SYMBOLS].map((sym) => (
              <button
                key={sym}
                onClick={() => setAiReportTicker(sym)}
                className="px-2 py-2 rounded border border-border/50 hover:border-primary/50 hover:bg-primary/10 transition-colors text-xs font-semibold text-center"
                data-testid={`btn-ai-report-${sym}`}
              >
                {sym}
              </button>
            ))}
          </div>
          {aiReportTicker && (
            <div className="mt-3 text-xs text-muted-foreground">
              Selected: <span className="text-primary font-semibold">{aiReportTicker}</span>
              <button onClick={() => setAiReportTicker(null)} className="ml-2 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3 inline" />
              </button>
              <button
                onClick={() => {}}
                className="ml-3 text-[11px] text-primary border border-primary/30 px-2 py-0.5 rounded hover:bg-primary/10 transition-colors"
                data-testid={`btn-open-ai-report-${aiReportTicker}`}
              >
                Open Full Report →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Row Detail Modal */}
      <OptionsFlowDetailModal flow={selectedFlow} open={selectedFlow !== null} onClose={() => setSelectedFlow(null)} />
      {/* AI Report Modal */}
      <AIReportModal ticker={aiReportTicker} open={!!aiReportTicker} onClose={() => setAiReportTicker(null)} />
      {/* Accumulation Ticker Detail Modal */}
      {selectedAccTicker && (
        <AccumulationTickerModal
          ticker={selectedAccTicker}
          rows={accumulationData.filter(r => r.ticker === selectedAccTicker)}
          allRows={accumulationData}
          onClose={() => setSelectedAccTicker(null)}
        />
      )}
    </Card>
  );
}

// ─── MarketOverviewStrip ──────────────────────────────────────────────────────

function MarketOverviewStrip({ tickers }: { tickers: Ticker[] }) {
  const indices = tickers.filter((t) => ["SPX", "QQQ", "DIA", "IWM", "SPY"].includes(t.symbol));
  // Duplicate items for seamless loop
  const renderItem = (t: Ticker, keyPrefix: string) => {
    const isPositive = (Number(t.change) || 0) >= 0;
    return (
      <div key={`${keyPrefix}-${t.symbol}`} className="flex items-center gap-2 flex-shrink-0 px-3">
        <span className="text-[11px] font-bold tracking-wide text-foreground/90">{t.symbol}</span>
        <span className="text-[11px] tabular-nums font-medium text-foreground/70">{formatPrice(t.price)}</span>
        <span className={`text-[10px] tabular-nums font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          {isPositive ? "▲" : "▼"} {isPositive ? "+" : ""}{(Number(t.changePercent) || 0).toFixed(2)}%
        </span>
        <div className="w-px h-3 bg-border/40 ml-1" />
      </div>
    );
  };
  return (
    <div className="relative overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}>
      <div className="flex items-center animate-marquee-scroll" style={{
        animation: 'marqueeScroll 20s linear infinite',
        width: 'max-content',
      }}>
        {indices.map((t) => renderItem(t, "a"))}
        {indices.map((t) => renderItem(t, "b"))}
        {indices.map((t) => renderItem(t, "c"))}
      </div>
    </div>
  );
}

// ─── TweetItem ────────────────────────────────────────────────────────────────

// Convert nitter/other proxy URLs to proper x.com URLs
function toXUrl(raw: string): string {
  if (!raw) return "";
  try {
    let url = raw.replace(/#m$/, ""); // strip nitter anchor
    url = url.replace(/https?:\/\/nitter\.net\//i, "https://x.com/");
    url = url.replace(/https?:\/\/nitter\.[a-z.]+\//i, "https://x.com/");
    url = url.replace(/https?:\/\/twitter\.com\//i, "https://x.com/");
    return url;
  } catch { return raw; }
}

function TweetItem({ tweet, tickerFilter }: { tweet: Tweet; tickerFilter: string }) {
  const [expanded, setExpanded] = useState(false);
  const avatarColors = ["bg-blue-500","bg-purple-500","bg-emerald-500","bg-amber-500","bg-red-500","bg-cyan-500","bg-pink-500","bg-indigo-500"];
  const colorIdx = tweet.username.charCodeAt(0) % avatarColors.length;
  const avatarBg = avatarColors[colorIdx];
  const firstLetter = (tweet.displayName || tweet.username || "?")[0].toUpperCase();
  const dateTimeStr = formatTweetDateTime(tweet.timestamp);
  const xUrl = toXUrl(tweet.url);
  const isLong = tweet.text.length > 120;

  return (
    <div
      className={`px-3 py-2.5 border-b border-border/40 last:border-0 transition-colors cursor-pointer min-w-0 overflow-hidden ${
        expanded ? "bg-muted/30" : "hover:bg-muted/20"
      }`}
      onClick={() => setExpanded(!expanded)}
      data-testid={`tweet-item-${tweet.username}`}
    >
      {/* Collapsed: compact row */}
      <div className="flex items-start gap-2.5 min-w-0">
        <div className={`w-7 h-7 rounded-full ${avatarBg} flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white`}>
          {firstLetter}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-[11px] font-bold leading-none truncate max-w-[90px]">{tweet.displayName}</span>
            <span className="text-[10px] text-muted-foreground leading-none">@{tweet.username}</span>
            {tweet.isRetweet && (
              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground/60"><Repeat2 className="w-3 h-3" />RT</span>
            )}
            <span className="text-[9px] text-muted-foreground ml-auto flex-shrink-0 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {dateTimeStr}
            </span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
          </div>
          {/* Preview text (truncated) when collapsed */}
          {!expanded && (
            <p className="text-[11px] leading-relaxed text-foreground/90 break-words line-clamp-2">{tweet.text}</p>
          )}
        </div>
      </div>

      {/* Expanded: full tweet card */}
      {expanded && (
        <div className="mt-2 rounded-lg border border-border/60 bg-[hsl(var(--card))] text-[11px]" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }} onClick={(e) => e.stopPropagation()}>
          {/* Author */}
          <div className="px-3 py-1.5 border-b border-border/30">
            <span className="text-muted-foreground font-medium text-[10px]">Autor</span>
            <div className="font-bold mt-0.5">{tweet.displayName} <span className="text-muted-foreground font-normal">@{tweet.username}</span></div>
          </div>
          {/* Tweet text */}
          <div className="px-3 py-2 border-b border-border/30">
            <span className="text-muted-foreground font-medium text-[10px]">Tweet</span>
            <p className="leading-relaxed text-foreground mt-0.5" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{tweet.text}</p>
          </div>
          {/* Time */}
          <div className="px-3 py-1.5 border-b border-border/30">
            <span className="text-muted-foreground font-medium text-[10px]">Hora</span>
            <div className="tabular-nums mt-0.5">{dateTimeStr}</div>
          </div>
          {/* Retweet badge */}
          {tweet.isRetweet && (
            <div className="px-3 py-1.5 border-b border-border/30">
              <span className="text-muted-foreground font-medium text-[10px]">Tipo</span>
              <div className="mt-0.5"><span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Retweet</span></div>
            </div>
          )}
          {/* Source link */}
          {xUrl && (
            <div className="px-3 py-1.5">
              <span className="text-muted-foreground font-medium text-[10px]">Fuente</span>
              <div className="mt-0.5">
                <a href={xUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  data-testid={`tweet-link-${tweet.username}`}>
                  <ExternalLink className="w-3 h-3 shrink-0" />Ver en X.com
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── XFeedPanel ───────────────────────────────────────────────────────────────

function XFeedPanel() {
  const [tickerFilter, setTickerFilter] = useState("");
  const { data: tweets = [], isLoading } = useQuery<Tweet[]>({
    queryKey: ["/api/tweets"],
    refetchInterval: 30000,
  });

  const filteredTweets = useMemo(() => {
    // Sort by most recent first
    const sorted = [...tweets].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (!isNaN(ta) && !isNaN(tb)) return tb - ta;
      return 0;
    });
    if (!tickerFilter.trim()) return sorted;
    const filter = tickerFilter.toUpperCase().trim();
    return sorted.filter(t =>
      t.text.toUpperCase().includes(filter) ||
      t.displayName.toUpperCase().includes(filter) ||
      t.username.toUpperCase().includes(filter)
    );
  }, [tweets, tickerFilter]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Twitter className="w-3 h-3 text-sky-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">X / Twitter Feed</span>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">{filteredTweets.length}/{tweets.length} posts</span>
        </div>
        {/* Ticker filter */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Filter by ticker (e.g. TSLA, NVDA)..."
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            className="h-6 text-[10px] pl-7 pr-6 bg-muted/30 border-border"
            data-testid="x-feed-ticker-filter"
          />
          {tickerFilter && (
            <button onClick={() => setTickerFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 xfeed-scroll">
        {isLoading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredTweets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Twitter className="w-6 h-6 opacity-30" />
            <span className="text-xs">{tickerFilter ? `No posts mentioning "${tickerFilter.toUpperCase()}"` : "No tweets available"}</span>
          </div>
        ) : (
          <div>
            {filteredTweets.map((tweet, i) => (
              <TweetItem key={`${tweet.username}-${i}`} tweet={tweet} tickerFilter={tickerFilter} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}


// ─── Club 5 AM Panel ──────────────────────────────────────────────────────────

interface WisdomCard {
  id: string; title: string; book: string; author: string;
  icon: string; color: string; content: string; principles: string[];
}
interface ChatMsg { role: "user" | "assistant"; content: string; }

function Club5amPanel() {
  const [view, setView] = useState<"wisdom" | "chat">("wisdom");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: wisdomCards = [] } = useQuery<WisdomCard[]>({
    queryKey: ["/api/club5am/wisdom"],
    staleTime: Infinity,
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = async () => {
    const msg = inputValue.trim();
    if (!msg || isSending) return;
    setInputValue("");
    const userMsg: ChatMsg = { role: "user", content: msg };
    setChatMessages(prev => [...prev, userMsg]);
    setIsSending(true);
    try {
      const resp = await apiRequest("POST", "/api/club5am/chat", {
        message: msg,
        history: chatMessages.map(m => ({ role: m.role, content: m.content })),
      });
      const data = await resp.json();
      setChatMessages(prev => [...prev, { role: "assistant", content: data.reply || "Error al generar respuesta." }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Error de conexión. Intenta de nuevo." }]);
    }
    setIsSending(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-tabs: Wisdom / Chat */}
      <div className="flex border-b border-border/50 bg-card/40">
        <button
          onClick={() => setView("wisdom")}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            view === "wisdom" ? "border-amber-400 text-amber-400 bg-amber-400/5" : "border-transparent text-muted-foreground/60 hover:text-foreground"
          }`}
        >
          <BookOpen className="w-3 h-3" />Sabiduría
        </button>
        <button
          onClick={() => setView("chat")}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            view === "chat" ? "border-emerald-400 text-emerald-400 bg-emerald-400/5" : "border-transparent text-muted-foreground/60 hover:text-foreground"
          }`}
        >
          <MessageCircle className="w-3 h-3" />Mentor AI
        </button>
      </div>

      {view === "wisdom" && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Header quote */}
          <div className="px-2 py-2 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
            <p className="text-[10px] text-amber-200/90 italic leading-relaxed text-center">
              "Controla tus mañanas, impulsa tu vida."
            </p>
            <p className="text-[9px] text-amber-400/60 text-center mt-0.5">— Robin Sharma</p>
          </div>
          {wisdomCards.map(card => (
            <div
              key={card.id}
              className="rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
            >
              <div className="p-2.5 flex items-start gap-2">
                <span className="text-base leading-none mt-0.5">{card.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-foreground/90" style={{ color: card.color }}>{card.title}</span>
                    <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${expandedCard === card.id ? "rotate-180" : ""}`} />
                  </div>
                  <p className="text-[9px] text-muted-foreground">{card.book} — {card.author}</p>
                </div>
              </div>
              {expandedCard === card.id && (
                <div className="px-2.5 pb-2.5 space-y-1.5">
                  <p className="text-[10px] text-foreground/70 leading-relaxed">{card.content}</p>
                  <div className="space-y-1 mt-1.5">
                    {card.principles.map((p: string, i: number) => (
                      <div key={i} className="flex gap-1.5 items-start">
                        <Sparkles className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" style={{ color: card.color }} />
                        <p className="text-[9px] text-foreground/60 leading-relaxed">{p}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {view === "chat" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {chatMessages.length === 0 && (
              <div className="text-center py-6 space-y-2">
                <Sun className="w-8 h-8 text-amber-400/40 mx-auto" />
                <p className="text-[11px] text-muted-foreground/60 font-medium">Tu Mentor de Alto Rendimiento</p>
                <p className="text-[9px] text-muted-foreground/40 max-w-[200px] mx-auto leading-relaxed">
                  Pregúntame sobre rutinas matutinas, psicología del trading, hábitos atómicos, limpieza mental Ho'oponopono, o cualquier aspecto de tu transformación.
                </p>
                <div className="flex flex-wrap gap-1 justify-center mt-2">
                  {["Mi rutina 5AM", "Limpieza mental 0DTE", "Hábito del 1% diario", "Los 4 Acuerdos"].map(q => (
                    <button
                      key={q}
                      onClick={() => { setInputValue(q); }}
                      className="text-[8px] px-2 py-1 rounded-full border border-amber-500/30 text-amber-400/70 hover:text-amber-300 hover:border-amber-400/50 hover:bg-amber-500/10 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-lg px-2.5 py-1.5 ${
                  msg.role === "user"
                    ? "bg-primary/20 text-foreground/90 border border-primary/30"
                    : "bg-muted/30 text-foreground/80 border border-border/40"
                }`}>
                  <p className="text-[10px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {/* Input */}
          <div className="p-2 border-t border-border/50 bg-card/60">
            <div className="flex gap-1.5">
              <Input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Escribe tu pregunta..."
                className="flex-1 h-7 text-[10px] bg-muted/30 border-border/50"
                disabled={isSending}
              />
              <button
                onClick={sendMessage}
                disabled={isSending || !inputValue.trim()}
                className="h-7 w-7 flex items-center justify-center rounded bg-amber-500/80 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-3 h-3 text-black" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Right Sidebar ────────────────────────────────────────────────────────────

function RightSidebar({
  newsItems, filteredNews, newsTickerFilter, setNewsTickerFilter, loadingNews, onNewsClick,
}: {
  newsItems: News[]; filteredNews: News[]; newsTickerFilter: string;
  setNewsTickerFilter: (v: string) => void; loadingNews: boolean; onNewsClick: (item: News) => void;
}) {
  const [activeTab, setActiveTab] = useState<"news" | "xfeed" | "club5am">("news");
  return (
    <aside className="w-80 border-l border-border flex flex-col bg-card/40">
      {/* Futuristic tab switcher */}
      <div className="relative flex border-b border-border bg-card/60">
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <button
          onClick={() => setActiveTab("news")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            activeTab === "news" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground/60 hover:text-foreground hover:bg-muted/10"
          }`}
          data-testid="tab-news-feed"
        >
          <Radio className="w-3 h-3" />News Feed
        </button>
        <button
          onClick={() => setActiveTab("xfeed")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            activeTab === "xfeed" ? "border-sky-400 text-sky-400 bg-sky-400/5" : "border-transparent text-muted-foreground/60 hover:text-foreground hover:bg-muted/10"
          }`}
          data-testid="tab-x-feed"
        >
          <Twitter className="w-3 h-3" />X Feed
        </button>
        <button
          onClick={() => setActiveTab("club5am")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            activeTab === "club5am" ? "border-amber-400 text-amber-400 bg-amber-400/5" : "border-transparent text-muted-foreground/60 hover:text-foreground hover:bg-muted/10"
          }`}
          data-testid="tab-club5am"
        >
          <Sun className="w-3 h-3" />5 AM
        </button>
      </div>

      {activeTab === "news" && (
        <>
          <div className="px-4 py-2.5 border-b border-border bg-gradient-to-b from-card/80 to-transparent">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Radio className="w-3 h-3 text-emerald-400 animate-pulse-dot" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-400/20 animate-ping" style={{ animationDuration: '3s' }} />
                </div>
                <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/70">Live News Feed</h2>
              </div>
              <span className="text-[9px] text-muted-foreground/60 tabular-nums font-medium bg-muted/30 px-2 py-0.5 rounded">{filteredNews.length} items</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Filter by ticker (e.g. TSLA, NVDA)..."
                value={newsTickerFilter}
                onChange={(e) => setNewsTickerFilter(e.target.value)}
                className="h-7 text-xs pl-7 pr-7 bg-muted/30 border-border"
                data-testid="news-ticker-filter"
              />
              {newsTickerFilter && (
                <button onClick={() => setNewsTickerFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" data-testid="btn-clear-news-filter">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {newsTickerFilter && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-semibold tracking-wider border-primary/40 text-primary">
                  {newsTickerFilter.toUpperCase()}
                </Badge>
                <span className="text-[9px] text-muted-foreground">{filteredNews.length} matching</span>
              </div>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border/30">
              {loadingNews ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 space-y-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))
              ) : filteredNews.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  {newsTickerFilter ? `No news found for "${newsTickerFilter.toUpperCase()}"` : "No news available"}
                </div>
              ) : (
                filteredNews.map((item) => (
                  <NewsItem key={item.id} item={item} onClick={() => onNewsClick(item)} />
                ))
              )}
            </div>
          </ScrollArea>
        </>
      )}

      {activeTab === "xfeed" && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <XFeedPanel />
        </div>
      )}

      {activeTab === "club5am" && (
        <Club5amPanel />
      )}
    </aside>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState("TSLA");
  const [searchFilter, setSearchFilter] = useState("");
  const [newsTickerFilter, setNewsTickerFilter] = useState("");
  const [selectedNews, setSelectedNews] = useState<News | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [tickerNewsSymbol, setTickerNewsSymbol] = useState<string | null>(null);

  const qc = useQueryClient();

  const { data: tickers = [], isLoading: loadingTickers } = useQuery<Ticker[]>({
    queryKey: ["/api/tickers"],
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: newsItems = [], isLoading: loadingNews } = useQuery<News[]>({
    queryKey: ["/api/news"],
    refetchInterval: 15000,
    staleTime: 0,
  });

  const { data: institutionalFlow = [], dataUpdatedAt: instUpdatedAt } = useQuery<any[]>({
    queryKey: ["/api/institutional-flow"],
    queryFn: () => apiRequest("GET", "/api/institutional-flow").then(r => r.json()),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const { data: darkPoolPrints = [], dataUpdatedAt: dpUpdatedAt } = useQuery<any[]>({
    queryKey: ["/api/dark-pool"],
    queryFn: () => apiRequest("GET", "/api/dark-pool").then(r => r.json()),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const { data: tickerExposures = [], dataUpdatedAt: expUpdatedAt } = useQuery<any[]>({
    queryKey: ["/api/exposure"],
    queryFn: () => apiRequest("GET", "/api/exposure").then(r => r.json()),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const { data: optionsFlowData = [], dataUpdatedAt: flowUpdatedAt } = useQuery<OptionsFlow[]>({
    queryKey: ["/api/options-flow"],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (tickers.length > 0) setLastRefresh(new Date());
  }, [tickers]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await apiRequest("POST", "/api/refresh");
      await Promise.all([
        qc.refetchQueries({ queryKey: ["/api/tickers"] }),
        qc.refetchQueries({ queryKey: ["/api/news"] }),
        qc.refetchQueries({ queryKey: ["/api/options-flow"] }),
        qc.refetchQueries({ queryKey: ["/api/institutional-flow"] }),
        qc.refetchQueries({ queryKey: ["/api/dark-pool"] }),
        qc.refetchQueries({ queryKey: ["/api/exposure"] }),
        qc.refetchQueries({ queryKey: ["/api/flow-intelligence"] }),
      ]);
    } catch { /* silent */ }
    setIsRefreshing(false);
  }, [qc]);

  const selectedTicker = tickers.find((t) => t.symbol === selectedSymbol) || tickers[0];

  const filteredStocks = useMemo(() => {
    const filter = searchFilter.toUpperCase();
    return tickers
      .filter((t) => STOCK_SYMBOLS.includes(t.symbol))
      .filter((t) => !filter || t.symbol.includes(filter) || t.name.toUpperCase().includes(filter))
      .sort((a, b) => STOCK_SYMBOLS.indexOf(a.symbol) - STOCK_SYMBOLS.indexOf(b.symbol));
  }, [tickers, searchFilter]);

  const filteredETFs = useMemo(() => {
    const filter = searchFilter.toUpperCase();
    return tickers
      .filter((t) => ETF_SYMBOLS.includes(t.symbol))
      .filter((t) => !filter || t.symbol.includes(filter) || t.name.toUpperCase().includes(filter))
      .sort((a, b) => ETF_SYMBOLS.indexOf(a.symbol) - ETF_SYMBOLS.indexOf(b.symbol));
  }, [tickers, searchFilter]);

  const activeStockSymbols = useMemo(() => STOCK_SYMBOLS.filter((s) => tickers.some((t) => t.symbol === s)), [tickers]);

  const filteredNews = useMemo(() => {
    // Sort by most recent first
    const sorted = [...newsItems].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (!isNaN(ta) && !isNaN(tb)) return tb - ta;
      return 0;
    });
    if (!newsTickerFilter) return sorted;
    const filter = newsTickerFilter.toUpperCase().trim();
    return sorted.filter((n) => {
      if (n.relatedTicker && n.relatedTicker.toUpperCase().includes(filter)) return true;
      if (n.title.toUpperCase().includes(filter)) return true;
      if (n.summary && n.summary.toUpperCase().includes(filter)) return true;
      return false;
    });
  }, [newsItems, newsTickerFilter]);

  if (loadingTickers) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3">
          <Activity className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading market data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" data-testid="dashboard-root">
      {/* ── Top Header Bar ── */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/60 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <svg viewBox="0 0 28 28" className="w-6 h-6" fill="none">
              <rect x="2" y="14" width="5" height="12" rx="1" fill="hsl(var(--primary))" opacity="0.7" />
              <rect x="9" y="8" width="5" height="18" rx="1" fill="hsl(var(--primary))" opacity="0.85" />
              <rect x="16" y="2" width="5" height="24" rx="1" fill="hsl(var(--primary))" />
              <rect x="23" y="10" width="5" height="16" rx="1" fill="hsl(var(--chart-2))" opacity="0.8" />
            </svg>
            <span className="text-sm font-bold tracking-wider">OPTIONFLOW</span>
          </div>
          <Separator orientation="vertical" className="h-5 flex-shrink-0" />
          <div className="min-w-0 overflow-hidden flex-1 max-w-[500px]">
            <MarketOverviewStrip tickers={tickers} />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link href="/chart">
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 transition-colors"
              data-testid="btn-open-chart"
            >
              <BarChart3 className="w-3 h-3" />
              <span className="hidden sm:inline">Live Chart</span>
            </button>
          </Link>
          <Link href="/earnings">
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/30 transition-colors"
              data-testid="btn-earnings-view"
            >
              <DollarSign className="w-3 h-3" />
              <span className="hidden sm:inline">Earnings</span>
            </button>
          </Link>
          <Link href="/macro">
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border border-blue-500/30 transition-colors"
              data-testid="btn-macro-view"
            >
              <CalendarDays className="w-3 h-3" />
              <span className="hidden sm:inline">Macro</span>
            </button>
          </Link>
          <Link href="/flow-intelligence">
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 border border-purple-500/30 transition-colors"
              data-testid="btn-flow-intel"
            >
              <Brain className="w-3 h-3" />
              <span className="hidden sm:inline">Flow Intel</span>
            </button>
          </Link>
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
            data-testid="btn-refresh"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{isRefreshing ? "Updating..." : "Refresh"}</span>
          </button>
          <span className="text-[9px] text-muted-foreground/60 hidden sm:inline">Auto-updates every 30s</span>
          <div className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse-dot" />
            <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-widest">Live</span>
          </div>
          <LiveClock />
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar — Watchlist ── */}
        <aside className="w-52 border-r border-border flex flex-col bg-sidebar/60 shrink-0">
          <div className="px-3 py-2.5 border-b border-sidebar-border">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/60 mb-2">Portfolio</h2>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Filter..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-7 text-xs pl-7 bg-sidebar-accent/50 border-sidebar-border"
                data-testid="sidebar-search"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredStocks.length > 0 && (
                <>
                  <div className="px-2 pt-1 pb-0.5">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Stocks</span>
                  </div>
                  {filteredStocks.map((t) => (
                    <TickerRow
                      key={t.symbol}
                      ticker={t}
                      isSelected={selectedSymbol === t.symbol}
                      onClick={() => setSelectedSymbol(t.symbol)}
                      onNewsClick={() => setTickerNewsSymbol(t.symbol)}
                    />
                  ))}
                </>
              )}
              {filteredETFs.length > 0 && (
                <>
                  <div className="px-2 pt-2 pb-0.5">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">ETFs</span>
                  </div>
                  {filteredETFs.map((t) => (
                    <TickerRow
                      key={t.symbol}
                      ticker={t}
                      isSelected={selectedSymbol === t.symbol}
                      onClick={() => setSelectedSymbol(t.symbol)}
                      onNewsClick={() => setTickerNewsSymbol(t.symbol)}
                    />
                  ))}
                </>
              )}
              {filteredStocks.length === 0 && filteredETFs.length === 0 && (
                <div className="text-center py-4 text-[10px] text-muted-foreground">No matches</div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* ── Center — Main Dashboard ── */}
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-4 space-y-4 max-w-[1400px]">
            {selectedTicker && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 space-y-4">
                  <TickerDetail ticker={selectedTicker} />
                  <GammaBar ticker={selectedTicker} />
                </div>
                <div className="lg:col-span-2">
                  <KeyLevelsCard ticker={selectedTicker} />
                </div>
              </div>
            )}

            <AllKeyLevelsTable tickers={tickers} />

            {/* Flow Intelligence (renamed from Options Flow) */}
            <FlowIntelligenceTable flowData={optionsFlowData} allTickers={tickers} lastUpdated={flowUpdatedAt} />

            {/* Institutional Flow (Smart Money) */}
            <InstitutionalFlowPanel institutionalFlow={institutionalFlow} lastUpdated={instUpdatedAt} />

            {/* Dark Pool + Flow + Sentiment + GEX/DEX + Expected Move */}
            <ExposureDashboard exposures={tickerExposures} darkPoolPrints={darkPoolPrints} lastUpdated={expUpdatedAt} />


          </div>
        </main>

        {/* ── Right Sidebar ── */}
        <RightSidebar
          newsItems={newsItems}
          filteredNews={filteredNews}
          newsTickerFilter={newsTickerFilter}
          setNewsTickerFilter={setNewsTickerFilter}
          loadingNews={loadingNews}
          onNewsClick={(item) => setSelectedNews(item)}
        />
      </div>

      {/* Modals */}
      <NewsModal item={selectedNews} open={selectedNews !== null} onClose={() => setSelectedNews(null)} />
      <TickerNewsModal ticker={tickerNewsSymbol} open={!!tickerNewsSymbol} onClose={() => setTickerNewsSymbol(null)} />
    </div>
  );
}
