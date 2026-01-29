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
    """推断字段类型 - 支持基于关键词的自定义规则，返回类型和参数"""
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
                        return {
                            'type': rule['dataType'],
                            'precision': rule.get('precision'),
                            'scale': rule.get('scale'),
                            'length': rule.get('length')
                        }
                elif match_type == 'contains':
                    if keyword_lower in target_text:
                        return {
                            'type': rule['dataType'],
                            'precision': rule.get('precision'),
                            'scale': rule.get('scale'),
                            'length': rule.get('length')
                        }
                elif match_type == 'regex':
                    try:
                        if re.search(keyword, target_text, re.IGNORECASE):
                            return {
                                'type': rule['dataType'],
                                'precision': rule.get('precision'),
                                'scale': rule.get('scale'),
                                'length': rule.get('length')
                            }
                    except:
                        pass

    # 默认规则（兜底）
    if name in ['fcytp', 'scytp', 'cytp', 'currency_type'] or '币种代码' in name or '币种代码' in comment:
        return {'type': 'STRING'}
    if 'mode' in name or 'code' in name or 'icode' in name or '代码' in name or '编码' in name:
        return {'type': 'STRING'}
    if 'date' in name or '日期' in name:
        if 'day' not in name and 'days' not in name:
            return {'type': 'DATE'}
    if 'time' in name or 'timestamp' in name or '时间' in name:
        return {'type': 'TIMESTAMP'}
    if any(k in name for k in ['org', 'trcl', 'cust', 'stff', 'user', 'dept']):
        return {'type': 'STRING'}
    if any(k in name for k in ['_name', '_dscr', '_rmrk', 'name', '描述', '备注']):
        return {'type': 'STRING'}
    if 'flag' in name or name.startswith('is_') or '标记' in name or '是否' in name:
        return {'type': 'STRING'}
    if 'days' in name or ('day' in name and name != 'weekday'):
        return {'type': 'DECIMAL', 'precision': 24, 'scale': 6}
    if any(k in name for k in ['amt', 'amount', 'price', 'ocy', 'rcy', 'scy', 'elmn', 'crdt', 'totl', 'ocpt', '金额', '价格']):
        return {'type': 'DECIMAL', 'precision': 24, 'scale': 6}
    if any(k in name for k in ['qty', 'quantity', 'cnt', 'count', '数量']):
        return {'type': 'DECIMAL', 'precision': 24, 'scale': 6}

    return {'type': 'STRING'}


def map_data_type(type_info, database_type):
    """类型映射 - 支持类型参数"""
    if isinstance(type_info, str):
        # 兼容旧版本：直接返回字符串
        data_type = type_info
        precision = None
        scale = None
        length = None
    else:
        # 新版本：处理类型对象
        data_type = type_info.get('type', 'STRING')
        precision = type_info.get('precision')
        scale = type_info.get('scale')
        length = type_info.get('length')

    # 构建带参数的类型字符串
    result_type = data_type.upper()

    if database_type == 'clickhouse':
        if result_type == 'STRING':
            return 'String'
        if result_type == 'DATE':
            return 'Date'
        if result_type == 'TIMESTAMP':
            return 'DateTime'
        if result_type.startswith('DECIMAL'):
            base_type = result_type.replace('DECIMAL', 'Decimal')
            if precision and scale:
                return f"{base_type}({precision}, {scale})"
            return base_type
        if result_type.startswith('FLOAT'):
            if precision:
                return f"Float{precision}"
            return 'Float64'
        if result_type.startswith('DOUBLE'):
            return 'Float64'
        if result_type in ['VARCHAR', 'CHAR']:
            return 'String'  # ClickHouse 使用 String 代替 VARCHAR/CHAR
    elif database_type == 'postgresql':
        if result_type == 'STRING':
            return 'TEXT'
        if result_type == 'TIMESTAMP':
            return 'TIMESTAMP'
        if result_type.startswith('DECIMAL'):
            if precision and scale:
                return f"DECIMAL({precision}, {scale})"
            return 'DECIMAL'
        if result_type in ['VARCHAR', 'CHAR']:
            if length:
                return f"{result_type}({length})"
            return 'VARCHAR(255)'
        if result_type.startswith('FLOAT'):
            if precision:
                return f"REAL"
            return 'REAL'
        if result_type.startswith('DOUBLE'):
            return 'DOUBLE PRECISION'
    else:
        # MySQL, Spark, StarRocks, Hive, Doris
        if result_type == 'STRING':
            if database_type in ['spark', 'hive']:
                return 'STRING'
            return 'VARCHAR(255)'
        if result_type.startswith('DECIMAL'):
            if precision and scale:
                return f"DECIMAL({precision}, {scale})"
            return 'DECIMAL(24, 6)'
        if result_type == 'TIMESTAMP':
            if database_type in ['mysql', 'starrocks', 'doris']:
                return 'DATETIME'
            return 'TIMESTAMP'
        if result_type in ['VARCHAR', 'CHAR']:
            if length:
                return f"{result_type}({length})"
            return 'VARCHAR(255)'
        if result_type.startswith('FLOAT'):
            if precision:
                return f"FLOAT({precision})"
            return 'FLOAT'
        if result_type.startswith('DOUBLE'):
            if precision:
                return f"DOUBLE({precision})"
            return 'DOUBLE'

    return result_type


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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { text-align: center; color: #333; margin-bottom: 10px; font-weight: 700; }
        .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
        .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .card-title { font-weight: 600; margin-bottom: 15px; color: #333; }
        .db-selector { display: flex; flex-wrap: wrap; gap: 10px; }
        .db-option { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border: 1px solid #e0e0e0; border-radius: 10px; cursor: pointer; transition: all 0.2s; }
        .db-option:hover { background: #f8f9fa; border-color: #007bff; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        textarea { width: 100%; min-height: 400px; padding: 12px; border: 1px solid #e0e0e0; border-radius: 10px; font-family: 'Courier New', monospace; font-size: 14px; transition: border-color 0.2s; }
        textarea:focus { outline: none; border-color: #007bff; }
        .btn { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 10px; cursor: pointer; font-size: 16px; font-weight: 600; width: 100%; margin-top: 10px; transition: all 0.2s; }
        .btn:hover { background: #0056b3; transform: translateY(-1px); }
        .btn:disabled { background: #ccc; cursor: not-allowed; transform: none; }
        .btn-copy { background: #28a745; padding: 8px 16px; font-size: 14px; width: auto; margin-top: 0; border-radius: 8px; }
        .btn-copy:hover { background: #218838; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .error { background: #fff3f3; color: #dc3545; padding: 12px; border-radius: 10px; margin-top: 10px; display: none; border: 1px solid #ffcccc; }
        .mapping-section { margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 12px; padding: 18px; }
        .mapping-title { font-weight: 600; margin-bottom: 15px; color: #007bff; }
        .rule-list { display: flex; flex-direction: column; gap: 12px; }
        .rule-item { display: grid; grid-template-columns: 1.5fr 0.8fr 0.8fr 1.5fr 70px 40px; gap: 10px; align-items: start; background: #fafafa; padding: 14px; border-radius: 10px; }
        .rule-item input, .rule-item select { padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 13px; transition: border-color 0.2s; }
        .rule-item input:focus, .rule-item select:focus { outline: none; border-color: #007bff; }
        .rule-item label { font-size: 12px; color: #666; font-weight: 500; display: block; margin-bottom: 4px; }
        .rule-item > div { display: flex; flex-direction: column; }
        .rule-item .type-wrapper { flex-direction: row; align-items: flex-end; gap: 8px; }
        .type-config-input { width: 80px !important; font-size: 12px !important; }
        .btn-add { background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-size: 14px; margin-top: 10px; transition: all 0.2s; }
        .btn-add:hover { background: #218838; transform: translateY(-1px); }
        .btn-delete { background: #dc3545; color: white; border: none; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 12px; transition: all 0.2s; }
        .btn-delete:hover { background: #c82333; }
        .rule-header { display: grid; grid-template-columns: 1.5fr 0.8fr 0.8fr 1.5fr 70px 40px; gap: 10px; margin-bottom: 12px; font-size: 12px; color: #666; font-weight: 600; padding: 0 4px; }
        .tabs { display: flex; gap: 6px; margin-bottom: 24px; border-bottom: 2px solid #e0e0e0; }
        .tab { padding: 12px 24px; background: #f8f9fa; border: 1px solid #e0e0e0; border-bottom: none; border-radius: 10px 10px 0 0; cursor: pointer; font-weight: 500; color: #666; transition: all 0.2s; }
        .tab:hover { background: #e9ecef; }
        .tab.active { background: #007bff; color: white; border-color: #007bff; transform: translateY(-2px); }
        .tab-content { display: none; }
        .tab-content.active { display: block; animation: fadeIn 0.3s ease; }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .tab { padding: 12px 24px; background: #f8f9fa; border: 1px solid #ddd; border-bottom: none; border-radius: 6px 6px 0 0; cursor: pointer; font-weight: 500; color: #666; transition: all 0.3s; }
        .tab:hover { background: #e9ecef; }
        .tab.active { background: #007bff; color: white; border-color: #007bff; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>SQL建表语句生成器</h1>
        <p class="subtitle">自动解析SQL查询，生成符合规范的建表语句</p>

        <!-- 标签页导航 -->
        <div class="tabs">
            <div class="tab active" onclick="switchTab('generator')">DDL生成器</div>
            <div class="tab" onclick="switchTab('rules')">规则管理器</div>
        </div>

        <!-- 标签页1: DDL生成器 -->
        <div class="tab-content active" id="tab-generator">
            <div class="card">
                <h3 class="card-title">目标数据库类型</h3>
                <div class="db-selector" id="dbSelector">
                    <label class="db-option"><input type="checkbox" value="spark" checked> Spark SQL</label>
                    <label class="db-option"><input type="checkbox" value="mysql"> MySQL</label>
                    <label class="db-option"><input type="checkbox" value="postgresql"> PostgreSQL</label>
                    <label class="db-option"><input type="checkbox" value="starrocks"> StarRocks</label>
                    <label class="db-option"><input type="checkbox" value="clickhouse"> ClickHouse</label>
                    <label class="db-option"><input type="checkbox" value="hive"> Hive</label>
                    <label class="db-option"><input type="checkbox" value="doris"> Doris</label>
                </div>
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

        <!-- 标签页2: 规则管理器 -->
        <div class="tab-content" id="tab-rules">
            <div class="card">
                <div class="header">
                    <h3 class="card-title">字段类型推断规则配置</h3>
                    <span id="rulesDbCount" style="color: #666;"></span>
                </div>
                <p style="color: #666; margin-bottom: 15px;">为每种数据库类型配置自定义的字段类型推断规则，根据字段名或注释自动匹配目标类型。规则按优先级从小到大依次应用。</p>
                <div style="background: #e3f2fd; padding: 10px; border-radius: 6px; margin-bottom: 15px; font-size: 13px; color: #1976d2;">
                    <strong>💡 提示：</strong> 选择 DECIMAL、VARCHAR、CHAR、FLOAT、DOUBLE 类型时，会显示额外的配置选项（精度、小数位、长度等），可以自定义类型参数。
                </div>
                <div id="mappingContainer"></div>
            </div>
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

        // 标签页切换
        function switchTab(tabName) {
            // 隐藏所有标签内容
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            // 移除所有标签激活状态
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            // 激活选中的标签
            document.getElementById('tab-' + tabName).classList.add('active');
            event.target.classList.add('active');

            // 如果切换到规则页面，渲染规则
            if (tabName === 'rules') {
                renderMappings();
            }
        }

        document.getElementById('sqlInput').addEventListener('input', function() {
            document.getElementById('charCount').textContent = this.value.length + ' 字符';
        });

        // 监听数据库选择变化
        document.getElementById('dbSelector').addEventListener('change', function() {
            // 重新渲染规则（如果在规则页面）
            if (document.getElementById('tab-rules').classList.contains('active')) {
                renderMappings();
            }
        });

        function renderMappings() {
            const checkedDbs = Array.from(document.querySelectorAll('#dbSelector input:checked')).map(cb => cb.value);
            const mappingContainer = document.getElementById('mappingContainer');

            // 更新规则页面标题
            document.getElementById('rulesDbCount').textContent = `已选择 ${checkedDbs.length} 个数据库类型`;

            if (checkedDbs.length === 0) {
                mappingContainer.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">请先在"DDL生成器"页面选择目标数据库类型</p>';
                return;
            }

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
                            <div class="type-wrapper">
                                <div style="flex: 1; min-width: 0;">
                                    <label>目标类型</label>
                                    <select data-field="dataType" onchange="toggleTypeConfig(this, '${dbType}', ${index})" style="width: 100%;">
                                        ${typeOptions.map(opt => `<option value="${opt}" ${rule.dataType === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                                    </select>
                                </div>
                                ${renderTypeConfigInline(dbType, rule.dataType, rule)}
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

        // 判断类型是否需要配置
        function hasTypeConfig(dataType) {
            const upperType = dataType.toUpperCase();
            return upperType.includes('VARCHAR') || upperType.includes('CHAR') ||
                   upperType.includes('DECIMAL') || upperType.includes('NUMERIC') ||
                   upperType.includes('FLOAT') || upperType.includes('DOUBLE');
        }

        // 渲染内联类型配置（与类型选择框在同一行）
        function renderTypeConfigInline(dbType, dataType, rule) {
            const upperType = dataType.toUpperCase();

            if (upperType.includes('DECIMAL') || upperType.includes('NUMERIC')) {
                // DECIMAL 类型：精度和小数位
                const precision = rule.precision || 24;
                const scale = rule.scale || 6;
                return `
                    <div style="display: flex; gap: 6px; align-items: flex-end;">
                        <div style="flex: 1;">
                            <input type="number" class="type-config-input" data-field="precision" value="${precision}" min="1" max="65" placeholder="精度">
                        </div>
                        <div style="flex: 1;">
                            <input type="number" class="type-config-input" data-field="scale" value="${scale}" min="0" max="30" placeholder="小数位">
                        </div>
                    </div>
                `;
            } else if (upperType.includes('VARCHAR') || upperType.includes('CHAR')) {
                // VARCHAR/CHAR 类型：长度
                const length = rule.length || 255;
                return `
                    <div style="flex: 0 0 80px;">
                        <input type="number" class="type-config-input" data-field="length" value="${length}" min="1" max="65535" placeholder="长度">
                    </div>
                `;
            } else if (upperType.includes('FLOAT') || upperType.includes('DOUBLE')) {
                // FLOAT/DOUBLE 类型：精度（可选）
                const precision = rule.precision || '';
                return `
                    <div style="flex: 0 0 80px;">
                        <input type="number" class="type-config-input" data-field="precision" value="${precision}" min="1" max="255" placeholder="精度">
                    </div>
                `;
            }

            return '';
        }

        // 切换类型配置显示
        function toggleTypeConfig(selectElement, dbType, index) {
            // 更新规则中的dataType
            const rule = customRules[dbType][index];
            rule.dataType = selectElement.value;

            // 重新渲染整个规则列表以显示/隐藏类型配置
            renderMappings();
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

                // 收集类型配置参数
                const precisionInput = item.querySelector('[data-field="precision"]');
                const scaleInput = item.querySelector('[data-field="scale"]');
                const lengthInput = item.querySelector('[data-field="length"]');

                const keywords = keywordInput.value.split(',').map(k => k.trim()).filter(k => k);

                const rule = {
                    keywords: keywords,
                    matchType: matchTypeSelect.value,
                    targetField: targetFieldSelect.value,
                    dataType: dataTypeSelect.value,
                    priority: parseInt(priorityInput.value) || 999
                };

                // 添加类型配置参数
                if (precisionInput && precisionInput.value) {
                    rule.precision = parseInt(precisionInput.value);
                }
                if (scaleInput && scaleInput.value) {
                    rule.scale = parseInt(scaleInput.value);
                }
                if (lengthInput && lengthInput.value) {
                    rule.length = parseInt(lengthInput.value);
                }

                customRules[dbType][index] = rule;
            });

            return customRules;
        }

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

            // 提示用户可以使用规则管理器配置推断规则
            const hasRules = Object.keys(customRules).some(dbType => dbTypes.includes(dbType));
            if (!hasRules) {
                console.log('提示：可以在"规则管理器"标签页中配置字段类型推断规则');
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
