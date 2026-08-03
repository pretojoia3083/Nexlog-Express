import { kv } from '@vercel/kv';

const USE_KV = !!process.env.KV_REST_API_URL || !!process.env.VERCEL_KV_URL || !!process.env.KV_URL || !!process.env.KV_REST_API_TOKEN;

interface TrackPoint {
  lat: number;
  lng: number;
  ts: number;
}

export interface TrackSession {
  id: string;
  nome: string;
  userEmail: string;
  userName: string;
  pontos: TrackPoint[];
  ultimaPosicao: TrackPoint | null;
  inicio: number;
  ativo: boolean;
}

const memUsers: any[] = [];
const memSessions = new Map<string, TrackSession>();

const SESSION_TTL = 60 * 15;

export async function listUsers(): Promise<any[]> {
  if (!USE_KV) return memUsers;
  try {
    return (await kv.get<any[]>('nexlog:users')) || [];
  } catch {
    return memUsers;
  }
}

export async function saveUser(u: any): Promise<void> {
  if (USE_KV) {
    try {
      const users = (await kv.get<any[]>('nexlog:users')) || [];
      const idx = users.findIndex((x: any) => x.email === u.email);
      if (idx >= 0) users[idx] = { ...users[idx], ...u };
      else users.push(u);
      await kv.set('nexlog:users', users);
      return;
    } catch {}
  }
  const idx = memUsers.findIndex((x: any) => x.email === u.email);
  if (idx >= 0) memUsers[idx] = { ...memUsers[idx], ...u };
  else memUsers.push(u);
}

export async function getSession(id: string): Promise<TrackSession | null> {
  if (USE_KV) {
    try {
      const raw = await kv.get<string>('nexlog:sess:' + id);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return memSessions.get(id) || null;
}

export async function upsertSession(id: string, data: Partial<TrackSession>): Promise<TrackSession> {
  const existing = await getSession(id);
  const updated: TrackSession = {
    ...(existing || { id, nome: '', userEmail: '', userName: '', pontos: [], ultimaPosicao: null, inicio: Date.now(), ativo: true }),
    ...data,
    id,
  };
  memSessions.set(id, updated);
  if (USE_KV) {
    try {
      await kv.set('nexlog:sess:' + id, JSON.stringify(updated), { ex: SESSION_TTL });
      await kv.sadd('nexlog:sess_ids', id);
    } catch {}
  }
  return updated;
}

export async function addTrackPoint(sessionId: string, ponto: TrackPoint): Promise<TrackSession | null> {
  const s = await getSession(sessionId);
  if (!s) return null;
  s.pontos = [...s.pontos, ponto];
  if (s.pontos.length > 1000) s.pontos = s.pontos.slice(-800);
  s.ultimaPosicao = ponto;
  memSessions.set(sessionId, s);
  if (USE_KV) {
    try {
      await kv.set('nexlog:sess:' + sessionId, JSON.stringify(s), { ex: SESSION_TTL });
      await kv.sadd('nexlog:sess_ids', sessionId);
    } catch {}
  }
  return s;
}

export async function listActiveSessions(): Promise<TrackSession[]> {
  const now = Date.now();
  const result: TrackSession[] = [];
  if (USE_KV) {
    try {
      const ids = (await kv.smembers('nexlog:sess_ids')) || [];
      for (const id of ids) {
        const s = await getSession(id);
        if (s && s.ativo && s.ultimaPosicao && (now - s.ultimaPosicao.ts) < 300000) result.push(s);
      }
      return result;
    } catch {}
  }
  for (const s of memSessions.values()) {
    if (s.ativo && s.ultimaPosicao && (now - s.ultimaPosicao.ts) < 300000) result.push(s);
  }
  return result;
}

export async function deactivateSession(id: string): Promise<void> {
  const s = await getSession(id);
  if (!s) return;
  s.ativo = false;
  memSessions.set(id, s);
  if (USE_KV) {
    try {
      await kv.set('nexlog:sess:' + id, JSON.stringify(s), { ex: SESSION_TTL });
      await kv.srem('nexlog:sess_ids', id);
    } catch {}
  }
}

export async function getCachedGeocode(q: string): Promise<{ lat: number; lng: number } | null> {
  if (!USE_KV) return null;
  try {
    const raw = await kv.get<string>('nexlog:geo:' + q);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export async function setCachedGeocode(q: string, result: { lat: number; lng: number }): Promise<void> {
  if (!USE_KV) return;
  try {
    await kv.set('nexlog:geo:' + q, JSON.stringify(result), { ex: 60 * 60 * 24 * 30 });
  } catch {}
}
