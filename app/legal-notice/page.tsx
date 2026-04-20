import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
    title: "Legal Notice",
    description: "Legal notice with provider and contact information.",
    alternates: {
        canonical: "/legal-notice",
    },
};

export default function LegalNoticePage() {
    return (
        <main className="mx-auto flex h-full w-full max-w-4xl flex-col p-4 pt-0 text-neutral-200 leading-relaxed overflow-auto">
            <div className="mt-4 flex w-full flex-col gap-5 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 md:p-10">
                <h1 className="mb-4 text-4xl font-semibold tracking-tight text-neutral-100">Legal Notice</h1>

                <div>
                    <h2 className="text-lg font-medium text-neutral-100">Information pursuant to Section 5 TMG</h2>
                    <Image src="/images/address-info.png" alt="Address Details" width={270} height={60} className="pointer-events-none select-none" />
                </div>

                <div>
                    <h2 className="text-lg font-medium text-neutral-100">Contact</h2>
                    <p className="text-lg font-medium text-neutral-100">Email: synchro@leonardsima.de</p>
                </div>
            </div>
        </main>
    );
}
