import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, RotateCw } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

/**
 * Any address the app has no route for.
 *
 * Without this the router matched nothing and rendered nothing: a page with
 * the shell around it and a completely empty middle, which reads as broken
 * rather than as "that link is wrong", and offers no way out but the back
 * button.
 *
 * Reload is offered first, and deliberately. The likeliest reason a real
 * visitor lands here is not a typo — it is a tab that was open across a
 * deploy, running a build from before this route existed. To that build a
 * brand-new page is simply an address it does not know, and fetching the app
 * again is the entire fix. The wording says that plainly instead of asserting
 * the page is gone, which for that visitor would be false.
 */
const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useTranslation();

  return (
    <div className="mellow-page bg-[#fbfaf7] min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-mellow-purple/10 flex items-center justify-center mb-4">
        <Compass size={28} className="text-mellow-purple" />
      </div>

      <h1 className="text-[17px] font-black text-slate-800 mb-2">
        {lang === 'en' ? 'This page could not be opened' : 'เปิดหน้านี้ไม่ได้'}
      </h1>
      <p className="text-[13px] font-bold text-slate-500 leading-relaxed max-w-[300px] mb-1">
        {lang === 'en'
          ? 'The app may be running an older version than this link needs. Reloading usually fixes it.'
          : 'แอปอาจยังเป็นเวอร์ชันเก่ากว่าลิงก์นี้ — กดโหลดใหม่มักจะใช้ได้ทันที'}
      </p>
      {/* The address, so someone reporting this can say which one it was. */}
      <p className="text-[11px] font-bold text-slate-300 break-all max-w-[300px] mb-6">{location.pathname}</p>

      <div className="flex flex-col sm:flex-row gap-2 w-full max-w-[300px]">
        <button
          // A full load, not a router navigation: the point is to fetch the
          // app again, which navigating within it would never do.
          onClick={() => window.location.reload()}
          className="flex-1 py-3 rounded-2xl bg-mellow-purple text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <RotateCw size={16} />
          {lang === 'en' ? 'Reload' : 'โหลดใหม่'}
        </button>
        <button
          onClick={() => navigate('/')}
          className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-95 transition-transform"
        >
          {lang === 'en' ? 'Go home' : 'กลับหน้าแรก'}
        </button>
      </div>
    </div>
  );
};

export default NotFound;
