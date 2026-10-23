'use client';
import { useCallback, useEffect, useState } from 'react';

// Shared pieces for the Growth workspace. Same look as the rest of the ops
// app (white cards, hairline borders, gold accent); charts follow the
// data-viz rules: one hue per single-series chart, thin rounded bars, a 2px
// gap, labels used sparingly, a tooltip on every mark, and status colours
// only ever next to an icon and a word.

export const SERIES = '#2a78d6';          // single-series marks
export const SERIES_SOFT = '#cde2fb';
export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
const INK2 = '#52514e', MUTED = '#898781', GRID = '#ebe9e4';

export const gbp = n => (n === null || n === undefined || Number.isNaN(n) ? '—' : `£${Math.round(n).toLocaleString('en-GB')}`);
export const pct = n => (n === null || n === undefined || Number.isNaN(n) ? '—' : `${Math.round(n * 100)}%`);
export const num = n => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-GB'));

export function useJson(url) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const load = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    fetch(url, { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => setState({ data: ok && !j.error ? j : null, error: ok && !j.error ? '' : (j.error || 'Could not load'), loading: false }))
      .catch(e => setState({ data: null, error: e.message, loading: false }));
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function PageHead({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>{title}</h1>
        {sub && <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3, maxWidth: 680 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function SectionHead({ children, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, margin: '26px 0 10px' }}>
      <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>{children}</h2>
      {right}
    </div>
  );
}

export function Card({ children, style, pad = '16px 18px' }) {
  return <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: pad, ...style }}>{children}</div>;
}

export function Grid({ min = 180, gap = 12, children, style }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap, ...style }}>{children}</div>;
}

export function Stat({ label, value, sub, tone }) {
  return (
    <Card pad="14px 16px">
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: tone ? toneInk(tone) : 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}
const toneInk = t => ({ good: '#1a7a4a', warn: '#8a5a00', action: '#7a5d16' }[t] || 'var(--muted)');

const TONE = {
  action: { icon: '→', word: 'To do', color: 'var(--gold)', bg: 'var(--gold-bg)' },
  warn: { icon: '!', word: 'Check', color: STATUS.serious, bg: '#fdf3ee' },
  good: { icon: '✓', word: 'Good', color: STATUS.good, bg: 'var(--success-bg)' },
  info: { icon: '•', word: '', color: '#b8b6ae', bg: 'transparent' },
};
// A brief line: icon + optional word + text, never colour alone.
export function Note({ tone = 'info', text, link, compact }) {
  const t = TONE[tone] || TONE.info;
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: compact ? '6px 0' : '9px 0', borderBottom: '1px solid var(--off)', fontSize: 13, lineHeight: 1.5 }}>
      <span aria-hidden style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 10, background: t.bg, color: t.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, border: tone === 'info' ? 'none' : `1px solid ${t.color}` }}>{t.icon}</span>
      <span style={{ flex: 1 }}>
        {t.word && <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: INK2, marginRight: 6 }}>{t.word}</span>}
        {text}
        {link && <a href={link} target={link.startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ color: 'var(--gold)', textDecoration: 'none', marginLeft: 6, whiteSpace: 'nowrap' }}>Open →</a>}
      </span>
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }) {
  const c = { neutral: ['var(--mid)', INK2], gold: ['var(--gold-bg)', '#7a5d16'], good: ['var(--success-bg)', '#1a7a4a'], warn: ['#fdf3ee', '#9a4a24'], bad: ['var(--danger-bg)', 'var(--danger)'] }[tone] || ['var(--mid)', INK2];
  return <span style={{ display: 'inline-block', background: c[0], color: c[1], fontSize: 11, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>{children}</span>;
}

export function Empty({ children }) {
  return <div style={{ background: 'var(--off)', border: '1px dashed var(--border)', borderRadius: 8, padding: '14px 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>{children}</div>;
}

export function Loading({ what = 'data' }) {
  return <div style={{ color: 'var(--muted)', padding: 28, textAlign: 'center', fontSize: 13 }}>Loading {what}…</div>;
}
export function ErrorBox({ error }) {
  return <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{error}</div>;
}

// Column chart, one series. Labels only on the latest and the peak; the
// tooltip carries every value.
export function Columns({ data, valueKey = 'value', labelKey = 'label', height = 150, tip }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map(d => d[valueKey] || 0));
  const peak = data.reduce((best, d, i) => ((d[valueKey] || 0) > (data[best]?.[valueKey] || 0) ? i : best), 0);
  const last = data.length - 1;
  // Bars and labels are absolutely positioned so a label can never squeeze its
  // bar: height is purely value / max, with fixed headroom for the label.
  const plot = height - 20;
  return (
    <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <div style={{ display: 'flex', gap: 2, height, borderBottom: `1px solid ${GRID}` }}>
        {data.map((d, i) => {
          const v = d[valueKey] || 0;
          const h = Math.max(v ? 3 : 0, Math.round((v / max) * plot));
          const showLabel = v > 0 && (i === last || i === peak);
          return (
            <div key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
              aria-label={`${d[labelKey]}: ${v}`}
              style={{ flex: 1, position: 'relative', height: '100%', cursor: 'default', outline: 'none' }}>
              {showLabel && <div style={{ position: 'absolute', bottom: h + 3, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: INK2 }}>{v}</div>}
              <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 24, height: h, background: hover === i ? '#1c5cab' : SERIES, borderRadius: '4px 4px 0 0' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 5 }}>
        {data.map((d, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: MUTED }}>{d[labelKey]}</div>)}
      </div>
      {hover !== null && (
        <div style={{
          position: 'absolute', top: -6, left: `${((hover + 0.5) / data.length) * 100}%`, transform: 'translateX(-50%)',
          background: '#0b0b0b', color: '#fff', fontSize: 11.5, padding: '6px 9px', borderRadius: 6, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5,
        }}>{tip ? tip(data[hover]) : `${data[hover][labelKey]}: ${data[hover][valueKey]}`}</div>
      )}
    </div>
  );
}

// Horizontal bars, one series (e.g. planning stages, sources). Value at the tip.
export function HBars({ rows, valueKey = 'value', labelKey = 'label', format = v => v, tip, labelWidth = 150 }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...rows.map(r => r[valueKey] || 0));
  return (
    <div onMouseLeave={() => setHover(null)}>
      {rows.map((r, i) => {
        const v = r[valueKey] || 0;
        return (
          // Label | track | value. The bar is a share of its own track, so the
          // value text can never squeeze it out of proportion.
          <div key={i} onMouseEnter={() => setHover(i)} title={tip ? tip(r) : undefined}
            style={{ display: 'grid', gridTemplateColumns: `minmax(0, ${labelWidth}px) minmax(40px, 1fr) auto`, alignItems: 'center', gap: 10, padding: '5px 0' }}>
            <div style={{ fontSize: 12.5, color: INK2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[labelKey]}</div>
            <div style={{ height: 14 }}>
              <div style={{ height: 14, width: `${v ? Math.max(1.5, (v / max) * 100) : 0}%`, background: hover === i ? '#1c5cab' : SERIES, borderRadius: '0 4px 4px 0' }} />
            </div>
            <span style={{ fontSize: 12, color: '#0b0b0b', whiteSpace: 'nowrap', minWidth: 24 }}>{format(v, r)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Table({ cols, rows, empty = 'Nothing yet.' }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>{cols.map(c => <th key={c.key} style={{ textAlign: c.align || 'left', padding: '9px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key || i}>
              {cols.map(c => <td key={c.key} style={{ textAlign: c.align || 'left', padding: '9px 12px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--off)', verticalAlign: 'top', whiteSpace: c.wrap ? 'normal' : 'nowrap' }}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const btn = (primary = false) => ({
  background: primary ? 'var(--black)' : '#fff', color: primary ? '#fff' : 'var(--text)',
  border: `1px solid ${primary ? 'var(--black)' : 'var(--border)'}`, borderRadius: 6, padding: '8px 13px', fontSize: 12.5, fontWeight: 500,
});
export const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff', fontSize: 13 };
export const labelStyle = { display: 'block', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 5 };
