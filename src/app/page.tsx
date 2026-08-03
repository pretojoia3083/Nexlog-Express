"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';

const API_BASE = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() ? 'https://nexlog-gilt.vercel.app' : '';
const SITE_URL = 'https://nexlog-gilt.vercel.app';

type Page = 'landing' | 'dashboard' | 'roteirizador' | 'calculadora' | 'clientes' | 'historico' | 'pedagios' | 'marketplace' | 'rastreamento' | 'admin' | 'diario';
type MkPage = 'fretes' | 'postar' | 'planos' | 'meus' | 'mkroteirizador';

interface Freight {
  id: string; origem: string; destino: string; tipo: string; peso: string; valor: string;
  coleta: string; entrega: string; contato: string; observacao: string; imagem?: string;
  empresa: string; plano: string; createdAt: string;
}

interface Client {
  id: string;
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  observacoes: string;
}

interface HistoryItem {
  id: string;
  date: string;
  origem: string;
  destino: string;
  km: number;
  valor: number;
  status: string;
}

interface Segment {
  from: string;
  to: string;
  km: number;
  hours: number;
  toll: number;
}

interface RouteResult {
  totalKm: number;
  totalHours: number;
  segments: Segment[];
  geometry: any;
  coords: { lat: number; lng: number }[];
  addresses: string[];
  totalPedagio?: number;
}

interface CalcResult {
  km: number;
  pedagio: number;
  peso: number;
  custoTotal: number;
  custoPorKg: number;
  segments: { from: string; to: string; km: number; toll: number }[];
}

interface BudgetData {
  id: string;
  date: string;
  cliente?: Client;
  origem: string;
  destino: string;
  km: number;
  pedagio: number;
  peso: number;
  valorFrete: number;
  valorTotal: number;
}

interface TollRoute {
  id: string;
  trecho: string;
  pedagio: number;
  observacao: string;
}

interface DiarioEntry {
  id: string; date: string; cliente: string; veiculo: string; valor: number; pago: boolean; despesas: number; hodometro: number; obs: string;
}

interface Abastecimento {
  id: string; date: string; litros: number; valor: number; precoLitro: number; hodometroTotal: number;
}

const VEHICLE_TYPES = ['Carreta', 'Toco', '3/4', 'Van', 'Utilitario'];
const DEFAULT_VALOR_KM = 3.50;
const TOLL_RATE = 0.30;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return m + 'min';
  if (m === 0) return h + 'h';
  return h + 'h ' + m + 'min';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR');
}

function generateBudgetNumber(): string {
  const now = new Date();
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  const r = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return 'ORC-' + d + '-' + r;
}

function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const trimmed = address.trim();
  if (/^-?\d+\.?\d*\s*[,;]\s*-?\d+\.?\d*$/.test(trimmed)) {
    const parts = trimmed.split(/[,;]/);
    return Promise.resolve({ lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) });
  }
  return fetch(API_BASE + '/api/geocode?q=' + encodeURIComponent(trimmed))
    .then(r => r.json())
    .then((data: any) => {
      if (data && typeof data.lat === 'number' && typeof data.lng === 'number') return { lat: data.lat, lng: data.lng };
      return null;
    })
    .catch(() => null);
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function optimizeNearest(coords: { lat: number; lng: number }[]): number[] {
  const n = coords.length;
  if (n <= 2) return coords.map((_, i) => i);
  const visited = new Set<number>([0]);
  const order = [0];
  let current = 0;
  while (visited.size < n) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 1; i < n; i++) {
      if (visited.has(i)) continue;
      const d = haversineKm(coords[current], coords[i]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best < 0) break;
    visited.add(best);
    order.push(best);
    current = best;
  }
  return order;
}

async function getRouteFromGoogle(origin: string, destination: string, waypoints: string[]): Promise<any> {
  try {
    const allCoords: string[] = [];
    for (const addr of [origin, destination, ...waypoints]) {
      const c = await geocodeAddress(addr);
      if (!c) return null;
      allCoords.push(c.lng + ',' + c.lat);
      await new Promise(r => setTimeout(r, 200));
    }
    const [o, d, ...wps] = allCoords;
    const coordsStr = [o, ...wps.filter(Boolean), d].join(';');
    const resp = await fetch('https://router.project-osrm.org/route/v1/driving/' + coordsStr + '?overview=full&geometries=geojson&steps=false');
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    const route = data.routes[0];
    return {
      legs: route.legs.map((leg: any) => ({
        distance: { value: Math.round(leg.distance) },
        duration: { value: Math.round(leg.duration) },
        start_address: '', end_address: '',
      })),
      geometry: { coordinates: route.geometry.coordinates.map((c: number[]) => ({ lat: c[1], lng: c[0] })) },
    };
  } catch { return null; }
}


function AddressInput({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  const [suggestions, setSuggestions] = useState<{ description: string }[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [listening, setListening] = useState(false);
  const timerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const quaggaRef = useRef<any>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => { document.removeEventListener('mousedown', handler); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    if (!showScanner || !scannerRef.current) return;
    let active = true;
    (async () => {
      try {
        const Quagga = await import('@ericblade/quagga2');
        if (!active) return;
        await Quagga.default.init({
          inputStream: { name: 'Live', type: 'LiveStream', target: scannerRef.current, constraints: { width: 640, height: 480, facingMode: 'environment' } },
          decoder: { readers: ['code_128_reader', 'code_39_reader', 'ean_reader', 'ean_8_reader', 'upc_reader', 'i2of5_reader'] },
          locate: true,
        }, (err: any) => { if (!err && active) Quagga.default.start(); });
        quaggaRef.current = Quagga.default;
        Quagga.default.onDetected((data: any) => {
          const code = data.codeResult?.code;
          if (code && active) { onChange(code); setShowScanner(false); Quagga.default.stop(); }
        });
      } catch {}
    })();
    return () => { active = false; if (quaggaRef.current) { try { quaggaRef.current.stop(); } catch {} } };
  }, [showScanner]);

  const startVoice = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) { alert('Reconhecimento de voz nao disponivel neste navegador. Use o APK (Android) para falar o endereco ou digite manualmente.'); return; }
    if (typeof window !== 'undefined' && !(window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
      alert('O reconhecimento de voz precisa de conexao segura (HTTPS). Abra o app pelo link https ou use o APK.'); return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      setListening(true);
      let finalTranscript = '';
      recognition.onresult = (e: any) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalTranscript += t;
          else interim += t;
        }
        if (finalTranscript) onChange(finalTranscript);
        else if (interim) onChange(interim);
      };
      recognition.onerror = (e: any) => {
        setListening(false);
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') alert('Permita o acesso ao microfone para usar o reconhecimento de voz.');
        else if (e?.error === 'no-speech') alert('Nenhum fala detectada. Tente novamente.');
        else if (e?.error !== 'aborted') alert('Erro no reconhecimento de voz: ' + (e?.error || 'desconhecido'));
      };
      recognition.onend = () => { setListening(false); };
      recognition.start();
    } catch (err) {
      setListening(false);
      alert('Nao foi possivel iniciar o microfone: ' + (err as any)?.message || 'erro desconhecido');
    }
  };

  const getNum = (v: string) => { const m = v.match(/(\d+)/); return m ? m[1] : ''; };
  const getCity = (v: string) => {
    const parts = v.split(' - ');
    if (parts.length > 1) {
      const last = parts[parts.length - 1].trim();
      if (last.length > 2 && !/\d/.test(last)) return last;
    }
    return '';
  };

  const handleInput = (val: string) => {
    onChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length < 3) { setSuggestions([]); setShowDrop(false); return; }
    const cityHint = getCity(val);
    timerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(API_BASE + '/api/autocomplete?q=' + encodeURIComponent(val) + (cityHint ? '&city=' + encodeURIComponent(cityHint) : ''));
        const data = await resp.json();
        if (data.length > 0) { setSuggestions(data); setShowDrop(true); }
        else { setSuggestions([]); setShowDrop(false); }
      } catch { setSuggestions([]); setShowDrop(false); }
    }, 350);
  };

  const handleSelect = (desc: string) => {
    const num = getNum(value);
    if (num && !desc.includes(num)) {
      const parts = desc.split(' - ');
      onChange(parts[0] + ', ' + num + (parts.length > 1 ? ' - ' + parts.slice(1).join(' - ') : ''));
    } else { onChange(desc); }
    setShowDrop(false); setSuggestions([]);
  };

  const numBadge = getNum(value);
  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input value={value} onChange={(e) => handleInput(e.target.value)} placeholder={placeholder}
          style={{ ...style, width: '100%', fontSize: 16 }} />
        <button type="button" onClick={startVoice} title="Falar endereco"
          style={{ padding: '8px', borderRadius: 8, border: '1px solid #E2E8F0', background: listening ? 'rgba(217,130,43,0.2)' : 'transparent', color: listening ? '#D9822B' : '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
        <button type="button" onClick={() => setShowScanner(true)} title="Ler codigo de barras"
          style={{ padding: '8px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'transparent', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <line x1="7" y1="9" x2="7" y2="15"/><line x1="10" y1="9" x2="10" y2="15"/>
            <line x1="13" y1="9" x2="13" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/>
            <line x1="20" y1="9" x2="20" y2="15"/>
          </svg>
        </button>
      </div>
      {showScanner && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ color: '#1E293B', fontSize: 14, marginBottom: 16, fontWeight: 600 }}>Aproxime o codigo de barras da camera</div>
          <div ref={scannerRef} style={{ width: '100%', maxWidth: 500, aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }} />
          <button onClick={() => { setShowScanner(false); if (quaggaRef.current) { try { quaggaRef.current.stop(); } catch {} } }}
            style={{ marginTop: 20, padding: '12px 32px', borderRadius: 8, border: 'none', background: '#DE6A6A', color: '#FFF', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>Cancelar</button>
        </div>
      )}
      {showDrop && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, marginTop: 4, zIndex: 100, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {suggestions.map((s, i) => (
            <div key={i} onClick={() => handleSelect(s.description)}
              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 14, color: '#1E293B', borderBottom: i < suggestions.length - 1 ? '1px solid #E2E8F0' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(122,91,209,0.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <span><Icon name="map-pin" size={12} color="#7A5BD1" /> {s.description}</span>
              {numBadge && <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'linear-gradient(135deg,#D9822B,#C9A24E)', color: '#FFF', fontWeight: 700, whiteSpace: 'nowrap' }}>nº {numBadge}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ICON_PATHS: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  'map-pin': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  gps: '<path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 6a6 6 0 0 1 6 6"/><path d="M12 10a2 2 0 0 1 2 2"/><circle cx="12" cy="12" r="1"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  admin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
};

function Icon({ name, size = 20, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || '' }} style={{ flexShrink: 0 }} />
  );
}

function TruckSVG({ size = 22, color = '#9A7BEA' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function FaqItem({ faq }: { faq: { q: string; a: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' as const }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{faq.q}</span>
        <span style={{ fontSize: 18, color: '#64748B', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && <div style={{ padding: '0 20px 16px', fontSize: 14, color: '#64748B', lineHeight: 1.7 }}>{faq.a}</div>}
    </div>
  );
}

function NexLogLogo({ sidebar = false, mobile = false }: { sidebar?: boolean; mobile?: boolean }) {
  const w = mobile ? 260 : sidebar ? 280 : 360;
  return (
    <img src="/logo.svg" alt="NEXLOG" style={{ width: w, maxWidth: '100%', height: 'auto', objectFit: 'contain', display: 'block', background: '#FFFFFF', borderRadius: 8, padding: mobile ? '8px 16px' : sidebar ? '12px 20px' : '16px 28px' }} />
  );
}

export default function NexLogExpress() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [addresses, setAddresses] = useState<string[]>(['', '']);
  const [addressTypes, setAddressTypes] = useState<('entrega' | 'coleta')[]>(['entrega', 'entrega']);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeParadas, setRouteParadas] = useState<{ nota: string; tipo: 'entrega' | 'coleta' }[]>([]);
  const [rotaAtiva, setRotaAtiva] = useState(false);
  const [paradaAtual, setParadaAtual] = useState(1);
  const [statusParadas, setStatusParadas] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number }[]>([]);

  const [calcAddresses, setCalcAddresses] = useState<string[]>(['', '']);
  const [calcPeso, setCalcPeso] = useState('');
  const [calcVeiculo, setCalcVeiculo] = useState('Carreta');
  const [calcValorKm, setCalcValorKm] = useState(DEFAULT_VALOR_KM.toString());
  const [calcPedagio, setCalcPedagio] = useState('');
  const [calcPontoPartida, setCalcPontoPartida] = useState('');
  const [calcResult, setCalcResult] = useState<(CalcResult & { segments: { from: string; to: string; km: number; toll: number }[] }) | null>(null);
  const [isCalcCalculating, setIsCalcCalculating] = useState(false);

  const [trackingAtivo, setTrackingAtivo] = useState(false);
  const [trackingPos, setTrackingPos] = useState<{ lat: number; lng: number } | null>(null);
  const [trackingHistory, setTrackingHistory] = useState<{ lat: number; lng: number; ts: number }[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const trackingRouteRef = useRef<string>('');
  const trackingAtivoRef = useRef(false);
  const wakeLockRef = useRef<any>(null);
  const trackingHistoryRef = useRef<{ lat: number; lng: number; ts: number }[]>([]);
  const trackSyncRef = useRef<any>(null);
  const bgGeoRef = useRef<any>(null);

  useEffect(() => {
    if (!trackingAtivo) return;
    trackingHistoryRef.current = trackingHistory;
  }, [trackingHistory]);

  useEffect(() => {
    if (!trackingAtivo) return;
    const handleVisibility = () => {
      if (document.hidden && trackingHistoryRef.current.length > 0) {
        localStorage.setItem('nexlog_tracking_ativo', JSON.stringify({
          nome: trackingRouteRef.current,
          pontos: trackingHistoryRef.current,
          data: new Date().toISOString(),
        }));
      } else if (!document.hidden && trackingAtivoRef.current) {
        (async () => {
          try {
            if (!wakeLockRef.current) {
              const wakeLock = await (navigator as any).wakeLock?.request('screen');
              if (wakeLock) {
                wakeLockRef.current = wakeLock;
                wakeLock.addEventListener('release', () => {
                  if (trackingAtivoRef.current) {
                    (async () => {
                      try {
                        const wl = await (navigator as any).wakeLock?.request('screen');
                        if (wl) { wakeLockRef.current = wl; }
                      } catch {}
                    })();
                  }
                });
              }
            }
            if (watchIdRef.current === null) {
              watchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                  const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                  setTrackingPos(p);
                  setTrackingHistory(prev => [...prev, { ...p, ts: Date.now() }]);
                },
                (err) => { console.error('Erro GPS:', err.message); },
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
              );
            }
          } catch {}
        })();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [trackingAtivo]);

  const [clients, setClients] = useState<Client[]>([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientForm, setClientForm] = useState({ nome: '', cnpj: '', telefone: '', email: '', endereco: '', observacoes: '' });

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historySearch, setHistorySearch] = useState('');

  const [tollRoutes, setTollRoutes] = useState<TollRoute[]>([]);
  const [showTollModal, setShowTollModal] = useState(false);
  const [editingToll, setEditingToll] = useState<TollRoute | null>(null);
  const [tollForm, setTollForm] = useState({ trecho: '', pedagio: '', observacao: '' });

  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [whatsAppSending, setWhatsAppSending] = useState(false);
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);

  const [pontoPartida, setPontoPartida] = useState('');
  const [tempoEntregaPadrao, setTempoEntregaPadrao] = useState(15);
  const [tempoColetaPadrao, setTempoColetaPadrao] = useState(30);

  const [session, setSession] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', senha: '', nome: '', telefone: '', cnpj: '' });
  const [authError, setAuthError] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPwInput, setAdminPwInput] = useState('');
  const [adminPwError, setAdminPwError] = useState('');
  const [mkPage, setMkPage] = useState<MkPage>('fretes');
  const [fretes, setFretes] = useState<Freight[]>([]);
  const [freightForm, setFreightForm] = useState({ origem: '', destino: '', tipo: 'Carga Seca', peso: '', valor: '', coleta: '', entrega: '', contato: '', observacao: '' });
  const [freightImage, setFreightImage] = useState<string>('');
  const [mkPlan, setMkPlan] = useState<'gratis' | 'profissional' | 'premium'>('gratis');
  const [userPlan, setUserPlan] = useState<'gratis' | 'profissional' | 'premium'>('gratis');
  const [freightSearch, setFreightSearch] = useState('');
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<string | null>(null);
  const [ocrLines, setOcrLines] = useState<string[]>([]);
  const [ocrSelectedOrigin, setOcrSelectedOrigin] = useState<number>(-1);
  const [ocrSelectedDest, setOcrSelectedDest] = useState<number>(-1);
  const [trackSessionId, setTrackSessionId] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [diarioHoje, setDiarioHoje] = useState<DiarioEntry[]>([]);
  const [diarioData, setDiarioData] = useState(new Date().toISOString().slice(0, 10));
  const [diarioForm, setDiarioForm] = useState({ cliente: '', veiculo: 'Carreta', valor: '', pago: true, despesas: '', hodometro: '', obs: '' });
  const [diarioKmGPS, setDiarioKmGPS] = useState(0);
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([]);
  const [abastForm, setAbastForm] = useState({ litros: '', valor: '', precoLitro: '', hodometroTotal: '' });
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<any>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2500);
  };
  const [adminSessions, setAdminSessions] = useState<any[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [onlineDrivers, setOnlineDrivers] = useState<any[]>([]);
  const [savedRotas, setSavedRotas] = useState<any[]>([]);
  const [trackingViewerId, setTrackingViewerId] = useState('');
  const [trackingViewerData, setTrackingViewerData] = useState<any>(null);
  const trackingViewerRef = useRef<HTMLDivElement>(null);
  const trackingViewerMapRef = useRef<any>(null);
  const deferredPromptRef = useRef<any>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const polylineLayerRef = useRef<any>(null);
  const trackingMapRef = useRef<HTMLDivElement>(null);
  const trackingMapInstanceRef = useRef<any>(null);
  const trackingPolylineRef = useRef<any>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    try {
      const sc = localStorage.getItem('nexlog_clients');
      const sh = localStorage.getItem('nexlog_history');
      if (sc) setClients(JSON.parse(sc));
      if (sh) setHistory(JSON.parse(sh));
      const sr = localStorage.getItem('nexlog_rotas');
      if (sr) setSavedRotas(JSON.parse(sr));
    } catch {}
  }, []);

  useEffect(() => { localStorage.setItem('nexlog_clients', JSON.stringify(clients)); }, [clients]);
  useEffect(() => { localStorage.setItem('nexlog_history', JSON.stringify(history)); }, [history]);

  useEffect(() => {
    try {
      const st = localStorage.getItem('nexlog_tolls');
      if (st) setTollRoutes(JSON.parse(st));
    } catch {}
  }, []);
  useEffect(() => { localStorage.setItem('nexlog_tolls', JSON.stringify(tollRoutes)); }, [tollRoutes]);

  useEffect(() => {
    const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
      try {
        const resp = await fetch(API_BASE + '/api/reverse?lat=' + lat + '&lon=' + lng);
        if (!resp.ok) return null;
        const data = await resp.json();
        return typeof data?.address === 'string' && data.address ? data.address : null;
      } catch { return null; }
    };
    const doAutoDetect = async (setter: (v: string) => void) => {
      if (!('geolocation' in navigator)) return;
      navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const address = await reverseGeocode(lat, lng);
        setter(address || lat.toFixed(6) + ', ' + lng.toFixed(6));
      }, () => {});
    };
    if (currentPage === 'roteirizador' && !pontoPartida) doAutoDetect(setPontoPartida);
    if (currentPage === 'calculadora' && !calcPontoPartida) doAutoDetect(setCalcPontoPartida);
  }, [currentPage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('nexlog_session');
    if (stored) {
      try {
        const s = JSON.parse(stored);
        setSession(s);
        setUserPlan(s.plano || 'gratis');
        setCurrentPage('dashboard');
      } catch {}
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setShowInstallBanner(false);
    } else {
      const handler = (e: Event) => { e.preventDefault(); deferredPromptRef.current = e; setShowInstallBanner(true); };
      window.addEventListener('beforeinstallprompt', handler);
      window.addEventListener('appinstalled', () => { setShowInstallBanner(false); });
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const users = JSON.parse(localStorage.getItem('nexlog_users') || '[]');
    if (!users.find((u: any) => u.email === 'nexlogexpress@gmail.com')) {
      const admin = { nome: 'Admin NexLog', email: 'nexlogexpress@gmail.com', senha: 'Michelle82@#', telefone: '', cnpj: '', id: 'admin_' + Date.now().toString(), plano: 'profissional', createdAt: new Date().toISOString() };
      users.push(admin);
      localStorage.setItem('nexlog_users', JSON.stringify(users));
      fetch(API_BASE + '/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: admin }) }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get('rastreio');
    if (trackId) {
      setTrackingViewerId(trackId);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ts = document.createElement('style');
    ts.textContent = '.dark-tooltip{background:#FFFFFF!important;color:#1E293B!important;border:1px solid #E2E8F0!important;border-radius:8px!important;padding:6px 10px!important;font-size:12px!important;font-family:inherit!important;box-shadow:0 4px 12px rgba(0,0,0,0.4)!important}.dark-tooltip::before{border-top-color:#E2E8F0!important}';
    document.head.appendChild(ts);
    const style = document.createElement('style');
    style.textContent = '@media print{body>*{display:none!important}.budget-print{display:block!important;position:fixed;top:0;left:0;right:0;background:white!important;padding:40px!important;z-index:999999;box-sizing:border-box;width:100%}.budget-print *{color:#111!important;border-color:#ddd!important;background:transparent!important}}';
    document.head.appendChild(style);
    return () => { if (ts.parentNode) ts.parentNode.removeChild(ts); if (style.parentNode) style.parentNode.removeChild(style); };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentPage !== 'roteirizador') {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      return;
    }
    if (!mapRef.current || mapInstanceRef.current) return;
    try {
      const L = require('leaflet');
      const map = L.map(mapRef.current, { center: [-15.78, -47.93], zoom: 5, zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      mapInstanceRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
      polylineLayerRef.current = L.layerGroup().addTo(map);
    } catch {}
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [currentPage]);

  useEffect(() => {
    if (currentPage === 'roteirizador' && mapInstanceRef.current) {
      const t = setTimeout(() => { if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize(); }, 150);
      return () => clearTimeout(t);
    }
  }, [currentPage]);

  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    if (geocodedCoords.length === 0) return;
    try {
      const L = require('leaflet');
      markersLayerRef.current.clearLayers();
      const bounds = L.latLngBounds();
      geocodedCoords.forEach((coord, i) => {
        const label = i === 0 ? 'P' : String(i);
        const tipo = i > 0 ? (addressTypes[i - 1] || 'entrega') : null;
        const bg = i === 0 ? '#D9822B' : (tipo === 'coleta' ? '#9A7BEA' : '#2FA77E');
        const icon = L.divIcon({
          className: '',
          html: '<div style="width:34px;height:34px;border-radius:50%;background:' + bg + ';display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;border:3px solid ' + (i === 0 ? '#9C6B3A' : tipo === 'coleta' ? '#5F3F8E' : '#1F7A5E') + ';box-shadow:0 2px 10px rgba(0,0,0,0.3);font-family:system-ui">' + label + '</div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const marker = L.marker([coord.lat, coord.lng], { icon });
        marker.bindTooltip((i === 0 ? 'Partida: ' : 'Parada ' + i + ': ') + (allAddresses[i] || ('Ponto ' + label)), { className: 'dark-tooltip' });
        markersLayerRef.current.addLayer(marker);
        bounds.extend([coord.lat, coord.lng]);
      });
      if (geocodedCoords.length === 1) {
        mapInstanceRef.current.setView([geocodedCoords[0].lat, geocodedCoords[0].lng], 14);
      } else {
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch {}
  }, [geocodedCoords, addressTypes]);

  useEffect(() => {
    if (!mapInstanceRef.current || !polylineLayerRef.current) return;
    if (!routeResult || !routeResult.coords || routeResult.coords.length < 2) return;
    try {
      const L = require('leaflet');
      polylineLayerRef.current.clearLayers();
      const latlngs = routeResult.coords.map((c: { lat: number; lng: number }) => [c.lat, c.lng]);
      L.polyline(latlngs, { color: '#D9822B', weight: 4, opacity: 0.9 }).addTo(polylineLayerRef.current);
    } catch {}
  }, [routeResult]);

  useEffect(() => {
    if (typeof window === 'undefined' || !trackingMapRef.current || trackingMapInstanceRef.current) return;
    if (currentPage !== 'rastreamento') return;
    try {
      const L = require('leaflet');
      const map = L.map(trackingMapRef.current, { center: [-15.78, -47.93], zoom: 5, zoomControl: false, attributionControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      trackingMapInstanceRef.current = map;
      trackingPolylineRef.current = L.layerGroup().addTo(map);
    } catch {}
    return () => { if (trackingMapInstanceRef.current) { trackingMapInstanceRef.current.remove(); trackingMapInstanceRef.current = null; } };
  }, [currentPage]);

  useEffect(() => {
    if (!trackingMapInstanceRef.current || !trackingPos) return;
    try {
      const L = require('leaflet');
      trackingMapInstanceRef.current.setView([trackingPos.lat, trackingPos.lng], 15);
      if (trackingMapInstanceRef.current._marker) {
        trackingMapInstanceRef.current._marker.setLatLng([trackingPos.lat, trackingPos.lng]);
      } else {
        const marker = L.circleMarker([trackingPos.lat, trackingPos.lng], {
          radius: 10, fillColor: '#4285F4', color: '#FFF', weight: 3, fillOpacity: 1,
        }).addTo(trackingMapInstanceRef.current);
        trackingMapInstanceRef.current._marker = marker;
      }
    } catch {}
  }, [trackingPos]);

  useEffect(() => {
    if (!trackingMapInstanceRef.current || !trackingPolylineRef.current || trackingHistory.length < 2) return;
    try {
      const L = require('leaflet');
      trackingPolylineRef.current.clearLayers();
      const latlngs = trackingHistory.map(p => [p.lat, p.lng]);
      L.polyline(latlngs, { color: '#4285F4', weight: 3, opacity: 0.7 }).addTo(trackingPolylineRef.current);
    } catch {}
  }, [trackingHistory]);

  useEffect(() => {
    if (currentPage !== 'dashboard') return;
    const fetchDrivers = async () => {
      try {
        const resp = await fetch(API_BASE + '/api/track/sessions');
        const remote = resp.ok ? await resp.json() : [];
        const combined = [...remote];
        if (trackingAtivo && trackSessionId && trackingHistoryRef.current.length > 0) {
          const selfIdx = combined.findIndex((s: any) => s.id === trackSessionId);
          if (selfIdx >= 0) {
            combined[selfIdx] = { ...combined[selfIdx], nome: trackingRouteRef.current || 'Voce', userName: session?.nome || 'Voce' };
          } else {
            combined.unshift({ id: trackSessionId, nome: trackingRouteRef.current || 'Voce', userName: session?.nome || 'Voce', userEmail: session?.email || '', pontos: trackingHistoryRef.current, ultimaPosicao: trackingHistoryRef.current[trackingHistoryRef.current.length - 1] || null });
          }
        }
        setOnlineDrivers(combined);
      } catch {}
    };
    fetchDrivers();
    const interval = setInterval(fetchDrivers, 10000);
    return () => clearInterval(interval);
  }, [currentPage, trackingAtivo, trackSessionId, session]);

  useEffect(() => {
    if (currentPage !== 'admin') return;
    setAdminLoading(true);
    const fetchSessions = async () => {
      try {
        const resp = await fetch(API_BASE + '/api/track/sessions');
        const data = await resp.json();
        setAdminSessions(data);
      } catch {}
      setAdminLoading(false);
    };
    const fetchUsers = async () => {
      try {
        const resp = await fetch(API_BASE + '/api/users');
        const data = await resp.json();
        if (Array.isArray(data)) setAdminUsers(data);
      } catch {}
    };
    fetchSessions();
    fetchUsers();
    const interval = setInterval(() => { fetchSessions(); fetchUsers(); }, 15000);
    return () => clearInterval(interval);
  }, [currentPage]);

  useEffect(() => {
    if (!trackingViewerId) return;
    const fetchData = async () => {
      try {
        const resp = await fetch(API_BASE + '/api/track/' + trackingViewerId);
        if (resp.ok) {
          const data = await resp.json();
          setTrackingViewerData(data);
        }
      } catch {}
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [trackingViewerId]);

  useEffect(() => {
    if (!trackingViewerId || !trackingViewerData?.ultimaPosicao || !trackingViewerRef.current) return;
    if (!trackingViewerMapRef.current) {
      try {
        const L = require('leaflet');
        const map = L.map(trackingViewerRef.current, { center: [trackingViewerData.ultimaPosicao.lat, trackingViewerData.ultimaPosicao.lng], zoom: 15, zoomControl: true, attributionControl: false });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
        trackingViewerMapRef.current = map;
      } catch {}
    } else if (trackingViewerData.ultimaPosicao) {
      try {
        const L = require('leaflet');
        const pos = trackingViewerData.ultimaPosicao;
        trackingViewerMapRef.current.setView([pos.lat, pos.lng], 15);
        if (trackingViewerMapRef.current._marker) {
          trackingViewerMapRef.current._marker.setLatLng([pos.lat, pos.lng]);
        } else {
          const marker = L.circleMarker([pos.lat, pos.lng], { radius: 10, fillColor: '#DE6A6A', color: '#FFF', weight: 3, fillOpacity: 1 }).addTo(trackingViewerMapRef.current);
          trackingViewerMapRef.current._marker = marker;
        }
        if (trackingViewerData.pontos?.length > 1) {
          if (trackingViewerMapRef.current._polyline) trackingViewerMapRef.current._polyline.setLatLngs(trackingViewerData.pontos.map((p: any) => [p.lat, p.lng]));
          else {
            const pl = L.polyline(trackingViewerData.pontos.map((p: any) => [p.lat, p.lng]), { color: '#DE6A6A', weight: 3, opacity: 0.6 }).addTo(trackingViewerMapRef.current);
            trackingViewerMapRef.current._polyline = pl;
          }
        }
      } catch {}
    }
    return () => { if (trackingViewerMapRef.current && !trackingViewerId) { trackingViewerMapRef.current.remove(); trackingViewerMapRef.current = null; } };
  }, [trackingViewerData, trackingViewerId]);

  const navItems = [
    { id: 'dashboard' as Page, label: 'Dashboard', icon: 'grid' },
    { id: 'roteirizador' as Page, label: 'Roteirizador', icon: 'map-pin' },
    { id: 'rastreamento' as Page, label: 'Rastreamento', icon: 'target' },
    { id: 'calculadora' as Page, label: 'Calculadora de Frete', icon: 'calculator' },
    { id: 'pedagios' as Page, label: 'Pedagios', icon: 'route' },
    { id: 'clientes' as Page, label: 'Clientes', icon: 'users' },
    { id: 'historico' as Page, label: 'Historico', icon: 'clock' },
    { id: 'diario' as Page, label: 'Diario', icon: 'save' },
    ...(session?.email === 'nexlogexpress@gmail.com' || adminUnlocked ? [{ id: 'admin' as Page, label: 'Admin', icon: 'admin' }] : []),
  ];

  const goMarketplace = () => {
    const stored = localStorage.getItem('nexlog_session');
    if (!stored) { setShowAuthModal(true); return; }
    const s = JSON.parse(stored);
    setSession(s);
    setUserPlan(s.plano || 'gratis');
    setCurrentPage('marketplace');
    setSidebarOpen(false);
  };

  const handleLogout = () => { localStorage.removeItem('nexlog_session'); setSession(null); setCurrentPage('landing'); };

  const handleInstallApp = async () => {
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      const result = await deferredPromptRef.current.userChoice;
      if (result.outcome === 'accepted') setShowInstallBanner(false);
      deferredPromptRef.current = null;
    }
  };

  const handleAuth = async () => {
    setAuthError('');
    if (authTab === 'register') {
      if (!authForm.nome || !authForm.email || !authForm.senha) { setAuthError('Preencha nome, email e senha'); return; }
      const users = JSON.parse(localStorage.getItem('nexlog_users') || '[]');
      if (users.find((u: any) => u.email === authForm.email)) { setAuthError('Email ja cadastrado'); return; }
      const newUser = { ...authForm, id: Date.now().toString(), plano: 'gratis' as const, createdAt: new Date().toISOString() };
      users.push(newUser);
      localStorage.setItem('nexlog_users', JSON.stringify(users));
      fetch(API_BASE + '/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: newUser }) }).catch(() => {});
      setSession(newUser);
      setUserPlan('gratis');
      localStorage.setItem('nexlog_session', JSON.stringify(newUser));
      setShowAuthModal(false);
      setCurrentPage('marketplace');
    } else {
      if (!authForm.email || !authForm.senha) { setAuthError('Preencha email e senha'); return; }
      const users = JSON.parse(localStorage.getItem('nexlog_users') || '[]');
      const found = users.find((u: any) => u.email === authForm.email && u.senha === authForm.senha);
      if (!found) { setAuthError('Email ou senha incorretos'); return; }
      setSession(found);
      setUserPlan(found.plano || 'gratis');
      localStorage.setItem('nexlog_session', JSON.stringify(found));
      fetch(API_BASE + '/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: found }) }).catch(() => {});
      setShowAuthModal(false);
      setCurrentPage('marketplace');
    }
  };

  const postFreight = () => {
    if (!freightForm.origem || !freightForm.destino || !freightForm.valor) return;
    const newF: Freight = { ...freightForm, id: Date.now().toString(), imagem: freightImage, empresa: session?.nome || 'Anonimo', plano: session?.plano || 'gratis', createdAt: new Date().toISOString() };
    const all = JSON.parse(localStorage.getItem('nexlog_fretes') || '[]');
    all.unshift(newF);
    localStorage.setItem('nexlog_fretes', JSON.stringify(all));
    setFreightForm({ origem: '', destino: '', tipo: 'Carga Seca', peso: '', valor: '', coleta: '', entrega: '', contato: '', observacao: '' });
    setFreightImage('');
    setMkPage('fretes');
  };

  const deleteFreight = (id: string) => {
    const all = JSON.parse(localStorage.getItem('nexlog_fretes') || '[]').filter((f: Freight) => f.id !== id);
    localStorage.setItem('nexlog_fretes', JSON.stringify(all));
    setFretes(all);
  };

  const selectPlan = (p: 'gratis' | 'profissional' | 'premium') => { setMkPlan(p); };

  const [ocrProgress, setOcrProgress] = useState('');

  const handleOcrImage = async (file: File) => {
    setOcrProcessing(true);
    setOcrResult(null);
    setOcrProgress('Carregando imagem...');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imgData = e.target?.result as string;
      setOcrImage(imgData);
      try {
        setOcrProgress('Inicializando OCR...');
        const Tesseract = await import('tesseract.js');
        setOcrProgress('Reconhecendo texto...');
        const { data } = await Tesseract.recognize(imgData, 'por', {
          logger: (m: any) => {
            if (m.status === 'recognizing text') setOcrProgress('Reconhecendo: ' + (m.progress ? Math.round(m.progress * 100) + '%' : ''));
            else if (m.status === 'loading tesseract core') setOcrProgress('Carregando motor OCR...');
            else if (m.status === 'initializing tesseract') setOcrProgress('Inicializando...');
            else if (m.status === 'loading language traineddata') setOcrProgress('Baixando dados portugues...');
            else if (m.status === 'initializing api') setOcrProgress('Preparando...');
          }
        });
        setOcrProgress('');
        setOcrResult(data.text);
        const linhas = data.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 2);
        setOcrLines(linhas);
        setOcrSelectedOrigin(-1);
        setOcrSelectedDest(-1);

        const linesLower = linhas.map((l: string) => l.toLowerCase());
        const labelsOrigem: number[] = [];
        const labelsDestino: number[] = [];

        for (let i = 0; i < linesLower.length; i++) {
          if (/(remetente|origem|expedidor|emitente|shipper|coleta|coletar)/i.test(linesLower[i])) labelsOrigem.push(i);
          if (/(destinatario|destino|recebedor|consignee|tomador|entrega|entregar)/i.test(linesLower[i])) labelsDestino.push(i);
        }

        let originIdx = -1, destIdx = -1;
        for (const idx of labelsOrigem) {
          if (idx + 1 < linhas.length) { originIdx = idx + 1; break; }
        }
        for (const idx of labelsDestino) {
          if (idx + 1 < linhas.length) { destIdx = idx + 1; break; }
        }

        if (originIdx < 0 || destIdx < 0) {
          const enderecos = linhas.map((l: string, i: number) => ({ i, l }))
            .filter(({ l }) => /^(rua|av|avenida|rod|rodovia|estrada|travessa|alameda|praça|pracoa|st|r\.)/i.test(l) || /\d{5}-?\d{3}/.test(l) || (l.includes(',') && l.length > 10));
          if (originIdx < 0 && enderecos.length > 0) originIdx = enderecos[0].i;
          if (destIdx < 0 && enderecos.length > 1) destIdx = enderecos[1].i;
        }

        if (originIdx >= 0) setOcrSelectedOrigin(originIdx);
        if (destIdx >= 0) setOcrSelectedDest(destIdx);
      } catch (err) { setOcrResult('Erro ao processar imagem'); }
      setOcrProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const confirmOcrSelection = () => {
    if (ocrSelectedOrigin < 0 || ocrSelectedDest < 0 || !ocrLines.length) { alert('Selecione a origem e o destino'); return; }
    setPontoPartida(ocrLines[ocrSelectedOrigin]);
    setAddresses([ocrLines[ocrSelectedDest]]);
    setAddressTypes(['entrega']);
    setShowOcrModal(false);
    setOcrImage(null);
    setOcrResult(null);
    setOcrLines([]);
    setOcrSelectedOrigin(-1);
    setOcrSelectedDest(-1);
    setCurrentPage('roteirizador');
  };

  const confirmPlan = () => {
    if (!session) return;
    const updated = { ...session, plano: mkPlan };
    const users = JSON.parse(localStorage.getItem('nexlog_users') || '[]').map((u: any) => u.id === session.id ? updated : u);
    localStorage.setItem('nexlog_users', JSON.stringify(users));
    localStorage.setItem('nexlog_session', JSON.stringify(updated));
    setSession(updated);
    setUserPlan(mkPlan);
  };

  const getGoogleMapsUrl = (route: RouteResult, origin: string, mode?: string) => {
    const pts = [origin, ...route.addresses].filter(Boolean);
    if (pts.length < 2) return 'https://www.google.com/maps';
    const base = 'https://www.google.com/maps/dir/?api=1';
    const originParam = '&origin=' + encodeURIComponent(pts[0]);
    const destParam = '&destination=' + encodeURIComponent(pts[pts.length - 1]);
    const waypoints = pts.slice(1, -1).map(p => encodeURIComponent(p)).join('|');
    const wpParam = waypoints ? '&waypoints=' + waypoints : '';
    const modeParam = mode ? '&travelmode=' + mode : '&travelmode=driving';
    return base + originParam + destParam + wpParam + modeParam + '&dir_action=navigate';
  };

  const getMapsNavigateUrl = (dest: string) => {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) + '&travelmode=driving&dir_action=navigate';
  };

  const getWazeNavigateUrl = (dest: string) => {
    return 'https://waze.com/ul?q=' + encodeURIComponent(dest) + '&navigate=yes';
  };

  const allAddresses = useMemo(() => [pontoPartida, ...addresses].filter(Boolean), [pontoPartida, addresses]);

  const addAddress = () => { setAddresses([...addresses, '']); setAddressTypes([...addressTypes, 'entrega']); };
  const removeAddress = (index: number) => { if (addresses.length > 2) { setAddresses(addresses.filter((_, i) => i !== index)); setAddressTypes(addressTypes.filter((_, i) => i !== index)); } };
  const updateAddress = (index: number, value: string) => { const next = [...addresses]; next[index] = value; setAddresses(next); };
  const updateAddressType = (index: number, type: 'entrega' | 'coleta') => { const next = [...addressTypes]; next[index] = type; setAddressTypes(next); };
  const moveAddress = (from: number, to: number) => {
    if (to < 0 || to >= addresses.length) return;
    const next = [...addresses];
    const item = next.splice(from, 1)[0];
    next.splice(to, 0, item);
    setAddresses(next);
  };

  useEffect(() => {
    const allPts = [pontoPartida, ...addresses].filter(Boolean);
    if (allPts.length === 0) return;
    const timer = setTimeout(async () => {
      const coords: { lat: number; lng: number }[] = [];
      for (const addr of allPts) {
        const c = await geocodeAddress(addr);
        if (c) coords.push(c);
      }
      if (coords.length > 0) setGeocodedCoords(coords);
    }, 600);
    return () => clearTimeout(timer);
  }, [pontoPartida, addresses]);

  const calculateRoute = async () => {
    if (!pontoPartida.trim()) { alert('Informe o ponto de partida'); return; }
    const valid = addresses.filter(a => a.trim());
    if (valid.length < 1) { alert('Adicione pelo menos 1 destino'); return; }
    setIsCalculating(true);
    setRouteResult(null);
    try {
      const allPts = [pontoPartida.trim(), ...valid];
      const coords: { lat: number; lng: number }[] = [];
      const failed: string[] = [];
      for (let i = 0; i < allPts.length; i++) {
        const c = await geocodeAddress(allPts[i]);
        if (!c) { failed.push(allPts[i]); continue; }
        coords.push(c);
        if (i < allPts.length - 1) await new Promise(r => setTimeout(r, 200));
      }
      if (failed.length > 0) {
        alert('Nao foi possivel encontrar: ' + failed.join(', '));
        setIsCalculating(false);
        return;
      }
      const order = optimizeNearest(coords);
      const orderedPts = order.map(i => allPts[i]);
      const orderedCoords = order.map(i => coords[i]);
      setGeocodedCoords(orderedCoords);
      setAddresses(orderedPts.slice(1));
      setAddressTypes(orderedPts.slice(1).map((_, idx) => addressTypes[order[idx + 1] - 1] || 'entrega'));
      const waypoints = orderedPts.slice(1, -1);
      const routeForward = await getRouteFromGoogle(orderedPts[0], orderedPts[orderedPts.length - 1], waypoints);
      if (!routeForward) { alert('Nao foi possivel calcular a rota'); setIsCalculating(false); return; }
      const routeReturn = await getRouteFromGoogle(orderedPts[orderedPts.length - 1], orderedPts[0], []);
      const totalKm = orderedPts.length > 2
        ? routeForward.legs.reduce((s: number, l: any) => s + l.distance.value, 0) / 1000 + (routeReturn ? routeReturn.legs[0].distance.value / 1000 : 0)
        : routeForward.legs.reduce((s: number, l: any) => s + l.distance.value, 0) / 1000;
      const totalHours = orderedPts.length > 2
        ? routeForward.legs.reduce((s: number, l: any) => s + l.duration.value, 0) / 3600 + (routeReturn ? routeReturn.legs[0].duration.value / 3600 : 0)
        : routeForward.legs.reduce((s: number, l: any) => s + l.duration.value, 0) / 3600;
      const segments: Segment[] = [];
      for (let i = 0; i < routeForward.legs.length; i++) {
        const leg = routeForward.legs[i];
        segments.push({ from: orderedPts[i], to: orderedPts[i + 1], km: leg.distance.value / 1000, hours: leg.duration.value / 3600, toll: 0 });
      }
      if (routeReturn) {
        segments.push({ from: orderedPts[orderedPts.length - 1], to: orderedPts[0], km: routeReturn.legs[0].distance.value / 1000, hours: routeReturn.legs[0].duration.value / 3600, toll: 0 });
      }
      setRouteResult({ totalKm, totalHours, segments, geometry: orderedCoords, coords: orderedCoords, addresses: orderedPts, totalPedagio: 0 });
      setRouteParadas(orderedPts.map((_, idx) => {
        const tipo = idx > 0 ? (addressTypes[order[idx] - 1] || 'entrega') : 'entrega';
        return { nota: '', tipo: tipo as 'entrega' | 'coleta' };
      }));
      setRotaAtiva(false);
      setParadaAtual(1);
      setStatusParadas(orderedPts.slice(1).map(() => 'pendente'));
    } catch { alert('Erro ao calcular rota'); }
    setIsCalculating(false);
  };

  const reoptimizeRoute = async () => {
    if (!routeResult || !pontoPartida.trim()) return;
    setIsCalculating(true);
    try {
      const coords: { lat: number; lng: number }[] = [];
      const allPts = [pontoPartida.trim(), ...routeResult.addresses.slice(1)];
      const failed: string[] = [];
      for (let i = 0; i < allPts.length; i++) {
        const c = await geocodeAddress(allPts[i]);
        if (!c) { failed.push(allPts[i]); continue; }
        coords.push(c);
        if (i < allPts.length - 1) await new Promise(r => setTimeout(r, 200));
      }
      if (failed.length > 0) { alert('Nao foi possivel encontrar: ' + failed.join(', ')); setIsCalculating(false); return; }
      const order = optimizeNearest(coords);
      const orderedPts = order.map(i => allPts[i]);
      const orderedCoords = order.map(i => coords[i]);
      setGeocodedCoords(orderedCoords);
      setAddresses(orderedPts.slice(1));
      const routeForward = await getRouteFromGoogle(orderedPts[0], orderedPts[orderedPts.length - 1], orderedPts.slice(1, -1));
      if (!routeForward) { alert('Nao foi possivel recalcular a rota'); setIsCalculating(false); return; }
      const routeReturn = await getRouteFromGoogle(orderedPts[orderedPts.length - 1], orderedPts[0], []);
      const totalKm = orderedPts.length > 2
        ? routeForward.legs.reduce((s: number, l: any) => s + l.distance.value, 0) / 1000 + (routeReturn ? routeReturn.legs[0].distance.value / 1000 : 0)
        : routeForward.legs.reduce((s: number, l: any) => s + l.distance.value, 0) / 1000;
      const totalHours = orderedPts.length > 2
        ? routeForward.legs.reduce((s: number, l: any) => s + l.duration.value, 0) / 3600 + (routeReturn ? routeReturn.legs[0].duration.value / 3600 : 0)
        : routeForward.legs.reduce((s: number, l: any) => s + l.duration.value, 0) / 3600;
      const segments: Segment[] = [];
      for (let i = 0; i < routeForward.legs.length; i++) {
        const leg = routeForward.legs[i];
        segments.push({ from: orderedPts[i], to: orderedPts[i + 1], km: leg.distance.value / 1000, hours: leg.duration.value / 3600, toll: 0 });
      }
      if (routeReturn) {
        segments.push({ from: orderedPts[orderedPts.length - 1], to: orderedPts[0], km: routeReturn.legs[0].distance.value / 1000, hours: routeReturn.legs[0].duration.value / 3600, toll: 0 });
      }
      setRouteResult({ totalKm, totalHours, segments, geometry: orderedCoords, coords: orderedCoords, addresses: orderedPts, totalPedagio: 0 });
      setRouteParadas(orderedPts.map((_, idx) => {
        const tipo = idx > 0 ? 'entrega' : 'entrega';
        return { nota: '', tipo: tipo as 'entrega' | 'coleta' };
      }));
      setRotaAtiva(false);
      setParadaAtual(1);
      setStatusParadas(orderedPts.slice(1).map(() => 'pendente'));
      showToast('Rota otimizada com sucesso!');
    } catch { alert('Erro ao reotimizar rota'); }
    setIsCalculating(false);
  };

  const clearRoute = () => { setPontoPartida(''); setAddresses(['', '']); setAddressTypes(['entrega', 'entrega']); setRouteResult(null); setGeocodedCoords([]); setRotaAtiva(false); setParadaAtual(1); setStatusParadas([]); };

  const startTracking = async () => {
    if (!navigator.geolocation) { alert('Geolocalizacao nao disponivel'); return; }
    setTrackingAtivo(true);
    trackingAtivoRef.current = true;
    setTrackingHistory([]);
    setShareLink('');
    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setTrackSessionId(sessionId);
    trackingRouteRef.current = 'Rota ' + new Date().toLocaleString('pt-BR');
    const requestWakeLock = async () => {
      try {
        if (!trackingAtivoRef.current) return;
        const wakeLock = await (navigator as any).wakeLock?.request('screen');
        if (wakeLock) {
          wakeLockRef.current = wakeLock;
          wakeLock.addEventListener('release', () => {
            if (trackingAtivoRef.current) requestWakeLock();
          });
        }
      } catch {}
    };
    await requestWakeLock();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setTrackingPos(p);
        setTrackingHistory(prev => [...prev, { ...p, ts: Date.now() }]);
      },
      (err) => { console.error('Erro GPS:', err.message); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    trackSyncRef.current = setInterval(async () => {
      try {
        await fetch(API_BASE + '/api/track/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            nome: trackingRouteRef.current,
            userEmail: session?.email || '',
            userName: session?.nome || '',
            lat: trackingHistoryRef.current[trackingHistoryRef.current.length - 1]?.lat,
            lng: trackingHistoryRef.current[trackingHistoryRef.current.length - 1]?.lng,
          }),
        });
      } catch {}
    }, 10000);

    if ((window as any).Capacitor?.isNativePlatform?.()) {
      try {
        const mod = await import('@transistorsoft/capacitor-background-geolocation');
        const bgGeo = await mod.BackgroundGeolocation.ready({
          desiredAccuracy: mod.BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
          distanceFilter: 20,
          stationaryRadius: 50,
          interval: 15000,
          fastestInterval: 5000,
          stopOnTerminate: false,
          startOnBoot: true,
          debug: false,
          foregroundService: true,
          locationAuthorizationRequest: 'Always',
          backgroundPermissionRationale: {
            title: 'Rastreamento em segundo plano',
            message: 'Para rastrear sua rota mesmo com a tela desligada, o NEXLOG precisa da sua localizacao. Clique em Permitir.',
            positiveAction: 'Permitir',
            negativeAction: 'Agora nao',
          },
          notification: {
            title: 'NEXLOG',
            message: 'Rastreamento ativo',
            color: '#7A5BD1',
            priority: 1,
            sticky: true,
          },
        });
        mod.BackgroundGeolocation.onLocation((loc: any) => {
          if (!trackingAtivoRef.current) return;
          const p = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          const rec = { ...p, ts: Date.now() };
          setTrackingPos(p);
          setTrackingHistory(prev => [...prev, rec]);
          trackingHistoryRef.current = [...trackingHistoryRef.current, rec];
          fetch(API_BASE + '/api/track/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              nome: trackingRouteRef.current,
              userEmail: session?.email || '',
              userName: session?.nome || '',
              lat: p.lat,
              lng: p.lng,
            }),
          }).catch(() => {});
        });
        try {
          const state = await bgGeo.getState();
          const perm = state.permissionStatus;
          if (!perm || perm.location !== mod.BackgroundGeolocation.AUTHORIZATION_STATUS_ALWAYS) {
            await mod.BackgroundGeolocation.requestPermission();
          }
          const after = await bgGeo.getState();
          if (!after.permissionStatus || after.permissionStatus.location !== mod.BackgroundGeolocation.AUTHORIZATION_STATUS_ALWAYS) {
            alert('Para rastrear com a tela desligada, conceda localizacao "Sempre permitir" para o NEXLOG nas configuracoes do celular.');
          }
        } catch {}
        await bgGeo.start();
        bgGeoRef.current = bgGeo;
      } catch (e) { console.error('Erro BackgroundGeolocation:', e); }
    }
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (trackSyncRef.current) { clearInterval(trackSyncRef.current); trackSyncRef.current = null; }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    if (bgGeoRef.current) {
      try { bgGeoRef.current.stop(); } catch {}
      bgGeoRef.current = null;
    }
    setTrackingAtivo(false);
    trackingAtivoRef.current = false;
    const pontosFinais = trackingHistoryRef.current;
    const trackingToSave = { nome: trackingRouteRef.current, pontos: pontosFinais, data: new Date().toISOString() };
    localStorage.removeItem('nexlog_tracking_ativo');
    const rotas = JSON.parse(localStorage.getItem('nexlog_rotas') || '[]');
    rotas.unshift({ id: Date.now().toString(), ...trackingToSave });
    localStorage.setItem('nexlog_rotas', JSON.stringify(rotas));
    setSavedRotas(rotas);
    setShareLink('');
    showToast('Rota finalizada e salva com sucesso!');
    fetch(API_BASE + '/api/track/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: trackSessionId, ativo: false }),
    }).catch(() => {});
  };

  const addCalcAddress = () => setCalcAddresses([...calcAddresses, '']);
  const removeCalcAddress = (index: number) => { if (calcAddresses.length > 1) setCalcAddresses(calcAddresses.filter((_, i) => i !== index)); };
  const updateCalcAddress = (index: number, value: string) => { const next = [...calcAddresses]; next[index] = value; setCalcAddresses(next); };

  const calculateFreight = async () => {
    if (!calcPontoPartida.trim()) { alert('Informe o ponto de partida'); return; }
    const valid = calcAddresses.filter(a => a.trim());
    if (valid.length < 1) { alert('Adicione pelo menos 1 destino'); return; }
    const peso = parseFloat(calcPeso) || 0;
    setIsCalcCalculating(true);
    try {
      const allPts = [calcPontoPartida.trim(), ...valid];
      const coords: { lat: number; lng: number }[] = [];
      for (let i = 0; i < allPts.length; i++) {
        const c = await geocodeAddress(allPts[i]);
        if (!c) { alert('Nao foi possivel geocodificar: "' + allPts[i] + '"'); setIsCalcCalculating(false); return; }
        coords.push(c);
        if (i < allPts.length - 1) await new Promise(r => setTimeout(r, 300));
      }
      const waypoints = allPts.slice(1, -1);
      const routeForward = await getRouteFromGoogle(allPts[0], allPts[allPts.length - 1], waypoints);
      if (!routeForward) { alert('Nao foi possivel calcular a rota'); setIsCalcCalculating(false); return; }
      const routeReturn = await getRouteFromGoogle(allPts[allPts.length - 1], allPts[0], []);
      const km = allPts.length > 2
        ? routeForward.legs.reduce((s: number, l: any) => s + l.distance.value, 0) / 1000 + (routeReturn ? routeReturn.legs[0].distance.value / 1000 : 0)
        : routeForward.legs.reduce((s: number, l: any) => s + l.distance.value, 0) / 1000;
      const allAddr = [...allPts, allPts[0]];
      const segments: { from: string; to: string; km: number; toll: number }[] = [];
      for (let i = 0; i < routeForward.legs.length; i++) {
        const leg = routeForward.legs[i];
        segments.push({ from: allAddr[i], to: allAddr[i + 1], km: leg.distance.value / 1000, toll: (leg.distance.value / 1000) * TOLL_RATE });
      }
      if (routeReturn) {
        segments.push({ from: allAddr[allAddr.length - 2], to: allAddr[0], km: routeReturn.legs[0].distance.value / 1000, toll: (routeReturn.legs[0].distance.value / 1000) * TOLL_RATE });
      }
      const pedagioManual = parseFloat(calcPedagio);
      const pedagio = pedagioManual > 0 ? pedagioManual : km * TOLL_RATE;
      const vk = parseFloat(calcValorKm) || DEFAULT_VALOR_KM;
      const custoTotal = km * vk + pedagio;
      setCalcResult({ km, pedagio, peso, custoTotal, custoPorKg: peso > 0 ? custoTotal / peso : 0, segments });
    } catch { alert('Erro ao calcular frete'); }
    setIsCalcCalculating(false);
  };

  const saveClient = () => {
    if (!clientForm.nome.trim()) { alert('Nome e obrigatorio'); return; }
    if (editingClient) {
      setClients(prev => prev.map(c => c.id === editingClient.id ? { ...c, ...clientForm } : c));
    } else {
      setClients(prev => [...prev, { id: generateId(), ...clientForm }]);
    }
    setShowClientModal(false);
    setEditingClient(null);
    setClientForm({ nome: '', cnpj: '', telefone: '', email: '', endereco: '', observacoes: '' });
  };

  const deleteClient = (id: string) => { if (confirm('Tem certeza que deseja excluir este cliente?')) setClients(prev => prev.filter(c => c.id !== id)); };

  const openEditClient = (client: Client) => {
    setEditingClient(client);
    setClientForm({ nome: client.nome, cnpj: client.cnpj, telefone: client.telefone, email: client.email, endereco: client.endereco, observacoes: client.observacoes });
    setShowClientModal(true);
  };

  const openClientModal = () => {
    setEditingClient(null);
    setClientForm({ nome: '', cnpj: '', telefone: '', email: '', endereco: '', observacoes: '' });
    setShowClientModal(true);
  };

  const openBudget = (data: Partial<BudgetData>) => {
    setBudgetData({ id: generateBudgetNumber(), date: new Date().toISOString(), origem: data.origem || '', destino: data.destino || '', km: data.km || 0, pedagio: data.pedagio || 0, peso: data.peso || 0, valorFrete: data.valorFrete || 0, valorTotal: data.valorTotal || 0, cliente: data.cliente });
    setBudgetModalOpen(true);
  };

  const saveBudget = () => {
    if (!budgetData) return;
    setHistory(prev => [{ id: budgetData.id, date: budgetData.date, origem: budgetData.origem, destino: budgetData.destino, km: budgetData.km, valor: budgetData.valorTotal, status: 'Orcamento' }, ...prev]);
    alert('Orcamento salvo com sucesso!');
  };

  const buildBudgetPdf = async () => {
    if (!budgetData) return null;
    try {
      const { generateBudgetPdf } = await import('@/lib/budgetPdf');
      return generateBudgetPdf({
        id: budgetData.id,
        date: formatDate(budgetData.date),
        cliente: budgetData.cliente,
        origem: budgetData.origem,
        destino: budgetData.destino,
        km: budgetData.km,
        peso: budgetData.peso || 0,
        valorFrete: budgetData.valorFrete,
        pedagio: budgetData.pedagio,
        valorTotal: budgetData.valorTotal,
      });
    } catch { return null; }
  };

  const shareBudgetPdf = async (dialogTitle: string) => {
    if (!budgetData) return;
    const pdf = await buildBudgetPdf();
    if (!pdf) { alert('Erro ao gerar o PDF.'); return; }
    const base64 = pdf.dataUri.split(',')[1];
    const isNative = (window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
      try {
        const { Directory, Filesystem } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const path = 'orcamento-' + budgetData.id + '.pdf';
        await Filesystem.writeFile({ path, data: base64, directory: Directory.Cache });
        const fileUri = await Filesystem.getUri({ path, directory: Directory.Cache });
        await Share.share({
          title: 'Orcamento NEXLOG ' + budgetData.id,
          files: [fileUri.uri],
          dialogTitle,
        });
        return;
      } catch (e: any) { console.error('Share nativo falhou:', e); }
    }
    const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'application/pdf' });
    const file = new File([blob], pdf.fileName, { type: 'application/pdf' });
    try {
      if ((navigator as any).canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Orcamento NEXLOG ' + budgetData.id, files: [file] });
        return;
      }
    } catch {}
    const link = document.createElement('a');
    link.href = pdf.dataUri;
    link.download = pdf.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const printBudget = async () => {
    if (!budgetData) return;
    const isNative = (window as any).Capacitor?.isNativePlatform?.();
    if (!isNative && window.print) {
      try {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write('<html><head><title>Orcamento</title></head><body style="font-family:sans-serif"><iframe src="' + (await buildBudgetPdf())?.dataUri + '" style="width:100%;height:100%;border:0"></iframe></body></html>');
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 800);
          return;
        }
      } catch {}
    }
    await shareBudgetPdf('Imprimir / Salvar orcamento');
  };

  const shareBudget = async () => {
    await shareBudgetPdf('Compartilhar orcamento');
  };

  const sendWhatsApp = async () => {
    if (!budgetData || !whatsAppPhone.trim()) return;
    const phone = whatsAppPhone.replace(/\D/g, '');
    if (phone.length < 10) { alert('Telefone invalido. Digite com DDD (ex: 19998731102)'); return; }
    setWhatsAppSending(true);
    try {
      const sep = '━━━━━━━━━━━━━━━━━━━━━━';
      const lines = [
        '🚛 *NEXLOG EXPRESS*',
        'Logistica & Transporte',
        sep,
        '',
        '📋 *ORCAMENTO*',
        ' Nº: ' + budgetData.id,
        ' Data: ' + formatDate(budgetData.date),
        '',
      ];
      if (budgetData.cliente) {
        lines.push('👤 *CLIENTE*');
        lines.push(' ' + budgetData.cliente.nome);
        if (budgetData.cliente.cnpj) lines.push(' CNPJ/CPF: ' + budgetData.cliente.cnpj);
        if (budgetData.cliente.telefone) lines.push(' Tel: ' + budgetData.cliente.telefone);
        lines.push('');
      }
      lines.push(sep);
      lines.push('📍 *ROTA*');
      lines.push(' ' + budgetData.origem + '  ➜  ' + budgetData.destino);
      lines.push('');
      lines.push('📐 *DETALHES*');
      lines.push(' KM Total: ' + budgetData.km.toFixed(1) + ' km');
      if (budgetData.peso > 0) lines.push(' Peso: ' + budgetData.peso.toLocaleString('pt-BR') + ' kg');
      lines.push('');
      lines.push(sep);
      lines.push('💰 *PRECO*');
      lines.push(' Valor do Frete: ' + formatCurrency(budgetData.valorFrete));
      lines.push(' Pedagios: ' + formatCurrency(budgetData.pedagio));
      lines.push(' ─────────────────────');
      lines.push(' *VALOR TOTAL: ' + formatCurrency(budgetData.valorTotal) + '*');
      lines.push('');
      lines.push(sep);
      lines.push(' Validade do orcamento: 7 dias');
      lines.push(' Obrigado pela confianca! 🙏');
      lines.push('');
      lines.push('_NEXLOG EXPRESS - Sua rota, seu jeito._');
      const raw = await (async () => {
        const payload: any = { number: phone };
        try {
          const { generateBudgetPdf } = await import('@/lib/budgetPdf');
          const pdf = generateBudgetPdf({
            id: budgetData.id,
            date: formatDate(budgetData.date),
            cliente: budgetData.cliente,
            origem: budgetData.origem,
            destino: budgetData.destino,
            km: budgetData.km,
            peso: budgetData.peso || 0,
            valorFrete: budgetData.valorFrete,
            pedagio: budgetData.pedagio,
            valorTotal: budgetData.valorTotal,
          });
          payload.media = pdf.dataUri;
          payload.fileName = pdf.fileName;
          payload.caption = 'Orcamento NEXLOG ' + budgetData.id + ' - ' + formatCurrency(budgetData.valorTotal);
        } catch {
          payload.message = lines.join('\n');
        }
        return fetch(API_BASE + '/api/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(r => r.text());
      })();
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }
      if (data?.success) {
        alert('Orcamento enviado com sucesso!');
        return;
      }
      const errList = data?.error;
      if (Array.isArray(errList) && errList.some((e: any) => e.exists === false)) {
        alert('Este numero nao possui WhatsApp. Digite um numero com WhatsApp ativo.');
      } else {
        alert('Erro ao enviar. Verifique o numero e tente novamente.');
      }
    } catch (err: any) {
      alert('Erro ao conectar: ' + err.message);
    }
    setWhatsAppSending(false);
  };

  const saveToll = () => {
    if (!tollForm.trecho.trim()) { alert('Nome do trecho e obrigatorio'); return; }
    const pedagio = parseFloat(tollForm.pedagio);
    if (!pedagio || pedagio <= 0) { alert('Informe o valor do pedagio'); return; }
    if (editingToll) {
      setTollRoutes(prev => prev.map(t => t.id === editingToll.id ? { ...t, trecho: tollForm.trecho, pedagio, observacao: tollForm.observacao } : t));
    } else {
      setTollRoutes(prev => [...prev, { id: generateId(), trecho: tollForm.trecho, pedagio, observacao: tollForm.observacao }]);
    }
    setShowTollModal(false);
    setEditingToll(null);
    setTollForm({ trecho: '', pedagio: '', observacao: '' });
  };

  const deleteToll = (id: string) => { if (confirm('Excluir este pedagio?')) setTollRoutes(prev => prev.filter(t => t.id !== id)); };

  const openEditToll = (toll: TollRoute) => {
    setEditingToll(toll);
    setTollForm({ trecho: toll.trecho, pedagio: String(toll.pedagio), observacao: toll.observacao });
    setShowTollModal(true);
  };

  const openTollModal = () => {
    setEditingToll(null);
    setTollForm({ trecho: '', pedagio: '', observacao: '' });
    setShowTollModal(true);
  };

  const totalRoutes = history.length;
  const totalClients = clients.length;
  const totalKmHistory = history.reduce((s, h) => s + h.km, 0);
  const totalRevenue = history.reduce((s, h) => s + h.valor, 0);
  const recentActivity = history.slice(0, 5);

  const filteredClients = clients.filter(c => c.nome.toLowerCase().includes(clientSearch.toLowerCase()) || c.cnpj.includes(clientSearch));
  const filteredHistory = history.filter(h => h.origem.toLowerCase().includes(historySearch.toLowerCase()) || h.destino.toLowerCase().includes(historySearch.toLowerCase()));

  const letter = (i: number) => String(i + 1);

  const gradientBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, #7A5BD1, #D9822B)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  };

  const renderLanding = () => (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', overflowX: 'hidden' }}>
      <style>{`
        @keyframes pulse-ring { 0% { opacity: 0.4; transform: scale(0.7); } 70% { opacity: 0; transform: scale(1.5); } 100% { opacity: 0; transform: scale(1.5); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .lp-section { padding: 60px 32px 100px; max-width: 1600px; margin: 0 auto; }
        .lp-title { text-align: center; margin-bottom: 56px; }
        .lp-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 28; }
        .lp-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 32; }
        .lp-grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 32; }
        .lp-grid-5 { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 28; }
        .lp-hero-btns { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
        .lp-check-row { display: flex; align-items: center; gap: 10px; }
        @media (max-width: 768px) {
          .lp-section { padding: 40px 16px 60px; }
          .lp-grid-2, .lp-grid-3, .lp-grid-4, .lp-grid-5 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: '#FFFFFFDD', backdropFilter: 'blur(12px)', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '18px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/logo.svg" alt="NEXLOG" style={{ height: 44, width: 'auto', background: '#FFFFFF', borderRadius: 8, padding: '5px 10px' }} />
            <span style={{ fontWeight: 700, fontSize: 24, color: '#1E293B' }}>NEX<span style={{ background: 'linear-gradient(135deg, #7A5BD1, #D9822B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LOG</span></span>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <a href="#recursos" style={{ color: '#64748B', fontSize: 16, textDecoration: 'none' }}>Recursos</a>
            <a href="#precos" style={{ color: '#64748B', fontSize: 16, textDecoration: 'none', marginLeft: 16 }}>Preços</a>
            <a href="#depoimentos" style={{ color: '#64748B', fontSize: 16, textDecoration: 'none', marginLeft: 16 }}>Depoimentos</a>
            <button onClick={() => { setAuthTab('login'); setShowAuthModal(true); }} style={{ marginLeft: 16, padding: '14px 32px', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 10, color: '#1E293B', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Entrar</button>
            <button onClick={() => { setAuthTab('register'); setShowAuthModal(true); }} style={{ padding: '14px 32px', background: 'linear-gradient(135deg, #7A5BD1, #D9822B)', border: 'none', borderRadius: 10, color: '#FFF', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Criar conta</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1600, margin: '0 auto', padding: '120px 32px 50px', textAlign: 'center', position: 'relative' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9A7BEA', marginBottom: 20 }}>PLATAFORMA LOGÍSTICA COMPLETA</div>
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 40 }}>
          <div style={{ position: 'absolute', inset: -24, borderRadius: '50%', border: '2px solid #7A5BD1', animation: 'pulse-ring 2.4s ease-out infinite', opacity: 0.4 }} />
          <img src="/logo.svg" alt="NEXLOG" style={{ width: 260, maxWidth: '90vw', height: 'auto', borderRadius: 16, background: '#FFFFFF', padding: '14px 24px', position: 'relative', zIndex: 1 }} />
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 700, lineHeight: 1.15, maxWidth: 1000, margin: '0 auto 24px', color: '#1E293B' }}>
          Sua Frota,{' '}
          <span style={{ background: 'linear-gradient(135deg, #D9822B, #C9A24E)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Inteligente</span>
          <br />Seu Negócio,{' '}
          <span style={{ background: 'linear-gradient(135deg, #9A7BEA, #7A5BD1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Conectado</span>
        </h1>
        <p style={{ fontSize: 22, color: '#64748B', maxWidth: 900, margin: '0 auto 40px', lineHeight: 1.7 }}>
          Plataforma completa para gestão de fretes, rotas inteligentes, orçamentos instantâneos e marketplace logístico — tudo em um só lugar.
        </p>
        <div className="lp-hero-btns">
          <button onClick={() => { setAuthTab('register'); setShowAuthModal(true); }} style={{ padding: '20px 48px', background: 'linear-gradient(135deg, #7A5BD1, #D9822B)', border: 'none', borderRadius: 14, color: '#FFF', fontWeight: 700, fontSize: 19, cursor: 'pointer' }}>Começar Grátis</button>
          <button onClick={() => { document.getElementById('recursos')?.scrollIntoView({ behavior: 'smooth' }); }} style={{ padding: '20px 48px', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 14, color: '#64748B', fontWeight: 500, fontSize: 19, cursor: 'pointer' }}>Como Funciona</button>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px 80px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 20, padding: 32, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#DE6B5E' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#C0973F' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#7A5BD1' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'KM Rodados', value: '12.458', color: '#D9822B', icon: '🛞' },
              { label: 'Entregas', value: '847', color: '#7A5BD1', icon: '✅' },
              { label: 'Rotas Ativas', value: '12', color: '#3AA6A0', icon: '🗺️' },
              { label: 'Economia', value: 'R$ 3.240', color: '#C0973F', icon: '💰' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#FFFFFF', borderRadius: 12, padding: '18px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#64748B' }}>{s.label}</span>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 6 }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#FFFFFF', borderRadius: 12, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            <svg width="100%" height="260" viewBox="0 0 600 260" style={{ position: 'absolute', opacity: 0.15 }}>
              <path d="M0 150 Q150 100 300 130 Q450 160 600 80" stroke="#7A5BD1" strokeWidth="2" fill="none"/>
              <circle cx="120" cy="120" r="8" fill="#7A5BD1"/>
              <circle cx="250" cy="135" r="8" fill="#D9822B"/>
              <circle cx="380" cy="145" r="8" fill="#7A5BD1"/>
              <circle cx="480" cy="100" r="8" fill="#C0973F"/>
            </svg>
            <div style={{ position: 'relative', textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>🗺️</div>
              <div style={{ fontSize: 15, color: '#64748B' }}>Mapa de rotas em tempo real</div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="lp-section" style={{ padding: '0 24px 60px' }}>
        <div className="lp-grid-5">
          {[
            { value: '5.000+', label: 'Fretes Realizados', desc: 'Milhares de cargas transportadas' },
            { value: '24/7', label: 'Suporte Ativo', desc: 'Suporte via WhatsApp e e-mail' },
            { value: 'Grátis', label: 'Cadastro', desc: 'Comece agora sem custo' },
            { value: '+12K', label: 'KM Otimizados', desc: 'Rotas mais eficientes' },
            { value: '99%', label: 'Satisfação', desc: 'Clientes recomendam' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '24px 16px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 700, background: 'linear-gradient(135deg, #7A5BD1, #D9822B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.value}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginTop: 6 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Como Funciona */}
      <section id="recursos" className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9A7BEA', marginBottom: 8 }}>PASSO A PASSO</div>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Como funciona a NEXLOG</h2>
          <p style={{ fontSize: 19, color: '#64748B', maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>Em 4 passos simples, você gerencia suas rotas e fretes como nunca.</p>
        </div>
        <div className="lp-grid-4">
          {[
            { step: '01', icon: '📋', title: 'Cadastre Clientes', desc: 'Adicione seus clientes com endereços e dados de contato. Tudo organizado em um só lugar.' },
            { step: '02', icon: '📍', title: 'Crie Rotas', desc: 'Monte roteiros com múltiplos pontos. O sistema calcula KM, tempo e otimiza o trajeto.' },
            { step: '03', icon: '💰', title: 'Calcule Fretes', desc: 'Precifique fretes com precisão: KM, pedágios, peso e tipo de veículo.' },
            { step: '04', icon: '📊', title: 'Acompanhe Tudo', desc: 'Histórico completo de rotas, fretes e orçamentos. Relatórios detalhados.' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 16, right: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, fontWeight: 800, color: '#7A5BD1', opacity: 0.1 }}>{s.step}</div>
              <div style={{ fontSize: 30, marginBottom: 12 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>{s.title}</div>
              <div style={{ fontSize: 16, color: '#64748B', lineHeight: 1.7 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Funcionalidades */}
      <section id="features" className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#D9822B', marginBottom: 8 }}>FUNCIONALIDADES</div>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Tudo que você precisa</h2>
          <p style={{ fontSize: 19, color: '#64748B', maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>Ferramentas profissionais para transportadores e motoristas autônomos.</p>
        </div>
        <div className="lp-grid-2">
          {[
            { icon: '🗺️', title: 'Roteirizador Inteligente', desc: 'Calcule rotas com múltiplos pontos de entrega, otimizando KM e tempo. Visualização no mapa e exportação.', color: '#7A5BD1' },
            { icon: '🧮', title: 'Calculadora de Frete', desc: 'Precifique fretes com precisão considerando KM, pedágios, peso e tipo de veículo. Orçamentos profissionais.', color: '#D9822B' },
            { icon: '📦', title: 'Marketplace de Fretes', desc: 'Anuncie e encontre fretes em todo o Brasil. Planos com recursos exclusivos para alavancar seu negócio.', color: '#C0973F' },
            { icon: '👥', title: 'Gestão de Clientes', desc: 'Cadastro completo com histórico de fretes, orçamentos e dados de contato. Tudo organizado.', color: '#3AA6A0' },
            { icon: '📈', title: 'Histórico Completo', desc: 'Todas as rotas, orçamentos e entregas registrados com status, valores e detalhes para consulta.', color: '#7A5BD1' },
            { icon: '💬', title: 'WhatsApp Integrado', desc: 'Envie orçamentos e atualizações diretamente por WhatsApp com um clique. Comunicação instantânea.', color: '#2A8A6B' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, borderLeft: `3px solid ${f.color}` }}>
              <div style={{ fontSize: 38, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>{f.title}</div>
              <div style={{ fontSize: 16, color: '#64748B', lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Seguranca / Diferenciais */}
      <section className="lp-section">
        <div style={{ background: 'linear-gradient(135deg, #FFFFFF, rgba(122,91,209,0.05))', border: '1px solid #E2E8F0', borderRadius: 24, padding: '60px 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9A7BEA', marginBottom: 14 }}>DIFERENCIAIS</div>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: '#1E293B', marginBottom: 16, lineHeight: 1.2 }}>Por que escolher a NEXLOG?</h2>
            <p style={{ fontSize: 16, color: '#64748B', lineHeight: 1.7, marginBottom: 24 }}>
              Somos a plataforma mais completa para gestão logística. Do roteirizador ao marketplace de fretes, tudo que você precisa em um só lugar.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['Roteirizador com Google Maps e otimização de rotas', 'Calculadora de frete com pedágios e peso', 'Marketplace para anunciar e encontrar fretes', 'Gestão completa de clientes e histórico', 'Orçamentos profissionais com envio via WhatsApp'].map((item, i) => (
                <div key={i} className="lp-check-row">
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(122,91,209,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: '#7A5BD1' }}>✓</span>
                  </div>
                  <span style={{ fontSize: 14, color: '#1E293B' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 220, height: 220, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(122,91,209,0.15), rgba(217,130,43,0.15))', border: '2px solid rgba(122,91,209,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '1px solid rgba(122,91,209,0.1)' }} />
              <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: '1px solid rgba(122,91,209,0.05)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>🚛</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#9A7BEA' }}>NEXLOG</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Solução Completa</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section id="depoimentos" className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#D9822B', marginBottom: 8 }}>DEPOIMENTOS</div>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>O que nossos clientes dizem</h2>
          <p style={{ fontSize: 19, color: '#64748B', maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>Centenas de transportadores e motoristas confiam na NEXLOG.</p>
        </div>
        <div className="lp-grid-3">
          {[
            { name: 'Carlos Mendes', role: 'Transportador Autônomo', text: 'Uso o roteirizador todos os dias. Economizo horas de planejamento e meus clientes adoram os orçamentos profissionais via WhatsApp.', avatar: 'CM', rating: 5 },
            { name: 'Fernanda Oliveira', role: 'Gerente de Frota', text: 'Reduzimos 30% nos custos de combustível com as rotas otimizadas. O marketplace também nos ajudou a encontrar fretes de retorno.', avatar: 'FO', rating: 5 },
            { name: 'Ricardo Santos', role: 'Empresa de Logística', text: 'A calculadora de frete com pedágios integrada salvou nossa equipe. Agora precificamos em segundos com precisão total.', avatar: 'RS', rating: 5 },
          ].map((d, i) => (
            <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                {Array.from({ length: d.rating }).map((_, j) => (
                  <span key={j} style={{ color: '#C0973F', fontSize: 14 }}>★</span>
                ))}
              </div>
              <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7, marginBottom: 16, fontStyle: 'italic' }}>&ldquo;{d.text}&rdquo;</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #7A5BD1, #D9822B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#FFF', flexShrink: 0 }}>{d.avatar}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>{d.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="precos" className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9A7BEA', marginBottom: 8 }}>PLANOS</div>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Escolha o plano ideal</h2>
          <p style={{ fontSize: 19, color: '#64748B', maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>Comece grátis e escale conforme sua necessidade.</p>
        </div>
        <div className="lp-grid-3">
          {[
            { name: 'Grátis', price: 'R$ 0', period: 'para sempre', desc: 'Ideal para testes e uso básico', features: ['Fretes básicos', 'Roteirizador', 'Calculadora de frete', 'Suporte por e-mail'], color: '#64748B', popular: false },
            { name: 'Profissional', price: 'R$ 30', period: '/mês', desc: 'Para quem precisa de mais recursos', features: ['Fretes ilimitados', 'Suporte prioritário', 'Destaque nos resultados', 'Sem anúncios', 'Relatórios avançados'], color: '#7A5BD1', popular: true },
            { name: 'Premium', price: 'R$ 50', period: '/mês', desc: 'Gestão completa com tudo incluso', features: ['Fretes ilimitados', 'Suporte VIP 24h', 'Destaque dourado', 'Fotos nos anúncios', 'Prioridade total', 'Integração completa'], color: '#C0973F', popular: false },
          ].map((p, i) => (
            <div key={i} style={{ background: '#FFFFFF', border: `1px solid ${p.popular ? '#7A5BD1' : '#E2E8F0'}`, borderRadius: 16, padding: 28, position: 'relative' }}>
              {p.popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '4px 16px', background: 'linear-gradient(135deg, #7A5BD1, #D9822B)', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#FFF' }}>MAIS POPULAR</div>}
              <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: p.popular ? 12 : 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: p.color, marginBottom: 8 }}>{p.name}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#1E293B' }}>{p.price}</div>
                <div style={{ fontSize: 14, color: '#64748B' }}>{p.period}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>{p.desc}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {p.features.map((f, j) => (
                  <div key={j} className="lp-check-row">
                    <span style={{ color: p.color, fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 14, color: '#1E293B' }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { setAuthTab('register'); setShowAuthModal(true); }} style={{ width: '100%', padding: '12px 0', background: p.popular ? 'linear-gradient(135deg, #7A5BD1, #D9822B)' : 'transparent', border: p.popular ? 'none' : '1px solid #E2E8F0', borderRadius: 10, color: p.popular ? '#FFF' : '#64748B', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {p.price === 'R$ 0' ? 'Começar Grátis' : 'Escolher Plano'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#D9822B', marginBottom: 8 }}>PERGUNTAS FREQUENTES</div>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Dúvidas? Respostas.</h2>
        </div>
        <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { q: 'Preciso pagar para usar a NEXLOG?', a: 'Não! O plano Grátis já inclui fretes básicos, roteirizador e calculadora de frete. Você só paga se quiser recursos avançados como fretes ilimitados e suporte prioritário.' },
            { q: 'Como funciona o roteirizador de rotas?', a: 'Você adiciona os pontos de entrega no mapa e o sistema calcula a melhor rota, otimizando KM e tempo. O Google Maps integrado mostra o trajeto completo.' },
            { q: 'Posso emitir orçamentos profissionais?', a: 'Sim! A calculadora de frete gera orçamentos completos que podem ser enviados diretamente por WhatsApp para seus clientes.' },
            { q: 'O que é o Marketplace de Fretes?', a: 'É um espaço onde transportadores anunciam vagas e contratantes encontram freteiros. Você pode anunciar fretes gratuitamente no plano Grátis.' },
            { q: 'Como funciona o envio por WhatsApp?', a: 'Com um clique você envia orçamentos, atualizações de rota e comunicados para seus clientes diretamente pelo WhatsApp. Integração simples e rápida.' },
            { q: 'Meus dados ficam seguros?', a: 'Sim. Todos os dados são criptografados e armazenados com segurança. Não compartilhamos informações com terceiros.' },
          ].map((faq, i) => (
            <FaqItem key={i} faq={faq} />
          ))}
        </div>
      </section>

      {/* CTA Final */}
      <section className="lp-section">
        <div style={{ background: 'linear-gradient(135deg, rgba(122,91,209,0.12), rgba(217,130,43,0.08))', border: '1px solid rgba(122,91,209,0.3)', borderRadius: 24, padding: '80px 56px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9A7BEA', marginBottom: 14 }}>COMECE AGORA</div>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: '#1E293B', marginBottom: 14 }}>Pronto para otimizar sua logística?</h2>
          <p style={{ fontSize: 19, color: '#64748B', marginBottom: 36, lineHeight: 1.7, maxWidth: 700, margin: '0 auto 36px' }}>
            Crie sua conta gratuitamente e descubra como a NEXLOG pode transformar a gestão da sua frota.
          </p>
          <div className="lp-hero-btns">
            <button onClick={() => { setAuthTab('register'); setShowAuthModal(true); }} style={{ padding: '20px 48px', background: 'linear-gradient(135deg, #7A5BD1, #D9822B)', border: 'none', borderRadius: 14, color: '#FFF', fontWeight: 700, fontSize: 19, cursor: 'pointer' }}>Criar Conta Grátis</button>
            <button onClick={() => { setAuthTab('login'); setShowAuthModal(true); }} style={{ padding: '20px 48px', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 14, color: '#64748B', fontWeight: 500, fontSize: 19, cursor: 'pointer' }}>Já tenho conta</button>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Cadastro grátis', 'Sem cartão de crédito', 'Cancelamento livre'].map((t, i) => (
              <div key={i} className="lp-check-row">
                <span style={{ color: '#7A5BD1', fontSize: 12 }}>✓</span>
                <span style={{ fontSize: 12, color: '#64748B' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #E2E8F0', padding: '40px 32px', background: '#FFFFFF' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 48, marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <img src="/logo.svg" alt="NEXLOG" style={{ height: 34, width: 'auto', background: '#FFFFFF', borderRadius: 8, padding: '4px 10px' }} />
              <span style={{ fontWeight: 700, fontSize: 22, color: '#1E293B' }}>NEX<span style={{ background: 'linear-gradient(135deg, #7A5BD1, #D9822B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LOG</span></span>
            </div>
            <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7 }}>A plataforma definitiva para gestão de fretes, rotas inteligentes e marketplace logístico.</p>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1E293B', marginBottom: 12 }}>Plataforma</div>
            {['Roteirizador', 'Calculadora de Frete', 'Marketplace', 'Gestão de Clientes'].map((l, i) => (
              <div key={i} style={{ fontSize: 14, color: '#64748B', marginBottom: 8, cursor: 'pointer' }}>{l}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1E293B', marginBottom: 12 }}>Empresa</div>
            {['Sobre Nós', 'Termos de Uso', 'Privacidade', 'Contato'].map((l, i) => (
              <div key={i} style={{ fontSize: 14, color: '#64748B', marginBottom: 8, cursor: 'pointer' }}>{l}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1E293B', marginBottom: 12 }}>Suporte</div>
            <div style={{ fontSize: 14, color: '#64748B', marginBottom: 8 }}>nexlogexpress@gmail.com</div>
            <div style={{ fontSize: 14, color: '#64748B', marginBottom: 8 }}>WhatsApp: (19) 98808-7838</div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 20, textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: '#64748B' }}>
          <span style={{ background: 'linear-gradient(135deg, #7A5BD1, #D9822B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NEXLOG</span> &copy; 2026 — Gestão logística inteligente.
        </div>
      </footer>
    </div>
  );

  const getDiarioHoje = (data?: string) => {
    const chave = data || diarioData;
    try {
      const todos: DiarioEntry[] = JSON.parse(localStorage.getItem('nexlog_diario') || '[]');
      return todos.filter(e => e.date === chave);
    } catch { return []; }
  };

  const salvarDiario = (entries: DiarioEntry[]) => {
    try {
      const todos: DiarioEntry[] = JSON.parse(localStorage.getItem('nexlog_diario') || '[]');
      const outros = todos.filter(e => e.date !== diarioData);
      localStorage.setItem('nexlog_diario', JSON.stringify([...outros, ...entries]));
    } catch {}
  };

  useEffect(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    setDiarioData(hoje);
    setDiarioHoje(getDiarioHoje(hoje));
    const storedKm = localStorage.getItem('nexlog_diario_km_' + hoje);
    if (storedKm) setDiarioKmGPS(parseFloat(storedKm));
    else setDiarioKmGPS(0);
    try { setAbastecimentos(JSON.parse(localStorage.getItem('nexlog_abastecimentos') || '[]')); } catch {}
  }, []);

  useEffect(() => {
    if (trackingHistory.length > 1 && trackingAtivo) {
      const hoje = new Date().toISOString().slice(0, 10);
      if (diarioData === hoje) {
        let totalKm = 0;
        for (let i = 1; i < trackingHistory.length; i++) {
          const p1 = trackingHistory[i - 1];
          const p2 = trackingHistory[i];
          const R = 6371;
          const dLat = (p2.lat - p1.lat) * Math.PI / 180;
          const dLng = (p2.lng - p1.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
          totalKm += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        setDiarioKmGPS(prev => { const novo = Math.max(prev, totalKm); localStorage.setItem('nexlog_diario_km_' + hoje, String(novo)); return novo; });
      }
    }
  }, [trackingHistory, trackingAtivo, diarioData]);

  const renderDiario = () => {
    const hoje = diarioHoje;
    const totalValor = hoje.reduce((s, e) => s + e.valor, 0);
    const totalPago = hoje.filter(e => e.pago).reduce((s, e) => s + e.valor, 0);
    const totalReceber = hoje.filter(e => !e.pago).reduce((s, e) => s + e.valor, 0);
    const totalDespesas = hoje.reduce((s, e) => s + e.despesas, 0);
    const addEntry = () => {
      if (!diarioForm.cliente || !diarioForm.valor) return;
      const entry: DiarioEntry = {
        id: Date.now().toString(), date: diarioData, cliente: diarioForm.cliente, veiculo: diarioForm.veiculo,
        valor: parseFloat(diarioForm.valor) || 0, pago: diarioForm.pago,
        despesas: parseFloat(diarioForm.despesas) || 0,
        hodometro: parseFloat(diarioForm.hodometro) || diarioKmGPS,
        obs: diarioForm.obs,
      };
      const updated = [...hoje, entry];
      setDiarioHoje(updated);
      salvarDiario(updated);
      setHistory(prev => [{ id: entry.id, date: new Date(diarioData + 'T12:00:00').toISOString(), origem: entry.cliente, destino: entry.veiculo + ' (Diario de Bordo)', km: entry.hodometro, valor: entry.valor, status: 'Diario' }, ...prev]);
      setDiarioForm({ cliente: '', veiculo: 'Carreta', valor: '', pago: true, despesas: '', hodometro: '', obs: '' });
    };
    const removeEntry = (id: string) => {
      const updated = hoje.filter(e => e.id !== id);
      setDiarioHoje(updated);
      salvarDiario(updated);
      setHistory(prev => prev.filter(h => h.id !== id));
    };
    const togglePago = (id: string) => {
      const updated = hoje.map(e => e.id === id ? { ...e, pago: !e.pago } : e);
      setDiarioHoje(updated);
      salvarDiario(updated);
    };
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 12px' }}>
        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, color: '#7A5BD1' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A24E" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Diario de Bordo
        </h2>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 16 }}>{new Date(diarioData + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ color: '#64748B', fontSize: 11, marginBottom: 4 }}>KM Rodados (GPS)</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2FA77E' }}>{diarioKmGPS.toFixed(1)} km</div>
          </div>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ color: '#64748B', fontSize: 11, marginBottom: 4 }}>Faturamento</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#9A7BEA' }}>{formatCurrency(totalValor)}</div>
          </div>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ color: '#64748B', fontSize: 11, marginBottom: 4 }}>Despesas</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#DE6A6A' }}>{formatCurrency(totalDespesas)}</div>
          </div>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ color: '#64748B', fontSize: 11, marginBottom: 4 }}>Liquido</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#C9A24E' }}>{formatCurrency(totalValor - totalDespesas)}</div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Adicionar Frete</h3>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <input value={diarioForm.cliente} onChange={e => setDiarioForm({ ...diarioForm, cliente: e.target.value })} placeholder="Cliente"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <select value={diarioForm.veiculo} onChange={e => setDiarioForm({ ...diarioForm, veiculo: e.target.value })}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
              {['Carreta','Toco','3/4','Van','Utilitario','Moto','Carro'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <input value={diarioForm.valor} onChange={e => setDiarioForm({ ...diarioForm, valor: e.target.value })} placeholder="Valor R$" type="number" step="0.01"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <input value={diarioForm.despesas} onChange={e => setDiarioForm({ ...diarioForm, despesas: e.target.value })} placeholder="Despesas R$ (combustivel, pedagio...)" type="number" step="0.01"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <input value={diarioForm.hodometro} onChange={e => setDiarioForm({ ...diarioForm, hodometro: e.target.value })} placeholder={'KM (GPS: ' + diarioKmGPS.toFixed(1) + ')'} type="number" step="0.1"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#1E293B', cursor: 'pointer' }}>
              <input type="checkbox" checked={diarioForm.pago} onChange={e => setDiarioForm({ ...diarioForm, pago: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: '#2FA77E' }} /> Ja pago
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={addEntry} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#9A7BEA,#7A5BD1)', color: '#FFF', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>
              Adicionar
            </button>
          </div>
        </div>

        {hoje.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0' }}>
            <div style={{ color: '#64748B', fontSize: 14 }}>Nenhum frete registrado hoje. Adicione seu primeiro frete acima.</div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Fretes do Dia ({hoje.length})</span>
              <span style={{ fontSize: 12, color: '#64748B' }}>Receber: {formatCurrency(totalReceber)} | Pago: {formatCurrency(totalPago)}</span>
            </div>
            {hoje.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: i < hoje.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: e.pago ? 'rgba(47,167,126,0.15)' : 'rgba(201,162,78,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
                  onClick={() => togglePago(e.id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={e.pago ? '#2FA77E' : '#C9A24E'}><path d={e.pago ? 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' : 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z'}/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{e.cliente}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>{e.veiculo} · KM: {e.hodometro.toFixed(1)} · {e.obs || '--'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{formatCurrency(e.valor)}</div>
                  <div style={{ fontSize: 11, color: '#DE6A6A' }}>Desp: {formatCurrency(e.despesas)}</div>
                </div>
                <button onClick={() => removeEntry(e.id)} style={{ background: 'none', border: 'none', color: '#DE6A6A', cursor: 'pointer', padding: 4, fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 20, padding: '14px 16px', backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', gap: '10px 16px', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>Resumo do dia:</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', fontSize: 14 }}>
            <span>KM: <strong style={{ color: '#2FA77E' }}>{diarioKmGPS.toFixed(1)}</strong></span>
            <span>Total: <strong style={{ color: '#9A7BEA' }}>{formatCurrency(totalValor)}</strong></span>
            <span>Desp: <strong style={{ color: '#DE6A6A' }}>{formatCurrency(totalDespesas)}</strong></span>
            <span>Liq: <strong style={{ color: '#C9A24E' }}>{formatCurrency(totalValor - totalDespesas)}</strong></span>
          </div>
        </div>

        <div style={{ marginTop: 20, backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2FA77E" strokeWidth="2" strokeLinecap="round"><path d="M22 12v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4"/><path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2"/><rect x="2" y="10" width="20" height="4" rx="1"/><circle cx="6" cy="14" r="1"/><circle cx="18" cy="14" r="1"/></svg>
            Abastecimentos
          </h3>
          {(() => {
            const ordenados = [...abastecimentos].sort((a, b) => a.date.localeCompare(b.date));
            const ultimo = ordenados.length > 0 ? ordenados[ordenados.length - 1] : null;
            const penultimo = ordenados.length > 1 ? ordenados[ordenados.length - 2] : null;
            const kmLitro = penultimo && ultimo && ultimo.hodometroTotal > penultimo.hodometroTotal
              ? ((ultimo.hodometroTotal - penultimo.hodometroTotal) / ultimo.litros).toFixed(1) : null;
            const kmDia = penultimo && ultimo && ultimo.hodometroTotal > penultimo.hodometroTotal
              ? ((ultimo.hodometroTotal - penultimo.hodometroTotal) / Math.max(1, (new Date(ultimo.date + 'T12:00:00').getTime() - new Date(penultimo.date + 'T12:00:00').getTime()) / (1000 * 3600 * 24))).toFixed(1) : null;
            return (
              <>
                {ultimo && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                    <div style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Ultimo abastec.</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{new Date(ultimo.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{ultimo.litros.toFixed(1)}L · {ultimo.hodometroTotal.toFixed(0)}km</div>
                    </div>
                    <div style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Media km/L</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: kmLitro ? '#2FA77E' : '#64748B' }}>{kmLitro || '--'}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>km por litro</div>
                    </div>
                    <div style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Media km/dia</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: kmDia ? '#C9A24E' : '#64748B' }}>{kmDia || '--'}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>km por dia</div>
                    </div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
                  <input value={abastForm.litros} onChange={e => setAbastForm({ ...abastForm, litros: e.target.value })} placeholder="Litros" type="number" step="0.1"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  <input value={abastForm.valor} onChange={e => setAbastForm({ ...abastForm, valor: e.target.value })} placeholder="Valor R$" type="number" step="0.01"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  <input value={abastForm.precoLitro} onChange={e => setAbastForm({ ...abastForm, precoLitro: e.target.value })} placeholder="R$/L (opcional)" type="number" step="0.001"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  <input value={abastForm.hodometroTotal} onChange={e => setAbastForm({ ...abastForm, hodometroTotal: e.target.value })} placeholder="KM total veiculo" type="number" step="1"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <button onClick={() => {
                  const hoje = new Date().toISOString().slice(0, 10);
                  if (!abastForm.litros || !abastForm.valor || !abastForm.hodometroTotal) return;
                  const precoLitro = abastForm.precoLitro ? parseFloat(abastForm.precoLitro) : (parseFloat(abastForm.valor) / parseFloat(abastForm.litros));
                  const novo: Abastecimento = {
                    id: Date.now().toString(), date: hoje, litros: parseFloat(abastForm.litros), valor: parseFloat(abastForm.valor), precoLitro, hodometroTotal: parseFloat(abastForm.hodometroTotal)
                  };
                  const updated = [...abastecimentos, novo];
                  setAbastecimentos(updated);
                  try { localStorage.setItem('nexlog_abastecimentos', JSON.stringify(updated)); } catch {}
                  setAbastForm({ litros: '', valor: '', precoLitro: '', hodometroTotal: '' });
                }} style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#2FA77E,#1F7A5E)', color: '#FFF', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', marginBottom: 12 }}>
                  + Adicionar Abastecimento
                </button>
                {ordenados.length > 0 && (
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {ordenados.slice().reverse().map((a, i) => {
                      const prev = i < ordenados.length - 1 ? ordenados[ordenados.length - 2 - i] : null;
                      const diffKm = prev && a.hodometroTotal > prev.hodometroTotal ? (a.hodometroTotal - prev.hodometroTotal).toFixed(0) : null;
                      const media = prev && diffKm && a.litros > 0 ? (parseFloat(diffKm!) / a.litros).toFixed(1) : null;
                      return (
                        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < ordenados.length - 1 ? '1px solid #E2E8F0' : 'none', fontSize: 12 }}>
                          <span style={{ color: '#64748B' }}>{new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                          <span>{a.litros.toFixed(1)}L</span>
                          <span>{formatCurrency(a.valor)}</span>
                          <span style={{ color: '#64748B' }}>R${a.precoLitro.toFixed(2)}/L</span>
                          <span style={{ color: '#64748B' }}>{a.hodometroTotal.toFixed(0)}km</span>
                          <span style={{ color: diffKm ? '#2FA77E' : '#64748B' }}>{media ? media + ' km/L' : '--'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    );
  };

  const renderDashboard = () => (
    <div>
      <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#7A5BD1' }}>Dashboard</h1>
      <p className="page-subtitle" style={{ color: '#64748B', marginBottom: 32 }}>Visao geral do seu negocio</p>
      <div className="stat-cards" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total de Rotas', value: String(totalRoutes), icon: 'route', color: '#7A5BD1', bg: 'rgba(122,91,209,0.15)' },
          { label: 'Total de Clientes', value: String(totalClients), icon: 'users', color: '#D9822B', bg: 'rgba(217,130,43,0.15)' },
          { label: 'KM Total Rodado', value: totalKmHistory.toFixed(0) + ' km', icon: 'map-pin', color: '#C9A24E', bg: 'rgba(201,162,78,0.15)' },
          { label: 'Faturamento Total', value: formatCurrency(totalRevenue), icon: 'save', color: '#9A7BEA', bg: 'rgba(154,123,234,0.15)' },
        ].map((card, i) => (
          <div key={i} style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 10 : 16 }}>
              <span style={{ color: '#64748B', fontSize: isMobile ? 12 : 13 }}>{card.label}</span>
              <div style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: 10, backgroundColor: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={card.icon} size={isMobile ? 16 : 20} color={card.color} />
              </div>
            </div>
            <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>
      {trackingAtivo || onlineDrivers.length > 0 ? (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, marginBottom: isMobile ? 14 : 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#2FA77E', display: 'inline-block' }} />
            Motoristas Online ({onlineDrivers.length})
          </h2>
          {onlineDrivers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {onlineDrivers.slice(0, 10).map((d: any) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', backgroundColor: 'rgba(47,167,126,0.05)', borderRadius: 10, border: '1px solid rgba(47,167,126,0.15)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#2FA77E', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{d.nome || d.userName || 'Sem nome'}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>{d.userName && d.nome !== d.userName ? d.userName + ' · ' : ''}{d.pontos?.length || 0} pontos</div>
                </div>
                <button onClick={() => { const link = SITE_URL + '/?rastreio=' + d.id; navigator.clipboard.writeText(link).catch(() => { const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }); alert('Link copiado!'); }}
                  style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#7A5BD1', color: '#FFF', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  Copiar link
                </button>
              </div>
            ))}
          </div>
          ) : (
            <p style={{ color: '#64748B', fontSize: 14, textAlign: 'center', padding: 20 }}>Nenhum motorista online no momento. Inicie um rastreamento na aba "Rastreamento" para aparecer aqui.</p>
          )}
        </div>
      ) : null}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 24 }}>
        <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, marginBottom: isMobile ? 14 : 20 }}>Atividade Recente</h2>
        {recentActivity.length === 0 ? (
          <p style={{ color: '#64748B', textAlign: 'center', padding: isMobile ? 30 : 40 }}>Nenhuma atividade registrada</p>
        ) : (
          recentActivity.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #E2E8F0', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: item.status === 'Orcamento' ? 'rgba(217,130,43,0.15)' : 'rgba(154,123,234,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={item.status === 'Orcamento' ? 'alert' : 'check'} size={16} color={item.status === 'Orcamento' ? '#D9822B' : '#9A7BEA'} />
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 500 }}>{item.origem} → {item.destino}</div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{formatDateTime(item.date)}</div>
                </div>
              </div>
              <div style={{ textAlign: isMobile ? 'left' : 'right', paddingLeft: isMobile ? 48 : 0 }}>
                <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{formatCurrency(item.valor)}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{item.km.toFixed(1)} km</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderRoteirizador = () => (
    <div>
      <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#7A5BD1' }}>Roteirizador</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <p className="page-subtitle" style={{ color: '#64748B', margin: 0 }}>Planeje sua rota de forma inteligente</p>
        <button onClick={() => setShowOcrModal(true)}
          style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'transparent', color: '#9A7BEA', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Ler Documento
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '380px 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 24, height: 'fit-content' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#D9822B', fontWeight: 600, marginBottom: 6 }}>
              <Icon name="truck" size={14} color="#D9822B" /> Ponto de Partida / Retorno
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <AddressInput value={pontoPartida} onChange={setPontoPartida}  placeholder="Ex: Rua das Flores, Porto Alegre"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button onClick={() => {
                if ('geolocation' in navigator) {
                  navigator.geolocation.getCurrentPosition(
                    async pos => {
                      try {
                        const r = await fetch(API_BASE + '/api/reverse?lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude);
                        if (r.ok) { const d = await r.json(); if (d?.address) { setPontoPartida(d.address); return; } }
                      } catch {}
                      setPontoPartida(pos.coords.latitude.toFixed(6) + ', ' + pos.coords.longitude.toFixed(6));
                    },
                    () => alert('Nao foi possivel obter sua localizacao')
                  );
                } else { alert('Geolocalizacao nao suportada'); }
              }} title="Usar minha localizacao" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#2FA77E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontSize: 14, whiteSpace: 'nowrap', gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                Minha Localizacao
              </button>
            </div>
            <span style={{ fontSize: 11, color: '#64748B', marginTop: 3, display: 'block' }}>A rota comeca e termina aqui</span>
          </div>
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 14, marginBottom: 14 }}>
            <h2 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, marginBottom: 12 }}>Destinos</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: '#64748B' }}>Tempo padrao:</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#2FA77E', fontWeight: 600 }}>Entrega
                <input value={tempoEntregaPadrao} onChange={e => setTempoEntregaPadrao(Math.max(1, parseInt(e.target.value) || 15))} type="number" min="1" style={{ width: 48, padding: '4px 6px', borderRadius: 4, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#2FA77E', fontSize: 11, fontFamily: 'inherit', outline: 'none', textAlign: 'center' }} />min
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9A7BEA', fontWeight: 600 }}>Coleta
                <input value={tempoColetaPadrao} onChange={e => setTempoColetaPadrao(Math.max(1, parseInt(e.target.value) || 30))} type="number" min="1" style={{ width: 48, padding: '4px 6px', borderRadius: 4, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#9A7BEA', fontSize: 11, fontFamily: 'inherit', outline: 'none', textAlign: 'center' }} />min
              </label>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            {addresses.map((addr, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
                draggable onDragStart={(e) => { e.dataTransfer.setData('idx', String(i)); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); moveAddress(i, parseInt(e.dataTransfer.getData('idx'))); }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: addressTypes[i] === 'coleta' ? '#9A7BEA' : '#2FA77E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <AddressInput value={addr} onChange={(v) => updateAddress(i, v)}  placeholder={'Destino ' + (i + 1)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                <button onClick={() => updateAddressType(i, addressTypes[i] === 'entrega' ? 'coleta' : 'entrega')}
                  style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: addressTypes[i] === 'coleta' ? 'rgba(154,123,234,0.2)' : 'rgba(47,167,126,0.2)', color: addressTypes[i] === 'coleta' ? '#9A7BEA' : '#2FA77E', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {addressTypes[i] === 'coleta' ? 'Coleta' : 'Entrega'}
                </button>
                {addresses.length > 1 && (
                  <button onClick={() => removeAddress(i)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', backgroundColor: 'rgba(222,106,106,0.15)', color: '#DE6A6A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addAddress} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed #E2E8F0', backgroundColor: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16, transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7A5BD1'; e.currentTarget.style.color = '#9A7BEA'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B'; }}>
            <Icon name="plus" size={16} /> Adicionar destino
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={calculateRoute} disabled={isCalculating}
              style={{ flex: 1, padding: '12px', borderRadius: 8, ...gradientBtn, cursor: isCalculating ? 'wait' : 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isCalculating ? (
                <><span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} /> Calculando...</>
              ) : (
                <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg> Calcular e Otimizar</>
              )}
            </button>
            <button onClick={clearRoute} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#DE6A6A'; e.currentTarget.style.color = '#DE6A6A'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B'; }}>
              Limpar
            </button>
          </div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', minHeight: isMobile ? 240 : 450, position: 'relative' }}>
          <div ref={mapRef} style={{ width: '100%', height: isMobile ? 240 : 450 }} />
        </div>
      </div>
      {routeResult && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 20 }}>
          <a href={getMapsNavigateUrl(routeResult.addresses[0] || routeResult.segments[0].to)} target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: '#4285F4', color: '#FFF', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', textDecoration: 'none', textAlign: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            Google Maps
          </a>
          <a href={getWazeNavigateUrl(routeResult.addresses[0] || routeResult.segments[0].to)} target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: '#3DB5D9', color: '#F5F7FA', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', textDecoration: 'none', textAlign: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M20.94 11C20.5 6.83 17.74 4 13 3.18V1h-2v2.18C6.26 4 3.5 6.83 3.06 11H1v2h2.06c.44 4.17 3.2 7 7.94 7.82V23h2v-2.18c4.74-.82 7.5-3.65 7.94-7.82H23v-2h-2.06zM12 5c3.87 0 7 3.13 7 7s-3.13 7-7 7-7-3.13-7-7 3.13-7 7-7z"/></svg>
            Waze
          </a>
        </div>
      )}
      {routeResult && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total KM', value: routeResult.totalKm.toFixed(1) + ' km', color: '#9A7BEA' },
              { label: 'Tempo Direcao', value: formatDuration(routeResult.totalHours), color: '#D9822B' },
              { label: 'Total c/ Paradas', value: (() => { const tp = routeParadas.reduce((s, p) => s + (p.tipo === 'coleta' ? tempoColetaPadrao : tempoEntregaPadrao), 0); const t = Math.round(routeResult.totalHours * 60 + tp); return `~${Math.floor(t/60)}h${(t%60).toString().padStart(2,'0')}min`; })(), color: '#2FA77E' },
            ].map((s, i) => (
              <div key={i} style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: 20, textAlign: 'center' }}>
                <div style={{ color: '#64748B', fontSize: 12, marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <button onClick={reoptimizeRoute} disabled={isCalculating}
            style={{ width: '100%', padding: '12px', borderRadius: 8, marginBottom: 20, border: '1px solid #2FA77E', background: 'rgba(47,167,126,0.1)', color: '#2FA77E', cursor: isCalculating ? 'wait' : 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {isCalculating ? (
              <><span style={{ width: 16, height: 16, border: '2px solid rgba(47,167,126,0.3)', borderTopColor: '#2FA77E', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} /> Reotimizando...</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg> Reotimizar Rota</>
            )}
          </button>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, marginBottom: isMobile ? 10 : 16 }}>Paradas (Ordem de Carga)</h3>
            {[pontoPartida, ...routeResult.addresses].map((addr, i, arr) => {
              const parada = routeParadas[i - 1];
              const tipo = parada?.tipo || 'entrega';
              const tempoParada = tipo === 'coleta' ? tempoColetaPadrao : tempoEntregaPadrao;
              const totalParadas = routeParadas.filter((_, idx) => idx < i - 1).reduce((s, p) => s + (p.tipo === 'coleta' ? tempoColetaPadrao : tempoEntregaPadrao), 0);
              const chegadaMin = Math.round((routeResult.segments.slice(0, i).reduce((s, seg) => s + seg.hours * 60, 0) + totalParadas));
              const h = Math.floor(chegadaMin / 60);
              const m = chegadaMin % 60;
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', backgroundColor: i === 0 ? '#D9822B' : '#7A5BD1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 4 }}>
                    {i === 0 ? 'P' : i}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: isMobile ? 12 : 13, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? '#D9822B' : '#1E293B' }}>
                      {i === 0 ? 'PARTIDA: ' : `Parada ${i}: `}{addr}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                      {i === 0 ? 'Inicio da rota' : `Chegada ~${h}h${m.toString().padStart(2, '0')} · Parada: ${tempoParada}min`}
                    </div>
                    {i > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => { const n = [...routeParadas]; n[i - 1] = { ...n[i - 1], tipo: 'entrega' }; setRouteParadas(n); }}
                          style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: tipo === 'entrega' ? 'linear-gradient(135deg,#2FA77E,#2B9A73)' : '#E2E8F0', color: tipo === 'entrega' ? '#F5F7FA' : '#64748B', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                          Entrega ({tempoEntregaPadrao}min)
                        </button>
                        <button onClick={() => { const n = [...routeParadas]; n[i - 1] = { ...n[i - 1], tipo: 'coleta' }; setRouteParadas(n); }}
                          style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: tipo === 'coleta' ? 'linear-gradient(135deg,#C9A24E,#D9822B)' : '#E2E8F0', color: tipo === 'coleta' ? '#F5F7FA' : '#64748B', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                          Coleta ({tempoColetaPadrao}min)
                        </button>
                      </div>
                    )}
                    {i > 0 && (
                      <input value={parada?.nota || ''} onChange={e => { const n = [...routeParadas]; n[i - 1] = { ...n[i - 1], nota: e.target.value }; setRouteParadas(n); }}
                        placeholder="Nota fiscal / observacao"
                        style={{ marginTop: 6, width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                    )}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: isMobile ? 11 : 12, color: '#64748B', whiteSpace: 'nowrap', marginTop: 4 }}>
                    {routeResult.segments[i] ? routeResult.segments[i].km.toFixed(1) + ' km' : (i === routeResult.segments.length ? (routeResult.segments[routeResult.segments.length - 1]?.km.toFixed(1) + ' km') : '')}
                  </div>
                </div>
              );
            })}
            {(() => {
              const totalParadasMin = routeParadas.reduce((s, p) => s + (p.tipo === 'coleta' ? tempoColetaPadrao : tempoEntregaPadrao), 0);
              const totalViagemMin = Math.round(routeResult.totalHours * 60 + totalParadasMin);
              const hh = Math.floor(totalViagemMin / 60);
              const mm = totalViagemMin % 60;
              return (
                <div style={{ marginTop: 12, padding: '10px 14px', backgroundColor: '#F8FAFC', borderRadius: 8, fontSize: 12, color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total viagem: <strong style={{ color: '#C9A24E' }}>{routeResult.totalKm.toFixed(1)} km</strong></span>
                  <span>Paradas: <strong style={{ color: '#9A7BEA' }}>{routeParadas.length} ({totalParadasMin}min)</strong></span>
                  <span>Total c/ paradas: <strong style={{ color: '#2FA77E' }}>~{hh}h{mm.toString().padStart(2, '0')}</strong></span>
                </div>
              );
            })()}
          </div>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, marginBottom: isMobile ? 10 : 16 }}>Detalhes dos Trechos</h3>
            {routeResult.segments.map((seg, i) => (
              <div key={i} className="seg-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < routeResult.segments.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#7A5BD1', fontSize: isMobile ? 12 : 13, fontWeight: 600 }}>{i + 1} → {(i + 2) % (routeResult.segments.length + 1)}</span>
                  <span style={{ color: '#64748B', fontSize: isMobile ? 12 : 13 }}>{seg.from.length > (isMobile ? 18 : 25) ? seg.from.substring(0, isMobile ? 18 : 25) + '...' : seg.from}</span>
                </div>
                <div className="seg-vals" style={{ display: 'flex', gap: 20, fontSize: isMobile ? 12 : 13 }}>
                  <span style={{ color: '#FFFFFF' }}>{seg.km.toFixed(1)} km</span>
                  <span style={{ color: '#D9822B' }}>{formatDuration(seg.hours)}</span>
                </div>
              </div>
            ))}
          </div>
          {!rotaAtiva ? (
            <button onClick={() => {
              setRotaAtiva(true);
              setParadaAtual(1);
              const endereco = routeResult.addresses[0];
              if (endereco) {
                window.open(getMapsNavigateUrl(endereco), '_blank');
              }
            }} style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#2FA77E,#2B9A73)', color: '#F5F7FA', cursor: 'pointer', fontSize: 16, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              Iniciar Rota ({routeResult.addresses.length} paradas)
            </button>
          ) : (
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '2px solid #2FA77E', padding: isMobile ? 16 : 24, marginTop: 20 }}>
              {(() => {
                const total = routeResult.addresses.length;
                const pendentes = statusParadas.filter(s => s === 'pendente').length;
                if (pendentes === 0) {
                  return (
                    <div style={{ textAlign: 'center' }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="#2FA77E" style={{ marginBottom: 12 }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#2FA77E', marginBottom: 4 }}>Rota Finalizada!</div>
                      <div style={{ fontSize: 14, color: '#64748B' }}>Todas as {total} paradas foram concluidas</div>
                      <button onClick={() => setRotaAtiva(false)} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Fechar</button>
                    </div>
                  );
                }
                const idx = statusParadas.findIndex(s => s === 'pendente');
                const addr = routeResult.addresses[idx];
                const parada = routeParadas[idx];
                const tipo = parada?.tipo || 'entrega';
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: tipo === 'coleta' ? '#9A7BEA' : '#2FA77E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700 }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>Parada {idx + 1} de {total}</div>
                        <div style={{ fontSize: 12, color: tipo === 'coleta' ? '#9A7BEA' : '#2FA77E', fontWeight: 600 }}>{tipo === 'coleta' ? 'Coleta' : 'Entrega'}</div>
                      </div>
                      <span style={{ fontSize: 12, color: '#64748B' }}>Restam {pendentes}</span>
                    </div>
                    <div style={{ fontSize: 14, color: '#1E293B', marginBottom: 16, padding: '12px 14px', backgroundColor: '#F8FAFC', borderRadius: 8, wordBreak: 'break-word' }}>
                      {addr}
                      {parada?.nota && <div style={{ fontSize: 11, color: '#C9A24E', marginTop: 4 }}>NF: {parada.nota}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => {
                        const s = [...statusParadas]; s[idx] = 'entregue'; setStatusParadas(s);
                        setHistory(prev => [{ id: generateId(), date: new Date().toISOString(), origem: idx === 0 ? pontoPartida : routeResult.addresses[idx - 1], destino: addr, km: routeResult.segments[idx]?.km || 0, valor: 0, status: 'Entregue' }, ...prev]);
                        const next = statusParadas.findIndex((st, j) => j > idx && st === 'pendente');
                        if (next >= 0) {
                          setParadaAtual(next + 1);
                          const proxAddr = routeResult.addresses[next];
                          if (proxAddr) window.open(getMapsNavigateUrl(proxAddr), '_blank');
                        }
                      }} style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#2FA77E,#2B9A73)', color: '#FFF', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Entregue
                      </button>
                      <button onClick={() => {
                        const s = [...statusParadas]; s[idx] = 'recusada'; setStatusParadas(s);
                        setHistory(prev => [{ id: generateId(), date: new Date().toISOString(), origem: idx === 0 ? pontoPartida : routeResult.addresses[idx - 1], destino: addr, km: routeResult.segments[idx]?.km || 0, valor: 0, status: 'Recusada' }, ...prev]);
                        const next = statusParadas.findIndex((st, j) => j > idx && st === 'pendente');
                        if (next >= 0) {
                          setParadaAtual(next + 1);
                          const proxAddr = routeResult.addresses[next];
                          if (proxAddr) window.open(getMapsNavigateUrl(proxAddr), '_blank');
                        }
                      }} style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#DE6A6A,#CC4F4F)', color: '#FFF', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg> Recusada
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderCalculadora = () => (
    <div>
      <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#7A5BD1' }}>Calculadora de Frete</h1>
      <p className="page-subtitle" style={{ color: '#64748B', marginBottom: 24 }}>Adicione os enderecos e calcule o custo total do frete</p>
      <div className="calc-inner-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#D9822B', fontWeight: 600, marginBottom: 6 }}>
              <Icon name="truck" size={14} color="#D9822B" /> Ponto de Partida / Retorno
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <AddressInput value={calcPontoPartida} onChange={setCalcPontoPartida}  placeholder="Ex: Rua das Flores, Porto Alegre"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button onClick={() => {
                if ('geolocation' in navigator) {
                  navigator.geolocation.getCurrentPosition(
                    async pos => {
                      try {
                        const r = await fetch(API_BASE + '/api/reverse?lat=' + pos.coords.latitude + '&lon=' + pos.coords.longitude);
                        if (r.ok) { const d = await r.json(); if (d?.address) { setCalcPontoPartida(d.address); return; } }
                      } catch {}
                      setCalcPontoPartida(pos.coords.latitude.toFixed(6) + ', ' + pos.coords.longitude.toFixed(6));
                    },
                    () => alert('Nao foi possivel obter sua localizacao')
                  );
                } else { alert('Geolocalizacao nao suportada'); }
              }} title="Usar minha localizacao" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#2FA77E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontSize: 14, whiteSpace: 'nowrap', gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                Minha Localizacao
              </button>
            </div>
            <span style={{ fontSize: 11, color: '#64748B', marginTop: 3, display: 'block' }}>O frete comeca e termina aqui</span>
          </div>
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 14, marginBottom: 14 }}>
            <h2 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, marginBottom: 0 }}>Destinos</h2>
          </div>
          <div style={{ marginBottom: 12 }}>
            {calcAddresses.map((addr, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#7A5BD1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {letter(i)}
                </div>
                <AddressInput value={addr} onChange={(v) => updateCalcAddress(i, v)}  placeholder={'Endereco ' + letter(i)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                {calcAddresses.length > 1 && (
                  <button onClick={() => removeCalcAddress(i)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', backgroundColor: 'rgba(222,106,106,0.15)', color: '#DE6A6A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addCalcAddress} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed #E2E8F0', backgroundColor: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16, transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7A5BD1'; e.currentTarget.style.color = '#9A7BEA'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B'; }}>
            <Icon name="plus" size={16} /> Adicionar destino
          </button>
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16, marginTop: 4 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Dados do Frete</h3>
            <div className="calc-dados-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6 }}>Peso (kg) - opcional</label>
                <input type="number" value={calcPeso} onChange={(e) => setCalcPeso(e.target.value)} placeholder="0" min="0" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
               </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6 }}>Valor por KM (R$)</label>
                <input type="number" value={calcValorKm} onChange={(e) => setCalcValorKm(e.target.value)} step="0.1" min="0" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6 }}>Tipo de Veiculo</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {VEHICLE_TYPES.map(v => (
                  <button key={v} onClick={() => setCalcVeiculo(v)} style={{ padding: '8px 14px', borderRadius: 8, border: calcVeiculo === v ? '1px solid #7A5BD1' : '1px solid #E2E8F0', backgroundColor: calcVeiculo === v ? 'rgba(122,91,209,0.15)' : 'transparent', color: calcVeiculo === v ? '#9A7BEA' : '#64748B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', fontWeight: calcVeiculo === v ? 600 : 400, transition: 'all 0.2s' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6 }}>Pedagio Total (R$) - opcional</label>
              <input type="number" value={calcPedagio} onChange={(e) => setCalcPedagio(e.target.value)} placeholder="0" step="0.01" min="0" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button onClick={calculateFreight} disabled={isCalcCalculating}
              style={{ width: '100%', padding: '12px', borderRadius: 8, ...gradientBtn, cursor: isCalcCalculating ? 'wait' : 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isCalcCalculating ? 'Calculando...' : 'Calcular Frete'}
            </button>
          </div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: isMobile ? 16 : 24, height: 'fit-content' }}>
          <h2 style={{ fontSize: isMobile ? 15 : 16, fontWeight: 600, marginBottom: isMobile ? 14 : 20 }}>Resultado</h2>
          {!calcResult ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
              <Icon name="calculator" size={48} color="#E2E8F0" />
              <p style={{ marginTop: 16 }}>Adicione os enderecos e calcule</p>
            </div>
          ) : (
            <div>
              <div style={{ textAlign: 'center', padding: '32px 0', marginBottom: 20, backgroundColor: 'rgba(217,130,43,0.1)', borderRadius: 12, border: '1px solid rgba(217,130,43,0.2)' }}>
                <div style={{ color: '#64748B', fontSize: 14, marginBottom: 8 }}>Valor Total do Frete</div>
                <div className="calc-total-val" style={{ fontSize: 36, fontWeight: 800, color: '#D9822B' }}>{formatCurrency(calcResult.custoTotal)}</div>
              </div>
              {calcResult.km > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E2E8F0' }}>
                    <span style={{ color: '#64748B', fontSize: isMobile ? 13 : 14 }}>KM Total</span>
                    <span style={{ color: '#9A7BEA', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{calcResult.km.toFixed(1)} km</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E2E8F0' }}>
                    <span style={{ color: '#64748B', fontSize: isMobile ? 13 : 14 }}>Pedagio Total</span>
                    <span style={{ color: '#C9A24E', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{formatCurrency(calcResult.pedagio)}</span>
                  </div>
                  {calcResult.peso > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E2E8F0' }}>
                      <span style={{ color: '#64748B', fontSize: isMobile ? 13 : 14 }}>Peso</span>
                      <span style={{ color: '#D9822B', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{calcResult.peso.toLocaleString('pt-BR')} kg</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E2E8F0' }}>
                    <span style={{ color: '#64748B', fontSize: isMobile ? 13 : 14 }}>Tipo de Veiculo</span>
                    <span style={{ color: '#9A7BEA', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{calcVeiculo}</span>
                  </div>
                  {calcResult.peso > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E2E8F0' }}>
                      <span style={{ color: '#64748B', fontSize: isMobile ? 13 : 14 }}>Custo por KG</span>
                      <span style={{ color: '#C9A24E', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{formatCurrency(calcResult.custoPorKg)}</span>
                    </div>
                  )}
                </>
              )}
              <button onClick={() => {
                const destinos = calcAddresses.filter(a => a.trim());
                if (destinos.length < 1) { alert('Informe pelo menos 1 destino para gerar o orcamento'); return; }
                openBudget({ origem: calcPontoPartida || destinos[0], destino: destinos[destinos.length - 1], km: calcResult.km, pedagio: calcResult.pedagio, peso: calcResult.peso, valorFrete: calcResult.custoTotal - calcResult.pedagio, valorTotal: calcResult.custoTotal })
              }}
                style={{ width: '100%', marginTop: 20, padding: '12px', borderRadius: 8, ...gradientBtn, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="save" size={16} /> Gerar Orcamento
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderClientes = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#7A5BD1' }}>Clientes</h1>
          <p className="page-subtitle" style={{ color: '#64748B' }}>Gerencie seus clientes</p>
        </div>
        <button onClick={openClientModal} style={{ padding: '10px 20px', borderRadius: 8, ...gradientBtn, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="plus" size={16} /> Novo Cliente
        </button>
      </div>
      <div style={{ marginBottom: 20 }}>
        <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar cliente..."
          style={{ width: '100%', maxWidth: 400, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      {filteredClients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: isMobile ? 40 : 80, backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0' }}>
          <Icon name="users" size={48} color="#E2E8F0" />
          <p style={{ color: '#64748B', marginTop: 16 }}>{clients.length === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum cliente encontrado'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filteredClients.map(client => (
            <div key={client.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{client.nome}</h3>
                  {client.cnpj && <span style={{ fontSize: 12, color: '#64748B' }}>{client.cnpj}</span>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEditClient(client)} style={{ width: 32, height: 32, borderRadius: 6, border: 'none', backgroundColor: 'rgba(122,91,209,0.15)', color: '#9A7BEA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="edit" size={14} />
                  </button>
                  <button onClick={() => deleteClient(client.id)} style={{ width: 32, height: 32, borderRadius: 6, border: 'none', backgroundColor: 'rgba(222,106,106,0.15)', color: '#DE6A6A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.8 }}>
                {client.telefone && <div>Telefone: {client.telefone}</div>}
                {client.email && <div>Email: {client.email}</div>}
                {client.endereco && <div>Endereco: {client.endereco}</div>}
                {client.observacoes && <div style={{ marginTop: 8, padding: 8, backgroundColor: '#F8FAFC', borderRadius: 6, fontSize: 12, color: '#64748B' }}>{client.observacoes}</div>}
              </div>
              <button onClick={() => openBudget({ cliente: client })}
                style={{ width: '100%', marginTop: 12, padding: '8px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#D9822B'; e.currentTarget.style.color = '#D9822B'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B'; }}>
                <Icon name="save" size={14} /> Gerar Orcamento
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderHistorico = () => (
    <div>
      <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#7A5BD1' }}>Historico</h1>
      <p className="page-subtitle" style={{ color: '#64748B', marginBottom: 24 }}>Todas as suas rotas e orcamentos</p>
      <div style={{ marginBottom: 20 }}>
        <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Buscar por origem ou destino..."
          style={{ width: '100%', maxWidth: 400, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      {filteredHistory.length === 0 ? (
        <div style={{ textAlign: 'center', padding: isMobile ? 40 : 80, backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0' }}>
          <Icon name="clock" size={48} color="#E2E8F0" />
          <p style={{ color: '#64748B', marginTop: 16 }}>{history.length === 0 ? 'Nenhum registro' : 'Nenhum resultado encontrado'}</p>
        </div>
      ) : (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          {filteredHistory.map((item, i) => (
            <div key={item.id} className="history-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 16px' : '16px 20px', borderBottom: i < filteredHistory.length - 1 ? '1px solid #E2E8F0' : 'none', flexWrap: 'wrap', gap: isMobile ? 6 : 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
                <div style={{ width: isMobile ? 34 : 40, height: isMobile ? 34 : 40, borderRadius: 10, backgroundColor: item.status === 'Orcamento' ? 'rgba(217,130,43,0.15)' : 'rgba(154,123,234,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={item.status === 'Orcamento' ? 'alert' : 'check'} size={isMobile ? 15 : 18} color={item.status === 'Orcamento' ? '#D9822B' : '#9A7BEA'} />
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 500 }}>{item.origem} → {item.destino}</div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{formatDateTime(item.date)}</div>
                </div>
              </div>
              <div className="hist-right" style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: isMobile ? 12 : 13, color: '#64748B' }}>{item.km.toFixed(1)} km</span>
                <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: '#FFFFFF' }}>{formatCurrency(item.valor)}</span>
                <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, backgroundColor: item.status === 'Orcamento' ? 'rgba(217,130,43,0.15)' : 'rgba(154,123,234,0.15)', color: item.status === 'Orcamento' ? '#D9822B' : '#9A7BEA', fontWeight: 600 }}>
                  {item.status}
                </span>
                <button onClick={() => { setHistory(prev => prev.filter(h => h.id !== item.id)); }} style={{ background: 'none', border: 'none', color: '#DE6A6A', cursor: 'pointer', padding: 4, fontSize: 16, lineHeight: 1 }} title="Excluir">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPedagios = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#7A5BD1' }}>Pedagios</h1>
          <p className="page-subtitle" style={{ color: '#64748B' }}>Cadastre os pedagios conhecidos por trecho</p>
        </div>
        <button onClick={openTollModal} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', ...gradientBtn, color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="plus" size={16} /> Novo Pedagio
        </button>
      </div>
      {tollRoutes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: isMobile ? 40 : 80, backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0' }}>
          <Icon name="route" size={48} color="#E2E8F0" />
          <p style={{ color: '#64748B', marginTop: 16 }}>Nenhum pedagio cadastrado</p>
          <p style={{ color: '#64748B', fontSize: 14, marginTop: 4 }}>Cadastre trechos para calcular valores reais</p>
        </div>
      ) : (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          {!isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr 80px', padding: '14px 20px', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Trecho</span>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Pedagio</span>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Observacao</span>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}></span>
            </div>
          )}
          {tollRoutes.map((toll, i) => (
            isMobile ? (
              <div key={toll.id} style={{ padding: '14px 16px', borderBottom: i < tollRoutes.length - 1 ? '1px solid #E2E8F0' : 'none', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, flex: 1, paddingRight: 80 }}>{toll.trecho}</div>
                  <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', gap: 4 }}>
                    <button onClick={() => openEditToll(toll)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', backgroundColor: 'rgba(122,91,209,0.15)', color: '#9A7BEA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="edit" size={13} />
                    </button>
                    <button onClick={() => deleteToll(toll.id)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', backgroundColor: 'rgba(222,106,106,0.15)', color: '#DE6A6A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                  <span style={{ fontWeight: 600, color: '#C9A24E' }}>{formatCurrency(toll.pedagio)}</span>
                  {toll.observacao && <span style={{ color: '#64748B' }}>{toll.observacao}</span>}
                </div>
              </div>
            ) : (
              <div key={toll.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr 80px', alignItems: 'center', padding: '14px 20px', borderBottom: i < tollRoutes.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{toll.trecho}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#C9A24E' }}>{formatCurrency(toll.pedagio)}</span>
                <span style={{ fontSize: 14, color: '#64748B' }}>{toll.observacao || '-'}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEditToll(toll)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', backgroundColor: 'rgba(122,91,209,0.15)', color: '#9A7BEA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="edit" size={13} />
                  </button>
                  <button onClick={() => deleteToll(toll.id)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', backgroundColor: 'rgba(222,106,106,0.15)', color: '#DE6A6A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );

  const renderRastreamento = () => (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 12px' }}>
      <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, color: '#7A5BD1' }}>
        <Icon name="gps" size={24} color="#2FA77E" />
        Rastreamento</h2>
      <p style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>Compartilhe sua localizacao em tempo real</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {!trackingAtivo ? (
          <button onClick={startTracking} style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#2FA77E,#2B9A73)', color: '#FFF', cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            Iniciar Rastreamento
          </button>
        ) : (
          <>
            <button onClick={stopTracking} style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#DE6A6A,#CC4F4F)', color: '#FFF', cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              Parar Rastreamento
            </button>
            <button onClick={async () => {
              const link = SITE_URL + '/?rastreio=' + trackSessionId;
              setShareLink(link);
              try {
                await navigator.share({ title: 'NexLog - Rastreamento', text: 'Acompanhe a localizacao em tempo real:', url: link });
              } catch {
                await navigator.clipboard.writeText(link);
                alert('Link copiado! Envie para seu cliente.');
              }
            }}
              style={{ padding: '14px', borderRadius: 10, border: '1px solid #E2E8F0', background: 'transparent', color: '#9A7BEA', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Compartilhar
            </button>
          </>
        )}
      </div>
      {shareLink && (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, backgroundColor: 'rgba(154,123,234,0.1)', border: '1px solid rgba(154,123,234,0.3)', fontSize: 11, color: '#9A7BEA', wordBreak: 'break-all', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{shareLink}</span>
          <button onClick={() => { window.open('https://wa.me/?text=' + encodeURIComponent('Acompanhe minha localizacao em tempo real: ' + shareLink), '_blank'); }}
            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#25D366', color: '#FFF', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: 600 }}>WhatsApp</button>
          <button onClick={() => { navigator.clipboard.writeText(shareLink); alert('Link copiado!'); }}
            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#7A5BD1', color: '#FFF', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Copiar</button>
        </div>
      )}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', overflow: 'hidden', minHeight: isMobile ? 300 : 450, position: 'relative' }}>
        <div ref={trackingMapRef} style={{ width: '100%', height: isMobile ? 300 : 450 }} />
      </div>
      {trackingHistory.length > 0 && (
        <div style={{ marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: 16 }}>
          <div style={{ fontSize: 14, color: '#64748B', marginBottom: 8 }}>Pontos registrados: {trackingHistory.length}</div>
        </div>
      )}
      {savedRotas.length > 0 && !trackingAtivo && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Rotas salvas</h3>
          {savedRotas.slice(0, 5).map((rota: any) => (
            <div key={rota.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{rota.nome}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{new Date(rota.data).toLocaleString('pt-BR')} - {rota.pontos?.length || 0} pontos</div>
              </div>
              <button onClick={() => { if (confirm('Excluir esta rota?')) { const rotas = JSON.parse(localStorage.getItem('nexlog_rotas') || '[]'); const updated = rotas.filter((r: any) => r.id !== rota.id); localStorage.setItem('nexlog_rotas', JSON.stringify(updated)); setSavedRotas(updated); } }} style={{ background: 'none', border: 'none', color: '#DE6A6A', cursor: 'pointer', padding: '4px 8px', fontSize: 18, fontWeight: 700 }} title="Excluir">&#10005;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderAdmin = () => {
    const storedPw = typeof window !== 'undefined' ? localStorage.getItem('nexlog_admin_pw') : null;
    if (!adminUnlocked && session?.email !== 'nexlogexpress@gmail.com') {
      return (
        <div style={{ maxWidth: 400, margin: '40px auto', padding: '0 12px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#7A5BD1' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24E" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Painel Admin
          </h2>
          {storedPw ? (
            <>
              <p style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>Digite a senha de administrador para acessar:</p>
              <input type="password" value={adminPwInput} onChange={e => setAdminPwInput(e.target.value)}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                placeholder="Senha admin" onKeyDown={e => { if (e.key === 'Enter') { if (adminPwInput === storedPw) { setAdminUnlocked(true); setAdminPwError(''); } else { setAdminPwError('Senha incorreta'); } } }} />
              {adminPwError && <div style={{ color: '#DE6A6A', fontSize: 12, marginBottom: 12 }}>{adminPwError}</div>}
              <button onClick={() => { if (adminPwInput === storedPw) { setAdminUnlocked(true); setAdminPwError(''); } else { setAdminPwError('Senha incorreta'); } }}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#C9A24E,#CC7A33)', color: '#F5F7FA', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Acessar Admin
              </button>
            </>
          ) : (
            <>
              <p style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>Crie uma senha de administrador para acessar o painel:</p>
              <input type="password" value={adminPwInput} onChange={e => setAdminPwInput(e.target.value)}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                placeholder="Nova senha admin" onKeyDown={e => { if (e.key === 'Enter' && adminPwInput.length >= 4) { localStorage.setItem('nexlog_admin_pw', adminPwInput); setAdminUnlocked(true); setAdminPwError(''); } }} />
              {adminPwInput.length > 0 && adminPwInput.length < 4 && <div style={{ color: '#C9A24E', fontSize: 12, marginBottom: 12 }}>Minimo 4 caracteres</div>}
              <button onClick={() => { if (adminPwInput.length >= 4) { localStorage.setItem('nexlog_admin_pw', adminPwInput); setAdminUnlocked(true); setAdminPwError(''); } }}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#C9A24E,#CC7A33)', color: '#F5F7FA', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Criar e Acessar Admin
              </button>
            </>
          )}
        </div>
      );
    }
    return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 12px' }}>
      <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, color: '#7A5BD1' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A24E" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Painel Admin
      </h2>
      <p style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>Clientes online: {adminSessions.length}</p>
      {adminLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>Carregando...</div>
      ) : adminSessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>Nenhum rastreamento ativo no momento</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {adminSessions.map((s: any) => (
            <div key={s.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 16, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, alignItems: isMobile ? 'stretch' : 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#2FA77E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FFF' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{s.nome || 'Sem nome'}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{s.userName || s.userEmail || 'Anonimo'}</div>
                {s.ultimaPosicao && (
                  <div style={{ fontSize: 11, color: '#7A5BD1', marginTop: 4 }}>
                    Pontos: {s.pontos?.length || 0}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => { const link = SITE_URL + '/?rastreio=' + s.id; window.open('https://wa.me/?text=' + encodeURIComponent('Acompanhe a localizacao em tempo real: ' + link), '_blank'); }}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#25D366', color: '#FFF', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  WhatsApp
                </button>
                <button onClick={() => { const link = SITE_URL + '/?rastreio=' + s.id; navigator.clipboard.writeText(link); alert('Link copiado!'); }}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'transparent', color: '#9A7BEA', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Copiar link
                </button>
                <button onClick={() => { window.open(SITE_URL + '/?rastreio=' + s.id, '_blank'); }}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#7A5BD1', color: '#FFF', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  Ver no mapa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(() => {
        try {
          const localUsers = JSON.parse(localStorage.getItem('nexlog_users') || '[]');
          const users = adminUsers.length > 0 ? adminUsers : localUsers;
          if (users.length === 0) return null;
          return (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#1E293B' }}>Clientes Cadastrados ({users.length})</h3>
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                {users.map((u: any, i: number) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < users.length - 1 ? '1px solid #E2E8F0' : 'none' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(122,91,209,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#9A7BEA', flexShrink: 0 }}>
                      {(u.nome || u.email || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{u.nome || 'Sem nome'}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{u.email} · {u.plano || 'gratis'} · {u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '-'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        } catch { return null; }
      })()}
    </div>
  ); };

  const renderMarketplace = () => {
    const mkNav = [
      { id: 'fretes' as MkPage, label: 'Fretes Disponiveis' },
      { id: 'postar' as MkPage, label: 'Anunciar Frete' },
      { id: 'planos' as MkPage, label: 'Planos' },
      { id: 'meus' as MkPage, label: 'Meus Anuncios' },
      { id: 'mkroteirizador' as MkPage, label: 'Roteirizador' },
    ];
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, margin: 0, color: '#7A5BD1' }}>Marketplace de Fretes</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748B' }}>{session?.nome}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: userPlan === 'premium' ? 'linear-gradient(135deg,#D9822B,#C9A24E)' : userPlan === 'profissional' ? '#7A5BD1' : '#E2E8F0', color: '#FFF', fontWeight: 600, textTransform: 'uppercase' }}>{userPlan}</span>
            <button onClick={handleLogout} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E2E8F0', backgroundColor: 'transparent', color: '#DE6A6A', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Sair</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', borderBottom: '1px solid #E2E8F0', paddingBottom: 12 }}>
          {mkNav.map(n => (
            <button key={n.id} onClick={() => setMkPage(n.id)}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', fontWeight: mkPage === n.id ? 600 : 400, background: mkPage === n.id ? 'rgba(122,91,209,0.2)' : 'transparent', color: mkPage === n.id ? '#FFF' : '#64748B' }}>
              {n.label}
            </button>
          ))}
        </div>
        {mkPage === 'fretes' && renderMkFretes()}
        {mkPage === 'postar' && renderMkPostar()}
        {mkPage === 'planos' && renderMkPlanos()}
        {mkPage === 'meus' && renderMkMeus()}
        {mkPage === 'mkroteirizador' && renderRoteirizador()}
      </div>
    );
  };

  const renderMkFretes = () => {
    const all = JSON.parse(localStorage.getItem('nexlog_fretes') || '[]');
    const filtered = freightSearch ? all.filter((f: Freight) => f.origem.toLowerCase().includes(freightSearch.toLowerCase()) || f.destino.toLowerCase().includes(freightSearch.toLowerCase())) : all;
    return (
      <div>
        <input value={freightSearch} onChange={e => setFreightSearch(e.target.value)} placeholder="Buscar por origem ou destino..." style={{ width: '100%', maxWidth: 400, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 20, boxSizing: 'border-box' }} />
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>Nenhum frete disponivel no momento</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filtered.map((f: Freight) => (
              <div key={f.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                {f.imagem && <img src={f.imagem} alt="" style={{ width: '100%', height: 160, objectFit: 'cover' }} />}
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{f.origem} → {f.destino}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{f.tipo} | {f.peso}kg</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#D9822B' }}>{formatCurrency(Number(f.valor))}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Coleta: {f.coleta || 'A combinar'} | Entrega: {f.entrega || 'A combinar'}</div>
                  {f.observacao && <div style={{ fontSize: 12, color: '#7A5BD1', marginBottom: 8 }}>{f.observacao}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
                    <span style={{ fontSize: 11, color: '#64748B' }}>{f.empresa} • {f.plano}</span>
                    {f.contato && <span style={{ fontSize: 12, color: '#25D366', fontWeight: 600 }}>{f.contato}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMkPostar = () => (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 24, maxWidth: 600 }}>
      {userPlan === 'gratis' && (
        <div style={{ padding: 12, marginBottom: 16, backgroundColor: 'rgba(201,162,78,0.1)', borderRadius: 8, border: '1px solid rgba(201,162,78,0.2)', fontSize: 14, color: '#C9A24E' }}>
          Plano Gratis: voce pode anunciar fretes sem fotos. <button onClick={() => setMkPage('planos')} style={{ background: 'none', border: 'none', color: '#D9822B', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', fontSize: 14 }}>Fazer upgrade</button>
        </div>
      )}
      {[
        { key: 'origem', label: 'Origem *', placeholder: 'Cidade/UF de origem' },
        { key: 'destino', label: 'Destino *', placeholder: 'Cidade/UF de destino' },
      ].map(f => (
        <div key={f.key} style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>{f.label}</label>
          <input value={(freightForm as any)[f.key]} onChange={e => setFreightForm({ ...freightForm, [f.key]: e.target.value })} placeholder={f.placeholder}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Tipo de Carga</label>
          <select value={freightForm.tipo} onChange={e => setFreightForm({ ...freightForm, tipo: e.target.value })}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
            {['Carga Seca', 'Frigorifica', 'Perigosa', 'Granel', 'Carne'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Peso (kg)</label>
          <input value={freightForm.peso} onChange={e => setFreightForm({ ...freightForm, peso: e.target.value })} placeholder="0"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Valor do Frete (R$) *</label>
        <input value={freightForm.valor} onChange={e => setFreightForm({ ...freightForm, valor: e.target.value })} placeholder="0,00"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Data Coleta</label>
          <input type="date" value={freightForm.coleta} onChange={e => setFreightForm({ ...freightForm, coleta: e.target.value })}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Data Entrega</label>
          <input type="date" value={freightForm.entrega} onChange={e => setFreightForm({ ...freightForm, entrega: e.target.value })}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Contato (WhatsApp)</label>
        <input value={freightForm.contato} onChange={e => setFreightForm({ ...freightForm, contato: e.target.value })} placeholder="(00) 00000-0000"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Observacao</label>
        <textarea value={freightForm.observacao} onChange={e => setFreightForm({ ...freightForm, observacao: e.target.value })} placeholder="Informacoes adicionais..." rows={3}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
      {userPlan !== 'gratis' && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Imagem do Frete (URL)</label>
          <input value={freightImage} onChange={e => setFreightImage(e.target.value)} placeholder="https://..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      )}
      <button onClick={postFreight} disabled={!freightForm.origem || !freightForm.destino || !freightForm.valor}
        style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', ...gradientBtn, color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', opacity: (!freightForm.origem || !freightForm.destino || !freightForm.valor) ? 0.5 : 1 }}>
        Publicar Frete
      </button>
    </div>
  );

  const renderMkPlanos = () => (
    <div>
      <div style={{ fontSize: 14, color: '#64748B', marginBottom: 24 }}>Seu plano atual: <strong style={{ color: userPlan === 'premium' ? '#D9822B' : userPlan === 'profissional' ? '#9A7BEA' : '#64748B' }}>{userPlan === 'gratis' ? 'Gratis' : userPlan === 'profissional' ? 'Profissional (R$30/mes)' : 'Premium (R$50/mes)'}</strong></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {[
          { id: 'gratis' as const, name: 'Gratis', price: 'R$ 0', features: ['Anunciar fretes', 'Fretes basicos'], color: '#64748B', bcolor: '#E2E8F0' },
          { id: 'profissional' as const, name: 'Profissional', price: 'R$ 30/mes', features: ['Fretes ilimitados', 'Suporte prioritario', 'Destaque nos resultados'], color: '#9A7BEA', bcolor: '#7A5BD1' },
          { id: 'premium' as const, name: 'Premium', price: 'R$ 50/mes', features: ['Fretes ilimitados', 'Fotos nos anuncios', 'Destaque dourado', 'Suporte VIP'], color: '#C9A24E', bcolor: '#D9822B' },
        ].map(p => (
          <div key={p.id} onClick={() => selectPlan(p.id)}
            style={{ backgroundColor: '#FFFFFF', borderRadius: 12, border: `2px solid ${mkPlan === p.id ? p.bcolor : '#E2E8F0'}`, padding: 24, cursor: 'pointer', transition: 'all 0.2s' }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{p.name}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: p.color, marginBottom: 16 }}>{p.price}</div>
            {p.features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 14, color: '#94A3B8' }}>
                <Icon name="check" size={14} color="#2FA77E" /> {f}
              </div>
            ))}
            <button onClick={confirmPlan} disabled={p.id === userPlan}
              style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 8, border: 'none', background: p.id === 'premium' ? 'linear-gradient(135deg,#D9822B,#C9A24E)' : p.id === 'profissional' ? '#7A5BD1' : '#E2E8F0', color: '#FFF', cursor: p.id === userPlan ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'inherit', fontWeight: 600, opacity: p.id === userPlan ? 0.5 : 1 }}>
              {p.id === userPlan ? 'Plano Atual' : 'Assinar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderMkMeus = () => {
    const all = JSON.parse(localStorage.getItem('nexlog_fretes') || '[]').filter((f: Freight) => f.empresa === session?.nome);
    return (
      <div>
        {all.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>Voce ainda nao anunciou nenhum frete</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {all.map((f: Freight) => (
              <div key={f.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden', position: 'relative' }}>
                {f.imagem && <img src={f.imagem} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />}
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{f.origem} → {f.destino}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#D9822B' }}>{formatCurrency(Number(f.valor))}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>{f.tipo} | {f.peso}kg | {f.plano}</div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{f.coleta} → {f.entrega}</div>
                  <button onClick={() => deleteFreight(f.id)} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, border: 'none', backgroundColor: 'rgba(222,106,106,0.15)', color: '#DE6A6A', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAuthModal = () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}>
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 28, width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{authTab === 'login' ? 'Entrar' : 'Criar Conta'}</h2>
          <button onClick={() => setShowAuthModal(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'rgba(222,106,106,0.15)', color: '#DE6A6A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {authError && <div style={{ padding: 10, marginBottom: 16, backgroundColor: 'rgba(222,106,106,0.15)', borderRadius: 8, fontSize: 14, color: '#DE6A6A' }}>{authError}</div>}
        {authTab === 'register' && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Nome *</label>
            <input value={authForm.nome} onChange={e => setAuthForm({ ...authForm, nome: e.target.value })} placeholder="Seu nome"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Email *</label>
          <input value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="email@exemplo.com"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Senha *</label>
          <div style={{ position: 'relative' }}>
            <input type={showSenha ? 'text' : 'password'} value={authForm.senha} onChange={e => setAuthForm({ ...authForm, senha: e.target.value })} placeholder="Sua senha"
              style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <button type="button" onClick={() => setShowSenha(!showSenha)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', color: '#64748B' }}>
              <Icon name={showSenha ? 'eye-off' : 'eye'} size={18} />
            </button>
          </div>
        </div>
        {authTab === 'register' && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Telefone</label>
              <input value={authForm.telefone} onChange={e => setAuthForm({ ...authForm, telefone: e.target.value })} placeholder="(00) 00000-0000"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>CNPJ/CPF</label>
              <input value={authForm.cnpj} onChange={e => setAuthForm({ ...authForm, cnpj: e.target.value })} placeholder="00.000.000/0000-00"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </>
        )}
        <button onClick={handleAuth}
          style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', ...gradientBtn, color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', marginBottom: 16 }}>
          {authTab === 'login' ? 'Entrar' : 'Criar Conta'}
        </button>
        <div style={{ textAlign: 'center', fontSize: 14, color: '#64748B' }}>
          {authTab === 'login' ? (
            <>Nao tem conta? <button onClick={() => { setAuthTab('register'); setAuthError(''); }} style={{ background: 'none', border: 'none', color: '#9A7BEA', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, textDecoration: 'underline' }}>Cadastre-se</button></>
          ) : (
            <>Ja tem conta? <button onClick={() => { setAuthTab('login'); setAuthError(''); }} style={{ background: 'none', border: 'none', color: '#9A7BEA', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, textDecoration: 'underline' }}>Fazer login</button></>
          )}
        </div>
      </div>
    </div>
  );

  const renderTollModal = () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) setShowTollModal(false); }}>
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 28, width: '100%', maxWidth: 450 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>{editingToll ? 'Editar Pedagio' : 'Novo Pedagio'}</h2>
          <button onClick={() => setShowTollModal(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'rgba(222,106,106,0.15)', color: '#DE6A6A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6 }}>Trecho *</label>
          <input value={tollForm.trecho} onChange={(e) => setTollForm({ ...tollForm, trecho: e.target.value })} placeholder="Ex: Sao Paulo -> Campinas (Anhanguera)"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6 }}>Valor do Pedagio (R$) *</label>
          <input type="number" value={tollForm.pedagio} onChange={(e) => setTollForm({ ...tollForm, pedagio: e.target.value })} placeholder="0,00" step="0.01" min="0"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6 }}>Observacao</label>
          <input value={tollForm.observacao} onChange={(e) => setTollForm({ ...tollForm, observacao: e.target.value })} placeholder="Ex: 6 praças, sentido norte"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowTollModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={saveToll} style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none', ...gradientBtn, color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>
            {editingToll ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderClientModal = () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) setShowClientModal(false); }}>
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 28, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <button onClick={() => setShowClientModal(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'rgba(222,106,106,0.15)', color: '#DE6A6A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {[
          { key: 'nome', label: 'Nome *', placeholder: 'Nome do cliente' },
          { key: 'cnpj', label: 'CNPJ/CPF', placeholder: '00.000.000/0000-00' },
          { key: 'telefone', label: 'Telefone', placeholder: '(00) 00000-0000' },
          { key: 'email', label: 'Email', placeholder: 'email@exemplo.com' },
          { key: 'endereco', label: 'Endereco', placeholder: 'Endereco completo' },
        ].map(field => (
          <div key={field.key} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6 }}>{field.label}</label>
            <input value={(clientForm as any)[field.key]} onChange={(e) => setClientForm({ ...clientForm, [field.key]: e.target.value })} placeholder={field.placeholder}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 6 }}>Observacoes</label>
          <textarea value={clientForm.observacoes} onChange={(e) => setClientForm({ ...clientForm, observacoes: e.target.value })} placeholder="Notas sobre o cliente..." rows={3}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowClientModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={saveClient} style={{ flex: 1, padding: '12px', borderRadius: 8, ...gradientBtn, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            {editingClient ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderBudgetModal = () => {
    if (!budgetData) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={(e) => { if (e.target === e.currentTarget) setBudgetModalOpen(false); }}>
        <div className="budget-print" style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 32, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28, paddingBottom: 20, borderBottom: 'none', position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: 0, left: '10%', right: '10%', height: 2, background: 'linear-gradient(90deg, #7A5BD1, #D9822B)' }} />
            <div style={{ marginBottom: 12 }}>
              <NexLogLogo />
            </div>
            <div style={{ fontSize: 12, color: '#7A5BD1', letterSpacing: 2, fontFamily: "'Space Grotesk', sans-serif" }}>LOGISTICA & TRANSPORTE</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: 14 }}>
            <div>
              <div style={{ color: '#64748B' }}>Orcamento</div>
              <div style={{ fontWeight: 600 }}>{budgetData.id}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#64748B' }}>Data</div>
              <div style={{ fontWeight: 600 }}>{formatDate(budgetData.date)}</div>
            </div>
          </div>
          {budgetData.cliente && (
            <div style={{ marginBottom: 20, padding: 16, backgroundColor: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 11, color: '#9A7BEA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Dados do Cliente</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{budgetData.cliente.nome}</div>
              {budgetData.cliente.cnpj && <div style={{ fontSize: 14, color: '#64748B' }}>CNPJ/CPF: {budgetData.cliente.cnpj}</div>}
              {budgetData.cliente.telefone && <div style={{ fontSize: 14, color: '#64748B' }}>Telefone: {budgetData.cliente.telefone}</div>}
            </div>
          )}
          <div style={{ marginBottom: 20, padding: 16, backgroundColor: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, color: '#9A7BEA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Detalhes da Rota</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>{budgetData.origem}</span>
              <Icon name="arrow-right" size={14} color="#D9822B" />
              <span style={{ fontWeight: 600 }}>{budgetData.destino}</span>
            </div>
            <div style={{ fontSize: 14, color: '#64748B' }}>KM Total: {budgetData.km.toFixed(1)} km</div>
            {budgetData.peso > 0 && <div style={{ fontSize: 14, color: '#64748B' }}>Peso: {budgetData.peso.toLocaleString('pt-BR')} kg</div>}
          </div>
          <div style={{ padding: 16, backgroundColor: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#9A7BEA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Precificacao</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
              <span style={{ color: '#64748B' }}>Valor do Frete</span>
              <span style={{ fontWeight: 500 }}>{formatCurrency(budgetData.valorFrete)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
              <span style={{ color: '#64748B' }}>Pedagios</span>
              <span style={{ fontWeight: 500 }}>{formatCurrency(budgetData.pedagio)}</span>
            </div>
            <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>VALOR TOTAL</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#D9822B' }}>{formatCurrency(budgetData.valorTotal)}</span>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#64748B', marginBottom: 24, padding: 10, backgroundColor: 'rgba(217,130,43,0.1)', borderRadius: 8 }}>
            Validade deste orcamento: 7 dias
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: '#9A7BEA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Enviar por WhatsApp</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="Telefone com DDD (ex: 19998731102)" value={whatsAppPhone}
                onChange={e => setWhatsAppPhone(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
              <button onClick={sendWhatsApp} disabled={whatsAppSending}
                style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#FFFFFF', cursor: whatsAppSending ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'inherit', fontWeight: 600, opacity: whatsAppSending ? 0.6 : 1 }}>
                {whatsAppSending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
          <div className="budget-btns" style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveBudget} style={{ flex: 1, padding: '12px', borderRadius: 8, ...gradientBtn, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="save" size={16} /> Salvar
            </button>
            <button onClick={printBudget} style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: 'transparent', color: '#1E293B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="printer" size={16} /> Imprimir
            </button>
            <button onClick={shareBudget} style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: 'transparent', color: '#1E293B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="share" size={16} /> Compartilhar
            </button>
          </div>
          <button onClick={() => setBudgetModalOpen(false)} style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 8, border: 'none', backgroundColor: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            Fechar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F5F7FA', color: '#FFFFFF', fontFamily: "'Sora', sans-serif" }}>
      {trackingViewerId && trackingViewerData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, backgroundColor: '#F5F7FA', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DE6A6A" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{trackingViewerData.nome || 'Rastreamento'}</div>
              <div style={{ fontSize: 11, color: '#64748B' }}>{trackingViewerData.pontos?.length || 0} pontos registrados</div>
            </div>
            <button onClick={() => { trackingViewerMapRef.current?.remove(); trackingViewerMapRef.current = null; setTrackingViewerId(''); setTrackingViewerData(null); }}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#E2E8F0', color: '#1E293B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
              Fechar
            </button>
          </div>
          <div ref={trackingViewerRef} style={{ flex: 1 }} />
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        input:focus, textarea:focus { border-color: #7A5BD1 !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #45215F; }
        @media (max-width: 767px) {
          .page-title { font-size: 20px !important; margin-bottom: 6px !important; }
          .page-subtitle { font-size: 12px !important; margin-bottom: 16px !important; }
          .pedagios-grid { grid-template-columns: 1fr !important; }
          .pedagios-grid-header { display: none !important; }
          .pedagios-row { grid-template-columns: 1fr !important; padding: 14px 16px !important; gap: 6px !important; }
          .pedagios-row .obs-col { display: none !important; }
          .pedagios-row .actions-col { position: absolute; top: 14px; right: 16px !important; }
          .pedagios-row { position: relative !important; }
          .calc-inner-grid { grid-template-columns: 1fr !important; }
          .calc-dados-grid { grid-template-columns: 1fr !important; }
          .budget-btns { flex-direction: column !important; }
          .budget-btns button { flex: none !important; }
          .history-item { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .history-item .hist-right { align-self: flex-end !important; }
          .seg-row { flex-direction: column !important; align-items: flex-start !important; gap: 4px !important; }
          .seg-row .seg-vals { gap: 12px !important; }
          .stat-cards { grid-template-columns: 1fr 1fr !important; }
          .calc-total-val { font-size: 28px !important; }
          .sidebar-nav { padding: 12px 8px !important; }
          .sidebar-nav button { padding: 10px 12px !important; font-size: 13px !important; }
          input, select, textarea { font-size: 16px !important; }
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .stat-cards { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
      {/* Landing page - full screen without sidebar */}
      {currentPage === 'landing' ? (
        renderLanding()
      ) : (
        <>
      {isMobile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 12px', zIndex: 900 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: '#1E293B', cursor: 'pointer', padding: 6, borderRadius: 6 }}>
            <Icon name="menu" size={20} />
          </button>
          <div style={{ marginLeft: 6 }}>
            <NexLogLogo mobile />
          </div>
        </div>
      )}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999 }} />
      )}
      <aside style={{
        position: isMobile ? 'fixed' : 'sticky',
        top: 0,
        left: isMobile ? (sidebarOpen ? 0 : -260) : 0,
        width: 260,
        minWidth: 260,
        height: '100vh',
        backgroundColor: '#45215F',
        borderRight: '1px solid rgba(255,255,255,0.15)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        transition: 'left 0.3s ease',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          <NexLogLogo sidebar />
        </div>
        <nav className="sidebar-nav" style={{ padding: '16px 12px', flex: 1 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => { setCurrentPage(item.id); setSidebarOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', marginBottom: 4, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14,
                fontWeight: currentPage === item.id ? 600 : 400, color: currentPage === item.id ? '#FFFFFF' : '#C9D4DE',
                backgroundColor: currentPage === item.id ? 'rgba(122,91,209,0.2)' : 'transparent', fontFamily: 'inherit', transition: 'all 0.2s',
              }}>
              <Icon name={item.icon} size={18} color={currentPage === item.id ? '#9A7BEA' : '#C9D4DE'} />
              {item.label}
            </button>
          ))}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', margin: '12px 0' }} />
          <button onClick={goMarketplace}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14,
              fontWeight: 600, color: '#C9A24E', background: 'rgba(201,162,78,0.1)', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A24E" strokeWidth="2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
            Marketplace
            <span style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 8px', borderRadius: 20, background: 'linear-gradient(135deg,#D9822B,#C9A24E)', color: '#FFF', fontWeight: 700 }}>NOVO</span>
          </button>
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          {session && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#9A7BEA,#7A5BD1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontSize: 12, fontWeight: 700 }}>
                {session.nome?.charAt(0).toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, color: '#FFFFFF', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.nome}</div>
                <div style={{ fontSize: 10, color: '#C9D4DE' }}>{session.plano || 'gratis'}</div>
              </div>
            </div>
          )}
          <button onClick={handleLogout}
            style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', backgroundColor: 'transparent', color: '#F2A6A6', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sair
          </button>
          <div style={{ marginTop: 10, fontSize: 11, color: '#C9B6E8', textAlign: 'center' }}>v1.0.0 &middot; NEXLOG EXPRESS</div>
        </div>
      </aside>
      <main style={{ flex: 1, marginTop: isMobile ? 48 : 0, overflowY: 'auto', minHeight: isMobile ? 'calc(100vh - 48px)' : '100vh' }}>
        <div style={{ padding: isMobile ? 14 : 32, maxWidth: 1400, margin: '0 auto' }}>
          {currentPage === 'dashboard' && renderDashboard()}
          {currentPage === 'diario' && renderDiario()}
          {currentPage === 'roteirizador' && renderRoteirizador()}
          {currentPage === 'rastreamento' && renderRastreamento()}
          {currentPage === 'marketplace' && renderMarketplace()}
          {currentPage === 'calculadora' && renderCalculadora()}
          {currentPage === 'clientes' && renderClientes()}
          {currentPage === 'historico' && renderHistorico()}
          {currentPage === 'pedagios' && renderPedagios()}
          {currentPage === 'admin' && renderAdmin()}
        </div>
      </main>
      </>
      )}
      {showInstallBanner && (
        <div style={{ position: 'fixed', bottom: 20, left: 20, right: 20, zIndex: 9999, backgroundColor: '#FFFFFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: 16, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', maxWidth: 400, margin: '0 auto' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#45215F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D9822B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>Instalar NEXLOG</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>Instale como app para melhor experiencia</div>
          </div>
          <button onClick={handleInstallApp} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#D9822B,#C9A24E)', color: '#FFF', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Instalar</button>
          <button onClick={() => setShowInstallBanner(false)} style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', display: 'flex' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
      {showClientModal && renderClientModal()}
      {showTollModal && renderTollModal()}
      {budgetModalOpen && renderBudgetModal()}
      {showAuthModal && renderAuthModal()}
      {showOcrModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E2E8F0', padding: 24, maxWidth: 500, width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px', color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9A7BEA" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Ler Documento (CTe)
            </h3>
            {!ocrImage ? (
              <>
                <p style={{ fontSize: 14, color: '#64748B', marginBottom: 20 }}>Tire uma foto do CTe ou envie uma imagem para extrair os endereços automaticamente.</p>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 40, border: '2px dashed #E2E8F0', borderRadius: 12, cursor: 'pointer', color: '#64748B', fontSize: 14 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <span style={{ fontWeight: 600, color: '#9A7BEA' }}>Clique para selecionar foto</span>
                  <span>ou tire uma foto agora</span>
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOcrImage(f); }} />
                </label>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <input type="file" accept="image/*" id="ocr-upload" style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOcrImage(f); }} />
                  <button onClick={() => document.getElementById('ocr-upload')?.click()}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'transparent', color: '#1E293B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                    Enviar da galeria
                  </button>
                  <button onClick={() => setShowOcrModal(false)}
                    style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#DE6A6A', color: '#FFF', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : ocrProcessing ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#9A7BEA', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <div style={{ color: '#64748B', fontSize: 14, marginBottom: 8 }}>{ocrProgress || 'Processando...'}</div>
                {ocrImage && <img src={ocrImage} alt="documento" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginTop: 8 }} />}
              </div>
            ) : (
              <div>
                {ocrLines.length > 0 ? (
                  <div>
                    <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Toque na linha de <strong style={{ color: '#9A7BEA' }}>ORIGEM</strong> e na linha de <strong style={{ color: '#D9822B' }}>DESTINO</strong>:</p>
                    <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 12, border: '1px solid #E2E8F0', borderRadius: 8 }}>
                      {ocrLines.map((line, i) => (
                        <div key={i} onClick={() => {
                          if (ocrSelectedOrigin === i) { setOcrSelectedOrigin(-1); return; }
                          if (ocrSelectedDest === i) { setOcrSelectedDest(-1); return; }
                          if (ocrSelectedOrigin < 0) setOcrSelectedOrigin(i);
                          else if (ocrSelectedDest < 0) setOcrSelectedDest(i);
                        }}
                          style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            fontSize: 14,
                            color: '#1E293B',
                            fontFamily: 'monospace',
                            borderBottom: i < ocrLines.length - 1 ? '1px solid #E2E8F0' : 'none',
                            backgroundColor: ocrSelectedOrigin === i ? 'rgba(154,123,234,0.15)' : ocrSelectedDest === i ? 'rgba(217,130,43,0.15)' : 'transparent',
                            borderLeft: ocrSelectedOrigin === i ? '3px solid #9A7BEA' : ocrSelectedDest === i ? '3px solid #D9822B' : '3px solid transparent',
                            transition: 'all 0.15s',
                          }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{line}</span>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 10,
                              minWidth: 50,
                              textAlign: 'center',
                              backgroundColor: ocrSelectedOrigin === i ? 'rgba(154,123,234,0.3)' : ocrSelectedDest === i ? 'rgba(217,130,43,0.3)' : 'transparent',
                              color: ocrSelectedOrigin === i ? '#9A7BEA' : ocrSelectedDest === i ? '#D9822B' : 'transparent',
                            }}>
                              {ocrSelectedOrigin === i ? 'ORIGEM' : ocrSelectedDest === i ? 'DESTINO' : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={confirmOcrSelection} disabled={ocrSelectedOrigin < 0 || ocrSelectedDest < 0}
                        style={{
                          flex: 1, padding: '12px', borderRadius: 8, border: 'none',
                          background: ocrSelectedOrigin >= 0 && ocrSelectedDest >= 0 ? 'linear-gradient(135deg,#9A7BEA,#7A5BD1)' : '#E2E8F0',
                          color: '#FFF', cursor: ocrSelectedOrigin >= 0 && ocrSelectedDest >= 0 ? 'pointer' : 'default',
                          fontSize: 14, fontWeight: 600, fontFamily: 'inherit', opacity: ocrSelectedOrigin >= 0 && ocrSelectedDest >= 0 ? 1 : 0.5,
                        }}>
                        Confirmar e inserir enderecos
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(ocrResult || ''); }}
                        style={{ padding: '12px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'transparent', color: '#9A7BEA', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                        Copiar
                      </button>
                    </div>
                    <button onClick={() => { setShowOcrModal(false); setOcrImage(null); setOcrResult(null); setOcrLines([]); }}
                      style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: 'transparent', color: '#DE6A6A', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', marginTop: 8 }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div>
                    {ocrResult && ocrResult !== 'Erro ao processar imagem' ? (
                      <div>
                        <div style={{ color: '#DE6A6A', fontSize: 14, marginBottom: 12 }}>
                          Nenhuma linha de texto identificada
                        </div>
                        <textarea readOnly value={ocrResult} rows={5}
                          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#1E293B', fontSize: 12, fontFamily: 'monospace', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                      </div>
                    ) : (
                      <div style={{ color: '#DE6A6A', fontSize: 14, marginBottom: 12 }}>
                        {ocrResult || 'Nao foi possivel processar a imagem'}
                      </div>
                    )}
                    <button onClick={() => { setShowOcrModal(false); setOcrImage(null); setOcrResult(null); setOcrLines([]); }}
                      style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: '#E2E8F0', color: '#1E293B', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                      Tentar novamente
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 999999, backgroundColor: '#2FA77E', color: '#FFFFFF', padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(47,167,126,0.3)', animation: 'fadeInUp 0.3s ease' }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
