'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function Home() {
  const [sqlInput, setSqlInput] = useState('');
  const [ddlOutput, setDdlOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!sqlInput.trim()) {
      setError('请输入SQL查询语句');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/generate-ddl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql: sqlInput }),
      });

      if (!response.ok) {
        throw new Error('生成建表语句失败');
      }

      const data = await response.json();
      setDdlOutput(data.ddl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(ddlOutput);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
        {/* 标题区 */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-slate-900 dark:text-slate-100">
            Spark SQL 建表语句生成器
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            自动解析SQL查询，生成符合规范的Spark SQL建表语句
          </p>
        </div>

        {/* 规则说明 */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            建表规则
          </h2>
          <ul className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-400 md:grid-cols-4">
            <li className="flex items-center gap-2">
              <span className="font-mono text-blue-600 dark:text-blue-400">STRING</span>
              <span>- 字符串类型</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="font-mono text-green-600 dark:text-green-400">DECIMAL(24, 6)</span>
              <span>- 金额数量</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="font-mono text-purple-600 dark:text-purple-400">DATE</span>
              <span>- 日期字段</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="font-mono text-orange-600 dark:text-orange-400">TIMESTAMP</span>
              <span>- 时间字段</span>
            </li>
          </ul>
        </div>

        {/* 主内容区 */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* 输入区 */}
          <div className="flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                输入SQL查询语句
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {sqlInput.length} 字符
              </span>
            </div>
            <Textarea
              value={sqlInput}
              onChange={(e) => setSqlInput(e.target.value)}
              placeholder="请输入SELECT查询语句..."
              className="min-h-[400px] font-mono text-sm"
            />
            <div className="mt-4">
              <Button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? '生成中...' : '生成建表语句'}
              </Button>
            </div>
            {error && (
              <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* 输出区 */}
          <div className="flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Spark SQL 建表语句
              </label>
              {ddlOutput && (
                <Button onClick={handleCopy} variant="outline" size="sm">
                  复制
                </Button>
              )}
            </div>
            <Textarea
              value={ddlOutput}
              readOnly
              placeholder="生成的建表语句将显示在这里..."
              className="min-h-[400px] font-mono text-sm"
            />
          </div>
        </div>

        {/* 底部说明 */}
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          <p>支持解析 SELECT 查询语句中的字段，自动推断字段类型并生成建表 DDL</p>
        </div>
      </div>
    </div>
  );
}
