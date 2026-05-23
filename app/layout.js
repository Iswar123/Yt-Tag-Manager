// app/layout.js
export const metadata = {
  title: 'Iswar — YouTube Helper',
  description: 'Apne YouTube channel ke tags manage karo AI se',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#080808', color: '#eee', fontFamily: "'Segoe UI', system-ui, sans-serif", minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}
