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

function parseSQLFields(sql: string): FieldInfo[] {
  const fields: FieldInfo[] = [];

  // 提取 SELECT ... FROM 之间的内容（支持多行和复杂子查询）
  // 使用平衡括号计数来确保找到正确的FROM
  let parenCount = 0;
  let selectStart = -1;
  let fromPos = -1;

  // 找到SELECT关键字的位置（支持INSERT INTO...SELECT）
  const selectMatch = sql.match(/\bSELECT\b/i);
  if (!selectMatch || selectMatch.index === undefined) {
    throw new Error('无法解析SQL，请确保输入的是有效的SELECT查询');
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
    throw new Error('无法找到FROM关键字，请检查SQL格式');
  }

  const selectClause = sql.substring(selectStart, fromPos).trim();

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

function generateDDL(fields: FieldInfo[], customRules?: TypeRule[]): string {
  const maxNameLength = Math.max(...fields.map(f => f.name.length), 30);
  const maxTypeLength = 18;

  let ddl = 'CREATE TABLE IF NOT EXISTS 表名 (\n';

  fields.forEach((field, index) => {
    const fieldType = inferFieldType(field.name, customRules);
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
    const { sql, customRules } = body;

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

    const ddl = generateDDL(fields, customRules);

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
