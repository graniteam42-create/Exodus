'use client';

import { useState } from 'react';
import StrategyCard from '@/components/StrategyCard';
import type { RuleInfo } from '@/components/StrategyCard';

interface Props {
  strategies: any[];
  ruleInfo: Record<string, RuleInfo>;
}

export default function StrategiesClient({ strategies, ruleInfo }: Props) {
  const [sortBy, setSortBy] = useState<string>('rating');
  const [items, setItems] = useState(strategies);

  const sorted = [...items].sort((a, b) => {
    switch (sortBy) {
      case 'rating': return b.rating_score - a.rating_score;
      case 'sharpe': return b.sharpe - a.sharpe;
      case 'cagr': return b.cagr - a.cagr;
      case 'robustness': return b.robustness_score - a.robustness_score;
      default: return 0;
    }
  });

  async function handleUnsave(strategyId: string) {
    await fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unsave', strategy_id: strategyId }),
    });
    setItems(items.filter(s => s.strategy_id !== strategyId));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>
            Saved Strategies ({sorted.length})
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
            These contribute to the Radar consensus
          </p>
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ padding: '5px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem' }}
        >
          <option value="rating">Sort by: Rating</option>
          <option value="robustness">Sort by: Robustness</option>
          <option value="sharpe">Sort by: Sharpe</option>
          <option value="cagr">Sort by: CAGR</option>
        </select>
      </div>

      {sorted.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 8 }}>No saved strategies yet.</p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Go to the Discovery tab to generate and browse strategies, then save the ones you like.
          </p>
        </div>
      )}

      {sorted.map(strategy => (
        <StrategyCard
          key={strategy.strategy_id}
          strategy={strategy}
          ruleInfo={ruleInfo}
          onUnsave={handleUnsave}
        />
      ))}
    </div>
  );
}
