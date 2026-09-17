import type { Metadata } from "next";
import { ResearchForm } from "./research-form";
import styles from "./research.module.css";
export const metadata: Metadata = { title: "VisePanda · Research / 研究申请", description: "Apply for a founder-assisted China travel research session. 申请参加来华旅行产品研究。", referrer: "no-referrer" };
export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = (await searchParams).lang === "zh" ? "zh" : "en";
  return <main className={styles.page} lang={locale === "zh" ? "zh-CN" : "en"}>
    <nav aria-label={locale === "zh" ? "研究导航" : "Research navigation"}><a href="/">VisePanda</a><span><a href="/research?lang=en" lang="en">English</a> / <a href="/research?lang=zh" lang="zh-CN">中文</a></span></nav>
    <ResearchForm key={locale} locale={locale} />
  </main>;
}
