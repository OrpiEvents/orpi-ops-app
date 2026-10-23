import { currentUser } from '@/lib/session';
import SetupClient from './SetupClient';

export const metadata = { title: 'Connections — ORPI Ops' };

export default async function SetupPage() {
  const me = await currentUser();
  return <SetupClient userEmail={me.email} role={me.role} />;
}
