'use client';

import { useState, useEffect } from 'react';
import ExcelTab from '@/components/ExcelTab';
import CodeToNameConfig from '@/components/CodeToNameConfig';

interface GlobalRule {
  id: string;
  keywords: string[];
  matchType: 'contains' | 'equals' | 'regex';
  targetField: 'name' | 'comment';
  targetDatabases: string[];
  dataTypes: Record<string, string>;
  typeParams: Record<string, { precision?: number; scale?: number; length?: number; }>;
  priority: number;
}

const DEFAULT_GLOBAL_RULES: GlobalRule[] = [
  {
    id: 'rule-1',
    keywords: ['amt', 'amount', 'price', '金额', '价格'],
    matchType: 'contains',
    targetField: 'name',
    targetDatabases: ['spark'],
    dataTypes: {
      spark: 'DECIMAL'
    },
    typeParams: {
      spark: { precision: 24, scale: 6 }
    },
    priority: 1
  },
  {
    id: 'rule-2',
    keywords: ['date', '日期'],
    matchType: 'contains',
    targetField: 'name',
    targetDatabases: ['spark'],
    dataTypes: {
      spark: 'DATE'
    },
    typeParams: {},
    priority: 1
  },
  {
    id: 'rule-3',
    keywords: ['time', 'timestamp', '时间'],
    matchType: 'contains',
    targetField: 'name',
    targetDatabases: ['spark'],
    dataTypes: {
      spark: 'TIMESTAMP'
    },
    typeParams: {},
    priority: 1
  },
  {
    id: 'rule-4',
    keywords: ['id', 'icode'],
    matchType: 'contains',
    targetField: 'name',
    targetDatabases: ['spark'],
    dataTypes: {
      spark: 'STRING'
    },
    typeParams: {},
    priority: 1
  },
  {
    id: 'rule-5',
    keywords: ['name', '名称', '描述', '备注'],
    matchType: 'contains',
    targetField: 'name',
    targetDatabases: ['spark'],
    dataTypes: {
      spark: 'STRING'
    },
    typeParams: {},
    priority: 1
  }
];

const DB_LABELS = {
  spark: 'Spark SQL',
  mysql: 'MySQL',
  starrocks: 'StarRocks'
};

const ALL_TYPE_OPTIONS = {
  spark: ['STRING', 'VARCHAR', 'CHAR', 'DECIMAL', 'DATE', 'TIMESTAMP', 'BIGINT', 'INT', 'FLOAT', 'DOUBLE', 'BOOLEAN', 'BINARY', 'ARRAY', 'MAP', 'STRUCT'],
  mysql: ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR', 'CHAR', 'VARCHAR', 'BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'ENUM', 'SET', 'BOOLEAN', 'JSON'],
  starrocks: ['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'LARGEINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'DATE', 'DATETIME', 'CHAR', 'VARCHAR', 'STRING', 'BOOLEAN', 'JSON', 'BITMAP', 'HLL', 'PERCENTILE', 'ARRAY', 'MAP', 'STRUCT']
};

// 关键词输入组件 - 使用本地状态避免重新渲染导致光标跳动
function KeywordInput({
  value,
  onChange,
  placeholder
}: {
  value: string[];
  onChange: (keywords: string[]) => void;
  placeholder: string;
}) {
  const [localValue, setLocalValue] = useState(value.join(', '));

  useEffect(() => {
    setLocalValue(value.join(', '));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    const keywords = localValue.split(/[,，]/).map(k => k.trim()).filter(k => k);
    onChange(keywords);
    setLocalValue(keywords.join(', '));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="w-full px-2 py-1.5 text-sm border rounded"
    />
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('excel');  // 'excel' | 'generator' | 'rules' | 'codeToName'
  const [sqlInput, setSqlInput] = useState('');
  const [ddlOutput, setDdlOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDbTypes, setSelectedDbTypes] = useState<string[]>(['spark']);
  const [globalRules, setGlobalRules] = useState<GlobalRule[]>(DEFAULT_GLOBAL_RULES);
  const [saveStatus, setSaveStatus] = useState('');

  // 页面加载时从 localStorage 恢复规则
  useEffect(() => {
    const saved = localStorage.getItem('ddl_generator_global_rules');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        // 检查是否是新格式（包含typeParams）
        if (parsed.length > 0 && !parsed[0].typeParams) {
          // 迁移旧数据到新格式
          const migrated = parsed.map((rule: any) => {
            // 从dataType中提取参数
            const typeParams: Record<string, any> = {};
            const dataTypes: Record<string, string> = {};

            Object.entries(rule.dataTypes || {}).forEach(([dbType, dataType]: [string, any]) => {
              const strType = dataType as string;
              const upper = strType.toUpperCase();

              // DECIMAL(24, 6) -> DECIMAL + {precision: 24, scale: 6}
              const decimalMatch = strType.match(/^(DECIMAL|NUMERIC)\((\d+),\s*(\d+)\)$/i);
              if (decimalMatch) {
                dataTypes[dbType] = decimalMatch[1];
                typeParams[dbType] = {
                  precision: parseInt(decimalMatch[2]),
                  scale: parseInt(decimalMatch[3])
                };
              }
              // VARCHAR(255) -> VARCHAR + {length: 255}
              else if (upper.includes('VARCHAR') || upper.includes('CHAR')) {
                const varcharMatch = strType.match(/^(VARCHAR|CHAR)\((\d+)\)$/i);
                if (varcharMatch) {
                  dataTypes[dbType] = varcharMatch[1];
                  typeParams[dbType] = {
                    length: parseInt(varcharMatch[2])
                  };
                } else {
                  dataTypes[dbType] = strType;
                }
              }
              // FLOAT(53) -> FLOAT + {precision: 53}
              else if (upper.includes('FLOAT') || upper.includes('DOUBLE')) {
                const floatMatch = strType.match(/^(FLOAT|DOUBLE)\((\d+)\)$/i);
                if (floatMatch) {
                  dataTypes[dbType] = floatMatch[1];
                  typeParams[dbType] = {
                    precision: parseInt(floatMatch[2])
                  };
                } else {
                  dataTypes[dbType] = strType;
                }
              }
              else {
                dataTypes[dbType] = strType;
              }
            });

            return {
              ...rule,
              dataTypes,
              typeParams
            };
          });
          
          setGlobalRules(migrated);
          // 保存迁移后的数据
          localStorage.setItem('ddl_generator_global_rules', JSON.stringify(migrated));
        } else {
          // 新格式，直接使用
          setGlobalRules(parsed);
        }
      } catch (e) {
        console.error('Failed to load rules:', e);
        // 加载失败时使用默认规则
        setGlobalRules(DEFAULT_GLOBAL_RULES);
      }
    }
  }, []);

  // 保存规则到 localStorage
  const saveRules = () => {
    try {
      localStorage.setItem('ddl_generator_global_rules', JSON.stringify(globalRules));
      setSaveStatus('✓ 已保存');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (e) {
      console.error('Failed to save rules:', e);
    }
  };

  // 将全局规则转换为按数据库分组的规则（用于API调用）
  const convertToRulesByDatabase = (rules: GlobalRule[]): Record<string, any[]> => {
    const result: Record<string, any[]> = {};

    Object.keys(DB_LABELS).forEach(dbType => {
      result[dbType] = [];
    });

    rules.forEach(rule => {
      rule.targetDatabases.forEach(dbType => {
        const baseType = rule.dataTypes[dbType as keyof typeof rule.dataTypes] || rule.dataTypes['spark' as keyof typeof rule.dataTypes];
        const params = rule.typeParams[dbType as keyof typeof rule.typeParams] || {};

        // 构建带参数的完整类型字符串
        let fullType = baseType;
        const upper = baseType.toUpperCase();

        if (params.precision !== undefined && params.scale !== undefined &&
            (upper.includes('DECIMAL') || upper.includes('NUMERIC'))) {
          fullType = `${baseType}(${params.precision}, ${params.scale})`;
        } else if (params.length !== undefined &&
                   (upper.includes('VARCHAR') || upper.includes('CHAR'))) {
          fullType = `${baseType}(${params.length})`;
        } else if (params.precision !== undefined &&
                   (upper.includes('FLOAT') || upper.includes('DOUBLE'))) {
          fullType = `${baseType}(${params.precision})`;
        }

        result[dbType].push({
          keywords: rule.keywords,
          matchType: rule.matchType,
          targetField: rule.targetField,
          dataType: fullType,
          priority: rule.priority
        });
      });
    });

    return result;
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
          rulesByDatabase: convertToRulesByDatabase(globalRules),
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
      setGlobalRules(JSON.parse(JSON.stringify(DEFAULT_GLOBAL_RULES)));
      saveRules();
    }
  };

  const handleClearLocalStorage = () => {
    if (confirm('确定要清除所有保存的规则数据吗？这将删除localStorage中的所有规则，恢复为默认规则。')) {
      localStorage.removeItem('ddl_generator_global_rules');
      setGlobalRules(JSON.parse(JSON.stringify(DEFAULT_GLOBAL_RULES)));
      alert('已清除localStorage，规则已恢复为默认值');
    }
  };

  const addRule = () => {
    const newRule: GlobalRule = {
      id: `rule-${Date.now()}`,
      keywords: [],
      matchType: 'contains',
      targetField: 'name',
      targetDatabases: ['spark'],
      dataTypes: {
        spark: 'STRING'
      },
      typeParams: {},
      priority: 999
    };
    setGlobalRules([...globalRules, newRule]);
    saveRules();
  };

  const deleteRule = (id: string) => {
    setGlobalRules(globalRules.filter(r => r.id !== id));
    saveRules();
  };

  const updateRule = (id: string, updates: Partial<GlobalRule>) => {
    setGlobalRules(globalRules.map(rule =>
      rule.id === id ? { ...rule, ...updates } : rule
    ));
    saveRules();
  };

  const toggleAllDatabases = (ruleId: string, selectAll: boolean) => {
    setGlobalRules(globalRules.map(rule => {
      if (rule.id !== ruleId) return rule;

      const allDatabases = Object.keys(DB_LABELS);
      const newTargetDatabases = selectAll ? allDatabases : [];

      // 如果全选，自动为所有数据库设置类型（沿用第一个数据库的类型）
      if (selectAll && newTargetDatabases.length > 0) {
        const firstDbType = newTargetDatabases[0];
        const baseType = rule.dataTypes[firstDbType as keyof typeof rule.dataTypes];
        const baseParams = rule.typeParams[firstDbType as keyof typeof rule.typeParams] || {};

        const newDataTypes: Record<string, string> = {};
        const newTypeParams: Record<string, any> = {};

        newTargetDatabases.forEach(dbType => {
          newDataTypes[dbType] = baseType || 'STRING';
          newTypeParams[dbType] = baseParams;
        });

        return {
          ...rule,
          targetDatabases: newTargetDatabases,
          dataTypes: newDataTypes,
          typeParams: newTypeParams
        };
      }

      return {
        ...rule,
        targetDatabases: newTargetDatabases
      };
    }));
    saveRules();
  };

  const handleDatabaseChange = (ruleId: string, dbType: string, checked: boolean) => {
    setGlobalRules(globalRules.map(rule => {
      if (rule.id !== ruleId) return rule;

      const newTargetDatabases = checked
        ? [...rule.targetDatabases, dbType]
        : rule.targetDatabases.filter(d => d !== dbType);

      // 如果勾选了数据库，自动沿用第一个数据库的类型
      if (checked && newTargetDatabases.length > 1) {
        const firstDbType = newTargetDatabases[0];
        const baseType = rule.dataTypes[firstDbType as keyof typeof rule.dataTypes] || 'STRING';
        const baseParams = rule.typeParams[firstDbType as keyof typeof rule.typeParams] || {};

        const newDataTypes = { ...rule.dataTypes, [dbType]: baseType };
        const newTypeParams = { ...rule.typeParams, [dbType]: baseParams };

        return {
          ...rule,
          targetDatabases: newTargetDatabases,
          dataTypes: newDataTypes,
          typeParams: newTypeParams
        };
      }

      // 如果取消勾选，移除对应的类型配置
      if (!checked) {
        const newDataTypes = { ...rule.dataTypes };
        const newTypeParams = { ...rule.typeParams };
        delete newDataTypes[dbType as keyof typeof newDataTypes];
        delete newTypeParams[dbType as keyof typeof newTypeParams];

        return {
          ...rule,
          targetDatabases: newTargetDatabases,
          dataTypes: newDataTypes,
          typeParams: newTypeParams
        };
      }

      return {
        ...rule,
        targetDatabases: newTargetDatabases
      };
    }));
    saveRules();
  };

  const updateTypeParam = (ruleId: string, dbType: string, paramUpdates: any) => {
    setGlobalRules(globalRules.map(rule => {
      if (rule.id !== ruleId) return rule;

      const newTypeParams = { ...rule.typeParams };
      newTypeParams[dbType] = { ...newTypeParams[dbType], ...paramUpdates };

      return { ...rule, typeParams: newTypeParams };
    }));
    saveRules();
  };

  const hasTypeParams = (dataType: string) => {
    const upper = dataType.toUpperCase();
    return upper.includes('VARCHAR') || upper.includes('CHAR') ||
           upper.includes('DECIMAL') || upper.includes('NUMERIC') ||
           upper.includes('FLOAT') || upper.includes('DOUBLE');
  };

  const renderTypeParams = (rule: GlobalRule, dbType: string) => {
    const dataType = rule.dataTypes[dbType as keyof typeof rule.dataTypes];
    if (!dataType) return null;

    const upper = dataType.toUpperCase();
    const params = rule.typeParams[dbType as keyof typeof rule.typeParams] || {};

    if (!hasTypeParams(dataType)) return null;

    if (upper.includes('DECIMAL') || upper.includes('NUMERIC')) {
      return (
        <div className="flex gap-2 mt-2">
          <div className="flex-1">
            <input
              type="number"
              value={params.precision || 24}
              onChange={(e) => updateTypeParam(rule.id, dbType, { precision: parseInt(e.target.value) })}
              className="w-full px-2 py-1 text-xs border rounded"
              min="1"
              max="65"
              placeholder="精度"
            />
          </div>
          <div className="flex-1">
            <input
              type="number"
              value={params.scale || 6}
              onChange={(e) => updateTypeParam(rule.id, dbType, { scale: parseInt(e.target.value) })}
              className="w-full px-2 py-1 text-xs border rounded"
              min="0"
              max="30"
              placeholder="小数位"
            />
          </div>
        </div>
      );
    } else if (upper.includes('VARCHAR') || upper.includes('CHAR')) {
      return (
        <div className="mt-2">
          <input
            type="number"
            value={params.length || 255}
            onChange={(e) => updateTypeParam(rule.id, dbType, { length: parseInt(e.target.value) })}
            className="w-full px-2 py-1 text-xs border rounded"
            min="1"
            max="65535"
            placeholder="长度"
          />
        </div>
      );
    } else if (upper.includes('FLOAT') || upper.includes('DOUBLE')) {
      return (
        <div className="mt-2">
          <input
            type="number"
            value={params.precision || ''}
            onChange={(e) => updateTypeParam(rule.id, dbType, {
              precision: e.target.value ? parseInt(e.target.value) : undefined
            })}
            className="w-full px-2 py-1 text-xs border rounded"
            min="1"
            max="255"
            placeholder="精度"
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">DDL工作集</h1>
        <p className="text-center text-gray-600 mb-8">自动解析SQL查询，生成符合规范的建表语句</p>

        {/* 标签页导航 */}
        <div className="flex gap-2 mb-6 border-b-2 border-gray-300">
          <button
            onClick={() => setActiveTab('excel')}
            className={`px-6 py-3 font-medium rounded-t-lg transition-all ${
              activeTab === 'excel'
                ? 'bg-blue-600 text-white border-t border-l border-r border-blue-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Excel上传
          </button>
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
          <button
            onClick={() => setActiveTab('codeToName')}
            className={`px-6 py-3 font-medium rounded-t-lg transition-all ${
              activeTab === 'codeToName'
                ? 'bg-blue-600 text-white border-t border-l border-r border-blue-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            码转名配置
          </button>
        </div>

        {/* Excel上传标签页 */}
        <div style={{ display: activeTab === 'excel' ? 'block' : 'none' }}>
          <ExcelTab />
        </div>

        {/* DDL生成器标签页 */}
        <div style={{ display: activeTab === 'generator' ? 'block' : 'none' }}>
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
                    {selectedDbTypes.length > 1 ? '建表语句' : (DB_LABELS[selectedDbTypes[0] as keyof typeof DB_LABELS] || '建表语句')}
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
        </div>

        {/* 规则管理器标签页 */}
        <div style={{ display: activeTab === 'rules' ? 'block' : 'none' }}>
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
              <button
                onClick={handleClearLocalStorage}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                🗑️ 清除缓存
              </button>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm text-blue-700">
              <strong>💡 提示：</strong> 规则会自动保存到浏览器，刷新页面后可继续使用。
            </div>

            {/* 规则列表 */}
            <div className="space-y-4">
              {globalRules.map((rule, index) => (
                <div key={rule.id} className="border rounded-xl p-4 bg-gray-50">
                  {/* 第一行：关键词、匹配方式、匹配字段 */}
                  <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 mb-3">
                    {/* 关键词 */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">关键词</label>
                      <KeywordInput
                        value={rule.keywords}
                        onChange={(keywords) => updateRule(rule.id, { keywords })}
                        placeholder="amt, amount, 金额"
                      />
                    </div>

                    {/* 匹配方式 */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">匹配方式</label>
                      <select
                        value={rule.matchType}
                        onChange={(e) => updateRule(rule.id, { matchType: e.target.value as any })}
                        className="w-full px-2 py-1.5 text-sm border rounded"
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
                        onChange={(e) => updateRule(rule.id, { targetField: e.target.value as any })}
                        className="w-full px-2 py-1.5 text-sm border rounded"
                      >
                        <option value="name">字段名</option>
                        <option value="comment">字段注释</option>
                      </select>
                    </div>
                  </div>

                  {/* 第二行：目标数据库 */}
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs text-gray-500">目标数据库</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAllDatabases(rule.id, true)}
                          className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        >
                          全选
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleAllDatabases(rule.id, false)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                        >
                          取消全选
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(DB_LABELS).map(([dbType, label]) => (
                        <label
                          key={dbType}
                          className="flex items-center gap-1 px-3 py-1.5 border rounded-lg cursor-pointer hover:bg-white transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={rule.targetDatabases.includes(dbType)}
                            onChange={(e) => handleDatabaseChange(rule.id, dbType, e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 第三行：各数据库的字段类型 */}
                  <div className="mb-3">
                    <label className="text-xs text-gray-500 block mb-2">字段类型映射</label>
                    <div className="grid grid-cols-4 gap-3">
                      {Object.entries(DB_LABELS).map(([dbType, label]) => (
                        <div key={dbType}>
                          <label className="text-xs text-gray-500 block mb-1">{label}</label>
                          <select
                            value={rule.dataTypes[dbType] || ''}
                            onChange={(e) => updateRule(rule.id, {
                              dataTypes: { ...rule.dataTypes, [dbType]: e.target.value }
                            })}
                            className="w-full px-2 py-1.5 text-sm border rounded"
                            disabled={!rule.targetDatabases.includes(dbType)}
                          >
                            <option value="">-- 未选择 --</option>
                            {(ALL_TYPE_OPTIONS[dbType as keyof typeof ALL_TYPE_OPTIONS] || []).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          {rule.targetDatabases.includes(dbType) && renderTypeParams(rule, dbType)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                    >
                      删除规则
                    </button>
                  </div>
                </div>
              ))}

              {globalRules.length === 0 && (
                <p className="text-gray-500 text-center py-8">暂无规则，请点击下方按钮添加</p>
              )}
            </div>

            <button
              onClick={addRule}
              className="mt-6 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
            >
              + 添加新规则
            </button>
          </div>
        </div>

        {/* 码转名配置标签页 */}
        <div style={{ display: activeTab === 'codeToName' ? 'block' : 'none' }}>
          <CodeToNameConfig onDataChange={() => {
            // 触发 storage 事件，通知 ExcelTab 重新生成 INSERT 和 DWD
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'codeToNameConfig',
              newValue: localStorage.getItem('codeToNameConfig') || ''
            }));
          }} />
        </div>
      </div>
    </div>
  );
}
