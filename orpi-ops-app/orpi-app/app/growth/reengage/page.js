import { currentUser } from '@/lib/session';
import ReengageClient from './ReengageClient';

export const metadata = { title: 'Re-engage — ORPI Ops' };

export default async function ReengagePage() {
  const me = await currentUser();
  return <ReengageClient userEmail={me.email} role={me.role} />;
}
