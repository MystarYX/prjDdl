'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Play, Copy, Download, Settings2, Database, Code2, RefreshCw, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
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
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  function addRule() {
    const newRule: UnifiedRule = {
      id: Date.now().toString(),
      keywords: [''],
      matchType: 'contains',
      targetField: 'name',
      priority: unifiedRules.length + 1,
      typeByDatabase: {
        spark: { dataType: 'STRING' },
        mysql: { dataType: 'VARCHAR', length: 255 },
        postgresql: { dataType: 'TEXT' },
        clickhouse: { dataType: 'String' },
      },
    };
    setUnifiedRules([...unifiedRules, newRule]);
  }

  function updateRule(id: string, field: keyof UnifiedRule, value: any) {
    setUnifiedRules(rules => rules.map(rule => rule.id === id ? { ...rule, [field]: value } : rule));
  }

  function updateKeyword(ruleId: string, index: number, value: string) {
    setUnifiedRules(rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule;
      const newKeywords = [...rule.keywords];
      newKeywords[index] = value;
      return { ...rule, keywords: newKeywords };
    }));
  }

  function addKeyword(ruleId: string) {
    setUnifiedRules(rules => rules.map(rule => rule.id === ruleId ? { ...rule, keywords: [...rule.keywords, ''] } : rule));
  }

  function removeKeyword(ruleId: string, index: number) {
    setUnifiedRules(rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule;
      return { ...rule, keywords: rule.keywords.filter((_, i) => i !== index) };
    }));
  }

  function deleteRule(id: string) {
    setUnifiedRules(rules => rules.filter(rule => rule.id !== id));
  }

  function updateRuleDbType(ruleId: string, dbType: string, field: string, value: any) {
    setUnifiedRules(rules => rules.map(rule => {
      if (rule.id !== ruleId) {
        return { ...rule, typeByDatabase: { ...rule.typeByDatabase, [dbType]: { ...rule.typeByDatabase[dbType], [field]: value } } };
      }
      return { ...rule, typeByDatabase: { ...rule.typeByDatabase, [dbType]: { ...rule.typeByDatabase[dbType], [field]: value } } };
    }));
  }

  function addDatabaseToRule(ruleId: string, dbType: string) {
    setUnifiedRules(rules => rules.map(rule => {
      if (rule.id !== ruleId && !rule.typeByDatabase[dbType]) {
        return { ...rule, typeByDatabase: { ...rule.typeByDatabase, [dbType]: { dataType: 'STRING' } } };
      }
      return rule;
    }));
  }

  function removeDatabaseFromRule(ruleId: string, dbType: string) {
    setUnifiedRules(rules => rules.map(rule => {
      if (rule.id === ruleId) {
        const newTypes = { ...rule.typeByDatabase };
        delete newTypes[dbType];
        return { ...rule, typeByDatabase: newTypes };
      }
      return rule;
    }));
  }

  function moveRule(index: number, direction: 'up' | 'down') {
    const newRules = [...unifiedRules];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newRules.length) return;
    [newRules[index], newRules[targetIndex]] = [newRules[targetIndex], newRules[index]];
    setUnifiedRules(newRules);
  }

  function resetRules() {
    setUnifiedRules(DEFAULT_RULES);
    toast({ title: '已重置', description: '规则已恢复为默认值' });
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
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Settings2 className="w-4 h-4 mr-2" />
                  规则设置
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    字段类型推断规则（统一配置）
                  </DialogTitle>
                  <DialogDescription>配置字段名称匹配规则及在不同数据库中的类型映射</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <Label className="text-base font-semibold">目标数据库:</Label>
                    <div className="flex gap-2 flex-wrap">
                      {DATABASE_TYPES.map(db => (
                        <div key={db.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`db-${db.value}`}
                            checked={selectedDatabases.includes(db.value)}
                            onCheckedChange={checked => {
                              setSelectedDatabases(prev => checked ? [...prev, db.value] : prev.filter(d => d !== db.value));
                            }}
                          />
                          <label htmlFor={`db-${db.value}`} className="text-sm">{db.label}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    {unifiedRules.map((rule, index) => (
                      <Card key={rule.id} className="border-slate-200">
                        <CardContent className="pt-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col gap-1">
                                <Button variant="ghost" size="sm" className="p-0 h-6 w-6" onClick={() => moveRule(index, 'up')} disabled={index === 0}>
                                  <ChevronUp className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="p-0 h-6 w-6" onClick={() => moveRule(index, 'down')} disabled={index === unifiedRules.length - 1}>
                                  <ChevronDown className="w-4 h-4" />
                                </Button>
                              </div>
                              <Badge variant="outline">优先级 {rule.priority}</Badge>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => deleteRule(rule.id)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>关键词（用逗号分隔）</Label>
                              <Input
                                value={rule.keywords.join(', ')}
                                onChange={e => updateRule(rule.id, 'keywords', e.target.value.split(',').map(k => k.trim()))}
                                placeholder="amt, amount, 金额"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>优先级</Label>
                              <Input
                                type="number"
                                value={rule.priority}
                                onChange={e => updateRule(rule.id, 'priority', parseInt(e.target.value))}
                                min={1}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>匹配方式</Label>
                              <Select value={rule.matchType} onValueChange={v => updateRule(rule.id, 'matchType', v)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="contains">包含</SelectItem>
                                  <SelectItem value="equals">等于</SelectItem>
                                  <SelectItem value="regex">正则</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>匹配字段</Label>
                              <Select value={rule.targetField} onValueChange={v => updateRule(rule.id, 'targetField', v)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="name">字段名</SelectItem>
                                  <SelectItem value="comment">字段注释</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label className="text-base font-semibold">数据库类型映射</Label>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              {DATABASE_TYPES.map(db => {
                                const dbType = rule.typeByDatabase[db.value];
                                if (!dbType) return null;
                                return (
                                  <div key={db.value} className="border rounded-lg p-3 space-y-2 bg-slate-50">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">{db.label}</span>
                                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeDatabaseFromRule(rule.id, db.value)}>
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                    <div className="flex gap-2">
                                      <Select value={dbType.dataType} onValueChange={v => updateRuleDbType(rule.id, db.value, 'dataType', v)}>
                                        <SelectTrigger className="flex-1">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {['STRING', 'VARCHAR', 'TEXT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'INT', 'BIGINT', 'DATE', 'DATETIME', 'TIMESTAMP', 'BOOLEAN', 'Char', 'Decimal', 'DateTime', 'Date', 'String'].map(t => (
                                            <SelectItem key={t} value={t}>{t}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {(dbType.dataType.toUpperCase().includes('DECIMAL') || dbType.dataType === 'Decimal') && (
                                        <>
                                          <Input type="number" placeholder="精度" value={dbType.precision || ''} onChange={e => updateRuleDbType(rule.id, db.value, 'precision', e.target.value ? parseInt(e.target.value) : undefined)} className="w-20" />
                                          <Input type="number" placeholder="小数位" value={dbType.scale || ''} onChange={e => updateRuleDbType(rule.id, db.value, 'scale', e.target.value ? parseInt(e.target.value) : undefined)} className="w-20" />
                                        </>
                                      )}
                                      {(dbType.dataType.toUpperCase().includes('VARCHAR') || dbType.dataType === 'Char') && (
                                        <Input type="number" placeholder="长度" value={dbType.length || ''} onChange={e => updateRuleDbType(rule.id, db.value, 'length', e.target.value ? parseInt(e.target.value) : undefined)} className="w-20" />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <Button variant="outline" size="sm" className="w-full" onClick={() => addDatabaseToRule(rule.id, 'starrocks')}>
                              <Plus className="w-4 h-4 mr-2" />
                              添加数据库类型
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <Button onClick={addRule} className="flex-1">
                      <Plus className="w-4 h-4 mr-2" />
                      添加规则
                    </Button>
                    <Button variant="outline" onClick={resetRules}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      重置默认
                    </Button>
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <Button onClick={() => setSettingsOpen(false)}>确定</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="h-[calc(100vh-240px)] flex flex-col">
            <CardHeader>
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
            <CardHeader>
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
