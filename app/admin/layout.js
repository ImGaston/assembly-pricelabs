import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { adminCss } from './styles.js';

export const metadata = { title: 'Dashboard Manager | RevFactor' };
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }) {
  return (
    <div className={`admin-root ${GeistSans.variable} ${GeistMono.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: adminCss }} />
      {children}
    </div>
  );
}
