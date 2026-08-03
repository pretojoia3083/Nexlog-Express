import { NextRequest, NextResponse } from 'next/server';
import { listUsers, saveUser } from '@/lib/db';
import { corsHeaders } from '@/lib/cors';

export async function GET() {
  const users = await listUsers();
  return NextResponse.json(users, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await req.json();
    if (!user || !user.email) {
      return NextResponse.json({ error: 'user with email required' }, { status: 400, headers: corsHeaders });
    }
    await saveUser(user);
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
