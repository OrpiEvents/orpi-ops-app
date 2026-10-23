import { currentUser } from '@/lib/session';
import TeamClient from './TeamClient';

export const metadata = { title: 'Team — ORPI Ops' };

export default async function TeamPage() {
  const me = await currentUser();
  return <TeamClient userEmail={me.email} role={me.role} myId={me.id} />;
}
