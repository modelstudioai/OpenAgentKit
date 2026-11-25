# 接入 Kit Server 数据库

Kit Server 每次启动选择一种存储后端。本地开发默认使用 SQLite。已有专用 MySQL 或
PostgreSQL 实例时，通过服务端配置接入该库。

先核对当前项目的 `apps/server/README.md` 和服务进程的配置来源。使用仓库启动命令时，
配置在仓库根目录的 `.env`。部署时可由进程环境提供相同变量。已有配置满足目标时直接复用。
用户要求切库时，只调整与所选数据库有关的配置项；其余配置照常使用。连接凭据通过本地配置或
部署环境注入，输出中用占位符表示。

## SQLite

Node.js 24 提供内置的 `node:sqlite`。未配置驱动时自动使用 SQLite。下面是显式配置。

```dotenv
KIT_DB_DRIVER=sqlite
KIT_DATA_DIR=.data
```

库文件为 `KIT_DATA_DIR/kit.sqlite`，相对数据目录以**服务进程的工作目录**为基准。
接续已有 SQLite 时，指向现有 `kit.sqlite` 所在目录，确认启动方式变化后仍解析到同一路径。

## MySQL

使用 MySQL 8.4 和 InnoDB。预先准备 Kit 专用数据库与应用账号，确保账号可以在目标库中
执行建表、建索引、迁移变更和日常读写。

```dotenv
KIT_DB_DRIVER=mysql
KIT_DATABASE_URL=mysql://kit_user:password@127.0.0.1:3306/kit
```

## PostgreSQL

预先准备 Kit 专用数据库与应用账号，确保账号可以在连接使用的 schema 中执行建表、
建索引、迁移变更和日常读写。`pg` 是 `KIT_DB_DRIVER=postgres` 的别名。

```dotenv
KIT_DB_DRIVER=postgres
KIT_DATABASE_URL=postgresql://kit_user:password@127.0.0.1:5432/kit
```

MySQL 和 PostgreSQL 示例的用户名、密码、地址、端口和库名均按实际配置替换。
用户名或密码中的 URL 保留字符需要百分号编码。连接 URL 支持 `?ssl=true` 开启 TLS 并
校验服务端证书。

## 启动与验证

1. 确认目标库。启动会在空库初始化表结构，在已有库按各自的 `_kit_migrations` 记录补齐待执行迁移。
   切换后端后，服务使用目标库自己的数据。需要搬迁已有记录时，单独确认源库、目标库和迁移方式。
2. 从仓库根目录运行 `pnpm start server`。首次运行先执行 `pnpm install`。已有配置的开发启动
   也可用 `pnpm dev server`。启动时沿用用户当前选择的 Provider 模式。
3. 从启动日志确认 `db=sqlite`、`db=mysql` 或 `db=postgres`，并使用实际监听端口检查
   健康接口。默认端口的检查命令如下。

   ```bash
   curl -fsS http://127.0.0.1:8787/healthz
   ```

4. 需要核对迁移时，在目标库读取 `_kit_migrations`，用完整迁移 ID 核对已应用版本。
   需要验证业务读写时，通过正常的 Kit 接口在专用测试库写入一条测试数据并读回。

启动失败时，按报错核对连接 URL、网络连通性、目标库权限或 TLS 证书。迁移失败时，保留
目标库和迁移记录，报告失败版本及结构差异，便于后续核对和恢复。
