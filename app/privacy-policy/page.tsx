import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "Privacy policy for the Synchro website and rhythm games.",
    alternates: {
        canonical: "/privacy",
    },
};

export default function PrivacyPolicy() {
    return (
        <main className="max-w-4xl mx-auto p-2 h-full overflow-y-auto">
            <div className="flex w-full flex-col gap-5 rounded-2xl border border-neutral-800 bg-black/90 p-6 md:p-10">
                <h1 className="mb-4 text-4xl font-semibold tracking-tight text-neutral-100">Privacy Policy</h1>

                <section className="space-y-4">
                    <h2 className="text-2xl font-medium text-neutral-100">1. Data Controller</h2>
                    <p className="text-neutral-100">
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
                    <p className="text-neutral-100">
                        Email: synchro@leonardsima.de
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-medium text-neutral-100">2. Data We Process</h2>
                    <p className="text-neutral-100">
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
                    <p className="text-neutral-100">
                        We do not use advertising or tracking cookies. Synchro uses functional browser
                        storage (Local Storage) exclusively to save highscores on your device.
                        You can delete this data at any time in your browser settings.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-medium text-neutral-100">4. Analytics</h2>
                    <p className="text-neutral-100">
                        We run our own installation of Umami, a privacy-friendly analytics tool, on
                        the same server as this site. It records page views, the referring site, an
                        approximate country, and a coarse device and browser type. It sets no cookies,
                        hashes IP addresses instead of storing them, and cannot follow you to other
                        websites. No data is shared with a third party.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-2xl font-medium text-neutral-100">5. Your Rights</h2>
                    <p className="text-neutral-100">
                        Under GDPR, you have the right to request information about your personal data,
                        correction, deletion, restriction of processing, and data portability,
                        where applicable. You may also object to certain processing and lodge a complaint
                        with a supervisory authority.
                    </p>
                </section>
            </div>
        </main>
    );
}