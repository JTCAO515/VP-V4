import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./globals.css";

const figGrotesk = localFont({
  src: [
    {
      path: "../public/assets/source/bce469927046259c.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/assets/source/0eaf174b84fa6b54.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/assets/source/5627b13241c54efa.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/assets/source/c220e764b55136bf.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-fig-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VisePanda｜来华自由行的 AI 规划与执行工作台",
  description:
    "VisePanda 将对话式规划、Trip Canvas 与旅途中的 Today 执行恢复组织在同一个前端产品预览中。",
  icons: {
    icon: "/assets/source/0d18cd3b07fb8516.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#fefdf9",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" className={figGrotesk.variable}>
      <body className="min-h-screen bg-vp-paper font-sans text-vp-ink antialiased">
        {children}
      </body>
    </html>
  );
}
