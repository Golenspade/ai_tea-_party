import type { Metadata } from "next";
import { Libre_Baskerville, Karla } from "next/font/google";
import "./globals.css";

const libreBaskerville = Libre_Baskerville({
  variable: "--font-book",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const karla = Karla({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Index Rerum - Scholar's AI Chat",
  description: "Scholarly AI conversation interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${libreBaskerville.variable} ${karla.variable} antialiased texture font-sans overflow-hidden`} style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
        {children}
      </body>
    </html>
  );
}
