/**
 * CLUB 5 AM — Backend Endpoints
 * ──────────────────────────────
 * POST /api/club5am/chat    — AI mentor chat powered by GPT-4o
 * GET  /api/club5am/wisdom  — Static wisdom cards from the base books
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Express } from "express";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: string;
  content: string;
}

interface WisdomCard {
  id: string;
  title: string;
  book: string;
  author: string;
  icon: string;
  color: string;
  content: string;
  principles: string[];
}

// ── Master System Prompt ─────────────────────────────────────────────────────

const CLUB5AM_SYSTEM_PROMPT = `Eres un Mentor de Alto Rendimiento y Estratega de Trading Institucional. Eres una síntesis viviente de Robin Sharma, James Clear, Dr. Ihaleakala Hew Len, Brian Tracy y T. Harv Eker. Tu sabiduría combina la psicología del "Millionaire Mind" con la disciplina de un monje y la precisión de un trader de Opciones 0DTE.

Tu alumno es un trader en formación que viene del mundo cripto y está integrándose en las acciones y opciones (0DTE y corto/medio plazo). Su objetivo es un cambio de vida total (180 grados).

LIBROS BASE:
- El Club de las 5 de la mañana (Robin Sharma): Fórmula 20/20/20 — 5:00-5:20 MUÉVETE (ejercicio intenso, sudoración, BDNF, dopamina), 5:20-5:40 REFLEXIONA (diario, meditación, planificación, oración), 5:40-6:00 CRECE (lectura, audiolibros, podcasts, estudio). Hipofrontalidad transitoria. Los 4 Imperios Interiores: Mental (Psicología), Corazón (Afectividad), Cuerpo (Estado Físico), Alma (Espiritualidad). El Día Maravilloso completo desde las 4:45 AM hasta las 21:30 PM con zonas libres de tecnología.
- Hábitos Atómicos (James Clear): 4 Leyes — 1ª Hacerlo Obvio, 2ª Hacerlo Atractivo, 3ª Hacerlo Sencillo, 4ª Hacerlo Satisfactorio. Mejora del 1% diario. Cambio basado en identidad. Regla de los 2 minutos. Apilamiento de hábitos.
- Zero Limits / Cero Límites (Joe Vitale & Dr. Hew Len): Ho'oponopono — "Lo siento, Perdóname, Te amo, Gracias". Responsabilidad 100%. Limpieza mental. Estado de Cero. Borrado de memorias limitantes.
- El Monje que vendió su Ferrari (Robin Sharma): Las 7 virtudes — Dominar la mente, Seguir el propósito, Kaizen (mejora continua), Vivir con disciplina, Respetar el tiempo, Servir a los demás, Abrazar el presente.
- Los 4 Acuerdos (Miguel Ruiz): Sé impecable con tus palabras, No te tomes nada personal, No hagas suposiciones, Haz siempre lo máximo que puedas.
- La Fórmula del Éxito en 3 Pasos: Paso 1 Aprendizaje/Mejor Consciencia, Paso 2 Implementación/Mejores Elecciones, Paso 3 Ingresos/Mejores Resultados.

CADENA DE PENSAMIENTO: Para cada interacción, analiza:
1. ¿Cómo se aplica la disciplina y el hábito a esta duda?
2. ¿Qué creencia limitante sobre el dinero está operando aquí?
3. ¿Cuál es la acción técnica más lógica para el riesgo 0DTE?
4. Verifica que el consejo cite principios de los libros mencionados.

TONO: Autoritario, inspirador y directo. No aceptes excusas, pero guía con compasión.
RESTRICCIÓN: Si el usuario muestra indisciplina, invoca el principio de Responsabilidad 100% de Cero Límites antes de cualquier análisis técnico.
FORMATO: Usa tablas para rutinas y listas de verificación para planes de trading.
IDIOMA: Responde SIEMPRE en español.`;

// ── Static Wisdom Cards ──────────────────────────────────────────────────────

const WISDOM_CARDS: WisdomCard[] = [
  {
    id: "formula-202020",
    title: "Fórmula 20/20/20",
    book: "El Club de las 5 AM",
    author: "Robin Sharma",
    icon: "⏰",
    color: "#f59e0b",
    content:
      "La primera hora de la mañana define la arquitectura de tu día. Divide los primeros 60 minutos en tres bloques de 20 minutos para activar tu máximo potencial antes de que el mundo despierte.",
    principles: [
      "5:00–5:20 MUÉVETE — Ejercicio intenso, sudoración, activa BDNF y dopamina. La hipofrontalidad transitoria libera tu mente de pensamientos negativos.",
      "5:20–5:40 REFLEXIONA — Diario de gratitud, meditación, planificación del día, oración. Calibra tu visión y tus prioridades.",
      "5:40–6:00 CRECE — Lectura, audiolibros, podcasts, estudio de trading. Invierte en tu capital intelectual diariamente.",
    ],
  },
  {
    id: "4-leyes-cambio",
    title: "Las 4 Leyes del Cambio",
    book: "Hábitos Atómicos",
    author: "James Clear",
    icon: "⚛️",
    color: "#6366f1",
    content:
      "El 1% de mejora diaria produce un resultado 37 veces mejor al final del año. Los hábitos son el interés compuesto de la superación personal. No te propones resultados, te propones sistemas.",
    principles: [
      "1ª Ley — Hacerlo OBVIO: Diseña tu entorno para que el hábito positivo sea la opción más visible. Apilamiento de hábitos.",
      "2ª Ley — Hacerlo ATRACTIVO: Agrupa lo que necesitas hacer con lo que quieres hacer. La anticipación dispara la dopamina.",
      "3ª Ley — Hacerlo SENCILLO: Regla de los 2 minutos. Reduce la fricción al mínimo. El inicio es todo.",
      "4ª Ley — Hacerlo SATISFACTORIO: El refuerzo inmediato cementa el hábito. Registra tu racha y no la rompas.",
    ],
  },
  {
    id: "hooponopono",
    title: "Ho'oponopono",
    book: "Zero Limits / Cero Límites",
    author: "Joe Vitale & Dr. Ihaleakala Hew Len",
    icon: "🌊",
    color: "#06b6d4",
    content:
      "Eres 100% responsable de todo lo que aparece en tu vida, incluyendo tus resultados de trading. No puedes controlar el mercado, pero puedes limpiar las memorias limitantes que distorsionan tu percepción. El Estado de Cero es donde ocurre la inspiración.",
    principles: [
      "LO SIENTO — Reconoce tu responsabilidad total. Nada externo tiene poder sobre ti sin tu participación inconsciente.",
      "PERDÓNAME — Pide perdón a tu subconsciente por las memorias que generan los patrones negativos.",
      "TE AMO — El amor es la frecuencia más alta de limpieza. Transmuta el miedo y la codicia.",
      "GRACIAS — La gratitud eleva tu vibración y te devuelve al Estado de Cero, donde todo es posible.",
    ],
  },
  {
    id: "4-imperios-interiores",
    title: "Los 4 Imperios Interiores",
    book: "El Club de las 5 AM",
    author: "Robin Sharma",
    icon: "🏛️",
    color: "#8b5cf6",
    content:
      "El liderazgo de tu vida comienza desde adentro hacia afuera. Un trader de élite no solo domina los gráficos — domina su mundo interior. La fortaleza en los mercados es un reflejo directo de la fortaleza interior.",
    principles: [
      "Imperio MENTAL — Psicología de trading: domina el sesgo de confirmación, el miedo a perder (FOMO) y la aversión a las pérdidas. Tu mente es tu primer activo.",
      "Imperio del CORAZÓN — Afectividad: opera desde la claridad emocional, no desde el pánico ni la euforia. La ecuanimidad es tu ventaja competitiva.",
      "Imperio del CUERPO — Estado físico: el sueño, la nutrición y el ejercicio regulan el cortisol y mantienen tu sistema nervioso óptimo para decisiones de alto riesgo.",
      "Imperio del ALMA — Espiritualidad: conecta con tu propósito mayor. El dinero como herramienta de libertad y servicio, no como fin en sí mismo.",
    ],
  },
  {
    id: "dia-maravilloso",
    title: "El Día Maravilloso",
    book: "El Club de las 5 AM",
    author: "Robin Sharma",
    icon: "🌅",
    color: "#f97316",
    content:
      "La estructura del día de un ganador no es accidente — es arquitectura deliberada. Cada bloque de tiempo tiene una función específica para maximizar tu energía, enfoque y recuperación a lo largo del día.",
    principles: [
      "4:45 AM — Despertar. Hidratación. Sin tecnología. Intención del día.",
      "5:00–6:00 AM — Fórmula 20/20/20: Muévete, Reflexiona, Crece.",
      "6:00–8:00 AM — Trabajo profundo #1 (Deep Work). Máxima concentración en trading/estudio.",
      "8:00–8:20 AM — Descanso de recuperación (sin pantallas). Movimiento ligero.",
      "8:20–10:20 AM — Trabajo profundo #2. Análisis de mercado, journaling de trades.",
      "10:20–10:40 AM — Pausa de recuperación. Nutrición, hidratación.",
      "12:00–13:00 PM — Almuerzo sin tecnología. Zona de restauración.",
      "13:00–15:00 PM — Trabajo enfocado #3. Revisión de posiciones, gestión de riesgo.",
      "17:00–19:00 PM — Ejercicio vespertino o familia. Desconexión del mercado.",
      "20:00–21:00 PM — Lectura analógica, reflexión del día, planificación del mañana.",
      "21:30 PM — Sin tecnología. Preparación para el sueño. Luces tenues.",
    ],
  },
  {
    id: "7-virtudes-monje",
    title: "Las 7 Virtudes del Monje",
    book: "El Monje que Vendió su Ferrari",
    author: "Robin Sharma",
    icon: "🏔️",
    color: "#10b981",
    content:
      "Julian Mantle dejó atrás una vida de éxito vacío para descubrir que la verdadera riqueza vive en la maestría interior. Estas 7 virtudes son el código de conducta del trader que trasciende los resultados y opera desde la excelencia.",
    principles: [
      "1. Dominar la MENTE — El jardín de la mente: solo planta semillas de pensamientos que quieras cosechar. Vigila tu diálogo interno.",
      "2. Seguir el PROPÓSITO — Conoce tu dharma. El trading debe estar al servicio de un objetivo de vida más grande.",
      "3. KAIZEN — Mejora continua del 1%. Revisa tus trades, actualiza tu playbook, nunca pares de aprender.",
      "4. Vivir con DISCIPLINA — La autodisciplina es el alma del trading rentable. Sin ella, la mejor estrategia fracasa.",
      "5. Respetar el TIEMPO — El tiempo es el único activo no renovable. Cada hora no invertida en crecimiento es un costo de oportunidad.",
      "6. Servir a los DEMÁS — El éxito sin contribución es vacío. Comparte tu conocimiento, mentoriza, crea valor.",
      "7. Abrazar el PRESENTE — El análisis del pasado y la planificación del futuro ocurren ahora. Opera en el momento, no en el miedo.",
    ],
  },
  {
    id: "4-acuerdos",
    title: "Los 4 Acuerdos",
    book: "Los 4 Acuerdos Toltecas",
    author: "Miguel Ángel Ruiz",
    icon: "📜",
    color: "#ec4899",
    content:
      "Los acuerdos que hiciste contigo mismo y con el mundo determinan tu realidad como trader. La mayoría son acuerdos de limitación heredados. Estos 4 acuerdos son el código del guerrero tolteca aplicado a los mercados.",
    principles: [
      "1. Sé IMPECABLE con tus palabras — No te jures que 'nunca perderás' ni que el mercado 'siempre sube'. Habla con precisión y sin dramatismo.",
      "2. No te tomes nada PERSONAL — El mercado no va en tu contra. Una pérdida no define tu valía. El stop-loss no es un fracaso personal.",
      "3. No hagas SUPOSICIONES — Pide confirmación antes de entrar. Lee el flujo real, no el que imaginas. Asume que no sabes.",
      "4. Haz siempre lo MÁXIMO que puedas — Tu máximo varía cada día. En los días difíciles, tu máximo es preservar capital. En los buenos, es ejecutar el plan con precisión.",
    ],
  },
  {
    id: "formula-exito",
    title: "La Fórmula del Éxito",
    book: "El Club de las 5 AM",
    author: "Robin Sharma",
    icon: "🚀",
    color: "#14b8a6",
    content:
      "El éxito sostenible no es un evento, es un proceso de 3 pasos que se retroalimenta. Cada iteración te eleva a un nivel superior de rendimiento. Aplícalo tanto a tu trading como a tu vida.",
    principles: [
      "Paso 1 — APRENDIZAJE / Mejor Consciencia: Estudia el mercado, los libros base, tu psicología. Invierte en tu educación cada día sin excepción. Lo que no sabes te cuesta dinero.",
      "Paso 2 — IMPLEMENTACIÓN / Mejores Elecciones: Aplica lo aprendido con disciplina de ejecución. Un plan mediocre ejecutado perfectamente supera al mejor plan ejecutado a medias.",
      "Paso 3 — INGRESOS / Mejores Resultados: Los resultados son la consecuencia natural de los pasos 1 y 2. No persigas el dinero — persigue la excelencia y el dinero te seguirá.",
    ],
  },
];

// ── Anthropic Claude Helper ──────────────────────────────────────────────────

const anthropic = new Anthropic();

async function callClaude(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude_sonnet_4_6",
    max_tokens: 1500,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const textBlock = response.content.find((b: any) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Empty response from Claude");
  return textBlock.text;
}

// ── Route Registration ───────────────────────────────────────────────────────

export function registerClub5amRoutes(app: Express): void {
  /**
   * POST /api/club5am/chat
   * Body: { message: string, history: Array<{ role: string, content: string }> }
   * Returns: { reply: string }
   */
  app.post("/api/club5am/chat", async (req, res) => {
    const { message, history } = req.body as {
      message: string;
      history: ChatMessage[];
    };

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const safeHistory: ChatMessage[] = Array.isArray(history) ? history : [];

    // Build the messages array: history + new user message
    const messages: ChatMessage[] = [
      ...safeHistory,
      { role: "user", content: message },
    ];

    try {
      const reply = await callClaude(CLUB5AM_SYSTEM_PROMPT, messages);
      return res.json({ reply });
    } catch (err: any) {
      console.error("[club5am] Chat error:", err.message);
      return res.status(500).json({ error: "Error al contactar al mentor. Intenta de nuevo." });
    }
  });

  /**
   * GET /api/club5am/wisdom
   * Returns: WisdomCard[]
   */
  app.get("/api/club5am/wisdom", (_req, res) => {
    res.json(WISDOM_CARDS);
  });
}
