import type { Metadata } from 'next';

import './globals.css';

const siteTitle = '项目应收管理系统';
const siteDescription =
  '面向市级与区县业务人员的项目应收、回款、催缴、风险及审计一体化工作台。';

export const metadata: Metadata = {
  metadataBase: new URL('https://xian-receivables.yinxigao.chatgpt.site'),
  title: siteTitle,
  description: siteDescription,
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: '/',
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: '项目应收管理系统工作台预览',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
