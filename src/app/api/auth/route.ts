import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const PASSWORD = 'password'; // hardcoded for now, will move to env var later

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.password === PASSWORD) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set('exodus_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    return response;
  }

  return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
}

export async function GET() {
  const cookieStore = await cookies();
  const auth = cookieStore.get('exodus_auth');
  if (auth?.value === 'authenticated') {
    return NextResponse.json({ authenticated: true });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}
