const fs = require('fs');
let content = fs.readFileSync('src/pages/Home.tsx', 'utf8');

// 1. Add cancelBookingId state
content = content.replace(
  "const [isCancelling, setIsCancelling] = React.useState<number | null>(null);",
  "const [isCancelling, setIsCancelling] = React.useState<number | null>(null);\n  const [cancelBookingId, setCancelBookingId] = React.useState<number | null>(null);"
);

// 2. Modify handleCancelBooking and add confirmCancelBooking
content = content.replace(
  "const handleCancelBooking = async (bookingId: number) => {",
  const handleCancelBooking = (bookingId: number) => {
    setCancelBookingId(bookingId);
  };

  const confirmCancelBooking = async () => {
    if (!cancelBookingId) return;
    setIsCancelling(cancelBookingId);
    try {
      const res = await apiClient.post(\/profiles/bookings/\/cancel\, { userId: user?.id });
      if (res.data.success) {
        setPendingBookings(prev => prev.filter(b => b.id !== cancelBookingId));
      }
    } catch (err) {
      console.error('Failed to cancel booking:', err);
    }
    setIsCancelling(null);
    setCancelBookingId(null);
  };

  const dummyHandleCancelBooking = async (bookingId: number) => {
);

// Clean up dummy
content = content.replace(
  /const dummyHandleCancelBooking = async \(bookingId: number\) => \{[\s\S]*?setIsCancelling\(null\);\n    \}\n  \};/,
  ""
);


// 3. Move pendingBookings out of Profile Section
const pendingBlockMatch = content.match(/\{\/\* Pending Bookings Banner \*\/\}[\s\S]*?\}\)\}\n              <\/div>\n            <\/div>\n          <\/div>\n        \)\}/);
if (pendingBlockMatch) {
  content = content.replace(pendingBlockMatch[0], "");
  
  const profileSectionEnd = content.indexOf("        <QuickAccess />");
  content = content.substring(0, profileSectionEnd) + pendingBlockMatch[0] + "\n\n" + content.substring(profileSectionEnd);
}

// 4. Add Modal at the end of return statement
const modalHtml = 
      {cancelBookingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isCancelling && setCancelBookingId(null)} />
          <div className="relative w-full max-w-xs bg-white rounded-3xl p-6 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{lang === 'en' ? 'Cancel Booking' : '????????????'}</h3>
            <p className="text-sm font-bold text-slate-500 mb-6">
              {lang === 'en' ? 'Are you sure you want to cancel this booking?' : '????????????????????????????????????'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelBookingId(null)}
                disabled={isCancelling === cancelBookingId}
                className="flex-1 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
              >
                {lang === 'en' ? 'No, Keep it' : '???, ??????'}
              </button>
              <button
                onClick={() => confirmCancelBooking()}
                disabled={isCancelling === cancelBookingId}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {isCancelling === cancelBookingId ? <Loader2 size={16} className="animate-spin" /> : (lang === 'en' ? 'Yes, Cancel' : '???, ??????')}
              </button>
            </div>
          </div>
        </div>
      )}
;

content = content.replace("      {isMenuOpen && (", modalHtml + "\n      {isMenuOpen && (");

// Import Loader2 if missing
if (!content.includes("Loader2")) {
  content = content.replace("import { ", "import { Loader2, ");
}

fs.writeFileSync('src/pages/Home.tsx', content);
console.log("Done");
