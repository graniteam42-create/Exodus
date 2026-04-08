'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/radar');
    } else {
      setError('Wrong password');
      setPassword('');
    }
  }

  return (
    <div className="password-page">
      <form className="password-box" onSubmit={handleSubmit}>
        <h1>EXODUS</h1>
        <p>Investment Timing Dashboard</p>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          placeholder="Enter password"
          autoFocus
        />
        {error && <p style={{ color: 'var(--red)', marginTop: 8, fontSize: '0.82rem' }}>{error}</p>}
        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 16, padding: '12px' }}>
          Enter
        </button>
      </form>
    </div>
  );
}
