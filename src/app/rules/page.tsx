'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft } from 'lucide-react';
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

const DATA_TYPE_OPTIONS = [
  'STRING', 'VARCHAR', 'TEXT', 'CHAR',
  'DECIMAL', 'FLOAT', 'DOUBLE', 'INT', 'BIGINT',
  'DATE', 'DATETIME', 'TIMESTAMP', 'BOOLEAN',
  'String', 'Decimal', 'DateTime', 'Date'
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

// 保存规则到localStorage
function saveRules(rules: UnifiedRule[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ddl-rules', JSON.stringify(rules));
}

export default function RulesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [unifiedRules, setUnifiedRules] = useState<UnifiedRule[]>(DEFAULT_RULES);
  const [selectedDatabases, setSelectedDatabases] = useState<string[]>(['spark', 'mysql', 'clickhouse']);

  useEffect(() => {
    const saved = loadRules();
    setUnifiedRules(saved);
    const savedDbs = localStorage.getItem('ddl-selected-databases');
    if (savedDbs) setSelectedDatabases(JSON.parse(savedDbs));
  }, []);

  useEffect(() => {
    saveRules(unifiedRules);
    localStorage.setItem('ddl-selected-databases', JSON.stringify(selectedDatabases));
  }, [unifiedRules, selectedDatabases]);

  function addRule() {
    const newRule: UnifiedRule = {
      id: Date.now().toString(),
      keywords: [''],
      matchType: 'contains',
      targetField: 'name',
      priority: unifiedRules.length + 1,
      typeByDatabase: selectedDatabases.reduce((acc, db) => {
        acc[db] = { dataType: 'STRING' };
        return acc;
      }, {} as Record<string, FieldTypeInfo>),
    };
    setUnifiedRules([...unifiedRules, newRule]);
  }

  function updateRule(id: string, field: keyof UnifiedRule, value: any) {
    setUnifiedRules(rules => rules.map(rule => rule.id === id ? { ...rule, [field]: value } : rule));
  }

  function updateRuleDbType(ruleId: string, dbType: string, field: string, value: any) {
    setUnifiedRules(rules => rules.map(rule => {
      if (rule.id === ruleId) {
        return {
          ...rule,
          typeByDatabase: {
            ...rule.typeByDatabase,
            [dbType]: { ...rule.typeByDatabase[dbType], [field]: value }
          }
        };
      }
      return rule;
    }));
  }

  function deleteRule(id: string) {
    setUnifiedRules(rules => rules.filter(rule => rule.id !== id));
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

  function needsPrecision(dataType: string) {
    const upper = dataType.toUpperCase();
    return upper === 'DECIMAL' || upper === 'FLOAT' || upper === 'DOUBLE';
  }

  function needsLength(dataType: string) {
    const upper = dataType.toUpperCase();
    return upper === 'VARCHAR' || upper === 'CHAR';
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">字段类型推断规则</h1>
              <p className="text-slate-600 mt-2">配置字段名称匹配规则及在不同数据库中的类型映射</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={resetRules}>
              <RefreshCw className="w-4 h-4 mr-2" />
              重置默认
            </Button>
            <Button onClick={addRule}>
              <Plus className="w-4 h-4 mr-2" />
              添加规则
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {unifiedRules.map((rule, index) => (
            <Card key={rule.id} className="border border-slate-200 bg-white">
              <CardContent className="p-5">
                {/* 规则头部 */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">优先级 {rule.priority}</Badge>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => moveRule(index, 'up')}
                        disabled={index === 0}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => moveRule(index, 'down')}
                        disabled={index === unifiedRules.length - 1}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteRule(rule.id)}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* 基本配置 */}
                <div className="grid grid-cols-12 gap-4 mb-5">
                  <div className="col-span-5">
                    <Label className="text-sm font-medium text-slate-700 mb-1.5 block">关键词</Label>
                    <Input
                      value={rule.keywords.join(', ')}
                      onChange={e => updateRule(rule.id, 'keywords', e.target.value.split(',').map(k => k.trim()))}
                      placeholder="amt, amount, 金额"
                      className="h-9"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-medium text-slate-700 mb-1.5 block">优先级</Label>
                    <Input
                      type="number"
                      value={rule.priority}
                      onChange={e => updateRule(rule.id, 'priority', parseInt(e.target.value))}
                      min={1}
                      className="h-9"
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-sm font-medium text-slate-700 mb-1.5 block">匹配方式</Label>
                    <Select
                      value={rule.matchType}
                      onValueChange={(v: 'contains' | 'equals' | 'regex') => updateRule(rule.id, 'matchType', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contains">包含</SelectItem>
                        <SelectItem value="equals">等于</SelectItem>
                        <SelectItem value="regex">正则</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm font-medium text-slate-700 mb-1.5 block">匹配字段</Label>
                    <Select
                      value={rule.targetField}
                      onValueChange={(v: 'name' | 'comment') => updateRule(rule.id, 'targetField', v)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">字段名</SelectItem>
                        <SelectItem value="comment">字段注释</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 数据库类型映射 */}
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-3 block">数据库类型映射</Label>
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {selectedDatabases.map(dbType => {
                      const dbConfig = rule.typeByDatabase[dbType];
                      if (!dbConfig) return null;
                      const dbLabel = DATABASE_TYPES.find(d => d.value === dbType)?.label || dbType;
                      const isDecimal = needsPrecision(dbConfig.dataType);
                      const isVarchar = needsLength(dbConfig.dataType);

                      return (
                        <div key={dbType} className="border rounded-lg p-4 bg-slate-50 space-y-3">
                          <div className="text-sm font-semibold text-slate-700">{dbLabel}</div>

                          <Select
                            value={dbConfig.dataType}
                            onValueChange={(v: string) => updateRuleDbType(rule.id, dbType, 'dataType', v)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DATA_TYPE_OPTIONS.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {isDecimal && (
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <Label className="text-xs text-slate-500 mb-1 block">精度</Label>
                                <Input
                                  type="number"
                                  value={dbConfig.precision ?? ''}
                                  onChange={e => updateRuleDbType(rule.id, dbType, 'precision', e.target.value ? parseInt(e.target.value) : undefined)}
                                  className="h-9"
                                  placeholder="24"
                                />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs text-slate-500 mb-1 block">小数位</Label>
                                <Input
                                  type="number"
                                  value={dbConfig.scale ?? ''}
                                  onChange={e => updateRuleDbType(rule.id, dbType, 'scale', e.target.value ? parseInt(e.target.value) : undefined)}
                                  className="h-9"
                                  placeholder="6"
                                />
                              </div>
                            </div>
                          )}

                          {isVarchar && (
                            <div>
                              <Label className="text-xs text-slate-500 mb-1 block">长度</Label>
                              <Input
                                type="number"
                                value={dbConfig.length ?? ''}
                                onChange={e => updateRuleDbType(rule.id, dbType, 'length', e.target.value ? parseInt(e.target.value) : undefined)}
                                className="h-9"
                                placeholder="255"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
