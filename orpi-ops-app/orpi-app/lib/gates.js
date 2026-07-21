// Central gating logic for the ORPI booking lifecycle.
//
// Every transition that changes a record's meaningful state (enquiry → won,
// booking planning → cocktails confirmed, booking → completed) runs through
// checkGates() first. The function returns an array of unmet requirements
// so the UI can:
//   - Disable the action button when the array is non-empty
//   - Show each blocker with a clear label and where to fix it
//   - Let the person cross items off and see the button become active
//
// Gates are ordered: cheaper checks first, so a user sees the most obvious
// blocker before an expensive one (e.g. missing event date before drink match).

/** Match a menu string against the drinks library. Returns { resolved, unresolved }. */
export function resolveMenuNames(menuCsv, drinksLibrary) {
  if (!menuCsv) return { resolved: [], unresolved: [] };
  const names = menuCsv.split(',').map(s => s.trim()).filter(Boolean);
  const resolved = [], unresolved = [];
  for (const name of names) {
    if (name.toLowerCase() === 'tbc') continue; // TBC is an explicit "not yet decided"
    const clean = name.toLowerCase();
    const match = drinksLibrary.find(d =>
      d.name.trim().toLowerCase() === clean ||
      d.name.toLowerCase().includes(clean) ||
      clean.includes(d.name.toLowerCase())
    );
    if (match) resolved.push({ typed: name, matched: match.name });
    else unresolved.push(name);
  }
  return { resolved, unresolved };
}

// Same parser used by lib/notion.js — kept in sync but duplicated here so
// gates can be checked without an async recipe fetch.
function parseOverrideNames(overridesText) {
  if (!overridesText) return new Set();
  const names = new Set();
  overridesText.split(/\r?\n/).forEach(line => {
    const m = line.trim().match(/^(.+?):\s*$/);
    if (m) names.add(m[1].trim().toLowerCase());
  });
  return names;
}

/**
 * Gates for marking an enquiry as Won.
 * @param {object} enquiry
 * @returns {Array<{label, fix}>} unmet requirements
 */
export function enquiryWonGates(enquiry) {
  const gates = [];
  if (!enquiry.eventDate) gates.push({
    label: 'Event date must be set',
    fix: 'Edit the enquiry and add the event date',
  });
  if (!enquiry.quoteSent || enquiry.quoteSent <= 0) gates.push({
    label: 'Quote must be sent with an amount',
    fix: 'Send a quote from the Quote builder first — the amount is stored automatically',
  });
  return gates;
}

/**
 * Gates for setting the cocktail-confirmed or mocktail-confirmed checkbox on a booking.
 * Every drink in the menu must be resolvable — either in the ORPI Drinks Library,
 * covered by a recipe override on this booking, or explicitly marked TBC.
 */
export function drinksConfirmationGates(menuCsv, drinksLibrary, menuLabel, overridesText = '') {
  const gates = [];
  const { unresolved } = resolveMenuNames(menuCsv, drinksLibrary);
  const overrideNames = parseOverrideNames(overridesText);
  // Anything unresolved by the library but covered by an override is fine.
  const stillUnresolved = unresolved.filter(name => !overrideNames.has(name.toLowerCase()));
  if (stillUnresolved.length) {
    gates.push({
      label: `${menuLabel} not in Drinks Library: ${stillUnresolved.join(', ')}`,
      fix: 'Add these to the ORPI Drinks Library in Notion, add a recipe override on this booking, or fix the spelling',
    });
  }
  return gates;
}

/**
 * Gates for marking an event Completed. This is the final close-the-loop check.
 *
 * @param {object} booking      — the booking record
 * @param {Array}  costs        — cost lines linked to this booking
 * @param {object} opts
 * @param {Array}  opts.drinksLibrary  — for a final drinks-in-library check
 */
export function eventCompletionGates(booking, costs, { drinksLibrary = [] } = {}) {
  const gates = [];

  // Payment must be closed out.
  if (!booking.depositReceived) gates.push({
    label: 'Deposit not yet marked received',
    fix: 'Booking → Planning tab → tick "Deposit received"',
  });
  if (!booking.balanceReceived) gates.push({
    label: 'Balance not yet marked received',
    fix: 'Booking → Planning tab → tick "Balance received"',
  });

  // Menu confirmations must be honest — cannot tick "confirmed" with unresolved drinks.
  const ctGates = drinksConfirmationGates(booking.cocktailMenu, drinksLibrary, 'Cocktails', booking.cocktailRecipeOverrides);
  const mtGates = drinksConfirmationGates(booking.mocktailMenu, drinksLibrary, 'Mocktails', booking.mocktailRecipeOverrides);
  if (booking.cocktailMenu && !booking.cocktailsConfirmed) gates.push({
    label: 'Cocktails not yet confirmed with client',
    fix: 'Booking → Planning tab → tick "Cocktails confirmed"',
  });
  if (booking.mocktailMenu && !booking.mocktailsConfirmed) gates.push({
    label: 'Mocktails not yet confirmed with client',
    fix: 'Booking → Planning tab → tick "Mocktails confirmed"',
  });
  gates.push(...ctGates, ...mtGates);

  // Ops readiness.
  if (!booking.staffConfirmed) gates.push({
    label: 'Staff not confirmed',
    fix: 'Booking → Planning tab → tick "Staff confirmed"',
  });
  if (!booking.venueAccessConfirmed) gates.push({
    label: 'Venue access not confirmed',
    fix: 'Booking → Planning tab → tick "Venue access confirmed"',
  });

  // If ORPI supplied the alcohol, the event's true cost only exists after
  // stock reconciliation. Detected by presence of at least one stock-linked
  // cost line (i.e. a cost with a real Inventory Items relation), which is
  // what the reconciliation flow creates. Manual "Alcohol - £500" entries
  // don't count — that's an estimate, not a reconciliation.
  if (booking.alcoholProvidedBy === 'ORPI') {
    const hasStockLinked = costs.some(c => c.isStockLinked);
    if (!hasStockLinked) gates.push({
      label: 'Stock reconciliation not done — no linked alcohol/mixer costs recorded',
      fix: 'Open the Checklist → scroll to "Confirm stock used (post-event)" → enter taken out vs returned',
    });
  }

  return gates;
}
