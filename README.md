# 3M-CFL 课题组管理系统

3M-CFL 课题组内部信息管理系统，当前恢复版本为 V34。系统覆盖科研管理、人才培养、成果管理、社会服务、仪器设备、经费、待办、数据纠错和权限配置等业务模块。

## 技术栈

- 前端：React、TypeScript、Vite、Tailwind CSS
- 服务端：Hono、tRPC、Drizzle ORM
- 数据库：MySQL / TiDB
- 附件：平台对象存储（数据库仅保存对象键）

## 本地恢复与启动

要求 Node.js 22 和可用的 MySQL / TiDB 数据库。

```bash
npm ci
cp .env.example .env
```

在 `.env` 中填写实际的数据库和平台配置。`.env` 已被 Git 排除，不得提交真实凭据。

```bash
npm run db:migrate
npm run dev
```

开发服务默认运行在 `http://localhost:3000`。

仅在需要初始化演示数据的新数据库中执行：

```bash
npx tsx db/seed.ts
```

## 检查与生产构建

```bash
npm run check
npm run test
npm run build
npm start
```

生产入口为 `dist/boot.js`，服务端依赖已打包进该文件。项目根目录的 `Dockerfile` 也可用于构建运行镜像。

## Git 备份与恢复

日常完成一组修改后提交并推送：

```bash
git status
git add .
git commit -m "说明本次修改"
git push origin main
```

在新机器恢复源码：

```bash
git clone https://github.com/cyrilsilhouette628/3M-CFL-Laboratory-Management-System.git
cd 3M-CFL-Laboratory-Management-System
npm ci
cp .env.example .env
```

随后重新配置 `.env`，并对目标数据库执行 `npm run db:migrate`。

## 数据安全边界

Git 仓库备份源代码、数据库结构和迁移记录，不备份真实业务数据库、对象存储中的附件或 `.env` 凭据。正式使用时应另行制定数据库和对象存储备份策略。公开仓库中不得提交密码、访问令牌、真实业务数据或用户附件。
