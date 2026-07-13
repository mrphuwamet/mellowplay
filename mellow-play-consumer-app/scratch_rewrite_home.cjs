const fs = require('fs');
let content = fs.readFileSync('src/pages/Home.tsx', 'utf8');

// 1. Imports
content = content.replace(
  "import ReportDisplay from '../components/ReportDisplay';",
  "import AddChildModal from '../components/AddChildModal';\nimport EditChildModal from '../components/EditChildModal';\nimport AvatarPickerModal from '../components/AvatarPickerModal';\nimport ChildAvatar from '../components/ChildAvatar';\nimport ReportDisplay from '../components/ReportDisplay';"
);

// 2. States
content = content.replace(
  "const [isMenuOpen, setIsMenuOpen] = React.useState(false);",
  "const [isMenuOpen, setIsMenuOpen] = React.useState(false);\n  const [isAddChildOpen, setIsAddChildOpen] = React.useState(false);\n  const [isEditChildOpen, setIsEditChildOpen] = React.useState(false);\n  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = React.useState(false);\n  const [recommendedCourses, setRecommendedCourses] = React.useState<any[]>([]);\n  const [latestClass, setLatestClass] = React.useState<any | null>(null);"
);

// 3. Child map - Change Avatar Display
content = content.replace(
  /\{child\.avatar \|\| \(child\.relation === 'son' \? '👦' : '👧'\)\}/g,
  "<ChildAvatar avatarType={child.avatar} className=\"w-10 h-10\" />"
);

// 4. Current Child Display
content = content.replace(
  /\{currentChild\?\.avatar \|\| \(currentChild\?\.relation === 'son' \? '👦' : '👧'\)\}/g,
  "<ChildAvatar avatarType={currentChild?.avatar} className=\"w-20 h-20 ring-4 ring-white/60 shadow-lg\" />"
);

// 5. Button to Edit Modal and Avatar Picker trigger
content = content.replace(
  /<button\s+onClick=\{\(\) => setIsAddChildOpen\(true\)\}/g,
  "<button onClick={() => currentChild ? setIsAvatarPickerOpen(true) : setIsAddChildOpen(true)}"
);

// 6. Profile Name & Edit Button
const searchProfileName = `<h2 className="text-[22px] leading-none font-black text-slate-800 mb-2">\n                      {currentChild?.name || (lang === 'th' ? 'เพิ่มข้อมูลเด็ก' : 'Add My Child')}\n                    </h2>`;

const replaceProfileName = `<div className="flex items-center gap-2 mb-2">
                      <button 
                        onClick={() => !currentChild && setIsAddChildOpen(true)}
                        className={\`text-[22px] leading-none font-black text-slate-800 text-left transition-opacity \${!currentChild ? 'hover:opacity-70 text-mellow-purple underline decoration-2 underline-offset-4' : ''}\`}
                      >
                        {currentChild?.name || (lang === 'th' ? 'เพิ่มข้อมูลเด็ก' : 'Add My Child')}
                      </button>
                      {currentChild && (
                        <button 
                          onClick={() => setIsEditChildOpen(true)}
                          className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                        >
                          <Settings size={14} />
                        </button>
                      )}
                    </div>`;

content = content.replace(searchProfileName, replaceProfileName);

// 7. Modals at bottom
content = content.replace(
  /<\/main>/,
  `</main>\n\n      <AddChildModal \n        isOpen={isAddChildOpen} \n        onClose={() => setIsAddChildOpen(false)} \n      />\n\n      <EditChildModal\n        isOpen={isEditChildOpen}\n        onClose={() => setIsEditChildOpen(false)}\n        childInfo={currentChild && currentChild.id !== 'guest' ? {\n          id: currentChild.id as number,\n          name: currentChild.name,\n          nickname: '',\n          dob: '', \n          relation: currentChild.hd_profile || 'Mother'\n        } : undefined}\n      />\n\n      <AvatarPickerModal\n        isOpen={isAvatarPickerOpen}\n        onClose={() => setIsAvatarPickerOpen(false)}\n        currentAvatar={currentChild?.avatar || ''}\n        childId={currentChild?.id !== 'guest' ? currentChild?.id : undefined}\n        onSelect={(avatarId) => {\n          if (currentChild && currentChild.id !== 'guest') {\n            useChildStore.getState().updateAvatar(currentChild.id, avatarId);\n          }\n        }}\n      />`
);

// Write back
fs.writeFileSync('src/pages/Home.tsx', content);
