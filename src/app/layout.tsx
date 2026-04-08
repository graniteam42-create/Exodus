import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EXODUS — Investment Timing',
  description: 'Regime-awareness tool for tactical allocation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
