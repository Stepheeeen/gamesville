// ── Persistence — Gamesville ──────────────────────────────────────────────────
// Dual backend behind one async API:
//   • MongoDB when MONGODB_URI is set (db 'games-ville'), with graceful
//     fallback if the connection fails
//   • JSON file store at .data/store.json otherwise — the app runs with
//     zero environment configuration
// Connections/caches live on globalThis so dev hot-reload doesn't leak.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import { GAMES } from './game-catalog';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PassType = 'day' | 'weekend' | 'golden';

export interface UserStats {
  plays: number;
  wins: number;
  records: number;
  streak: number;
  /** UTC day string 'YYYY-MM-DD' of the last counted play. */
  lastPlayDay: string | null;
}

export interface UserDoc {
  id: string;
  phone: string;
  passwordHash: string | null;
  securityQuestion: string | null;
  securityAnswerHash: string | null;
  tempCode: string | null;
  tempCodeExpires: string | null;
  isFirstLogin: boolean;
  pass: { type: PassType; expiresAt: string } | null;
  stats: UserStats;
  createdAt: string;
}

export interface ScoreDoc {
  phone: string;
  gameId: string;
  score: number;
  at: string;
}

export interface BoardRow {
  phone: string;
  score: number;
  at: string;
}

export interface ChampionshipRow {
  phone: string;
  points: number;
  boards: number; // boards the player appears on
}

/** Carnival Cup — F1-style points for the top 10 of each game board. */
export const RANK_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const EMPTY_STATS: UserStats = { plays: 0, wins: 0, records: 0, streak: 0, lastPlayDay: null };

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Legacy user docs predate pass/stats — default them on read. */
function hydrateUser(raw: Record<string, unknown>, id: string): UserDoc {
  return {
    id,
    phone: String(raw.phone),
    passwordHash: (raw.passwordHash as string) ?? null,
    securityQuestion: (raw.securityQuestion as string) ?? null,
    securityAnswerHash: (raw.securityAnswerHash as string) ?? null,
    tempCode: (raw.tempCode as string) ?? null,
    tempCodeExpires: raw.tempCodeExpires ? new Date(raw.tempCodeExpires as string).toISOString() : null,
    isFirstLogin: Boolean(raw.isFirstLogin ?? true),
    pass: (raw.pass as UserDoc['pass']) ?? null,
    stats: { ...EMPTY_STATS, ...((raw.stats as UserStats) ?? {}) },
    createdAt: raw.createdAt ? new Date(raw.createdAt as string).toISOString() : new Date().toISOString(),
  };
}

// ── Mongo backend ─────────────────────────────────────────────────────────────

type MongoHandles = { db: Db; users: Collection; scores: Collection };

const g = globalThis as unknown as {
  __gvMongo?: Promise<MongoHandles | null>;
  __gvFile?: FileStore;
};

async function mongo(): Promise<MongoHandles | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!g.__gvMongo) {
    g.__gvMongo = (async () => {
      try {
        const { MongoClient } = await import('mongodb');
        const client = new MongoClient(uri);
        await client.connect();
        const db = client.db('games-ville');
        const users = db.collection('users');
        const scores = db.collection('scores');
        await Promise.all([
          users.createIndex({ phone: 1 }, { unique: true }),
          scores.createIndex({ phone: 1, gameId: 1 }, { unique: true }),
          scores.createIndex({ gameId: 1, score: -1 }),
        ]).catch(() => {});
        return { db, users, scores };
      } catch (err) {
        console.error('[db] Mongo connect failed, falling back to file store:', err);
        return null;
      }
    })();
  }
  return g.__gvMongo;
}

// ── File backend ──────────────────────────────────────────────────────────────

interface FileShape {
  users: Record<string, Record<string, unknown>>; // keyed by phone
  scores: ScoreDoc[];
  mnoEvents?: Record<string, unknown>[];
}

class FileStore {
  private file = path.join(process.cwd(), '.data', 'store.json');
  data: FileShape;

  constructor() {
    let parsed: FileShape | null = null;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as FileShape;
    } catch {
      /* first boot */
    }
    this.data = parsed ?? { users: {}, scores: [] };
  }

  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file); // atomic on POSIX
    } catch (err) {
      console.error('[db] file flush failed:', err);
    }
  }
}

function file(): FileStore {
  if (!g.__gvFile) g.__gvFile = new FileStore();
  return g.__gvFile;
}

/** Kick the backend at server boot so first click isn't a cold connect. */
export async function warmDb() {
  const m = await mongo();
  if (!m) file();
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getUserByPhone(phone: string): Promise<UserDoc | null> {
  const m = await mongo();
  if (m) {
    const doc = await m.users.findOne({ phone });
    return doc ? hydrateUser(doc as Record<string, unknown>, doc._id.toString()) : null;
  }
  const raw = file().data.users[phone];
  return raw ? hydrateUser(raw, String(raw.id ?? phone)) : null;
}

export async function getUserById(id: string): Promise<UserDoc | null> {
  const m = await mongo();
  if (m) {
    try {
      const { ObjectId } = await import('mongodb');
      const doc = await m.users.findOne({ _id: new ObjectId(id) });
      return doc ? hydrateUser(doc as Record<string, unknown>, doc._id.toString()) : null;
    } catch {
      return null;
    }
  }
  const raw = Object.values(file().data.users).find((u) => u.id === id);
  return raw ? hydrateUser(raw, id) : null;
}

export async function createUser(phone: string, tempCode: string, expiresMs: number): Promise<UserDoc> {
  const now = new Date();
  const base = {
    phone,
    isFirstLogin: true,
    tempCode,
    tempCodeExpires: new Date(now.getTime() + expiresMs).toISOString(),
    passwordHash: null,
    securityQuestion: null,
    securityAnswerHash: null,
    pass: null,
    stats: { ...EMPTY_STATS },
    createdAt: now.toISOString(),
  };
  const m = await mongo();
  if (m) {
    const res = await m.users.insertOne({ ...base });
    return hydrateUser(base, res.insertedId.toString());
  }
  const store = file();
  const id = crypto.randomUUID();
  store.data.users[phone] = { ...base, id };
  store.flush();
  return hydrateUser(store.data.users[phone], id);
}

export async function updateUser(phone: string, patch: Partial<Omit<UserDoc, 'id' | 'phone'>>): Promise<void> {
  const m = await mongo();
  if (m) {
    await m.users.updateOne({ phone }, { $set: { ...patch, updatedAt: new Date() } });
    return;
  }
  const store = file();
  const raw = store.data.users[phone];
  if (!raw) return;
  Object.assign(raw, patch);
  store.flush();
}

export async function totalPlayers(): Promise<number> {
  const m = await mongo();
  if (m) return m.users.countDocuments();
  return Object.keys(file().data.users).length;
}

// ── MNO callbacks ─────────────────────────────────────────────────────────────

/** Append a raw aggregator callback to the audit log (`mno_events`). */
export async function logMnoEvent(entry: Record<string, unknown>): Promise<void> {
  const m = await mongo();
  if (m) {
    await m.db.collection('mno_events').insertOne({ ...entry });
    return;
  }
  const store = file();
  (store.data.mnoEvents ??= []).push(entry);
  store.flush();
}

// ── Passes ("Ride Tickets & Wristbands") ──────────────────────────────────────

export async function setPass(phone: string, type: PassType, days: number): Promise<UserDoc['pass']> {
  const user = await getUserByPhone(phone);
  if (!user) return null;
  // Same active type extends; anything else replaces.
  const now = Date.now();
  const activeSameType =
    user.pass && user.pass.type === type && new Date(user.pass.expiresAt).getTime() > now;
  const from = activeSameType ? new Date(user.pass!.expiresAt).getTime() : now;
  const pass = { type, expiresAt: new Date(from + days * 86_400_000).toISOString() };
  await updateUser(phone, { pass });
  return pass;
}

export async function cancelPass(phone: string): Promise<void> {
  await updateUser(phone, { pass: null });
}

export function passActive(user: Pick<UserDoc, 'pass'> | null): boolean {
  return !!user?.pass && new Date(user.pass.expiresAt).getTime() > Date.now();
}

// ── Scores ────────────────────────────────────────────────────────────────────

/** Best-per-game upsert. Returns whether this run set a new personal best. */
export async function submitScore(phone: string, gameId: string, score: number): Promise<{ best: boolean }> {
  const at = new Date().toISOString();
  const m = await mongo();
  if (m) {
    const upd = await m.scores.updateOne(
      { phone, gameId, score: { $lt: score } },
      { $set: { score, at } },
    );
    if (upd.modifiedCount > 0) return { best: true };
    try {
      await m.scores.insertOne({ phone, gameId, score, at });
      return { best: true };
    } catch {
      return { best: false }; // duplicate key — an equal-or-better score exists
    }
  }
  const store = file();
  const existing = store.data.scores.find((s) => s.phone === phone && s.gameId === gameId);
  if (!existing) {
    store.data.scores.push({ phone, gameId, score, at });
    store.flush();
    return { best: true };
  }
  if (score > existing.score) {
    existing.score = score;
    existing.at = at;
    store.flush();
    return { best: true };
  }
  return { best: false };
}

/** Per-game top N. One row per player by construction (best-per-game). */
export async function topScores(gameId: string, limit = 10): Promise<BoardRow[]> {
  const m = await mongo();
  if (m) {
    const docs = await m.scores
      .find({ gameId })
      .sort({ score: -1, at: 1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => ({ phone: String(d.phone), score: Number(d.score), at: String(d.at) }));
  }
  return file()
    .data.scores.filter((s) => s.gameId === gameId)
    .sort((a, b) => b.score - a.score || a.at.localeCompare(b.at))
    .slice(0, limit)
    .map(({ phone, score, at }) => ({ phone, score, at }));
}

export async function playerBests(phone: string): Promise<Record<string, number>> {
  const m = await mongo();
  const rows = m
    ? await m.scores.find({ phone }).toArray()
    : file().data.scores.filter((s) => s.phone === phone);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.gameId)] = Number(r.score);
  return out;
}

/** 1-based rank on a game board; null when the player isn't on it. */
export async function rankInGame(phone: string, gameId: string): Promise<number | null> {
  const m = await mongo();
  if (m) {
    const mine = await m.scores.findOne({ phone, gameId });
    if (!mine) return null;
    const better = await m.scores.countDocuments({ gameId, score: { $gt: mine.score } });
    return better + 1;
  }
  const rows = file().data.scores.filter((s) => s.gameId === gameId);
  const mine = rows.find((s) => s.phone === phone);
  if (!mine) return null;
  return rows.filter((s) => s.score > mine.score).length + 1;
}

export async function recentScores(limit = 8): Promise<ScoreDoc[]> {
  const m = await mongo();
  if (m) {
    const docs = await m.scores.find({}).sort({ at: -1 }).limit(limit).toArray();
    return docs.map((d) => ({
      phone: String(d.phone),
      gameId: String(d.gameId),
      score: Number(d.score),
      at: String(d.at),
    }));
  }
  return [...file().data.scores]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((s) => ({ ...s }));
}

export async function boardCounts(): Promise<Record<string, number>> {
  const m = await mongo();
  const out: Record<string, number> = {};
  if (m) {
    const agg = await m.scores
      .aggregate([{ $group: { _id: '$gameId', n: { $sum: 1 } } }])
      .toArray();
    for (const row of agg) out[String(row._id)] = Number(row.n);
    return out;
  }
  for (const s of file().data.scores) out[s.gameId] = (out[s.gameId] ?? 0) + 1;
  return out;
}

// ── Stats & streaks ───────────────────────────────────────────────────────────

export async function bumpStats(
  phone: string,
  { win, record }: { win: boolean; record: boolean },
): Promise<void> {
  const user = await getUserByPhone(phone);
  if (!user) return;
  const today = utcDay();
  const last = user.stats.lastPlayDay;
  let streak = user.stats.streak;
  if (last !== today) {
    const yesterday = utcDay(new Date(Date.now() - 86_400_000));
    streak = last === yesterday ? streak + 1 : 1;
  }
  await updateUser(phone, {
    stats: {
      plays: user.stats.plays + 1,
      wins: user.stats.wins + (win ? 1 : 0),
      records: user.stats.records + (record ? 1 : 0),
      streak,
      lastPlayDay: today,
    },
  });
}

// ── Carnival Cup ──────────────────────────────────────────────────────────────

/** Sum F1-style points (25,18,…,1) across every game board's top 10. */
export async function championship(): Promise<ChampionshipRow[]> {
  const totals = new Map<string, { points: number; boards: number }>();
  // One parallel fan-out — serial round trips to Atlas cost ~10× as much.
  const boards = await Promise.all(GAMES.map((g) => topScores(g.id, RANK_POINTS.length)));
  for (const rows of boards) {
    rows.forEach((row, i) => {
      const cur = totals.get(row.phone) ?? { points: 0, boards: 0 };
      cur.points += RANK_POINTS[i];
      cur.boards += 1;
      totals.set(row.phone, cur);
    });
  }
  return [...totals.entries()]
    .map(([phone, v]) => ({ phone, points: v.points, boards: v.boards }))
    .sort((a, b) => b.points - a.points || b.boards - a.boards);
}
