// app/runsheet/page.js
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseBrowser';
import AppShell from '../AppShell';
import RunsheetClient from './RunsheetClient';

export default function RunsheetPage() {
  const [email, setEmail] = useState(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data?.user?.email ?? null));
  }, []);

  // bleed drops the desktop padding and max-width — the run sheet is a
  // phone-first layout and manages its own spacing.
  return (
    <AppShell active="/runsheet" userEmail={email} bleed>
      <RunsheetClient />
    </AppShell>
  );
}
