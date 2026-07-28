import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  if (q.length < 3) return NextResponse.json([]);
  try {
    const resp = await fetch(
      'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q + ', Brazil') + '&format=json&limit=10&addressdetails=1&extratags=1',
      { headers: { 'User-Agent': 'NexLogExpress/1.0 (contato@nexlog.com.br)' } }
    );
    const data = await resp.json();
    const results: { description: string }[] = [];
    const seen = new Set<string>();
    for (const r of data) {
      const a = r.address || {};
      const parts: string[] = [];
      if (a.house_number) parts.push(a.road ? a.road + ', ' + a.house_number : a.house_number);
      else if (a.road) parts.push(a.road);
      if (a.suburb || a.neighbourhood) parts.push(a.suburb || a.neighbourhood);
      const city = a.city || a.town || a.village || a.municipality || '';
      const state = a.state || '';
      if (city) parts.push(city);
      if (state && state !== city) parts.push(state);
      if (parts.length === 0) parts.push(r.display_name.split(',').slice(0, 3).join(','));
      const desc = parts.join(' - ');
      const key = desc.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ description: desc });
      }
      if (results.length >= 6) break;
    }
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
