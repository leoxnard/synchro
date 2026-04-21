import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "Privacy policy for the Synchro website and rhythm games.",
    alternates: {
        canonical: "/privacy",
    },
};

export default function PrivacyPolicyPage() {
    return (
        <main className="mx-auto block min-h-screen w-full max-w-4xl p-4 pt-4 text-neutral-200 leading-relaxed">
            <div className="flex w-full flex-col gap-5 rounded-2xl border border-neutral-800 bg-black/80 p-8 md:p-10 shadow-2xl">
                <h1 className="mb-4 text-4xl font-semibold tracking-tight text-neutral-100">Privacy Policy</h1>

                <section className="space-y-4">
                    <h2 className="text-2xl font-medium text-neutral-100">1. Data Controller</h2>
                    <p>
                        Responsible for data processing on this website:
                    </p>
                    {/* HIER IST DAS BILD: max-w-full und h-auto verhindern das Abschneiden! */}
                    <div className="my-2">
                        <Image 
                            src="/images/address-info.png" 
                            alt="Address Details" 
                            width={250} 
                            height={60} 
                            className="pointer-events-none select-none max-w-full h-auto object-contain" 
                        />
                    </div>
                    <p>
                        Email: synchro@leonardsima.de
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-medium text-neutral-100">2. Data We Process</h2>
                    <p>
                        Synchro is primarily a client-side application. We process only data that is
                        required for technical operation and game functionality.
                    </p>
                    <ul className="list-disc space-y-2 pl-6">
                        <li><strong>Highscores:</strong> Stored in Local Storage.</li>
                        <li><strong>Server Logs:</strong> Technical request data.</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-medium text-neutral-100">3. Cookies and Browser Storage</h2>
                    <p>
                        We do not use advertising or tracking cookies. Synchro uses functional browser
                        storage (Local Storage) exclusively to save highscores on your device.
                        You can delete this data at any time in your browser settings.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-medium text-neutral-100">4. Analytics</h2>
                    <p>
                        We use Vercel Analytics to understand overall website performance and usage.
                        According to the provider, this is designed to work without invasive tracking.
                        Data may still be processed on Vercel infrastructure for aggregated insights
                        and service quality.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-medium text-neutral-100">5. Your Rights</h2>
                    <p>
                        Under GDPR, you have the right to request information about your personal data,
                        correction, deletion, restriction of processing, and data portability,
                        where applicable. You may also object to certain processing and lodge a complaint
                        with a supervisory authority.
                    </p>
                </section>
            </div>
            
            {/* Abstandhalter für Scroll-Freiraum am Ende */}
            <div className="h-20 w-full" />
        </main>
    );
}