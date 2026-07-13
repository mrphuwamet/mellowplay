const fs = require('fs');
const targetFile = 'c:/Users/mrphu/mellow-play/repos/mellow-play-consumer-app/src/translations.ts';
let content = fs.readFileSync(targetFile, 'utf8');

// Remove the wrongly added booking blocks at the end (from line 615 down)
const lastGoodLineStr = `        prompt: '"ครั้งล่าสุดที่น้องรู้สึกว่าเก่งขึ้น คือเรื่องอะไร?"',
      },
    },`;
const correctEndIndex = content.indexOf(lastGoodLineStr) + lastGoodLineStr.length;
content = content.substring(0, correctEndIndex) + `\n  },\n} as const;\n`;

// Add English booking block
const enEndStr = `        prompt: '"What was the last thing that made you feel like you got better at something?"',
      },
    },`;
const enInsertIndex = content.indexOf(enEndStr) + enEndStr.length;
const enBookingStr = `\n    booking: {
      title: 'Book a Class',
      stepCourse: 'Select Class',
      stepChild: 'Select Child',
      stepBranch: 'Select Branch',
      stepDate: 'Select Date',
      stepTime: 'Select Time',
      stepPayment: 'Select Payment',
      nextStep: 'Next Step',
      addChild: 'Add Child',
      full: 'Full',
      availableSeats: 'Available',
      seats: 'seats',
      stamps: 'Stamps',
      stampPayment: 'Use Class Stamp',
      stampDeduct: 'Deduct 1 stamp from package',
      haveStamps: 'Have',
      cashPayment: 'Pay via Beam',
      cashDesc: 'Credit Card, PromptPay',
      promoCode: 'Promo Code',
      promoPlaceholder: 'Enter promo code',
      confirmStamp: 'Confirm booking (1 Stamp)',
      confirmCash: 'Proceed to Payment',
      fillAllInfo: 'Please fill all information',
      insufficientStamps: 'Insufficient stamp balance',
      bookingError: 'Booking error occurred',
      bookingSuccess: 'Booking Confirmed!',
      bookingSuccessDesc: '1 stamp has been deducted from your account',
      bookingId: 'Booking ID',
      childInClass: 'Child',
      course: 'Class',
      branch: 'Branch',
      date: 'Date',
      time: 'Time',
      backToHome: 'Back to Home',
      noClasses: 'No classes available at the moment',
      viewAllDetails: 'View full details',
      closeWindow: 'Close window',
      year: 'yrs',
      month: 'mos',
    },`;
content = content.substring(0, enInsertIndex) + enBookingStr + content.substring(enInsertIndex);

// Add Thai booking block
const thEndStr = `        prompt: '"ครั้งล่าสุดที่น้องรู้สึกว่าเก่งขึ้น คือเรื่องอะไร?"',
      },
    },`;
const thInsertIndex = content.indexOf(thEndStr) + thEndStr.length;
const thBookingStr = `\n    booking: {
      title: 'จองคลาสเรียน',
      stepCourse: 'เลือกคลาส',
      stepChild: 'เลือกผู้เรียน',
      stepBranch: 'เลือกสาขา',
      stepDate: 'เลือกวันที่',
      stepTime: 'เลือกรอบเวลา',
      stepPayment: 'เลือกวิธีชำระเงิน',
      nextStep: 'ขั้นตอนถัดไป',
      addChild: 'เพิ่มผู้เรียน',
      full: 'เต็ม',
      availableSeats: 'ว่าง',
      seats: 'ที่',
      stamps: 'Stamps',
      stampPayment: 'ใช้แสตมป์คลาสเรียน',
      stampDeduct: 'หัก 1 แสตมป์จากแพ็กเกจ',
      haveStamps: 'มี',
      cashPayment: 'ชำระเงิน (Beam)',
      cashDesc: 'บัตรเครดิต, พร้อมเพย์',
      promoCode: 'โค้ดส่วนลด (Promo Code)',
      promoPlaceholder: 'กรอกโค้ดส่วนลด',
      confirmStamp: 'ยืนยันการจอง 1 สแตมป์',
      confirmCash: 'ไปหน้าชำระเงิน',
      fillAllInfo: 'กรุณากรอกข้อมูลให้ครบถ้วน',
      insufficientStamps: 'ยอดคูปองสแตมป์ไม่เพียงพอ',
      bookingError: 'เกิดข้อผิดพลาดในการส่งข้อมูลการจอง',
      bookingSuccess: 'ยืนยันการจองสำเร็จ!',
      bookingSuccessDesc: 'คูปองของคุณถูกหักออก 1 สแตมป์เรียบร้อยแล้ว',
      bookingId: 'รหัสการจอง',
      childInClass: 'เด็กผู้เข้าเรียน',
      course: 'Class',
      branch: 'สาขา',
      date: 'วันที่',
      time: 'เวลา',
      backToHome: 'กลับสู่หน้าหลัก',
      noClasses: 'ไม่พบรอบเรียนในขณะนี้',
      viewAllDetails: 'ดูรายละเอียดทั้งหมด',
      closeWindow: 'ปิดหน้าต่าง',
      year: 'ขวบ',
      month: 'เดือน',
    },`;
content = content.substring(0, thInsertIndex) + thBookingStr + content.substring(thInsertIndex);

fs.writeFileSync(targetFile, content);
