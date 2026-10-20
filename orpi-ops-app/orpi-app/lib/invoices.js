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

import crypto from 'crypto';
import { createAdminClient } from './supabaseServer';
import { TERMS_VERSION } from './terms';

const keyFor = token => `invoice:${token}`;

export function newToken() {
  // URL-safe, unguessable. ~24 chars.
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
  const record = {
    token,
    enquiryId: enquiryId || null,
    client: (clean.s && clean.s.client) || '',
    createdAt: new Date().toISOString(),
    createdByEmail: createdByEmail || null,   // internal only — never sent to the public view
    termsVersion: TERMS_VERSION,
    snapshot: clean,
    agreement: null,
  };
  const supabase = createAdminClient();
  const { error } = await supabase.from('app_state').upsert(
    { key: keyFor(token), value: record, updated_at: record.createdAt },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
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

// Record the client's typed acceptance. Idempotent: once accepted, the first
// acceptance stands and is returned unchanged.
export async function recordAcceptance(token, { name, ip }) {
  const record = await getInvoice(token);
  if (!record) return { ok: false, notFound: true };
  if (record.agreement) return { ok: true, record, already: true };

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
    termsVersion: record.termsVersion,
    snapshot: record.snapshot,
    agreement: record.agreement || null,
  };
}
