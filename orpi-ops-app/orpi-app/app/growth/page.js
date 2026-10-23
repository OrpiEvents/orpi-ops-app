import { currentUser } from '@/lib/session';
import OverviewClient from './OverviewClient';

export const metadata = { title: 'Growth — ORPI Ops' };

export default async function GrowthPage() {
  const me = await currentUser();
  return <OverviewClient userEmail={me.email} role={me.role} />;
}
