import {cookies} from 'next/headers';
import {impersonationCookie,impersonationContext} from '../lib/impersonation';
import type { Metadata } from 'next';
import './globals.css';
import './loot-manager.css';
import {authConfig} from '../lib/account-auth';
import {AccountSession} from './components/account-session';
export const metadata: Metadata = {
  metadataBase:new URL('https://naol.lokwensio.com'), title:{default:'NAOL — Where every drop makes someone jealous.',template:'%s | NAOL'},
  description:'Where every drop makes someone jealous. A shared workspace for dungeon runs, playground loot, sales and fair payouts. Bring your managers together and give your playground a transparent ledger.',
  openGraph:{title:'NAOL — Where every drop makes someone jealous.',description:'Where every drop makes someone jealous. Dungeon runs, shared loot and fair rewards for your playground.',type:'website',images:[{url:'/brand/naol-logo.png',alt:'NAOL — Where every drop makes someone jealous.'}]},
  twitter:{card:'summary_large_image',title:'NAOL',description:'Where every drop makes someone jealous.',images:['/brand/naol-logo.png']},icons:{icon:'/brand/naol-logo.png'},
};
export default async function RootLayout({children}:{children:React.ReactNode}) {const config=authConfig();const context=impersonationContext((await cookies()).get(impersonationCookie)?.value);return <html lang="en"><body><AccountSession url={config.url} keyValue={config.key} initialContext={context}>{children}</AccountSession></body></html>;}
