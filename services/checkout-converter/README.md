# 支付转换服务说明

本服务把扩展里的 Plus Checkout 创建逻辑拆成可独立部署的云端服务。扩展开启 `云端支付转换` 后，会把当前 ChatGPT `accessToken` 发送到该服务，由服务端生成可用的 Plus Checkout 链接。

## 能力范围

- 接收 ChatGPT `accessToken`。
- 按当前项目规则创建 Plus Checkout。
- 返回 ChatGPT Checkout 链接和 PayPal Hosted Checkout 链接。
- 通过 `X-API-Key` 做简单服务鉴权。
- 支持并发参数和上游请求超时配置。

当前实现与项目内 [content/plus-checkout.js](../../content/plus-checkout.js) 的 Checkout 创建规则保持一致：

- `paypal` 默认使用 `US / USD`。
- `gopay` 默认使用 `ID / IDR`。
- 默认转换后的 `processorEntity` 为 `openai_llc`。
- `paypal` 优先返回 `pay.openai.com` 的 Hosted Checkout 长链。

## 接口

### `GET /healthz`

用于健康检查，并返回当前并发配置概览。

### `POST /api/checkout`

请求头：

```text
Content-Type: application/json
X-API-Key: <你的服务鉴权密钥>
```

请求体：

```json
{
  "accessToken": "<chatgpt access token>",
  "paymentMethod": "paypal",
  "country": "US",
  "currency": "USD",
  "processorEntity": "openai_llc",
  "requestId": "req-001"
}
```

返回示例：

```json
{
  "ok": true,
  "requestId": "req-001",
  "paymentMethod": "paypal",
  "checkoutSessionId": "cs_live_xxx",
  "checkoutUrl": "https://chatgpt.com/checkout/openai_ie/cs_live_xxx",
  "chatgptCheckoutUrl": "https://chatgpt.com/checkout/openai_llc/cs_live_xxx",
  "hostedCheckoutUrl": "https://pay.openai.com/c/pay/hosted_cs_live_xxx",
  "preferredCheckoutUrl": "https://pay.openai.com/c/pay/hosted_cs_live_xxx",
  "processorEntity": "openai_llc",
  "upstreamProcessorEntity": "openai_ie",
  "country": "US",
  "currency": "USD",
  "upstreamStatus": 200,
  "durationMs": 742
}
```

## 本地启动

```bash
cd services/checkout-converter
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export CHECKOUT_CONVERTER_API_KEY="replace-me"
python -m uvicorn app:app --host 0.0.0.0 --port 8080
```

Windows PowerShell 可使用：

```powershell
cd services/checkout-converter
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:CHECKOUT_CONVERTER_API_KEY="replace-me"
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8080
```

## Docker 部署

```bash
cd services/checkout-converter
docker build -t checkout-converter .
docker run -d \
  -p 8080:8080 \
  -e CHECKOUT_CONVERTER_API_KEY=replace-me \
  -e MAX_OUTBOUND_CONCURRENCY=200 \
  -e SESSION_MAX_CLIENTS=400 \
  --name checkout-converter \
  checkout-converter
```

## 生产建议

推荐使用 `gunicorn + uvicorn worker`：

```bash
gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8080 app:app
```

建议起步配置：

```text
MAX_OUTBOUND_CONCURRENCY=200
SESSION_MAX_CLIENTS=400
REQUEST_TIMEOUT_SECONDS=30
```

注意事项：

- 不要把 `accessToken` 输出到日志。
- 生产环境必须设置 `CHECKOUT_CONVERTER_API_KEY`。
- 入口层建议增加限流。
- 如果上游出现 403、429 或 Cloudflare challenge，应优先排查出口 IP 质量和并发设置。

## 环境变量

```text
PORT=8080
BIND_HOST=0.0.0.0
CHECKOUT_CONVERTER_API_KEY=
LOG_LEVEL=INFO
REQUEST_TIMEOUT_SECONDS=30
MAX_OUTBOUND_CONCURRENCY=200
SESSION_MAX_CLIENTS=400
IMPERSONATE_BROWSER=chrome136
OPENAI_PROXY_URL=
SERVICE_NAME=checkout-converter
SERVICE_VERSION=1.0.0
```
