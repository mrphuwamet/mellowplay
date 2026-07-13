const fs = require('fs');
let content = fs.readFileSync('src/repositories/hdProfileRepository.ts', 'utf8');

content = content.replace(
  'async updateChildProfile(childId: number, name: string, nickname: string, birth_date: string, relation: string): Promise<boolean> {',
  'async updateChildProfile(childId: number, name: string, nickname: string, birth_date: string, relation: string, gender: string = ""): Promise<boolean> {'
);

content = content.replace(
  'UPDATE HD_Profiles SET name = ?, nickname = ?, birth_date = ?, relation = ? WHERE id = ?',
  'UPDATE HD_Profiles SET name = ?, nickname = ?, birth_date = ?, relation = ?, gender = ? WHERE id = ?'
);

content = content.replace(
  '.bind(name, nickname, birth_date, relation, child.hd_profile_id)',
  '.bind(name, nickname, birth_date, relation, gender, child.hd_profile_id)'
);

fs.writeFileSync('src/repositories/hdProfileRepository.ts', content);
