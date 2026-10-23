import { currentUser } from '@/lib/session';
import BriefClient from './BriefClient';

export const metadata = { title: 'Weekly brief — ORPI Ops' };

export default async function BriefPage() {
  const me = await currentUser();
  return <BriefClient userEmail={me.email} role={me.role} />;
}
