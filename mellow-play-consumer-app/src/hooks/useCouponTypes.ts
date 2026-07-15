import { useEffect, useState } from 'react';
import apiClient from '../utils/apiClient';

export interface CouponType {
  id: number;
  name: string;
  color: string;
  icon_url?: string;
}

// Fetched once per page and looked up by typeId so course cards/detail can
// show a coupon's real configured color — independent of whether the
// viewing child happens to already own a balance of it.
export function useCouponTypes() {
  const [couponTypes, setCouponTypes] = useState<CouponType[]>([]);

  useEffect(() => {
    apiClient.get('/admin/coupon-types')
      .then(res => { if (res.data.success) setCouponTypes(res.data.couponTypes); })
      .catch(() => {});
  }, []);

  return couponTypes;
}

export interface CourseCouponRequirement {
  typeId: string;
  label: string;
  count: number;
}

// The course's first configured coupon requirement, resolved against the
// full coupon-type list for its real color/icon.
export function getPrimaryCouponRequirement(course: any, couponTypes: CouponType[]) {
  let requirements: CourseCouponRequirement[] = [];
  try {
    requirements = course?.coupon_requirements_json ? JSON.parse(course.coupon_requirements_json) : [];
  } catch {
    return null;
  }
  if (!requirements.length) return null;
  const req = requirements[0];
  const type = couponTypes.find(t => String(t.id) === String(req.typeId));
  return { ...req, color: type?.color || '#A78BFA', icon_url: type?.icon_url };
}
