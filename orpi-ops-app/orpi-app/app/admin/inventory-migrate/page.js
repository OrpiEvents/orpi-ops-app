'use client';
// One-off inventory clean-up control. Signed-in only (middleware-protected).
// Dry run shows the planned changes; Apply writes them to Notion. Remove this
// page and its API route once the migration has run.
import { useState } from 'react';

export default function InventoryMigratePage() {
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState('');

  async function run(dryRun) {
    setBusy(dryRun ? 'dry' : 'apply');
    setOut(null);
    try {
      const r = await fetch('/api/admin/inventory-migrate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      }).then(r => r.json());
      setOut(r);
    } catch (e) {
      setOut({ error: String(e) });
    }
    setBusy('');
  }

  const btn = { padding: '10px 18px', borderRadius: 8, fontSize: 14, cursor: 'pointer', border: '1px solid #ddd' };

  return (
    <div style={{ maxWidth: 760, margin: '48px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Inventory clean-up</h1>
      <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6 }}>
        Applies the reviewed names (sizes stripped, accents &amp; brand spellings fixed),
        archives garnishes/consumables/strays (recoverable in Notion), and recategorises
        the inventory. <strong>Run “Dry run” first</strong> to see the counts, then “Apply”.
        Apply takes a couple of minutes — leave the tab open.
      </p>
      <div style={{ display: 'flex', gap: 12, margin: '20px 0' }}>
        <button onClick={() => run(true)} disabled={!!busy} style={btn}>
          {busy === 'dry' ? 'Running…' : 'Dry run'}
        </button>
        <button onClick={() => run(false)} disabled={!!busy} style={{ ...btn, background: '#b8953a', color: '#fff', border: 'none' }}>
          {busy === 'apply' ? 'Applying… (keep this tab open)' : 'Apply migration'}
        </button>
      </div>
      {out && (
        <pre style={{ background: '#f6f5f2', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 13, lineHeight: 1.5 }}>
          {JSON.stringify(out, null, 2)}
        </pre>
      )}
    </div>
  );
}
