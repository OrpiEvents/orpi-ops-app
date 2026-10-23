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
// No role on the account: only the original director login(s), listed by exact
// address, count as a director, so they keep working until their role is set
// on the Team page. Anyone else without a role gets nothing. (Not the whole
// @orpi.events domain: with self sign-up on, anyone could register one.)
const LEGACY_DIRECTORS = () => (process.env.DIRECTOR_EMAILS || 'rudhra@orpi.events')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export const ROLES = {
  director: { label: 'Director', home: '/dashboard' },
  marketing: { label: 'Marketing', home: '/growth' },
};

export function roleOf(user) {
  if (!user) return 'none';
  const r = user.app_metadata?.role;
  if (r) return ROLES[r] ? r : 'none';      // 'disabled' or anything unknown → no access
  return LEGACY_DIRECTORS().includes((user.email || '').toLowerCase()) ? 'director' : 'none';
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
