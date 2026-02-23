import type { Metadata } from "next";
import { Space_Grotesk, Lora } from "next/font/google";

import "./globals.css";

const heading = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading" });
const body = Lora({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Group Itinerary Planner",
  description: "Generate group-optimized daily travel itineraries"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="font-[var(--font-body)]">{children}</body>
    </html>
  );
}
