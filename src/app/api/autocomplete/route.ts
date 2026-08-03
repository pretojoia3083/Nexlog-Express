import { NextRequest, NextResponse } from 'next/server';

const ABBR: Record<string, string> = {
  'r': 'Rua', 'av': 'Avenida', 'praca': 'Praca', 'dr': 'Doutor', 'dra': 'Doutora',
  'pr': 'Praca', 'prof': 'Professor', 'sta': 'Santa', 'sto': 'Santo', 'sn': 'Sao',
  'jd': 'Jardim', 'vl': 'Vila', 'cid': 'Cidade', 'cj': 'Conjunto', 'cond': 'Condominio',
  'ed': 'Edificio', 'est': 'Estrada', 'estr': 'Estrada', 'lg': 'Largo',
  'mr': 'Marechal', 'pe': 'Padre', 'rod': 'Rodovia', 'tvl': 'Travessa', 'tv': 'Travessa',
  'bc': 'Beco', 'qq': 'Quilometro', 'tc': 'Trecho', 'rua': 'Rua', 'avenida': 'Avenida',
  'travessa': 'Travessa', 'estrada': 'Estrada', 'rodovia': 'Rodovia', 'vila': 'Vila',
  'jardim': 'Jardim', 'centro': 'Centro',
};

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9']/g, '');
}

function expandAbbr(s: string): string {
  return s.split(' ').map(w => {
    const key = normalize(w);
    return ABBR[key] || w;
  }).join(' ');
}

function buildNominatimUrl(q: string): string {
  return 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    q: q + ', Brazil',
    format: 'json',
    limit: '10',
    addressdetails: '1',
  }).toString();
}

function buildPhotonUrl(q: string): string {
  return 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=8&lang=pt&osm_tag=highway';
}

function formatNominatim(r: any): string | null {
  const a = r.address || {};
  const parts: string[] = [];
  if (a.house_number && a.road) parts.push(a.road + ', ' + a.house_number);
  else if (a.road) parts.push(a.road);
  else if (a.house_number) parts.push(a.house_number);
  if (a.suburb || a.neighbourhood) parts.push(a.suburb || a.neighbourhood);
  const city = a.city || a.town || a.village || a.municipality || '';
  const state = a.state || '';
  if (city) parts.push(city);
  if (state && state !== city) parts.push(state);
  if (parts.length === 0) return null;
  return parts.join(' - ');
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  const cityFilter = req.nextUrl.searchParams.get('city') || '';
  if (q.length < 3) return NextResponse.json([]);

  const results: { description: string }[] = [];
  const seen = new Set<string>();
  const add = (label: string | null | undefined) => {
    if (!label) return;
    const key = label.toLowerCase();
    if (!seen.has(key)) { seen.add(key); results.push({ description: label }); }
  };

  const tryNominatim = async (query: string) => {
    try {
      const resp = await fetch(buildNominatimUrl(query), {
        headers: { 'User-Agent': 'NexLogExpress/1.0 (nexlogexpress@gmail.com)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (!Array.isArray(data)) return;
      for (const r of data) {
        add(formatNominatim(r));
        if (results.length >= 6) break;
      }
    } catch {}
  };

  const tryPhoton = async (query: string) => {
    try {
      const resp = await fetch(buildPhotonUrl(query), { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data.features?.length) return;
      for (const f of data.features) {
        const p = f.properties || {};
        const name = p.name || '';
        const street = p.street || '';
        const city = p.city || p.county || p.state || '';
        const label = p.name ? [name, street, city].filter(Boolean).join(' - ') : (p.label || p.name || '');
        add(label);
        if (results.length >= 6) break;
      }
    } catch {}
  };

  const expanded = expandAbbr(q);
  let query = expanded;
  if (cityFilter && cityFilter.length > 2) query += ', ' + cityFilter;

  await tryNominatim(query);
  if (results.length < 3) await tryPhoton(q);
  if (results.length < 3) await tryNominatim(expanded);
  if (results.length < 3 && /\d/.test(q)) {
    const numericOnly = q.replace(/(\d+).*/, '$1').trim();
    if (numericOnly !== q) await tryNominatim(numericOnly);
  }

  return NextResponse.json(results.slice(0, 6));
}
