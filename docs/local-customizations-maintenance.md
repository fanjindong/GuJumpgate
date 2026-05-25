# 本地定制维护说明

本文记录当前仓库相对历史上游需要长期保留的本地能力。当前主线已经收敛为 **已有账户 Plus 新流程**，维护时不要把旧注册链路重新作为产品入口恢复。

## 快速结论

后续同步或整理代码时，需要优先保留以下能力：

1. 已有账户 JSON 登录。
2. PayPal Hosted Checkout 分段流程。
3. 云端支付转换服务接入。
4. 全局美国节点作为运行前置条件。
5. 账号运行记录和本地 helper 快照同步。
6. IP 代理配置和出口检测。
7. 操作间延迟、步间延迟和自动运行停止保护。

推荐每次同步后执行：

```bash
git diff --check
node --check background.js
node --check data/step-definitions.js
node --check sidepanel/sidepanel.js
```

## 1. 已有账户 JSON 登录

### 目标

侧边栏只要求用户填写一个账户 JSON：

```json
{
  "email": "name@example.com",
  "password": "your-password",
  "mailbox_url": "https://example.com/latest-code"
}
```

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `shared/existing-account.js` | 校验账户 JSON，确保邮箱、密码、验证码接口可用。 |
| `sidepanel/sidepanel.js` | 启动自动运行前校验账户 JSON。 |
| `background/steps/existing-account-login.js` | 登录已有账号。 |
| `background/steps/fetch-existing-login-code.js` | 拉取并提交登录验证码。 |

### 维护注意

不要重新引入邮箱生成、密码生成、资料填写等旧注册入口。当前流程的身份来源必须是用户提供的已有账户 JSON。

## 2. PayPal Hosted Checkout

### 目标

PayPal 默认使用 Hosted Checkout 分段节点：

1. `plus-checkout-create`
2. `hosted-checkout-submit`
3. `hosted-paypal-payment`
4. `plus-activation-success`

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `data/step-definitions.js` | 定义 PayPal Hosted 默认步骤。 |
| `background/steps/create-plus-checkout.js` | 创建 Checkout、提交 Hosted 页面、处理 PayPal Hosted 支付。 |
| `content/plus-checkout.js` | Checkout 页面操作和会话读取。 |
| `content/paypal-flow.js` | PayPal Hosted 页面识别和操作。 |
| `sidepanel/hosted-sms-pool-manager.js` | Hosted 接码池管理。 |

### 维护注意

云端支付转换开启时，本地支付转换代理不应生效。关闭云端转换后，才允许走本地创建 Checkout 路径。

PayPal Hosted 当前只支持全局美国节点环境。维护文档、教程和错误提示都应把美国出口作为前置条件，而不是可选优化项。

## 3. 云端支付转换服务

### 目标

扩展通过 `services/checkout-converter` 服务生成 Plus Checkout 链接，减少本地网络和页面环境差异。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `services/checkout-converter/app.py` | 云端支付转换服务主程序。 |
| `services/checkout-converter/README.md` | 部署和接口说明。 |
| `background/steps/create-plus-checkout.js` | 调用云端服务并处理返回结果。 |
| `sidepanel/sidepanel.js` | 保存云端转换开关和本地转换代理配置。 |

### 维护注意

不要把真实 `accessToken` 写入日志。生产环境必须配置 `CHECKOUT_CONVERTER_API_KEY`。

## 4. 历史支付链路边界

当前只支持 PayPal Hosted。GoPay 与 GPC 相关文件如果仍存在，只能作为历史兼容或后续清理对象，不应重新写入 README、使用教程或公告中的当前能力列表。

## 5. 自动运行与停止保护

### 目标

自动运行必须能稳定处理多轮执行、停止、失败跳过和旧异步任务失效。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `background/auto-run-controller.js` | 自动运行控制器。 |
| `background/workflow-engine.js` | 节点状态和下一节点解析。 |
| `background/runtime-state.js` | 运行态分组和扁平状态兼容。 |
| `background/tab-runtime.js` | 标签页等待、注入和 Stop 感知。 |
| `sidepanel/sidepanel.js` | 自动运行启动和停止按钮逻辑。 |

### 维护注意

用户停止后，旧的倒计时、旧的 Checkout 重建任务、旧的节点完成信号都不能继续推进当前自动运行。

## 6. 账号记录与本地 helper

### 目标

账号运行记录默认保存在本地配置中；如果 helper 可用，则同步一份 JSON 快照。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `background/account-run-history.js` | 账号记录归一化和保存。 |
| `sidepanel/account-records-manager.js` | 账号记录 UI。 |
| `scripts/hotmail_helper.py` | 本地快照同步接口。 |
| `start-hotmail-helper.bat` | Windows 启动脚本。 |
| `start-hotmail-helper.command` | macOS 启动脚本。 |

### 维护注意

helper 不可用时应静默跳过快照同步，不能阻塞主流程。

## 7. IP 代理

### 目标

保留扩展内代理配置、PAC 应用、代理鉴权和出口检测能力。

### 关键文件

| 文件 | 作用 |
| --- | --- |
| `background/ip-proxy-core.js` | 代理核心逻辑。 |
| `background/ip-proxy-provider-711proxy.js` | 711Proxy provider 规则。 |
| `sidepanel/ip-proxy-panel.js` | 代理 UI 和状态展示。 |
| `sidepanel/ip-proxy-provider-711proxy.js` | 711Proxy 输入辅助。 |

### 维护注意

出口检测失败时要 fail-close，不能在目标站点继续裸连。

## 8. 文档同步要求

涉及以下变化时必须同步更新文档：

- 当前步骤定义变化。
- 账户 JSON 字段变化。
- PayPal Hosted 配置变化。
- 全局美国节点前置条件变化。
- 云端支付转换接口变化。
- 自动运行停止、重试、恢复语义变化。
- 文件新增、删除、重命名。

优先更新：

- `README.md`
- `项目完整链路说明.md`
- `项目文件结构说明.md`
- `docs/使用教程/使用教程.md`
- `services/checkout-converter/README.md`
