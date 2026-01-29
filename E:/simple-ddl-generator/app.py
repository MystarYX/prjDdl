"""
SQL建表语句生成器 - 零依赖纯Python版本
无需安装任何外部依赖，只使用Python标准库
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import re
from urllib.parse import parse_qs
from socketserver import ThreadingMixIn


# ==================== DDL生成核心逻辑 ====================

DATABASE_CONFIGS = {
    'spark': {'prefix': 'CREATE TABLE IF NOT EXISTS', 'comment': 'INLINE'},
    'mysql': {'prefix': 'CREATE TABLE IF NOT EXISTS', 'comment': 'INLINE', 'add_pk': True, 'add_engine': True},
    'postgresql': {'prefix': 'CREATE TABLE', 'comment': 'SEPARATE'},
    'starrocks': {'prefix': 'CREATE TABLE IF NOT EXISTS', 'comment': 'INLINE'},
    'clickhouse': {'prefix': 'CREATE TABLE IF NOT EXISTS', 'comment': 'INLINE'},
    'hive': {'prefix': 'CREATE TABLE IF NOT EXISTS', 'comment': 'INLINE'},
    'doris': {'prefix': 'CREATE TABLE IF NOT EXISTS', 'comment': 'INLINE'},
}

DATABASE_LABELS = {
    'spark': 'Spark SQL', 'mysql': 'MySQL', 'postgresql': 'PostgreSQL',
    'starrocks': 'StarRocks', 'clickhouse': 'ClickHouse', 'hive': 'Hive', 'doris': 'Doris'
}


def parse_sql_fields(sql):
    """解析SQL字段"""
    fields = []
    sql = sql.strip()

    # 策略1: 解析SELECT ... FROM
    if 'SELECT' in sql.upper():
        result = try_parse_select_from(sql)
        if result:
            return result

    # 策略2: SELECT后无FROM
    if 'SELECT' in sql.upper():
        result = try_parse_select_fields(sql)
        if result:
            return result

    # 策略3: 纯字段列表
    result = try_parse_field_list(sql)
    if result:
        return result

    raise ValueError('无法解析SQL')


def try_parse_select_from(sql):
    """解析SELECT ... FROM"""
    select_match = re.search(r'\bSELECT\b', sql, re.IGNORECASE)
    if not select_match:
        return None

    select_start = select_match.end()
    paren_count = 0
    from_pos = -1

    for i in range(select_start, len(sql)):
        if sql[i] == '(':
            paren_count += 1
        elif sql[i] == ')':
            paren_count -= 1
        elif paren_count == 0 and sql[i:i+4].upper() == 'FROM':
            if i + 4 >= len(sql) or sql[i+4].isspace():
                if i == 0 or sql[i-1].isspace():
                    from_pos = i
                    break

    if from_pos == -1:
        return None

    select_clause = sql[select_start:from_pos].strip()
    return parse_select_clause(select_clause)


def try_parse_select_fields(sql):
    """解析SELECT后字段"""
    select_match = re.search(r'\bSELECT\b', sql, re.IGNORECASE)
    if not select_match:
        return None

    select_start = select_match.end()
    select_clause = sql[select_start:].strip()

    for keyword in ['WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'UNION']:
        match = re.search(f'\\b{keyword}\\b', select_clause, re.IGNORECASE)
        if match:
            select_clause = select_clause[:match.start()].strip()
            break

    return parse_select_clause(select_clause)


def try_parse_field_list(sql):
    """解析字段列表"""
    clean_sql = re.sub(r'--.*$', '', sql, flags=re.MULTILINE)
    clean_sql = re.sub(r'/\*.*?\*/', '', clean_sql, flags=re.DOTALL)
    clean_sql = clean_sql.strip()

    field_expressions = []
    current = []
    paren_count = 0

    for char in clean_sql:
        if char == '(':
            paren_count += 1
            current.append(char)
        elif char == ')':
            paren_count -= 1
            current.append(char)
        elif char == ',' and paren_count == 0:
            field_expressions.append(''.join(current).strip())
            current = []
        else:
            current.append(char)

    if current:
        field_expressions.append(''.join(current).strip())

    fields = []
    for expr in field_expressions:
        field = parse_field_expression(expr)
        if field:
            fields.append(field)

    return fields


def parse_select_clause(select_clause):
    """解析SELECT子句"""
    comment_map = {}
    lines = select_clause.split('\n')

    for line in lines:
        match = re.search(r'--\s*(.+)$', line)
        if match:
            comment = match.group(1).strip()
            field_part = line[:match.start()].strip()
            if field_part:
                normalized_key = field_part.lstrip(',').strip()
                comment_map[normalized_key] = comment

    clean_clause = re.sub(r'--.*$', '', select_clause, flags=re.MULTILINE)
    clean_clause = re.sub(r'/\*.*?\*/', '', clean_clause, flags=re.DOTALL)

    field_expressions = split_fields(clean_clause)
    fields = []

    for expr in field_expressions:
        field = parse_field_expression(expr, comment_map)
        if field:
            fields.append(field)

    return fields


def split_fields(select_clause):
    """分割字段"""
    field_expressions = []
    current = []
    paren_count = 0

    for char in select_clause:
        if char == '(':
            paren_count += 1
            current.append(char)
        elif char == ')':
            paren_count -= 1
            current.append(char)
        elif char == ',' and paren_count == 0:
            field_expressions.append(''.join(current).strip())
            current = []
        else:
            current.append(char)

    if current:
        field_expressions.append(''.join(current).strip())

    return field_expressions


def parse_field_expression(expr, comment_map=None):
    """解析字段表达式"""
    expr = expr.strip()

    if comment_map is None:
        comment_map = {}

    if 'SELECT' in expr.upper() or ' FROM ' in expr.upper():
        return None

    expr = re.sub(r'\bDISTINCT\s+', '', expr, flags=re.IGNORECASE)

    alias_match = re.search(r'\s+AS\s+([^\s,]+)$', expr, re.IGNORECASE)
    if alias_match:
        main_expr = expr[:alias_match.start()].strip()
        alias = alias_match.group(1).strip("'\"")
        name = main_expr
    else:
        parts = expr.split()
        if len(parts) > 1:
            last_part = parts[-1].strip("'\"")
            if not any(op in parts[-2] for op in ['(', '+', '-', '*', '/', '=']):
                name = ' '.join(parts[:-1])
                alias = last_part
            else:
                name = expr
                alias = None
        else:
            name = expr
            alias = None

    field_name = alias or name
    comment = comment_map.get(name, field_name)

    return {'name': field_name, 'alias': alias, 'comment': comment}


def infer_field_type(field_name, field_comment, custom_rules=None):
    """推断字段类型 - 支持基于关键词的自定义规则"""
    name = field_name.lower()
    comment = field_comment.lower()

    # 应用自定义规则
    if custom_rules and isinstance(custom_rules, list):
        # 按优先级排序（数字越小优先级越高）
        sorted_rules = sorted(custom_rules, key=lambda x: x.get('priority', 999))

        for rule in sorted_rules:
            match_type = rule.get('matchType', 'contains')
            target_field = rule.get('targetField', 'name')  # name 或 comment
            keywords = rule.get('keywords', [])

            for keyword in keywords:
                keyword_lower = keyword.lower()

                # 确定匹配的文本
                target_text = name if target_field == 'name' else comment

                if match_type == 'equals':
                    if target_text == keyword_lower:
                        return rule['dataType']
                elif match_type == 'contains':
                    if keyword_lower in target_text:
                        return rule['dataType']
                elif match_type == 'regex':
                    try:
                        if re.search(keyword, target_text, re.IGNORECASE):
                            return rule['dataType']
                    except:
                        pass

    # 默认规则（兜底）
    if name in ['fcytp', 'scytp', 'cytp', 'currency_type'] or '币种代码' in name or '币种代码' in comment:
        return 'STRING'
    if 'mode' in name or 'code' in name or 'icode' in name or '代码' in name or '编码' in name:
        return 'STRING'
    if 'date' in name or '日期' in name:
        if 'day' not in name and 'days' not in name:
            return 'DATE'
    if 'time' in name or 'timestamp' in name or '时间' in name:
        return 'TIMESTAMP'
    if any(k in name for k in ['org', 'trcl', 'cust', 'stff', 'user', 'dept']):
        return 'STRING'
    if any(k in name for k in ['_name', '_dscr', '_rmrk', 'name', '描述', '备注']):
        return 'STRING'
    if 'flag' in name or name.startswith('is_') or '标记' in name or '是否' in name:
        return 'STRING'
    if 'days' in name or ('day' in name and name != 'weekday'):
        return 'DECIMAL(24, 6)'
    if any(k in name for k in ['amt', 'amount', 'price', 'ocy', 'rcy', 'scy', 'elmn', 'crdt', 'totl', 'ocpt', '金额', '价格']):
        return 'DECIMAL(24, 6)'
    if any(k in name for k in ['qty', 'quantity', 'cnt', 'count', '数量']):
        return 'DECIMAL(24, 6)'

    return 'STRING'


def map_data_type(data_type, database_type):
    """类型映射"""
    if database_type == 'clickhouse':
        if data_type == 'STRING':
            return 'String'
        if data_type == 'DATE':
            return 'Date'
        if data_type == 'TIMESTAMP':
            return 'DateTime'
        if data_type.startswith('DECIMAL'):
            return data_type.replace('DECIMAL', 'Decimal')
    if database_type == 'postgresql':
        if data_type == 'STRING':
            return 'TEXT'
        if data_type == 'TIMESTAMP':
            return 'TIMESTAMP'
    return data_type


def select_primary_key(fields):
    """选择主键"""
    if not fields:
        return None

    for field in fields:
        if field['name'].lower().endswith('icode'):
            return field['name']

    for field in fields:
        if field['name'].lower().endswith('id') and not field['name'].lower().endswith('icode'):
            return field['name']

    return fields[0]['name']


def generate_ddl(fields, custom_rules, database_type):
    """生成DDL"""
    config = DATABASE_CONFIGS.get(database_type, DATABASE_CONFIGS['spark'])

    max_name = max((len(f['name']) for f in fields), default=30)
    max_type = 18

    db_rules = custom_rules.get(database_type, [])

    adjusted_fields = []
    for field in fields:
        field_type = infer_field_type(field['name'], field['comment'], db_rules)
        mapped_type = map_data_type(field_type, database_type)
        adjusted_fields.append({
            'name': field['name'],
            'type': mapped_type,
            'comment': field['comment']
        })

    ddl_parts = [f"{config['prefix']} 表名 ("]

    for idx, field in enumerate(adjusted_fields):
        padded_name = field['name'].ljust(max_name)
        padded_type = field['type'].ljust(max_type)
        comment_text = "COMMENT '" + field['comment'].replace("'", "''") + "'"

        if idx == 0:
            ddl_parts.append(f"    {padded_name} {padded_type} {comment_text}")
        else:
            ddl_parts.append(f"   ,{padded_name} {padded_type} {comment_text}")

    if config.get('add_pk'):
        pk = select_primary_key(fields)
        if pk:
            ddl_parts.append(f"   ,PRIMARY KEY ({pk})")

    ddl_parts.append(")")

    if config['comment'] == 'INLINE':
        if config.get('add_engine'):
            ddl_parts.append(" ENGINE=InnoDB")
        ddl_parts.append(" COMMENT ''")
    else:
        ddl_parts.append(";")
        ddl_parts.append("")
        ddl_parts.append("COMMENT ON TABLE 表名 IS '';")
        for field in adjusted_fields:
            ddl_parts.append("COMMENT ON COLUMN 表名." + field['name'] + " IS '" + field['comment'].replace("'", "''") + "';")

    return '\n'.join(ddl_parts)


def generate_multiple_ddls(fields, custom_rules, database_types):
    """批量生成DDL"""
    ddls = []
    for db_type in database_types:
        if db_type in DATABASE_CONFIGS:
            ddl = generate_ddl(fields, custom_rules, db_type)
            ddls.append({
                'databaseType': db_type,
                'label': DATABASE_LABELS.get(db_type, db_type.upper()),
                'ddl': ddl
            })

    if len(ddls) == 1:
        return {'ddl': ddls[0]['ddl']}
    return {'ddls': ddls}


# ==================== HTTP服务器 ====================

class APIHandler(SimpleHTTPRequestHandler):
    """处理HTTP请求"""

    def do_GET(self):
        """处理GET请求"""
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(self.get_html().encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')

    def do_POST(self):
        """处理POST请求"""
        if self.path == '/api/generate-ddl':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(post_data)

                sql = data.get('sql', '').strip()
                if not sql:
                    self.send_error_response(400, '请提供有效的SQL查询语句')
                    return

                fields = parse_sql_fields(sql)
                if not fields:
                    self.send_error_response(400, '未能从SQL中解析出字段')
                    return

                database_types = data.get('databaseTypes', ['spark'])
                custom_rules = data.get('rulesByDatabase', {})

                result = generate_multiple_ddls(fields, custom_rules, database_types)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            except ValueError as e:
                self.send_error_response(400, str(e))
            except Exception as e:
                self.send_error_response(500, f'生成失败: {str(e)}')
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not Found')

    def send_error_response(self, code, message):
        """发送错误响应"""
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}, ensure_ascii=False).encode('utf-8'))

    def get_html(self):
        """返回HTML页面"""
        return '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL建表语句生成器</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { text-align: center; color: #333; margin-bottom: 10px; }
        .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
        .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card-title { font-weight: 600; margin-bottom: 15px; color: #333; }
        .db-selector { display: flex; flex-wrap: wrap; gap: 10px; }
        .db-option { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; }
        .db-option:hover { background: #f0f0f0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        textarea { width: 100%; min-height: 400px; padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 14px; }
        .btn { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 600; width: 100%; margin-top: 10px; }
        .btn:hover { background: #0056b3; }
        .btn:disabled { background: #ccc; cursor: not-allowed; }
        .btn-copy { background: #28a745; padding: 6px 12px; font-size: 14px; width: auto; margin-top: 0; }
        .btn-copy:hover { background: #218838; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .error { background: #f8d7da; color: #721c24; padding: 12px; border-radius: 6px; margin-top: 10px; display: none; }
        .mapping-section { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 6px; padding: 15px; }
        .mapping-title { font-weight: 600; margin-bottom: 15px; color: #007bff; }
        .rule-list { display: flex; flex-direction: column; gap: 10px; }
        .rule-item { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 80px 40px; gap: 10px; align-items: center; background: #f8f9fa; padding: 10px; border-radius: 4px; }
        .rule-item input, .rule-item select { padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; }
        .rule-item label { font-size: 12px; color: #666; font-weight: 500; }
        .btn-add { background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; margin-top: 10px; }
        .btn-add:hover { background: #218838; }
        .btn-delete { background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .btn-delete:hover { background: #c82333; }
        .rule-header { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 80px 40px; gap: 10px; margin-bottom: 10px; font-size: 12px; color: #666; font-weight: 600; }
    </style>
</head>
<body>
    <div class="container">
        <h1>SQL建表语句生成器</h1>
        <p class="subtitle">自动解析SQL查询，生成符合规范的建表语句</p>

        <div class="card">
            <h3 class="card-title">目标数据库类型</h3>
            <div class="db-selector" id="dbSelector">
                <label class="db-option"><input type="checkbox" value="spark" checked onchange="toggleMapping('spark')"> Spark SQL</label>
                <label class="db-option"><input type="checkbox" value="mysql" onchange="toggleMapping('mysql')"> MySQL</label>
                <label class="db-option"><input type="checkbox" value="postgresql" onchange="toggleMapping('postgresql')"> PostgreSQL</label>
                <label class="db-option"><input type="checkbox" value="starrocks" onchange="toggleMapping('starrocks')"> StarRocks</label>
                <label class="db-option"><input type="checkbox" value="clickhouse" onchange="toggleMapping('clickhouse')"> ClickHouse</label>
                <label class="db-option"><input type="checkbox" value="hive" onchange="toggleMapping('hive')"> Hive</label>
                <label class="db-option"><input type="checkbox" value="doris" onchange="toggleMapping('doris')"> Doris</label>
            </div>
        </div>

        <div class="card" id="mappingCard" style="display: none;">
            <h3 class="card-title">字段类型推断规则</h3>
            <div id="mappingContainer"></div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="header">
                    <h3 class="card-title">输入SQL查询语句</h3>
                    <span id="charCount" style="color: #666;">0 字符</span>
                </div>
                <textarea id="sqlInput" placeholder="请输入SELECT查询语句或字段列表...

示例：
SELECT
  org_id,
  trcl_id,
  cust_id,
  business_date,
  credit_amt
FROM credit_usage_detail"></textarea>
                <button id="generateBtn" class="btn" onclick="generateDDL()">生成建表语句</button>
                <div id="error" class="error"></div>
            </div>

            <div class="card">
                <div class="header">
                    <h3 class="card-title" id="outputTitle">Spark SQL 建表语句</h3>
                    <button class="btn btn-copy" onclick="copyDDL()">复制</button>
                </div>
                <textarea id="ddlOutput" readonly placeholder="生成的建表语句将显示在这里..."></textarea>
            </div>
        </div>

        <div class="card" style="text-align: center; color: #666;">
            <p>支持解析 SELECT 查询语句中的字段，自动推断字段类型并生成建表 DDL</p>
            <p style="margin-top: 10px;">支持7种数据库类型：Spark SQL、MySQL、PostgreSQL、StarRocks、ClickHouse、Hive、Doris</p>
        </div>
    </div>

    <script>
        const DB_LABELS = {
            'spark': 'Spark SQL',
            'mysql': 'MySQL',
            'postgresql': 'PostgreSQL',
            'starrocks': 'StarRocks',
            'clickhouse': 'ClickHouse',
            'hive': 'Hive',
            'doris': 'Doris'
        };

        const ALL_TYPE_OPTIONS = {
            'spark': ['STRING', 'VARCHAR', 'CHAR', 'DECIMAL', 'DATE', 'TIMESTAMP', 'BIGINT', 'INT', 'FLOAT', 'DOUBLE', 'BOOLEAN', 'BINARY', 'ARRAY', 'MAP', 'STRUCT'],
            'mysql': ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR', 'CHAR', 'VARCHAR', 'BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'ENUM', 'SET', 'BOOLEAN', 'JSON'],
            'postgresql': ['SMALLINT', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE PRECISION', 'SMALLSERIAL', 'SERIAL', 'BIGSERIAL', 'CHARACTER', 'VARCHAR', 'TEXT', 'BYTEA', 'TIMESTAMP', 'DATE', 'TIME', 'BOOLEAN', 'UUID', 'JSON', 'JSONB', 'ARRAY'],
            'starrocks': ['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'LARGEINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'DATE', 'DATETIME', 'CHAR', 'VARCHAR', 'STRING', 'BOOLEAN', 'JSON', 'BITMAP', 'HLL', 'PERCENTILE', 'ARRAY', 'MAP', 'STRUCT'],
            'clickhouse': ['UInt8', 'UInt16', 'UInt32', 'UInt64', 'Int8', 'Int16', 'Int32', 'Int64', 'Float32', 'Float64', 'String', 'FixedString', 'Date', 'DateTime', 'DateTime64', 'Decimal', 'UUID', 'Enum8', 'Enum16', 'Array', 'Tuple', 'Map', 'Nested', 'Nullable', 'Bool'],
            'hive': ['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'BOOLEAN', 'FLOAT', 'DOUBLE', 'DECIMAL', 'STRING', 'VARCHAR', 'CHAR', 'DATE', 'TIMESTAMP', 'INTERVAL', 'BINARY', 'ARRAY', 'MAP', 'STRUCT', 'UNIONTYPE'],
            'doris': ['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'LARGEINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'DATE', 'DATETIME', 'CHAR', 'VARCHAR', 'STRING', 'BOOLEAN', 'JSON', 'BITMAP', 'HLL', 'PERCENTILE', 'ARRAY', 'MAP', 'STRUCT']
        };

        const DEFAULT_RULES = {
            'spark': [
                { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
                { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
                { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'TIMESTAMP', priority: 1 },
                { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'STRING', priority: 1 },
                { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'STRING', priority: 1 }
            ],
            'mysql': [
                { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
                { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
                { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'DATETIME', priority: 1 },
                { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
                { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'VARCHAR(255)', priority: 1 }
            ],
            'postgresql': [
                { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
                { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
                { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'TIMESTAMP', priority: 1 },
                { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
                { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'VARCHAR(255)', priority: 1 }
            ],
            'starrocks': [
                { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
                { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
                { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'DATETIME', priority: 1 },
                { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
                { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'VARCHAR(255)', priority: 1 }
            ],
            'clickhouse': [
                { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'Decimal(24, 6)', priority: 1 },
                { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'Date', priority: 1 },
                { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'DateTime', priority: 1 },
                { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'Int64', priority: 1 },
                { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'String', priority: 1 }
            ],
            'hive': [
                { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
                { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
                { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'TIMESTAMP', priority: 1 },
                { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
                { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'STRING', priority: 1 }
            ],
            'doris': [
                { keywords: ['amt', 'amount', 'price', '金额', '价格'], matchType: 'contains', targetField: 'name', dataType: 'DECIMAL(24, 6)', priority: 1 },
                { keywords: ['date', '日期'], matchType: 'contains', targetField: 'name', dataType: 'DATE', priority: 1 },
                { keywords: ['time', 'timestamp', '时间'], matchType: 'contains', targetField: 'name', dataType: 'DATETIME', priority: 1 },
                { keywords: ['id', 'icode'], matchType: 'contains', targetField: 'name', dataType: 'BIGINT', priority: 1 },
                { keywords: ['name', '名称', '描述', '备注'], matchType: 'contains', targetField: 'name', dataType: 'VARCHAR(255)', priority: 1 }
            ]
        };

        let customRules = JSON.parse(JSON.stringify(DEFAULT_RULES));

        document.getElementById('sqlInput').addEventListener('input', function() {
            document.getElementById('charCount').textContent = this.value.length + ' 字符';
        });

        function toggleMapping(dbType) {
            renderMappings();
        }

        function renderMappings() {
            const checkedDbs = Array.from(document.querySelectorAll('#dbSelector input:checked')).map(cb => cb.value);
            const mappingCard = document.getElementById('mappingCard');
            const mappingContainer = document.getElementById('mappingContainer');

            if (checkedDbs.length === 0) {
                mappingCard.style.display = 'none';
                return;
            }

            mappingCard.style.display = 'block';
            mappingContainer.innerHTML = '';

            checkedDbs.forEach(dbType => {
                const section = document.createElement('div');
                section.className = 'mapping-section';

                const rules = customRules[dbType] || [];
                const typeOptions = ALL_TYPE_OPTIONS[dbType];

                let rulesHtml = `
                    <div class="mapping-title">${DB_LABELS[dbType]} 字段类型推断规则</div>
                    <div class="rule-header">
                        <div>关键词（逗号分隔）</div>
                        <div>匹配方式</div>
                        <div>匹配字段</div>
                        <div>目标类型</div>
                        <div>优先级</div>
                        <div></div>
                    </div>
                    <div class="rule-list" id="rules_${dbType}">
                `;

                rules.forEach((rule, index) => {
                    rulesHtml += `
                        <div class="rule-item" data-index="${index}">
                            <div>
                                <label>关键词</label>
                                <input type="text" value="${rule.keywords.join(', ')}" data-field="keywords" placeholder="amt, amount">
                            </div>
                            <div>
                                <label>匹配方式</label>
                                <select data-field="matchType">
                                    <option value="contains" ${rule.matchType === 'contains' ? 'selected' : ''}>包含</option>
                                    <option value="equals" ${rule.matchType === 'equals' ? 'selected' : ''}>等于</option>
                                    <option value="regex" ${rule.matchType === 'regex' ? 'selected' : ''}>正则</option>
                                </select>
                            </div>
                            <div>
                                <label>匹配字段</label>
                                <select data-field="targetField">
                                    <option value="name" ${rule.targetField === 'name' ? 'selected' : ''}>字段名</option>
                                    <option value="comment" ${rule.targetField === 'comment' ? 'selected' : ''}>字段注释</option>
                                </select>
                            </div>
                            <div>
                                <label>目标类型</label>
                                <select data-field="dataType">
                                    ${typeOptions.map(opt => `<option value="${opt}" ${rule.dataType === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label>优先级</label>
                                <input type="number" value="${rule.priority}" data-field="priority" min="0" max="999">
                            </div>
                            <div>
                                <button class="btn-delete" onclick="deleteRule('${dbType}', ${index})">删除</button>
                            </div>
                        </div>
                    `;
                });

                rulesHtml += `
                    </div>
                    <button class="btn-add" onclick="addRule('${dbType}')">+ 添加规则</button>
                `;

                section.innerHTML = rulesHtml;
                mappingContainer.appendChild(section);
            });
        }

        function addRule(dbType) {
            if (!customRules[dbType]) {
                customRules[dbType] = [];
            }
            customRules[dbType].push({
                keywords: [],
                matchType: 'contains',
                targetField: 'name',
                dataType: 'STRING',
                priority: 999
            });
            renderMappings();
        }

        function deleteRule(dbType, index) {
            customRules[dbType].splice(index, 1);
            renderMappings();
        }

        function getCustomRules() {
            const ruleItems = document.querySelectorAll('.rule-item');
            ruleItems.forEach(item => {
                const dbType = item.closest('.mapping-section').querySelector('.rule-list').id.replace('rules_', '');
                const index = parseInt(item.dataset.index);

                const keywordInput = item.querySelector('[data-field="keywords"]');
                const matchTypeSelect = item.querySelector('[data-field="matchType"]');
                const targetFieldSelect = item.querySelector('[data-field="targetField"]');
                const dataTypeSelect = item.querySelector('[data-field="dataType"]');
                const priorityInput = item.querySelector('[data-field="priority"]');

                const keywords = keywordInput.value.split(',').map(k => k.trim()).filter(k => k);

                customRules[dbType][index] = {
                    keywords: keywords,
                    matchType: matchTypeSelect.value,
                    targetField: targetFieldSelect.value,
                    dataType: dataTypeSelect.value,
                    priority: parseInt(priorityInput.value) || 999
                };
            });

            return customRules;
        }

        // 初始化映射区域
        renderMappings();

        async function generateDDL() {
            const sql = document.getElementById('sqlInput').value.trim();
            const errorDiv = document.getElementById('error');
            const generateBtn = document.getElementById('generateBtn');

            if (!sql) {
                errorDiv.textContent = '请输入SQL查询语句';
                errorDiv.style.display = 'block';
                return;
            }

            const dbTypes = Array.from(document.querySelectorAll('#dbSelector input:checked')).map(cb => cb.value);
            if (dbTypes.length === 0) {
                errorDiv.textContent = '请至少选择一个数据库类型';
                errorDiv.style.display = 'block';
                return;
            }

            errorDiv.style.display = 'none';
            generateBtn.disabled = true;
            generateBtn.textContent = '生成中...';

            try {
                const customRulesData = getCustomRules();
                const response = await fetch('/api/generate-ddl', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sql, rulesByDatabase: customRulesData, databaseTypes: dbTypes })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || '生成失败');
                }

                if (data.ddls) {
                    document.getElementById('ddlOutput').value = data.ddls.map(d => '-- ' + d.label + '\\n' + d.ddl).join('\\n\\n');
                    document.getElementById('outputTitle').textContent = '建表语句 (' + dbTypes.length + ' 个数据库)';
                } else {
                    document.getElementById('ddlOutput').value = data.ddl;
                    const labels = {spark: 'Spark SQL', mysql: 'MySQL', postgresql: 'PostgreSQL', starrocks: 'StarRocks', clickhouse: 'ClickHouse', hive: 'Hive', doris: 'Doris'};
                    document.getElementById('outputTitle').textContent = (labels[dbTypes[0]] || dbTypes[0].toUpperCase()) + ' 建表语句';
                }
            } catch (err) {
                errorDiv.textContent = err.message;
                errorDiv.style.display = 'block';
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = '生成建表语句';
            }
        }

        function copyDDL() {
            const ddl = document.getElementById('ddlOutput').value;
            if (ddl) {
                navigator.clipboard.writeText(ddl);
                const copyBtn = document.querySelector('.btn-copy');
                const originalText = copyBtn.textContent;
                copyBtn.textContent = '已复制!';
                setTimeout(() => copyBtn.textContent = originalText, 2000);
            }
        }
    </script>
</body>
</html>'''


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """支持多线程的HTTP服务器"""
    daemon_threads = True


def main():
    """启动服务器"""
    port = 5000
    server = ThreadedHTTPServer(('0.0.0.0', port), APIHandler)
    print(f'✓ SQL建表语句生成器已启动')
    print(f'✓ 访问地址: http://localhost:{port}')
    print(f'✓ 按 Ctrl+C 停止服务')
    print()
    server.serve_forever()


if __name__ == '__main__':
    main()
