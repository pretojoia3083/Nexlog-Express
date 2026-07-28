"use client";
import React, { useState, useEffect, useRef } from 'react';

type Page = 'dashboard' | 'roteirizador' | 'calculadora' | 'clientes' | 'historico' | 'pedagios';

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

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const resp = await fetch(
      'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(address + ', Brazil') + '&format=json&limit=1',
      { headers: { 'User-Agent': 'NexLogExpress/1.0' } }
    );
    const data = await resp.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch { return null; }
}

async function getRouteFromOSRM(coords: { lat: number; lng: number }[]): Promise<any> {
  try {
    const coordStr = coords.map(function(c) { return c.lng + ',' + c.lat; }).join(';');
    const resp = await fetch(
      'https://router.project-osrm.org/route/v1/driving/' + coordStr + '?overview=full&geometries=geojson&steps=true'
    );
    const data = await resp.json();
    if (data.code === 'Ok' && data.routes.length > 0) return data.routes[0];
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

  const handleInput = (val: string) => {
    onChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (val.length < 3) { setSuggestions([]); setShowDrop(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch('/api/autocomplete?q=' + encodeURIComponent(val));
        const data = await resp.json();
        if (data.length > 0) {
          setSuggestions(data);
          setShowDrop(true);
        } else {
          setSuggestions([]);
          setShowDrop(false);
        }
      } catch {
        setSuggestions([]);
        setShowDrop(false);
      }
    }, 350);
  };

  const handleSelect = (desc: string) => { onChange(desc); setShowDrop(false); setSuggestions([]); };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input value={value} onChange={(e) => handleInput(e.target.value)} placeholder={placeholder}
        style={{ ...style, width: '100%', fontSize: 16 }} />
      {showDrop && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#15092E', border: '1px solid #251540', borderRadius: 8, marginTop: 4, zIndex: 100, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {suggestions.map((s, i) => (
            <div key={i} onClick={() => handleSelect(s.description)}
              style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 13, color: '#E8ECF0', borderBottom: i < suggestions.length - 1 ? '1px solid #251540' : 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(110,47,217,0.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              <Icon name="map-pin" size={12} color="#6E2FD9" /> {s.description}
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

function NexLogLogo({ sidebar = false, mobile = false }: { sidebar?: boolean; mobile?: boolean }) {
  const sz = mobile ? 16 : sidebar ? 24 : 24;
  const truckSz = mobile ? 18 : 28;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 6 : sidebar ? 10 : 8 }}>
        <TruckSVG size={truckSz} color="#9B5CF0" />
        <span style={{
          fontSize: sz,
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          <span style={{
            background: 'linear-gradient(100deg, #9B5CF0 0%, #FF7A1A 70%, #FFB627 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>NEX</span>
          <span style={{ color: 'rgba(255,255,255,0.92)' }}>LOG</span>
        </span>
      </div>
      <div style={{
        fontSize: mobile ? 8 : 12,
        color: '#9885BE',
        letterSpacing: mobile ? 2 : 3,
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 500,
        marginTop: mobile ? 0 : 2,
        marginLeft: mobile ? 24 : sidebar ? 38 : 38,
      }}>EXPRESS</div>
    </div>
  );
}

export default function NexLogExpress() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
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
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);

  const [pontoPartida, setPontoPartida] = useState('');

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const polylineLayerRef = useRef<any>(null);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const ts = document.createElement('style');
    ts.textContent = '.dark-tooltip{background:#1D0F38!important;color:#E8ECF0!important;border:1px solid #251540!important;border-radius:8px!important;padding:6px 10px!important;font-size:12px!important;font-family:inherit!important;box-shadow:0 4px 12px rgba(0,0,0,0.4)!important}.dark-tooltip::before{border-top-color:#251540!important}';
    document.head.appendChild(ts);
    return () => { if (link.parentNode) link.parentNode.removeChild(link); if (ts.parentNode) ts.parentNode.removeChild(ts); };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || mapInstanceRef.current) return;
    try {
      const L = require('leaflet');
      const map = L.map(mapRef.current, { center: [-15.78, -47.93], zoom: 5, zoomControl: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      mapInstanceRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
      polylineLayerRef.current = L.layerGroup().addTo(map);
    } catch {}
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, []);

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
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const bounds = L.latLngBounds();
      geocodedCoords.forEach((coord, i) => {
        const icon = L.divIcon({
          className: '',
          html: '<div style="width:34px;height:34px;border-radius:50%;background:#6E2FD9;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;border:3px solid #3B1063;box-shadow:0 2px 10px rgba(110,47,217,0.5);font-family:system-ui">' + (letters[i] || String(i + 1)) + '</div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        const marker = L.marker([coord.lat, coord.lng], { icon });
        marker.bindTooltip(addresses[i] || ('Ponto ' + letters[i]), { className: 'dark-tooltip' });
        markersLayerRef.current.addLayer(marker);
        bounds.extend([coord.lat, coord.lng]);
      });
      if (geocodedCoords.length === 1) {
        mapInstanceRef.current.setView([geocodedCoords[0].lat, geocodedCoords[0].lng], 14);
      } else {
        mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch {}
  }, [geocodedCoords]);

  useEffect(() => {
    if (!mapInstanceRef.current || !polylineLayerRef.current) return;
    if (!routeResult || !routeResult.geometry) return;
    try {
      const L = require('leaflet');
      polylineLayerRef.current.clearLayers();
      const latlngs = routeResult.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
      L.polyline(latlngs, { color: '#FF7A1A', weight: 4, opacity: 0.9 }).addTo(polylineLayerRef.current);
    } catch {}
  }, [routeResult]);

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
    { id: 'calculadora' as Page, label: 'Calculadora de Frete', icon: 'calculator' },
    { id: 'pedagios' as Page, label: 'Pedagios', icon: 'route' },
    { id: 'clientes' as Page, label: 'Clientes', icon: 'users' },
    { id: 'historico' as Page, label: 'Historico', icon: 'clock' },
  ];

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
        if (i < allPts.length - 1) await new Promise(r => setTimeout(r, 600));
      }
      setGeocodedCoords(coords);
      const route = await getRouteFromOSRM([...coords, coords[0]]);
      if (!route) { alert('Nao foi possivel calcular a rota'); setIsCalculating(false); return; }
      const totalKm = route.distance / 1000;
      const totalHours = route.duration / 3600;
      const segments: Segment[] = [];
      const allAddr = [...allPts, allPts[0]];
      for (let i = 0; i < route.legs.length; i++) {
        const leg = route.legs[i];
        segments.push({ from: allAddr[i], to: allAddr[i + 1] || allAddr[0], km: leg.distance / 1000, hours: leg.duration / 3600, toll: 0 });
      }
      setRouteResult({ totalKm, totalHours, segments, geometry: route.geometry, coords, addresses: allPts, totalPedagio: 0 });
      setHistory(prev => [{ id: generateId(), date: new Date().toISOString(), origem: allPts[0], destino: allPts[allPts.length - 1], km: totalKm, valor: 0, status: 'Concluido' }, ...prev]);
    } catch { alert('Erro ao calcular rota'); }
    setIsCalculating(false);
  };

  const clearRoute = () => { setPontoPartida(''); setAddresses(['', '']); setRouteResult(null); setGeocodedCoords([]); };

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
        if (i < allPts.length - 1) await new Promise(r => setTimeout(r, 600));
      }
      const route = await getRouteFromOSRM([...coords, coords[0]]);
      if (!route) { alert('Nao foi possivel calcular a rota'); setIsCalcCalculating(false); return; }
      const km = route.distance / 1000;
      const allAddr = [...allPts, allPts[0]];
      const segments: { from: string; to: string; km: number; toll: number }[] = [];
      for (let i = 0; i < route.legs.length; i++) {
        const leg = route.legs[i];
        segments.push({ from: allAddr[i], to: allAddr[i + 1], km: leg.distance / 1000, toll: (leg.distance / 1000) * TOLL_RATE });
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
    lines.push(' Obrigado pela confianca! 🙏');
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

  const letter = (i: number) => String.fromCharCode(65 + i);

  const gradientBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, #6E2FD9, #FF7A1A)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  };

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
        <div style={{ backgroundColor: '#1D0F38', borderRadius: 14, border: '1px solid #251540', overflow: 'hidden', minHeight: isMobile ? 240 : 450 }}>
          <div ref={mapRef} style={{ width: '100%', height: isMobile ? 240 : 450 }} />
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
/*             <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Dados do Frete</h3> */
            <div className="calc-dados-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#8A7AA8', marginBottom: 6 }}>Peso (kg) - opcional</label>
                <input type="number" value={calcPeso} onChange={(e) => setCalcPeso(e.target.value)} placeholder="0" min="0" style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #251540', backgroundColor: '#15092E', color: '#E8ECF0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
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
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid #251540', fontSize: 11, color: '#8A7AA8' }}>
          v1.0.0 &middot; NEXLOG EXPRESS
        </div>
      </aside>
      <main style={{ flex: 1, marginTop: isMobile ? 48 : 0, overflowY: 'auto', minHeight: isMobile ? 'calc(100vh - 48px)' : '100vh' }}>
        <div style={{ padding: isMobile ? 14 : 32, maxWidth: 1400, margin: '0 auto' }}>
          {currentPage === 'dashboard' && renderDashboard()}
          {currentPage === 'roteirizador' && renderRoteirizador()}
          {currentPage === 'calculadora' && renderCalculadora()}
          {currentPage === 'clientes' && renderClientes()}
          {currentPage === 'historico' && renderHistorico()}
          {currentPage === 'pedagios' && renderPedagios()}
        </div>
      </main>
      {showClientModal && renderClientModal()}
      {showTollModal && renderTollModal()}
      {budgetModalOpen && renderBudgetModal()}
    </div>
  );
}
