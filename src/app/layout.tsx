import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'DDL工作集',
    template: '%s | DDL工作集',
  },
  description: 'SQL 建表语句生成器，支持多种数据库类型，自动解析 SQL 查询并生成符合规范的建表 DDL。',
  keywords: [
    'SQL',
    'DDL',
    '建表语句',
    '数据库',
    'Spark',
    'MySQL',
    'PostgreSQL',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
