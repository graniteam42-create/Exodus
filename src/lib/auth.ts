import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function requireAuth() {
  const cookieStore = await cookies();
  const auth = cookieStore.get('exodus_auth');
  if (auth?.value !== 'authenticated') {
    redirect('/');
  }
}
