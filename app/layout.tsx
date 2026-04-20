import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

export const metadata: Metadata = {
    title: "Synchro",
    description: "Rhythm and Timing Games",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="de">
            <body className="bg-neutral-900 text-white">
                <div className="flex flex-col h-[100dvh] overflow-hidden">
                    <Navbar />

                    <main className="flex-1 overflow-hidden">
                        {children}
                    </main>

                    <Footer />
                </div>
            </body>
        </html>
    );
}