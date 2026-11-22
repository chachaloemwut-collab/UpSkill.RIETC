# API ตรวจผลการอบรม สำหรับระบบภายนอก (Partner API v1)

API นี้ให้ระบบของหน่วยงานอื่นตรวจว่าบุคคลหนึ่งผ่านการอบรมหลักสูตรใดบน **UpskillReskill.RIETC** (วิทยาลัยเทคนิคนิคมอุตสาหกรรมระยอง) และได้รับวุฒิบัตรเลขใด โดยค้นด้วย **เลขประจำตัวประชาชนที่ระบบของท่านมีอยู่แล้ว**

**หลักการคุ้มครองข้อมูล**
- API ไม่ส่งเลขประจำตัวประชาชนออกไป ไม่มีทางดึงรายชื่อหรือเลขบัตรทั้งหมด
- คำตอบไม่มีอีเมล เบอร์โทร ที่อยู่ หรือคะแนนสอบ
- มีเฉพาะชื่อ-นามสกุลตามวุฒิบัตร หลักสูตรที่เรียนจบ และวุฒิบัตร
- หลักสูตรที่ยังเรียนไม่จบจะไม่อยู่ในคำตอบ

## 1. ขอกุญแจ API

ติดต่อผู้ดูแลระบบ UpskillReskill.RIETC พร้อมข้อมูลต่อไปนี้
1. ชื่อระบบและหน่วยงาน
2. **วัตถุประสงค์การใช้ข้อมูล** เช่น "ตรวจผลการอบรมของผู้สมัครประกวดก่อนรับผลงาน"
3. **IP สาธารณะของเซิร์ฟเวอร์** ที่จะเรียก API (ระบุ IP เดี่ยว หรือช่วง IPv4 แบบ CIDR ตั้งแต่ /8 ขึ้นไป)
4. ระยะเวลาที่ต้องใช้ (กุญแจมีอายุ 1–365 วัน)

ผู้ดูแลระบบจะส่งกุญแจรูปแบบ `upk_xxxxxxxxxxxx_…` ให้ **ครั้งเดียว** ระบบเก็บไว้เฉพาะค่า hash จึงแสดงซ้ำไม่ได้ ถ้ากุญแจหายหรือรั่วไหล ให้แจ้งเพิกถอนแล้วขอกุญแจใหม่

## 2. ข้อกำหนดด้านความปลอดภัยของระบบปลายทาง

- เรียกจาก **เซิร์ฟเวอร์ (server-to-server) เท่านั้น** ห้ามใส่กุญแจในเว็บเบราว์เซอร์ แอปมือถือ หรือ repository
- เก็บกุญแจใน secret manager หรือ environment variable ที่จำกัดสิทธิ์
- ใช้ HTTPS เสมอ (`https://upskillreskill.rietc.ac.th`) และตรวจใบรับรอง TLS ตามปกติ
- ส่งเลขบัตรเฉพาะของบุคคลที่หน่วยงานมีฐานทางกฎหมายหรือได้รับความยินยอมให้ตรวจสอบ ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
- ห้ามบันทึกเลขบัตรลง log ฝั่งระบบของท่าน ให้ใช้ `X-Request-Reference` เป็นเลขอ้างอิงแทน
- ขอกุญแจใหม่ก่อนกุญแจเดิมหมดอายุ (ตรวจวันหมดอายุได้จาก `/ping`)

## 3. การยืนยันตัวตน

ทุกคำขอต้องมี header ต่อไปนี้

```
Authorization: Bearer upk_xxxxxxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

นอกจากกุญแจแล้ว คำขอต้องมาจาก IP ที่ลงทะเบียนไว้ และกุญแจต้องยังไม่หมดอายุและไม่ถูกเพิกถอน

| Header | จำเป็น | คำอธิบาย |
|---|---|---|
| `Authorization` | ✔ | `Bearer <กุญแจ>` |
| `Content-Type` | ✔ (POST) | `application/json` |
| `X-Request-Reference` | – | เลขอ้างอิงของฝั่งท่าน (`A–Z a–z 0–9 _ . : -` ไม่เกิน 100 ตัว) ห้ามใส่ข้อมูลส่วนบุคคล ระบบจะส่งกลับในคำตอบและบันทึกไว้เพื่อตรวจย้อน |

## 4. Endpoint

Base URL: `https://upskillreskill.rietc.ac.th/api/partner/v1`

### 4.1 `GET /ping`: ตรวจกุญแจและ IP

ไม่ส่งข้อมูลส่วนบุคคลใด ๆ ใช้ทดสอบการเชื่อมต่อ

```json
{
  "request_id": "0f3c…",
  "ok": true,
  "client": "ระบบทะเบียน วิทยาลัยเทคนิคระยอง",
  "scopes": ["training:lookup"],
  "key_expires_at": "2027-05-21T16:00:00.000Z"
}
```

### 4.2 `POST /training-records/lookup`: ค้นผลการอบรมด้วยเลขบัตร

ส่งเลขบัตรใน **body** เท่านั้น (ไม่ใส่ใน URL เพื่อไม่ให้ไปค้างใน log ของ proxy) ระบบตรวจ check digit ของเลขบัตรก่อนค้น

คำขอ:

```json
{ "national_id": "1234567890121" }
```

คำตอบเมื่อพบบุคคล:

```json
{
  "request_id": "8cfe820e-7d6a-4e24-8afa-ee22864f1e6c",
  "reference": "REG-2569-00042",
  "found": true,
  "person": { "name_th": "นางสาวมาลี ตั้งใจเรียน", "name_en": "Miss Malee Tangjairian" },
  "trainings": [
    {
      "course_title": "การประดิษฐ์กระทงรักษ์โลกและจริยธรรมสิ่งแวดล้อม",
      "course_code": null,
      "completed_at": "2026-11-22T10:10:58.901Z",
      "study_hours": 2.21,
      "certificate": {
        "code": "CERT-2026-MEAS-74NK-870T",
        "status": "valid",
        "issued_at": "2026-11-22T10:11:12.902Z",
        "expires_at": null,
        "verify_url": "https://upskillreskill.rietc.ac.th/verify/CERT-2026-MEAS-74NK-870T"
      }
    }
  ]
}
```

(ข้อมูลตัวอย่างเป็นข้อมูลสมมติ)

คำตอบเมื่อไม่พบบุคคล (HTTP 200):

```json
{ "request_id": "…", "found": false, "person": null, "trainings": [] }
```

ความหมายของฟิลด์:

| ฟิลด์ | ความหมาย |
|---|---|
| `person.name_th` / `name_en` | ชื่อ-นามสกุลที่ผู้เรียนยืนยันไว้สำหรับพิมพ์บนวุฒิบัตร (`null` ถ้ายังไม่ยืนยัน) |
| `trainings[]` | เฉพาะหลักสูตรที่ **เรียนจบและผ่านเกณฑ์แล้ว** เรียงจากล่าสุด |
| `course_code` | รหัสหลักสูตร ถ้าผู้จัดหลักสูตรกำหนดไว้ |
| `completed_at` | วันเวลาที่ผ่านเกณฑ์ (ISO 8601, UTC) |
| `study_hours` | ชั่วโมงเรียนตามที่บันทึกในวุฒิบัตร (`null` ถ้ายังไม่ออกวุฒิบัตร) |
| `certificate` | `null` ถ้าผู้เรียนยังไม่ได้กดออกวุฒิบัตร |
| `certificate.status` | `valid` ใช้งานได้ · `expired` หมดอายุ · `revoked` ถูกเพิกถอน |
| `certificate.verify_url` | หน้าตรวจสอบวุฒิบัตรสาธารณะ ใช้ยืนยันซ้ำได้ |

## 5. รหัสข้อผิดพลาด

ข้อผิดพลาดทุกกรณีตอบเป็น `{ "error": "<รหัส>", "request_id": "…" }`

| HTTP | `error` | สาเหตุ / สิ่งที่ต้องทำ |
|---|---|---|
| 400 | `INVALID_NATIONAL_ID` | เลขบัตรไม่ครบ 13 หลักหรือ check digit ไม่ถูกต้อง |
| 400 | `VALIDATION_FAILED` / `INVALID_JSON` | รูปแบบ body ไม่ถูกต้อง หรือมีฟิลด์อื่นที่ไม่รองรับ |
| 401 | `INVALID_API_KEY` | ไม่มีกุญแจ กุญแจผิด หมดอายุ หรือถูกเพิกถอน (ระบบไม่บอกว่าเป็นกรณีใด) |
| 403 | `IP_NOT_ALLOWED` | เรียกจาก IP ที่ไม่ได้ลงทะเบียน แจ้งผู้ดูแลระบบเพื่อปรับรายการ IP |
| 403 | `SCOPE_NOT_GRANTED` | กุญแจไม่มีสิทธิ์ใช้ endpoint นี้ |
| 413 | `PAYLOAD_TOO_LARGE` | body ใหญ่เกิน 2 KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | ไม่ได้ส่ง `Content-Type: application/json` |
| 429 | `RATE_LIMITED` | เรียกถี่เกินกำหนด รอตามวินาทีใน header `Retry-After` |
| 500 | `INTERNAL` | ข้อผิดพลาดฝั่งระบบ ส่ง `request_id` ให้ผู้ดูแลระบบเพื่อตรวจสอบ |

## 6. ข้อจำกัดการเรียกใช้

- ต่อกุญแจ: **120 ครั้งต่อนาที**
- ต่อ IP ต้นทาง: **300 ครั้งต่อนาที**
- คำตอบมี `Cache-Control: no-store` ห้ามเก็บ cache ไว้ในตัวกลาง

ถ้าต้องตรวจจำนวนมาก ให้เรียกทีละรายการและเคารพ `Retry-After`

## 7. ตัวอย่างโค้ด

curl:

```bash
curl -sS https://upskillreskill.rietc.ac.th/api/partner/v1/training-records/lookup \
  -H "Authorization: Bearer $UPSKILL_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Request-Reference: REG-2569-00042" \
  -d '{"national_id":"1234567890121"}'
```

Node.js 18+:

```js
const res = await fetch("https://upskillreskill.rietc.ac.th/api/partner/v1/training-records/lookup", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.UPSKILL_API_KEY}`,
    "Content-Type": "application/json",
    "X-Request-Reference": applicationNo, // เลขอ้างอิงของระบบท่าน ไม่ใช่ข้อมูลส่วนบุคคล
  },
  body: JSON.stringify({ national_id: nationalId }),
});
if (!res.ok) throw new Error(`UpSkill API ${res.status}: ${(await res.json()).error}`);
const { found, trainings } = await res.json();
```

PHP:

```php
$ch = curl_init("https://upskillreskill.rietc.ac.th/api/partner/v1/training-records/lookup");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("UPSKILL_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode(["national_id" => $nationalId]),
]);
$result = json_decode(curl_exec($ch), true);
```

## 8. การตรวจสอบย้อนหลังฝั่ง UpskillReskill.RIETC

- ทุกคำขอถูกบันทึก ได้แก่ กุญแจที่ใช้ endpoint IP เวลา สถานะ พบหรือไม่พบบุคคล จำนวนรายการ และ `X-Request-Reference`
- **ระบบไม่บันทึกเลขประจำตัวประชาชนที่ส่งมา**
- ผู้ดูแลระบบเพิกถอนกุญแจได้ทันทีที่หน้า **ภาพรวมระบบ → ระบบภายนอก (API)** มีผลตั้งแต่คำขอถัดไป
