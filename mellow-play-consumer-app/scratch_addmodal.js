const fs = require('fs');
let content = fs.readFileSync('src/components/AddChildModal.tsx', 'utf8');

content = content.replace(
  "    dob: '',\n    relation: 'Mother',",
  "    dob: '',\n    gender: 'Boy',\n    relation: 'Mother',"
);

const genderUI = \            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                {lang === 'th' ? '???' : 'Gender'}
              </label>
              <select
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
              >
                <option value="Boy">{lang === 'th' ? '???' : 'Boy'}</option>
                <option value="Girl">{lang === 'th' ? '????' : 'Girl'}</option>
                <option value="Not Specified">{lang === 'th' ? '???????' : 'Not Specified'}</option>
              </select>
            </div>
\;

content = content.replace(
  '            <div>\n              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">\n                {t.register?.relationship || \\'Relationship\\'}</label>',
  genderUI + '\n            <div>\n              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">\n                {t.register?.relationship || \\'Relationship\\'}</label>'
);

fs.writeFileSync('src/components/AddChildModal.tsx', content);
