import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next"

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://synchro.leonardsima.de"),
    title: {
        default: "Synchro | Rhythm Games",
        template: "%s | Synchro",
    },
    description:
        "Synchro offers interactive rhythm games like polyrhythm and tempo recognition to improve musical timing.",
    applicationName: "Synchro",
    category: "music",
    keywords: [
        "rhythm game",
        "polyrhythm",
        "tempo recognition",
        "music training",
        "timing training",
        "web app",
    ],
    alternates: {
        canonical: "/",
    },
    openGraph: {
        title: "Synchro | Rhythm Games",
        description:
            "Train your timing and rhythm skills with polyrhythm and tempo recognition games.",
        url: "/",
        siteName: "Synchro",
        locale: "en_US",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Synchro | Rhythm Games",
        description:
            "Interactive rhythm games for better timing and musical listening skills.",
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
};

export default function RootLayout({
    children,
}: Readonly<{
  children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col">{children}</body>
            <Analytics />
        </html>
    );
}
