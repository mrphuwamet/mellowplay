const fs = require('fs');
const path = require('path');

// This script will read Booking.tsx and generate a new version
const file = path.join('c:/Users/mrphu/mellow-play/repos/mellow-play-consumer-app/src/pages/Booking.tsx');
let content = fs.readFileSync(file, 'utf8');

// I will do multi_replace to safely update it. But it's too big.
