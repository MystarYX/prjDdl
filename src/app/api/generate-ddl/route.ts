import { NextRequest, NextResponse } from 'next/server';

interface FieldInfo {
  name: string;
  alias?: string;
  comment: string;
}

interface TypeRule {
  id: string;
  keywords: string[];
  dataType: string;
  priority: number;
}

// 数据库类型定义
type DatabaseType = 'spark' | 'mysql' | 'postgresql' | 'starrocks' | 'clickhouse' | 'hive' | 'doris';

// 数据库配置
const databaseConfigs: Record<DatabaseType, {
  createTablePrefix: string;
  createTableSuffix: string;
  commentSyntax: 'INLINE' | 'SEPARATE' | 'MATERIALIZED';
  supportsCreateIfNotExists: boolean;
  tableNamePrefix: string;
}> = {
  spark: {
    createTablePrefix: 'CREATE TABLE IF NOT EXISTS',
    createTableSuffix: ') COMMENT',
    commentSyntax: 'INLINE',
    supportsCreateIfNotExists: true,
    tableNamePrefix: '',
  },
  mysql: {
    createTablePrefix: 'CREATE TABLE IF NOT EXISTS',
    createTableSuffix: ') COMMENT',
    commentSyntax: 'INLINE',
    supportsCreateIfNotExists: true,
    tableNamePrefix: '',
  },
  postgresql: {
    createTablePrefix: 'CREATE TABLE',
    createTableSuffix: ')',
    commentSyntax: 'SEPARATE',
    supportsCreateIfNotExists: false,
    tableNamePrefix: '',
  },
  starrocks: {
    createTablePrefix: 'CREATE TABLE IF NOT EXISTS',
    createTableSuffix: ') COMMENT',
    commentSyntax: 'INLINE',
    supportsCreateIfNotExists: true,
    tableNamePrefix: '',
  },
  clickhouse: {
    createTablePrefix: 'CREATE TABLE IF NOT EXISTS',
    createTableSuffix: ') COMMENT',
    commentSyntax: 'INLINE',
    supportsCreateIfNotExists: true,
    tableNamePrefix: '',
  },
  hive: {
    createTablePrefix: 'CREATE TABLE IF NOT EXISTS',
    createTableSuffix: ') COMMENT',
    commentSyntax: 'INLINE',
    supportsCreateIfNotExists: true,
    tableNamePrefix: '',
  },
  doris: {
    createTablePrefix: 'CREATE TABLE IF NOT EXISTS',
    createTableSuffix: ') COMMENT',
    commentSyntax: 'INLINE',
    supportsCreateIfNotExists: true,
    tableNamePrefix: '',
  },
};

function parseSQLFields(sql: string): FieldInfo[] {
  const fields: FieldInfo[] = [];

  const trimmedSql = sql.trim();

  // 策略1: 尝试解析标准 SELECT ... FROM 语句
  if (trimmedSql.toUpperCase().includes('SELECT')) {
    const result = tryParseSelectFrom(trimmedSql);
    if (result.length > 0) {
      return result;
    }
  }

  // 策略2: 如果没有找到 FROM，但有 SELECT，尝试解析 SELECT 后的字段列表
  if (trimmedSql.toUpperCase().includes('SELECT')) {
    const result = tryParseSelectFields(trimmedSql);
    if (result.length > 0) {
      return result;
    }
  }

  // 策略3: 尝试按逗号分割的字段列表（无 SELECT 关键字）
  const result = tryParseFieldList(trimmedSql);
  if (result.length > 0) {
    return result;
  }

  throw new Error('无法解析SQL，请确保输入的是有效的SELECT查询或字段列表');
}

// 策略1: 解析标准 SELECT ... FROM 语句
function tryParseSelectFrom(sql: string): FieldInfo[] {
  // 提取 SELECT ... FROM 之间的内容（支持多行和复杂子查询）
  // 使用平衡括号计数来确保找到正确的FROM
  let parenCount = 0;
  let selectStart = -1;
  let fromPos = -1;

  // 找到SELECT关键字的位置（支持INSERT INTO...SELECT）
  const selectMatch = sql.match(/\bSELECT\b/i);
  if (!selectMatch || selectMatch.index === undefined) {
    return [];
  }
  selectStart = selectMatch.index + selectMatch[0].length;

  // 从SELECT之后开始查找FROM
  for (let i = selectStart; i < sql.length; i++) {
    const char = sql[i];

    if (char === '(') {
      parenCount++;
    } else if (char === ')') {
      parenCount--;
    } else if (parenCount === 0) {
      // 检查是否是FROM关键字（确保是独立的单词）
      if (sql.substr(i, 4).toUpperCase() === 'FROM') {
        // 检查FROM后面是空白符或结束符
        const nextChar = sql[i + 4];
        if (!nextChar || /\s/.test(nextChar)) {
          // 检查FROM前面是空白符或开始符
          const prevChar = i === 0 ? '' : sql[i - 1];
          if (i === 0 || /\s/.test(prevChar)) {
            fromPos = i;
            break;
          }
        }
      }
    }
  }

  if (fromPos === -1) {
    return [];
  }

  const selectClause = sql.substring(selectStart, fromPos).trim();
  return parseSelectClause(selectClause);
}

// 策略2: 解析 SELECT 后的字段列表（无 FROM）
function tryParseSelectFields(sql: string): FieldInfo[] {
  const selectMatch = sql.match(/\bSELECT\b/i);
  if (!selectMatch || selectMatch.index === undefined) {
    return [];
  }

  const selectStart = selectMatch.index + selectMatch[0].length;
  let selectClause = sql.substring(selectStart).trim();

  // 移除可能存在的其他关键字（如 WHERE, GROUP BY, ORDER BY, LIMIT 等）
  const stopKeywords = ['WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT'];
  for (const keyword of stopKeywords) {
    const keywordMatch = selectClause.match(new RegExp(`\\b${keyword}\\b`, 'i'));
    if (keywordMatch && keywordMatch.index !== undefined) {
      selectClause = selectClause.substring(0, keywordMatch.index).trim();
      break;
    }
  }

  return parseSelectClause(selectClause);
}

// 策略3: 解析逗号分隔的字段列表
function tryParseFieldList(sql: string): FieldInfo[] {
  // 移除注释
  const cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

  // 按逗号分割，但要考虑括号内的逗号
  const fieldExpressions: string[] = [];
  let current = '';
  let parenCount = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < cleanSql.length; i++) {
    const char = cleanSql[i];

    if (!inQuote && (char === '"' || char === "'" || char === '`')) {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (inQuote && char === quoteChar) {
      inQuote = false;
      current += char;
    } else if (char === '(' && !inQuote) {
      parenCount++;
      current += char;
    } else if (char === ')' && !inQuote) {
      parenCount--;
      current += char;
    } else if (char === ',' && parenCount === 0 && !inQuote) {
      fieldExpressions.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    fieldExpressions.push(current.trim());
  }

  // 解析每个字段
  const fields: FieldInfo[] = [];
  for (const expr of fieldExpressions) {
    const field = parseFieldExpression(expr, new Map());
    if (field) {
      fields.push(field);
    }
  }

  return fields;
}

// 解析 SELECT 子句
function parseSelectClause(selectClause: string): FieldInfo[] {
  const fields: FieldInfo[] = [];

  // 提取注释并建立映射（按行处理）
  const commentMap = new Map<string, string>();
  const lines = selectClause.split('\n');

  for (const line of lines) {
    const commentMatch = line.match(/--\s*(.+)$/);
    if (commentMatch) {
      const comment = commentMatch[1].trim();
      const fieldPart = line.substring(0, commentMatch.index).trim();
      if (fieldPart) {
        // 移除开头的逗号和多余的空白符，作为规范化后的key
        const normalizedKey = fieldPart.replace(/^,+/, '').replace(/\s+/g, ' ');
        commentMap.set(normalizedKey, comment);
      }
    }
  }

  // 移除注释用于解析字段
  const cleanSelectClause = selectClause.replace(/--\s*.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // 分割字段（考虑逗号，但忽略括号内的逗号）
  const fieldExpressions: string[] = [];
  let current = '';
  let inParentheses = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < cleanSelectClause.length; i++) {
    const char = cleanSelectClause[i];

    if (!inQuote && (char === '"' || char === "'" || char === '`')) {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (inQuote && char === quoteChar) {
      inQuote = false;
      current += char;
    } else if (char === '(' && !inQuote) {
      inParentheses++;
      current += char;
    } else if (char === ')' && !inQuote) {
      inParentheses--;
      current += char;
    } else if (char === ',' && inParentheses === 0 && !inQuote) {
      fieldExpressions.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    fieldExpressions.push(current.trim());
  }

  // 解析每个字段表达式
  for (const expr of fieldExpressions) {
    const field = parseFieldExpression(expr, commentMap);
    if (field) {
      fields.push(field);
    }
  }

  return fields;
}

function parseFieldExpression(expr: string, commentMap: Map<string, string>): FieldInfo | null {
  // 跳过子查询
  if (expr.includes('SELECT ') || expr.includes(' FROM ')) {
    return null;
  }

  // 查找 AS 关键字
  let name: string;
  let alias: string | undefined;
  let comment: string = '';

  // 移除DISTINCT
  expr = expr.replace(/\bDISTINCT\s+/gi, '');

  // 检查是否有 AS 别名
  const asMatch = expr.match(/\s+AS\s+([^\s,]+)$/i);
  if (asMatch) {
    const mainExpr = expr.substring(0, asMatch.index).trim();
    alias = asMatch[1].replace(/['"]/g, '');
    name = mainExpr;
  } else {
    // 检查最后一个空格后的部分是否是别名（简单判断）
    const parts = expr.trim().split(/\s+/);
    if (parts.length > 1) {
      // 如果最后部分不包含特殊字符（如函数、运算符），则认为是别名
      const lastPart = parts[parts.length - 1].replace(/['"]/g, '');
      const secondLastPart = parts[parts.length - 2];
      if (
        !secondLastPart.includes('(') &&
        !secondLastPart.includes('+') &&
        !secondLastPart.includes('-') &&
        !secondLastPart.includes('*') &&
        !secondLastPart.includes('/') &&
        !secondLastPart.includes('=')
      ) {
        name = parts.slice(0, -1).join(' ');
        alias = lastPart;
      } else {
        name = expr;
      }
    } else {
      name = expr;
    }
  }

  // 如果有别名，使用别名作为字段名
  const fieldName = alias || name;

  // 规范化字段表达式用于查找注释
  const normalizedExpr = expr.replace(/\s+/g, ' ');

  // 从commentMap中查找注释
  comment = commentMap.get(normalizedExpr) || '';

  // 如果没有找到注释，使用字段名作为默认注释
  if (!comment) {
    comment = fieldName;
  }

  return {
    name: fieldName,
    alias,
    comment,
  };
}

function inferFieldType(fieldName: string, customRules?: TypeRule[]): string {
  const name = fieldName.toLowerCase();

  // 如果有自定义规则，按优先级使用自定义规则
  if (customRules && customRules.length > 0) {
    // 按优先级排序
    const sortedRules = [...customRules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      for (const keyword of rule.keywords) {
        // 支持精确匹配和包含匹配
        if (
          name === keyword.toLowerCase() ||
          name.includes(keyword.toLowerCase())
        ) {
          return rule.dataType;
        }
      }
    }
  }

  // 默认规则
  // 币种代码字段 - 必须在最前面判断
  if (
    name === 'fcytp' ||
    name === 'scytp' ||
    name === 'cytp' ||
    name === 'currency_type' ||
    name.includes('币种代码')
  ) {
    return 'STRING';
  }

  // 模式、代码字段 - 优先级高于date
  if (
    name.includes('mode') ||
    name.includes('code') ||
    name.includes('icode')
  ) {
    return 'STRING';
  }

  // 日期字段（优先级高）- 排除day（天数）
  if (
    name.includes('date') ||
    name.includes('日期')
  ) {
    // 如果是days，则不是日期
    if (!name.includes('day') && !name.includes('days')) {
      return 'DATE';
    }
  }

  // 时间字段
  if (
    name.includes('time') ||
    name.includes('timestamp') ||
    name.includes('时间')
  ) {
    return 'TIMESTAMP';
  }

  // 组织、客户、人员等维度字段（避免误判为DECIMAL）
  if (
    name.includes('org') ||
    name.includes('trcl') ||
    name.includes('cust') ||
    name.includes('stff') ||
    name.includes('user') ||
    name.includes('dept')
  ) {
    return 'STRING';
  }

  // 名称字段（xxx_name, xxx_dscr, xxx_rmrk）
  if (
    name.includes('_name') ||
    name.includes('_dscr') ||
    name.includes('_rmrk') ||
    name.includes('name') ||
    name.includes('描述') ||
    name.includes('备注')
  ) {
    return 'STRING';
  }

  // 标记字段（flag、标识）
  if (
    name.includes('flag') ||
    name.includes('is_') ||
    name.includes('标记')
  ) {
    return 'STRING';
  }

  // 天数字段（days）
  if (
    name.includes('days') ||
    (name.includes('day') && name !== 'weekday')
  ) {
    return 'DECIMAL(24, 6)';
  }

  // 金额字段（包含amount、金额、price、金额相关的字段）
  if (
    name.includes('amt') ||
    name.includes('amount') ||
    name.includes('price') ||
    name.includes('金额') ||
    name.includes('ocy') || // 本位币
    name.includes('rcy') ||  // 折算
    name.includes('scy') ||  // 本位币金额
    name.includes('elmn') || // 剔除
    name.includes('crdt') || // 信用
    name.includes('totl') || // 总计
    name.includes('ocpt')    // 占用
  ) {
    return 'DECIMAL(24, 6)';
  }

  // 数量字段
  if (
    name.includes('qty') ||
    name.includes('quantity') ||
    name.includes('数量') ||
    name.includes('cnt') ||
    name.includes('count')
  ) {
    return 'DECIMAL(24, 6)';
  }

  // 默认使用STRING
  return 'STRING';
}

// 选择主键字段
function selectPrimaryKey(fields: FieldInfo[]): string | null {
  if (fields.length === 0) {
    return null;
  }

  // 规则1: 优先选择第一个后缀为icode的字段
  const icodeField = fields.find(f => f.name.toLowerCase().endsWith('icode'));
  if (icodeField) {
    return icodeField.name;
  }

  // 规则2: 选择第一个后缀为id的字段（不是icode）
  const idField = fields.find(f => {
    const lowerName = f.name.toLowerCase();
    return lowerName.endsWith('id') && !lowerName.endsWith('icode');
  });
  if (idField) {
    return idField.name;
  }

  // 规则3: 如果都没有，选择第一个字段
  return fields[0].name;
}

function generateDDL(
  fields: FieldInfo[],
  customRules?: TypeRule[],
  databaseType: DatabaseType = 'spark'
): string {
  const config = databaseConfigs[databaseType];
  const maxNameLength = Math.max(...fields.map(f => f.name.length), 30);
  const maxTypeLength = 18;

  // 生成表名（根据数据库类型调整）
  let tableName = '表名';

  // 根据数据库类型调整数据类型
  const adjustedFields = fields.map(field => ({
    ...field,
    type: mapDataTypeForDatabase(inferFieldType(field.name, customRules), databaseType),
  }));

  let ddl = `${config.createTablePrefix} ${tableName} (\n`;

  adjustedFields.forEach((field, index) => {
    const paddedName = field.name.padEnd(maxNameLength);
    const paddedType = field.type.padEnd(maxTypeLength);

    const commentText = `COMMENT '${field.comment.replace(/'/g, "''")}'`;

    if (index === 0) {
      ddl += `    ${paddedName} ${paddedType}`;
      if (config.commentSyntax === 'INLINE') {
        ddl += ` ${commentText}`;
      }
    } else {
      ddl += `\n   ,${paddedName} ${paddedType}`;
      if (config.commentSyntax === 'INLINE') {
        ddl += ` ${commentText}`;
      }
    }
  });

  // 为MySQL添加主键
  if (databaseType === 'mysql') {
    const primaryKey = selectPrimaryKey(fields);
    if (primaryKey) {
      ddl += `\n   ,PRIMARY KEY (${primaryKey})`;
    }
  }

  ddl += '\n)';

  // 添加表注释和引擎
  if (config.commentSyntax === 'INLINE') {
    // MySQL特殊处理：添加ENGINE=InnoDB
    if (databaseType === 'mysql') {
      ddl += ' ENGINE=InnoDB';
    }
    ddl += ` COMMENT '';`;
  } else if (config.commentSyntax === 'SEPARATE') {
    ddl += ';';
    // PostgreSQL 风格的单独注释
    ddl += '\n\n';
    ddl += `COMMENT ON TABLE ${tableName} IS '';\n`;
    adjustedFields.forEach(field => {
      ddl += `COMMENT ON COLUMN ${tableName}.${field.name} IS '${field.comment.replace(/'/g, "''")}';\n`;
    });
  }

  return ddl;
}

// 将通用数据类型映射到特定数据库的类型
function mapDataTypeForDatabase(type: string, databaseType: DatabaseType): string {
  // 大多数数据库使用相同的类型定义，但有一些特殊情况
  if (databaseType === 'clickhouse') {
    // ClickHouse 特殊类型映射
    if (type === 'STRING') return 'String';
    if (type === 'DATE') return 'Date';
    if (type === 'TIMESTAMP') return 'DateTime';
    if (type.startsWith('DECIMAL')) {
      // DECIMAL(24,6) -> Decimal(24, 6)
      return type.replace('DECIMAL', 'Decimal');
    }
  }

  if (databaseType === 'postgresql') {
    // PostgreSQL 特殊类型映射
    if (type === 'STRING') return 'TEXT';
    if (type === 'TIMESTAMP') return 'TIMESTAMP';
  }

  // 其他数据库保持原样
  return type;
}

// 数据库类型列表（用于显示标签）
const databaseTypeLabels: Record<DatabaseType, string> = {
  spark: 'Spark SQL',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  starrocks: 'StarRocks',
  clickhouse: 'ClickHouse',
  hive: 'Hive',
  doris: 'Doris',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sql, rulesByDatabase, databaseTypes = ['spark'] } = body;

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的SQL查询语句' },
        { status: 400 }
      );
    }

    // 验证数据库类型
    const validDatabaseTypes = databaseTypes.filter(
      (dbType: string) => databaseConfigs[dbType as DatabaseType]
    );

    if (validDatabaseTypes.length === 0) {
      return NextResponse.json(
        { error: '请提供至少一个有效的数据库类型' },
        { status: 400 }
      );
    }

    const fields = parseSQLFields(sql);

    if (fields.length === 0) {
      return NextResponse.json(
        { error: '未能从SQL中解析出字段' },
        { status: 400 }
      );
    }

    // 为每个数据库类型生成DDL，使用对应的规则
    const ddls = validDatabaseTypes.map((dbType: string) => {
      const customRules = rulesByDatabase?.[dbType] || undefined;
      return {
        databaseType: dbType,
        label: databaseTypeLabels[dbType as DatabaseType],
        ddl: generateDDL(fields, customRules, dbType as DatabaseType),
      };
    });

    // 如果只有一个数据库类型，返回单个DDL格式（向后兼容）
    if (ddls.length === 1) {
      return NextResponse.json({ ddl: ddls[0].ddl });
    }

    // 多个数据库类型，返回数组格式
    return NextResponse.json({ ddls });
  } catch (error) {
    console.error('生成DDL错误:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '生成建表语句失败',
      },
      { status: 500 }
    );
  }
}
