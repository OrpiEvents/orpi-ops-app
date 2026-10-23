import { getMetaConfig } from '@/lib/growthStore';
import { ATTR_KEYS } from '@/lib/tracking';
import EnquireForm from './EnquireForm';

// Public enquiry page: the Instagram bio link, story links and ads point here
// (through a tracked /go/ link) until the website launches; the website's own
// form will post to the same API. Kept out of search results — the website is
// the page that should rank.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Enquire — ORPI Events',
  description: 'Tell us about your event and we’ll come back with a tailored quote.',
  robots: { index: false, follow: false },
};

export default async function EnquirePage({ searchParams }) {
  const pick = k => (typeof searchParams?.[k] === 'string' ? searchParams[k].slice(0, 200) : '');
  const attribution = Object.fromEntries(ATTR_KEYS.map(k => [k, pick(k)]));
  let pixelId = '';
  try { pixelId = (await getMetaConfig())?.pixelId || ''; } catch { /* no pixel → no cookie banner */ }
  return <EnquireForm attribution={attribution} pixelId={pixelId} />;
}
