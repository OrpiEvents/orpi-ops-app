import { createAdminClient } from './supabaseServer';

// Records one row per change: who, what action, on which record, and any
// useful detail. Called from every API route that writes to Notion.
// Uses the admin client so logging never fails due to permissions —
// the *authorization* to perform the action itself already happened
// upstream (the route checked getUser() before calling this).
export async function logActivity({ userEmail, action, target, detail }) {
  try {
    const supabase = createAdminClient();
    await supabase.from('activity_log').insert({
      user_email: userEmail,
      action,       // e.g. 'enquiry.create', 'enquiry.update', 'booking.update'
      target,       // human-readable, e.g. 'Priya & Arjun'
      detail: detail || null,
    });
  } catch (err) {
    // Logging failures should never break the actual operation the user asked for.
    console.error('Activity log failed:', err.message);
  }
}
