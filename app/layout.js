// Root layout for React pages (currently only /admin). Client dashboards are
// served as raw HTML from app/api/dashboard and never pass through here.
export const metadata = { robots: { index: false, follow: false } };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
