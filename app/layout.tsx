import './globals.css';
import './platform-pages.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title:'BuildBridge | Learn. Build. Prove. Earn.', description:'Bridging traditional learning to real-world work.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
