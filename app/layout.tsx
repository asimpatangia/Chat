import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Chat',
  description: 'ChatGPT-like interface supporting OpenAI, Gemini, and Claude',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#212121] text-white h-screen overflow-hidden`}>
        {children}
      </body>
    </html>
  );
}
