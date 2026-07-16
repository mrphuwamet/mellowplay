# สรุปภาพรวมโปรเจกต์ Mellow Play — ฟีเจอร์ที่ยังไม่สมบูรณ์ / เชื่อมต่อไม่ครบ

ตรวจสอบเมื่อ: 2026-07-15 · อัปเดตสถานะแก้ไข: 2026-07-15
ขอบเขต: 3 repo — `mellow-play-backend-api`, `mellow-play-crm-portal`, `mellow-play-consumer-app`

**สถานะ**: หัวข้อ 2–11 (ทุกข้อยกเว้น Human Design) แก้ไขและ deploy ขึ้น dev environment เรียบร้อยแล้วตามคำขอ "ที่เหลือทยอยปรับแก้ให้สมบูรณ์พร้อมใช้งานบน Production" — ดูรายละเอียดที่ท้ายไฟล์ (ยังไม่ได้ deploy ขึ้น production, ยังไม่ได้ commit — รอการยืนยันจากผู้ใช้)

เอกสารนี้แบ่งเป็น 2 ระดับความสำคัญ: **🔴 ต้องแก้ก่อน (กระทบผู้ใช้จริง/ข้อมูลเงิน/ความปลอดภัย)** และ **🟡 ควรแก้ (ของค้าง/ฟีเจอร์ครึ่งๆ กลางๆ)**

---

## 🔴 1. Human Design (HD) — ข้อมูลที่โชว์ผู้ปกครองเป็น "ของปลอม" ทั้งหมด

นี่คือฟีเจอร์หลักที่ขายเป็นจุดเด่นของแอป (การวิเคราะห์บุคลิกเด็กแบบ Human Design) แต่ **ทุก จุดที่คำนวณจริง ๆ ใช้ mock data 100%**

- `src/services/hdService.ts` มีโค้ดเรียก API จริง (`https://api.humandesignapi.nl/...`) แต่จะทำงานก็ต่อเมื่อมี API key เท่านั้น
- ทุกจุดที่เรียกใช้ (`userRepository.createWithChildren`, `userRepository.addSingleChild`, `profileController.calculate`) ส่ง API key เป็นค่าว่างหรืออ่านจาก `config.hdApiKey` ซึ่ง**ไม่เคยถูกตั้งค่าไว้เลยใน `wrangler.toml` หรือ `.dev.vars`**
- ผลคือระบบ fallback ไปใช้ `generateMockResponse()` ซึ่งคำนวณจาก **เลขวันเกิด mod 4** เท่านั้น (สุ่มได้แค่ 4 แบบตายตัว: Generator 6/2, Projector 1/3, Manifestor 4/6, Reflector 6/2) ไม่ใช่การคำนวณ Human Design จริงจากดวงดาว/เวลาเกิด
- ข้อมูลปลอมนี้ถูกบันทึกลง `HD_Profiles` และโชว์จริงในหน้า `KnowMyChild.tsx`, `Home.tsx` ของผู้ปกครอง

**ต้องทำ:** ตัดสินใจว่าจะ (ก) ซื้อ/ขอ API key จริงจาก humandesignapi.nl แล้วตั้งค่าใน `wrangler secret put HD_API_KEY` ทั้ง production และ dev หรือ (ข) ถ้ายังไม่พร้อมใช้จริง ควรมีข้อความแจ้งผู้ปกครองว่า "ข้อมูลตัวอย่าง" แทนที่จะโชว์เป็นผลลัพธ์จริง

---

## 🔴 2. ระบบคูปอง/แต้ม — มี 3 ระบบขนานที่ไม่เชื่อมกัน และมีรูรั่วเรื่องเงิน

พบว่ามีตาราง **3 ระบบ** ที่ทำหน้าที่คล้ายกันแต่แยกกันเด็ดขาด:

| ตาราง | ใช้งานจริงหรือไม่ | ปัญหา |
|---|---|---|
| `Member_Coupons` | ✅ ใช้งานจริง — เป็นระบบ "แต้มสะสม/สแตมป์" ที่แลกของรางวัลได้ | ทำงานได้ครบ แต่คนละระบบกับคูปองส่วนลดค่าคอร์ส |
| `ChildCoupons` | ⚠️ เติมเข้าได้ (ตอนซื้อแพ็กเกจ) **แต่ไม่เคยถูกหักออกเลย** | หน้าจอง (`Booking.tsx`) ส่ง `couponTypeId` มาที่ backend, `adminController.createBooking` รับค่านี้ไว้แต่**ไม่เคยเขียนโค้ดหักยอดคงเหลือ** — แปลว่าจองด้วยคูปองได้ไม่จำกัดโดยยอดไม่ลดลงจริง |
| `User_Coupons` | ⚠️ มีแค่ฝั่ง admin CRUD เท่านั้น | ไม่มีหน้าฝั่งลูกค้า/การจองใดอ่านหรือเขียนตารางนี้เลย ดูเหมือนเป็นระบบเก่าที่ค้างไว้ |

- Route ที่ตายแล้วแต่ยังอยู่ใน `index.ts`: `POST /api/v1/coupons/use` และ `/coupons/staff-use` — เรียก method (`useCoupons`, `staffUseCoupons`) ที่**ไม่มีอยู่จริง**ใน `CouponController` เลย ถ้าถูกเรียกจะ error 500 ทันที

**ต้องทำ:**
1. เพิ่มโค้ดหักยอด `ChildCoupons` ตอน `createBooking` เมื่อ `paymentMethod === 'coupon'` (จุดเสี่ยงเรื่องเงิน/สิทธิประโยชน์รั่วไหลมากที่สุดในระบบ)
2. ลบ route ตายทั้ง 2 เส้น หรือ implement ให้จบ
3. วางแผนรวม 3 ระบบให้เหลือระบบเดียว หรืออย่างน้อยทำเอกสารว่าแต่ละระบบมีไว้ทำอะไร

---

## 🔴 3. หน้า POS — เมนูที่ใช้งานจริงขายแพ็กเกจ/เติมคูปองไม่ได้

- Backend มี endpoint ที่ทำงานสมบูรณ์ครบ: lookup สมาชิก, เติมคูปอง (`pos/topup`), ขายแพ็กเกจพร้อมให้คูปอง (`pos/process-package-sale`)
- แต่หน้า CRM ที่ import endpoint เหล่านี้ไว้ครบ (`POSDashboard.tsx`) **ไม่ได้ถูก route ไปใช้งานจริง** (import ไว้เฉยๆ ใน `App.tsx` แต่ไม่มี `<Route>` ชี้มาหา) แถมมีบั๊ก reference ตัวแปรที่ไม่มีอยู่ (`POS_PACKAGES.length`) ถ้าเปิดจะพังทันที
- หน้าที่ route จริงคือ `/pos` → `POSNew.tsx` เป็นแค่ระบบขาย/พิมพ์ใบเสร็จ (เชื่อม `orderController.createOrder`) ซึ่ง**ไม่ได้เรียกโค้ดให้คูปองหรือหักสต็อกเลย**
- สรุป: **ตอนนี้ไม่มีทางหน้าบ้านใดที่พนักงานจะ "ขายแพ็กเกจที่เคาน์เตอร์แล้วลูกค้าได้คูปองจริง" หรือ "เติมคูปองให้สมาชิก" ได้เลย** ทั้งที่ backend ทำไว้เสร็จแล้ว

**ต้องทำ:** เชื่อม `POSNew.tsx` (หน้าที่ใช้งานจริง) เข้ากับ `pos/process-package-sale` และ `pos/topup`, หรือแก้บั๊กแล้ว route `POSDashboard.tsx` เข้าไปแทน

---

## 🔴 4. ระบบสิทธิ์ผู้ใช้งาน CRM (Role Permissions) — ไม่ใช่ระบบความปลอดภัยจริง

- `rolePermissions.ts` ทั้งอ่านและบันทึกสิทธิ์ **ลง `localStorage` ของเบราว์เซอร์เท่านั้น** ไม่มี backend endpoint ใดๆ รองรับเลย (ค้นทั้ง backend หาคำว่า "permission" ไม่เจอเลยสักที่)
- ผลคือ: แอดมินคนหนึ่งแก้สิทธิ์ที่เครื่องตัวเอง → เครื่อง/บราวเซอร์อื่นของแอดมินคนอื่นไม่เห็นการเปลี่ยนแปลงนั้นเลย
- ที่ร้ายแรงกว่านั้น: **backend ไม่มีการตรวจสอบสิทธิ์ role ใดๆ เลย** — เส้นทาง `/api/v1/admin/*` ทั้งหมดไม่มี JWT/สิทธิ์ป้องกันอยู่แล้ว (พบตั้งแต่ช่วงก่อนหน้าของการตรวจสอบนี้) ระบบสิทธิ์ที่เห็นในหน้า CRM จึงเป็นแค่ "ซ่อนปุ่มในหน้าจอ" ไม่ใช่การควบคุมสิทธิ์การเข้าถึงข้อมูลจริง ใครก็สามารถยิง API ตรงเข้าไปทำอะไรก็ได้โดยไม่ผ่านสิทธิ์เลย

**ต้องทำ:** นี่คือช่องโหว่ความปลอดภัยที่สำคัญที่สุดที่พบ — ควรทำระบบ auth/permission ฝั่ง backend จริงสำหรับ `/api/v1/admin/*` ก่อนเปิดให้พนักงานหลายคนใช้งานจริงในโปรดักชัน

---

## 🟡 5. หน้า "จัดการสิทธิประโยชน์/Incentive" ของ CRM ใช้ข้อมูลปลอมทั้งหมด

`IncentiveTracking.tsx` (หน้า `/crm/incentives`) ไม่มีการเรียก API เลยสักบรรทัด — ทั้งหน้าใช้ตัวแปร mock (`MOCK_INCOME`, `MOCK_CAMPAIGNS`, `MOCK_CAMPAIGN_PROGRESS`) ที่ hardcode วันที่ไว้ (เช่น `'2026-5'`) ทั้งที่ backend มีข้อมูลจริงพร้อมใช้อยู่แล้วผ่าน `/payouts` และ `/campaign-bonuses` (ซึ่งหน้า `Payout.tsx`/`CampaignManagement.tsx` เชื่อมจริงอยู่แล้ว)

**ต้องทำ:** เปลี่ยน `IncentiveTracking.tsx` ให้ดึงข้อมูลจริงจาก endpoint ที่มีอยู่แล้วแทน mock

---

## 🟡 6. เมนู "ตารางงานของฉัน" (my_schedule) — ไม่มีหน้าจริง

มีสิทธิ์ `my_schedule` ให้ตั้งค่าได้ในหน้าจัดการสิทธิ์ แต่ route จริงเป็นแค่ `<Navigate to="/crm/bookings" />` เด้งไปหน้าการจองทั่วไปเฉยๆ ไม่มีหน้าตารางงานส่วนตัวจริง

**ต้องทำ:** สร้างหน้าจริง หรือถ้าตัดสินใจไม่ทำฟีเจอร์นี้แล้ว ให้เอา key ออกจากรายการสิทธิ์เพื่อไม่ให้แอดมินสับสน

---

## 🟡 7. Login/OTP — ผลตรวจสอบ

- **Google Login**: ทำงานสมบูรณ์ ทั้ง frontend/backend เชื่อมกันจริง ไม่มีปัญหา
- **LINE LIFF**: ติดตั้ง package `@line/liff` ไว้ใน consumer-app แต่**ไม่มีการเรียกใช้แม้แต่บรรทัดเดียว**ในทั้งโปรเจกต์ — เป็นของที่ค้างไว้เฉยๆ ยังไม่ได้ทำจริง ถ้าไม่มีแผนใช้ควรถอด dependency ออก
- **SMS OTP (ลืมรหัสผ่าน)**: โค้ดเชื่อม ThaiBulkSMS จริง แต่ค่าเริ่มต้นระบบปิดการส่ง SMS จริงไว้ (`otp_enabled = 0`) — ตอนนี้ระบบจะ "แกล้งส่ง" และคืนรหัส OTP กลับมาใน response ตรงๆ (โหมดทดสอบ) ต้องเข้าไปเปิดใน "ตั้งค่าระบบ" ของ CRM เอง และต้องตรวจสอบว่า secret คีย์ SMS ถูก deploy จริงไปที่ Cloudflare (ไม่ใช่แค่ในไฟล์ `.dev.vars` ในเครื่อง) ก่อนเปิดใช้งานจริง

---

## 🟡 8. Environment ผิดพลาด — โดเมน API หลอก (production)

ตรวจสอบยืนยันแล้วว่า **ยังไม่ได้แก้**:
- `mellow-play-consumer-app/.env.production` และ `mellow-play-crm-portal/.env.production` ทั้งคู่ชี้ไปที่ `https://mellow-play-backend-api-dev.workers.dev`
- แต่ worker จริงชื่อ `mellow-play-backend-api-dev` (ตาม `wrangler.toml` env.dev) จะได้ URL จริงเป็น `https://mellow-play-backend-api-dev.<ชื่อ-subdomain-บัญชี>.workers.dev` (ต้องมีส่วน subdomain บัญชี Cloudflare ต่อท้ายชื่อ worker เสมอ) — โดเมนที่ตั้งไว้ตอนนี้จึง **resolve ไม่ได้จริง**

**ต้องทำ:** แก้ `VITE_API_URL` ใน `.env.production` ทั้ง 2 repo ให้ตรงกับ URL จริงของ worker (หรือใช้ custom domain ถ้ามีตั้งไว้ใน `routes`)

---

## 🟡 9. ฟีดข่าวสาร (News Feed) — วิดีโอกดดูไม่ได้

หน้า Explore ของแอปลูกค้าโชว์ปุ่ม ▶️ เล่นวิดีโอทับการ์ดข่าว/สื่อ แต่**ไม่มีโค้ดเปิดวิดีโอเลย** — คลิกแล้วไม่มีอะไรเกิดขึ้น (เฉพาะกรณีมี `link_url` ภายนอกเท่านั้นที่กดแล้วเปิดลิงก์ได้จริง) ฝั่ง CRM (`NewsFeedManagement.tsx`) เปิดให้แอดมินใส่ "ลิงก์วิดีโอ" แยกต่างหากได้ตามปกติ แต่ฝั่งลูกค้าไม่มีระบบเล่นวิดีโอรองรับ

**ต้องทำ:** เพิ่ม modal/player เปิดวิดีโอเมื่อกดการ์ดที่มี `video_url`

---

## 🟡 10. ยอด "เข้าชม" (Views) ใน Dashboard วิเคราะห์ผล ไม่ครอบคลุมพฤติกรรมจริง

Dashboard ของ CRM แสดง funnel "เข้าชม → จอง → เรียนจบ → คะแนน" แต่ยอด "เข้าชม" นับเฉพาะตอนเปิดหน้ารายละเอียดคอร์ส (`CourseDetail.tsx`) เพจเดียวเท่านั้น — การ์ดคอร์สในหน้า Home/Explore/CourseList ไม่มีการนับเลย และปุ่ม "จองเลย" บนการ์ดที่ข้ามไปหน้าจองโดยตรงก็จะไม่ถูกนับเป็น "เข้าชม" เลย ทำให้บางคอร์สมียอดจองมากกว่ายอดเข้าชม (funnel ดูกลับด้าน) และตัวเลขนี้ไม่ได้สะท้อนความสนใจจริงของคอร์สที่ถูกโปรโมทผ่านหน้าแรกเป็นหลัก

**ต้องทำ:** เพิ่มการนับ view/impression ที่จุดอื่นด้วย หรือปรับคำอธิบายในหน้า Dashboard ให้ตรงกับสิ่งที่วัดจริง (page visit ไม่ใช่ยอดเข้าชมทั้งหมด)

---

## 🟡 11. โค้ดตายที่ควรลบทิ้ง

- `mellow-play-consumer-app/src/pages/Report.tsx` และ `src/components/ReportDisplay.tsx` — ไม่มีทางเข้าถึงได้จริงในระบบแล้ว (route `/report` เด้งกลับหน้าแรกเสมอ)
- `mellow-play-crm-portal/src/pages/POSDashboard.tsx` — import ไว้แต่ไม่มี route ใช้งาน และมีบั๊กจะพังถ้าเปิดใช้ (ดูข้อ 3)
- Route `POST /api/v1/coupons/use`, `/coupons/staff-use` (ดูข้อ 2)

---

## 🟡 12. ฟีเจอร์ที่ "สร้างไว้แล้วแต่ยังไม่เคยทดสอบแบบจริงจบครบวงจร"

รายการนี้เป็นสิ่งที่ backend/frontend เขียนโค้ดครบแล้ว แต่ยังไม่เคยผ่านการทดสอบด้วยข้อมูล/ธุรกรรมจริงแบบ end-to-end ในเซสชันนี้ ควรมีการทดสอบก่อนเปิดใช้จริง:
- ระบบซื้อแพ็กเกจออนไลน์ผ่าน Beam Checkout (`Package_Purchases`) — ยังไม่เคยทดสอบด้วยการจ่ายเงินจริงและรับ webhook ยืนยันจริง
- Course_Views / Course_Reviews — เขียนโค้ดไว้ครบแต่ยังไม่เคยตรวจสอบพฤติกรรมที่มีข้อมูลจำนวนมาก (ดูข้อ 10 ด้วย)

---

## ลำดับความสำคัญที่แนะนำให้ทำก่อน-หลัง

1. **ช่องโหว่เรื่องเงิน**: อุดรูรั่วการหักคูปอง (`ChildCoupons` ไม่เคยถูกหักตอนจอง) — ข้อ 2 — ✅ แก้แล้ว
2. **ความปลอดภัยระบบ**: backend auth/permission จริงสำหรับ `/api/v1/admin/*` — ข้อ 4 — ✅ แก้แล้ว
3. **แก้โดเมน production ที่ผิด** — ข้อ 8 — ✅ แก้แล้ว
4. **ตัดสินใจเรื่อง HD**: จ่ายเงินซื้อ API จริง หรือติดป้าย "ตัวอย่าง" ชัดเจน — ข้อ 1 — ⏸️ ยังไม่ทำตามคำขอผู้ใช้
5. เชื่อม POS เข้ากับการขายแพ็กเกจ/เติมคูปอง — ข้อ 3 — ✅ แก้แล้ว
6. ที่เหลือ (Incentive mock, my_schedule, LINE LIFF, News feed วิดีโอ, view tracking, โค้ดตาย) — ✅ แก้แล้วทั้งหมด

---

## รายละเอียดการแก้ไข (2026-07-15)

**Backend (`mellow-play-backend-api`)** — deploy แล้วขึ้น dev (`mellow-play-backend-api-dev.mr-phuwamet.workers.dev`):
- แก้โดเมน production ผิดใน `.env.production` ทั้ง 2 repo (frontend) ให้ชี้ไปที่ URL จริง
- เพิ่มการหักยอด `ChildCoupons` จริงตอนจองด้วยคูปอง (`adminController.createBooking`) พร้อมตรวจสอบยอดคงเหลือฝั่ง server
- ลบ route ตาย `/coupons/use`, `/coupons/staff-use`
- เพิ่ม middleware ตรวจสอบ JWT staff (`type: 'admin'`) บน `/api/v1/admin/*` และ `/api/v1/system/*` ทั้งหมด ยกเว้น endpoint ที่แอปลูกค้าเรียกตรง (branches/courses/coupon-types อ่านอย่างเดียว, สร้าง/ยกเลิกการจอง) ซึ่งยังเปิดไว้ตามเดิม; `PUT /admin/users/:id` รับได้ทั้ง token แอดมิน หรือ token ผู้ใช้ที่แก้ไขโปรไฟล์ตัวเอง
- `POST /auth/admin/login` ออก JWT พร้อม claim `type`/`role`/`branchId` ใหม่ — **staff ที่ login ค้างไว้ก่อนหน้านี้จะต้อง login ใหม่**
- POS: ขายแพ็กเกจ/สินค้าที่หน้า POS (`/pos` → `POSNew.tsx` → `orderController.createOrder`) ตอนนี้เติมคูปองจริงและตัดสต็อกสินค้าจริงแล้ว, เพิ่มปุ่ม "เติมคูปอง" ในหน้า POS ให้เรียก `pos/topup` ได้จริง
- เพิ่ม endpoint `/admin/incentive-summary` (real data) ให้หน้า Incentive ของ CRM ใช้แทน mock

**CRM portal (`mellow-play-crm-portal`)**:
- เพิ่ม global axios interceptor (`utils/axiosSetup.ts`) แนบ `crm_token` อัตโนมัติทุก request ไปยัง backend (ต้องมีเพื่อให้ auth ใหม่ทำงานได้กับทุกหน้า ไม่ใช่แค่ SystemLogs)
- `IncentiveTracking.tsx` เปลี่ยนจาก mock data → ดึงข้อมูลจริง (เงินเดือนจาก `CRM_Users.salary`, Payout จริง, ความคืบหน้าแคมเปญคำนวณจาก `Transactions` จริง)
- เพิ่มหน้า "ตารางงานของฉัน" (`MySchedule.tsx`) จริง ต่อกับ endpoint ที่มีอยู่แล้ว (`/admin/my-schedule`) แทนการ redirect ไปหน้าจองทั่วไป
- ลบ `POSDashboard.tsx` (import ไว้แต่ไม่เคย route และมีบั๊ก reference ตัวแปรไม่มีอยู่จริง)

**Consumer app (`mellow-play-consumer-app`)**:
- ถอด dependency `@line/liff` ที่ติดตั้งไว้แต่ไม่เคยใช้งาน
- เพิ่ม video player modal ในหน้า Explore (รองรับทั้งวิดีโอ YouTube และไฟล์วิดีโอตรง) ให้กดเล่นวิดีโอในฟีดข่าวได้จริง
- เพิ่มการนับ "เข้าชม" (view tracking) ที่จุดกด "จองเลย"/"จองเลย" บนการ์ดคอร์สทุกจุด (Explore, CourseCard ที่ใช้ร่วมกันใน Home/CourseList, Roadmap) ไม่ใช่แค่ตอนเปิดหน้ารายละเอียดคอร์สเท่านั้น
- ลบไฟล์ตาย `pages/Report.tsx`, `components/ReportDisplay.tsx`

**หมายเหตุสำคัญก่อนขึ้น production**:
- ทุกอย่างข้างต้น deploy ไปที่ **dev environment** เท่านั้น ยังไม่ได้ `wrangler deploy` (production) หรือ build/deploy frontend ทั้งสองตัวขึ้น hosting จริง
- ยังไม่ได้ `git commit` การเปลี่ยนแปลงใดๆ ในเซสชันนี้
- หลัง deploy ระบบ auth ใหม่ พนักงาน CRM ทุกคนที่ login ค้างไว้จะถูกบังคับ login ใหม่ (token เก่าใช้ไม่ได้แล้ว)
