import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Frequency — listen together",
  description: "Listen to YouTube together, anywhere.",
};

export const viewport: Viewport = {
  themeColor: "#0C0A14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // keep the player controls from triggering zoom on iOS
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="min-h-[100dvh] bg-ink-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
