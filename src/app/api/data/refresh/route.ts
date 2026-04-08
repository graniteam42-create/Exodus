import { NextResponse } from 'next/server';

export const maxDuration = 60; // Vercel max for free tier

export async function POST() {
  try {
    // Initialize database tables if they don't exist
    const { initializeDatabase } = await import('@/lib/db');
    await initializeDatabase();

    // Dynamic import to avoid loading heavy modules during build
    const { refreshAllData } = await import('@/lib/data/cache');
    const result = await refreshAllData();

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, errors: [message] }, { status: 500 });
  }
}
