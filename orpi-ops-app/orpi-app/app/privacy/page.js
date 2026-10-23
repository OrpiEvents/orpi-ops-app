import CookieReset from './CookieReset';

export const metadata = {
  title: 'Privacy notice — ORPI Events',
  description: 'How ORPI Events uses the details you give us.',
  robots: { index: false, follow: true },
};

// Plain-English privacy notice for the enquiry page (and, later, the website).
// Describes exactly what the system does; keep it in step with
// app/api/public/enquiry/route.js and the cookie banner in app/enquire.
const UPDATED = '23 October 2026';

export default function PrivacyPage() {
  return (
    <div className="pv">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Outfit:wght@300;400&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header><a href="/enquire" className="pv-mark">ORPI</a></header>
      <main>
        <h1>Privacy notice</h1>
        <p className="pv-muted">Last updated {UPDATED}</p>

        <h2>Who we are</h2>
        <p>ORPI Events (“we”, “us”) runs mobile bars for weddings and events. We’re responsible for the personal information you give us. Questions about it go to <a href="mailto:hello@orpi.events">hello@orpi.events</a>.</p>

        <h2>What we collect</h2>
        <p>When you send an enquiry we collect your name, email address and phone number, your event details (type, date, guest numbers, venue or town, what you’re looking for), how you heard about us, and anything else you choose to tell us.</p>
        <p>We also note which of our links, posts or ads brought you to the form (for example “Instagram bio link”). That tells us which of our marketing works; it isn’t used to identify you.</p>

        <h2>How we use it</h2>
        <ul>
          <li><strong>To reply and prepare your quote</strong>, and to plan your event if you book. We need your details to do what you asked us to.</li>
          <li><strong>To follow up about your event</strong>, for example to check you received your quote, or to get back in touch as your date gets closer.</li>
          <li><strong>To send occasional planning tips and offers</strong> about our own services, unless you tick the box on the form to say no. You can opt out at any time by replying “stop” or emailing us.</li>
          <li><strong>To understand which of our marketing works</strong>, as described in the cookies section below, and only if you agree.</li>
        </ul>
        <p>We never sell your details, and we don’t share them with anyone for their own marketing.</p>

        <h2 id="cookies">Cookies and advertising measurement</h2>
        <p>The enquiry page doesn’t set advertising cookies unless you choose “Accept”. If you do, Meta (Facebook and Instagram) sets cookies that let us see whether people who saw our posts or ads went on to enquire. When you send an enquiry with cookies accepted, we also tell Meta that an enquiry happened, including a scrambled (“hashed”) version of your email and phone number so Meta can match it to our ads without us sending your details in readable form. Meta’s own use of that information is covered by Meta’s privacy policy.</p>
        <p>If you choose “No thanks”, none of this happens. You can change your choice here:</p>
        <CookieReset />

        <h2>Who helps us</h2>
        <p>We use a small number of trusted providers to run the business: Notion (where we keep enquiries and bookings), Supabase (our app’s database, hosted in London), Vercel (which hosts our pages), Resend (which sends our emails) and Meta (only as described above). Some of these providers are based in, or store data in, the United States. Where that happens, the transfer is covered by the protections UK law requires, such as the UK–US data bridge or standard contractual clauses.</p>

        <h2>How long we keep it</h2>
        <p>If you don’t book, we keep your enquiry until your event date has passed and any follow-up is finished, and no longer than two years after you enquired. If you book, we keep the booking and payment records for six years, because UK tax rules require it.</p>

        <h2>Your rights</h2>
        <p>You can ask for a copy of the information we hold about you, ask us to correct it or delete it, object to us using it for marketing, or withdraw your consent to cookies at any time. Just email <a href="mailto:hello@orpi.events">hello@orpi.events</a>. If you’re unhappy with how we’ve handled your information, you can complain to the Information Commissioner’s Office at <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>.</p>
      </main>
    </div>
  );
}

const CSS = `
html,body{background:#080808}
.pv{min-height:100vh;background:#080808;color:rgba(255,255,255,.82);font-family:'Outfit',system-ui,sans-serif;font-weight:300;line-height:1.7;padding:0 20px 80px}
.pv header{max-width:680px;margin:0 auto;padding:28px 0 10px;border-bottom:.5px solid rgba(255,255,255,.08)}
.pv-mark{font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;letter-spacing:.22em;color:#fff;text-decoration:none}
.pv main{max-width:680px;margin:0 auto;padding-top:36px}
.pv h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:44px;color:#fff;line-height:1.1;margin-bottom:6px}
.pv h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:24px;color:#fff;margin:34px 0 8px}
.pv p{margin:0 0 12px;font-size:15px}
.pv ul{margin:0 0 12px 18px;font-size:15px}
.pv li{margin-bottom:8px}
.pv strong{font-weight:400;color:#fff}
.pv a{color:#fff}
.pv-muted{color:rgba(255,255,255,.45);font-size:13px!important}
`;
