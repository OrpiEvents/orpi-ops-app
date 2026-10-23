import { currentUser } from '@/lib/session';
import ContentClient from './ContentClient';

export const metadata = { title: 'Content plan — ORPI Ops' };

export default async function ContentPage() {
  const me = await currentUser();
  return <ContentClient userEmail={me.email} role={me.role} />;
}
