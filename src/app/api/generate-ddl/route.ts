import { NextRequest, NextResponse } from 'next/server';

interface FieldInfo {
  name: string;
  alias?: string;
  comment: string;
}

function parseSQLFields(sql: string): FieldInfo[] {
  const fields: FieldInfo[] = [];

  // 移除注释
  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // 提取 SELECT ... FROM 之间的内容
  const selectMatch = cleanSql.match(/SELECT\s+(.*?)\s+FROM/i);
  if (!selectMatch) {
    throw new Error('无法解析SQL，请确保输入的是有效的SELECT查询');
  }

  const selectClause = selectMatch[1];

  // 分割字段（考虑逗号，但忽略括号内的逗号）
  const fieldExpressions: string[] = [];
  let current = '';
  let inParentheses = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < selectClause.length; i++) {
    const char = selectClause[i];

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
    const field = parseFieldExpression(expr);
    if (field) {
      fields.push(field);
    }
  }

  return fields;
}

function parseFieldExpression(expr: string): FieldInfo | null {
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

  // 提取注释（如果有）
  const commentMatch = expr.match(/--\s*(.+)$/);
  if (commentMatch) {
    comment = commentMatch[1].trim();
  }

  // 如果有别名，使用别名作为字段名
  const fieldName = alias || name;

  return {
    name: fieldName,
    alias,
    comment: comment || name,
  };
}

function inferFieldType(fieldName: string): string {
  const name = fieldName.toLowerCase();

  // 日期字段（优先级最高）
  if (
    name.includes('date') ||
    name.includes('日期')
  ) {
    return 'DATE';
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

  // 标记字段（flag、标识）
  if (
    name.includes('flag') ||
    name.includes('is_') ||
    name.includes('标记')
  ) {
    return 'STRING';
  }

  // 金额字段（包含amount、金额、price、金额相关的字段）
  if (
    name.includes('amt') ||
    name.includes('amount') ||
    name.includes('price') ||
    name.includes('金额') ||
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

function generateDDL(fields: FieldInfo[]): string {
  const maxNameLength = Math.max(...fields.map(f => f.name.length), 30);
  const maxTypeLength = 18;

  let ddl = 'CREATE TABLE IF NOT EXISTS 表名 (\n';

  fields.forEach((field, index) => {
    const fieldType = inferFieldType(field.name);
    const paddedName = field.name.padEnd(maxNameLength);
    const paddedType = fieldType.padEnd(maxTypeLength);

    const commentText = `COMMENT '${field.comment.replace(/'/g, "''")}'`;

    if (index === 0) {
      ddl += `    ${paddedName} ${paddedType} ${commentText}`;
    } else {
      ddl += `\n   ,${paddedName} ${paddedType} ${commentText}`;
    }
  });

  ddl += '\n) COMMENT \'信用占用明细表\';';

  return ddl;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sql } = body;

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的SQL查询语句' },
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

    const ddl = generateDDL(fields);

    return NextResponse.json({ ddl });
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
