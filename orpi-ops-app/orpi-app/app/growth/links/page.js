import { currentUser } from '@/lib/session';
import LinksClient from './LinksClient';

export const metadata = { title: 'Tracked links — ORPI Ops' };

export default async function LinksPage() {
  const me = await currentUser();
  return <LinksClient userEmail={me.email} role={me.role} />;
}
