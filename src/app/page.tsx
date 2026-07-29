"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useJsApiLoader, GoogleMap, Marker, Polyline } from '@react-google-maps/api';

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';

const containerStyle = { width: '100%', height: '100%' };

const darkMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1D0F38' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1D0F38' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A7AA8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2D1B4E' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#E8ECF0' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0F0720' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#251540' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#251540' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

type Page = 'landing' | 'dashboard' | 'roteirizador' | 'calculadora' | 'clientes' | 'historico' | 'pedagios' | 'marketplace' | 'rastreamento';
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
  return new Promise(resolve => {
    const addr = address.replace(/ - /g, ', ') + ', Brazil';
    if (typeof google !== 'undefined' && google.maps?.Geocoder) {
      new google.maps.Geocoder().geocode({ address: addr }, (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          resolve({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() });
        } else {
          resolve(null);
        }
      });
    } else {
      fetch('https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(addr) + '&key=' + GMAPS_KEY)
        .then(r => r.json())
        .then(data => {
          if (data.status === 'OK' && data.results.length > 0) {
            resolve({ lat: data.results[0].geometry.location.lat, lng: data.results[0].geometry.location.lng });
          } else {
            resolve(null);
          }
        })
        .catch(() => resolve(null));
    }
  });
}

async function getRouteFromGoogle(origin: string, destination: string, waypoints: string[]): Promise<any> {
  try {
    const fmt = (s: string) => s.replace(/ - /g, ', ');
    const wp = waypoints.map(w => 'via:' + encodeURIComponent(fmt(w))).join('|');
    const url = 'https://maps.googleapis.com/maps/api/directions/json?origin=' + encodeURIComponent(fmt(origin)) + '&destination=' + encodeURIComponent(fmt(destination)) + (wp ? '&waypoints=optimize:false|' + wp : '') + '&key=' + GMAPS_KEY + '&region=br&language=pt-BR';
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status === 'OK' && data.routes.length > 0) return data.routes[0];
    return null;
  } catch { return null; }
}


function AddressInput({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  const [suggestions, setSuggestions] = useState<{ description: string }[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const timerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => { document.removeEventListener('mousedown', handler); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

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
        const resp = await fetch('/api/autocomplete?q=' + encodeURIComponent(val) + (cityHint ? '&city=' + encodeURIComponent(cityHint) : ''));
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
      <input value={value} onChange={(e) => handleInput(e.target.value)} placeholder={placeholder}
        style={{ ...style, width: '100%', fontSize: 16 }} />
      {showDrop && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#15092E', border: '1px solid #251540', borderRadius: 8, marginTop: 4, zIndex: 100, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {suggestions.map((s, i) => (
            <div key={i} onClick={() => handleSelect(s.description)}
              style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 13, color: '#E8ECF0', borderBottom: i < suggestions.length - 1 ? '1px solid #251540' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(110,47,217,0.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <span><Icon name="map-pin" size={12} color="#6E2FD9" /> {s.description}</span>
              {numBadge && <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'linear-gradient(135deg,#FF7A1A,#FFB627)', color: '#FFF', fontWeight: 700, whiteSpace: 'nowrap' }}>nº {numBadge}</span>}
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
};

function Icon({ name, size = 20, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || '' }} style={{ flexShrink: 0 }} />
  );
}

function TruckSVG({ size = 22, color = '#9B5CF0' }: { size?: number; color?: string }) {
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
    <div style={{ background: '#10161D', border: '1px solid #1E2731', borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' as const }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#F4F7F8' }}>{faq.q}</span>
        <span style={{ fontSize: 18, color: '#7C8A96', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && <div style={{ padding: '0 20px 16px', fontSize: 13, color: '#7C8A96', lineHeight: 1.7 }}>{faq.a}</div>}
    </div>
  );
}

function NexLogLogo({ sidebar = false, mobile = false }: { sidebar?: boolean; mobile?: boolean }) {
  const w = mobile ? 200 : sidebar ? 180 : 320;
  return (
    <img src="/logo.jpg" alt="NEXLOG" style={{ width: w, height: 'auto', objectFit: 'contain' }} />
  );
}

export default function NexLogExpress() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [addresses, setAddresses] = useState<string[]>(['', '']);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
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

  const [session, setSession] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', senha: '', nome: '', telefone: '', cnpj: '' });
  const [authError, setAuthError] = useState('');
  const [mkPage, setMkPage] = useState<MkPage>('fretes');
  const [fretes, setFretes] = useState<Freight[]>([]);
  const [freightForm, setFreightForm] = useState({ origem: '', destino: '', tipo: 'Carga Seca', peso: '', valor: '', coleta: '', entrega: '', contato: '', observacao: '' });
  const [freightImage, setFreightImage] = useState<string>('');
  const [mkPlan, setMkPlan] = useState<'gratis' | 'profissional' | 'premium'>('gratis');
  const [userPlan, setUserPlan] = useState<'gratis' | 'profissional' | 'premium'>('gratis');
  const [freightSearch, setFreightSearch] = useState('');

  const mapRef = useRef<google.maps.Map | null>(null);

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

  const { isLoaded: gmapsLoaded } = useJsApiLoader({ googleMapsApiKey: GMAPS_KEY || '' });

  useEffect(() => {
    if (mapRef.current && geocodedCoords.length > 0) fitMapBounds(mapRef.current);
  }, [geocodedCoords]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = '@media print{body>*{display:none!important}.budget-print{display:block!important;position:fixed;top:0;left:0;right:0;background:white!important;padding:40px!important;z-index:999999;box-sizing:border-box;width:100%}.budget-print *{color:#111!important;border-color:#ddd!important;background:transparent!important}}';
    document.head.appendChild(style);
    return () => { if (style.parentNode) style.parentNode.removeChild(style); };
  }, []);

  const navItems = [
    { id: 'dashboard' as Page, label: 'Dashboard', icon: 'grid' },
    { id: 'roteirizador' as Page, label: 'Roteirizador', icon: 'map-pin' },
    { id: 'rastreamento' as Page, label: 'Rastreamento', icon: 'target' },
    { id: 'calculadora' as Page, label: 'Calculadora de Frete', icon: 'calculator' },
    { id: 'pedagios' as Page, label: 'Pedagios', icon: 'route' },
    { id: 'clientes' as Page, label: 'Clientes', icon: 'users' },
    { id: 'historico' as Page, label: 'Historico', icon: 'clock' },
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

  const handleLogout = () => { localStorage.removeItem('nexlog_session'); setSession(null); setCurrentPage('dashboard'); };

  const handleAuth = async () => {
    setAuthError('');
    if (authTab === 'register') {
      if (!authForm.nome || !authForm.email || !authForm.senha) { setAuthError('Preencha nome, email e senha'); return; }
      const users = JSON.parse(localStorage.getItem('nexlog_users') || '[]');
      if (users.find((u: any) => u.email === authForm.email)) { setAuthError('Email ja cadastrado'); return; }
      const newUser = { ...authForm, id: Date.now().toString(), plano: 'gratis' as const, createdAt: new Date().toISOString() };
      users.push(newUser);
      localStorage.setItem('nexlog_users', JSON.stringify(users));
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
    const modeParam = mode ? '&travelmode=' + mode : '';
    return base + originParam + destParam + wpParam + modeParam;
  };

  const allAddresses = useMemo(() => [pontoPartida, ...addresses].filter(Boolean), [pontoPartida, addresses]);

  const fitMapBounds = (map: google.maps.Map) => {
    if (geocodedCoords.length === 0) return;
    const bounds = new window.google.maps.LatLngBounds();
    geocodedCoords.forEach(c => bounds.extend(c));
    if (geocodedCoords.length === 1) {
      map.setCenter(geocodedCoords[0]);
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, 50);
    }
  };

  const addAddress = () => setAddresses([...addresses, '']);
  const removeAddress = (index: number) => { if (addresses.length > 2) setAddresses(addresses.filter((_, i) => i !== index)); };
  const updateAddress = (index: number, value: string) => { const next = [...addresses]; next[index] = value; setAddresses(next); };
  const moveAddress = (from: number, to: number) => {
    if (to < 0 || to >= addresses.length) return;
    const next = [...addresses];
    const item = next.splice(from, 1)[0];
    next.splice(to, 0, item);
    setAddresses(next);
  };

  const calculateRoute = async () => {
    if (!pontoPartida.trim()) { alert('Informe o ponto de partida'); return; }
    const valid = addresses.filter(a => a.trim());
    if (valid.length < 1) { alert('Adicione pelo menos 1 destino'); return; }
    setIsCalculating(true);
    setRouteResult(null);
    setGeocodedCoords([]);
    try {
      const allPts = [pontoPartida.trim(), ...valid];
      const coords: { lat: number; lng: number }[] = [];
      for (let i = 0; i < allPts.length; i++) {
        const c = await geocodeAddress(allPts[i]);
        if (!c) { alert('Nao foi possivel geocodificar: "' + allPts[i] + '"'); setIsCalculating(false); return; }
        coords.push(c);
        if (i < allPts.length - 1) await new Promise(r => setTimeout(r, 300));
      }
      setGeocodedCoords(coords);
      const waypoints = allPts.slice(1, -1);
      const routeForward = await getRouteFromGoogle(allPts[0], allPts[allPts.length - 1], waypoints);
      if (!routeForward) { alert('Nao foi possivel calcular a rota'); setIsCalculating(false); return; }
      const routeReturn = await getRouteFromGoogle(allPts[allPts.length - 1], allPts[0], []);
      const totalKm = allPts.length > 2
        ? routeForward.legs.reduce((s: number, l: any) => s + l.distance.value, 0) / 1000 + (routeReturn ? routeReturn.legs[0].distance.value / 1000 : 0)
        : routeForward.legs.reduce((s: number, l: any) => s + l.distance.value, 0) / 1000;
      const totalHours = allPts.length > 2
        ? routeForward.legs.reduce((s: number, l: any) => s + l.duration.value, 0) / 3600 + (routeReturn ? routeReturn.legs[0].duration.value / 3600 : 0)
        : routeForward.legs.reduce((s: number, l: any) => s + l.duration.value, 0) / 3600;
      const segments: Segment[] = [];
      for (let i = 0; i < routeForward.legs.length; i++) {
        const leg = routeForward.legs[i];
        segments.push({ from: allPts[i], to: allPts[i + 1], km: leg.distance.value / 1000, hours: leg.duration.value / 3600, toll: 0 });
      }
      if (routeReturn) {
        segments.push({ from: allPts[allPts.length - 1], to: allPts[0], km: routeReturn.legs[0].distance.value / 1000, hours: routeReturn.legs[0].duration.value / 3600, toll: 0 });
      }
      setRouteResult({ totalKm, totalHours, segments, geometry: coords, coords, addresses: allPts, totalPedagio: 0 });
    } catch { alert('Erro ao calcular rota'); }
    setIsCalculating(false);
  };

  const clearRoute = () => { setPontoPartida(''); setAddresses(['', '']); setRouteResult(null); setGeocodedCoords([]); };

  const startTracking = () => {
    if (!navigator.geolocation) { alert('Geolocalizacao nao disponivel'); return; }
    setTrackingAtivo(true);
    setTrackingHistory([]);
    trackingRouteRef.current = 'Rota ' + new Date().toLocaleString('pt-BR');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setTrackingPos(p);
        setTrackingHistory(prev => [...prev, { ...p, ts: Date.now() }]);
      },
      (err) => { console.error('Erro GPS:', err.message); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTrackingAtivo(false);
    const rotas = JSON.parse(localStorage.getItem('nexlog_rotas') || '[]');
    rotas.unshift({ id: Date.now().toString(), nome: trackingRouteRef.current, pontos: trackingHistory, data: new Date().toISOString() });
    localStorage.setItem('nexlog_rotas', JSON.stringify(rotas));
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

  const shareBudget = () => {
    if (!budgetData) return;
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
    lines.push(' Obrigado pela confianca! 🏻');
    lines.push('');
    lines.push('_NEXLOG EXPRESS - Sua rota, seu jeito._');
    const text = lines.join('\n');
    if (navigator.share) {
      navigator.share({ title: 'NEXLOG EXPRESS - Orcamento', text }).catch(() => {
        navigator.clipboard.writeText(text).then(() => alert('Orcamento copiado! Cole no WhatsApp.'));
      });
    } else {
      navigator.clipboard.writeText(text).then(() => alert('Orcamento copiado! Cole no WhatsApp.'));
    }
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
      const raw = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone, message: lines.join('\n') }),
      }).then(r => r.text());
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
    background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  };

  const renderLanding = () => (
    <div style={{ minHeight: '100vh', background: '#0B0F14', overflowX: 'hidden' }}>
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
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: '#0B0F14DD', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1E2731' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '18px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/logo.jpg" alt="NEXLOG" style={{ height: 84, width: 'auto', borderRadius: 8 }} />
            <span style={{ fontWeight: 700, fontSize: 24, color: '#F4F7F8' }}>NEX<span style={{ background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LOG</span></span>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <a href="#recursos" style={{ color: '#7C8A96', fontSize: 16, textDecoration: 'none' }}>Recursos</a>
            <a href="#precos" style={{ color: '#7C8A96', fontSize: 16, textDecoration: 'none', marginLeft: 16 }}>Preços</a>
            <a href="#depoimentos" style={{ color: '#7C8A96', fontSize: 16, textDecoration: 'none', marginLeft: 16 }}>Depoimentos</a>
            <button onClick={() => { setAuthTab('login'); setShowAuthModal(true); }} style={{ marginLeft: 16, padding: '14px 32px', background: 'transparent', border: '1px solid #1E2731', borderRadius: 10, color: '#F4F7F8', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>Entrar</button>
            <button onClick={() => { setAuthTab('register'); setShowAuthModal(true); }} style={{ padding: '14px 32px', background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)', border: 'none', borderRadius: 10, color: '#FFF', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Criar conta</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1600, margin: '0 auto', padding: '120px 32px 50px', textAlign: 'center', position: 'relative' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9B5CF0', marginBottom: 20 }}>PLATAFORMA LOGÍSTICA COMPLETA</div>
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 40 }}>
          <div style={{ position: 'absolute', inset: -24, borderRadius: '50%', border: '2px solid #6E2FD9', animation: 'pulse-ring 2.4s ease-out infinite', opacity: 0.4 }} />
          <img src="/logo.jpg" alt="NEXLOG" style={{ width: 240, height: 240, borderRadius: 24, position: 'relative', zIndex: 1 }} />
        </div>
        <h1 style={{ fontSize: 'clamp(42px, 8vw, 88px)', fontWeight: 700, lineHeight: 1.1, maxWidth: 1100, margin: '0 auto 24px', color: '#F4F7F8' }}>
          Sua Frota,{' '}
          <span style={{ background: 'linear-gradient(135deg, #FF7A1A, #FFB627)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Inteligente</span>
          <br />Seu Negócio,{' '}
          <span style={{ background: 'linear-gradient(135deg, #9B5CF0, #6E2FD9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Conectado</span>
        </h1>
        <p style={{ fontSize: 22, color: '#7C8A96', maxWidth: 900, margin: '0 auto 40px', lineHeight: 1.7 }}>
          Plataforma completa para gestão de fretes, rotas inteligentes, orçamentos instantâneos e marketplace logístico — tudo em um só lugar.
        </p>
        <div className="lp-hero-btns">
          <button onClick={() => { setAuthTab('register'); setShowAuthModal(true); }} style={{ padding: '20px 48px', background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)', border: 'none', borderRadius: 14, color: '#FFF', fontWeight: 700, fontSize: 19, cursor: 'pointer' }}>Começar Grátis</button>
          <button onClick={() => { document.getElementById('recursos')?.scrollIntoView({ behavior: 'smooth' }); }} style={{ padding: '20px 48px', background: 'transparent', border: '1px solid #1E2731', borderRadius: 14, color: '#7C8A96', fontWeight: 500, fontSize: 19, cursor: 'pointer' }}>Como Funciona</button>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px 80px' }}>
        <div style={{ background: '#10161D', border: '1px solid #1E2731', borderRadius: 20, padding: 32, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF5050' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FFB020' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#6E2FD9' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'KM Rodados', value: '12.458', color: '#FF7A1A', icon: '🛞' },
              { label: 'Entregas', value: '847', color: '#6E2FD9', icon: '✅' },
              { label: 'Rotas Ativas', value: '12', color: '#00E0B8', icon: '🗺️' },
              { label: 'Economia', value: 'R$ 3.240', color: '#FFB020', icon: '💰' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#0B0F14', borderRadius: 12, padding: '18px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#7C8A96' }}>{s.label}</span>
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginTop: 6 }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#0B0F14', borderRadius: 12, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            <svg width="100%" height="260" viewBox="0 0 600 260" style={{ position: 'absolute', opacity: 0.15 }}>
              <path d="M0 150 Q150 100 300 130 Q450 160 600 80" stroke="#6E2FD9" strokeWidth="2" fill="none"/>
              <circle cx="120" cy="120" r="8" fill="#6E2FD9"/>
              <circle cx="250" cy="135" r="8" fill="#FF7A1A"/>
              <circle cx="380" cy="145" r="8" fill="#6E2FD9"/>
              <circle cx="480" cy="100" r="8" fill="#FFB020"/>
            </svg>
            <div style={{ position: 'relative', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🗺️</div>
              <div style={{ fontSize: 15, color: '#7C8A96' }}>Mapa de rotas em tempo real</div>
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
            <div key={i} style={{ textAlign: 'center', padding: '24px 16px', background: '#10161D', border: '1px solid #1E2731', borderRadius: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 700, background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.value}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F4F7F8', marginTop: 6 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#7C8A96', marginTop: 4 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Como Funciona */}
      <section id="recursos" className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9B5CF0', marginBottom: 8 }}>PASSO A PASSO</div>
          <h2 style={{ fontSize: 42, fontWeight: 700, color: '#F4F7F8', marginBottom: 14 }}>Como funciona a NEXLOG</h2>
          <p style={{ fontSize: 19, color: '#7C8A96', maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>Em 4 passos simples, você gerencia suas rotas e fretes como nunca.</p>
        </div>
        <div className="lp-grid-4">
          {[
            { step: '01', icon: '📋', title: 'Cadastre Clientes', desc: 'Adicione seus clientes com endereços e dados de contato. Tudo organizado em um só lugar.' },
            { step: '02', icon: '📍', title: 'Crie Rotas', desc: 'Monte roteiros com múltiplos pontos. O sistema calcula KM, tempo e otimiza o trajeto.' },
            { step: '03', icon: '💰', title: 'Calcule Fretes', desc: 'Precifique fretes com precisão: KM, pedágios, peso e tipo de veículo.' },
            { step: '04', icon: '📊', title: 'Acompanhe Tudo', desc: 'Histórico completo de rotas, fretes e orçamentos. Relatórios detalhados.' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#10161D', border: '1px solid #1E2731', borderRadius: 14, padding: 24, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 16, right: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 48, fontWeight: 800, color: '#6E2FD9', opacity: 0.1 }}>{s.step}</div>
              <div style={{ fontSize: 42, marginBottom: 16 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#F4F7F8', marginBottom: 10 }}>{s.title}</div>
              <div style={{ fontSize: 16, color: '#7C8A96', lineHeight: 1.7 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Funcionalidades */}
      <section id="features" className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#FF7A1A', marginBottom: 8 }}>FUNCIONALIDADES</div>
          <h2 style={{ fontSize: 42, fontWeight: 700, color: '#F4F7F8', marginBottom: 14 }}>Tudo que você precisa</h2>
          <p style={{ fontSize: 19, color: '#7C8A96', maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>Ferramentas profissionais para transportadores e motoristas autônomos.</p>
        </div>
        <div className="lp-grid-2">
          {[
            { icon: '🗺️', title: 'Roteirizador Inteligente', desc: 'Calcule rotas com múltiplos pontos de entrega, otimizando KM e tempo. Visualização no mapa e exportação.', color: '#6E2FD9' },
            { icon: '🧮', title: 'Calculadora de Frete', desc: 'Precifique fretes com precisão considerando KM, pedágios, peso e tipo de veículo. Orçamentos profissionais.', color: '#FF7A1A' },
            { icon: '📦', title: 'Marketplace de Fretes', desc: 'Anuncie e encontre fretes em todo o Brasil. Planos com recursos exclusivos para alavancar seu negócio.', color: '#FFB020' },
            { icon: '👥', title: 'Gestão de Clientes', desc: 'Cadastro completo com histórico de fretes, orçamentos e dados de contato. Tudo organizado.', color: '#00E0B8' },
            { icon: '📈', title: 'Histórico Completo', desc: 'Todas as rotas, orçamentos e entregas registrados com status, valores e detalhes para consulta.', color: '#6E2FD9' },
            { icon: '💬', title: 'WhatsApp Integrado', desc: 'Envie orçamentos e atualizações diretamente por WhatsApp com um clique. Comunicação instantânea.', color: '#22B07D' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#10161D', border: '1px solid #1E2731', borderRadius: 14, padding: 24, borderLeft: `3px solid ${f.color}` }}>
              <div style={{ fontSize: 38, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#F4F7F8', marginBottom: 10 }}>{f.title}</div>
              <div style={{ fontSize: 16, color: '#7C8A96', lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Seguranca / Diferenciais */}
      <section className="lp-section">
        <div style={{ background: 'linear-gradient(135deg, #10161D, rgba(110,47,217,0.05))', border: '1px solid #1E2731', borderRadius: 24, padding: '60px 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48, alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9B5CF0', marginBottom: 14 }}>DIFERENCIAIS</div>
            <h2 style={{ fontSize: 34, fontWeight: 700, color: '#F4F7F8', marginBottom: 16, lineHeight: 1.2 }}>Por que escolher a NEXLOG?</h2>
            <p style={{ fontSize: 16, color: '#7C8A96', lineHeight: 1.7, marginBottom: 24 }}>
              Somos a plataforma mais completa para gestão logística. Do roteirizador ao marketplace de fretes, tudo que você precisa em um só lugar.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['Roteirizador com Google Maps e otimização de rotas', 'Calculadora de frete com pedágios e peso', 'Marketplace para anunciar e encontrar fretes', 'Gestão completa de clientes e histórico', 'Orçamentos profissionais com envio via WhatsApp'].map((item, i) => (
                <div key={i} className="lp-check-row">
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: 'rgba(110,47,217,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: '#6E2FD9' }}>✓</span>
                  </div>
                  <span style={{ fontSize: 13, color: '#F4F7F8' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 220, height: 220, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(110,47,217,0.15), rgba(255,122,26,0.15))', border: '2px solid rgba(110,47,217,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '1px solid rgba(110,47,217,0.1)' }} />
              <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: '1px solid rgba(110,47,217,0.05)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🚛</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#9B5CF0' }}>NEXLOG</div>
                <div style={{ fontSize: 12, color: '#7C8A96' }}>Solução Completa</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section id="depoimentos" className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#FF7A1A', marginBottom: 8 }}>DEPOIMENTOS</div>
          <h2 style={{ fontSize: 42, fontWeight: 700, color: '#F4F7F8', marginBottom: 14 }}>O que nossos clientes dizem</h2>
          <p style={{ fontSize: 19, color: '#7C8A96', maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>Centenas de transportadores e motoristas confiam na NEXLOG.</p>
        </div>
        <div className="lp-grid-3">
          {[
            { name: 'Carlos Mendes', role: 'Transportador Autônomo', text: 'Uso o roteirizador todos os dias. Economizo horas de planejamento e meus clientes adoram os orçamentos profissionais via WhatsApp.', avatar: 'CM', rating: 5 },
            { name: 'Fernanda Oliveira', role: 'Gerente de Frota', text: 'Reduzimos 30% nos custos de combustível com as rotas otimizadas. O marketplace também nos ajudou a encontrar fretes de retorno.', avatar: 'FO', rating: 5 },
            { name: 'Ricardo Santos', role: 'Empresa de Logística', text: 'A calculadora de frete com pedágios integrada salvou nossa equipe. Agora precificamos em segundos com precisão total.', avatar: 'RS', rating: 5 },
          ].map((d, i) => (
            <div key={i} style={{ background: '#10161D', border: '1px solid #1E2731', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                {Array.from({ length: d.rating }).map((_, j) => (
                  <span key={j} style={{ color: '#FFB020', fontSize: 14 }}>★</span>
                ))}
              </div>
              <p style={{ fontSize: 13, color: '#7C8A96', lineHeight: 1.7, marginBottom: 16, fontStyle: 'italic' }}>&ldquo;{d.text}&rdquo;</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#FFF', flexShrink: 0 }}>{d.avatar}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F4F7F8' }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: '#7C8A96' }}>{d.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="precos" className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9B5CF0', marginBottom: 8 }}>PLANOS</div>
          <h2 style={{ fontSize: 42, fontWeight: 700, color: '#F4F7F8', marginBottom: 14 }}>Escolha o plano ideal</h2>
          <p style={{ fontSize: 19, color: '#7C8A96', maxWidth: 700, margin: '0 auto', lineHeight: 1.7 }}>Comece grátis e escale conforme sua necessidade.</p>
        </div>
        <div className="lp-grid-3">
          {[
            { name: 'Grátis', price: 'R$ 0', period: 'para sempre', desc: 'Ideal para testes e uso básico', features: ['Fretes básicos', 'Roteirizador', 'Calculadora de frete', 'Suporte por e-mail'], color: '#7C8A96', popular: false },
            { name: 'Profissional', price: 'R$ 30', period: '/mês', desc: 'Para quem precisa de mais recursos', features: ['Fretes ilimitados', 'Suporte prioritário', 'Destaque nos resultados', 'Sem anúncios', 'Relatórios avançados'], color: '#6E2FD9', popular: true },
            { name: 'Premium', price: 'R$ 50', period: '/mês', desc: 'Gestão completa com tudo incluso', features: ['Fretes ilimitados', 'Suporte VIP 24h', 'Destaque dourado', 'Fotos nos anúncios', 'Prioridade total', 'Integração completa'], color: '#FFB020', popular: false },
          ].map((p, i) => (
            <div key={i} style={{ background: '#10161D', border: `1px solid ${p.popular ? '#6E2FD9' : '#1E2731'}`, borderRadius: 16, padding: 28, position: 'relative' }}>
              {p.popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '4px 16px', background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#FFF' }}>MAIS POPULAR</div>}
              <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: p.popular ? 12 : 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: p.color, marginBottom: 8 }}>{p.name}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#F4F7F8' }}>{p.price}</div>
                <div style={{ fontSize: 13, color: '#7C8A96' }}>{p.period}</div>
                <div style={{ fontSize: 12, color: '#7C8A96', marginTop: 6 }}>{p.desc}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {p.features.map((f, j) => (
                  <div key={j} className="lp-check-row">
                    <span style={{ color: p.color, fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 13, color: '#F4F7F8' }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { setAuthTab('register'); setShowAuthModal(true); }} style={{ width: '100%', padding: '12px 0', background: p.popular ? 'linear-gradient(135deg, #6E2FD9, #FF7A1A)' : 'transparent', border: p.popular ? 'none' : '1px solid #1E2731', borderRadius: 10, color: p.popular ? '#FFF' : '#7C8A96', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {p.price === 'R$ 0' ? 'Começar Grátis' : 'Escolher Plano'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section">
        <div className="lp-title">
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#FF7A1A', marginBottom: 8 }}>PERGUNTAS FREQUENTES</div>
          <h2 style={{ fontSize: 42, fontWeight: 700, color: '#F4F7F8', marginBottom: 14 }}>Dúvidas? Respostas.</h2>
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
        <div style={{ background: 'linear-gradient(135deg, rgba(110,47,217,0.12), rgba(255,122,26,0.08))', border: '1px solid rgba(110,47,217,0.3)', borderRadius: 24, padding: '80px 56px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9B5CF0', marginBottom: 14 }}>COMECE AGORA</div>
          <h2 style={{ fontSize: 42, fontWeight: 700, color: '#F4F7F8', marginBottom: 18 }}>Pronto para otimizar sua logística?</h2>
          <p style={{ fontSize: 19, color: '#7C8A96', marginBottom: 36, lineHeight: 1.7, maxWidth: 700, margin: '0 auto 36px' }}>
            Crie sua conta gratuitamente e descubra como a NEXLOG pode transformar a gestão da sua frota.
          </p>
          <div className="lp-hero-btns">
            <button onClick={() => { setAuthTab('register'); setShowAuthModal(true); }} style={{ padding: '20px 48px', background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)', border: 'none', borderRadius: 14, color: '#FFF', fontWeight: 700, fontSize: 19, cursor: 'pointer' }}>Criar Conta Grátis</button>
            <button onClick={() => { setAuthTab('login'); setShowAuthModal(true); }} style={{ padding: '20px 48px', background: 'transparent', border: '1px solid #1E2731', borderRadius: 14, color: '#7C8A96', fontWeight: 500, fontSize: 19, cursor: 'pointer' }}>Já tenho conta</button>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Cadastro grátis', 'Sem cartão de crédito', 'Cancelamento livre'].map((t, i) => (
              <div key={i} className="lp-check-row">
                <span style={{ color: '#6E2FD9', fontSize: 12 }}>✓</span>
                <span style={{ fontSize: 12, color: '#7C8A96' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #1E2731', padding: '40px 32px', background: '#10161D' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 48, marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <img src="/logo.jpg" alt="NEXLOG" style={{ height: 72, width: 'auto', borderRadius: 8 }} />
              <span style={{ fontWeight: 700, fontSize: 22, color: '#F4F7F8' }}>NEX<span style={{ background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LOG</span></span>
            </div>
            <p style={{ fontSize: 14, color: '#7C8A96', lineHeight: 1.7 }}>A plataforma definitiva para gestão de fretes, rotas inteligentes e marketplace logístico.</p>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#F4F7F8', marginBottom: 12 }}>Plataforma</div>
            {['Roteirizador', 'Calculadora de Frete', 'Marketplace', 'Gestão de Clientes'].map((l, i) => (
              <div key={i} style={{ fontSize: 14, color: '#7C8A96', marginBottom: 8, cursor: 'pointer' }}>{l}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#F4F7F8', marginBottom: 12 }}>Empresa</div>
            {['Sobre Nós', 'Termos de Uso', 'Privacidade', 'Contato'].map((l, i) => (
              <div key={i} style={{ fontSize: 14, color: '#7C8A96', marginBottom: 8, cursor: 'pointer' }}>{l}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#F4F7F8', marginBottom: 12 }}>Suporte</div>
            <div style={{ fontSize: 14, color: '#7C8A96', marginBottom: 8 }}>contato@nexlog.com.br</div>
            <div style={{ fontSize: 14, color: '#7C8A96', marginBottom: 8 }}>WhatsApp: (11) 99999-9999</div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #1E2731', paddingTop: 20, textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#7C8A96' }}>
          <span style={{ background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NEXLOG</span> &copy; 2026 — Gestão logística inteligente.
        </div>
      </footer>
    </div>
  );

  const renderDashboard = () => (
    <div>
      <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Dashboard</h1>
      <p className="page-subtitle" style={{ color: '#8A7AA8', marginBottom: 32 }}>Visao geral do seu negocio</p>
      <div className="stat-cards" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total de Rotas', value: String(totalRoutes), icon: 'route', color: '#6E2FD9', bg: 'rgba(110,47,217,0.15)' },
          { label: 'Total de Clientes', value: String(totalClients), icon: 'users', color: '#FF7A1A', bg: 'rgba(255,122,26,0.15)' },
          { label: 'KM Total Rodado', value: totalKmHistory.toFixed(0) + ' km', icon: 'map-pin', color: '#FFB627', bg: 'rgba(255,182,39,0.15)' },
          { label: 'Faturamento Total', value: formatCurrency(totalRevenue), icon: 'save', color: '#9B5CF0', bg: 'rgba(155,92,240,0.15)' },
        ].map((card, i) => (
          <div key={i} style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: isMobile ? 16 : 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 10 : 16 }}>
              <span style={{ color: '#8A7AA8', fontSize: isMobile ? 12 : 13 }}>{card.label}</span>
              <div style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, borderRadius: 10, backgroundColor: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={card.icon} size={isMobile ? 16 : 20} color={card.color} />
              </div>
            </div>
            <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>
      <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: isMobile ? 16 : 24 }}>
        <h2 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, marginBottom: isMobile ? 14 : 20 }}>Atividade Recente</h2>
        {recentActivity.length === 0 ? (
          <p style={{ color: '#8A7AA8', textAlign: 'center', padding: isMobile ? 30 : 40 }}>Nenhuma atividade registrada</p>
        ) : (
          recentActivity.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #251540', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: item.status === 'Orcamento' ? 'rgba(255,122,26,0.15)' : 'rgba(155,92,240,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={item.status === 'Orcamento' ? 'alert' : 'check'} size={16} color={item.status === 'Orcamento' ? '#FF7A1A' : '#9B5CF0'} />
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 500 }}>{item.origem} → {item.destino}</div>
                  <div style={{ fontSize: 12, color: '#8A7AA8' }}>{formatDateTime(item.date)}</div>
                </div>
              </div>
              <div style={{ textAlign: isMobile ? 'left' : 'right', paddingLeft: isMobile ? 48 : 0 }}>
                <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{formatCurrency(item.valor)}</div>
                <div style={{ fontSize: 12, color: '#8A7AA8' }}>{item.km.toFixed(1)} km</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderRoteirizador = () => (
    <div>
      <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Roteirizador</h1>
      <p className="page-subtitle" style={{ color: '#8A7AA8', marginBottom: 24 }}>Planeje sua rota de forma inteligente</p>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '380px 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: isMobile ? 16 : 24, height: 'fit-content' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#FF7A1A', fontWeight: 600, marginBottom: 6 }}>
              <Icon name="truck" size={14} color="#FF7A1A" /> Ponto de Partida / Retorno
            </label>
            <AddressInput value={pontoPartida} onChange={setPontoPartida}  placeholder="Ex: Rua das Flores, Porto Alegre"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <span style={{ fontSize: 11, color: '#8A7AA8', marginTop: 3, display: 'block' }}>A rota comeca e termina aqui</span>
          </div>
          <div style={{ borderTop: '1px solid #251540', paddingTop: 14, marginBottom: 14 }}>
            <h2 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, marginBottom: 12 }}>Destinos</h2>
          </div>
          <div style={{ marginBottom: 16 }}>
            {addresses.map((addr, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
                draggable onDragStart={(e) => { e.dataTransfer.setData('idx', String(i)); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); moveAddress(i, parseInt(e.dataTransfer.getData('idx'))); }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#6E2FD9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {letter(i)}
                </div>
                <AddressInput value={addr} onChange={(v) => updateAddress(i, v)}  placeholder={'Destino ' + letter(i)}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                {addresses.length > 1 && (
                  <button onClick={() => removeAddress(i)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addAddress} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed #251540', backgroundColor: 'transparent', color: '#8A7AA8', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16, transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6E2FD9'; e.currentTarget.style.color = '#9B5CF0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#251540'; e.currentTarget.style.color = '#8A7AA8'; }}>
            <Icon name="plus" size={16} /> Adicionar destino
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={calculateRoute} disabled={isCalculating}
              style={{ flex: 1, padding: '12px', borderRadius: 8, ...gradientBtn, cursor: isCalculating ? 'wait' : 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isCalculating ? (
                <><span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} /> Calculando...</>
              ) : (
                <><Icon name="route" size={16} /> Calcular Rota</>
              )}
            </button>
            <button onClick={clearRoute} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #251540', backgroundColor: 'transparent', color: '#8A7AA8', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.color = '#EF4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#251540'; e.currentTarget.style.color = '#8A7AA8'; }}>
              Limpar
            </button>
          </div>
        </div>
        <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', overflow: 'hidden', minHeight: isMobile ? 240 : 450, position: 'relative' }}>
          {gmapsLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: isMobile ? 240 : 450 }}
              center={{ lat: -15.78, lng: -47.93 }}
              zoom={5}
              options={{ styles: darkMapStyle, zoomControl: true, mapTypeControl: false, streetViewControl: false, fullscreenControl: false }}
              onLoad={map => { mapRef.current = map; if (geocodedCoords.length > 0) fitMapBounds(map); }}
            >
              {geocodedCoords.map((coord, i) => (
                <Marker
                  key={i}
                  position={coord}
                  label={{ text: String(i + 1), color: '#fff', fontSize: '12px', fontWeight: '700' }}
                  title={allAddresses[i] || 'Ponto ' + (i + 1)}
                />
              ))}
              {routeResult && routeResult.coords.length > 1 && (
                <Polyline
                  path={routeResult.coords}
                  options={{ strokeColor: '#FF7A1A', strokeWeight: 4, strokeOpacity: 0.9 }}
                />
              )}
            </GoogleMap>
          ) : (
            <div style={{ width: '100%', height: isMobile ? 240 : 450, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A7AA8' }}>
              Carregando mapa...
            </div>
          )}
          {routeResult && (
            <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, display: 'flex', gap: 8 }}>
              <a href={getGoogleMapsUrl(routeResult, pontoPartida)} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: '#4285F4', color: '#FFF', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', textDecoration: 'none', textAlign: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                Abrir no Google Maps
              </a>
              <a href={getGoogleMapsUrl(routeResult, pontoPartida, 'driving')} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#FF7A1A,#FFB627)', color: '#FFF', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', textDecoration: 'none', textAlign: 'center' }}>
                <Icon name="truck" size={16} /> Seguir Rota
              </a>
            </div>
          )}
        </div>
      </div>
      {routeResult && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total KM', value: routeResult.totalKm.toFixed(1) + ' km', color: '#9B5CF0' },
              { label: 'Tempo Estimado', value: formatDuration(routeResult.totalHours), color: '#FF7A1A' },
            ].map((s, i) => (
              <div key={i} style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: 20, textAlign: 'center' }}>
                <div style={{ color: '#8A7AA8', fontSize: 12, marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: isMobile ? 16 : 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, marginBottom: isMobile ? 10 : 16 }}>Detalhes dos Trechos</h3>
            {routeResult.segments.map((seg, i) => (
              <div key={i} className="seg-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < routeResult.segments.length - 1 ? '1px solid #251540' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#6E2FD9', fontSize: isMobile ? 12 : 13, fontWeight: 600 }}>{letter(i)} → {letter((i + 1) % routeResult.addresses.length)}</span>
                  <span style={{ color: '#8A7AA8', fontSize: isMobile ? 12 : 13 }}>{seg.from.length > (isMobile ? 18 : 25) ? seg.from.substring(0, isMobile ? 18 : 25) + '...' : seg.from}</span>
                </div>
                <div className="seg-vals" style={{ display: 'flex', gap: 20, fontSize: isMobile ? 12 : 13 }}>
                  <span style={{ color: '#FFFFFF' }}>{seg.km.toFixed(1)} km</span>
                  <span style={{ color: '#FF7A1A' }}>{formatDuration(seg.hours)}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={() => {
              if (!routeResult) return;
              const pts = [pontoPartida, ...routeResult.addresses].filter(Boolean);
              setHistory(prev => [{ id: generateId(), date: new Date().toISOString(), origem: pts[0], destino: pts[pts.length - 1], km: routeResult.totalKm, valor: 0, status: 'Entregue' }, ...prev]);
            }} style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E676,#00C853)', color: '#FFF', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="check" size={18} /> Entrega Feita
            </button>
            <button onClick={() => {
              if (!routeResult) return;
              const pts = [pontoPartida, ...routeResult.addresses].filter(Boolean);
              setHistory(prev => [{ id: generateId(), date: new Date().toISOString(), origem: pts[0], destino: pts[pts.length - 1], km: routeResult.totalKm, valor: 0, status: 'Recusada' }, ...prev]);
            }} style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#EF4444,#DC2626)', color: '#FFF', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="x" size={18} /> Entrega Recusada
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderCalculadora = () => (
    <div>
      <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Calculadora de Frete</h1>
      <p className="page-subtitle" style={{ color: '#8A7AA8', marginBottom: 24 }}>Adicione os enderecos e calcule o custo total do frete</p>
      <div className="calc-inner-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
        <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: isMobile ? 16 : 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#FF7A1A', fontWeight: 600, marginBottom: 6 }}>
              <Icon name="truck" size={14} color="#FF7A1A" /> Ponto de Partida / Retorno
            </label>
            <AddressInput value={calcPontoPartida} onChange={setCalcPontoPartida}  placeholder="Ex: Rua das Flores, Porto Alegre"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <span style={{ fontSize: 11, color: '#8A7AA8', marginTop: 3, display: 'block' }}>O frete comeca e termina aqui</span>
          </div>
          <div style={{ borderTop: '1px solid #251540', paddingTop: 14, marginBottom: 14 }}>
            <h2 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 600, marginBottom: 0 }}>Destinos</h2>
          </div>
          <div style={{ marginBottom: 12 }}>
            {calcAddresses.map((addr, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#6E2FD9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {letter(i)}
                </div>
                <AddressInput value={addr} onChange={(v) => updateCalcAddress(i, v)}  placeholder={'Endereco ' + letter(i)}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                {calcAddresses.length > 1 && (
                  <button onClick={() => removeCalcAddress(i)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addCalcAddress} style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed #251540', backgroundColor: 'transparent', color: '#8A7AA8', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16, transition: 'all 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6E2FD9'; e.currentTarget.style.color = '#9B5CF0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#251540'; e.currentTarget.style.color = '#8A7AA8'; }}>
            <Icon name="plus" size={16} /> Adicionar destino
          </button>
            <div style={{ borderTop: '1px solid #251540', paddingTop: 16, marginTop: 4 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Dados do Frete</h3>
            <div className="calc-dados-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>Peso (kg) - opcional</label>
                <input type="number" value={calcPeso} onChange={(e) => setCalcPeso(e.target.value)} placeholder="0" min="0" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
               </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>Valor por KM (R$)</label>
                <input type="number" value={calcValorKm} onChange={(e) => setCalcValorKm(e.target.value)} step="0.1" min="0" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>Tipo de Veiculo</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {VEHICLE_TYPES.map(v => (
                  <button key={v} onClick={() => setCalcVeiculo(v)} style={{ padding: '8px 14px', borderRadius: 8, border: calcVeiculo === v ? '1px solid #6E2FD9' : '1px solid #251540', backgroundColor: calcVeiculo === v ? 'rgba(110,47,217,0.15)' : 'transparent', color: calcVeiculo === v ? '#9B5CF0' : '#8A7AA8', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: calcVeiculo === v ? 600 : 400, transition: 'all 0.2s' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>Pedagio Total (R$) - opcional</label>
              <input type="number" value={calcPedagio} onChange={(e) => setCalcPedagio(e.target.value)} placeholder="0" step="0.01" min="0" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button onClick={calculateFreight} disabled={isCalcCalculating}
              style={{ width: '100%', padding: '12px', borderRadius: 8, ...gradientBtn, cursor: isCalcCalculating ? 'wait' : 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isCalcCalculating ? 'Calculando...' : 'Calcular Frete'}
            </button>
          </div>
        </div>
        <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: isMobile ? 16 : 24, height: 'fit-content' }}>
          <h2 style={{ fontSize: isMobile ? 15 : 16, fontWeight: 600, marginBottom: isMobile ? 14 : 20 }}>Resultado</h2>
          {!calcResult ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#8A7AA8' }}>
              <Icon name="calculator" size={48} color="#251540" />
              <p style={{ marginTop: 16 }}>Adicione os enderecos e calcule</p>
            </div>
          ) : (
            <div>
              <div style={{ textAlign: 'center', padding: '32px 0', marginBottom: 20, backgroundColor: 'rgba(255,122,26,0.1)', borderRadius: 12, border: '1px solid rgba(255,122,26,0.2)' }}>
                <div style={{ color: '#8A7AA8', fontSize: 13, marginBottom: 8 }}>Valor Total do Frete</div>
                <div className="calc-total-val" style={{ fontSize: 36, fontWeight: 800, color: '#FF7A1A' }}>{formatCurrency(calcResult.custoTotal)}</div>
              </div>
              {calcResult.km > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #251540' }}>
                    <span style={{ color: '#8A7AA8', fontSize: isMobile ? 13 : 14 }}>KM Total</span>
                    <span style={{ color: '#9B5CF0', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{calcResult.km.toFixed(1)} km</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #251540' }}>
                    <span style={{ color: '#8A7AA8', fontSize: isMobile ? 13 : 14 }}>Pedagio Total</span>
                    <span style={{ color: '#FFB627', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{formatCurrency(calcResult.pedagio)}</span>
                  </div>
                  {calcResult.peso > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #251540' }}>
                      <span style={{ color: '#8A7AA8', fontSize: isMobile ? 13 : 14 }}>Peso</span>
                      <span style={{ color: '#FF7A1A', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{calcResult.peso.toLocaleString('pt-BR')} kg</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #251540' }}>
                    <span style={{ color: '#8A7AA8', fontSize: isMobile ? 13 : 14 }}>Tipo de Veiculo</span>
                    <span style={{ color: '#9B5CF0', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{calcVeiculo}</span>
                  </div>
                  {calcResult.peso > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #251540' }}>
                      <span style={{ color: '#8A7AA8', fontSize: isMobile ? 13 : 14 }}>Custo por KG</span>
                      <span style={{ color: '#FFB627', fontSize: isMobile ? 13 : 14, fontWeight: 600 }}>{formatCurrency(calcResult.custoPorKg)}</span>
                    </div>
                  )}
                </>
              )}
              <button onClick={() => openBudget({ origem: calcPontoPartida || calcAddresses.filter(a => a.trim())[0], destino: calcAddresses.filter(a => a.trim()).slice(-1)[0], km: calcResult.km, pedagio: calcResult.pedagio, peso: calcResult.peso, valorFrete: calcResult.custoTotal - calcResult.pedagio, valorTotal: calcResult.custoTotal })}
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
          <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Clientes</h1>
          <p className="page-subtitle" style={{ color: '#8A7AA8' }}>Gerencie seus clientes</p>
        </div>
        <button onClick={openClientModal} style={{ padding: '10px 20px', borderRadius: 8, ...gradientBtn, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="plus" size={16} /> Novo Cliente
        </button>
      </div>
      <div style={{ marginBottom: 20 }}>
        <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar cliente..."
          style={{ width: '100%', maxWidth: 400, padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      {filteredClients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: isMobile ? 40 : 80, backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540' }}>
          <Icon name="users" size={48} color="#251540" />
          <p style={{ color: '#8A7AA8', marginTop: 16 }}>{clients.length === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum cliente encontrado'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filteredClients.map(client => (
            <div key={client.id} style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{client.nome}</h3>
                  {client.cnpj && <span style={{ fontSize: 12, color: '#8A7AA8' }}>{client.cnpj}</span>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEditClient(client)} style={{ width: 32, height: 32, borderRadius: 6, border: 'none', backgroundColor: 'rgba(110,47,217,0.15)', color: '#9B5CF0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="edit" size={14} />
                  </button>
                  <button onClick={() => deleteClient(client.id)} style={{ width: 32, height: 32, borderRadius: 6, border: 'none', backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#8A7AA8', lineHeight: 1.8 }}>
                {client.telefone && <div>Telefone: {client.telefone}</div>}
                {client.email && <div>Email: {client.email}</div>}
                {client.endereco && <div>Endereco: {client.endereco}</div>}
                {client.observacoes && <div style={{ marginTop: 8, padding: 8, backgroundColor: '#15092E', borderRadius: 6, fontSize: 12, color: '#8A7AA8' }}>{client.observacoes}</div>}
              </div>
              <button onClick={() => openBudget({ cliente: client })}
                style={{ width: '100%', marginTop: 12, padding: '8px', borderRadius: 8, border: '1px solid #251540', backgroundColor: 'transparent', color: '#8A7AA8', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#FF7A1A'; e.currentTarget.style.color = '#FF7A1A'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#251540'; e.currentTarget.style.color = '#8A7AA8'; }}>
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
      <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Historico</h1>
      <p className="page-subtitle" style={{ color: '#8A7AA8', marginBottom: 24 }}>Todas as suas rotas e orcamentos</p>
      <div style={{ marginBottom: 20 }}>
        <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Buscar por origem ou destino..."
          style={{ width: '100%', maxWidth: 400, padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      {filteredHistory.length === 0 ? (
        <div style={{ textAlign: 'center', padding: isMobile ? 40 : 80, backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540' }}>
          <Icon name="clock" size={48} color="#251540" />
          <p style={{ color: '#8A7AA8', marginTop: 16 }}>{history.length === 0 ? 'Nenhum registro' : 'Nenhum resultado encontrado'}</p>
        </div>
      ) : (
        <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', overflow: 'hidden' }}>
          {filteredHistory.map((item, i) => (
            <div key={item.id} className="history-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '14px 16px' : '16px 20px', borderBottom: i < filteredHistory.length - 1 ? '1px solid #251540' : 'none', flexWrap: 'wrap', gap: isMobile ? 6 : 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
                <div style={{ width: isMobile ? 34 : 40, height: isMobile ? 34 : 40, borderRadius: 10, backgroundColor: item.status === 'Orcamento' ? 'rgba(255,122,26,0.15)' : 'rgba(155,92,240,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={item.status === 'Orcamento' ? 'alert' : 'check'} size={isMobile ? 15 : 18} color={item.status === 'Orcamento' ? '#FF7A1A' : '#9B5CF0'} />
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 500 }}>{item.origem} → {item.destino}</div>
                  <div style={{ fontSize: 12, color: '#8A7AA8' }}>{formatDateTime(item.date)}</div>
                </div>
              </div>
              <div className="hist-right" style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: isMobile ? 12 : 13, color: '#8A7AA8' }}>{item.km.toFixed(1)} km</span>
                <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: '#FFFFFF' }}>{formatCurrency(item.valor)}</span>
                <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, backgroundColor: item.status === 'Orcamento' ? 'rgba(255,122,26,0.15)' : 'rgba(155,92,240,0.15)', color: item.status === 'Orcamento' ? '#FF7A1A' : '#9B5CF0', fontWeight: 600 }}>
                  {item.status}
                </span>
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
          <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Pedagios</h1>
          <p className="page-subtitle" style={{ color: '#8A7AA8' }}>Cadastre os pedagios conhecidos por trecho</p>
        </div>
        <button onClick={openTollModal} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', ...gradientBtn, color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="plus" size={16} /> Novo Pedagio
        </button>
      </div>
      <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: isMobile ? 16 : 20, marginBottom: 24 }}>
        <p style={{ fontSize: isMobile ? 12 : 13, color: '#8A7AA8' }}>Cadastre pedagios conhecidos por trecho. Na Calculadora de Frete, informe o valor do pedagio ou deixe vazio para estimativa de R$1,10/km.</p>
      </div>
      {tollRoutes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: isMobile ? 40 : 80, backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540' }}>
          <Icon name="route" size={48} color="#251540" />
          <p style={{ color: '#8A7AA8', marginTop: 16 }}>Nenhum pedagio cadastrado</p>
          <p style={{ color: '#8A7AA8', fontSize: 13, marginTop: 4 }}>Cadastre trechos para calcular valores reais</p>
        </div>
      ) : (
        <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', overflow: 'hidden' }}>
          {!isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr 80px', padding: '14px 20px', borderBottom: '1px solid #251540', backgroundColor: '#15092E' }}>
              <span style={{ fontSize: 12, color: '#8A7AA8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Trecho</span>
              <span style={{ fontSize: 12, color: '#8A7AA8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Pedagio</span>
              <span style={{ fontSize: 12, color: '#8A7AA8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Observacao</span>
              <span style={{ fontSize: 12, color: '#8A7AA8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}></span>
            </div>
          )}
          {tollRoutes.map((toll, i) => (
            isMobile ? (
              <div key={toll.id} style={{ padding: '14px 16px', borderBottom: i < tollRoutes.length - 1 ? '1px solid #251540' : 'none', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, flex: 1, paddingRight: 80 }}>{toll.trecho}</div>
                  <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', gap: 4 }}>
                    <button onClick={() => openEditToll(toll)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', backgroundColor: 'rgba(110,47,217,0.15)', color: '#9B5CF0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="edit" size={13} />
                    </button>
                    <button onClick={() => deleteToll(toll.id)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: '#FFB627' }}>{formatCurrency(toll.pedagio)}</span>
                  {toll.observacao && <span style={{ color: '#8A7AA8' }}>{toll.observacao}</span>}
                </div>
              </div>
            ) : (
              <div key={toll.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr 80px', alignItems: 'center', padding: '14px 20px', borderBottom: i < tollRoutes.length - 1 ? '1px solid #251540' : 'none' }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{toll.trecho}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#FFB627' }}>{formatCurrency(toll.pedagio)}</span>
                <span style={{ fontSize: 13, color: '#8A7AA8' }}>{toll.observacao || '-'}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEditToll(toll)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', backgroundColor: 'rgba(110,47,217,0.15)', color: '#9B5CF0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="edit" size={13} />
                  </button>
                  <button onClick={() => deleteToll(toll.id)} style={{ width: 30, height: 30, borderRadius: 6, border: 'none', backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="gps" size={24} color="#00E676" />
        Rastreamento</h2>
      <p style={{ color: '#8A7AA8', fontSize: 13, marginBottom: 20 }}>Compartilhe sua localizacao em tempo real</p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {!trackingAtivo ? (
          <button onClick={startTracking} style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#00E676,#00C853)', color: '#FFF', cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            Iniciar Rastreamento
          </button>
        ) : (
          <button onClick={stopTracking} style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#EF4444,#DC2626)', color: '#FFF', cursor: 'pointer', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            Parar Rastreamento
          </button>
        )}
      </div>
      <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', overflow: 'hidden', minHeight: isMobile ? 300 : 450, position: 'relative' }}>
        {gmapsLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: isMobile ? 300 : 450 }}
            center={trackingPos || { lat: -15.78, lng: -47.93 }}
            zoom={trackingPos ? 15 : 5}
            options={{ styles: darkMapStyle, zoomControl: true, mapTypeControl: false, streetViewControl: false, fullscreenControl: false }}
          >
            {trackingPos && (
              <Marker
                position={trackingPos}
                icon={{
                  path: window.google?.maps?.SymbolPath?.CIRCLE,
                  scale: 10,
                  fillColor: '#4285F4',
                  fillOpacity: 1,
                  strokeColor: '#FFF',
                  strokeWeight: 3,
                } as any}
                label={{ text: '●', color: '#4285F4', fontSize: '24px' }}
              />
            )}
            {trackingHistory.length > 1 && (
              <Polyline
                path={trackingHistory.map(p => ({ lat: p.lat, lng: p.lng }))}
                options={{ strokeColor: '#4285F4', strokeWeight: 3, strokeOpacity: 0.7 }}
              />
            )}
          </GoogleMap>
        ) : (
          <div style={{ width: '100%', height: isMobile ? 300 : 450, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A7AA8' }}>
            Carregando mapa...
          </div>
        )}
      </div>
      {trackingHistory.length > 0 && (
        <div style={{ marginTop: 12, backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', padding: 16 }}>
          <div style={{ fontSize: 13, color: '#8A7AA8', marginBottom: 8 }}>Pontos registrados: {trackingHistory.length}</div>
          <div style={{ fontSize: 11, color: '#5A4A78', wordBreak: 'break-all' }}>
            Ultima posicao: {trackingPos ? trackingPos.lat.toFixed(6) + ', ' + trackingPos.lng.toFixed(6) : '-'}
          </div>
        </div>
      )}
      {(JSON.parse(localStorage.getItem('nexlog_rotas') || '[]') as any[]).length > 0 && !trackingAtivo && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Rotas salvas</h3>
          {(JSON.parse(localStorage.getItem('nexlog_rotas') || '[]') as any[]).slice(0, 5).map((rota: any) => (
            <div key={rota.id} style={{ backgroundColor: '#1D0F38', borderRadius: 10, border: '1px solid #251540', padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{rota.nome}</div>
              <div style={{ fontSize: 12, color: '#8A7AA8' }}>{new Date(rota.data).toLocaleString('pt-BR')} - {rota.pontos?.length || 0} pontos</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

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
          <h2 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, margin: 0 }}>Marketplace de Fretes</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#8A7AA8' }}>{session?.nome}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: userPlan === 'premium' ? 'linear-gradient(135deg,#FF7A1A,#FFB627)' : userPlan === 'profissional' ? '#6E2FD9' : '#251540', color: '#FFF', fontWeight: 600, textTransform: 'uppercase' }}>{userPlan}</span>
            <button onClick={handleLogout} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #251540', backgroundColor: 'transparent', color: '#EF4444', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Sair</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', borderBottom: '1px solid #251540', paddingBottom: 12 }}>
          {mkNav.map(n => (
            <button key={n.id} onClick={() => setMkPage(n.id)}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: mkPage === n.id ? 600 : 400, background: mkPage === n.id ? 'rgba(110,47,217,0.2)' : 'transparent', color: mkPage === n.id ? '#FFF' : '#8A7AA8' }}>
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
        <input value={freightSearch} onChange={e => setFreightSearch(e.target.value)} placeholder="Buscar por origem ou destino..." style={{ width: '100%', maxWidth: 400, padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 20, boxSizing: 'border-box' }} />
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#8A7AA8' }}>Nenhum frete disponivel no momento</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filtered.map((f: Freight) => (
              <div key={f.id} style={{ backgroundColor: '#1D0F38', borderRadius: 12, border: '1px solid #251540', overflow: 'hidden' }}>
                {f.imagem && <img src={f.imagem} alt="" style={{ width: '100%', height: 160, objectFit: 'cover' }} />}
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{f.origem} → {f.destino}</div>
                      <div style={{ fontSize: 12, color: '#8A7AA8' }}>{f.tipo} | {f.peso}kg</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#FF7A1A' }}>{formatCurrency(Number(f.valor))}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Coleta: {f.coleta || 'A combinar'} | Entrega: {f.entrega || 'A combinar'}</div>
                  {f.observacao && <div style={{ fontSize: 12, color: '#9885BE', marginBottom: 8 }}>{f.observacao}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #251540' }}>
                    <span style={{ fontSize: 11, color: '#8A7AA8' }}>{f.empresa} • {f.plano}</span>
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
    <div style={{ backgroundColor: '#1D0F38', borderRadius: 12, border: '1px solid #251540', padding: 24, maxWidth: 600 }}>
      {userPlan === 'gratis' && (
        <div style={{ padding: 12, marginBottom: 16, backgroundColor: 'rgba(255,182,39,0.1)', borderRadius: 8, border: '1px solid rgba(255,182,39,0.2)', fontSize: 13, color: '#FFB627' }}>
          Plano Gratis: voce pode anunciar fretes sem fotos. <button onClick={() => setMkPage('planos')} style={{ background: 'none', border: 'none', color: '#FF7A1A', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', fontSize: 13 }}>Fazer upgrade</button>
        </div>
      )}
      {[
        { key: 'origem', label: 'Origem *', placeholder: 'Cidade/UF de origem' },
        { key: 'destino', label: 'Destino *', placeholder: 'Cidade/UF de destino' },
      ].map(f => (
        <div key={f.key} style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>{f.label}</label>
          <input value={(freightForm as any)[f.key]} onChange={e => setFreightForm({ ...freightForm, [f.key]: e.target.value })} placeholder={f.placeholder}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Tipo de Carga</label>
          <select value={freightForm.tipo} onChange={e => setFreightForm({ ...freightForm, tipo: e.target.value })}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
            {['Carga Seca', 'Frigorifica', 'Perigosa', 'Granel', 'Carne'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Peso (kg)</label>
          <input value={freightForm.peso} onChange={e => setFreightForm({ ...freightForm, peso: e.target.value })} placeholder="0"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Valor do Frete (R$) *</label>
        <input value={freightForm.valor} onChange={e => setFreightForm({ ...freightForm, valor: e.target.value })} placeholder="0,00"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Data Coleta</label>
          <input type="date" value={freightForm.coleta} onChange={e => setFreightForm({ ...freightForm, coleta: e.target.value })}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Data Entrega</label>
          <input type="date" value={freightForm.entrega} onChange={e => setFreightForm({ ...freightForm, entrega: e.target.value })}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Contato (WhatsApp)</label>
        <input value={freightForm.contato} onChange={e => setFreightForm({ ...freightForm, contato: e.target.value })} placeholder="(00) 00000-0000"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Observacao</label>
        <textarea value={freightForm.observacao} onChange={e => setFreightForm({ ...freightForm, observacao: e.target.value })} placeholder="Informacoes adicionais..." rows={3}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
      {userPlan !== 'gratis' && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Imagem do Frete (URL)</label>
          <input value={freightImage} onChange={e => setFreightImage(e.target.value)} placeholder="https://..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
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
      <div style={{ fontSize: 14, color: '#8A7AA8', marginBottom: 24 }}>Seu plano atual: <strong style={{ color: userPlan === 'premium' ? '#FF7A1A' : userPlan === 'profissional' ? '#9B5CF0' : '#8A7AA8' }}>{userPlan === 'gratis' ? 'Gratis' : userPlan === 'profissional' ? 'Profissional (R$30/mes)' : 'Premium (R$50/mes)'}</strong></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {[
          { id: 'gratis' as const, name: 'Gratis', price: 'R$ 0', features: ['Anunciar fretes', 'Fretes basicos'], color: '#8A7AA8', bcolor: '#251540' },
          { id: 'profissional' as const, name: 'Profissional', price: 'R$ 30/mes', features: ['Fretes ilimitados', 'Suporte prioritario', 'Destaque nos resultados'], color: '#9B5CF0', bcolor: '#6E2FD9' },
          { id: 'premium' as const, name: 'Premium', price: 'R$ 50/mes', features: ['Fretes ilimitados', 'Fotos nos anuncios', 'Destaque dourado', 'Suporte VIP'], color: '#FFB627', bcolor: '#FF7A1A' },
        ].map(p => (
          <div key={p.id} onClick={() => selectPlan(p.id)}
            style={{ backgroundColor: '#1D0F38', borderRadius: 12, border: `2px solid ${mkPlan === p.id ? p.bcolor : '#251540'}`, padding: 24, cursor: 'pointer', transition: 'all 0.2s' }}>
            <div style={{ fontSize: 12, color: '#8A7AA8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{p.name}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: p.color, marginBottom: 16 }}>{p.price}</div>
            {p.features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, color: '#C4B5D8' }}>
                <Icon name="check" size={14} color="#00E676" /> {f}
              </div>
            ))}
            <button onClick={confirmPlan} disabled={p.id === userPlan}
              style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 8, border: 'none', background: p.id === 'premium' ? 'linear-gradient(135deg,#FF7A1A,#FFB627)' : p.id === 'profissional' ? '#6E2FD9' : '#251540', color: '#FFF', cursor: p.id === userPlan ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600, opacity: p.id === userPlan ? 0.5 : 1 }}>
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
          <div style={{ textAlign: 'center', padding: 40, color: '#8A7AA8' }}>Voce ainda nao anunciou nenhum frete</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {all.map((f: Freight) => (
              <div key={f.id} style={{ backgroundColor: '#1D0F38', borderRadius: 12, border: '1px solid #251540', overflow: 'hidden', position: 'relative' }}>
                {f.imagem && <img src={f.imagem} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />}
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{f.origem} → {f.destino}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#FF7A1A' }}>{formatCurrency(Number(f.valor))}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>{f.tipo} | {f.peso}kg | {f.plano}</div>
                  <div style={{ fontSize: 12, color: '#8A7AA8' }}>{f.coleta} → {f.entrega}</div>
                  <button onClick={() => deleteFreight(f.id)} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, border: 'none', backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
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
      <div style={{ backgroundColor: '#1D0F38', borderRadius: 16, border: '1px solid #251540', padding: 28, width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{authTab === 'login' ? 'Entrar' : 'Criar Conta'}</h2>
          <button onClick={() => setShowAuthModal(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {authError && <div style={{ padding: 10, marginBottom: 16, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 8, fontSize: 13, color: '#EF4444' }}>{authError}</div>}
        {authTab === 'register' && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Nome *</label>
            <input value={authForm.nome} onChange={e => setAuthForm({ ...authForm, nome: e.target.value })} placeholder="Seu nome"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Email *</label>
          <input value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="email@exemplo.com"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Senha *</label>
          <input type="password" value={authForm.senha} onChange={e => setAuthForm({ ...authForm, senha: e.target.value })} placeholder="Sua senha"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {authTab === 'register' && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>Telefone</label>
              <input value={authForm.telefone} onChange={e => setAuthForm({ ...authForm, telefone: e.target.value })} placeholder="(00) 00000-0000"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 4 }}>CNPJ/CPF</label>
              <input value={authForm.cnpj} onChange={e => setAuthForm({ ...authForm, cnpj: e.target.value })} placeholder="00.000.000/0000-00"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </>
        )}
        <button onClick={handleAuth}
          style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', ...gradientBtn, color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', marginBottom: 16 }}>
          {authTab === 'login' ? 'Entrar' : 'Criar Conta'}
        </button>
        <div style={{ textAlign: 'center', fontSize: 13, color: '#8A7AA8' }}>
          {authTab === 'login' ? (
            <>Nao tem conta? <button onClick={() => { setAuthTab('register'); setAuthError(''); }} style={{ background: 'none', border: 'none', color: '#9B5CF0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textDecoration: 'underline' }}>Cadastre-se</button></>
          ) : (
            <>Ja tem conta? <button onClick={() => { setAuthTab('login'); setAuthError(''); }} style={{ background: 'none', border: 'none', color: '#9B5CF0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textDecoration: 'underline' }}>Fazer login</button></>
          )}
        </div>
      </div>
    </div>
  );

  const renderTollModal = () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) setShowTollModal(false); }}>
      <div style={{ backgroundColor: '#1D0F38', borderRadius: 16, border: '1px solid #251540', padding: 28, width: '100%', maxWidth: 450 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>{editingToll ? 'Editar Pedagio' : 'Novo Pedagio'}</h2>
          <button onClick={() => setShowTollModal(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>Trecho *</label>
          <input value={tollForm.trecho} onChange={(e) => setTollForm({ ...tollForm, trecho: e.target.value })} placeholder="Ex: Sao Paulo -> Campinas (Anhanguera)"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>Valor do Pedagio (R$) *</label>
          <input type="number" value={tollForm.pedagio} onChange={(e) => setTollForm({ ...tollForm, pedagio: e.target.value })} placeholder="0,00" step="0.01" min="0"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>Observacao</label>
          <input value={tollForm.observacao} onChange={(e) => setTollForm({ ...tollForm, observacao: e.target.value })} placeholder="Ex: 6 praças, sentido norte"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowTollModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #251540', backgroundColor: 'transparent', color: '#8A7AA8', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
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
      <div style={{ backgroundColor: '#1D0F38', borderRadius: 16, border: '1px solid #251540', padding: 28, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <button onClick={() => setShowClientModal(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>{field.label}</label>
            <input value={(clientForm as any)[field.key]} onChange={(e) => setClientForm({ ...clientForm, [field.key]: e.target.value })} placeholder={field.placeholder}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>Observacoes</label>
          <textarea value={clientForm.observacoes} onChange={(e) => setClientForm({ ...clientForm, observacoes: e.target.value })} placeholder="Notas sobre o cliente..." rows={3}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowClientModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #251540', backgroundColor: 'transparent', color: '#8A7AA8', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
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
        <div className="budget-print" style={{ backgroundColor: '#1D0F38', borderRadius: 16, border: '1px solid #251540', padding: 32, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28, paddingBottom: 20, borderBottom: 'none', position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: 0, left: '10%', right: '10%', height: 2, background: 'linear-gradient(90deg, #6E2FD9, #FF7A1A)' }} />
            <div style={{ marginBottom: 12 }}>
              <NexLogLogo />
            </div>
            <div style={{ fontSize: 12, color: '#9885BE', letterSpacing: 2, fontFamily: "'Space Grotesk', sans-serif" }}>LOGISTICA & TRANSPORTE</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: 13 }}>
            <div>
              <div style={{ color: '#8A7AA8' }}>Orcamento</div>
              <div style={{ fontWeight: 600 }}>{budgetData.id}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#8A7AA8' }}>Data</div>
              <div style={{ fontWeight: 600 }}>{formatDate(budgetData.date)}</div>
            </div>
          </div>
          {budgetData.cliente && (
            <div style={{ marginBottom: 20, padding: 16, backgroundColor: '#15092E', borderRadius: 10, border: '1px solid #251540' }}>
              <div style={{ fontSize: 11, color: '#9B5CF0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Dados do Cliente</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{budgetData.cliente.nome}</div>
              {budgetData.cliente.cnpj && <div style={{ fontSize: 13, color: '#8A7AA8' }}>CNPJ/CPF: {budgetData.cliente.cnpj}</div>}
              {budgetData.cliente.telefone && <div style={{ fontSize: 13, color: '#8A7AA8' }}>Telefone: {budgetData.cliente.telefone}</div>}
            </div>
          )}
          <div style={{ marginBottom: 20, padding: 16, backgroundColor: '#15092E', borderRadius: 10, border: '1px solid #251540' }}>
            <div style={{ fontSize: 11, color: '#9B5CF0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Detalhes da Rota</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>{budgetData.origem}</span>
              <Icon name="arrow-right" size={14} color="#FF7A1A" />
              <span style={{ fontWeight: 600 }}>{budgetData.destino}</span>
            </div>
            <div style={{ fontSize: 13, color: '#8A7AA8' }}>KM Total: {budgetData.km.toFixed(1)} km</div>
            {budgetData.peso > 0 && <div style={{ fontSize: 13, color: '#8A7AA8' }}>Peso: {budgetData.peso.toLocaleString('pt-BR')} kg</div>}
          </div>
          <div style={{ padding: 16, backgroundColor: '#15092E', borderRadius: 10, border: '1px solid #251540', marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#9B5CF0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Precificacao</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
              <span style={{ color: '#8A7AA8' }}>Valor do Frete</span>
              <span style={{ fontWeight: 500 }}>{formatCurrency(budgetData.valorFrete)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
              <span style={{ color: '#8A7AA8' }}>Pedagios</span>
              <span style={{ fontWeight: 500 }}>{formatCurrency(budgetData.pedagio)}</span>
            </div>
            <div style={{ borderTop: '1px solid #251540', marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>VALOR TOTAL</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#FF7A1A' }}>{formatCurrency(budgetData.valorTotal)}</span>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#8A7AA8', marginBottom: 24, padding: 10, backgroundColor: 'rgba(255,122,26,0.1)', borderRadius: 8 }}>
            Validade deste orcamento: 7 dias
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: '#9B5CF0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Enviar por WhatsApp</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="Telefone com DDD (ex: 19998731102)" value={whatsAppPhone}
                onChange={e => setWhatsAppPhone(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              <button onClick={sendWhatsApp} disabled={whatsAppSending}
                style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#FFFFFF', cursor: whatsAppSending ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600, opacity: whatsAppSending ? 0.6 : 1 }}>
                {whatsAppSending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
          <div className="budget-btns" style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveBudget} style={{ flex: 1, padding: '12px', borderRadius: 8, ...gradientBtn, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="save" size={16} /> Salvar
            </button>
            <button onClick={() => window.print()} style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #251540', backgroundColor: 'transparent', color: '#E8ECF0', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="printer" size={16} /> Imprimir
            </button>
            <button onClick={shareBudget} style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #251540', backgroundColor: 'transparent', color: '#E8ECF0', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="share" size={16} /> Compartilhar
            </button>
          </div>
          <button onClick={() => setBudgetModalOpen(false)} style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 8, border: 'none', backgroundColor: 'transparent', color: '#8A7AA8', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            Fechar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0D0817', color: '#FFFFFF', fontFamily: "'Sora', sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        input:focus, textarea:focus { border-color: #6E2FD9 !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #251540; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #3B1063; }
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, backgroundColor: '#15092E', borderBottom: '1px solid #251540', display: 'flex', alignItems: 'center', padding: '0 12px', zIndex: 900 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', padding: 6, borderRadius: 6 }}>
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
        backgroundColor: '#3B1063',
        borderRight: '1px solid #251540',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        transition: 'left 0.3s ease',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #251540' }}>
          <NexLogLogo sidebar />
        </div>
        <nav className="sidebar-nav" style={{ padding: '16px 12px', flex: 1 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => { setCurrentPage(item.id); setSidebarOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', marginBottom: 4, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14,
                fontWeight: currentPage === item.id ? 600 : 400, color: currentPage === item.id ? '#FFFFFF' : '#8A7AA8',
                backgroundColor: currentPage === item.id ? 'rgba(110,47,217,0.2)' : 'transparent', fontFamily: 'inherit', transition: 'all 0.2s',
              }}>
              <Icon name={item.icon} size={18} color={currentPage === item.id ? '#9B5CF0' : '#8A7AA8'} />
              {item.label}
            </button>
          ))}
          <div style={{ height: 1, background: '#251540', margin: '12px 0' }} />
          <button onClick={goMarketplace}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14,
              fontWeight: 600, color: '#FFB627', background: 'rgba(255,182,39,0.1)', fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFB627" strokeWidth="2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
            Marketplace
            <span style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 8px', borderRadius: 20, background: 'linear-gradient(135deg,#FF7A1A,#FFB627)', color: '#FFF', fontWeight: 700 }}>NOVO</span>
          </button>
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid #251540', fontSize: 11, color: '#8A7AA8' }}>
          v1.0.0 &middot; NEXLOG EXPRESS
        </div>
      </aside>
      <main style={{ flex: 1, marginTop: isMobile ? 48 : 0, overflowY: 'auto', minHeight: isMobile ? 'calc(100vh - 48px)' : '100vh' }}>
        <div style={{ padding: isMobile ? 14 : 32, maxWidth: 1400, margin: '0 auto' }}>
          {currentPage === 'dashboard' && renderDashboard()}
          {currentPage === 'roteirizador' && renderRoteirizador()}
          {currentPage === 'rastreamento' && renderRastreamento()}
          {currentPage === 'marketplace' && renderMarketplace()}
          {currentPage === 'calculadora' && renderCalculadora()}
          {currentPage === 'clientes' && renderClientes()}
          {currentPage === 'historico' && renderHistorico()}
          {currentPage === 'pedagios' && renderPedagios()}
        </div>
      </main>
      </>
      )}
      {showClientModal && renderClientModal()}
      {showTollModal && renderTollModal()}
      {budgetModalOpen && renderBudgetModal()}
      {showAuthModal && renderAuthModal()}
    </div>
  );
}
