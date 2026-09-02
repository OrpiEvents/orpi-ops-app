import './globals.css';

export const metadata = {
  title: 'ORPI Events — Ops',
  description: 'Internal operations app for ORPI Events',
  // PWA manifest — tells the browser this is an installable app.
  manifest: '/manifest.json',
  // Colour of the OS-level chrome (Android status bar, iOS Safari address bar)
  // when the app is opened. Matches the black brand header.
  themeColor: '#0a0a0a',
  // Standalone appearance on iOS: hides Safari's UI when opened from the
  // home screen so it looks and feels like a native app.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ORPI Ops',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  // Sensible defaults for a fixed-layout desktop-first app that still
  // wants to behave well on phones/tablets when installed as a PWA.
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
