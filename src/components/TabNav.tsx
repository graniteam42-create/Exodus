'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/radar', label: 'Radar' },
  { href: '/discovery', label: 'Discovery' },
  { href: '/strategies', label: 'Strategies' },
  { href: '/indicators', label: 'Indicators' },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="tab-nav">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={pathname === tab.href ? 'active' : ''}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
