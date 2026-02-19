'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BarChart3, Flame, LayoutGrid, MessageSquare, Radio,
} from 'lucide-react';

const navItems = [
  { href: '/overview', label: 'Cost Overview', icon: BarChart3 },
  { href: '/features', label: 'Feature Breakdown', icon: LayoutGrid },
  { href: '/flamegraph', label: 'Flamegraph', icon: Flame },
  { href: '/prompts', label: 'Prompt Inspector', icon: MessageSquare },
  { href: '/realtime', label: 'Real-time Feed', icon: Radio },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-border-default bg-bg-surface flex flex-col h-full">
      <div className="p-4 border-b border-border-default">
        <h1 className="text-lg font-semibold text-accent-primary font-mono">
          AI Cost Profiler
        </h1>
      </div>
      <nav className="flex-1 py-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                isActive
                  ? 'text-accent-primary bg-bg-elevated border-l-2 border-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
