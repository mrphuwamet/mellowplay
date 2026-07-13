const fs = require('fs');
let content = fs.readFileSync('src/pages/Booking.tsx', 'utf8');

content = content.replace(
  'const [selectedChild, setSelectedChild] = useState<any>(null);',
  'const [selectedChildren, setSelectedChildren] = useState<any[]>([]);'
);

content = content.replace(
  /if \(children\.length > 0 && !selectedChild\) \{\s*const activeChild = children\.find\(c => c\.id === selectedChildId\) \|\| children\[0\];\s*setSelectedChild\(activeChild\);\s*\}/,
  \if (children.length > 0 && selectedChildren.length === 0) {
      const activeChild = children.find(c => c.id === selectedChildId) || children[0];
      setSelectedChildren([activeChild]);
    }\
);

content = content.replace(
  'const birthYear = selectedChild?.birth_date ? new Date(selectedChild.birth_date).getFullYear() : 2020;',
  'const birthYear = selectedChildren[0]?.birth_date ? new Date(selectedChildren[0].birth_date).getFullYear() : 2020;'
);

content = content.replace(
  'const stampBalance = ageGroup === \\'little_junior\\' ? (selectedChild?.littleJuniorBalance ?? 0) : (selectedChild?.juniorBalance ?? 0);',
  'const stampBalance = selectedChildren.length > 0 ? selectedChildren.reduce((sum, child) => sum + (ageGroup === \\'little_junior\\' ? (child.littleJuniorBalance ?? 0) : (child.juniorBalance ?? 0)), 0) : 0;'
);

content = content.replace(
  'if (!selectedChild || !selectedCourse) {',
  'if (selectedChildren.length === 0 || !selectedCourse) {'
);

// Coupon check
content = content.replace(
  /const childCoupon = selectedChild\?\.coupons\?\.find\(\(c: any\) => c\.id === selectedCoupon\);\s*if \(!selectedCourseCoupon \|\| !childCoupon \|\| childCoupon\.balance < selectedCourseCoupon\.quantity_required\) \{/,
  \if (!selectedCourseCoupon) {
        setErrorMsg(t.booking?.insufficientStamps || '??????????????????');
        setTimeout(() => setErrorMsg(''), 3000);
        return;
      }
      for (const child of selectedChildren) {
        const childCoupon = child?.coupons?.find((c: any) => c.id === selectedCoupon);
        if (!childCoupon || childCoupon.balance < selectedCourseCoupon.quantity_required) {
          setErrorMsg(\\\??????????? \ ??????????\\\);
          setTimeout(() => setErrorMsg(''), 3000);
          return;
        }
      }\
);

// Payload
content = content.replace(
  'childId: selectedChild.id,',
  'childIds: selectedChildren.map(c => c.id),'
);

// Success booking
content = content.replace(
  'childName: selectedChild.name,',
  'childName: selectedChildren.map(c => c.nickname || c.name).join(\\, \\),'
);

// Top progress bar
content = content.replace(
  /\{selectedChild && currentStepIndex > 1 && \(\s*<p className="text-xs font-black text-slate-800 line-clamp-1">\{selectedChild\.nickname \|\| selectedChild\.name\}<\/p>\s*\)\}/,
  \{selectedChildren.length > 0 && currentStepIndex > 1 && (
                     <p className="text-xs font-black text-slate-800 line-clamp-1">{selectedChildren.map(c => c.nickname || c.name).join(', ')}</p>
                   )}\
);

// Toggle selection
content = content.replace(
  /onClick=\{\(\) => setSelectedChild\(child\)\} className=\{\\\p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all \\\$\{selectedChild\?\.id === child\.id \? 'bg-white border-mellow-purple ring-2 ring-mellow-purple\/10' : 'bg-white border-slate-100 opacity-70'\}\\\\}/,
  \onClick={() => {
                  setSelectedChildren(prev => {
                    const isSelected = prev.find(c => c.id === child.id);
                    if (isSelected) return prev.filter(c => c.id !== child.id);
                    return [...prev, child];
                  });
                }} className={\\\p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all \\\\\\}\
);

// Next button
content = content.replace(
  '<button disabled={!selectedChild} onClick={() => setCurrentStepIndex(currentStepIndex + 1)}',
  '<button disabled={selectedChildren.length === 0} onClick={() => setCurrentStepIndex(currentStepIndex + 1)}'
);

// Available coupons display
content = content.replace(
  'const childCoupon = selectedChild?.coupons?.find((c: any) => c.id === cc.id);',
  \// In UI, we show coupon balance for the first child or combined?
                  // We require ALL children to have it. Let's just show minimum balance across selected children.
                  const childCoupon = { balance: Math.min(...selectedChildren.map(child => child?.coupons?.find((c: any) => c.id === cc.id)?.balance || 0)) };\
);

fs.writeFileSync('src/pages/Booking.tsx', content);
