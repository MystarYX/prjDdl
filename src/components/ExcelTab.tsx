'use client';

import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileSpreadsheet, AlertCircle, Download, Trash2, Copy, CheckCircle2, Code2, Database, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ExcelData {
  headers: string[];
  rows: any[][];
  fileName: string;
  sheetName: string;
}

interface GlobalRule {
  id: string;
  keywords: string[];
  matchType: 'contains' | 'equals' | 'prefix' | 'suffix';
  targetField: 'name' | 'comment';
  targetDatabases: string[];
  dataTypes: Record<string, string>;
  typeParams: Record<string, { precision?: number; scale?: number; length?: number; }>;
  priority: number;
}

export default function ExcelTab() {
  const { success, error: toastError, warning, info } = useToast();
  
  const [data, setData] = useState<ExcelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [odsTableName, setOdsTableName] = useState<string>('');
  const [dwdTableName, setDwdTableName] = useState<string>('');
  const [odsSQL, setOdsSQL] = useState<string>('');
  const [dwdSQL, setDwdSQL] = useState<string>('');
  const [insertSQL, setInsertSQL] = useState<string>('');
  const [copiedODS, setCopiedODS] = useState(false);
  const [copiedDWD, setCopiedDWD] = useState(false);
  const [copiedInsert, setCopiedInsert] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const odsSqlRef = useRef<HTMLTextAreaElement>(null);
  const dwdSqlRef = useRef<HTMLTextAreaElement>(null);
  const insertSqlRef = useRef<HTMLTextAreaElement>(null);
  
  // 记录每个字段后面新增的码转名字段（用于DWD建表SQL生成）
  const [codeToNameFieldsMap, setCodeToNameFieldsMap] = useState<Map<number, { name: string; desc: string }[]>>(new Map());
  
  // 用于存储最近一次生成的码转名字段信息（用于 DWD 生成）
  const codeToNameFieldsRef = useRef<Map<number, { name: string; desc: string }[]>>(new Map());
  
  // 规则管理器的规则
  const [globalRules, setGlobalRules] = useState<GlobalRule[]>([]);
  
  // 触发重新生成的标记
  const [refreshDWD, setRefreshDWD] = useState(0);
  const [refreshInsert, setRefreshInsert] = useState(0);

  // 页面加载时从 localStorage 恢复规则
  useEffect(() => {
    console.log('=== ExcelTab 组件加载 ===');
    console.log('环境:', process.env.NODE_ENV);
    console.log('域名:', window.location.hostname);

    const loadRules = () => {
      const saved = localStorage.getItem('ddl_generator_global_rules');
      console.log('📥 ExcelTab 从 localStorage 读取规则:', saved);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          console.log('✅ ExcelTab 解析规则数量:', parsed.length);
          console.log('✅ ExcelTab 解析规则详情:', JSON.stringify(parsed, null, 2));
          setGlobalRules(parsed);
        } catch (e) {
          console.error('❌ ExcelTab 解析规则失败:', e);
        }
      } else {
        console.log('ℹ️ ExcelTab localStorage 中没有规则');
      }
    };

    // 初始加载
    loadRules();

    // 监听 localStorage 变化（当规则管理器更新规则时触发）
    const handleStorageChange = (e: StorageEvent) => {
      // 监听规则管理器的变化
      if (e.key === 'ddl_generator_global_rules' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          console.log('规则更新，数量:', parsed.length);
          console.log('第一个规则:', parsed[0]);
          setGlobalRules(parsed);
          // 触发 DWD 重新生成
          setRefreshDWD(prev => prev + 1);
        } catch (err) {
          console.error('Failed to update rules from storage:', err);
        }
      }

      // 监听码转名维表配置的变化
      if (e.key === 'codeToNameConfig') {
        console.log('码转名配置更新');
        // 触发 INSERT 语句重新生成
        setRefreshInsert(prev => prev + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // 清理事件监听器
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // 当规则变化时，重新生成 DWD SQL
  useEffect(() => {
    if (data && dwdTableName && refreshDWD > 0) {
      // 直接生成 DWD（不需要 setTimeout）
      // inferFieldType 内部会从 localStorage 读取最新规则
      generateDWDSQL();
    }
  }, [refreshDWD, data, dwdTableName, globalRules]);

  // 已改为手动生成，不再自动生成 INSERT
  // useEffect(() => {
  //   if (data && refreshInsert > 0) {
  //     // 稍微延迟以确保状态已更新
  //     setTimeout(() => {
  //       generateInsertSQL();
  //     }, 100);
  //   }
  // }, [refreshInsert, data]);

  // 根据字段名和注释推断字段类型（使用规则管理器的规则）
  const inferFieldType = (fieldName: string, fieldComment: string): string => {
    // 安全处理空值
    const safeFieldName = fieldName || '';
    const safeFieldComment = fieldComment || '';

    // 直接从 localStorage 读取最新的规则（确保使用最新规则）
    let rulesToUse = globalRules;
    try {
      const savedRules = localStorage.getItem('ddl_generator_global_rules');
      if (savedRules) {
        const parsed = JSON.parse(savedRules);
        if (Array.isArray(parsed) && parsed.length > 0) {
          rulesToUse = parsed;
          console.log('🔍 inferFieldType: 使用 localStorage 中的最新规则，数量:', parsed.length);
          // 打印所有规则的 matchType
          console.log('📋 所有规则的匹配类型:', parsed.map((r: any) => ({
            keywords: r.keywords,
            matchType: r.matchType,
            targetField: r.targetField,
            dataType: r.dataTypes?.spark
          })));
        }
      }
    } catch (e) {
      console.error('❌ inferFieldType: 读取规则失败:', e);
    }

    // 优先使用规则管理器的规则
    for (const rule of rulesToUse) {
      // 安全处理空值和类型
      const matchField = rule.targetField === 'name' 
        ? safeFieldName.toLowerCase() 
        : safeFieldComment.toLowerCase();
      
      // 安全处理 keywords
      const keywords = Array.isArray(rule.keywords) 
        ? rule.keywords.map(k => (k || '').toLowerCase()).filter(k => k.length > 0)
        : [];

      // 如果没有关键词，跳过此规则
      if (keywords.length === 0) {
        continue;
      }

      let matches = false;
      if (rule.matchType === 'contains') {
        matches = keywords.some(keyword => matchField.includes(keyword));
      } else if (rule.matchType === 'equals') {
        matches = keywords.some(keyword => matchField === keyword);
      } else if (rule.matchType === 'prefix') {
        matches = keywords.some(keyword => matchField.startsWith(keyword.trim()));
      } else if (rule.matchType === 'suffix') {
        matches = keywords.some(keyword => matchField.endsWith(keyword.trim()));
      }

      // 打印匹配过程的详细信息
      if (rule.matchType !== 'contains') {
        console.log(`🔎 测试规则 [${rule.matchType}]:`, {
          matchField,
          keywords,
          ruleId: rule.id,
          result: matches
        });
      }

      if (matches) {
        // 安全获取数据类型，添加默认值
        const sparkType = rule.dataTypes?.['spark'] || rule.dataTypes?.['mysql'] || rule.dataTypes?.['starrocks'] || 'STRING';
        
        if (sparkType) {
          const params = rule.typeParams?.['spark'] || rule.typeParams?.['mysql'] || rule.typeParams?.['starrocks'] || {};
          // 安全处理 undefined 类型
          const fullType = sparkType ? sparkType.toUpperCase() : 'STRING';
          
          // 添加参数
          const upper = fullType;
          if (params.precision !== undefined && params.scale !== undefined &&
              (upper.includes('DECIMAL') || upper.includes('NUMERIC'))) {
            return `${fullType}(${params.precision},${params.scale})`;
          } else if (params.length !== undefined &&
                     (upper.includes('VARCHAR') || upper.includes('CHAR'))) {
            return `${fullType}(${params.length})`;
          } else if (params.precision !== undefined &&
                     (upper.includes('FLOAT') || upper.includes('DOUBLE'))) {
            return `${fullType}(${params.precision})`;
          }
          
          // 如果是 DECIMAL 类型但没有参数，使用默认参数
          if ((upper.includes('DECIMAL') || upper.includes('NUMERIC')) && 
              params.precision === undefined) {
            console.warn(`⚠️ DECIMAL 类型 [${safeFieldName}] 缺少参数，使用默认参数 (24,6)`);
            return `${fullType}(24,6)`;
          }
          
          // 只在匹配到规则时打印日志
          console.log(`✅ 字段 [${safeFieldName}] 匹配规则: ${rule.matchType} [${keywords.join(', ')}] -> 类型: ${fullType}`);
          return fullType;
        }
      }
    }

    // 如果没有匹配到规则，根据字段名后缀推断类型
    const lowerName = safeFieldName.toLowerCase();
    if (lowerName.endsWith('_time') || lowerName.endsWith('time') || lowerName.includes('timestamp')) {
      return 'TIMESTAMP';
    } else if (lowerName.endsWith('_date') || lowerName.includes('date')) {
      return 'DATE';
    } else if (lowerName.endsWith('_amt') || lowerName.includes('amount') || lowerName.includes('price') ||
               lowerName.includes('金额') || lowerName.includes('价格')) {
      return 'DECIMAL(24,6)';
    } else if (lowerName.endsWith('_cnt') || lowerName.includes('count') || lowerName.includes('num')) {
      return 'BIGINT';
    } else if (lowerName.startsWith('is_') || lowerName.endsWith('_flag') || lowerName.endsWith('_flg')) {
      return 'STRING';
    } else if (lowerName.includes('id') || lowerName.includes('code')) {
      return 'STRING';
    }

    // 默认使用 STRING
    return 'STRING';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv' // csv
    ];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (!fileExtension || !['xlsx', 'xls', 'csv'].includes(fileExtension)) {
      setError('请上传有效的 Excel 文件 (.xlsx, .xls, .csv)');
      return;
    }

    setLoading(true);
    setError('');
    setOdsTableName('');
    setDwdTableName('');
    setOdsSQL('');
    setDwdSQL('');

    try {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          // 获取第一个工作表
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // 转换为 JSON 数据
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (jsonData.length === 0) {
            setError('Excel 文件为空');
            setLoading(false);
            return;
          }

          // 提取表头和数据
          const headers = jsonData[0] as string[];
          const rows = jsonData.slice(1).filter(row => row.length > 0);

          // 清除之前的码转名字段映射
          setCodeToNameFieldsMap(new Map());

          setData({
            headers,
            rows,
            fileName: file.name,
            sheetName: firstSheetName
          });

          // 自动识别ODS表名（从"来源表"列）
          const sourceTableHeader = headers.find(h => h && h.includes('来源表'));
          if (sourceTableHeader) {
            const firstRow = rows[0];
            if (firstRow) {
              const headerIndex = headers.indexOf(sourceTableHeader);
              if (headerIndex !== -1 && firstRow[headerIndex]) {
                let tableNameValue = String(firstRow[headerIndex]);
                tableNameValue = tableNameValue.replace(/\s+t\s*$/, '').trim();
                setOdsTableName(tableNameValue);
              }
            }
          }

          // 自动识别DWD表名（从"表英文名"列）
          const tableEnNameHeader = headers.find(h => h && h.includes('表英文名'));
          if (tableEnNameHeader) {
            const firstRow = rows[0];
            if (firstRow) {
              const headerIndex = headers.indexOf(tableEnNameHeader);
              if (headerIndex !== -1 && firstRow[headerIndex]) {
                setDwdTableName(String(firstRow[headerIndex]).trim());
              }
            }
          }
        } catch (err) {
          setError('解析 Excel 文件失败，请确保文件格式正确');
          console.error(err);
        } finally {
          setLoading(false);
        }
      };

      reader.onerror = () => {
        setError('读取文件失败');
        setLoading(false);
      };

      reader.readAsBinaryString(file);
    } catch (err) {
      setError('处理文件时发生错误');
      setLoading(false);
    }
  };

  // 自动生成SQL（当表名或数据变化时）
  // 已改为手动生成，不再自动生成 ODS
  // useEffect(() => {
  //   if (data && odsTableName) {
  //     generateODSSQL();
  //   }
  // }, [data, odsTableName]);

  // 已改为手动生成，不再自动生成 INSERT
  // useEffect(() => {
  //   if (data) {
  //     generateInsertSQL();
  //   }
  // }, [data, dwdTableName, odsTableName]);

  const handleReset = () => {
    setData(null);
    setError('');
    setOdsTableName('');
    setDwdTableName('');
    setOdsSQL('');
    setDwdSQL('');
    setInsertSQL('');
    setCodeToNameFieldsMap(new Map());
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const exportToCSV = () => {
    if (!data) return;

    const csvContent = [
      data.headers.join(','),
      ...data.rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${data.fileName.split('.')[0]}_exported.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 生成ODS表名
  const generateODSTableName = (inputName: string): string => {
    if (!inputName) return '';
    
    const cleanName = inputName.replace(/\s+t\s*$/, '').trim();
    
    const lowerName = cleanName.toLowerCase();
    if (lowerName.includes('ods')) {
      return cleanName;
    } else {
      return `ods_erp_${cleanName}_df`;
    }
  };

  // 生成DWD表名
  const generateDWDTableName = (inputName: string): string => {
    if (!inputName) return '';
    
    const cleanName = inputName.trim();
    
    const lowerName = cleanName.toLowerCase();
    if (lowerName.includes('dwd')) {
      return cleanName;
    } else {
      return `dwd_erp_${cleanName}_df`;
    }
  };

  // 清理来源字段名：支持复杂表达式格式
  const cleanFieldName = (fieldName: string): string => {
    if (!fieldName) return '';
    
    const str = String(fieldName).trim();
    
    // 匹配 t.xxx, 格式（如：date_format(t.s_sign_time,'yyyy-MM-dd')）
    const tDotCommaMatch = str.match(/t\.([^,]+)/);
    if (tDotCommaMatch) {
      return tDotCommaMatch[1].trim();
    }
    
    // 匹配 t.xxx 格式（如：t.s_sign_time）
    const tDotMatch = str.match(/t\.(\w+)/);
    if (tDotMatch) {
      return tDotMatch[1].trim();
    }
    
    // 否则直接使用原值
    return str;
  };

  // 生成ODS建表SQL
  const generateODSSQL = () => {
    if (!data || !odsTableName) {
      setOdsSQL('');
      return;
    }

    const finalTableName = generateODSTableName(odsTableName);
    
    // 查找ODS所需的列
    const sourceFieldHeader = data.headers.find(h => h && h.includes('来源字段'));
    const sourceFieldDescHeader = data.headers.find(h => h && h.includes('来源字段描述'));
    const tableCommentHeader = data.headers.find(h => h && h.includes('来源表描述'));
    
    if (!sourceFieldHeader) {
      setError('ODS: 未找到"来源字段"列，无法生成ODS建表SQL');
      setOdsSQL('');
      return;
    }

    const sourceFieldIndex = data.headers.indexOf(sourceFieldHeader);
    const sourceFieldDescIndex = sourceFieldDescHeader ? data.headers.indexOf(sourceFieldDescHeader) : -1;
    const tableCommentIndex = tableCommentHeader ? data.headers.indexOf(tableCommentHeader) : -1;

    // 提取表注释（从"来源表描述"列）
    let tableComment = finalTableName;
    if (tableCommentIndex !== -1 && data.rows.length > 0) {
      const commentValue = data.rows[0][tableCommentIndex];
      if (commentValue && String(commentValue).trim() !== '') {
        tableComment = String(commentValue).trim();
      }
    }

    // 先提取所有字段名，用于检测重复
    const allFieldNames = data.rows
      .map(row => {
        const fieldName = row[sourceFieldIndex];
        return fieldName ? String(fieldName).trim() : '';
      })
      .filter(name => name !== '');

    // 统计字段名出现次数
    const fieldNameCount = allFieldNames.reduce((acc, name) => {
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 从"来源字段"列提取所有字段（过滤掉空值）
    const fields = data.rows
      .map(row => {
        const fieldName = row[sourceFieldIndex];
        const fieldDesc = sourceFieldDescIndex !== -1 ? row[sourceFieldDescIndex] : fieldName;
        
        if (fieldName && String(fieldName).trim() !== '') {
          const cleanedFieldName = cleanFieldName(String(fieldName));
          
          // 检测字段重复
          const isDuplicate = (fieldNameCount[cleanedFieldName] || 0) > 1;
          let fieldComment = fieldDesc ? String(fieldDesc).trim() : cleanedFieldName;
          if (isDuplicate) {
            fieldComment += '（此字段重复）';
          }

          return {
            name: cleanedFieldName,
            type: 'STRING',
            comment: fieldComment
          };
        }
        return null;
      })
      .filter((f): f is { name: string; type: string; comment: string } => f !== null);

    if (fields.length === 0) {
      setError('ODS: "来源字段"列中没有找到有效的字段名');
      setOdsSQL('');
      return;
    }

    generateFinalSQL(finalTableName, tableComment, fields, setOdsSQL);
    setError('');
  };

  // 生成DWD建表SQL
  const generateDWDSQL = (extraCodeToNameFields?: Map<number, { name: string; desc: string }[]>) => {
    if (!data || !dwdTableName) {
      setDwdSQL('');
      return;
    }

    // 如果传入了额外的码转名字段，使用它来更新 codeToNameFieldsMap 和 ref
    if (extraCodeToNameFields && extraCodeToNameFields.size > 0) {
      // 同步更新 ref
      codeToNameFieldsRef.current = new Map(extraCodeToNameFields);
      // 更新 state
      setCodeToNameFieldsMap(new Map(extraCodeToNameFields));
    }

    const finalTableName = generateDWDTableName(dwdTableName);
    
    // 查找DWD所需的列
    const fieldNameHeader = data.headers.find(h => h && h.includes('字段名'));
    const fieldDescHeader = data.headers.find(h => h && h.includes('字段描述'));
    const fieldTypeHeader = data.headers.find(h => h && h.includes('字段类型'));
    const tableCommentHeader = data.headers.find(h => h && h.includes('表中文名'));
    
    if (!fieldNameHeader) {
      setError('DWD: 未找到"字段名"列，无法生成DWD建表SQL');
      setDwdSQL('');
      return;
    }

    const fieldNameIndex = data.headers.indexOf(fieldNameHeader);
    const fieldDescIndex = fieldDescHeader ? data.headers.indexOf(fieldDescHeader) : -1;
    const fieldTypeIndex = fieldTypeHeader ? data.headers.indexOf(fieldTypeHeader) : -1;
    const tableCommentIndex = tableCommentHeader ? data.headers.indexOf(tableCommentHeader) : -1;

    // 提取表注释（从"表中文名"列）
    let tableComment = finalTableName;
    if (tableCommentIndex !== -1 && data.rows.length > 0) {
      const commentValue = data.rows[0][tableCommentIndex];
      if (commentValue && String(commentValue).trim() !== '') {
        tableComment = String(commentValue).trim();
      }
    }

    // 先提取所有字段名，用于检测重复
    const allFieldNames = data.rows
      .map(row => {
        const fieldName = row[fieldNameIndex];
        return fieldName ? String(fieldName).trim() : '';
      })
      .filter(name => name !== '');

    // 统计字段名出现次数
    const fieldNameCount = allFieldNames.reduce((acc, name) => {
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 从"字段名"列提取所有字段（过滤掉空值）
    const fields = data.rows
      .map(row => {
        const fieldName = row[fieldNameIndex];
        const fieldDesc = fieldDescIndex !== -1 ? row[fieldDescIndex] : null;
        
        if (fieldName && String(fieldName).trim() !== '') {
          const fieldNameStr = String(fieldName).trim();
          const fieldCommentStr = fieldDesc ? String(fieldDesc).trim() : fieldNameStr;
          
          // 检测字段重复
          const isDuplicate = (fieldNameCount[fieldNameStr] || 0) > 1;
          let fieldComment = fieldCommentStr;
          if (isDuplicate) {
            fieldComment += '（此字段重复）';
          }

          // 使用规则管理器推断字段类型
          const fieldType = inferFieldType(fieldNameStr, fieldCommentStr);

          return {
            name: fieldNameStr,
            type: fieldType,
            comment: fieldComment
          };
        }
        return null;
      })
      .filter((f): f is { name: string; type: string; comment: string } => f !== null);

    if (fields.length === 0) {
      setError('DWD: "字段名"列中没有找到有效的字段名');
      setDwdSQL('');
      return;
    }

    // 将码转名字段插入到对应的位置
    const finalFields: { name: string; type: string; comment: string }[] = [];
    // 使用传入的 extraCodeToNameFields 或者 state 中的 codeToNameFieldsMap
    const codeToNameFieldsToUse = extraCodeToNameFields || codeToNameFieldsMap;
    
    fields.forEach((field, index) => {
      finalFields.push(field);
      
      // 检查这个字段后面是否有新增的码转名字段
      const newFields = codeToNameFieldsToUse.get(index);
      if (newFields && newFields.length > 0) {
        newFields.forEach(newField => {
          finalFields.push({
            name: newField.name,
            type: 'STRING',
            comment: newField.desc
          });
        });
      }
    });

    generateFinalSQL(finalTableName, tableComment, finalFields, setDwdSQL);
    setError('');
  };

  // 生成最终的SQL
  const generateFinalSQL = (tableName: string, tableComment: string, fields: { name: string; type: string; comment: string }[], setSQL: (sql: string) => void) => {
    // 计算对齐的最大长度
    const maxNameLength = Math.max(...fields.map(f => f.name.length), 'etl_time'.length);
    const maxTypeLength = Math.max(...fields.map(f => f.type.length), 'string'.length);
    const maxCommentLength = Math.max(...fields.map(f => f.comment.length), '数据入库时间'.length);

    // 生成字段定义
    const fieldDefinitions = fields.map((field, index) => {
      const isFirst = index === 0;
      const comma = isFirst ? '  ' : '  ,';
      const namePadded = `${field.name}${' '.repeat(Math.max(0, maxNameLength - field.name.length))}`;
      const typePadded = field.type + ' '.repeat(Math.max(0, maxTypeLength - field.type.length));
      const commentPadded = `'${field.comment}'${' '.repeat(Math.max(0, maxCommentLength - field.comment.length))}`;
      
      return `${comma}${namePadded} ${typePadded} COMMENT ${commentPadded}`;
    }).join('\n');

    // 添加 etl_time 字段
    const etlNamePadded = `etl_time${' '.repeat(Math.max(0, maxNameLength - 'etl_time'.length))}`;
    const etlTypePadded = 'TIMESTAMP' + ' '.repeat(Math.max(0, maxTypeLength - 'TIMESTAMP'.length));
    const etlCommentPadded = `'数据入库时间'${' '.repeat(Math.max(0, maxCommentLength - '数据入库时间'.length))}`;
    const etlField = `  ,${etlNamePadded} ${etlTypePadded} COMMENT ${etlCommentPadded}`;

    const sql = `CREATE TABLE IF NOT EXISTS ${tableName}
(
${fieldDefinitions}
${etlField}
) COMMENT '${tableComment}' 
PARTITIONED BY (pt STRING) 
STORED AS ORC 
LIFECYCLE 10;`;

    setSQL(sql);
  };

  // 生成插入语句SQL
  const generateInsertSQL = () => {
    if (!data) {
      setInsertSQL('');
      return;
    }

    // 查找所需的列
    const tableEnNameHeader = data.headers.find(h => h && h.includes('表英文名'));
    const sourceFieldHeader = data.headers.find(h => h && h.includes('来源字段'));
    const fieldNameHeader = data.headers.find(h => h && h.includes('字段名'));
    const fieldDescHeader = data.headers.find(h => h && h.includes('字段描述'));
    const sourceTableHeader = data.headers.find(h => h && h.includes('来源表'));

    if (!tableEnNameHeader || !sourceFieldHeader || !fieldNameHeader || !sourceTableHeader) {
      // 如果缺少必需列，不生成错误，只清空SQL
      setInsertSQL('');
      return;
    }

    const tableEnNameIndex = data.headers.indexOf(tableEnNameHeader);
    const sourceFieldIndex = data.headers.indexOf(sourceFieldHeader);
    const fieldNameIndex = data.headers.indexOf(fieldNameHeader);
    const fieldDescIndex = fieldDescHeader ? data.headers.indexOf(fieldDescHeader) : -1;
    const sourceTableIndex = data.headers.indexOf(sourceTableHeader);

    // 提取表英文名（从"表英文名"列的第一行）
    let targetTableName = '';
    if (data.rows.length > 0) {
      const tableEnNameValue = data.rows[0][tableEnNameIndex];
      if (tableEnNameValue) {
        targetTableName = String(tableEnNameValue).trim();
      }
    }

    // 提取来源表名（从"来源表"列的第一行），并使用ODS生成器生成最终表名
    let sourceTableName = '';
    if (data.rows.length > 0) {
      const sourceTableValue = data.rows[0][sourceTableIndex];
      if (sourceTableValue) {
        let rawTableName = String(sourceTableValue).trim();
        // 去掉末尾的 t
        rawTableName = rawTableName.replace(/\s+t\s*$/, '').trim();
        // 使用ODS生成器生成带前缀的表名
        sourceTableName = generateODSTableName(rawTableName);
      }
    }

    if (!targetTableName || !sourceTableName) {
      setInsertSQL('');
      return;
    }

    // 清除之前的码转名字段映射（state 和 ref 都需要清空）
    setCodeToNameFieldsMap(new Map());
    codeToNameFieldsRef.current = new Map();

    // 从localStorage加载码转名维表配置
    let codeToNameConfigs: any[] = [];
    try {
      const savedData = localStorage.getItem('codeToNameConfig');
      if (savedData) {
        codeToNameConfigs = JSON.parse(savedData);
      }
    } catch (err) {
      console.error('加载码转名维表配置失败', err);
    }

    // 先提取所有字段名，用于检测重复
    const allFieldNames = data.rows
      .map(row => {
        const fieldName = row[fieldNameIndex];
        return fieldName ? String(fieldName).trim() : '';
      })
      .filter(name => name !== '');

    // 统计字段名出现次数
    const fieldNameCount = allFieldNames.reduce((acc, name) => {
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 提取字段映射
    const fields = data.rows
      .map(row => {
        const sourceField = row[sourceFieldIndex];
        const fieldName = row[fieldNameIndex];
        const fieldDesc = fieldDescIndex !== -1 ? row[fieldDescIndex] : null;

        if (sourceField && fieldName && String(sourceField).trim() !== '' && String(fieldName).trim() !== '') {
          // 将 t. 和  t  替换为 m.
          let sourceFieldCleaned = String(sourceField).trim();
          sourceFieldCleaned = sourceFieldCleaned.replace(/\s+t\s+/g, ' m.');
          sourceFieldCleaned = sourceFieldCleaned.replace(/t\./g, 'm.');

          // 检测字段名是否以 is_ 开头且以 _flag 结尾
          const fieldNameStr = String(fieldName).trim();
          if (fieldNameStr.startsWith('is_') && fieldNameStr.endsWith('_flag')) {
            // 转换为 if 条件表达式
            sourceFieldCleaned = `if(${sourceFieldCleaned} in ('1','Y'),'Y','N')`;
          }

          // 检测字段重复
          const isDuplicate = (fieldNameCount[fieldNameStr] || 0) > 1;
          let fieldDescText = fieldDesc ? String(fieldDesc).trim() : fieldNameStr;
          if (isDuplicate) {
            fieldDescText += '（此字段重复）';
          }

          return {
            source: sourceFieldCleaned,
            name: fieldNameStr,
            desc: fieldDescText
          };
        }
        return null;
      })
      .filter((f): f is { source: string; name: string; desc: string } => f !== null);

    if (fields.length === 0) {
      setInsertSQL('');
      return;
    }

    // 先计算哪些字段需要码转名，以及对应的码转名字段描述
    const fieldsNeedingCodeToName = new Set<number>();
    const codeToNameDescMap = new Map<number, string>();
    fields.forEach((field, index) => {
      const rawFieldName = field.source.replace(/^m\./, '');
      const matchedConfigs = codeToNameConfigs.filter(
        (config: any) => config.mainTableField === rawFieldName
      );
      if (matchedConfigs.length > 0) {
        fieldsNeedingCodeToName.add(index);
        codeToNameDescMap.set(index, `${field.desc}名称`);
      }
    });

    // 计算对齐的最大长度（包含原始字段和码转名字段）
    const maxSourceLength = Math.max(...fields.map(f => f.source.length));
    const maxNameLength = Math.max(...fields.map((f, i) => {
      if (fieldsNeedingCodeToName.has(i)) {
        // 如果需要码转名，比较原始字段名和码转名字段的长度
        return Math.max(f.name.length, `${f.name}_name`.length);
      }
      return f.name.length;
    }));
    const maxDescLength = Math.max(...fields.map((f, i) => {
      if (fieldsNeedingCodeToName.has(i)) {
        // 如果需要码转名，比较原始字段描述和码转名字段描述的长度
        const codeToNameDesc = codeToNameDescMap.get(i) || '';
        return Math.max(f.desc.length, codeToNameDesc.length);
      }
      return f.desc.length;
    }));

    // 生成SELECT语句和码转名字段（统一处理，使码转名字段紧跟在对应字段后面）
    const finalSelectFields: string[] = [];
    const joins: string[] = [];
    
    // 自动生成表别名的计数器
    let aliasCounter = 1;
    const aliasMap = new Map<string, string>(); // 表英文名 -> 生成的别名

    // 检查每个字段是否需要码转名，并生成最终的SELECT字段列表
    fields.forEach((field, fieldIndex) => {
      // 添加原始字段
      const isFirst = finalSelectFields.length === 0;
      const comma = isFirst ? ' ' : ',';
      const sourcePadded = `${field.source}${' '.repeat(Math.max(0, maxSourceLength - field.source.length))}`;
      const namePadded = field.name + ' '.repeat(Math.max(0, maxNameLength - field.name.length));
      const descPadded = `'${field.desc}'${' '.repeat(Math.max(0, maxDescLength - field.desc.length))}`;
      
      finalSelectFields.push(
        `${comma}${sourcePadded}  AS  ${namePadded}   -- ${descPadded}`
      );
      
      // 提取原始字段名（去掉m.前缀）
      let rawFieldName = field.source.replace(/^m\./, '');
      
      // 在码转名维表配置中查找匹配
      const matchedConfigs = codeToNameConfigs.filter(
        (config: any) => config.mainTableField === rawFieldName
      );

      matchedConfigs.forEach(config => {
        // 如果没有配置表别名，自动生成
        let tableAlias = config.tableAlias;
        if (!tableAlias && config.tableEnName) {
          if (!aliasMap.has(config.tableEnName)) {
            tableAlias = 't' + aliasCounter;
            aliasMap.set(config.tableEnName, tableAlias);
            aliasCounter++;
          } else {
            tableAlias = aliasMap.get(config.tableEnName);
          }
        }
        
        // 生成码转名字段
        if (tableAlias && config.requireFields) {
          const requireFieldList = config.requireFields.replace(/，/g, ',').split(',').map((f: string) => f.trim()).filter((f: string) => f);
          
          const newFields: { name: string; desc: string }[] = [];
          
          requireFieldList.forEach((reqField: string) => {
            const codeToNameSource = `${tableAlias}.${reqField}`;
            const codeToNameSourcePadded = `${codeToNameSource}${' '.repeat(Math.max(0, maxSourceLength - codeToNameSource.length))}`;
            const codeToNameNamePadded = `${field.name}_name${' '.repeat(Math.max(0, maxNameLength - `${field.name}_name`.length))}`;
            const codeToNameDesc = `${field.desc}名称`;
            const codeToNameDescPadded = `'${codeToNameDesc}'${' '.repeat(Math.max(0, maxDescLength - codeToNameDesc.length))}`;
            
            // 生成INSERT语句中的码转名字段，紧跟在对应字段后面
            finalSelectFields.push(
              `,${codeToNameSourcePadded}  AS  ${codeToNameNamePadded}   -- ${codeToNameDescPadded}`
            );
            
            // 记录新增字段信息（用于DWD建表SQL）
            newFields.push({
              name: `${field.name}_name`,
              desc: codeToNameDesc
            });
          });
          
          // 如果有新增字段，记录到map中
          if (newFields.length > 0) {
            // 同步更新 ref（用于立即调用 generateDWDSQL）
            const existingRefFields = codeToNameFieldsRef.current.get(fieldIndex) || [];
            codeToNameFieldsRef.current.set(fieldIndex, [...existingRefFields, ...newFields]);
            
            // 更新 state（用于渲染和其他依赖）
            setCodeToNameFieldsMap(prev => {
              const newMap = new Map(prev);
              const existingFields = newMap.get(fieldIndex) || [];
              newMap.set(fieldIndex, [...existingFields, ...newFields]);
              return newMap;
            });
          }
        }

        // 生成LEFT JOIN（如果还没添加过这个表的JOIN）
        if (config.tableEnName && tableAlias && config.dimTableField && !joins.find(j => j.includes(tableAlias + ' --'))) {
          let joinClause = 'LEFT JOIN\n\t' + config.tableEnName + ' ' + tableAlias + '   --' + (config.tableChineseName || '');
          joinClause += '\n\tON ' + tableAlias + '.pt = \'${bdp.system.bizdate}\'';
          joinClause += '\n\tAND ' + tableAlias + '.' + config.dimTableField + ' = m.' + config.mainTableField;
          
          // 添加额外关联条件
          if (config.extraConditions) {
            const conditions = config.extraConditions.replace(/，/g, ',').split(',').map((c: string) => c.trim()).filter((c: string) => c);
            conditions.forEach((condition: string) => {
              joinClause += `\n\tAND ${condition}`;
            });
          }
          
          joins.push(joinClause);
        }
      });
    });

    // 添加 etl_time 字段
    const etlSourcePadded = `current_timestamp()${' '.repeat(Math.max(0, maxSourceLength - 'current_timestamp()'.length))}`;
    const etlNamePadded = `etl_time${' '.repeat(Math.max(0, maxNameLength - 'etl_time'.length))}`;
    const etlDescPadded = `'数据生成时间'${' '.repeat(Math.max(0, maxDescLength - '数据生成时间'.length))}`;
    const etlField = `,${etlSourcePadded}  AS  ${etlNamePadded}   -- ${etlDescPadded}`;

    const sql = 'INSERT OVERWRITE TABLE\t' + targetTableName + " PARTITION (pt ='${bdp.system.bizdate}')\n" +
'SELECT\n' +
finalSelectFields.join('\n') + '\n' +
etlField + '\n' +
'FROM\n' +
'  ' + sourceTableName + ' m\n' +
(joins.length > 0 ? joins.join('\n') : '') +
'\nWHERE\n' +
"  m.pt ='${bdp.system.bizdate}'";

    setInsertSQL(sql);
  };

  // 复制SQL到剪贴板
  const copySQL = async (sql: string, setCopied: (copied: boolean) => void) => {
    if (!sql) {
      warning('没有内容可复制');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      success('SQL 已复制到剪贴板', { duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败', err);
      toastError('复制失败，请手动复制');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* 标题区域 */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Database className="w-10 h-10 text-emerald-600" />
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
              Excel 转 DWD/ODS 建表工具
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-lg">
            上传 Excel 文件，手动生成 DWD、ODS 和 INSERT SQL 语句
          </p>
        </div>

        {/* 上传区域 */}
        {!data && (
          <Card className="max-w-2xl mx-auto shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                上传文件
              </CardTitle>
              <CardDescription>
                支持 .xlsx、.xls 和 .csv 格式
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="excel-file">选择文件</Label>
                <Input
                  ref={fileInputRef}
                  id="excel-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  disabled={loading}
                  className="cursor-pointer"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center gap-2 p-4 text-slate-600 dark:text-slate-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                  <p>正在解析文件...</p>
                </div>
              )}

              <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1">
                <p>• 支持最大 10MB 的文件</p>
                <p>• 点击对应的生成按钮生成 ODS、DWD、INSERT 语句</p>
                <p>• 数据将在本地浏览器中处理，不会上传到服务器</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 数据展示和SQL生成区域 */}
        {data && (
          <div className="space-y-6">
            {/* 数据预览卡片 */}
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                      {data.fileName}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      工作表: {data.sheetName} | {data.rows.length} 行数据 | {data.headers.length} 列
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={exportToCSV}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      导出 CSV
                    </Button>
                    <Button
                      onClick={handleReset}
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      清空数据
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-scroll border rounded-lg">
                  <Table className="min-w-max">
                    <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                      <TableRow>
                        <TableHead className="w-12 text-center font-bold">#</TableHead>
                        {data.headers.map((header, index) => (
                          <TableHead 
                            key={index} 
                            className={`font-bold whitespace-nowrap ${
                              header.includes('来源表')
                              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                              : header.includes('来源表描述')
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                              : header.includes('来源字段')
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                              : header.includes('来源字段描述')
                              ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400'
                              : header.includes('表英文名')
                              ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                              : header.includes('表中文名')
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400'
                              : header.includes('字段名')
                              ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'
                              : header.includes('字段描述')
                              ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-400'
                              : header.includes('字段类型')
                              ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'
                              : ''
                            }`}
                          >
                            {header || `列 ${index + 1}`}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row, rowIndex) => (
                        <TableRow key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <TableCell className="text-center font-medium text-slate-500">
                            {rowIndex + 1}
                          </TableCell>
                          {data.headers.map((_, colIndex) => (
                            <TableCell 
                              key={colIndex} 
                              className="whitespace-nowrap text-sm"
                            >
                              {row[colIndex] !== undefined && row[colIndex] !== null
                                ? String(row[colIndex])
                                : '-'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* ODS、DWD 和 INSERT 生成器 */}
            <div className="grid grid-cols-1 gap-6">
              {/* ODS 建表生成器 */}
              <Card className="shadow-lg border-2 border-emerald-200 dark:border-emerald-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-emerald-700 dark:text-emerald-400">
                    <Code2 className="w-5 h-5" />
                    ODS 建表生成器
                  </CardTitle>
                  <CardDescription>
                    从"来源表"、"来源表描述"、"来源字段"列生成 ODS 建表语句
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ods-table-name">识别到的表名（来源表列）</Label>
                    <Input
                      id="ods-table-name"
                      placeholder="自动识别的表名"
                      value={odsTableName}
                      onChange={(e) => setOdsTableName(e.target.value)}
                      className="font-mono"
                    />
                    {odsTableName && (
                      <div className="text-sm text-emerald-600 dark:text-emerald-400 mt-2">
                        生成的表名：<span className="font-mono font-bold bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                          {generateODSTableName(odsTableName)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        console.log('=== 生成 ODS ===');
                        generateODSSQL();
                      }}
                      variant="default"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      生成 ODS
                    </Button>
                  </div>

                  {odsSQL && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>ODS SQL 语句</Label>
                        <Button
                          onClick={() => copySQL(odsSQL, setCopiedODS)}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          {copiedODS ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              复制 SQL
                            </>
                          )}
                        </Button>
                      </div>
                      <Textarea
                        ref={odsSqlRef}
                        value={odsSQL}
                        readOnly
                        className="font-mono text-sm bg-slate-900 text-emerald-400 h-[300px] resize-x"
                      />
                    </div>
                  )}
                  {!odsSQL && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      点击上方 <span className="font-bold text-emerald-600">"生成 ODS"</span> 按钮生成 ODS 建表语句<br />
                      • 从"来源表"、"来源表描述"、"来源字段"列生成<br />
                      • 自动添加分区字段和数据入库时间字段
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* DWD 建表生成器 */}
              <Card className="shadow-lg border-2 border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-blue-700 dark:text-blue-400">
                    <Code2 className="w-5 h-5" />
                    DWD 建表生成器
                  </CardTitle>
                  <CardDescription>
                    从"表英文名"、"表中文名"、"字段名"、"字段描述"、"字段类型"列生成 DWD 建表语句
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="dwd-table-name">识别到的表名（表英名列）</Label>
                    <Input
                      id="dwd-table-name"
                      placeholder="自动识别的表名"
                      value={dwdTableName}
                      onChange={(e) => setDwdTableName(e.target.value)}
                      className="font-mono"
                    />
                    {dwdTableName && (
                      <div className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                        生成的表名：<span className="font-mono font-bold bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                          {generateDWDTableName(dwdTableName)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        // 点击生成按钮时，重新加载规则管理器的规则
                        console.log('=== 生成 DWD：重新检测规则管理器 ===');
                        const savedRules = localStorage.getItem('ddl_generator_global_rules');
                        console.log('📥 localStorage 中的规则:', savedRules);
                        if (savedRules) {
                          try {
                            const parsed = JSON.parse(savedRules);
                            console.log('✅ 从 localStorage 重新加载规则，数量:', parsed.length);
                            console.log('✅ 规则详情:', JSON.stringify(parsed, null, 2));
                            setGlobalRules(parsed);
                            
                            // 直接生成 DWD
                            // 注意：由于 inferFieldType 内部会从 localStorage 读取最新规则，
                            // 所以即使 globalRules state 未及时更新，也能使用最新规则
                            console.log('🔄 开始生成 DWD');
                            generateDWDSQL(codeToNameFieldsRef.current);
                          } catch (e) {
                            console.error('❌ 重新加载规则失败:', e);
                            // 即使加载失败，也尝试生成 DWD
                            generateDWDSQL(codeToNameFieldsRef.current);
                          }
                        } else {
                          console.log('localStorage 中没有规则，直接生成 DWD');
                          generateDWDSQL(codeToNameFieldsRef.current);
                        }
                      }}
                      variant="default"
                      className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      生成 DWD（重新检测规则）
                    </Button>
                    {codeToNameFieldsRef.current.size > 0 && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 text-center">
                        检测到 {Array.from(codeToNameFieldsRef.current.values()).flat().length} 个码转名字段
                      </p>
                    )}
                  </div>

                  {dwdSQL && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>DWD SQL 语句</Label>
                        <Button
                          onClick={() => copySQL(dwdSQL, setCopiedDWD)}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          {copiedDWD ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-blue-600" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              复制 SQL
                            </>
                          )}
                        </Button>
                      </div>
                      <Textarea
                        ref={dwdSqlRef}
                        value={dwdSQL}
                        readOnly
                        className="font-mono text-sm bg-slate-900 text-blue-400 h-[300px] resize-x"
                      />
                    </div>
                  )}
                  {!dwdSQL && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      点击上方 <span className="font-bold text-blue-600">"生成 DWD"</span> 按钮生成 DWD 建表语句<br />
                      • 支持使用规则管理器配置的字段类型推断规则<br />
                      • 支持码转名维表字段配置
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 插入语句生成器 */}
              <Card className="shadow-lg border-2 border-purple-200 dark:border-purple-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-purple-700 dark:text-purple-400">
                    <Code2 className="w-5 h-5" />
                    插入语句生成器
                  </CardTitle>
                  <CardDescription>
                    从"表英文名"、"来源表"、"来源字段"、"字段名"、"字段描述"列生成插入语句，来源表名使用ODS生成器转换
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        console.log('=== 生成 INSERT ===');
                        generateInsertSQL();
                      }}
                      variant="default"
                      className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      生成 INSERT
                    </Button>
                  </div>

                  {insertSQL && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>INSERT 语句</Label>
                        <Button
                          onClick={() => copySQL(insertSQL, setCopiedInsert)}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          {copiedInsert ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-purple-600" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              复制 SQL
                            </>
                          )}
                        </Button>
                      </div>
                      <Textarea
                        ref={insertSqlRef}
                        value={insertSQL}
                        readOnly
                        className="font-mono text-sm bg-slate-900 text-purple-400 h-[300px] resize-x"
                      />
                      {codeToNameFieldsRef.current.size > 0 && (
                        <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                          <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                          <p className="text-sm text-orange-700 dark:text-orange-300">
                            INSERT 语句包含 <span className="font-bold">{Array.from(codeToNameFieldsRef.current.values()).flat().length}</span> 个码转名字段，
                            请点击 DWD 卡片的 <span className="font-bold">"生成 DWD"</span> 按钮确保 DWD 表结构字段一致
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {!insertSQL && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      点击上方 <span className="font-bold text-purple-600">"生成 INSERT"</span> 按钮生成插入语句<br />
                      • 从"表英文名"、"来源表"、"来源字段"、"字段名"、"字段描述"列生成<br />
                      • 来源表名自动转换为 ODS 表名<br />
                      • 支持码转名维表配置
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* 页脚 */}
        <div className="mt-12 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>数据仅在本地浏览器中处理，确保您的信息安全</p>
        </div>
      </div>
    </div>
  );
}
