// Who can see what.
//
// The role lives on the Supabase auth user (app_metadata.role), set from the
// Team page, so it travels in the session and the database can check it too
// (public.orpi_role() mirrors roleOf below — keep them in step).
//
//   director  — everything (Ruds, Punit)
//   marketing — the Growth workspace only (Reeya): content, links, Instagram
//               and ads numbers. No costs, margins, quotes, invoices or client
//               contact details.
//
// No role on the account: an @orpi.events address counts as a director so the
// original login keeps working; anyone else gets nothing.

export const ROLES = {
  director: { label: 'Director', home: '/dashboard' },
  marketing: { label: 'Marketing', home: '/growth' },
};

export function roleOf(user) {
  if (!user) return 'none';
  const r = user.app_metadata?.role;
  if (r) return ROLES[r] ? r : 'none';      // 'disabled' or anything unknown → no access
  return (user.email || '').toLowerCase().endsWith('@orpi.events') ? 'director' : 'none';
}

export const homeFor = role => ROLES[role]?.home || '/login';

// Marketing gets the Growth workspace and its APIs, minus the parts that show
// individual clients (the re-engagement queue) or change account settings.
const MARKETING_ALLOW = [/^\/growth(\/|$)/, /^\/api\/growth(\/|$)/, /^\/welcome(\/|$)/];
const MARKETING_DENY = [/^\/growth\/reengage(\/|$)/, /^\/api\/growth\/reengage(\/|$)/];

export function canAccess(role, pathname) {
  if (role === 'director') return true;
  if (role === 'marketing') {
    return MARKETING_ALLOW.some(re => re.test(pathname)) && !MARKETING_DENY.some(re => re.test(pathname));
  }
  return false;
}
