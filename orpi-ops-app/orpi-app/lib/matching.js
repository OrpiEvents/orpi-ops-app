// lib/matching.js
//
// Matching a typed product name against stock. Used by the quote builder's
// picker, and by the run sheet when it pulls a booking's drinks list — both
// have to cope with "Absolut" meaning "Absolut Vodka 1L" and with someone
// typing "Barcadi".
//
// Lived in the quote builder until the run sheet needed it too.

// Strip everything that differs between how a quote names a drink and how
// stock does: sizes, punctuation, and the category words that appear in half
// the list. "Absolut Vodka 1L" and "Absolut" both reduce to "absolut".
function normName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019'`.,()\-]/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(cl|ml|l|ltr|litre|litres)\b/g, ' ')
    .replace(/\b(vodka|gin|rum|whisky|whiskey|bourbon|tequila|cognac|brandy|liqueur|beer|lager|cider|wine|prosecco|champagne|bottles?|cans?|premium|original|dry|the|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}
const ratio = (a, b) => (!a || !b ? 0 : 1 - levenshtein(a, b) / Math.max(a.length, b.length));

// How close is what was typed to a stock item? 1 = certain, 0 = unrelated.
// Compared against the whole normalised name and against its first word, so
// "Absolut" scores full marks against "Absolut Vodka 1L" without "Ciroc
// Coconut" scoring highly against "Ciroc Red Berry".
function matchScore(typed, stockName) {
  const t = normName(typed), s = normName(stockName);
  if (!t || !s || t.length < 3) return 0;
  if (t === s) return 1;
  if (s.includes(t) || t.includes(s)) return 0.95;
  return Math.max(ratio(t, s), ratio(t, s.split(' ')[0] || ''));
}

// Anything at or above this is treated as the same product. Below it but above
// SUGGEST_AT, we ask rather than assume.
const SAME_AT = 0.9;
const SUGGEST_AT = 0.62;

function inStock(name, options) {
  return options.some(o => matchScore(name, o.name) >= SAME_AT);
}

// Closest stock items to what was typed, for the "did you mean" step.
function nearMatches(name, options) {
  return options
    .map(o => ({ o, score: matchScore(name, o.name) }))
    .filter(x => x.score >= SUGGEST_AT && x.score < SAME_AT)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.o);
}

export { normName, levenshtein, ratio, matchScore, inStock, nearMatches, SAME_AT, SUGGEST_AT };
