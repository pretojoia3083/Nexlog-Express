import { NextRequest, NextResponse } from 'next/server';

const ABBR: Record<string, string> = {
  'r': 'Rua', 'av': 'Avenida', 'pça': 'Praca', 'praça': 'Praca',
  'dr': 'Doutor', 'dra': 'Doutora', 'pr': 'Praca', 'prof': 'Professor',
  'sta': 'Santa', 'sto': 'Santo', 'sn': 'Sao',
  'jd': 'Jardim', 'vl': 'Vila', 'cid': 'Cidade',
  'cj': 'Conjunto', 'cond': 'Condominio', 'ed': 'Edificio',
  'est': 'Estrada', 'estr': 'Estrada', 'lg': 'Largo',
  'mr': 'Marechal', 'pe': 'Padre', 'rod': 'Rodovia',
  'tvl': 'Travessa', 'tv': 'Travessa', 'bc': 'Beco',
  'qq': 'Quilometro', 'tc': 'Trecho',
};

function expandAbbr(s: string): string {
  return s.split(' ').map(w => {
    const key = w.toLowerCase().replace(/[^a-záàâãéèêíïóôõöúûç']/g, '');
    return ABBR[key] || w;
  }).join(' ');
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  const cityFilter = req.nextUrl.searchParams.get('city') || '';
  if (q.length < 3) return NextResponse.json([]);
  try {
    const expanded = expandAbbr(q);
    const queryParts = [expanded + ', Brazil'];
    if (cityFilter && cityFilter.length > 2) queryParts.push(cityFilter);
    const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
      q: queryParts.join(', '),
      format: 'json',
      limit: '10',
      addressdetails: '1',
    }).toString();
    const resp = await fetch(url, { headers: { 'User-Agent': 'NexLogExpress/1.0 (contato@nexlog.com.br)' } });
    const data = await resp.json();
    const results: { description: string }[] = [];
    const seen = new Set<string>();
    for (const r of data) {
      const a = r.address || {};
      const parts: string[] = [];
      if (a.house_number && a.road) parts.push(`${a.road}, ${a.house_number}`);
      else if (a.road) parts.push(a.road);
      else if (a.house_number) parts.push(a.house_number);
      if (a.suburb || a.neighbourhood) parts.push(a.suburb || a.neighbourhood);
      const city = a.city || a.town || a.village || a.municipality || '';
      const state = a.state || '';
      if (city) parts.push(city);
      if (state && state !== city) parts.push(state);
      if (parts.length === 0) parts.push(r.display_name.split(',').slice(0, 3).join(','));
      const desc = parts.join(' - ');
      const key = desc.toLowerCase();
      if (!seen.has(key)) { seen.add(key); results.push({ description: desc }); }
      if (results.length >= 6) break;
    }
    if (results.length === 0 && /\d/.test(q)) {
      const fallback = await fetch(
        'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
          q: q.replace(/(\d+).*/, '$1').trim() + ', Brazil',
          format: 'json',
          limit: '5',
          addressdetails: '1',
        }).toString(),
        { headers: { 'User-Agent': 'NexLogExpress/1.0 (contato@nexlog.com.br)' } }
      );
      const fallbackData = await fallback.json();
      for (const r of fallbackData) {
        const a = r.address || {};
        const parts: string[] = [];
        if (a.road) parts.push(a.road);
        const city = a.city || a.town || a.village || a.municipality || '';
        const state = a.state || '';
        if (city) parts.push(city);
        if (state && state !== city) parts.push(state);
        if (parts.length === 0) continue;
        const desc = parts.join(' - ');
        if (!seen.has(desc.toLowerCase())) { seen.add(desc.toLowerCase()); results.push({ description: desc }); }
        if (results.length >= 6) break;
      }
    }
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}