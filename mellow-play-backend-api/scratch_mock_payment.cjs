const db = require('better-sqlite3')('c:/Users/mrphu/mellow-play/repos/mellow-play-backend-api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/7b7f2f11c76ba7350dbdb1d3f9e83cf66ed7117e3350284ab9fb7b6537bfcecb.sqlite');

try {
  db.exec(`
    UPDATE Bookings SET status = 'confirmed', payment_status = 'paid' WHERE id = 11;
    INSERT INTO Transactions (branch_id, user_id, child_id, type, amount, payment_method, item_type, quantity, booking_id)
    SELECT branch_id, (SELECT parent_id FROM Children WHERE id = child_id), child_id, 'booking', 1, 'promptpay', 'little_junior', 1, id 
    FROM Bookings WHERE id = 11;
  `);
  console.log('Booking 11 mocked successfully!');
} catch (e) {
  console.error(e);
}
