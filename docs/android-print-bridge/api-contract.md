# API Contract - Android Print Bridge

Base URL (default):
- `http://127.0.0.1:15321`

Headers:
- `Content-Type: application/json`
- `X-Bridge-Token: <token>` (bat buoc, tru `/health` neu can de no-open)

## 1) GET /health

Response 200:

```json
{
  "success": true,
  "service": "soanhang-android-bridge",
  "version": "1.0.0",
  "uptimeSec": 1200,
  "queueSize": 0
}
```

Response 503:

```json
{
  "success": false,
  "errorCode": "SERVICE_NOT_READY",
  "message": "Bridge not ready"
}
```

## 2) GET /printers

Response 200:

```json
{
  "success": true,
  "printers": [
    "EPSON TM-T82",
    "XPrinter XP-58"
  ]
}
```

Notes:
- Danh sach da normalize, bo trung, sort theo uu tien.

## 3) POST /print

Request:

```json
{
  "type": "receipt-url",
  "url": "https://script.google.com/macros/s/.../exec?print=DH001&size=58&autoprint=1&autoback=1",
  "code": "DH001",
  "size": "58",
  "printerName": "EPSON TM-T82",
  "copies": 1,
  "timeoutMs": 15000,
  "source": "soanhang-congno"
}
```

Required:
- `type`: `receipt-url`
- `url`

Optional:
- `code`, `size`, `printerName`, `copies`, `timeoutMs`, `source`

Response 200:

```json
{
  "success": true,
  "jobId": "20260414-130501-0001",
  "status": "SENT",
  "printer": "EPSON TM-T82"
}
```

Response 400:

```json
{
  "success": false,
  "errorCode": "BAD_REQUEST",
  "message": "Missing url"
}
```

Response 404:

```json
{
  "success": false,
  "errorCode": "PRINTER_NOT_FOUND",
  "message": "Requested printer not found"
}
```

Response 409:

```json
{
  "success": false,
  "errorCode": "PRINTER_BUSY",
  "message": "Printer is busy"
}
```

Response 504:

```json
{
  "success": false,
  "errorCode": "PRINT_TIMEOUT",
  "message": "Print job timed out"
}
```

## 4) OPTIONS *

Muc tieu: pass preflight cho web app trong iframe.

Required headers:
- `Access-Control-Allow-Origin: <origin>`
- `Access-Control-Allow-Methods: GET,POST,OPTIONS`
- `Access-Control-Allow-Headers: Content-Type,X-Bridge-Token`
- `Access-Control-Max-Age: 86400`

## 5) Error codes (de web map message)

- `SERVICE_NOT_READY`
- `BAD_REQUEST`
- `UNAUTHORIZED`
- `FORBIDDEN_ORIGIN`
- `PRINTER_NOT_FOUND`
- `PRINTER_OFFLINE`
- `PRINTER_BUSY`
- `PRINT_TIMEOUT`
- `INTERNAL_ERROR`
