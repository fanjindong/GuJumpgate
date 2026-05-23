# GuJumpgate

GuJumpgate 是一个 Chrome 扩展，用于把“已有 ChatGPT 账号登录、Plus 订阅、支付页处理、成功状态确认”串成可恢复的自动化流程。

当前项目只有 **已有账户 Plus 新流程**。旧的自动注册 Free 账号流程、手机号注册流程、多注册迁移设计和独立贡献流程已经不再作为当前功能维护。

> [!IMPORTANT]
> 侧边栏中的 `Plus 模式` 已固定开启。启动前必须填写 `账户 JSON`，流程会使用该账号登录并继续 Plus 订阅链路。

## 当前能力

1. **已有账户登录**

   读取 `账户 JSON` 中的邮箱、密码和验证码接口，自动打开 ChatGPT / OpenAI 认证页并登录已有账号。

2. **登录验证码自动获取**

   `mailbox_url` 用于拉取登录验证码。接口返回中只要能解析到 `code`、`data.code` 或 `result.code` 即可。

3. **Plus Checkout 创建**

   支持云端支付转换服务生成 Checkout 链接；关闭云端转换后，可回退到本地页面创建 Checkout。

4. **支付方式**

   - `PayPal`：默认走 Hosted Checkout 分段流程，支持验证码接口、号码池、弹窗延迟和成功后等待。
   - `GoPay`：支持手机号、OTP 和 PIN 配置。
   - `GPC`：支持 API 地址、API Key、自动/手动手机号模式、OTP 渠道、本地短信 helper 与 PIN。

5. **运行记录与恢复**

   自动运行绑定会话标识；停止后旧倒计时和旧重试不会重新拉起流程。侧边栏保留日志、步骤状态、账号记录和更新提示。

6. **辅助能力**

   仍保留 IP 代理、账号记录本地同步、iCloud / 2925 / Hotmail 等辅助模块，主要服务历史配置兼容、验证码读取或本地工具能力；它们不是当前主流程入口。

## 账户 JSON

侧边栏第一项是 `账户 JSON`，格式如下：

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
- `mailbox_url`：验证码接口地址，必须是 `http` 或 `https`。

## 安装与使用

### 1. 下载扩展

到本仓库的 [Releases](https://github.com/FoundZiGu/GuJumpgate/releases) 页面下载扩展压缩包并解压。

### 2. 加载扩展

打开 `chrome://extensions/`，开启开发者模式，选择“加载已解压的扩展程序”，然后选择解压出的扩展目录。

![加载未打包的扩展程序](docs/images/readme-load-extension.webp)

### 3. 启用无痕权限

在扩展详情页中勾选“在无痕模式下启用”。

![启用扩展的无痕模式权限](docs/images/readme-incognito-permission.webp)

### 4. 配置账户与支付

打开侧边栏，填写 `账户 JSON`，选择 `Plus 支付` 方式，并按所选支付方式补齐配置。

PayPal 默认推荐开启 `云端支付转换`。如需本地转换，关闭云端转换后再填写本地支付转换代理。

### 5. 启动本地 helper

如需账号记录快照同步或本地辅助接口，请启动解压目录中的脚本：

- Windows：`start-hotmail-helper.bat`
- macOS：`start-hotmail-helper.command`

### 6. 开始运行

确认配置保存后，设置运行次数并点击 `自动`。流程会按当前支付方式显示对应步骤，并在日志区输出结构化状态。

## 当前步骤

PayPal Hosted Checkout 默认步骤：

1. 打开 ChatGPT 官网
2. 登录已有账户
3. 获取登录验证码
4. 创建 Plus Checkout
5. 填写 Hosted Checkout
6. 处理 PayPal Hosted 支付
7. Plus 开通成功

GoPay / GPC 会把支付中段替换为对应订阅确认或任务等待步骤，但入口仍是已有账户 Plus 流程。

## 文档

- [项目完整链路说明.md](项目完整链路说明.md)：面向开发者的当前主流程说明。
- [项目文件结构说明.md](项目文件结构说明.md)：当前仓库模块和文件职责索引。
- [docs/使用教程/使用教程.md](docs/使用教程/使用教程.md)：拆分后的中文教程索引。
- [services/checkout-converter/README.md](services/checkout-converter/README.md)：云端支付转换服务说明。

## 来源说明

本项目基于开源项目 [QLHazyCoder/FlowPilot](https://github.com/QLHazyCoder/FlowPilot) 进行修改、移植与二次开发，其部分早期代码与 [whwh1233/StepFlow-Duck](https://github.com/whwh1233/StepFlow-Duck) 具有共同历史。

原项目及其相关开源部分采用 MIT License 发布。根据 MIT License，你可以在保留原版权声明和许可声明的前提下使用、修改、分发本项目的相关代码。

当前维护版本的新增适配、流程调整、脚本移植与文档整理内容，除另有说明外，均由当前维护者负责。

## 使用提示

使用者应自行遵守目标平台服务条款、适用法律及其所在地区监管要求。
