import {
  tickers, news, earnings, macroEvents, optionsFlow,
  type Ticker, type InsertTicker,
  type News, type InsertNews,
  type Earning, type InsertEarning,
  type MacroEvent, type InsertMacroEvent,
  type OptionsFlow, type InsertOptionsFlow,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";

const sqlite = new Database("data.db");
const db = drizzle(sqlite);

export interface IStorage {
  getAllTickers(): Ticker[];
  getTickerBySymbol(symbol: string): Ticker | undefined;
  upsertTicker(data: InsertTicker): Ticker;
  getAllNews(): News[];
  addNews(data: InsertNews): News;
  deleteNews(id: number): void;
  clearAllNews(): void;
  getAllEarnings(): Earning[];
  getEarningsBySymbol(symbol: string): Earning[];
  addEarning(data: InsertEarning): Earning;
  clearAllEarnings(): void;
  getAllMacroEvents(): MacroEvent[];
  addMacroEvent(data: InsertMacroEvent): MacroEvent;
  clearAllMacroEvents(): void;
  updateMacroEventActual(id: number, actual: string, forecast?: string, previous?: string): void;
  getAllOptionsFlow(): OptionsFlow[];
  addOptionsFlow(data: InsertOptionsFlow): OptionsFlow;
  clearAllOptionsFlow(): void;
}

export class DatabaseStorage implements IStorage {
  getAllTickers(): Ticker[] {
    return db.select().from(tickers).all();
  }

  getTickerBySymbol(symbol: string): Ticker | undefined {
    return db.select().from(tickers).where(eq(tickers.symbol, symbol)).get();
  }

  upsertTicker(data: InsertTicker): Ticker {
    const existing = this.getTickerBySymbol(data.symbol);
    if (existing) {
      db.update(tickers).set(data).where(eq(tickers.symbol, data.symbol)).run();
      return this.getTickerBySymbol(data.symbol)!;
    }
    return db.insert(tickers).values(data).returning().get();
  }

  getAllNews(): News[] {
    return db.select().from(news).all();
  }

  addNews(data: InsertNews): News {
    return db.insert(news).values(data).returning().get();
  }

  deleteNews(id: number): void {
    db.delete(news).where(eq(news.id, id)).run();
  }

  clearAllNews(): void {
    db.delete(news).run();
  }

  getAllEarnings(): Earning[] {
    return db.select().from(earnings).all();
  }

  getEarningsBySymbol(symbol: string): Earning[] {
    return db.select().from(earnings).where(eq(earnings.symbol, symbol)).all();
  }

  addEarning(data: InsertEarning): Earning {
    return db.insert(earnings).values(data).returning().get();
  }

  clearAllEarnings(): void {
    db.delete(earnings).run();
  }

  getAllMacroEvents(): MacroEvent[] {
    return db.select().from(macroEvents).all();
  }

  addMacroEvent(data: InsertMacroEvent): MacroEvent {
    return db.insert(macroEvents).values(data).returning().get();
  }

  clearAllMacroEvents(): void {
    db.delete(macroEvents).run();
  }

  updateMacroEventActual(id: number, actual: string, forecast?: string, previous?: string): void {
    const update: any = { actual };
    if (forecast !== undefined) update.forecast = forecast;
    if (previous !== undefined) update.previous = previous;
    db.update(macroEvents).set(update).where(eq(macroEvents.id, id)).run();
  }

  getAllOptionsFlow(): OptionsFlow[] {
    return db.select().from(optionsFlow).all();
  }

  addOptionsFlow(data: InsertOptionsFlow): OptionsFlow {
    return db.insert(optionsFlow).values(data).returning().get();
  }

  clearAllOptionsFlow(): void {
    db.delete(optionsFlow).run();
  }
}

export const storage = new DatabaseStorage();
