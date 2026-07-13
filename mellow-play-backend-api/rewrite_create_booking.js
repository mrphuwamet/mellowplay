const fs = require('fs');
const content = fs.readFileSync('src/controllers/adminController.ts', 'utf8');

const regex = /async createBooking\([^\{]+\{[\s\S]*?(?=async getCrmUsers)/;
const replacement = \sync createBooking(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const { childId, childIds, courseId, branchId, scheduledAt, isGuest, status,
              calendarId, slotDate, slotStartTime, paymentStatus, notes, ageGroup, couponTypeId, promoCode } = await c.req.json();
      
      if (!courseId || !branchId || !scheduledAt)
        return c.json({ success: false, message: 'courseId, branchId, scheduledAt required' }, 400);

      let ids = childIds ? childIds : (childId ? [childId] : []);
      if (isGuest) ids = [0];
      const parsedChildIds = ids.map((id: any) => parseInt(id) || 0);

      if (parsedChildIds.length === 0) {
        return c.json({ success: false, message: 'No children selected' }, 400);
      }

      const db = config.db;

      // Check for duplicates
      for (const parsedChildId of parsedChildIds) {
        if (parsedChildId > 0) {
          
          // Check 1: Duplicate course registration
          const { results: existingBookings } = await db.prepare(\\\
            SELECT id, status FROM Bookings 
            WHERE child_id = ? AND course_id = ? 
              AND status IN ('confirmed', 'pending_payment', 'completed')
          \\\).bind(parsedChildId, parseInt(courseId)).all();

          if (existingBookings.length > 0) {
            return c.json({ 
              success: false, 
              error_code: 'DUPLICATE_BOOKING',
              message: 'One of the selected children has already registered for this class.',
              bookingId: existingBookings[0].id
            }, 400);
          }

          // Check 2: Extra Class same day restriction
          const { results: courseDetails } = await db.prepare(\\\
            SELECT is_extraclass FROM Courses WHERE id = ?
          \\\).bind(parseInt(courseId)).all();

          const isExtraClass = courseDetails[0]?.is_extraclass;

          if (isExtraClass) {
            const targetDate = scheduledAt.split('T')[0];
            const { results: sameDayExtraBookings } = await db.prepare(\\\
              SELECT b.id FROM Bookings b
              JOIN Courses c ON b.course_id = c.id
              WHERE b.child_id = ? 
                AND c.is_extraclass = 1
                AND b.scheduled_at LIKE ?
                AND b.status IN ('confirmed', 'pending_payment', 'completed')
            \\\).bind(parsedChildId, \\\\%\\\).all();

            if (sameDayExtraBookings.length > 0) {
              return c.json({ 
                success: false, 
                error_code: 'EXTRA_CLASS_LIMIT',
                message: 'One of the children cannot book multiple extra classes on the same day.',
                bookingId: sameDayExtraBookings[0].id
              }, 400);
            }
          }
        }
      }

      const bookingIds = [];
      for (const parsedChildId of parsedChildIds) {
        const id = await adminRepo.createBooking({
          childId: parsedChildId,
          courseId: parseInt(courseId),
          branchId: parseInt(branchId),
          scheduledAt,
          ageGroup: ageGroup || 'junior',
          status: status || 'pending_payment',
          calendarId: calendarId ? parseInt(calendarId) : undefined,
          slotDate: slotDate ?? undefined,
          slotStartTime: slotStartTime ?? undefined,
          paymentStatus: paymentStatus || 'pending',
          notes: notes ?? undefined,
        });
        bookingIds.push(id);
      }

      const firstId = bookingIds[0];
      let beamPaymentUrl = '';
      let beamSessionId = '';

      if (!status || status === 'pending_payment') {
        try {
          const BEAM_API_KEY = c.env.BEAM_API_KEY;
          const BEAM_MERCHANT_ID = c.env.BEAM_MERCHANT_ID;
          if (!BEAM_API_KEY || !BEAM_MERCHANT_ID) {
            throw new Error('Beam credentials not found');
          }

          const authString = btoa(\\\\:\\\\);
          const baseUrl = c.req.header('origin') || 'http://localhost:5173';
          const redirectUrl = \\\\/booking-success?bookingId=\\\\;

          const payload = {
            linkSettings: {
              card: { isEnabled: true },
              qrPromptPay: { isEnabled: true },
              eWallets: { isEnabled: true },
              mobileBanking: { isEnabled: true }
            },
            order: {
              currency: "THB",
              netAmount: parsedChildIds.length, // Minimum integer test amount * number of children
              description: \\\Booking IDs: \\\\,
              referenceId: \\\BK-\-\\\\
            },
            redirectUrl: redirectUrl
          };

          const res = await fetch('https://api.beamcheckout.com/api/v1/payment-links', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': \\\Basic \\\\
            },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
          }

          const data = await res.json();
          beamPaymentUrl = data.url;
          beamSessionId = data.id;
        } catch (e: any) {
          const logger = new SystemLogger(config.db);
          await logger.error('beam-payment', e);
          
          return c.json({ 
            success: false, 
            message: '??????????????????? ???????????????????? ?????????????????'
          }, 500);
        }

        for (const id of bookingIds) {
          await config.db.prepare('UPDATE Bookings SET beam_session_id=? WHERE id=?').bind(beamSessionId, id).run();
        }
      }

      return c.json({ success: true, id: firstId, bookingIds, paymentUrl: beamPaymentUrl });
    } catch (error: any) {
      const logger = new SystemLogger(c.env.DB ? c.env.DB : (new ConfigService(c.env)).db);
      await logger.error('create-booking', error);
      return c.json({ success: false, message: '???????????' }, 500);
    }
  }

  \;

const newContent = content.replace(regex, replacement);
fs.writeFileSync('src/controllers/adminController.ts', newContent);
console.log('Replaced createBooking successfully.');
