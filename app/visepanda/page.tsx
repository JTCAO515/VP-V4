import type { Metadata } from "next";
import { Suspense } from "react";
import { chatThreadCopy } from "@/lib/i18n";
import { parseLocale } from "@/lib/navigation/workspace-entry";
import { ChatThreadWorkspace } from "@/components/chat/ChatThreadWorkspace";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ locale?: string }> }): Promise<Metadata> {
  const locale = parseLocale((await searchParams).locale);
  return {
    title: `${chatThreadCopy[locale].title} | VisePanda`,
    alternates: { canonical: "https://go2china.space/visepanda" },
  };
}

export default function VisePandaWorkspacePage() {
  return <Suspense><ChatThreadWorkspace /></Suspense>;
}
