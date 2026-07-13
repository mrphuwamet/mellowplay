const fs = require('fs');
const cp = require('child_process');

cp.execSync('git restore src/pages/Home.tsx');

require('./scratch_rewrite_home.cjs');
require('./scratch_rewrite_home3.cjs');

let content = fs.readFileSync('src/pages/Home.tsx', 'utf8');

if (!content.includes("import apiClient from '../utils/apiClient';")) {
    content = content.replace("import defaultAvatar from '../assets/ui/default-avatar.svg';", "import defaultAvatar from '../assets/ui/default-avatar.svg';\nimport apiClient from '../utils/apiClient';");
}

const searchAvatarSectionRegex = /<div className="flex-shrink-0">[\s\S]*?<div className="flex-1">/;
const newAvatarSection = `<div className="flex-shrink-0">
              {isGuest ? (
                <div className="w-20 h-20 rounded-[28px] bg-slate-200 flex items-center justify-center shadow-lg ring-4 ring-white/60 overflow-hidden">
                  <img src={defaultAvatar} alt="Guest" className="w-12 h-12 opacity-60 grayscale brightness-50" />
                </div>
              ) : (
                <button 
                  onClick={() => currentChild ? setIsAvatarPickerOpen(true) : setIsAddChildOpen(true)}
                  className="relative block transition-transform active:scale-95"
                >
                  <ChildAvatar avatarType={currentChild?.avatar} className="w-20 h-20 rounded-[28px] ring-4 ring-white/60 shadow-lg" />
                </button>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1">`;

content = content.replace(searchAvatarSectionRegex, newAvatarSection);

fs.writeFileSync('src/pages/Home.tsx', content);
console.log("Successfully rebuilt Home.tsx");
