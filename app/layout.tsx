import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '项目应收管理系统',
  description:
    '面向市级与区县业务人员的项目应收、回款、催缴、风险及审计一体化工作台。',
  icons: {
    icon: '/favicon.svg',
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
