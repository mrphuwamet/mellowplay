const crypto = require('crypto');
const password = 'password123';
const hash = crypto.createHash('sha256').update(password).digest('hex');
console.log(hash);
