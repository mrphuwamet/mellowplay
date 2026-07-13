const fs = require('fs');
const targetFile = 'c:/Users/mrphu/mellow-play/repos/mellow-play-backend-api/src/controllers/adminController.ts';
let content = fs.readFileSync(targetFile, 'utf8');

// I will replace createBooking function.
const oldFuncStart = content.indexOf('async createBooking(c: Context');
const nextFuncStart = content.indexOf('async getCrmUsers(c: Context', oldFuncStart);

const newFunc = `async createBooking(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const { childId, courseId, branchId, scheduledAt, isGuest, status,
              calendarId, slotDate, slotStartTime, paymentStatus, paymentMethod, promoCode, notes, ageGroup } = await c.req.json();
      if (!courseId || (!branchId && branchId !== null) || !scheduledAt)
        return c.json({ success: false, message: 'courseId, branchId, scheduledAt required' }, 400);

      const cid = isGuest ? 0 : (parseInt(childId) || 0);
      const ag = ageGroup || 'junior';
      
      let finalPrice = 0;
      const course = await config.db.prepare('SELECT original_price, original_price_junior, original_price_little_junior FROM Courses WHERE id=?').bind(parseInt(courseId)).first() as any;
      const basePrice = course?.original_price || (ag === 'little_junior' ? (course?.original_price_little_junior ?? 0) : (course?.original_price_junior ?? 0));
      finalPrice = basePrice;

      if (paymentMethod === 'cash') {
        // Validate Promo Code
        if (promoCode) {
          const promo = await config.db.prepare('SELECT * FROM Promotions WHERE code=? AND is_active=1 AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)').bind(promoCode).first() as any;
          if (promo) {
             let discount = 0;
             if (promo.discount_percent > 0) discount = basePrice * (promo.discount_percent / 100);
             else if (promo.discount_amount > 0) discount = promo.discount_amount;
             finalPrice = Math.max(0, basePrice - discount);
          } else {
             return c.json({ success: false, message: 'Invalid or expired promo code' }, 400);
          }
        }

        // Mock Beam Checkout 
        const mockBeamSessionId = 'beam_sess_' + Math.random().toString(36).substring(7);
        const mockPaymentUrl = \`https://mock.beam.co/checkout/\${mockBeamSessionId}\`;

        const id = await adminRepo.createBooking({
          childId: cid,
          courseId: parseInt(courseId),
          branchId: branchId ? parseInt(branchId) : null,
          scheduledAt,
          ageGroup: ag,
          status: 'pending_payment',
          calendarId: calendarId ? parseInt(calendarId) : undefined,
          slotDate: slotDate ?? undefined,
          slotStartTime: slotStartTime ?? undefined,
          paymentStatus: 'pending',
          notes: notes ?? undefined,
        });

        // Save Beam session id (we should update the repository to support beam_session_id, but for now we run update)
        await config.db.prepare('UPDATE Bookings SET beam_session_id=? WHERE id=?').bind(mockBeamSessionId, id).run();

        return c.json({ success: true, id, paymentUrl: mockPaymentUrl, finalPrice });
      }

      // Default (Stamp)
      if (cid > 0) {
        const couponColumn = ag === 'little_junior' ? 'little_junior_balance' : 'junior_balance';
        const balance = await config.db.prepare(\`SELECT \${couponColumn} FROM Member_Coupons WHERE child_id = ?\`).bind(cid).first() as any;
        
        if (!balance || (balance[couponColumn] as number) <= 0) {
          return c.json({ success: false, message: 'Insufficient coupons for this child' }, 400);
        }

        await config.db.prepare(\`
          UPDATE Member_Coupons 
          SET \${couponColumn} = \${couponColumn} - 1, updated_at = CURRENT_TIMESTAMP 
          WHERE child_id = ?
        \`).bind(cid).run();

        const id = await adminRepo.createBooking({
          childId: cid,
          courseId: parseInt(courseId),
          branchId: branchId ? parseInt(branchId) : null,
          scheduledAt,
          ageGroup: ag,
          status: status || 'confirmed',
          calendarId: calendarId ? parseInt(calendarId) : undefined,
          slotDate: slotDate ?? undefined,
          slotStartTime: slotStartTime ?? undefined,
          paymentStatus: 'prepaid',
          notes: notes ?? undefined,
        });

        const parent = await config.db.prepare('SELECT parent_id FROM Children WHERE id=?').bind(cid).first() as any;
        const userId = parent?.parent_id ?? null;

        await config.db.prepare(\`
          INSERT INTO Transactions (branch_id, user_id, child_id, type, amount, payment_method, item_type, course_id, booking_id)
          VALUES (?, ?, ?, 'class_booking', ?, 'coupon', ?, ?, ?)
        \`).bind(branchId ? parseInt(branchId) : null, userId, cid, basePrice, ag, parseInt(courseId), id).run();

        const materialRepo = new CourseMaterialRepository(config.db);
        await materialRepo.reserveStock(id, parseInt(courseId));

        return c.json({ success: true, id });
      }

      return c.json({ success: false, message: 'Invalid booking configuration' }, 400);
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  `;

content = content.substring(0, oldFuncStart) + newFunc + content.substring(nextFuncStart);
fs.writeFileSync(targetFile, content);
