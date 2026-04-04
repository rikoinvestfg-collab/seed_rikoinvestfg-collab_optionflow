import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tickers = sqliteTable("tickers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  price: real("price").notNull(),
  change: real("change").notNull(),
  changePercent: real("change_percent").notNull(),
  marketCap: real("market_cap"),
  volume: integer("volume"),
  dayLow: real("day_low"),
  dayHigh: real("day_high"),
  previousClose: real("previous_close"),
  open: real("open"),
  pe: real("pe"),
  eps: real("eps"),
  gammaFlip: text("gamma_flip"),
  maxPain: text("max_pain"),
  callWall: text("call_wall"),
  putWall: text("put_wall"),
  gammaRegime: text("gamma_regime"),
  atmIv: text("atm_iv"),
  netGex: text("net_gex"),
});

export const news = sqliteTable("news", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  summary: text("summary"),
  source: text("source"),
  url: text("url"),
  relatedTicker: text("related_ticker"),
  timestamp: text("timestamp").notNull(),
  sentiment: text("sentiment"),
});

export const earnings = sqliteTable("earnings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  period: text("period").notNull(),
  date: text("date").notNull(),
  actualEps: real("actual_eps"),
  estimatedEps: real("estimated_eps"),
  actualRevenue: real("actual_revenue"),
  estimatedRevenue: real("estimated_revenue"),
  surprise: text("surprise"),
  isUpcoming: integer("is_upcoming").default(0),
});

export const macroEvents = sqliteTable("macro_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  time: text("time").notNull(),
  country: text("country").notNull(),
  event: text("event").notNull(),
  previous: text("previous"),
  forecast: text("forecast"),
  actual: text("actual"),
  importance: text("importance").notNull(),
  notes: text("notes"),
});

// New: Options flow signals table
export const optionsFlow = sqliteTable("options_flow", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  type: text("type").notNull(), // CALL or PUT
  strike: text("strike"),
  expiry: text("expiry"),
  premium: text("premium"),
  volume: text("volume"),
  openInterest: text("open_interest"),
  sentiment: text("sentiment"), // bullish, bearish, neutral
  signal: text("signal"), // sweep, block, unusual
  timestamp: text("timestamp").notNull(),
  details: text("details"),
});

export const insertTickerSchema = createInsertSchema(tickers).omit({ id: true });
export const insertNewsSchema = createInsertSchema(news).omit({ id: true });
export const insertEarningSchema = createInsertSchema(earnings).omit({ id: true });
export const insertMacroEventSchema = createInsertSchema(macroEvents).omit({ id: true });
export const insertOptionsFlowSchema = createInsertSchema(optionsFlow).omit({ id: true });

export type InsertTicker = z.infer<typeof insertTickerSchema>;
export type Ticker = typeof tickers.$inferSelect;
export type InsertNews = z.infer<typeof insertNewsSchema>;
export type News = typeof news.$inferSelect;
export type InsertEarning = z.infer<typeof insertEarningSchema>;
export type Earning = typeof earnings.$inferSelect;
export type InsertMacroEvent = z.infer<typeof insertMacroEventSchema>;
export type MacroEvent = typeof macroEvents.$inferSelect;
export type InsertOptionsFlow = z.infer<typeof insertOptionsFlowSchema>;
export type OptionsFlow = typeof optionsFlow.$inferSelect;
