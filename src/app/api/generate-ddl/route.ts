import { NextRequest, NextResponse } from 'next/server';

interface FieldInfo {
  name: string;
  alias?: string;
  comment: string;
}

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

// 移除CTE (WITH子句)
function removeCTE(sql: string): string {
  sql = sql.trim();

  // 检查是否以WITH开头
  if (!sql.toUpperCase().startsWith('WITH ')) {
    return sql;
  }

  let pos = 4; // 'WITH'的长度
  let endPos = 0;

  while (pos < sql.length) {
    // 跳过空格
    while (pos < sql.length && /\s/.test(sql[pos])) {
      pos++;
    }

    // 读取CTE名称
    let cteNameStart = pos;
    while (pos < sql.length && /\w/.test(sql[pos])) {
      pos++;
    }
    const cteName = sql.substring(cteNameStart, pos).trim();

    if (!cteName) {
      break; // 没有CTE名称了，结束
    }

    // 跳过空格
    while (pos < sql.length && /\s/.test(sql[pos])) {
      pos++;
    }

    // 检查是否有AS关键字
    if (pos + 2 >= sql.length ||
        sql.substring(pos, pos + 2).toUpperCase() !== 'AS') {
      break; // 不是AS了，应该是主SELECT
    }

    pos += 2; // 跳过AS

    // 跳过空格
    while (pos < sql.length && /\s/.test(sql[pos])) {
      pos++;
    }

    // 检查是否有左括号
    if (pos >= sql.length || sql[pos] !== '(') {
      break; // 不是CTE定义
    }

    // 匹配括号对
    let parenCount = 0;
    let foundEnd = false;

    for (let i = pos; i < sql.length; i++) {
      if (sql[i] === '(') {
        parenCount++;
      } else if (sql[i] === ')') {
        parenCount--;
        if (parenCount === 0) {
          endPos = i + 1;
          foundEnd = true;
          break;
        }
      }
    }

    if (!foundEnd) {
      break; // 没有找到匹配的右括号
    }

    // 更新pos到右括号后
    pos = endPos;

    // 跳过空格
    while (pos < sql.length && /\s/.test(sql[pos])) {
      pos++;
    }

    // 检查是否有逗号（还有更多CTE）
    if (pos < sql.length && sql[pos] === ',') {
      pos++; // 跳过逗号
      continue; // 继续处理下一个CTE
    } else {
      break; // 没有逗号了，所有CTE处理完成
    }
  }

  // 返回剩余的SQL（主SELECT）
  if (endPos > 0) {
    return sql.substring(endPos).trim();
  }

  return sql;
}

function parseSQLFields(sql: string): FieldInfo[] {
  const fields: FieldInfo[] = [];
  sql = sql.trim();

  // 移除CTE子句
  sql = removeCTE(sql);

  // 策略1: 解析SELECT ... FROM（要求FROM后面有表名）
  if (sql.toUpperCase().includes('SELECT')) {
    const result = tryParseSelectFrom(sql);
    if (result.length > 0) return result;
  }

  // 策略2: SELECT后无FROM（可能是纯字段列表或不完整的SELECT语句）
  if (sql.toUpperCase().includes('SELECT')) {
    const result = tryParseSelectFields(sql);
    if (result.length > 0) return result;
  }

  // 策略3: 纯字段列表（可能包含FROM关键字，如逗号分隔的列表）
  const result = tryParseFieldList(sql);
  if (result.length > 0) return result;

  throw new Error('无法从SQL中解析出字段');
}

function tryParseSelectFrom(sql: string): FieldInfo[] {
  // 使用简单的字符串查找，避免正则表达式问题
  const selectIndex = sql.toUpperCase().indexOf('SELECT');
  if (selectIndex === -1) return [];

  const selectStart = selectIndex + 6; // 'SELECT'的长度是6
  
  let parenCount = 0;
  let fromPos = -1;

  for (let i = selectStart; i < sql.length; i++) {
    const char = sql[i];
    if (char === '(') {
      parenCount++;
    } else if (char === ')') {
      parenCount--;
    } else if (parenCount === 0 && sql.substring(i, i + 4).toUpperCase() === 'FROM') {
      // 检查FROM前面是否有字符，确保是独立的FROM关键字
      const prevChar = i === 0 ? ' ' : sql[i - 1];
      
      // FROM前面必须是空格
      if (!/\s/.test(prevChar)) {
        continue;
      }
      
      // 检查FROM后面是否有字符
      if (i + 4 >= sql.length) {
        continue;
      }
      
      const nextChar = sql[i + 4];
      
      // FROM后面必须是空格或标点符号（不能是字母数字）
      if (!/\s/.test(nextChar) && ![',', '(', ')', ';'].includes(nextChar)) {
        continue;
      }
      
      // 检查FROM后面是否有表名（非空格字符）
      let hasTableName = false;
      for (let j = i + 4; j < sql.length; j++) {
        if (!/\s/.test(sql[j])) {
          hasTableName = true;
          break;
        }
      }
      
      if (hasTableName) {
        fromPos = i;
        break;
      }
    }
  }

  if (fromPos === -1) return [];

  const selectClause = sql.substring(selectStart, fromPos).trim();
  const result = parseSelectClause(selectClause);
  return result;
}

function tryParseSelectFields(sql: string): FieldInfo[] {
  // 使用简单的字符串查找，避免正则表达式问题
  const selectIndex = sql.toUpperCase().indexOf('SELECT');
  if (selectIndex === -1) return [];

  const selectStart = selectIndex + 6; // 'SELECT'的长度是6
  let selectClause = sql.substring(selectStart).trim();

  const stopKeywords = ['WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'UNION'];
  for (const keyword of stopKeywords) {
    const keywordIndex = selectClause.toUpperCase().indexOf(keyword);
    if (keywordIndex !== -1) {
      selectClause = selectClause.substring(0, keywordIndex).trim();
      break;
    }
  }

  return parseSelectClause(selectClause);
}

function extractCommentMap(lines: string[]): Record<string, string> {
  const commentMap: Record<string, string> = {};

  for (const line of lines) {
    const match = line.match(/--\s*(.+?)(,)?$/);
    if (match) {
      const comment = match[1].trim();
      const fieldPart = line.substring(0, match.index).trim();
      if (fieldPart) {
        let normalizedKey = fieldPart.replace(/^,/, '').trim();

        // 提取AS别名
        let alias = null;
        const asMatch = normalizedKey.match(/^(.+?)\s+AS\s+([^\s,]+)$/i);
        if (asMatch) {
          normalizedKey = asMatch[1].trim();
          alias = asMatch[2].trim().replace(/['"`]/g, '');
        } else {
          const parts = normalizedKey.split(/\s+/);
          if (parts.length > 1) {
            const lastPart = parts[parts.length - 1];
            const containsOperator = ['(', '+', '-', '*', '/', '='].some(op =>
              normalizedKey.substring(0, normalizedKey.lastIndexOf(lastPart)).includes(op)
            );
            if (!containsOperator && !lastPart.includes('(') && !lastPart.includes(')')) {
              normalizedKey = parts.slice(0, -1).join(' ');
              alias = lastPart.trim().replace(/['"`]/g, '');
            }
          }
        }

        normalizedKey = normalizedKey.replace(/\s+/g, ' ').trim();
        
        // 存储注释到多个key：表达式和别名
        commentMap[normalizedKey] = comment;
        if (alias) {
          commentMap[alias] = comment;
        }
      }
    }
  }

  return commentMap;
}

function tryParseFieldList(sql: string): FieldInfo[] {
  const cleanSQL = sql.replace(/--.*?(,)?$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '').trim();

  const commentMap = extractCommentMap(sql.split('\n'));
  const fieldExpressions = splitFields(cleanSQL);

  return fieldExpressions
    .map(expr => parseFieldExpression(expr, commentMap))
    .filter((f): f is FieldInfo => f !== null);
}

function parseSelectClause(selectClause: string): FieldInfo[] {
  const commentMap = extractCommentMap(selectClause.split('\n'));
  const cleanClause = selectClause.replace(/--.*?(,)?$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
  const fieldExpressions = splitFields(cleanClause);

  return fieldExpressions
    .map(expr => parseFieldExpression(expr, commentMap))
    .filter((f): f is FieldInfo => f !== null);
}

function splitFields(selectClause: string): string[] {
  const fieldExpressions: string[] = [];
  let current = '';
  let parenCount = 0;
  let caseCount = 0;
  let i = 0;

  while (i < selectClause.length) {
    const char = selectClause[i];

    // 检查是否是 CASE 关键字（必须在单词边界上）
    if (parenCount === 0 && caseCount === 0 &&
        char.toUpperCase() === 'C' &&
        selectClause.substring(i, i + 4).toUpperCase() === 'CASE') {
      // 检查前后是否为单词边界
      const prevChar = i === 0 ? ' ' : selectClause[i - 1];
      const nextChar = i + 4 >= selectClause.length ? ' ' : selectClause[i + 4];
      
      if (/\s/.test(prevChar) && /\s/.test(nextChar)) {
        caseCount++;
      }
      current += char;
    } 
    // 检查是否是 END 关键字
    else if (caseCount > 0 && char.toUpperCase() === 'E' &&
             selectClause.substring(i, i + 3).toUpperCase() === 'END') {
      const prevChar = i === 0 ? ' ' : selectClause[i - 1];
      const nextChar = i + 3 >= selectClause.length ? ' ' : selectClause[i + 3];
      
      if (/\s/.test(prevChar) && /\s/.test(nextChar)) {
        caseCount--;
      }
      current += char;
    }
    // 处理括号
    else if (char === '(') {
      parenCount++;
      current += char;
    } else if (char === ')') {
      parenCount--;
      current += char;
    }
    // 处理逗号（只有在括号和CASE都关闭时才分割）
    else if (char === ',' && parenCount === 0 && caseCount === 0) {
      fieldExpressions.push(current.trim());
      current = '';
    } else {
      current += char;
    }

    i++;
  }

  if (current.trim()) {
    fieldExpressions.push(current.trim());
  }

  return fieldExpressions;
}

// 清理表别名（如 t1.order_id → order_id）
function removeTableAlias(expr: string): string {
  // 匹配表别名前缀（如 t1. 或 alias.）
  // 支持多种格式：t1.field, `t1`.`field`, "t1"."field"
  return expr.replace(/^\s*[\w`"]+\.\s*[\w`"]+\s*/g, match => {
    // 去除表别名和点，只保留字段名
    return match.replace(/^[\w`"]+\./, '').trim();
  });
}

function parseFieldExpression(expr: string, commentMap?: Record<string, string>): FieldInfo | null {
  expr = expr.trim();

  if (!commentMap) commentMap = {};

  // 过滤掉包含子查询的字段
  if (expr.toUpperCase().includes('SELECT') ||
      (expr.toUpperCase().includes('FROM') && expr.toUpperCase().includes('('))) {
    return null;
  }

  expr = expr.replace(/\bDISTINCT\s+/gi, '');

  // 规范化表达式用于注释查找
  const normalizeExpr = (e: string) => e.replace(/\s+/g, ' ').trim();

  // 处理显式AS别名
  const aliasMatch = expr.match(/\s+AS\s+([^\s,]+)$/i);
  if (aliasMatch) {
    const mainExpr = expr.substring(0, aliasMatch.index).trim();
    const alias = aliasMatch[1].trim().replace(/['"`]/g, '');

    // 使用规范化后的表达式查找注释
    const normalizedMainExpr = normalizeExpr(mainExpr);
    let comment = commentMap[normalizedMainExpr] || commentMap[alias] || '';

    // 如果找不到注释，且表达式包含CASE关键字，尝试用最后一部分的简化表达式查找
    if (!comment && mainExpr.toUpperCase().includes('CASE')) {
      // 注释可能在最后一行，只提取了最后一部分（如 "end"）
      // 尝试从mainExpr中提取最后一行或最后一个标识符
      const lastWordMatch = mainExpr.match(/(\w+)\s*$/i);
      if (lastWordMatch) {
        comment = commentMap[lastWordMatch[1]] || '';
      }
    }

    // 清理表别名
    const cleanedMainExpr = removeTableAlias(mainExpr);

    return { name: cleanedMainExpr, alias, comment };
  }

  // 处理隐式别名（无AS关键字的最后一部分）
  const parts = expr.split(/\s+/);
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].trim().replace(/['"`]/g, '');
    const containsOperator = ['(', '+', '-', '*', '/', '='].some(op =>
      parts.slice(0, -1).join(' ').includes(op)
    );
    // 只有当不包含运算符，且最后一部分不是函数或复杂表达式时，才认为是别名
    if (!containsOperator && !lastPart.includes('(') && !lastPart.includes(')')) {
      const name = parts.slice(0, -1).join(' ');
      const normalizedMainExpr = normalizeExpr(name);

      // 使用规范化后的表达式和别名查找注释
      const comment = commentMap[normalizedMainExpr] || commentMap[lastPart] || '';

      // 清理表别名
      const cleanedName = removeTableAlias(name);

      return { name: cleanedName, alias: lastPart, comment };
    }
  }

  const name = expr;
  const normalizedMainExpr = normalizeExpr(name);
  const comment = commentMap[normalizedMainExpr] || '';

  // 清理表别名
  const cleanedName = removeTableAlias(name);

  return { name: cleanedName, alias: undefined, comment };
}

interface TypeInfo {
  type: string;
  precision?: number;
  scale?: number;
  length?: number;
}

function inferFieldType(fieldName: string, fieldComment: string, customRules?: InferenceRule[]): TypeInfo {
  const name = fieldName.toLowerCase();
  const comment = fieldComment.toLowerCase();

  if (customRules && customRules.length > 0) {
    const sortedRules = [...customRules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      const targetText = rule.targetField === 'name' ? name : comment;

      for (const keyword of rule.keywords) {
        const keywordLower = keyword.toLowerCase();

        if (rule.matchType === 'equals' && targetText === keywordLower) {
          return { type: rule.dataType, precision: rule.precision, scale: rule.scale, length: rule.length };
        } else if (rule.matchType === 'contains' && targetText.includes(keywordLower)) {
          return { type: rule.dataType, precision: rule.precision, scale: rule.scale, length: rule.length };
        } else if (rule.matchType === 'regex') {
          try {
            const regex = new RegExp(keyword, 'i');
            if (regex.test(targetText)) {
              return { type: rule.dataType, precision: rule.precision, scale: rule.scale, length: rule.length };
            }
          } catch {
            // 无效的正则表达式，跳过
          }
        }
      }
    }
  }

  // 默认规则
  if (['fcytp', 'scytp', 'cytp', 'currency_type'].includes(name) || name.includes('币种代码') || comment.includes('币种代码')) {
    return { type: 'STRING' };
  }
  if (name.includes('mode') || name.includes('code') || name.includes('icode') || name.includes('代码') || name.includes('编码')) {
    return { type: 'STRING' };
  }
  if ((name.includes('date') || name.includes('日期')) && !name.includes('day') && !name.includes('days')) {
    return { type: 'DATE' };
  }
  if (name.includes('time') || name.includes('timestamp') || name.includes('时间')) {
    return { type: 'TIMESTAMP' };
  }
  if (['org', 'trcl', 'cust', 'stff', 'user', 'dept'].some(k => name.includes(k))) {
    return { type: 'STRING' };
  }
  if (['_name', '_dscr', '_rmrk', 'name'].some(k => name.includes(k)) || name.includes('描述') || name.includes('备注')) {
    return { type: 'STRING' };
  }
  if (name.includes('flag') || name.startsWith('is_') || name.includes('标记') || name.includes('是否')) {
    return { type: 'STRING' };
  }
  if (name.includes('days') || (name.includes('day') && name !== 'weekday')) {
    return { type: 'DECIMAL', precision: 24, scale: 6 };
  }
  if (['amt', 'amount', 'price', 'ocy', 'rcy', 'scy', 'elmn', 'crdt', 'totl', 'ocpt', '金额', '价格'].some(k => name.includes(k))) {
    return { type: 'DECIMAL', precision: 24, scale: 6 };
  }
  if (['qty', 'quantity', 'cnt', 'count', '数量'].some(k => name.includes(k))) {
    return { type: 'DECIMAL', precision: 24, scale: 6 };
  }

  return { type: 'STRING' };
}

function mapDataType(typeInfo: TypeInfo | string, databaseType: DatabaseType): string {
  if (typeof typeInfo === 'string') {
    // 兼容旧版本
    const data_type = typeInfo.toUpperCase();
    if (databaseType === 'clickhouse') {
      if (data_type === 'STRING') return 'String';
      if (data_type === 'DATE') return 'Date';
      if (data_type === 'TIMESTAMP') return 'DateTime';
      if (data_type.startsWith('DECIMAL')) return data_type.replace('DECIMAL', 'Decimal');
    }
    if (databaseType === 'postgresql') {
      if (data_type === 'STRING') return 'TEXT';
      if (data_type === 'TIMESTAMP') return 'TIMESTAMP';
    }
    return data_type;
  }

  // 新版本：处理类型对象
  const data_type = typeInfo.type.toUpperCase();
  const { precision, scale, length } = typeInfo;

  if (databaseType === 'clickhouse') {
    if (data_type === 'STRING') return 'String';
    if (data_type === 'DATE') return 'Date';
    if (data_type === 'TIMESTAMP') return 'DateTime';
    if (data_type.startsWith('DECIMAL')) {
      const base = data_type.replace('DECIMAL', 'Decimal');
      if (precision && scale) return `${base}(${precision}, ${scale})`;
      return base;
    }
    if (data_type.startsWith('FLOAT')) {
      return precision ? `Float${precision}` : 'Float64';
    }
    if (data_type.startsWith('DOUBLE')) return 'Float64';
    if (data_type === 'VARCHAR' || data_type === 'CHAR') return 'String';
  } else if (databaseType === 'postgresql') {
    if (data_type === 'STRING') return 'TEXT';
    if (data_type === 'TIMESTAMP') return 'TIMESTAMP';
    if (data_type.startsWith('DECIMAL')) {
      return precision && scale ? `DECIMAL(${precision}, ${scale})` : 'DECIMAL';
    }
    if (data_type === 'VARCHAR' || data_type === 'CHAR') {
      return length ? `${data_type}(${length})` : 'VARCHAR(255)';
    }
    if (data_type.startsWith('FLOAT')) return 'REAL';
    if (data_type.startsWith('DOUBLE')) return 'DOUBLE PRECISION';
  } else {
    // MySQL, Spark, StarRocks, Hive, Doris
    if (data_type === 'STRING') {
      return ['spark', 'hive'].includes(databaseType) ? 'STRING' : 'VARCHAR(255)';
    }
    if (data_type.startsWith('DECIMAL')) {
      return precision && scale ? `DECIMAL(${precision}, ${scale})` : 'DECIMAL(24, 6)';
    }
    if (data_type === 'TIMESTAMP') {
      return ['mysql', 'starrocks', 'doris'].includes(databaseType) ? 'DATETIME' : 'TIMESTAMP';
    }
    if (data_type === 'VARCHAR' || data_type === 'CHAR') {
      return length ? `${data_type}(${length})` : 'VARCHAR(255)';
    }
    if (data_type.startsWith('FLOAT')) {
      return precision ? `FLOAT(${precision})` : 'FLOAT';
    }
    if (data_type.startsWith('DOUBLE')) {
      return precision ? `DOUBLE(${precision})` : 'DOUBLE';
    }
  }

  return data_type;
}

function selectPrimaryKey(fields: FieldInfo[]): string | null {
  if (fields.length === 0) return null;

  for (const field of fields) {
    const fieldName = (field.alias || field.name).toLowerCase();
    if (fieldName.endsWith('icode')) {
      return fieldName;
    }
  }

  for (const field of fields) {
    const fieldName = (field.alias || field.name).toLowerCase();
    if (fieldName.endsWith('id') && !fieldName.endsWith('icode')) {
      return fieldName;
    }
  }

  return fields[0].alias || fields[0].name;
}

function generateDDL(fields: FieldInfo[], customRules: Record<string, InferenceRule[]>, databaseType: DatabaseType): string {
  const config = DATABASE_CONFIGS[databaseType];
  const dbRules = customRules[databaseType] || [];

  const adjustedFields = fields.map(field => {
    // 优先使用别名作为字段名
    const fieldName = field.alias || field.name;
    const typeInfo = inferFieldType(fieldName, field.comment, dbRules);
    const mappedType = mapDataType(typeInfo, databaseType);
    return {
      name: fieldName,
      type: mappedType,
      comment: field.comment
    };
  });

  const maxName = Math.max(...adjustedFields.map(f => f.name.length), 30);
  const maxType = 18;

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
    if (pk) {
      ddlParts.push(`   ,PRIMARY KEY (${pk})`);
    }
  }

  ddlParts.push(')');

  // Spark 特定配置：表注释、分区、存储格式、生命周期
  if (databaseType === 'spark') {
    ddlParts.push("COMMENT ''");
    ddlParts.push("PARTITIONED BY (pt STRING COMMENT '日分区')");
    ddlParts.push("STORED AS ORC");
    ddlParts.push("LIFECYCLE 10;");
  } else {
    if (config.comment === 'INLINE') {
      ddlParts.push("COMMENT '';");
    } else if (config.comment === 'SEPARATE') {
      ddlParts.push(";");
      ddlParts.push("COMMENT ON TABLE 表名 IS '';");
      adjustedFields.forEach(field => {
        ddlParts.push(`COMMENT ON COLUMN 表名.${field.name} IS '${field.comment.replace(/'/g, "''")}';`);
      });
    }
  }

  if (config.addEngine) {
    ddlParts.push('ENGINE=InnoDB');
  }

  return ddlParts.join('\n');
}

function generateMultipleDDLs(fields: FieldInfo[], customRules: Record<string, InferenceRule[]>, databaseTypes: DatabaseType[]) {
  const ddls = databaseTypes
    .filter(dbType => dbType in DATABASE_CONFIGS)
    .map(dbType => ({
      databaseType: dbType,
      label: dbType.charAt(0).toUpperCase() + dbType.slice(1),
      ddl: generateDDL(fields, customRules, dbType)
    }));

  if (ddls.length === 1) {
    return { ddl: ddls[0].ddl };
  }
  return { ddls };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sql, rulesByDatabase, databaseTypes } = body;

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: '请提供有效的SQL查询语句' }, { status: 400 });
    }

    const fields = parseSQLFields(sql.trim());
    if (fields.length === 0) {
      return NextResponse.json({ error: '未能从SQL中解析出字段' }, { status: 400 });
    }

    const dbTypes: DatabaseType[] = databaseTypes || ['spark'];
    const customRules: Record<string, InferenceRule[]> = rulesByDatabase || {};

    const result = generateMultipleDDLs(fields, customRules, dbTypes);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}
