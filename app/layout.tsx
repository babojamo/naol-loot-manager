import type { Metadata } from 'next';
import './globals.css';
import './loot-manager.css';
import {authConfig} from '../lib/account-auth';
import {AccountSession} from './components/account-session';
export const metadata: Metadata = {
  metadataBase:new URL('https://loot-manager.lokwensio.com'), title:{default:'Loot Manager — Every drop accounted for',template:'%s | Loot Manager'},
  description:'A shared workspace for dungeon runs, playground loot, sales and fair payouts. Bring your managers together and give your playground a transparent ledger.',
  openGraph:{title:'Loot Manager — Every drop accounted for',description:'Dungeon runs. Shared loot. Fair rewards. One workspace for your playground.',type:'website'},
  twitter:{card:'summary_large_image'},icons:{icon:'/icon.svg'},
};
export default function RootLayout({children}:{children:React.ReactNode}) {const config=authConfig();return <html lang="en"><body><AccountSession url={config.url} keyValue={config.key}>{children}</AccountSession></body></html>;}
