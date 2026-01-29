'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Play, Copy, Download, Settings2, Database, Code2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FieldTypeInfo {
  dataType: string;
  precision?: number;
  scale?: number;
  length?: number;
}

interface UnifiedRule {
  id: string;
  keywords: string[];
  matchType: 'contains' | 'equals' | 'regex';
  targetField: 'name' | 'comment';
  priority: number;
  typeByDatabase: Record<string, FieldTypeInfo>;
}

const DATABASE_TYPES = [
  { value: 'spark', label: 'Spark SQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'starrocks', label: 'StarRocks' },
  { value: 'clickhouse', label: 'ClickHouse' },
  { value: 'hive', label: 'Hive' },
  { value: 'doris', label: 'Doris' },
];

const DEFAULT_RULES: UnifiedRule[] = [
  {
    id: '1',
    keywords: ['fcytp', 'scytp', '币种'],
    matchType: 'contains',
    targetField: 'name',
    priority: 1,
    typeByDatabase: {
      spark: { dataType: 'STRING' },
      mysql: { dataType: 'VARCHAR', length: 255 },
      postgresql: { dataType: 'TEXT' },
      clickhouse: { dataType: 'String' },
    },
  },
  {
    id: '2',
    keywords: ['amt', 'amount', 'price', '金额', '价格'],
    matchType: 'contains',
    targetField: 'name',
    priority: 2,
    typeByDatabase: {
      spark: { dataType: 'DECIMAL', precision: 24, scale: 6 },
      mysql: { dataType: 'DECIMAL', precision: 24, scale: 6 },
      postgresql: { dataType: 'DECIMAL', precision: 24, scale: 6 },
      clickhouse: { dataType: 'Decimal', precision: 24, scale: 6 },
      starrocks: { dataType: 'DECIMAL', precision: 24, scale: 6 },
    },
  },
  {
    id: '3',
    keywords: ['qty', 'quantity', 'cnt', 'count', '数量'],
    matchType: 'contains',
    targetField: 'name',
    priority: 3,
    typeByDatabase: {
      spark: { dataType: 'DECIMAL', precision: 24, scale: 6 },
      mysql: { dataType: 'DECIMAL', precision: 24, scale: 6 },
      postgresql: { dataType: 'DECIMAL', precision: 24, scale: 6 },
      clickhouse: { dataType: 'Decimal', precision: 24, scale: 6 },
    },
  },
  {
    id: '4',
    keywords: ['org', 'trcl', 'cust', 'stff', 'user', '部门', '客户', '用户'],
    matchType: 'contains',
    targetField: 'name',
    priority: 4,
    typeByDatabase: {
      spark: { dataType: 'STRING' },
      mysql: { dataType: 'VARCHAR', length: 255 },
      postgresql: { dataType: 'TEXT' },
      clickhouse: { dataType: 'String' },
    },
  },
  {
    id: '5',
    keywords: ['name', 'dscr', 'rmrk', '名称', '描述', '备注'],
    matchType: 'contains',
    targetField: 'name',
    priority: 5,
    typeByDatabase: {
      spark: { dataType: 'STRING' },
      mysql: { dataType: 'VARCHAR', length: 255 },
      postgresql: { dataType: 'TEXT' },
      clickhouse: { dataType: 'String' },
    },
  },
  {
    id: '6',
    keywords: ['date', '日期'],
    matchType: 'contains',
    targetField: 'name',
    priority: 6,
    typeByDatabase: {
      spark: { dataType: 'DATE' },
      mysql: { dataType: 'DATE' },
      postgresql: { dataType: 'DATE' },
      clickhouse: { dataType: 'Date' },
    },
  },
  {
    id: '7',
    keywords: ['time', 'timestamp', '时间'],
    matchType: 'contains',
    targetField: 'name',
    priority: 7,
    typeByDatabase: {
      spark: { dataType: 'TIMESTAMP' },
      mysql: { dataType: 'DATETIME' },
      postgresql: { dataType: 'TIMESTAMP' },
      clickhouse: { dataType: 'DateTime' },
      starrocks: { dataType: 'DATETIME' },
    },
  },
];

// 从localStorage加载规则
function loadRules(): UnifiedRule[] {
  if (typeof window === 'undefined') return DEFAULT_RULES;
  try {
    const saved = localStorage.getItem('ddl-rules');
    return saved ? JSON.parse(saved) : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

// 从localStorage加载选中的数据库
function loadSelectedDatabases(): string[] {
  if (typeof window === 'undefined') return ['spark', 'mysql', 'clickhouse'];
  try {
    const saved = localStorage.getItem('ddl-selected-databases');
    return saved ? JSON.parse(saved) : ['spark', 'mysql', 'clickhouse'];
  } catch {
    return ['spark', 'mysql', 'clickhouse'];
  }
}

// 保存选中的数据库到localStorage
function saveSelectedDatabases(dbs: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ddl-selected-databases', JSON.stringify(dbs));
}

const EXAMPLE_SQL = `-- 账户信息表查询
SELECT
  icode,
  org,
  acct,
  fcyc,
  fcytp,
  ccyc,
  ccytp,
  amt,
  amt_sc,
  amt_tc,
  trdt,
  tms,
  mode,
  flag,
  biz_dscr,
  cust_dscr
FROM account`;

export default function Home() {
  const { toast } = useToast();
  const [sqlInput, setSqlInput] = useState(EXAMPLE_SQL);
  const [unifiedRules, setUnifiedRules] = useState<UnifiedRule[]>(DEFAULT_RULES);
  const [selectedDatabases, setSelectedDatabases] = useState<string[]>(['spark', 'mysql', 'clickhouse']);
  const [generatedDDL, setGeneratedDDL] = useState<{ ddl?: string; ddls?: Array<{ label: string; ddl: string }> }>({});
  const [loading, setLoading] = useState(false);

  // 初始化加载
  useEffect(() => {
    const savedRules = loadRules();
    const savedDbs = loadSelectedDatabases();
    setUnifiedRules(savedRules);
    setSelectedDatabases(savedDbs);
  }, []);

  // 数据库选择变化时自动保存
  useEffect(() => {
    saveSelectedDatabases(selectedDatabases);
  }, [selectedDatabases]);

  async function generate() {
    setLoading(true);
    try {
      const response = await fetch('/api/generate-ddl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: sqlInput,
          unifiedRules: unifiedRules,
          databaseTypes: selectedDatabases,
        }),
      });
      const data = await response.json();
      setGeneratedDDL(data);
      toast({ title: '生成成功', description: 'DDL已生成' });
    } catch (error) {
      toast({ title: '生成失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: '已复制', description: 'DDL已复制到剪贴板' });
  }

  function handleDownload() {
    const ddlText = generatedDDL.ddl ? generatedDDL.ddl : (generatedDDL.ddls?.map(d => `-- ${d.label}\n${d.ddl}`).join('\n\n') || '');
    const blob = new Blob([ddlText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ddl.sql';
    a.click();
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">DDL 生成器</h1>
            <p className="text-slate-600 mt-2">智能推断字段类型，支持多种数据库</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSqlInput(EXAMPLE_SQL)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              示例SQL
            </Button>
            <Link href="/rules">
              <Button variant="outline">
                <Settings2 className="w-4 h-4 mr-2" />
                规则设置
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="h-[calc(100vh-240px)] flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Code2 className="w-5 h-5" />
                输入SQL
              </CardTitle>
              <CardDescription>支持SELECT语句或字段列表</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <Textarea
                placeholder="-- 支持单行或多行注释
SELECT
  icode,
  org,
  acct,
  amt,
  trdt
FROM table_name"
                value={sqlInput}
                onChange={e => setSqlInput(e.target.value)}
                className="flex-1 font-mono text-sm resize-none"
              />
              <div className="flex gap-3 mt-4">
                <Button onClick={generate} disabled={loading || !sqlInput.trim()} className="flex-1">
                  {loading ? '生成中...' : <><Play className="w-4 h-4 mr-2" />生成DDL</>}
                </Button>
                <div className="flex gap-2 flex-wrap">
                  {DATABASE_TYPES.map(db => (
                    <Button
                      key={db.value}
                      variant={selectedDatabases.includes(db.value) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedDatabases(prev => prev.includes(db.value) ? prev.filter(d => d !== db.value) : [...prev, db.value])}
                    >
                      {db.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="h-[calc(100vh-240px)] flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                生成的DDL
              </CardTitle>
              <CardDescription>DDL语句</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              {generatedDDL.ddl || (generatedDDL.ddls && generatedDDL.ddls.length > 0) ? (
                <Tabs defaultValue={generatedDDL.ddl ? 'single' : 'multiple'} className="flex-1 flex flex-col">
                  <TabsList className="grid w-full" style={{ gridTemplateColumns: generatedDDL.ddl ? '1fr' : `repeat(${generatedDDL.ddls?.length || 1}, 1fr)` }}>
                    {generatedDDL.ddl && <TabsTrigger value="single">DDL</TabsTrigger>}
                    {generatedDDL.ddls?.map((ddl, index) => (
                      <TabsTrigger key={index} value={ddl.label}>{ddl.label}</TabsTrigger>
                    ))}
                  </TabsList>

                  {generatedDDL.ddl && (
                    <TabsContent value="single" className="flex-1 mt-2">
                      <div className="relative h-full">
                        <Textarea
                          value={generatedDDL.ddl}
                          readOnly
                          className="h-full font-mono text-sm resize-none"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => handleCopy(generatedDDL.ddl || '')}>
                            <Copy className="w-4 h-4 mr-2" />
                            复制
                          </Button>
                          <Button size="sm" variant="secondary" onClick={handleDownload}>
                            <Download className="w-4 h-4 mr-2" />
                            下载
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  )}

                  {generatedDDL.ddls?.map((ddl, index) => (
                    <TabsContent key={index} value={ddl.label} className="flex-1 mt-2">
                      <div className="relative h-full">
                        <Textarea
                          value={ddl.ddl}
                          readOnly
                          className="h-full font-mono text-sm resize-none"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => handleCopy(ddl.ddl)}>
                            <Copy className="w-4 h-4 mr-2" />
                            复制
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <Code2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>请输入SQL并点击生成</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
