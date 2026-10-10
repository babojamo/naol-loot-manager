import type { Metadata } from 'next';
import './globals.css';
import './loot-manager.css';
export const metadata: Metadata = {
  metadataBase:new URL('https://loot-manager.lokwensio.com'), title:{default:'Loot Manager — Every drop accounted for',template:'%s | Loot Manager'},
  description:'A shared workspace for dungeon runs, guild loot, sales and fair payouts. Bring your managers together and give your guild a transparent ledger.',
  openGraph:{title:'Loot Manager — Every drop accounted for',description:'Dungeon runs. Shared loot. Fair rewards. One workspace for your guild.',type:'website'},
  twitter:{card:'summary_large_image'},icons:{icon:'/icon.svg'},
};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
