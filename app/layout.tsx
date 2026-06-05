import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

export const metadata: Metadata = {
    metadataBase: new URL("https://synchro.leonardsima.de"),
    title: "Synchro",
    description: "Rhythm and Timing Games",
    alternates: {
        canonical: "/",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="de">
            <body className="bg-neutral-900 text-white h-[100dvh] flex flex-col overflow-hidden relative">
                
                {/* Navbar */}
                <div className="z-50 flex-none">
                    <Navbar />
                </div>

                <main className="flex-1 relative z-10 flex flex-col w-full h-full min-h-0 items-center justify-center">
                    {children}
                </main>
                
                {/* Footer */}
                <div className="w-full z-50 flex-none pb-4">
                    <Footer />
                </div>
                
            </body>
            <Analytics />
        </html>
    );
}
