import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useMemo } from "react";
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
  ArrowLeft, Globe, Filter, X, ChevronRight, Zap, Eye,
  TrendingUp as TrendUp,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
type MacroEvent = {
  id: number; date: string; time: string; country: string;
  event: string; previous: string | null; forecast: string | null;
  actual: string | null; importance: string; notes: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function countryFlag(country: string): string {
  if (country === "US") return "🇺🇸";
  if (country === "JP") return "🇯🇵";
  if (country === "EU") return "🇪🇺";
  if (country === "GB") return "🇬🇧";
  if (country === "CN") return "🇨🇳";
  return country;
}

function getMacroImpact(ev: MacroEvent): { headline: string; direction: "bullish" | "bearish" | "neutral" | "mixed"; analysis: string[]; tradingImplications: string[]; keyLevels: string } {
  const name = ev.event.toLowerCase();
  const actual = ev.actual ? parseFloat(ev.actual.replace(/[%,KB]/g, "")) : NaN;
  const forecast = ev.forecast ? parseFloat(ev.forecast.replace(/[%,KB]/g, "")) : NaN;
  const hasBeat = !isNaN(actual) && !isNaN(forecast) && actual > forecast;
  const hasMiss = !isNaN(actual) && !isNaN(forecast) && actual < forecast;
  const isPending = !ev.actual;

  // Fed / FOMC
  if (name.includes("fomc") || name.includes("fed ") || name.includes("federal reserve") || name.includes("interest rate decision")) {
    if (isPending) return { headline: "Decisión de tasa FOMC pendiente", direction: "neutral",
      analysis: ["El mercado está en modo espera. La volatilidad implícita (VIX) suele dispararse antes del FOMC.", "Un tono hawkish (subida o señal de subida) es bajista para equities y alcista para el dólar.", "Un tono dovish (pausa o señal de baja) es alcista para equities, bajista para el dólar."],
      tradingImplications: ["Evitar posiciones direccionales grandes antes del anuncio.", "Straddles/Strangles en SPY o QQQ pueden capturar el movimiento post-FOMC.", "Watch: QQQ, SPY, TLT como termómetros de reacción."],
      keyLevels: "SPY, QQQ, TLT, DXY" };
    return { headline: hasBeat ? "Tasa más alta de lo esperado — HAWKISH" : hasMiss ? "Tasa más baja/pausa — DOVISH" : "Tasa en línea con estimados",
      direction: hasBeat ? "bearish" : hasMiss ? "bullish" : "neutral",
      analysis: [hasBeat ? "Subida sorpresa o señal más agresiva: presión vendedora en equities, rally en DXY." : hasMiss ? "Pausa o tono más suave: rally en equities, especialmente growth/tech." : "Resultado en línea: reacción moderada, mercado busca señales en el statement.", `Actual: ${ev.actual || "—"} vs Estimado: ${ev.forecast || "—"} (Anterior: ${ev.previous || "—"})`],
      tradingImplications: [hasBeat ? "Puts en SPY/QQQ, calls en UUP (dólar)" : "Calls en QQQ/SPY, puts en DXY", "Vigilar reacción en primeros 15 min — suele ser fake-out seguido del movimiento real."],
      keyLevels: "SPY, QQQ, TLT, GLD, UUP" };
  }
  // CPI
  if (name.includes("cpi") || name.includes("consumer price") || name.includes("inflación") || name.includes("inflation")) {
    if (isPending) return { headline: "CPI pendiente — Reporte de inflación", direction: "neutral",
      analysis: ["El CPI es el dato más market-moving de los últimos años para la Fed.", "CPI más alto de lo esperado = más presión sobre la Fed para mantener/subir tasas = bajista para equities.", "CPI por debajo = señal de que la inflación se enfría = alcista para equities y bonos."],
      tradingImplications: ["Alta volatilidad esperada en apertura del día del reporte.", "SPY y QQQ son los más sensibles. Tecnología (NVDA, MSFT, AAPL) también reacciona fuerte.", "Considera iron condors si crees que el mercado sobrereacciona."],
      keyLevels: "SPY, QQQ, TLT, GLD, NVDA, TSLA" };
    return { headline: hasBeat ? `CPI Beat — Inflación más alta (${ev.actual} vs est. ${ev.forecast})` : hasMiss ? `CPI Miss — Inflación más baja (${ev.actual} vs est. ${ev.forecast})` : `CPI en línea (${ev.actual})`,
      direction: hasBeat ? "bearish" : hasMiss ? "bullish" : "neutral",
      analysis: [hasBeat ? "Inflación sorprendió al alza: la Fed tendrá que mantener tasas altas por más tiempo. Presión en equities, especialmente growth." : hasMiss ? "Inflación bajando más rápido: la Fed puede pivotar antes. Rally esperado en equities y bonos." : "Inflación en línea con expectativas. Reacción inicial moderada.", `Dato: ${ev.actual} | Estimado: ${ev.forecast} | Anterior: ${ev.previous}`],
      tradingImplications: [hasBeat ? "Puts en QQQ/SPY en rebote. Calls en UUP, USO puede correr." : "Calls en QQQ, SPY, NVDA. TLT podría subir también.", "Los primeros 30 minutos del mercado post-CPI son los más volátiles. Cuidado con spreads amplios."],
      keyLevels: "SPY, QQQ, TLT, GLD, DXY" };
  }
  // NFP / Jobs
  if (name.includes("nonfarm") || name.includes("non-farm") || name.includes("payroll") || name.includes("employment") || name.includes("unemployment") || name.includes("jobs")) {
    if (isPending) return { headline: "Reporte de empleo pendiente (NFP)", direction: "neutral",
      analysis: ["El NFP (Non-Farm Payrolls) es uno de los 3 datos más importantes del mes.", "Empleo fuerte = economía robusta, pero también = Fed no baja tasas pronto = mixed para equities.", "Empleo débil = señal de desaceleración = presión bajista, pero puede acelerar recortes de Fed."],
      tradingImplications: ["Típicamente se publica el primer viernes del mes a las 8:30 AM ET.", "Alta volatilidad en apertura. Gaps frecuentes en SPY, QQQ.", "Revisa la tasa de desempleo y el salario por hora también — son igual de importantes."],
      keyLevels: "SPY, QQQ, DIA, IWM, DXY" };
    return { headline: hasBeat ? `Nóminas superaron estimado (${ev.actual}K vs ${ev.forecast}K)` : hasMiss ? `Nóminas por debajo del estimado (${ev.actual}K vs ${ev.forecast}K)` : `Empleo en línea (${ev.actual}K)`,
      direction: hasBeat ? "mixed" : hasMiss ? "mixed" : "neutral",
      analysis: [hasBeat ? "Empleo más fuerte de lo esperado: economía resistente, pero implica que la Fed no tiene urgencia de bajar tasas. Reacción mixta frecuente." : "Empleo más débil: puede interpretarse como señal de recesión (bajista) o como catalizador para recorte de Fed (alcista para bonos).", `NFP: ${ev.actual}K | Est: ${ev.forecast}K | Prev: ${ev.previous}K`],
      tradingImplications: ["Esperar 15-30 minutos para que el mercado digiera el dato antes de entrar.", "DIA (Dow) y IWM (Small Caps) reaccionan más al empleo que QQQ."],
      keyLevels: "SPY, DIA, IWM, TLT, DXY" };
  }
  // GDP
  if (name.includes("gdp") || name.includes("gross domestic")) {
    if (isPending) return { headline: "PIB (GDP) pendiente", direction: "neutral",
      analysis: ["El GDP mide el crecimiento económico total. Dos trimestres negativos = recesión técnica.", "GDP por encima del estimado = economía sana = generalmente alcista para equities.", "GDP por debajo = señal de desaceleración = bajista, especialmente para cíclicas."],
      tradingImplications: ["Sectores más sensibles: financials (XLF), industriales, consumer discretionary.", "Si GDP decepciona y el mercado estaba optimista, el gap bajista puede ser agresivo."],
      keyLevels: "SPY, DIA, XLF, IWM" };
    return { headline: hasBeat ? `GDP beat — Crecimiento sobre estimado (${ev.actual}% vs ${ev.forecast}%)` : hasMiss ? `GDP miss — Crecimiento débil (${ev.actual}% vs ${ev.forecast}%)` : `GDP en línea (${ev.actual}%)`,
      direction: hasBeat ? "bullish" : hasMiss ? "bearish" : "neutral",
      analysis: [hasBeat ? "Economía creciendo más de lo esperado. Señal positiva para equities, especialmente cíclicos." : "Crecimiento más débil: presión en sectores cíclicos y financieros.", `GDP: ${ev.actual}% | Est: ${ev.forecast}% | Prev: ${ev.previous}%`],
      tradingImplications: [hasBeat ? "Calls en SPY, DIA, XLF." : "Cautela con posiciones largas. Puts en IWM y XLF pueden rendir."],
      keyLevels: "SPY, DIA, QQQ, XLF, IWM" };
  }
  // PMI / ISM
  if (name.includes("pmi") || name.includes("ism") || name.includes("manufacturing") || name.includes("services")) {
    if (isPending) return { headline: "PMI/ISM pendiente — Actividad económica", direction: "neutral",
      analysis: ["PMI sobre 50 = expansión económica. PMI bajo 50 = contracción.", "ISM Manufacturing es especialmente importante para acciones industriales y materiales.", "ISM Services (70% de la economía US) puede mover más el mercado que el manufacturero."],
      tradingImplications: ["Si PMI cae bajo 50, busca oportunidades en puts en DIA, XLI, XLB.", "PMI fuerte con inflación baja = escenario ideal para equities (Goldilocks)."],
      keyLevels: "SPY, DIA, XLI, XLB, IWM" };
    return { headline: hasBeat ? `PMI/ISM por encima de 50 — Expansión (${ev.actual})` : hasMiss ? `PMI/ISM por debajo de estimado (${ev.actual})` : `PMI/ISM en línea (${ev.actual})`,
      direction: hasBeat ? "bullish" : hasMiss ? "bearish" : "neutral",
      analysis: [hasBeat ? `PMI en ${ev.actual}: zona de expansión, positivo para industriales y manufactura.` : `PMI en ${ev.actual}: señal de contracción o desaceleración.`, `Actual: ${ev.actual} | Est: ${ev.forecast} | Prev: ${ev.previous}`],
      tradingImplications: [hasBeat ? "Calls en XLI, XLB, DIA." : "Cautela con industriales. Considera puts si rompe bajo 48."],
      keyLevels: "DIA, XLI, XLB, SPY" };
  }
  // Japan BOJ
  if (name.includes("boj") || name.includes("bank of japan") || (ev.country === "JP" && name.includes("interest rate"))) {
    return { headline: isPending ? "Decisión BOJ pendiente" : hasBeat ? "BOJ subió tasas — Yen se fortalece" : "BOJ mantuvo / bajó tasas",
      direction: isPending ? "neutral" : hasBeat ? "mixed" : "neutral",
      analysis: ["El BOJ es el banco central de Japón. Sus decisiones afectan el carry trade JPY y al Yen.", hasBeat ? "Subida de tasas BOJ → Yen se aprecia → carry trade se deshace → presión en equity markets globales." : "BOJ dovish: Yen débil, carry trade activo, equities globales generalmente beneficiados.", `Actual: ${ev.actual || "Pendiente"} | Est: ${ev.forecast || "—"}`],
      tradingImplications: ["Watch USD/JPY como indicador del carry trade.", "Un Yen fuerte puede crear selling pressure en mercados de riesgo (SPY, QQQ)."],
      keyLevels: "USD/JPY, SPY, GLD, QQQ" };
  }
  // Retail Sales
  if (name.includes("retail")) {
    return { headline: isPending ? "Ventas minoristas pendientes" : hasBeat ? `Ventas minoristas beat (${ev.actual} vs ${ev.forecast})` : hasMiss ? `Ventas minoristas miss (${ev.actual} vs ${ev.forecast})` : `Ventas minoristas en línea`,
      direction: isPending ? "neutral" : hasBeat ? "bullish" : hasMiss ? "bearish" : "neutral",
      analysis: ["Las ventas minoristas miden el gasto del consumidor americano — 70% del PIB.", hasBeat ? "Consumidor gastando más: señal de economía fuerte. Positivo para consumer discretionary (AMZN, NFLX)." : hasMiss ? "Consumidor apretando el cinturón: señal de desaceleración. Presión en retail y discretionary." : "En línea con expectativas: reacción moderada."],
      tradingImplications: [hasBeat ? "Calls en AMZN, XLY (consumer discretionary)." : "Cautela con retail. Calls en defensivos (XLP, XLU)."],
      keyLevels: "AMZN, XLY, XLP, SPY" };
  }
  // Generic fallback
  return { headline: isPending ? `${ev.event} — Pendiente` : hasBeat ? `${ev.event} — Por encima del estimado` : hasMiss ? `${ev.event} — Por debajo del estimado` : `${ev.event} — En línea`,
    direction: isPending ? "neutral" : hasBeat ? "bullish" : hasMiss ? "bearish" : "neutral",
    analysis: [isPending ? "Dato aún no publicado. Monitorear en tiempo real." : `Resultado: ${ev.actual || "—"} vs Estimado: ${ev.forecast || "—"} (Anterior: ${ev.previous || "—"})`, "Los datos macro de alta importancia (3 estrellas) suelen mover el mercado en los primeros 15-30 minutos después de su publicación."],
    tradingImplications: [hasBeat ? "Resultado positivo puede generar momentum alcista en apertura." : hasMiss ? "Resultado negativo puede causar presión vendedora." : "Resultado en línea: el mercado suele continuar su tendencia previa.", "Verifica el contexto macro general antes de operar basado en este dato."],
    keyLevels: "SPY, QQQ, DIA" };
}


// ─── Components ───────────────────────────────────────────────────────────────
function MacroEventModal({ ev, onClose }: { ev: MacroEvent; onClose: () => void }) {
  const impact = getMacroImpact(ev);
  const dirColors = {
    bullish: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", gradient: "from-emerald-500/10", badge: "ALCISTA" },
    bearish: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", gradient: "from-red-500/10", badge: "BAJISTA" },
    neutral: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", gradient: "from-blue-500/10", badge: "NEUTRAL" },
    mixed: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", gradient: "from-amber-500/10", badge: "MIXTO" },
  };
  const dc = dirColors[impact.direction];
  const actualVal = ev.actual ? parseFloat(ev.actual.replace(/[%,KB]/g, "")) : NaN;
  const forecastVal = ev.forecast ? parseFloat(ev.forecast.replace(/[%,KB]/g, "")) : NaN;
  const hasBeat = !isNaN(actualVal) && !isNaN(forecastVal) && actualVal > forecastVal;
  const hasMiss = !isNaN(actualVal) && !isNaN(forecastVal) && actualVal < forecastVal;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-card-border max-w-lg max-h-[88vh] flex flex-col p-0 overflow-hidden">
        <div className={`px-5 pt-4 pb-3 bg-gradient-to-r ${dc.gradient} to-transparent border-b border-border/60`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg ${dc.bg} ${dc.border} border flex items-center justify-center flex-shrink-0 mt-0.5`}>
              <Globe className={`w-4 h-4 ${dc.text}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">{countryFlag(ev.country)} {ev.country}</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{ev.time} ET</span>
              </div>
              <h2 className="text-sm font-bold mt-1 leading-snug">{ev.event}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${dc.bg} ${dc.border} ${dc.text}`}>{dc.badge}</span>
                <span className="text-[10px] text-muted-foreground">{impact.headline}</span>
              </div>
            </div>
            <button onClick={onClose} className="w-6 h-6 rounded-full bg-muted/40 hover:bg-muted/70 flex items-center justify-center flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-5 space-y-4">
            {/* Data metrics */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Anterior", value: ev.previous || "N/D", color: "text-muted-foreground" },
                { label: "Estimado", value: ev.forecast || "N/D", color: "text-blue-400" },
                { label: "Actual", value: ev.actual || "Pendiente", color: ev.actual ? (hasBeat ? "text-emerald-400" : hasMiss ? "text-red-400" : "text-foreground") : "text-amber-400" },
              ].map(m => (
                <div key={m.label} className="p-2.5 rounded-lg bg-muted/20 border border-border/40 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{m.label}</div>
                  <div className={`text-base font-bold tabular-nums ${m.color}`}>{m.value}</div>
                  {m.label === "Actual" && ev.actual && !isNaN(actualVal) && !isNaN(forecastVal) && (
                    <div className={`text-[9px] mt-0.5 font-medium ${hasBeat ? "text-emerald-400" : hasMiss ? "text-red-400" : "text-muted-foreground"}`}>
                      {hasBeat ? `+${(actualVal - forecastVal).toFixed(2)} BEAT` : hasMiss ? `${(actualVal - forecastVal).toFixed(2)} MISS` : "EN LÍNEA"}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Analysis */}
            <div className={`p-3 rounded-lg border ${dc.border} ${dc.bg}`}>
              <div className="flex items-center gap-1.5 mb-2">
                <TrendUp className={`w-3.5 h-3.5 ${dc.text}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${dc.text}`}>Análisis de Impacto al Mercado</span>
              </div>
              <div className="space-y-2">
                {impact.analysis.map((line, i) => (
                  <p key={i} className="text-[11px] leading-relaxed text-foreground/90 flex gap-2">
                    <span className={`text-[10px] font-bold mt-0.5 flex-shrink-0 ${dc.text}`}>{i + 1}.</span>
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/* Trading implications */}
            <div className="p-3 rounded-lg border border-border/40 bg-muted/20">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Implicaciones de Trading</span>
              </div>
              <div className="space-y-1.5">
                {impact.tradingImplications.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-primary text-[10px] mt-0.5 flex-shrink-0">▶</span>
                    <p className="text-[11px] leading-relaxed text-foreground/80">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Key tickers to watch */}
            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center gap-1.5 mb-2">
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Instrumentos a Vigilar</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {impact.keyLevels.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                  <span key={t} className="text-[10px] font-mono font-bold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">{t}</span>
                ))}
              </div>
            </div>

            {ev.notes && (
              <div className="p-3 rounded-lg border border-border/40 bg-muted/10">
                <p className="text-[10px] text-muted-foreground">{ev.notes}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}


function MacroCalendar({
  events, showUsaOnly, onToggleUsaOnly,
}: {
  events: MacroEvent[]; showUsaOnly: boolean; onToggleUsaOnly: () => void;
}) {
  const [selectedEvent, setSelectedEvent] = useState<MacroEvent | null>(null);

  const groupedByWeek = useMemo(() => {
    const now = new Date();
    const past4Weeks = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000); // include past 4 weeks
    const eightWeeksOut = new Date(now.getTime() + 56 * 24 * 60 * 60 * 1000);

    const filtered = events
      .filter((e) => {
        const d = new Date(e.date + "T12:00:00");
        if (d < past4Weeks || d > eightWeeksOut) return false;
        if (showUsaOnly && e.country !== "US") return false;
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const weeks: { label: string; isPast: boolean; isCurrentWeek: boolean; events: MacroEvent[] }[] = [];
    let currentWeekStart: Date | null = null;
    let currentWeekEvents: MacroEvent[] = [];

    for (const ev of filtered) {
      const d = new Date(ev.date + "T12:00:00");
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      if (!currentWeekStart || weekStart.getTime() !== currentWeekStart.getTime()) {
        if (currentWeekEvents.length > 0) {
          const weekEnd = new Date(currentWeekStart!);
          weekEnd.setDate(weekEnd.getDate() + 6);
          const wStart = currentWeekStart!;
          const nowWeekStart = new Date(now);
          nowWeekStart.setDate(nowWeekStart.getDate() - nowWeekStart.getDay()); nowWeekStart.setHours(0,0,0,0);
          weeks.push({
            label: `${wStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
            isPast: weekEnd < now,
            isCurrentWeek: wStart.getTime() === nowWeekStart.getTime(),
            events: currentWeekEvents,
          });
        }
        currentWeekStart = weekStart;
        currentWeekEvents = [];
      }
      currentWeekEvents.push(ev);
    }
    if (currentWeekEvents.length > 0 && currentWeekStart) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const nowWeekStart = new Date(now);
      nowWeekStart.setDate(nowWeekStart.getDate() - nowWeekStart.getDay()); nowWeekStart.setHours(0,0,0,0);
      weeks.push({
        label: `${currentWeekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        isPast: weekEnd < now,
        isCurrentWeek: currentWeekStart.getTime() === nowWeekStart.getTime(),
        events: currentWeekEvents,
      });
    }
    return weeks;
  }, [events, showUsaOnly]);

  const actualColor = (ev: MacroEvent) => {
    if (!ev.actual || !ev.forecast) return "text-foreground";
    const actual = parseFloat(ev.actual.replace(/[%,K]/g, ""));
    const forecast = parseFloat(ev.forecast.replace(/[%,K]/g, ""));
    if (isNaN(actual) || isNaN(forecast)) return "text-foreground";
    if (actual > forecast) return "text-emerald-400";
    if (actual < forecast) return "text-red-400";
    return "text-foreground";
  };

  const isToday = (dateStr: string) => {
    const today = new Date().toISOString().split("T")[0];
    return dateStr === today;
  };

  const isPastEvent = (dateStr: string) => {
    return new Date(dateStr + "T23:59:59") < new Date();
  };

  return (
    <>
    {selectedEvent && <MacroEventModal ev={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    <Card className="border-card-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-blue-500/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-xs font-bold tracking-wider">Macro Calendar</h3>
              <p className="text-[9px] text-muted-foreground">{showUsaOnly ? "Solo USA" : "USA + Japón"} · Solo eventos 3★ · Click en evento = análisis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400 bg-blue-500/5">
              FairEconomy
            </Badge>
            <button
              onClick={onToggleUsaOnly}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all border ${
                showUsaOnly ? "border-blue-500/60 text-blue-300 bg-blue-500/20 shadow-sm shadow-blue-500/20" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:border-border/80"
              }`}
              data-testid="btn-usa-filter"
            >
              <Filter className="w-3 h-3" />
              USA Only
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {groupedByWeek.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground">
            <Globe className="w-6 h-6 mx-auto mb-2 opacity-30" />
            No se encontraron eventos macro de alta importancia
          </div>
        )}
        {groupedByWeek.map((week, wi) => (
          <div key={wi} className={week.isPast ? "opacity-60" : ""}>
            {/* Week header */}
            <div className={`flex items-center gap-2 mb-2 px-1 py-1 rounded-lg ${
              week.isCurrentWeek ? "bg-primary/5 border border-primary/20" : week.isPast ? "" : ""
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                week.isCurrentWeek ? "bg-primary animate-pulse" : week.isPast ? "bg-muted-foreground/40" : "bg-blue-400/60"
              }`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                week.isCurrentWeek ? "text-primary" : week.isPast ? "text-muted-foreground/60" : "text-muted-foreground"
              }`}>{week.label}</span>
              {week.isCurrentWeek && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 border border-primary/30 text-primary font-semibold ml-1">ESTA SEMANA</span>}
              {week.isPast && <span className="text-[9px] text-muted-foreground/50 ml-1">pasado</span>}
              <span className="text-[9px] text-muted-foreground/50 ml-auto">{week.events.length} evento{week.events.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Events as cards */}
            <div className="space-y-1.5">
              {week.events.map((ev, ei) => {
                const todayEv = isToday(ev.date);
                const pastEv = isPastEvent(ev.date);
                const hasActual = !!ev.actual;
                const evActualVal = ev.actual ? parseFloat(ev.actual.replace(/[%,KB]/g, "")) : NaN;
                const evForecastVal = ev.forecast ? parseFloat(ev.forecast.replace(/[%,KB]/g, "")) : NaN;
                const beat = !isNaN(evActualVal) && !isNaN(evForecastVal) && evActualVal > evForecastVal;
                const miss = !isNaN(evActualVal) && !isNaN(evForecastVal) && evActualVal < evForecastVal;
                return (
                  <button
                    key={ei}
                    onClick={() => setSelectedEvent(ev)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all hover:shadow-sm cursor-pointer group ${
                      todayEv
                        ? "border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60"
                        : pastEv
                        ? "border-border/20 bg-muted/5 hover:bg-muted/15 hover:border-border/40"
                        : "border-border/30 bg-card hover:bg-muted/15 hover:border-border/60"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Left: flag + date */}
                      <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-10">
                        <span className="text-base leading-none">{countryFlag(ev.country)}</span>
                        <span className={`text-[9px] font-bold tabular-nums ${ todayEv ? "text-primary" : "text-muted-foreground" }`}>
                          {new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      {/* Event name + time */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {todayEv && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />}
                          <span className={`text-[11px] font-semibold truncate ${ todayEv ? "text-primary" : "text-foreground" }`}>{ev.event}</span>
                          <span className="text-[9px] text-muted-foreground/60 group-hover:text-primary/60 transition-colors ml-auto flex-shrink-0">
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground">{ev.time} ET</span>
                          {!hasActual && !pastEv && <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">Pendiente</span>}
                          {hasActual && beat && <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">BEAT ↑</span>}
                          {hasActual && miss && <span className="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full border border-red-500/20">MISS ↓</span>}
                          {hasActual && !beat && !miss && <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full border border-blue-500/20">EN LÍNEA</span>}
                        </div>
                      </div>
                      {/* Right: data */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {ev.forecast && <div className="text-center">
                          <div className="text-[8px] text-muted-foreground/60 uppercase">Est.</div>
                          <div className="text-[10px] text-blue-400 tabular-nums font-medium">{ev.forecast}</div>
                        </div>}
                        {ev.actual && <div className="text-center">
                          <div className="text-[8px] text-muted-foreground/60 uppercase">Act.</div>
                          <div className={`text-[10px] tabular-nums font-bold ${actualColor(ev)}`}>{ev.actual}</div>
                        </div>}
                        {ev.previous && <div className="text-center">
                          <div className="text-[8px] text-muted-foreground/60 uppercase">Prev.</div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">{ev.previous}</div>
                        </div>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
    </>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MacroPage() {
  const [showUsaOnly, setShowUsaOnly] = useState(false);

  const { data: macroEvents = [] } = useQuery<MacroEvent[]>({
    queryKey: ["/api/macro"],
    queryFn: () => apiRequest("GET", "/api/macro").then(r => r.json()),
    refetchInterval: 30000,       // poll every 30s for live actuals
    refetchIntervalInBackground: true, // keep polling even when tab is not focused
    staleTime: 0,                  // always consider data stale so it refetches
  });

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
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-bold tracking-wider">Macro Calendar</span>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 space-y-4 max-w-[1200px] mx-auto">
        <MacroCalendar
          events={macroEvents}
          showUsaOnly={showUsaOnly}
          onToggleUsaOnly={() => setShowUsaOnly(!showUsaOnly)}
        />
        {macroEvents.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Globe className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Cargando calendario macro...</p>
          </div>
        )}
      </main>
    </div>
  );
}
