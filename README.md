# Cyber-Guard Bot

LINE chatbot สำหรับตรวจลิงก์น่าสงสัย โดยใช้กฎพื้นฐาน การตาม redirect และ AI
วิเคราะห์ข้อความที่อ่านได้จากหน้าเว็บไซต์ ผลลัพธ์เป็นเพียงคำเตือนเบื้องต้น ไม่ใช่การ
รับรองว่าเว็บไซต์ปลอดภัย

## การทำงาน

1. LINE ส่ง text event มาที่ `POST /webhook`
2. LINE SDK ตรวจ webhook signature ด้วย `LINE_CHANNEL_SECRET`
3. หากเป็นลิงก์ ระบบตรวจโครงสร้างและตามทางไปยังเว็บไซต์ปลายทางโดยบล็อก private network
4. ตรวจชื่อเว็บกับ Google Safe Browsing และ/หรือ PhishTank เมื่อเปิดใช้งาน
5. เว็บที่มีข้อความยาวจะถูกคัดเฉพาะช่วงที่มีสัญญาณสำคัญก่อนส่งให้ AI
6. หากเว็บต้องรอ JavaScript ระบบสามารถเปิด Chrome แบบชั่วคราว อ่านข้อความ และถ่ายภาพให้ AI ตรวจ
7. ผู้ใช้พิมพ์ `ค้นเพิ่ม` พร้อมลิงก์เพื่อค้นข้อมูลชื่อเว็บจากแหล่งภายนอกได้
8. AI รวมหลักฐานและจำแนกเนื้อหาเป็นเว็บพนัน เว็บขโมยข้อมูล เว็บเลียนแบบ scam หรือประเภทอื่น
9. บอตตอบด้วยหัวข้อและคำแนะนำสั้น ๆ สำหรับผู้สูงอายุ และส่งภาพประกอบเมื่อเว็บไซต์มีภาพ HTTPS ที่ผ่านเงื่อนไข
10. หากไม่มีลิงก์ บอตตอบคำทักทายและสนทนาทั่วไปได้ โดยคำทักทายพื้นฐานไม่ใช้เครดิต AI

## ตั้งค่า

คัดลอกชื่อตัวแปรจาก `.env.example` ไปใส่ใน `.env` โดยห้าม commit ไฟล์ `.env`

- `LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_CHANNEL_SECRET` จำเป็นเสมอ
- ตั้ง `AI_ANALYSIS_ENABLED=true` เมื่อต้องการเปิด AI
- `OPENAI_API_KEY` จำเป็นเมื่อเปิด AI
- `OPENAI_MODEL` เปลี่ยนโมเดลได้โดยไม่ต้องแก้ source code
- `AI_REQUESTS_PER_HOUR` จำกัดจำนวนการตรวจลิงก์ด้วย AI และการสนทนาทั่วไปต่อผู้ใช้เพื่อควบคุมค่าใช้จ่าย
- `DYNAMIC_ANALYSIS_ENABLED=true` เปิด Chrome แบบแยกเฉพาะเมื่อหน้าเว็บปกติมีข้อมูลไม่พอ
- `REPUTATION_CHECK_ENABLED=true` เปิดการตรวจฐานข้อมูลชื่อเสียง
- `OPENPHISH_ENABLED=true` ดาวน์โหลด Community Feed มาเทียบในเครื่องโดยไม่ส่งลิงก์ของผู้ใช้ไปค้นทีละรายการ
- `PHISHTANK_ENABLED=true` ใช้ PhishTank; จากการทดสอบการเรียกแบบไม่ใส่ key อาจถูกบล็อก จึงปิดไว้เป็นค่าเริ่มต้น
- `GOOGLE_SAFE_BROWSING_API_KEY` ใช้ Google Safe Browsing สำหรับโครงงานที่ไม่ใช่เชิงพาณิชย์
- `WEB_RESEARCH_ENABLED=true` เปิดความสามารถค้นข้อมูลภายนอกผ่าน OpenAI
- `WEB_RESEARCH_MODE=on_demand` ค้นเฉพาะเมื่อข้อความมีคำว่า `ค้นเพิ่ม`; ใช้ `always` เมื่อต้องการค้นทุกลิงก์และยอมรับค่าใช้จ่ายเพิ่ม

ตัวอย่างการค้นข้อมูลเพิ่ม:

```text
ค้นเพิ่ม https://example.com
```

การค้นเว็บผ่าน OpenAI มีค่าบริการเครื่องมือแยกจากค่า token จึงตั้งเป็น `on_demand`
โดยค่าเริ่มต้น ฐานข้อมูลที่ไม่พบลิงก์ไม่ได้หมายความว่าลิงก์ปลอดภัย

## แหล่งข้อมูลภายนอก

- [Google Safe Browsing](https://developers.google.com/safe-browsing/) ตรวจรายการเว็บหลอกลวง มัลแวร์ และซอฟต์แวร์ไม่พึงประสงค์ ต้องมี API key
- [PhishTank](https://phishtank.org/api_info.php) เป็นฐานข้อมูลชุมชนสำหรับเว็บขโมยข้อมูล ใช้แบบจำกัดได้โดยไม่ใส่ key
- [OpenPhish Community Feed](https://www.openphish.com/phishing_feeds.html) เป็นรายการเว็บขโมยข้อมูลที่อัปเดตทุก 12 ชั่วโมงในรุ่นฟรี และเป็นแหล่งหลักที่เปิดใช้ในเวอร์ชันนี้
- [URLhaus](https://urlhaus.abuse.ch/api/) มีข้อมูลเว็บที่แจกมัลแวร์ แต่ต้องมี Auth-Key และยังไม่ได้เปิดใช้ในเวอร์ชันนี้
- [VirusTotal](https://docs.virustotal.com/reference/public-vs-premium-api) มีข้อมูลจากหลายระบบ แต่ Public API มีข้อจำกัด จึงยังไม่ได้เปิดใช้ในเวอร์ชันนี้

## รันในเครื่อง

```powershell
pnpm install
pnpm dev
```

เปิดอีก Terminal แล้วรัน:

```powershell
ngrok http 3000
```

นำ HTTPS URL ของ ngrok ต่อท้ายด้วย `/webhook` ไปตั้งใน LINE Developers Console

ตรวจสถานะเซิร์ฟเวอร์ได้ที่ `GET /health` โดย endpoint นี้ไม่แสดง secret

## ทดสอบ

```powershell
pnpm test
```

ตรวจความถูกต้องของชุดประเมินโดยไม่เรียก API:

```powershell
pnpm eval:ai:check
```

เมื่อใส่ `OPENAI_API_KEY` แล้ว สามารถวัด category accuracy และ risk accuracy ได้ด้วย:

```powershell
pnpm eval:ai
```

ควรเพิ่มตัวอย่างที่ตรวจคำตอบโดยคนแล้วลงใน `eval/cases.json` อย่างต่อเนื่อง โดยไม่ใส่
ชื่อ เบอร์โทร รหัสผ่าน OTP หรือข้อมูลส่วนบุคคลของผู้ใช้

## ความปลอดภัย

- ระบบรับเฉพาะ HTTP/HTTPS บนพอร์ตมาตรฐาน
- ตรวจ DNS ใหม่ทุก redirect และบล็อก private, loopback และ special-use address
- จำกัด redirect, timeout, header, ขนาด HTML และจำนวนตัวอักษรที่ส่งให้ AI
- โหมดอ่านเว็บปกติไม่รัน JavaScript และใช้การป้องกัน SSRF ด้วย DNS/IP validation
- โหมดเว็บ JavaScript ใช้ Chrome แบบ headless ด้วยโปรไฟล์ชั่วคราว ไม่ใช้ cookie ของผู้ใช้ ปิด download, WebSocket, WebRTC และจำกัดเวลา/จำนวน request
- การเปิดเว็บที่ไม่น่าเชื่อถือยังมีความเสี่ยง จึงเปิดโหมด JavaScript เฉพาะเมื่อข้อมูลปกติไม่พอ และควรย้ายส่วนนี้ไปเครื่องหรือ container แยกก่อนใช้งานสาธารณะ
- OpenPhish ถูกดาวน์โหลดมาเทียบในเครื่อง; Google Safe Browsing และ PhishTank จะส่งลิงก์ที่ตรวจไปยังผู้ให้บริการเมื่อเปิดใช้ ส่วนการค้นเพิ่มจะส่งเฉพาะชื่อเว็บไซต์ไปยัง OpenAI
- ภาพที่เว็บไซต์ส่งมาเป็นเพียงภาพประกอบ ไม่ใช่หลักฐานว่าเว็บไซต์ปลอดภัย
- โหมดสนทนาเป็นการตอบแต่ละข้อความแยกกัน และยังไม่เก็บประวัติการสนทนาระยะยาว
- เนื้อหาจากเว็บไซต์ถูกถือเป็นข้อมูลที่ไม่น่าเชื่อถือ ไม่ใช่คำสั่งสำหรับ AI
- หากเว็บหรือ AI ล้มเหลว ระบบยังแสดงผลตรวจพื้นฐานแทน
- operational log ไม่บันทึกข้อความ URL เต็ม หรือ LINE user ID

## Deploy

โปรเจกต์มี `Dockerfile` สำหรับบริการที่รองรับ container ตัวแปรลับทั้งหมดต้องตั้งผ่าน
หน้า Environment/Secrets ของผู้ให้บริการ ห้ามเขียนลง Docker image หรือ repository
หลัง deploy ให้ตั้ง LINE webhook เป็น `https://โดเมนของบริการ/webhook` และตั้ง health
check เป็น `/health`

เมื่อ push ขึ้น GitHub แล้ว workflow ใน `.github/workflows/test.yml` จะรัน tests,
ตรวจชุดประเมิน และ audit dependencies อัตโนมัติก่อนนำโค้ดรุ่นใหม่ไปใช้งาน

ไฟล์ `render.yaml` เตรียม Render Blueprint แบบ Free ไว้สำหรับทดลอง แพ็กเกจ Free อาจ
หยุดเมื่อไม่มีผู้ใช้และตอบครั้งแรกช้า สำหรับการสาธิตที่ต้องตอบทันทีหรือใช้งานจริงควร
เปลี่ยนไปใช้ compute plan ที่ไม่ spin down ก่อนเปิดให้ผู้ใช้งาน
