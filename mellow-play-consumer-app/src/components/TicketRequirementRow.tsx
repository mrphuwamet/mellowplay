import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, Plus } from 'lucide-react';

interface CouponRequirement {
  typeId: string;
  label: string;
  count: number;
}

interface ChildCoupon {
  id: number;
  name: string;
  color: string;
  balance: number;
}

interface TicketRequirementRowProps {
  course: any;
  childCoupons?: ChildCoupon[];
  lang?: 'th' | 'en';
}

const TicketRequirementRow: React.FC<TicketRequirementRowProps> = ({ course, childCoupons = [], lang = 'th' }) => {
  const navigate = useNavigate();

  let requirements: CouponRequirement[] = [];
  try {
    requirements = course.coupon_requirements_json ? JSON.parse(course.coupon_requirements_json) : [];
  } catch {
    requirements = [];
  }

  if (requirements.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mb-3">
      {requirements.map((req, i) => {
        const owned = childCoupons.find(c => String(c.id) === String(req.typeId));
        const balance = owned?.balance || 0;
        const insufficient = balance < req.count;
        return (
          <div key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: owned?.color || '#A78BFA' }} />
              <span className="text-[12px] font-bold text-slate-600 truncate">
                {req.label} x{req.count}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`flex items-center gap-1 text-[12px] font-black ${insufficient ? 'text-red-500' : 'text-emerald-600'}`}>
                <Ticket size={11} />
                {balance}
              </span>
              {insufficient && (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate('/my-coupons'); }}
                  className="flex items-center gap-0.5 text-[11px] font-black text-white bg-mellow-purple px-1.5 py-0.5 rounded-md active:scale-95 transition-transform"
                >
                  <Plus size={10} />
                  {lang === 'en' ? 'Buy' : 'ซื้อ'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TicketRequirementRow;
