'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface TypeRule {
  id: string;
  keywords: string[];
  dataType: string;
  priority: number;
}

const defaultRules: TypeRule[] = [
  { id: '1', keywords: ['fcytp', 'scytp', 'cytp', 'currency_type'], dataType: 'STRING', priority: 1 },
  { id: '2', keywords: ['mode', 'code', 'icode'], dataType: 'STRING', priority: 2 },
  { id: '3', keywords: ['date'], dataType: 'DATE', priority: 3 },
  { id: '4', keywords: ['time', 'timestamp'], dataType: 'TIMESTAMP', priority: 4 },
  { id: '5', keywords: ['org', 'trcl', 'cust', 'stff', 'user', 'dept'], dataType: 'STRING', priority: 5 },
  { id: '6', keywords: ['name', 'dscr', 'rmrk'], dataType: 'STRING', priority: 6 },
  { id: '7', keywords: ['flag', 'is_'], dataType: 'STRING', priority: 7 },
  { id: '8', keywords: ['days', 'day'], dataType: 'DECIMAL(24, 6)', priority: 8 },
  { id: '9', keywords: ['amt', 'amount', 'price', 'ocy', 'rcy', 'scy', 'elmn', 'crdt', 'totl', 'ocpt'], dataType: 'DECIMAL(24, 6)', priority: 9 },
  { id: '10', keywords: ['qty', 'quantity', 'cnt', 'count'], dataType: 'DECIMAL(24, 6)', priority: 10 },
];

export default function Home() {
  const [sqlInput, setSqlInput] = useState('');
  const [ddlOutput, setDdlOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState<TypeRule[]>(defaultRules);
  const [editingRule, setEditingRule] = useState<TypeRule | null>(null);
  const [selectedDatabaseTypes, setSelectedDatabaseTypes] = useState<string[]>(['spark']);

  const databaseTypes = [
    { value: 'spark', label: 'Spark SQL' },
    { value: 'mysql', label: 'MySQL' },
    { value: 'postgresql', label: 'PostgreSQL' },
    { value: 'starrocks', label: 'StarRocks' },
    { value: 'clickhouse', label: 'ClickHouse' },
    { value: 'hive', label: 'Hive' },
    { value: 'doris', label: 'Doris' },
  ];

  const handleGenerate = async () => {
    if (!sqlInput.trim()) {
      setError('请输入SQL查询语句');
      return;
    }

    if (selectedDatabaseTypes.length === 0) {
      setError('请至少选择一个数据库类型');
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
        body: JSON.stringify({
          sql: sqlInput,
          customRules: rules,
          databaseTypes: selectedDatabaseTypes,
        }),
      });

      if (!response.ok) {
        throw new Error('生成建表语句失败');
      }

      const data = await response.json();
      // 支持单个或多个DDL
      if (Array.isArray(data.ddls)) {
        // 多个数据库，显示tab分隔
        setDdlOutput(data.ddls.map((d: any) => `-- ${d.databaseType}\n${d.ddl}`).join('\n\n'));
      } else {
        setDdlOutput(data.ddl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(ddlOutput);
  };

  const handleAddRule = () => {
    const newRule: TypeRule = {
      id: Date.now().toString(),
      keywords: [],
      dataType: 'STRING',
      priority: rules.length + 1,
    };
    setEditingRule(newRule);
  };

  const handleEditRule = (rule: TypeRule) => {
    setEditingRule({ ...rule });
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const handleSaveRule = () => {
    if (!editingRule) return;

    if (editingRule.keywords.length === 0) {
      alert('请至少添加一个关键词');
      return;
    }

    const existingIndex = rules.findIndex(r => r.id === editingRule.id);
    if (existingIndex >= 0) {
      const updated = [...rules];
      updated[existingIndex] = editingRule;
      setRules(updated);
    } else {
      setRules([...rules, editingRule]);
    }
    setEditingRule(null);
  };

  const handleResetRules = () => {
    if (confirm('确定要重置为默认规则吗？')) {
      setRules(defaultRules);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
        {/* 标题区 */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-slate-900 dark:text-slate-100">
            SQL 建表语句生成器
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            自动解析SQL查询，生成符合规范的建表语句
          </p>
        </div>

        {/* 数据库类型选择 */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              目标数据库类型（最多选择2个）
            </label>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              选择要生成建表语句的数据库类型
            </p>
            <div className="flex flex-wrap gap-3">
              {databaseTypes.map((db) => (
                <label
                  key={db.value}
                  className="flex items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 py-2 cursor-pointer hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={selectedDatabaseTypes.includes(db.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        if (selectedDatabaseTypes.length < 2) {
                          setSelectedDatabaseTypes([...selectedDatabaseTypes, db.value]);
                        }
                      } else {
                        setSelectedDatabaseTypes(selectedDatabaseTypes.filter(t => t !== db.value));
                      }
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                  />
                  <span className="text-sm">{db.label}</span>
                </label>
              ))}
            </div>
            {selectedDatabaseTypes.length === 0 && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                请至少选择一个数据库类型
              </p>
            )}
          </div>
        </div>

        {/* 规则配置区 */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setShowRules(!showRules)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              ⚙️ 字段类型映射 ({rules.length} 条)
            </h2>
            <span className="text-slate-500 dark:text-slate-400">
              {showRules ? '▼' : '▶'}
            </span>
          </button>

          {showRules && (
            <div className="border-t border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    配置字段关键词到数据类型的映射规则（按优先级从上到下匹配）
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    当前选择的数据库类型：
                    {selectedDatabaseTypes.length === 0
                      ? ' 未选择'
                      : selectedDatabaseTypes.map(t => databaseTypes.find(d => d.value === t)?.label).join('、')}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    数据类型支持各数据库的标准类型，可自定义输入任意类型
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddRule} size="sm" variant="default">
                    添加规则
                  </Button>
                  <Button onClick={handleResetRules} size="sm" variant="outline">
                    重置默认
                  </Button>
                </div>
              </div>

              {/* 规则列表 */}
              <div className="space-y-2">
                {rules.map((rule, index) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-4 rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-900"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-medium dark:bg-slate-700">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex flex-wrap gap-1">
                        {rule.keywords.map((kw, i) => (
                          <span
                            key={i}
                            className="rounded bg-blue-100 px-2 py-0.5 text-xs font-mono text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="rounded bg-green-100 px-2 py-1 text-sm font-mono text-green-800 dark:bg-green-900 dark:text-green-200">
                      {rule.dataType}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        onClick={() => handleEditRule(rule)}
                        size="sm"
                        variant="ghost"
                      >
                        编辑
                      </Button>
                      <Button
                        onClick={() => handleDeleteRule(rule.id)}
                        size="sm"
                        variant="ghost"
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 编辑规则弹窗 */}
              {editingRule && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-lg rounded-lg bg-white p-6 dark:bg-slate-800">
                    <h3 className="mb-4 text-lg font-semibold">
                      {rules.find(r => r.id === editingRule.id) ? '编辑规则' : '添加规则'}
                    </h3>
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium">
                        关键词（用逗号分隔）
                      </label>
                      <input
                        type="text"
                        value={editingRule.keywords.join(',')}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k),
                          })
                        }
                        className="w-full rounded border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                        placeholder="例如: amount, price, 金额"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium">
                        数据类型
                      </label>
                      <div className="mb-2">
                        <input
                          type="text"
                          value={editingRule.dataType}
                          onChange={(e) =>
                            setEditingRule({ ...editingRule, dataType: e.target.value })
                          }
                          className="w-full rounded border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                          placeholder="例如: STRING, DECIMAL(18,2), INT, ARRAY<STRING>"
                        />
                      </div>
                      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                        常用类型（点击可快速选择）：
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {[
                          'STRING', 'INT', 'BIGINT', 'FLOAT', 'DOUBLE',
                          'DECIMAL(18,2)', 'DECIMAL(24,6)', 'BOOLEAN',
                          'DATE', 'TIMESTAMP', 'BINARY',
                          'ARRAY<STRING>', 'ARRAY<INT>', 'MAP<STRING,STRING>'
                        ].map(type => (
                          <button
                            key={type}
                            onClick={() => setEditingRule({ ...editingRule, dataType: type })}
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => setEditingRule(null)} variant="outline">
                        取消
                      </Button>
                      <Button onClick={handleSaveRule}>保存</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
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
                {selectedDatabaseTypes.length === 0
                  ? '建表语句'
                  : selectedDatabaseTypes.length === 1
                    ? `${databaseTypes.find(db => db.value === selectedDatabaseTypes[0])?.label} 建表语句`
                    : `建表语句 (${selectedDatabaseTypes.length} 个数据库)`
                }
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
          <p className="mt-2">
            点击上方"字段类型映射"可自定义字段类型推断规则和数据类型
          </p>
          <p className="mt-2 text-xs">
            Spark SQL 支持的所有数据类型均可使用：STRING, INT, BIGINT, FLOAT, DOUBLE, DECIMAL(p,s), BOOLEAN, DATE, TIMESTAMP, BINARY, ARRAY&lt;type&gt;, MAP&lt;k,v&gt;, STRUCT&lt;field&gt; 等
          </p>
        </div>
      </div>
    </div>
  );
}
