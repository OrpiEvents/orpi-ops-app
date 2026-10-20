// lib/terms.js
//
// The agreed ORPI Events Terms & Conditions, embedded in the app so the
// client-facing sign-and-pay page can show them in full and the acceptance
// record can log exactly which version the client agreed to.
//
// Keep this in step with the master T&Cs document. When the wording changes
// materially, bump TERMS_VERSION — past acceptances keep their old version
// string, so you always know what each client actually signed.
//
// Bold lead-ins are marked with **…** and rendered by the page.

export const TERMS_VERSION = '2026-10-20';
export const TERMS_TITLE = 'Terms & Conditions';

export const TERMS_INTRO =
  'These terms govern the supply of mobile bar and event services by **ORPI Events Ltd** ' +
  '("ORPI", "we", "us") to the client named on the accompanying quotation or invoice ' +
  '("you", "the Client"). Paying the deposit and signing below confirms your acceptance of these terms.';

export const TERMS_CLAUSES = [
  {
    n: 1, title: 'The agreement', items: [
      'Our agreement consists of your final quotation/invoice, these Terms, and any variations we both agree in writing.',
      '"Event" means the event on your quotation/invoice; "Services" means the bar, staff, drinks and extras listed there.',
    ],
  },
  {
    n: 2, title: 'Booking & confirmation', items: [
      'A booking is confirmed only once we receive your deposit (clause 3) **and** your acceptance of these Terms. Until then your date stays open to other enquiries.',
      'Quotations are valid for **14 days** from issue; pricing may change after.',
    ],
  },
  {
    n: 3, title: 'Payment', items: [
      '**Deposit:** 50% of the total, due on booking, non-refundable except as set out in clause 8.',
      '**Balance:** the remaining 50% due no later than **14 days** before the Event.',
      'Payment by bank transfer to the account on your invoice, using your surname + event date as the reference.',
      'If the balance is not received by the due date, we may treat the booking as cancelled by you (clause 8) and release the date.',
    ],
  },
  {
    n: 4, title: "What's included — what we provide vs what you provide", items: [
      'Your final quotation/invoice is the **definitive list** of what is included. Anything not listed is not included.',
      'Each drink line on your quotation is marked **ORPI-provided** or **Client-provided**. We supply and are responsible only for ORPI-provided items; you are responsible for supplying, in good time, anything marked Client-provided (for example certain alcohol).',
      'Where **you** supply alcohol, you are responsible for its quantity, quality, licensing/duty status and timely delivery to the venue. We are not liable for shortfalls or the quality of Client-supplied items.',
      "We provide the bar unit stated on your quotation, or use the venue's own bar where that is stated.",
      'Mixers, ice, garnishes, glassware/disposables, bar equipment and staff are included only as stated on your quotation.',
      'This quote is for **bar service only**. Drinks served to tables — bottles on tables, or table/waiter service — are **not included** and are quoted separately.',
    ],
  },
  {
    n: 5, title: 'Final numbers & changes', items: [
      'Final guest numbers and menu must be confirmed **7 days** before the Event. Increases are charged at the agreed per-head rate; we cannot guarantee increases requested after this point.',
      'Any change to the Services after booking must be agreed in writing and may change the price.',
      'Quotes are based on the **minimum number of guests attending**. Guest numbers cannot be reduced after booking and no refund is given for fewer guests; any additional guests may be charged after the event at the agreed per-head rate.',
      '**Extending the bar on the day:** any extension of bar hours agreed on the day must be paid in full before service resumes, otherwise the Client is held liable for the extension charge.',
    ],
  },
  {
    n: 6, title: 'Your responsibilities (venue, access & facilities)', items: [
      'You are responsible for ensuring we have, in good time: suitable access for set-up and pack-down; adequate level, dry, sheltered space for the bar; a **standard 13A** power supply within reach where we use electrical equipment; access to water where required; parking/loading for our vehicle; and any venue permissions needed for a bar to operate.',
      'Tell us in advance about restricted access (e.g. stairs, long carries, time-limited load-in).',
      'We are not responsible for delays or inability to perform caused by inadequate access, power, space or permissions.',
    ],
  },
  {
    n: 7, title: 'Licensing & responsible service', items: [
      'We serve alcohol in line with UK licensing law. We operate **Challenge 25** and may refuse service to anyone who cannot show valid ID, who is or appears intoxicated, or whose behaviour is unacceptable.',
      'Our team holds **Personal Licences** and the venue holds the **premises licence** that covers the bar. Where the venue has no premises licence, a Temporary Event Notice (TEN) may be required — the Client must tell us in advance if a TEN is needed.',
      'You agree to support our staff in the responsible service of alcohol, including not pressing us to serve where we have refused.',
    ],
  },
  {
    n: 8, title: 'Cancellation & postponement', items: [
      '**By you** (in writing): more than **60 days** before the Event — deposit retained; within **60 days** — **50%** of the total due; within **14 days** — **100%** of the total due.',
      '**Postponement:** we will try to accommodate a date change subject to our availability. As we may already be booked, a fee may apply. If we cannot cover the new date, the cancellation terms above apply.',
      '**By us:** if we must cancel other than for your breach or a force-majeure event, we will refund sums you have paid; our liability is limited to those sums (clause 10).',
    ],
  },
  {
    n: 9, title: 'Damage, loss & breakages', items: [
      "From set-up to pack-down you are responsible for our equipment, bar, glassware and stock at the venue (other than fair wear and our staff's own fault), and for any loss or damage caused by you or your guests.",
      'Lost or damaged hired glassware is charged at **£3 a glass**. This does not cover the occasional breakage expected during normal service — only glassware lost or damaged beyond normal use (for example by guests).',
    ],
  },
  {
    n: 10, title: 'Liability & insurance', items: [
      'We hold public liability insurance of **£5m**; evidence available on request.',
      'Nothing in these Terms limits liability for death or personal injury caused by negligence, for fraud, or for anything that cannot be limited by law.',
      'Subject to that, our total liability for the booking is limited to the total price paid for the Services, and we are not liable for indirect or consequential loss, or for the acts of your guests, the venue or third parties you engage.',
    ],
  },
  {
    n: 11, title: 'Force majeure & adverse weather', items: [
      'Neither party is liable for failure caused by events beyond reasonable control (severe weather, fire, flood, power failure, strikes, epidemic/pandemic, government restriction). We will work with you to reschedule where possible.',
      'For outdoor events you must provide adequate shelter for the bar and staff; we may decline to operate where conditions are unsafe.',
    ],
  },
  {
    n: 12, title: 'Allergens & dietary', items: [
      'We provide allergen information on request for drinks we supply. You must tell us of guest allergies in advance; we cannot guarantee an allergen-free environment.',
    ],
  },
  {
    n: 13, title: 'Photography & marketing', items: [
      'We may photograph/film our bar and set-up for marketing, without focusing on identifiable guests who have not consented. To opt out, tell us in writing before the Event.',
    ],
  },
  {
    n: 14, title: 'Data protection', items: [
      'We process your personal data only to deliver the Services, in line with UK GDPR. Full details are in our **Privacy Notice**, available on request.',
    ],
  },
  {
    n: 15, title: 'Complaints', items: [
      'Raise any concern on the day with our lead bartender immediately so we can put it right. Written complaints to **hello@orpi.events** within **7 days** of the Event.',
    ],
  },
  {
    n: 16, title: 'Governing law', items: [
      'These Terms are governed by the law of England and Wales and subject to the exclusive jurisdiction of its courts.',
    ],
  },
  {
    n: 17, title: 'Acceptance', items: [
      'By paying the deposit and/or signing below you confirm you have read, understood and accept these Terms together with the accompanying quotation/invoice as the agreement between us.',
    ],
  },
];
