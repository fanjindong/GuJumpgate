# GuJumpgate 使用说明

GuJumpgate 是我在 fork 开源项目后继续二次开发的 Chrome 扩展。当前版本聚焦一个主流程：使用已有 ChatGPT 账号登录，并自动推进 Plus 订阅、支付处理和成功状态确认。

本仓库当前维护的是 **已有账户 Plus 新流程**。旧的自动注册 Free 账号、手机号注册、多注册迁移、贡献模式和旧面板入口已经不再作为当前功能维护。

> [!IMPORTANT]
> 侧边栏中的 `Plus 模式` 已固定开启。启动前必须填写 `账户 JSON`，扩展会使用该账号登录并继续 Plus 订阅链路。
>
> 必须在全局美国节点前提下使用。运行前请确认浏览器访问 ChatGPT、OpenAI 认证页、PayPal 和支付转换链路时都走美国出口；不要使用规则分流、局部代理或非美国节点，避免登录、Checkout 和支付页面因出口地区不一致而失败。


## 项目演示

> 点击播放视频

<video src="./demo.mp4" controls width="100%"></video>

## 适用场景

- 已经有可登录的 ChatGPT 账号。
- 账号登录时可以通过接口获取邮箱验证码。
- 需要把登录、创建 Plus Checkout、支付确认和结果记录串成可恢复流程。
- 希望在 Chrome 扩展侧边栏中观察每一步状态、日志和账号运行记录。
- 已准备全局美国节点，并确认浏览器所有相关流量都经过美国出口。

## 当前支持的支付链路

| 支付方式 | 说明 | 主要配置 |
|---|---|---|
| `PayPal` | 当前唯一支持的 Plus 支付链路，默认使用 Hosted Checkout 分段流程。 | PayPal 账号、云端支付转换、验证码接口、号码池、弹窗等待时间。 |

PayPal 默认推荐开启 `云端支付转换`。关闭云端转换后，才会使用本地支付转换代理。

## 安装扩展

### 1. 下载或准备扩展目录

可以从本仓库的 [Releases](https://github.com/FoundZiGu/GuJumpgate/releases) 下载压缩包并解压，也可以直接使用本仓库根目录作为未打包扩展目录。

当前扩展是 Manifest V3 Chrome 扩展，根目录中已经包含 `manifest.json`。本仓库根目录没有前端构建脚本，日常使用不需要执行 `npm install` 或打包命令。

### 2. 加载到 Chrome

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择解压后的扩展目录，或选择本仓库根目录。

![加载未打包的扩展程序](docs/images/readme-load-extension.webp)

### 3. 开启无痕权限

进入扩展详情页，开启“在无痕模式下启用”。当前流程会创建和清理自动运行窗口，无痕权限可以减少历史会话对登录、支付和验证码页面的影响。

![启用扩展的无痕模式权限](docs/images/readme-incognito-permission.webp)

### 4. 打开侧边栏

点击扩展图标，打开 GuJumpgate 侧边栏。后续配置、启动、停止、日志查看和账号记录都在侧边栏完成。

## 配置账户 JSON

侧边栏第一项是 `账户 JSON`。必须填写已有 ChatGPT 账号邮箱、密码和验证码接口地址：

```json
{
  "email": "name@example.com",
  "password": "your-password",
  "mailbox_url": "https://example.com/latest-code"
}
```

字段说明：

| 字段 | 是否必填 | 含义 |
|---|---|---|
| `email` | 是 | 已有 ChatGPT 账号邮箱。 |
| `password` | 是 | 已有 ChatGPT 账号密码。 |
| `mailbox_url` | 是 | 登录验证码接口地址，仅支持 `http` 或 `https`。 |

验证码接口返回值只要能解析到下面任意一种结构即可：

```json
{ "code": "123456" }
```

```json
{ "data": { "code": "123456" } }
```

```json
{ "result": { "code": "123456" } }
```

## 配置 PayPal 支付

当前版本只支持 `PayPal`。如果界面或旧文档中还能看到 GoPay、GPC 相关字段，请不要按当前可用能力理解；它们不属于现行支持链路。

选择 `Plus 支付` 为 `PayPal` 后，按需要配置：

- `PayPal 账号`：用于 Hosted Checkout 的 PayPal 登录信息。
- `云端支付转换`：开启后由云端服务生成 Checkout 链接。
- `支付转换代理`：仅在关闭云端支付转换后用于本地转换链路。
- `验证码接口`：PayPal Hosted Checkout 需要短信验证码时使用。
- `PayPal 电话` 或号码池：用于 Hosted Checkout 中的电话验证。
- `弹窗等待时间`：检测到验证码弹窗后，等待指定秒数再开始取码，默认 20 秒。

PayPal 默认步骤：

1. 打开 ChatGPT 官网。
2. 登录已有账户。
3. 获取登录验证码。
4. 创建 Plus Checkout。
5. 填写 Hosted Checkout。
6. 处理 PayPal Hosted 支付。
7. 确认 Plus 开通成功。

## 开始自动运行

1. 在侧边栏填写并保存 `账户 JSON`。
2. 确认 `Plus 支付` 为 `PayPal`。
3. 补齐 PayPal Hosted 相关配置。
4. 确认当前浏览器处于全局美国节点环境。
5. 如需代理、云端转换或本地 helper，先确认对应服务可用。
6. 设置运行次数。
7. 点击 `自动`。

运行过程中，侧边栏会显示当前步骤、日志、失败原因和账号记录。点击停止后，旧倒计时、旧恢复入口和旧重试任务不会重新拉起已经停止的自动流程。

## 更新扩展

使用压缩包安装时：

1. 下载新版本压缩包并解压。
2. 打开 `chrome://extensions/`。
3. 找到 GuJumpgate。
4. 点击“重新加载”，或删除旧扩展后重新加载新目录。

直接使用仓库目录开发时：

1. 拉取或切换到新代码。
2. 打开 `chrome://extensions/`。
3. 点击 GuJumpgate 卡片上的“重新加载”。

扩展代码变更后必须重新加载扩展，否则后台 Service Worker 和内容脚本可能仍然使用旧版本。

## 常见问题

### 账户 JSON 校验失败

检查 JSON 是否为合法格式，并确认 `email`、`password`、`mailbox_url` 都存在。`mailbox_url` 必须是 `http` 或 `https` 地址。

### 登录验证码获取失败

先在浏览器中直接访问 `mailbox_url`，确认接口能返回验证码。返回内容中需要包含 `code`、`data.code` 或 `result.code`。

### PayPal 没有使用本地支付转换代理

确认是否开启了 `云端支付转换`。云端转换开启时，本地支付转换代理会自动停用。

### 修改代码后页面行为没有变化

重新加载扩展，并关闭旧的自动运行窗口后再重新启动。Manifest V3 的后台 Service Worker 和内容脚本不会因为本地文件变化自动刷新。

## 开发者参考

- [项目完整链路说明](项目完整链路说明.md)：当前已有账户 Plus 主流程说明。
- [项目文件结构说明](项目文件结构说明.md)：仓库模块和文件职责索引。
- [使用教程索引](docs/使用教程/使用教程.md)：拆分后的中文教程入口。
- [支付转换服务说明](services/checkout-converter/README.md)：云端支付转换服务接口与部署方式。
- [项目开发规范（AI协作）](项目开发规范（AI协作）.md)：本仓库中文协作与代码生成约束。

## 来源与许可

本项目基于开源项目 [QLHazyCoder/FlowPilot](https://github.com/QLHazyCoder/FlowPilot) fork 后继续修改、移植和二次开发，部分早期代码与 [whwh1233/StepFlow-Duck](https://github.com/whwh1233/StepFlow-Duck) 具有共同历史。

原项目及相关开源部分采用 MIT License。使用、修改和分发时，请保留原版权声明和许可声明。

当前维护版本中的流程调整、脚本移植、支付链路适配和中文文档整理内容，由当前维护者继续维护。

## 使用提醒

使用者应自行确认目标平台服务条款、适用法律和所在地区监管要求。请勿把账号密码、API Key、验证码接口和支付信息提交到不可信环境。运行时必须使用全局美国节点，避免同一流程中出现不同地区出口。
