import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "VisePanda｜来华自由行的 AI 规划与执行工作台",
  description:
    "VisePanda 将对话式规划、Trip Canvas 与旅途中的 Today 执行恢复组织在同一个前端产品预览中。",
};

export const viewport: Viewport = {
  themeColor: "#fefdf9",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-vp-paper font-sans text-vp-ink antialiased">
        {children}
      </body>
    </html>
  );
}
