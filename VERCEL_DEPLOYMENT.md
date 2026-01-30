# Vercel 部署详细方案

## 项目信息

- **项目名称**: SQL 建表语句生成器
- **技术栈**: Next.js 16 + React 19 + TypeScript
- **依赖情况**: 已清理完毕，仅保留核心依赖

## 一、前置准备

### 1. 确保代码已提交到 Git

```bash
# 检查 git 状态
git status

# 添加所有修改的文件
git add .

# 提交代码
git commit -m "chore: 清理未使用的依赖，为 Vercel 部署做准备"

# 推送到 GitHub（确保已有远程仓库）
git push origin main
```

### 2. 检查 GitHub 仓库

确保代码已推送到 GitHub 仓库（如 `https://github.com/your-username/sql-ddl-generator`）

## 二、Vercel 部署步骤

### 方式一：通过 Vercel 网站部署（推荐新手）

#### 步骤 1：注册/登录 Vercel

1. 访问 [https://vercel.com](https://vercel.com)
2. 使用 GitHub、GitLab 或 Bitbucket 账号登录

#### 步骤 2：创建新项目

1. 登录后点击 "Add New" → "Project"
2. Vercel 会自动扫描你的 GitHub 仓库
3. 找到 `sql-ddl-generator` 项目，点击 "Import"

#### 步骤 3：配置项目

Vercel 会自动识别为 Next.js 项目，配置如下：

**Framework Preset**: Next.js

**Project Settings**:

```
Project Name: sql-ddl-generator
Root Directory: ./
Build Command: pnpm run build
Output Directory: .next
Install Command: pnpm install
```

**Environment Variables**: 无需配置

#### 步骤 4：部署

1. 点击 "Deploy" 按钮
2. 等待约 1-2 分钟，Vercel 会自动：
   - 安装依赖（pnpm install）
   - 构建项目（pnpm run build）
   - 部署到全球 CDN

3. 部署完成后会获得一个预览 URL，如：
   ```
   https://sql-ddl-generator.vercel.app
   ```

#### 步骤 5：配置自定义域名（可选）

1. 进入项目设置 → "Domains"
2. 添加你的域名（如 `ddl.yourdomain.com`）
3. 按照提示配置 DNS 记录

---

### 方式二：通过 Vercel CLI 部署

#### 步骤 1：安装 Vercel CLI

```bash
# 使用 npm
npm install -g vercel

# 或使用 pnpm
pnpm add -g vercel
```

#### 步骤 2：登录 Vercel

```bash
vercel login
```

按照提示输入邮箱和密码，或使用 GitHub 账号登录。

#### 步骤 3：部署项目

```bash
# 在项目根目录执行
vercel
```

按照提示操作：
- ? Set up and deploy `~/projects`? [Y/n] `Y`
- ? Which scope do you want to deploy to? `选择你的账号`
- ? Link to existing project? [y/N] `N`
- ? What's your project's name? `sql-ddl-generator`
- ? In which directory is your code located? `./`
- ? Want to modify these settings? [y/N] `N`

#### 步骤 4：生产环境部署

```bash
# 部署到生产环境
vercel --prod
```

---

## 三、Vercel 配置文件（可选）

如果需要自定义配置，可以在项目根目录创建 `vercel.json`：

```json
{
  "buildCommand": "pnpm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "pnpm install",
  "devCommand": "pnpm run dev",
  "regions": ["hkg1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

---

## 四、常见问题

### 1. 构建失败：找不到 pnpm

**解决方案**：在 Vercel 项目设置中添加环境变量

```
NPM_FLAGS: --legacy-peer-deps
NODE_VERSION: 20
```

### 2. 依赖安装失败

**解决方案**：在 `package.json` 中添加 `engines` 字段：

```json
{
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

### 3. 部署后 500 错误

**解决方案**：检查 Vercel 日志

1. 进入项目 → "Logs" 标签
2. 查看最近的部署日志
3. 检查是否有运行时错误

---

## 五、部署后验证

### 1. 检查部署状态

访问 Vercel 项目仪表板，确认：
- ✅ 构建成功（绿色勾）
- ✅ 部署成功（绿色勾）
- ✅ 所有功能正常

### 2. 测试 API 端点

```bash
# 测试 DDL 生成 API
curl -X POST https://your-domain.vercel.app/api/generate-ddl \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT user_id AS id, -- 用户ID\n  user_name AS name -- 用户名称\nFROM users","databaseTypes":["spark"]}'
```

### 3. 测试前端功能

1. 访问部署后的网站
2. 测试 SQL 输入和 DDL 生成功能
3. 测试规则管理器的保存/加载功能
4. 测试多个数据库类型的 DDL 生成

---

## 六、性能优化建议

### 1. 启用 Edge Functions（可选）

对于简单的 API，可以使用 Edge Functions 加速响应：

```typescript
// src/app/api/generate-ddl/route.ts
export const runtime = 'edge';
```

### 2. 配置 CDN 缓存

```typescript
// src/app/api/generate-ddl/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
```

### 3. 压缩静态资源

Vercel 默认启用了 gzip 和 brotli 压缩，无需额外配置。

---

## 七、持续集成/持续部署（CI/CD）

Vercel 会自动配置 GitHub 集成，每次推送代码到 `main` 分支时会自动部署。

### 配置部署分支

在 Vercel 项目设置中：
- Production Branch: `main`
- Preview Branch: `*`（所有其他分支）

### 配置自动部署触发条件

- 推送到 `main` 分支 → 生产环境部署
- 推送到其他分支 → 预览环境部署
- 创建 Pull Request → 预览环境部署

---

## 八、监控和日志

### 查看部署日志

1. 进入项目仪表板
2. 点击 "Deployments" 标签
3. 点击具体的部署记录
4. 查看 "Build Logs" 和 "Function Logs"

### 配置告警

在项目设置中配置：
- 部署失败告警（邮件/Slack）
- 错误率告警
- 性能告警

---

## 九、费用说明

Vercel 免费额度：

- ✅ 100GB 带宽/月
- ✅ 6,000 分钟构建时间/月
- ✅ 无限项目数量
- ✅ 自动 HTTPS
- ✅ 全球 CDN
- ✅ Serverless Functions

对于你的项目（SQL 建表语句生成器），免费额度完全足够。

---

## 十、总结

### 部署流程概览

```
1. 推送代码到 GitHub
   ↓
2. 在 Vercel 导入项目
   ↓
3. 配置项目（自动识别 Next.js）
   ↓
4. 点击部署
   ↓
5. 等待 1-2 分钟
   ↓
6. 访问 https://your-domain.vercel.app
```

### 关键优势

- ✅ 零配置部署
- ✅ 自动 HTTPS
- ✅ 全球 CDN 加速
- ✅ 免费额度充足
- ✅ 自动 CI/CD
- ✅ 实时日志和监控

---

## 附录：完整 package.json

当前项目的 `package.json`（已清理所有未使用依赖）：

```json
{
  "name": "sql-ddl-generator",
  "version": "1.1.0",
  "private": true,
  "scripts": {
    "build": "bash ./scripts/build.sh",
    "dev": "bash ./scripts/dev.sh",
    "preinstall": "npx only-allow pnpm",
    "lint": "eslint",
    "start": "bash ./scripts/start.sh",
    "ts-check": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "next": "16.1.1",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.1",
    "only-allow": "^1.2.2",
    "tailwindcss": "^4",
    "typescript": "^5"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "pnpm": ">=9.0.0"
  },
  "pnpm": {
    "overrides": {
      "esbuild": "^0.25.12"
    }
  }
}
```

---

## 下一步

1. 将代码推送到 GitHub
2. 按照上述步骤部署到 Vercel
3. 部署完成后访问你的应用
4. （可选）配置自定义域名

如有任何问题，请查看 [Vercel 官方文档](https://vercel.com/docs)。
