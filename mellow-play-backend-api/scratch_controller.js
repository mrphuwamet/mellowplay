const fs = require('fs');
let content = fs.readFileSync('src/controllers/profileController.ts', 'utf8');

content = content.replace(
  'const { name, nickname, birth_date, dob, relation } = await c.req.json();',
  'const { name, nickname, birth_date, dob, relation, gender } = await c.req.json();'
);

content = content.replace(
  'relation || \'\'\n      );',
  'relation || \'\',\n        gender || \'\'\n      );'
);

fs.writeFileSync('src/controllers/profileController.ts', content);
