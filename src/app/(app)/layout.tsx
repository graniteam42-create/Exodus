import { requireAuth } from '@/lib/auth';
import TabNav from '@/components/TabNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();

  return (
    <>
      <header className="app-header">
        <div className="logo">EXODUS</div>
      </header>
      <TabNav />
      <main className="page-content">{children}</main>
    </>
  );
}
