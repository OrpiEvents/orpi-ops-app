// lib/invoices.js
//
// Client-facing deposit invoices + typed T&C acceptance. An invoice is a
// point-in-time snapshot of an agreed quote, stored under a random token in the
// shared app_state table and rendered on the public /i/[token] page. The client
// reads the full Terms, types their name to accept, and only then sees the
// deposit-payment details — so what ORPI provides vs what the client provides
// is agreed, in writing, before any money changes hands.
//
// All reads/writes here use the service-role admin client, because the client
// is NOT signed in. The token is the capability: anyone with the link can view
// and accept that one invoice, and nothing else.
//
// Safety model: the token is 144-bit random (unguessable); the snapshot is
// sanitised (no costs/margin/pay rates); a link is valid for EXPIRY_DAYS, then
// an unsigned link stops working; creating a new link for an enquiry retires
// earlier unsigned links; and once signed, acceptance is locked.

import crypto from 'crypto';
import { createAdminClient } from './supabaseServer';
import { TERMS_VERSION } from './terms';

const keyFor = token => `invoice:${token}`;

// How long a signing link stays usable. Matches the 14-day quote validity.
export const EXPIRY_DAYS = 14;

function addDays(iso, days) {
  const t = new Date(iso || Date.now()).getTime();
  return new Date(t + days * 24 * 60 * 60 * 1000).toISOString();
}

// The live state of a link. A signed link is always viewable (it's a committed
// booking); an unsigned one goes stale once revoked or past its expiry.
//   active | accepted | expired | revoked | missing
export function invoiceState(record) {
  if (!record) return 'missing';
  if (record.agreement) return 'accepted';
  if (record.revoked) return 'revoked';
  const exp = record.expiresAt || addDays(record.createdAt, EXPIRY_DAYS);
  if (Date.now() > new Date(exp).getTime()) return 'expired';
  return 'active';
}

export function newToken() {
  // URL-safe, unguessable. ~24 chars, 144 bits of entropy.
  return crypto.randomBytes(18).toString('base64url');
}

// Strip everything internal before an invoice leaves the building: supplier
// cost lines, margin, the cost checklist, staff pay rates, and the client's own
// contact details (not needed to render the document). What remains is exactly
// what the client-facing QuotePreview draws.
export function sanitizeSnapshot(snap) {
  const s = (snap && snap.s) || {};
  const safeS = {
    ...s,
    email: '',
    phone: '',
    enquiryNotes: '',
    costLines: [],
    costChecks: {},
    prepHrs: '',
    prepRate: '',
    alcoholOverride: '',
    staffRows: Array.isArray(s.staffRows)
      ? s.staffRows.map(r => ({ id: r.id, role: r.role, count: r.count }))
      : (s.staffRows == null ? null : s.staffRows),
  };
  delete safeS.marginPct;
  return {
    s: safeS,
    addonTotal: Number(snap && snap.addonTotal) || 0,
    total: Number(snap && snap.total) || 0,
    dep: Number(snap && snap.dep) || 0,
  };
}

export async function createInvoice({ snapshot, enquiryId, createdByEmail }) {
  const token = newToken();
  const clean = sanitizeSnapshot(snapshot);
  const createdAt = new Date().toISOString();
  const record = {
    token,
    enquiryId: enquiryId || null,
    client: (clean.s && clean.s.client) || '',
    createdAt,
    expiresAt: addDays(createdAt, EXPIRY_DAYS),
    revoked: false,
    createdByEmail: createdByEmail || null,   // internal only — never sent to the public view
    termsVersion: TERMS_VERSION,
    snapshot: clean,
    agreement: null,
  };
  const supabase = createAdminClient();
  const { error } = await supabase.from('app_state').upsert(
    { key: keyFor(token), value: record, updated_at: createdAt },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);

  // Replacing the client's link: retire any earlier UNSIGNED links for the same
  // enquiry, so a client can't accept a superseded version. Best-effort.
  if (record.enquiryId) {
    try { await revokeSupersededForEnquiry(record.enquiryId, token); } catch { /* non-fatal */ }
  }
  return record;
}

export async function getInvoice(token) {
  if (!token) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_state').select('value').eq('key', keyFor(token)).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.value : null;
}

// Mark earlier unsigned links for the same enquiry as revoked. A signed link is
// never touched — its acceptance is a real record.
export async function revokeSupersededForEnquiry(enquiryId, exceptToken) {
  if (!enquiryId) return;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_state').select('key,value').like('key', 'invoice:%');
  if (error || !data) return;
  for (const row of data) {
    const rec = row.value;
    if (!rec || rec.token === exceptToken) continue;
    if (String(rec.enquiryId) !== String(enquiryId)) continue;
    if (rec.agreement || rec.revoked) continue;   // never retire a signed (or already-retired) link
    rec.revoked = true;
    rec.revokedAt = new Date().toISOString();
    await supabase.from('app_state').upsert(
      { key: row.key, value: rec, updated_at: rec.revokedAt },
      { onConflict: 'key' }
    );
  }
}

// Record the client's typed acceptance. Idempotent: once accepted, the first
// acceptance stands. Refuses a revoked or expired link.
export async function recordAcceptance(token, { name, ip }) {
  const record = await getInvoice(token);
  if (!record) return { ok: false, notFound: true };
  if (record.agreement) return { ok: true, record, already: true };

  const st = invoiceState(record);
  if (st === 'revoked') return { ok: false, revoked: true };
  if (st === 'expired') return { ok: false, expired: true };

  record.agreement = {
    name: String(name || '').trim().slice(0, 120),
    acceptedAt: new Date().toISOString(),
    ip: ip || null,
    termsVersion: record.termsVersion || TERMS_VERSION,
  };
  const supabase = createAdminClient();
  const { error } = await supabase.from('app_state').upsert(
    { key: keyFor(token), value: record, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
  return { ok: true, record };
}

// What the public page is allowed to see — no internal author email.
export function publicView(record) {
  if (!record) return null;
  return {
    token: record.token,
    client: record.client,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt || addDays(record.createdAt, EXPIRY_DAYS),
    status: invoiceState(record),
    termsVersion: record.termsVersion,
    snapshot: record.snapshot,
    agreement: record.agreement || null,
  };
}
