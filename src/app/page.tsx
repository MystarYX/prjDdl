'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Settings, Plus, Edit2, Trash2, AlertCircle } from 'lucide-react';

interface TypeRule {
  id: string;
  keywords: string[];
  dataType: string;
  priority: number;
}

type DatabaseType = 'spark' | 'mysql' | 'starrocks';

interface DatabaseConfig {
  type: DatabaseType;
  name: string;
  commentSyntax: string;
  primaryKeySyntax?: string;
  defaultTableComment: string;
  typeMappings: {
    sparkType: string;
    dbType: string;
  }[];
}

const databaseConfigs: Record<DatabaseType, DatabaseConfig> = {
  spark: {
    type: 'spark',
    name: 'Spark SQL',
    commentSyntax: "COMMENT '{comment}'",
    defaultTableComment: '信用占用明细表',
    typeMappings: [
      { sparkType: 'STRING', dbType: 'STRING' },
      { sparkType: 'DECIMAL(24,6)', dbType: 'DECIMAL(24,6)' },
      { sparkType: 'DATE', dbType: 'DATE' },
      { sparkType: 'TIMESTAMP', dbType: 'TIMESTAMP' },
      { sparkType: 'INT', dbType: 'INT' },
      { sparkType: 'BIGINT', dbType: 'BIGINT' },
      { sparkType: 'FLOAT', dbType: 'FLOAT' },
      { sparkType: 'DOUBLE', dbType: 'DOUBLE' },
      { sparkType: 'BOOLEAN', dbType: 'BOOLEAN' },
      { sparkType: 'BINARY', dbType: 'BINARY' },
      { sparkType: 'ARRAY<STRING>', dbType: 'ARRAY<STRING>' },
      { sparkType: 'ARRAY<INT>', dbType: 'ARRAY<INT>' },
      { sparkType: 'MAP<STRING,STRING>', dbType: 'MAP<STRING,STRING>' },
    ],
  },
  mysql: {
    type: 'mysql',
    name: 'MySQL',
    commentSyntax: "COMMENT '{comment}'",
    primaryKeySyntax: 'PRIMARY KEY',
    defaultTableComment: '信用占用明细表',
    typeMappings: [
      { sparkType: 'STRING', dbType: 'VARCHAR(255)' },
      { sparkType: 'STRING(500)', dbType: 'VARCHAR(500)' },
      { sparkType: 'STRING(1000)', dbType: 'VARCHAR(1000)' },
      { sparkType: 'STRING(2000)', dbType: 'TEXT' },
      { sparkType: 'DECIMAL(24,6)', dbType: 'DECIMAL(24,6)' },
      { sparkType: 'DECIMAL(18,2)', dbType: 'DECIMAL(18,2)' },
      { sparkType: 'DATE', dbType: 'DATE' },
      { sparkType: 'TIMESTAMP', dbType: 'TIMESTAMP' },
      { sparkType: 'INT', dbType: 'INT' },
      { sparkType: 'BIGINT', dbType: 'BIGINT' },
      { sparkType: 'FLOAT', dbType: 'FLOAT' },
      { sparkType: 'DOUBLE', dbType: 'DOUBLE' },
      { sparkType: 'BOOLEAN', dbType: 'TINYINT(1)' },
      { sparkType: 'BINARY', dbType: 'BLOB' },
      { sparkType: 'ARRAY<STRING>', dbType: 'JSON' },
      { sparkType: 'ARRAY<INT>', dbType: 'JSON' },
      { sparkType: 'MAP<STRING,STRING>', dbType: 'JSON' },
    ],
  },
  starrocks: {
    type: 'starrocks',
    name: 'StarRocks',
    commentSyntax: "COMMENT '{comment}'",
    primaryKeySyntax: 'PRIMARY KEY',
    defaultTableComment: '信用占用明细表',
    typeMappings: [
      { sparkType: 'STRING', dbType: 'VARCHAR(255)' },
      { sparkType: 'STRING(500)', dbType: 'VARCHAR(500)' },
      { sparkType: 'STRING(1000)', dbType: 'VARCHAR(1000)' },
      { sparkType: 'STRING(2000)', dbType: 'VARCHAR(2000)' },
      { sparkType: 'DECIMAL(24,6)', dbType: 'DECIMAL(24,6)' },
      { sparkType: 'DECIMAL(18,2)', dbType: 'DECIMAL(18,2)' },
      { sparkType: 'DATE', dbType: 'DATE' },
      { sparkType: 'TIMESTAMP', dbType: 'DATETIME' },
      { sparkType: 'INT', dbType: 'INT' },
      { sparkType: 'BIGINT', dbType: 'BIGINT' },
      { sparkType: 'FLOAT', dbType: 'FLOAT' },
      { sparkType: 'DOUBLE', dbType: 'DOUBLE' },
      { sparkType: 'BOOLEAN', dbType: 'BOOLEAN' },
      { sparkType: 'BINARY', dbType: 'VARCHAR(255)' },
      { sparkType: 'ARRAY<STRING>', dbType: 'ARRAY<STRING>' },
      { sparkType: 'ARRAY<INT>', dbType: 'ARRAY<INT>' },
      { sparkType: 'MAP<STRING,STRING>', dbType: 'MAP<STRING,STRING>' },
      { sparkType: 'JSON', dbType: 'JSON' },
    ],
  },
};

const defaultRules: TypeRule[] = [
  { id: '1', keywords: ['fcytp', 'scytp', 'cytp', 'currency_type'], dataType: 'STRING', priority: 1 },
  { id: '2', keywords: ['mode', 'code', 'icode'], dataType: 'STRING', priority: 2 },
  { id: '3', keywords: ['date'], dataType: 'DATE', priority: 3 },
  { id: '4', keywords: ['time', 'timestamp'], dataType: 'TIMESTAMP', priority: 4 },
  { id: '5', keywords: ['org', 'trcl', 'cust', 'stff', 'user', 'dept'], dataType: 'STRING', priority: 5 },
  { id: '6', keywords: ['name', 'dscr', 'rmrk'], dataType: 'STRING', priority: 6 },
  { id: '7', keywords: ['flag', 'is_'], dataType: 'STRING', priority: 7 },
  { id: '8', keywords: ['days', 'day'], dataType: 'DECIMAL(24,6)', priority: 8 },
  { id: '9', keywords: ['amt', 'amount', 'price', 'ocy', 'rcy', 'scy', 'elmn', 'crdt', 'totl', 'ocpt'], dataType: 'DECIMAL(24,6)', priority: 9 },
  { id: '10', keywords: ['qty', 'quantity', 'cnt', 'count'], dataType: 'DECIMAL(24,6)', priority: 10 },
];

export default function Home() {
  const [sqlInput, setSqlInput] = useState('');
  const [ddlOutput, setDdlOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseType>('spark');
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState<TypeRule[]>(defaultRules);
  const [editingRule, setEditingRule] = useState<TypeRule | null>(null);
  const [showTypeMappings, setShowTypeMappings] = useState(false);
  const [typeMappings, setTypeMappings] = useState(databaseConfigs.spark.typeMappings);

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
        body: JSON.stringify({
          sql: sqlInput,
          customRules: rules,
          databaseType: selectedDatabase,
          typeMappings: typeMappings,
        }),
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">SQL 建表语句生成器</h1>
          <p className="text-slate-300">支持 Spark SQL / MySQL / StarRocks</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* 输入区域 */}
            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">输入 SQL 查询</CardTitle>
                  <Select value={selectedDatabase} onValueChange={(value: DatabaseType) => {
                    setSelectedDatabase(value);
                    setTypeMappings(databaseConfigs[value].typeMappings);
                  }}>
                    <SelectTrigger className="w-[200px] bg-slate-700 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      {Object.values(databaseConfigs).map(config => (
                        <SelectItem key={config.type} value={config.type} className="text-white">
                          {config.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="输入 SELECT 查询语句，例如：&#10;SELECT id, name, age, create_date FROM user_table"
                  value={sqlInput}
                  onChange={(e) => setSqlInput(e.target.value)}
                  className="min-h-[400px] font-mono text-sm bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                />
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    {loading ? '生成中...' : '生成建表语句'}
                  </Button>
                  <Button
                    onClick={() => setShowRules(!showRules)}
                    variant="outline"
                    className="border-slate-600 text-white hover:bg-slate-700"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    规则配置
                  </Button>
                  <Button
                    onClick={() => setShowTypeMappings(!showTypeMappings)}
                    variant="outline"
                    className="border-slate-600 text-white hover:bg-slate-700"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    类型映射
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 输出区域 */}
            <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white">建表语句 ({databaseConfigs[selectedDatabase].name})</CardTitle>
                  {ddlOutput && (
                    <Button
                      onClick={handleCopy}
                      variant="outline"
                      size="sm"
                      className="border-slate-600 text-white hover:bg-slate-700"
                    >
                      复制
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {error && (
                  <Alert variant="destructive" className="mb-4 bg-red-900/50 border-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-white">{error}</AlertDescription>
                  </Alert>
                )}
                <Textarea
                  readOnly
                  value={ddlOutput}
                  className="min-h-[400px] font-mono text-sm bg-slate-900/50 border-slate-600 text-green-400"
                  placeholder="生成的建表语句将显示在这里"
                />
              </CardContent>
            </Card>
          </div>

          {/* 侧边栏 */}
          <div className="space-y-6">
            {/* 规则配置 */}
            {showRules && (
              <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white">类型推断规则</CardTitle>
                    <div className="flex gap-1">
                      <Button
                        onClick={handleAddRule}
                        size="sm"
                        variant="outline"
                        className="border-slate-600 text-white hover:bg-slate-700"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        添加
                      </Button>
                      <Button
                        onClick={handleResetRules}
                        size="sm"
                        variant="outline"
                        className="border-slate-600 text-white hover:bg-slate-700"
                      >
                        重置
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {rules
                      .sort((a, b) => a.priority - b.priority)
                      .map(rule => (
                        <div
                          key={rule.id}
                          className="p-3 bg-slate-900/50 rounded border border-slate-700 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-400">优先级: {rule.priority}</span>
                              <div className="flex flex-wrap gap-1">
                                {rule.keywords.map((kw, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-blue-900/30 px-2 py-0.5 text-xs font-mono text-blue-400"
                                  >
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                onClick={() => handleEditRule(rule)}
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 hover:bg-slate-700 text-slate-400 hover:text-white"
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button
                                onClick={() => handleDeleteRule(rule.id)}
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 hover:bg-slate-700 text-slate-400 hover:text-red-400"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          <Badge className="bg-purple-600/20 text-purple-400 border-purple-600/50">
                            {rule.dataType}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 类型映射配置 */}
            {showTypeMappings && (
              <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-white">
                    类型映射 ({databaseConfigs[selectedDatabase].name})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {typeMappings.map((mapping, index) => (
                      <div
                        key={index}
                        className="p-3 bg-slate-900/50 rounded border border-slate-700 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <div className="text-sm">
                              <span className="text-slate-400">Spark: </span>
                              <span className="text-white font-mono">{mapping.sparkType}</span>
                            </div>
                            <div className="text-sm">
                              <span className="text-slate-400">{databaseConfigs[selectedDatabase].name}: </span>
                              <span className="text-green-400 font-mono">{mapping.dbType}</span>
                            </div>
                          </div>
                          <Button
                            onClick={() => {
                              const newDbType = prompt(
                                `修改 ${mapping.sparkType} 在 ${databaseConfigs[selectedDatabase].name} 中的类型:`,
                                mapping.dbType
                              );
                              if (newDbType) {
                                const updated = [...typeMappings];
                                updated[index] = { ...mapping, dbType: newDbType };
                                setTypeMappings(updated);
                              }
                            }}
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 hover:bg-slate-700 text-slate-400 hover:text-white"
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* 规则编辑对话框 */}
        <Dialog open={!!editingRule} onOpenChange={() => setEditingRule(null)}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white">
            <DialogHeader>
              <DialogTitle>
                {editingRule?.id === 'new' ? '添加规则' : '编辑规则'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-slate-300">关键词 (逗号分隔)</label>
                <Input
                  value={editingRule?.keywords.join(', ') || ''}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule!,
                      keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean),
                    })
                  }
                  placeholder="例如: name, dscr, rmrk"
                  className="bg-slate-900/50 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-300">数据类型</label>
                <div className="mb-2">
                  <Input
                    value={editingRule?.dataType || ''}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule!,
                        dataType: e.target.value,
                      })
                    }
                    placeholder="例如: STRING, DECIMAL(24,6), INT"
                    className="bg-slate-900/50 border-slate-600 text-white"
                  />
                </div>
                <p className="mb-2 text-xs text-slate-400">
                  常用类型（点击可快速选择）：
                </p>
                <div className="flex flex-wrap gap-1">
                  {[
                    'STRING', 'INT', 'BIGINT', 'FLOAT', 'DOUBLE',
                    'DECIMAL(18,2)', 'DECIMAL(24,6)', 'BOOLEAN',
                    'DATE', 'TIMESTAMP', 'BINARY',
                    'ARRAY<STRING>', 'ARRAY<INT>', 'MAP<STRING,STRING>', 'STRUCT'
                  ].map(type => (
                    <button
                      key={type}
                      onClick={() => setEditingRule({ ...editingRule!, dataType: type })}
                      className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-700 text-slate-300"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-300">优先级</label>
                <Input
                  type="number"
                  value={editingRule?.priority || 0}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule!,
                      priority: parseInt(e.target.value) || 0,
                    })
                  }
                  className="bg-slate-900/50 border-slate-600 text-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditingRule(null)}
                className="border-slate-600 text-white hover:bg-slate-700"
              >
                取消
              </Button>
              <Button
                onClick={handleSaveRule}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
