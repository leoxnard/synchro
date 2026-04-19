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
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 text-neutral-200 leading-relaxed">
            <div className="mt-4 flex w-full flex-col gap-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8">
                <h1 className="mb-2 text-3xl font-semibold tracking-tight text-neutral-100">Legal Notice</h1>

                <div>
                    <h2 className="text-lg font-medium text-neutral-100">Information pursuant to Section 5 TMG</h2>
                    <Image src="/images/address-info.png" alt="Address Details" width={270} height={60} className="pointer-events-none select-none" />
                </div>

                <div>
                    <h2 className="text-lg font-medium text-neutral-100">Contact</h2>
                    <p className="text-lg font-medium text-neutral-100">Email: synchro@leonardsima.de</p>
                </div>

                <div className="my-2 h-px w-full bg-neutral-800" />

                <Link
                    href="/"
                    className="text-center text-sm font-medium uppercase tracking-widest text-neutral-400 transition-colors hover:text-neutral-200"
                >
                    Back to Home
                </Link>
            </div>
        </main>
    );
}
