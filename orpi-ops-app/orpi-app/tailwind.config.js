/** @type {import('tailwindcss').Config} */
module.exports = {
  // preflight is Tailwind's CSS reset. It would strip the default margins and
  // font sizes the inline-styled pages rely on, so it stays off — Tailwind
  // here only adds utility classes for the run sheet.
  corePlugins: { preflight: false },
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
