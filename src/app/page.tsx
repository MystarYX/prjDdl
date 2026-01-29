'use client';

import { useState, useEffect } from 'react';

interface InferenceRule {
  keywords: string[];
  matchType: 'contains' | 'equals' | 'regex';
  targetField: 'name' | 'comment';
  dataType: string;
  priority: number;
  precision?: number;
  scale?: number;
  length?: number;
}

const DEFAULT_RULES: Record<string, InferenceRule[]> = {
  spark: [
    { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
    { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
    { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'TIMESTAMP', priority: 1 },
    { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'STRING', priority: 1 },
    { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'STRING', priority: 1 }
  ],
  mysql: [
    { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
    { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
    { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'DATETIME', priority: 1 },
    { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
    { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'VARCHAR(255)', priority: 1 }
  ],
  postgresql: [
    { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
    { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
    { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'TIMESTAMP', priority: 1 },
    { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
    { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'VARCHAR(255)', priority: 1 }
  ],
  starrocks: [
    { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
    { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
    { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'DATETIME', priority: 1 },
    { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
    { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'VARCHAR(255)', priority: 1 }
  ],
  clickhouse: [
    { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'Decimal(24, 6)', priority: 1 },
    { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'Date', priority: 1 },
    { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'DateTime', priority: 1 },
    { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'Int64', priority: 1 },
    { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'String', priority: 1 }
  ],
  hive: [
    { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
    { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
    { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'TIMESTAMP', priority: 1 },
    { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
    { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'STRING', priority: 1 }
  ],
  doris: [
    { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
    { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
    { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'DATETIME', priority: 1 },
    { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
    { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'VARCHAR(255)', priority: 1 }
  ]
};

const DB_LABELS = {
  spark: 'Spark SQL',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  starrocks: 'StarRocks',
  clickhouse: 'ClickHouse',
  hive: 'Hive',
  doris: 'Doris'
};

const ALL_TYPE_OPTIONS = {
  spark: ['STRING', 'VARCHAR', 'CHAR', 'DECIMAL', 'DATE', 'TIMESTAMP', 'BIGINT', 'INT', 'FLOAT', 'DOUBLE', 'BOOLEAN', 'BINARY', 'ARRAY', 'MAP', 'STRUCT'],
  mysql: ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR', 'CHAR', 'VARCHAR', 'BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'ENUM', 'SET', 'BOOLEAN', 'JSON'],
  postgresql: ['SMALLINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'SMALLSERIAL', 'SERIAL', 'BIGSERIAL', 'CHARACTER', 'VARCHAR', 'TEXT', 'BYTEA', 'TIMESTAMP', 'DATE', 'TIME', 'BOOLEAN', 'UUID', 'JSON', 'JSONB', 'ARRAY'],
  starrocks: ['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'LARGEINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'DATE', 'DATETIME', 'CHAR', 'VARCHAR', 'STRING', 'BOOLEAN', 'JSON', 'BITMAP', 'HLL', 'PERCENTILE', 'ARRAY', 'MAP', 'STRUCT'],
  clickhouse: ['UInt8', 'UInt16', 'UInt32', 'UInt64', 'Int8', 'Int16', 'Int32', 'Int64', 'Float32', 'Float64', 'String', 'FixedString', 'Date', 'DateTime', 'DateTime64', 'Decimal', 'UUID', 'Enum8', 'Enum16', 'Array', 'Tuple', 'Map', 'Nested', 'Nullable', 'Bool'],
  hive: ['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'BOOLEAN', 'FLOAT', 'DOUBLE', 'DECIMAL', 'STRING', 'VARCHAR', 'CHAR', 'DATE', 'TIMESTAMP', 'INTERVAL', 'BINARY', 'ARRAY', 'MAP', 'STRUCT', 'UNIONTYPE'],
  doris: ['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'LARGEINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'DATE', 'DATETIME', 'CHAR', 'VARCHAR', 'STRING', 'BOOLEAN', 'JSON', 'BITMAP', 'HLL', 'PERCENTILE', 'ARRAY', 'MAP', 'STRUCT']
};

export default function Home() {
  const [activeTab, setActiveTab] = useState('generator');
  const [sqlInput, setSqlInput] = useState('');
  const [ddlOutput, setDdlOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDbTypes, setSelectedDbTypes] = useState<string[]>(['spark']);
  const [customRules, setCustomRules] = useState<Record<string, InferenceRule[]>>(DEFAULT_RULES);
  const [saveStatus, setSaveStatus] = useState('');

  // 页面加载时从 localStorage 恢复规则
  useEffect(() => {
    const saved = localStorage.getItem('ddl_generator_rules');
    if (saved) {
      try {
        setCustomRules(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load rules:', e);
      }
    }
  }, []);

  // 保存规则到 localStorage
  const saveRules = () => {
    try {
      localStorage.setItem('ddl_generator_rules', JSON.stringify(customRules));
      setSaveStatus('✓ 已保存');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (e) {
      console.error('Failed to save rules:', e);
    }
  };

  const handleGenerate = async () => {
    if (!sqlInput.trim()) {
      setError('请输入SQL查询语句');
      return;
    }

    if (selectedDbTypes.length === 0) {
      setError('请至少选择一个数据库类型');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/generate-ddl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: sqlInput,
          rulesByDatabase: customRules,
          databaseTypes: selectedDbTypes
        })
      });

      if (!response.ok) {
        throw new Error('生成失败');
      }

      const data = await response.json();
      if (data.ddls) {
        setDdlOutput(data.ddls.map((d: any) => `-- ${d.label}\n${d.ddl}`).join('\n\n'));
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



  const handleResetRules = () => {
    if (confirm('确定要重置所有规则为默认值吗？')) {
      setCustomRules(JSON.parse(JSON.stringify(DEFAULT_RULES)));
      saveRules();
    }
  };

  const addRule = (dbType: string) => {
    setCustomRules(prev => ({
      ...prev,
      [dbType]: [...(prev[dbType] || []), {
        keywords: [],
        matchType: 'contains' as const,
        targetField: 'name' as const,
        dataType: 'STRING',
        priority: 999
      }]
    }));
    saveRules();
  };

  const deleteRule = (dbType: string, index: number) => {
    setCustomRules(prev => {
      const newRules = { ...prev };
      newRules[dbType] = newRules[dbType].filter((_, i) => i !== index);
      return newRules;
    });
    saveRules();
  };

  const updateRule = (dbType: string, index: number, updates: Partial<InferenceRule>) => {
    setCustomRules(prev => {
      const newRules = { ...prev };
      newRules[dbType] = newRules[dbType].map((rule, i) =>
        i === index ? { ...rule, ...updates } : rule
      );
      return newRules;
    });
    saveRules();
  };

  const hasTypeConfig = (dataType: string) => {
    const upper = dataType.toUpperCase();
    return upper.includes('VARCHAR') || upper.includes('CHAR') ||
           upper.includes('DECIMAL') || upper.includes('NUMERIC') ||
           upper.includes('FLOAT') || upper.includes('DOUBLE');
  };

  const renderTypeConfig = (dbType: string, rule: InferenceRule, index: number) => {
    const upper = rule.dataType.toUpperCase();

    if (upper.includes('DECIMAL') || upper.includes('NUMERIC')) {
      return (
        <div className="flex gap-2 mt-2">
          <div className="flex-1">
            <label className="text-xs text-gray-500 block mb-1">精度</label>
            <input
              type="number"
              value={rule.precision || 24}
              onChange={(e) => updateRule(dbType, index, { precision: parseInt(e.target.value) })}
              className="w-full px-2 py-1 text-sm border rounded"
              min="1"
              max="65"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 block mb-1">小数位</label>
            <input
              type="number"
              value={rule.scale || 6}
              onChange={(e) => updateRule(dbType, index, { scale: parseInt(e.target.value) })}
              className="w-full px-2 py-1 text-sm border rounded"
              min="0"
              max="30"
            />
          </div>
        </div>
      );
    } else if (upper.includes('VARCHAR') || upper.includes('CHAR')) {
      return (
        <div className="mt-2">
          <label className="text-xs text-gray-500 block mb-1">长度</label>
          <input
            type="number"
            value={rule.length || 255}
            onChange={(e) => updateRule(dbType, index, { length: parseInt(e.target.value) })}
            className="w-full px-2 py-1 text-sm border rounded"
            min="1"
            max="65535"
          />
        </div>
      );
    } else if (upper.includes('FLOAT') || upper.includes('DOUBLE')) {
      return (
        <div className="mt-2">
          <label className="text-xs text-gray-500 block mb-1">精度（可选）</label>
          <input
            type="number"
            value={rule.precision || ''}
            onChange={(e) => updateRule(dbType, index, {
              precision: e.target.value ? parseInt(e.target.value) : undefined
            })}
            className="w-full px-2 py-1 text-sm border rounded"
            min="1"
            max="255"
            placeholder="留空使用默认值"
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">SQL建表语句生成器</h1>
        <p className="text-center text-gray-600 mb-8">自动解析SQL查询，生成符合规范的建表语句</p>

        {/* 标签页导航 */}
        <div className="flex gap-2 mb-6 border-b-2 border-gray-300">
          <button
            onClick={() => setActiveTab('generator')}
            className={`px-6 py-3 font-medium rounded-t-lg transition-all ${
              activeTab === 'generator'
                ? 'bg-blue-600 text-white border-t border-l border-r border-blue-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            DDL生成器
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-6 py-3 font-medium rounded-t-lg transition-all ${
              activeTab === 'rules'
                ? 'bg-blue-600 text-white border-t border-l border-r border-blue-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            规则管理器
          </button>
        </div>

        {/* DDL生成器标签页 */}
        {activeTab === 'generator' && (
          <>
            {/* 数据库类型选择 */}
            <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-4">目标数据库类型</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(DB_LABELS).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      value={value}
                      checked={selectedDbTypes.includes(value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDbTypes([...selectedDbTypes, value]);
                        } else {
                          setSelectedDbTypes(selectedDbTypes.filter(t => t !== value));
                        }
                      }}
                      className="rounded"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* SQL输入和DDL输出 */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-800">输入SQL查询语句</h3>
                  <span className="text-gray-500 text-sm">{sqlInput.length} 字符</span>
                </div>
                <textarea
                  value={sqlInput}
                  onChange={(e) => setSqlInput(e.target.value)}
                  placeholder="请输入SELECT查询语句或字段列表..."
                  className="w-full h-96 p-4 border rounded-lg font-mono text-sm resize-none"
                />
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="w-full mt-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                >
                  {loading ? '生成中...' : '生成建表语句'}
                </button>
                {error && (
                  <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
                )}
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-gray-800">
                    {selectedDbTypes.length > 1 ? '建表语句' : DB_LABELS[selectedDbTypes[0]] + ' 建表语句'}
                  </h3>
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
                  >
                    复制
                  </button>
                </div>
                <textarea
                  value={ddlOutput}
                  readOnly
                  placeholder="生成的建表语句将显示在这里..."
                  className="w-full h-96 p-4 border rounded-lg font-mono text-sm resize-none bg-gray-50"
                />
              </div>
            </div>
          </>
        )}

        {/* 规则管理器标签页 */}
        {activeTab === 'rules' && (
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">字段类型推断规则配置</h3>
              <span className="text-gray-500 text-sm">
                已选择 {selectedDbTypes.length} 个数据库类型
                {saveStatus && <span className="ml-2 text-green-600">{saveStatus}</span>}
              </span>
            </div>
            <p className="text-gray-600 mb-4 text-sm">
              为每种数据库类型配置自定义的字段类型推断规则，根据字段名或注释自动匹配目标类型。
            </p>

            {/* 操作按钮 */}
            <div className="flex gap-3 mb-6 flex-wrap">
              <button
                onClick={handleResetRules}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                🔄 重置规则
              </button>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm text-blue-700">
              <strong>💡 提示：</strong> 规则会自动保存到浏览器，刷新页面后可继续使用。
            </div>

            {/* 规则列表 */}
            {selectedDbTypes.length === 0 ? (
              <p className="text-gray-500 text-center py-8">请先在"DDL生成器"页面选择目标数据库类型</p>
            ) : (
              selectedDbTypes.map(dbType => (
                <div key={dbType} className="mb-6 border rounded-xl p-4">
                  <h4 className="font-semibold text-blue-600 mb-4">{DB_LABELS[dbType]} 字段类型推断规则</h4>

                  {/* 规则列表 */}
                  <div className="space-y-3">
                    {(customRules[dbType] || []).map((rule, index) => (
                      <div key={index} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1.5fr_70px_40px] gap-3 p-3 bg-gray-50 rounded-lg items-start">
                        {/* 关键词 */}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">关键词</label>
                          <input
                            type="text"
                            value={rule.keywords.join(', ')}
                            onChange={(e) => updateRule(dbType, index, {
                              keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k)
                            })}
                            placeholder="amt, amount"
                            className="w-full px-2 py-1 text-sm border rounded"
                          />
                        </div>

                        {/* 匹配方式 */}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">匹配方式</label>
                          <select
                            value={rule.matchType}
                            onChange={(e) => updateRule(dbType, index, { matchType: e.target.value as any })}
                            className="w-full px-2 py-1 text-sm border rounded"
                          >
                            <option value="contains">包含</option>
                            <option value="equals">等于</option>
                            <option value="regex">正则</option>
                          </select>
                        </div>

                        {/* 匹配字段 */}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">匹配字段</label>
                          <select
                            value={rule.targetField}
                            onChange={(e) => updateRule(dbType, index, { targetField: e.target.value as any })}
                            className="w-full px-2 py-1 text-sm border rounded"
                          >
                            <option value="name">字段名</option>
                            <option value="comment">字段注释</option>
                          </select>
                        </div>

                        {/* 目标类型 */}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">目标类型</label>
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <select
                                value={rule.dataType}
                                onChange={(e) => updateRule(dbType, index, { dataType: e.target.value })}
                                className="w-full px-2 py-1 text-sm border rounded"
                              >
                                {(ALL_TYPE_OPTIONS[dbType as keyof typeof ALL_TYPE_OPTIONS] || []).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {renderTypeConfig(dbType, rule, index)}
                        </div>

                        {/* 优先级 */}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">优先级</label>
                          <input
                            type="number"
                            value={rule.priority}
                            onChange={(e) => updateRule(dbType, index, { priority: parseInt(e.target.value) })}
                            className="w-full px-2 py-1 text-sm border rounded"
                            min="0"
                            max="999"
                          />
                        </div>

                        {/* 删除按钮 */}
                        <div className="flex items-end">
                          <button
                            onClick={() => deleteRule(dbType, index)}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => addRule(dbType)}
                    className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    + 添加规则
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
