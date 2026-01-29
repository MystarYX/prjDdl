import { NextRequest, NextResponse } from 'next/server';

interface FieldInfo {
  name: string;
  alias?: string;
  comment: string;
}

interface UnifiedRule {
  id: string;
  keywords: string[];
  matchType: 'contains' | 'equals' | 'regex';
  targetField: 'name' | 'comment';
  priority: number;
  typeByDatabase: Record<string, {
    dataType: string;
    precision?: number;
    scale?: number;
    length?: number;
  }>;
}

type DatabaseType = 'spark' | 'mysql' | 'postgresql' | 'starrocks' | 'clickhouse' | 'hive' | 'doris';

const DATABASE_CONFIGS: Record<DatabaseType, {
  prefix: string;
  comment: 'INLINE' | 'SEPARATE';
  addPk?: boolean;
  addEngine?: boolean;
}> = {
  spark: { prefix: 'CREATE TABLE IF NOT EXISTS', comment: 'INLINE' },
  mysql: { prefix: 'CREATE TABLE IF NOT EXISTS', comment: 'INLINE', addPk: true, addEngine: true },
  postgresql: { prefix: 'CREATE TABLE', comment: 'SEPARATE' },
  starrocks: { prefix: 'CREATE TABLE IF NOT EXISTS', comment: 'INLINE' },
  clickhouse: { prefix: 'CREATE TABLE IF NOT EXISTS', comment: 'INLINE' },
  hive: { prefix: 'CREATE TABLE IF NOT EXISTS', comment: 'INLINE' },
  doris: { prefix: 'CREATE TABLE IF NOT EXISTS', comment: 'INLINE' },
};

function parseSQLFields(sql: string): FieldInfo[] {
  const fields: FieldInfo[] = [];
  sql = sql.trim();

  if (sql.toUpperCase().includes('SELECT')) {
    const result = tryParseSelectFrom(sql);
    if (result.length > 0) return result;
  }

  if (sql.toUpperCase().includes('SELECT')) {
    const result = tryParseSelectFields(sql);
    if (result.length > 0) return result;
  }

  const result = tryParseFieldList(sql);
  if (result.length > 0) return result;

  throw new Error('无法从SQL中解析出字段');
}

function tryParseSelectFrom(sql: string): FieldInfo[] {
  const selectMatch = sql.match(/\bSELECT\b/i);
  if (!selectMatch?.index) return [];

  const selectStart = selectMatch.index + selectMatch[0].length;
  let parenCount = 0;
  let fromPos = -1;

  for (let i = selectStart; i < sql.length; i++) {
    const char = sql[i];
    if (char === '(') parenCount++;
    else if (char === ')') parenCount--;
    else if (parenCount === 0 && sql.substr(i, 4).toUpperCase() === 'FROM') {
      const nextChar = sql[i + 4];
      if (!nextChar || /\s/.test(nextChar)) {
        const prevChar = i === 0 ? '' : sql[i - 1];
        if (i === 0 || /\s/.test(prevChar)) {
          fromPos = i;
          break;
        }
      }
    }
  }

  if (fromPos === -1) return [];

  const selectClause = sql.substring(selectStart, fromPos).trim();
  return parseSelectClause(selectClause);
}

function tryParseSelectFields(sql: string): FieldInfo[] {
  const selectMatch = sql.match(/\bSELECT\b/i);
  if (!selectMatch?.index) return [];

  const selectStart = selectMatch.index + selectMatch[0].length;
  let selectClause = sql.substring(selectStart).trim();

  const stopKeywords = ['WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'UNION'];
  for (const keyword of stopKeywords) {
    const keywordMatch = selectClause.match(new RegExp(`\\b${keyword}\\b`, 'i'));
    if (keywordMatch?.index !== undefined) {
      selectClause = selectClause.substring(0, keywordMatch.index).trim();
      break;
    }
  }

  return parseSelectClause(selectClause);
}

function tryParseFieldList(sql: string): FieldInfo[] {
  const cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const fieldExpressions: string[] = [];
  let current = '';
  let parenCount = 0;

  for (const char of cleanSql) {
    if (char === '(') { parenCount++; current += char; }
    else if (char === ')') { parenCount--; current += char; }
    else if (char === ',' && parenCount === 0) {
      fieldExpressions.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) fieldExpressions.push(current.trim());

  return fieldExpressions
    .map(expr => parseFieldExpression(expr))
    .filter((f): f is FieldInfo => f !== null);
}

function parseSelectClause(selectClause: string): FieldInfo[] {
  const commentMap: Record<string, string> = {};
  const lines = selectClause.split('\n');

  for (const line of lines) {
    const match = line.match(/--\s*(.+)$/);
    if (match) {
      const comment = match[1].trim();
      const fieldPart = line.substring(0, match.index).trim();
      if (fieldPart) commentMap[fieldPart.replace(/^,/, '').trim()] = comment;
    }
  }

  const cleanClause = selectClause.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const fieldExpressions = splitFields(cleanClause);

  return fieldExpressions
    .map(expr => parseFieldExpression(expr, commentMap))
    .filter((f): f is FieldInfo => f !== null);
}

function splitFields(selectClause: string): string[] {
  const fieldExpressions: string[] = [];
  let current = '';
  let parenCount = 0;

  for (const char of selectClause) {
    if (char === '(') { parenCount++; current += char; }
    else if (char === ')') { parenCount--; current += char; }
    else if (char === ',' && parenCount === 0) {
      fieldExpressions.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) fieldExpressions.push(current.trim());
  return fieldExpressions;
}

function parseFieldExpression(expr: string, commentMap?: Record<string, string>): FieldInfo | null {
  expr = expr.trim();
  if (!commentMap) commentMap = {};

  if (expr.toUpperCase().includes('SELECT') || expr.toUpperCase().includes(' FROM ')) return null;
  expr = expr.replace(/\bDISTINCT\s+/gi, '');

  const aliasMatch = expr.match(/\s+AS\s+([^\s,]+)$/i);
  if (aliasMatch) {
    const mainExpr = expr.substring(0, aliasMatch.index).trim();
    const alias = aliasMatch[1].trim().replace(/['"`]/g, '');
    return { name: mainExpr, alias, comment: commentMap[mainExpr] || alias };
  }

  const parts = expr.split(/\s+/);
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].trim().replace(/['"`]/g, '');
    const containsOperator = ['(', '+', '-', '*', '/', '='].some(op => parts[parts.length - 2].includes(op));
    if (!containsOperator) {
      const name = parts.slice(0, -1).join(' ');
      return { name, alias: lastPart, comment: commentMap[name] || lastPart };
    }
  }

  return { name: expr, alias: undefined, comment: commentMap[expr] || expr };
}

interface TypeInfo {
  type: string;
  precision?: number;
  scale?: number;
  length?: number;
}

function inferFieldType(fieldName: string, fieldComment: string, unifiedRules: UnifiedRule[], databaseType: DatabaseType): TypeInfo {
  const name = fieldName.toLowerCase();
  const comment = fieldComment.toLowerCase();

  if (unifiedRules && unifiedRules.length > 0) {
    const sortedRules = [...unifiedRules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      const targetText = rule.targetField === 'name' ? name : comment;
      const dbTypeConfig = rule.typeByDatabase[databaseType];

      if (!dbTypeConfig) continue;

      for (const keyword of rule.keywords) {
        const keywordLower = keyword.toLowerCase();

        let matched = false;
        if (rule.matchType === 'equals' && targetText === keywordLower) matched = true;
        else if (rule.matchType === 'contains' && targetText.includes(keywordLower)) matched = true;
        else if (rule.matchType === 'regex') {
          try {
            matched = new RegExp(keyword, 'i').test(targetText);
          } catch { }
        }

        if (matched) {
          return {
            type: dbTypeConfig.dataType,
            precision: dbTypeConfig.precision,
            scale: dbTypeConfig.scale,
            length: dbTypeConfig.length
          };
        }
      }
    }
  }

  // 默认规则
  if (['fcytp', 'scytp', 'cytp', 'currency_type'].includes(name) || name.includes('币种代码')) {
    return { type: databaseType === 'clickhouse' ? 'String' : 'STRING' };
  }
  if (name.includes('mode') || name.includes('code') || name.includes('icode')) {
    return { type: databaseType === 'clickhouse' ? 'String' : 'STRING' };
  }
  if ((name.includes('date') || name.includes('日期')) && !name.includes('day') && !name.includes('days')) {
    return { type: databaseType === 'clickhouse' ? 'Date' : 'DATE' };
  }
  if (name.includes('time') || name.includes('timestamp') || name.includes('时间')) {
    return { type: databaseType === 'clickhouse' ? 'DateTime' : (['mysql', 'starrocks', 'doris'].includes(databaseType) ? 'DATETIME' : 'TIMESTAMP') };
  }
  if (['org', 'trcl', 'cust', 'stff', 'user', 'dept'].some(k => name.includes(k))) {
    return { type: databaseType === 'clickhouse' ? 'String' : 'STRING' };
  }
  if (['name', 'dscr', 'rmrk'].some(k => name.includes(k)) || name.includes('描述') || name.includes('备注')) {
    return { type: databaseType === 'clickhouse' ? 'String' : 'STRING' };
  }
  if (name.includes('flag') || name.startsWith('is_') || name.includes('标记') || name.includes('是否')) {
    return { type: databaseType === 'clickhouse' ? 'String' : 'STRING' };
  }
  if (name.includes('days') || (name.includes('day') && name !== 'weekday')) {
    return { type: databaseType === 'clickhouse' ? 'Decimal' : 'DECIMAL', precision: 24, scale: 6 };
  }
  if (['amt', 'amount', 'price', '金额', '价格'].some(k => name.includes(k))) {
    return { type: databaseType === 'clickhouse' ? 'Decimal' : 'DECIMAL', precision: 24, scale: 6 };
  }
  if (['qty', 'quantity', 'cnt', 'count', '数量'].some(k => name.includes(k))) {
    return { type: databaseType === 'clickhouse' ? 'Decimal' : 'DECIMAL', precision: 24, scale: 6 };
  }

  return { type: databaseType === 'clickhouse' ? 'String' : (['spark', 'hive'].includes(databaseType) ? 'STRING' : 'VARCHAR(255)') };
}

function mapDataType(typeInfo: TypeInfo, databaseType: DatabaseType): string {
  const { type, precision, scale, length } = typeInfo;
  const upperType = type.toUpperCase();

  if (databaseType === 'clickhouse') {
    if (upperType === 'STRING') return 'String';
    if (upperType === 'DATE') return 'Date';
    if (upperType === 'TIMESTAMP') return 'DateTime';
    if (upperType === 'DATETIME') return 'DateTime';
    if (upperType.startsWith('DECIMAL')) {
      if (precision && scale) return `Decimal(${precision}, ${scale})`;
      return 'Decimal';
    }
    if (upperType.startsWith('FLOAT')) return precision ? `Float${precision}` : 'Float64';
    if (upperType.startsWith('DOUBLE')) return 'Float64';
    if (upperType === 'VARCHAR' || upperType === 'CHAR') return 'String';
  } else if (databaseType === 'postgresql') {
    if (upperType === 'STRING') return 'TEXT';
    if (upperType === 'TIMESTAMP') return 'TIMESTAMP';
    if (upperType === 'DATETIME') return 'TIMESTAMP';
    if (upperType.startsWith('DECIMAL')) {
      return precision && scale ? `DECIMAL(${precision}, ${scale})` : 'DECIMAL';
    }
    if (upperType === 'VARCHAR' || upperType === 'CHAR') {
      return length ? `${upperType}(${length})` : 'VARCHAR(255)';
    }
    if (upperType.startsWith('FLOAT')) return 'REAL';
    if (upperType.startsWith('DOUBLE')) return 'DOUBLE PRECISION';
  } else {
    if (upperType === 'STRING') {
      return ['spark', 'hive'].includes(databaseType) ? 'STRING' : 'VARCHAR(255)';
    }
    if (upperType.startsWith('DECIMAL')) {
      return precision && scale ? `DECIMAL(${precision}, ${scale})` : 'DECIMAL(24, 6)';
    }
    if (upperType === 'TIMESTAMP' || upperType === 'DATETIME') {
      return ['mysql', 'starrocks', 'doris'].includes(databaseType) ? 'DATETIME' : 'TIMESTAMP';
    }
    if (upperType === 'VARCHAR' || upperType === 'CHAR') {
      return length ? `${upperType}(${length})` : 'VARCHAR(255)';
    }
    if (upperType.startsWith('FLOAT')) {
      return precision ? `FLOAT(${precision})` : 'FLOAT';
    }
    if (upperType.startsWith('DOUBLE')) {
      return precision ? `DOUBLE(${precision})` : 'DOUBLE';
    }
  }

  return upperType;
}

function selectPrimaryKey(fields: FieldInfo[]): string | null {
  if (fields.length === 0) return null;
  for (const field of fields) {
    if (field.name.toLowerCase().endsWith('icode')) return field.name;
  }
  for (const field of fields) {
    if (field.name.toLowerCase().endsWith('id') && !field.name.toLowerCase().endsWith('icode')) return field.name;
  }
  return fields[0].name;
}

function generateDDL(fields: FieldInfo[], unifiedRules: UnifiedRule[], databaseType: DatabaseType): string {
  const config = DATABASE_CONFIGS[databaseType];

  const maxName = Math.max(...fields.map(f => f.name.length), 30);
  const maxType = 18;

  const adjustedFields = fields.map(field => {
    const typeInfo = inferFieldType(field.name, field.comment, unifiedRules, databaseType);
    const mappedType = mapDataType(typeInfo, databaseType);
    return { name: field.name, type: mappedType, comment: field.comment };
  });

  const ddlParts: string[] = [`${config.prefix} 表名 (`];

  adjustedFields.forEach((field, idx) => {
    const paddedName = field.name.padEnd(maxName);
    const paddedType = field.type.padEnd(maxType);
    const commentText = `COMMENT '${field.comment.replace(/'/g, "''")}'`;

    if (idx === 0) {
      ddlParts.push(`    ${paddedName} ${paddedType} ${commentText}`);
    } else {
      ddlParts.push(`   ,${paddedName} ${paddedType} ${commentText}`);
    }
  });

  if (config.addPk) {
    const pk = selectPrimaryKey(fields);
    if (pk) ddlParts.push(`   ,PRIMARY KEY (${pk})`);
  }

  ddlParts.push(')');

  if (config.comment === 'INLINE') {
    ddlParts.push("COMMENT '';");
  } else if (config.comment === 'SEPARATE') {
    ddlParts.push(';');
    ddlParts.push("COMMENT ON TABLE 表名 IS '';");
    adjustedFields.forEach(field => {
      ddlParts.push(`COMMENT ON COLUMN 表名.${field.name} IS '${field.comment.replace(/'/g, "''")}';`);
    });
  }

  if (config.addEngine) ddlParts.push('ENGINE=InnoDB');

  return ddlParts.join('\n');
}

function generateMultipleDDLs(fields: FieldInfo[], unifiedRules: UnifiedRule[], databaseTypes: DatabaseType[]) {
  const ddls = databaseTypes
    .filter(dbType => dbType in DATABASE_CONFIGS)
    .map(dbType => ({
      databaseType: dbType,
      label: dbType.charAt(0).toUpperCase() + dbType.slice(1),
      ddl: generateDDL(fields, unifiedRules, dbType)
    }));

  if (ddls.length === 1) return { ddl: ddls[0].ddl };
  return { ddls };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sql, unifiedRules, databaseTypes } = body;

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: '请提供有效的SQL查询语句' }, { status: 400 });
    }

    const fields = parseSQLFields(sql.trim());
    if (fields.length === 0) {
      return NextResponse.json({ error: '未能从SQL中解析出字段' }, { status: 400 });
    }

    const dbTypes: DatabaseType[] = databaseTypes || ['spark'];
    const rules: UnifiedRule[] = unifiedRules || [];

    const result = generateMultipleDDLs(fields, rules, dbTypes);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}
