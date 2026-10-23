import { currentUser } from '@/lib/session';
import AdsClient from './AdsClient';

export const metadata = { title: 'Ads — ORPI Ops' };

export default async function AdsPage() {
  const me = await currentUser();
  return <AdsClient userEmail={me.email} role={me.role} />;
}
