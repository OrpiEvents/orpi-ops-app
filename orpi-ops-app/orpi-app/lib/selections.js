// lib/selections.js
//
// The event's drink selections — spirits, beer, mixers/softs — carried as text
// through the whole chain: quote → enquiry → booking → run sheet. Two jobs:
//
//  1. Supplier per line. Each line can say who brings it. ORPI is the default
//     and stays untagged; a client-supplied line is tagged inline as
//     "Grey Goose (client)" so the text stays readable in Notion and survives
//     the hand-edits/substitutions that happen in the lead-up to an event.
//
//  2. Flattening. The quote writes brands grouped as "Vodka: Absolut, Grey
//     Goose". The booking and run sheet only want the brand names, one per
//     line, so splitList in the run sheet doesn't choke on the "Vodka:" prefix.
//
// No React, no browser APIs — safe to import from server routes and the run
// sheet alike.

const CLIENT_RE = /\s*\((?:client|guest)\)\s*$/i;
const ORPI_RE = /\s*\((?:orpi|us|we|house)\)\s*$/i;

// One line → { name, by }. Unmarked means ORPI supplies it.
export function parseLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;
  if (CLIENT_RE.test(raw)) return { name: raw.replace(CLIENT_RE, '').trim(), by: 'client' };
  if (ORPI_RE.test(raw)) return { name: raw.replace(ORPI_RE, '').trim(), by: 'orpi' };
  return { name: raw, by: 'orpi' };
}

// { name, by } → one line. Only client is tagged; ORPI is the silent default,
// so a sheet with no client-supplied lines reads exactly as it does today.
export function encodeLine(name, by) {
  const n = String(name || '').trim();
  if (!n) return '';
  return by === 'client' ? `${n} (client)` : n;
}

// A free-text selection field → [{ name, by }]. Accepts both the quote's
// grouped form ("Category: a, b, c" per line) and a plain one-per-line list,
// and keeps any "(client)" tags. Items split on commas, groups on newlines
// and semicolons.
export function parseSelection(text) {
  return String(text || '')
    .split(/[\n;]+/)
    .flatMap(seg => {
      // Drop a leading "Category:" label if present ("Vodka: Absolut, …").
      const m = seg.match(/^\s*[^:,]+:\s*(.*)$/);
      return (m ? m[1] : seg).split(',');
    })
    .map(parseLine)
    .filter(Boolean);
}

// Re-encode parsed lines to a clean, one-per-line string for a booking field.
// This is what fixes the latent "Vodka: Absolut" bug: the booking stores brand
// names the run sheet can match, with supplier tags carried through.
export function encodeSelection(lines) {
  return (lines || [])
    .filter(Boolean)
    .map(l => encodeLine(l.name, l.by))
    .filter(Boolean)
    .join('\n');
}

// Flatten a grouped quote field straight to a clean booking field in one step.
export function flattenForBooking(text) {
  return encodeSelection(parseSelection(text));
}

// Who's supplying the alcohol overall, from the parsed alcohol lines (spirits
// + beer). '' when there are none, else ORPI / Client / Mixed — a quick summary
// for the booking and the bookings list.
export function alcoholSupplier(lines) {
  const arr = (lines || []).filter(Boolean);
  if (!arr.length) return '';
  const client = arr.filter(l => l.by === 'client').length;
  if (client === 0) return 'ORPI';
  if (client === arr.length) return 'Client';
  return 'Mixed';
}

// Case/space-insensitive key for matching a line's name to a stock item or to
// another line — the same shape the run sheet already uses for its bottle keys.
export function nameKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
