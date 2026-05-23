# 第七部分：已有账户 Plus 流程说明

## 部分信息

- `section_slug`: `existing-account-chatgpt-plus`
- `适用主题`: `已有账户`、`ChatGPT Plus`、`PayPal Hosted`、`GoPay`、`GPC`
- `维护方式`: `直接更新本文件`

## 适用场景

- 已经有一个可登录的 ChatGPT 账号。
- 想通过 GuJumpgate 自动完成 Plus 订阅链路。
- 需要了解侧边栏中 PayPal Hosted、GoPay、GPC 三种支付方式怎么配置。

## 准备内容

1. 一个已有 ChatGPT 账号。
2. 账号邮箱、密码和验证码接口。
3. 可用的支付方式：
   - PayPal Hosted
   - GoPay
   - GPC
4. 已安装并启用无痕权限的 GuJumpgate 扩展。

## 账户 JSON

侧边栏第一项是 `账户 JSON`。格式如下：

```json
{
  "email": "name@example.com",
  "password": "your-password",
  "mailbox_url": "https://example.com/latest-code"
}
```

字段说明：

- `email`：已有 ChatGPT 账号邮箱。
- `password`：已有账号密码。
- `mailbox_url`：验证码接口地址。

验证码接口返回中只要能解析到下面任意一种字段即可：

```json
{ "code": "123456" }
```

```json
{ "data": { "code": "123456" } }
```

```json
{ "result": { "code": "123456" } }
```

## PayPal Hosted 配置

PayPal Hosted 是当前默认推荐链路。

需要关注的配置：

- `云端支付转换`：推荐开启。
- `支付转换代理`：只有关闭云端支付转换后才会生效。
- `验证码接口`：PayPal Hosted 页面出现验证码弹窗时使用。
- `弹窗延迟`：检测到验证码弹窗后，等待多少秒再获取验证码。
- `PayPal 电话`：用于 Hosted Checkout 中的电话字段。
- `Hosted 接码池`：批量导入号码和验证码接口时使用。

默认步骤：

1. 打开 ChatGPT 官网。
2. 登录已有账户。
3. 获取登录验证码。
4. 创建 Plus Checkout。
5. 填写 Hosted Checkout。
6. 处理 PayPal Hosted 支付。
7. Plus 开通成功。

## GoPay 配置

选择 `GoPay` 后，需要填写：

- `GoPay 区号`
- `GoPay 手机`
- `GoPay 验证码`
- `GoPay PIN`

如果运行时需要手动确认，侧边栏会弹出确认入口。真实 OTP 和 PIN 只应通过侧边栏输入，不要写入文档或代码。

## GPC 配置

选择 `GPC` 后，需要填写：

- `GPC API`
- `GPC API Key`
- `GPC 模式`
- `GPC 手机`
- `GPC OTP`
- `本地短信 helper`
- `GPC PIN`

自动模式由远端任务处理手机号和验证码；手动模式需要你按侧边栏提示补充 OTP 或 PIN。

## 开始运行

1. 填写账户 JSON。
2. 选择 Plus 支付方式。
3. 补齐对应支付方式的配置。
4. 点击保存。
5. 设置运行次数。
6. 点击 `自动`。

运行中可通过日志区查看当前节点、错误原因和是否进入重试。

## 常见问题

### 为什么点击自动前提示账户 JSON 无效？

通常是缺少 `email`、`password` 或 `mailbox_url`，也可能是 `mailbox_url` 不是有效的 `http` / `https` 地址。

### 为什么验证码接口返回了内容但扩展识别不到？

请确认返回里有 `code`、`data.code` 或 `result.code`，且验证码是 4 到 8 位数字。

### 云端支付转换和本地支付转换代理能同时生效吗？

不能。开启云端支付转换后，本地支付转换代理会自动停用。

### 停止后为什么没有继续跑旧任务？

当前自动运行会绑定会话标识。用户停止后，旧倒计时、旧恢复入口和旧重试链路都不会重新拉起已经停止的流程。
