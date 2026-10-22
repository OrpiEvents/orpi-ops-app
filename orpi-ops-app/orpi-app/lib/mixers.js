// lib/mixers.js
//
// Mixer brand levels. An event is set to a level — Fever-Tree (premium) or
// Schweppes (standard) — and the run sheet resolves every recipe carbonate to
// that level, so a Schweppes event never shows Fever-Tree on the sheet, the
// shopping list or the cost. It rides the run sheet's existing per-event swap
// mechanism: levelSwaps() returns name→name swaps that merge UNDER any explicit
// swap the user set, so a deliberate one-off swap always wins.
//
// Only carbonate families with a real counterpart move. Bitter lemon has no
// Schweppes line and lemonade has no Fever-Tree line, so those stay as written.
// Specialty mixers (rose lemonade, pink grapefruit, cola) aren't tiered.
//
// Product names must match the inventory Item Name exactly, or the swap won't
// resolve to a stocked bottle.

export const MIXER_LEVELS = [
  { key: 'fevertree', label: 'Fever-Tree', note: 'premium' },
  { key: 'schweppes', label: 'Schweppes', note: 'standard' },
];

// Each family: the Fever-Tree product name(s) on one side, the Schweppes
// equivalent on the other. A blank side means that level has no equivalent.
const FAMILIES = [
  { ft: ['Fever-Tree Indian Tonic Water', 'Fever-Tree Tonic'], sch: 'Schweppes Indian Tonic' },
  { ft: ['Fever-Tree Refreshingly Light Tonic'],               sch: 'Schweppes Slimline Tonic' },
  { ft: ['Fever-Tree Soda Water'],                             sch: 'Schweppes Soda Water' },
  { ft: ['Fever-Tree Ginger Ale'],                             sch: 'Schweppes Ginger Ale' },
  { ft: ['Fever-Tree Ginger Beer'],                            sch: 'Ginger Beer' },
  { ft: ['Fever-Tree Bitter Lemon'],                           sch: '' },               // no Schweppes line
  { ft: [],                                                     sch: 'Schweppes Lemonade' }, // no Fever-Tree line
];

// A { fromName: toName } map converting every off-level carbonate to `level`.
// Merged under the user's explicit swaps on the run sheet.
export function levelSwaps(level) {
  const out = {};
  if (level === 'schweppes') {
    for (const f of FAMILIES) if (f.sch) for (const ft of f.ft) out[ft] = f.sch;
  } else if (level === 'fevertree') {
    for (const f of FAMILIES) if (f.ft[0] && f.sch) out[f.sch] = f.ft[0];
  }
  return out;
}

// Short "from → to" hints for the UI, so you can see what a level will change.
export function levelAffects(level) {
  return Object.entries(levelSwaps(level)).map(([from, to]) => `${from} → ${to}`);
}
