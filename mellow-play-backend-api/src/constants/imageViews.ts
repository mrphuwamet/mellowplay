// Canonical list of every place a course image is displayed across the
// system (CRM preview, Consumer app). This is the single source of truth —
// the CRM and Consumer app both read it via GET /api/v1/image-views instead
// of keeping their own copies, so a change here propagates everywhere.
export interface ImageViewDef {
  key: string;
  label: string;
  labelEn: string;
  ratioW: number;
  ratioH: number;
  recommendedWidth: number;
  recommendedHeight: number;
  usageNote: string;
}

export const IMAGE_VIEWS: ImageViewDef[] = [
  {
    key: 'square',
    label: 'สี่เหลี่ยมจัตุรัส',
    labelEn: 'Square',
    ratioW: 1,
    ratioH: 1,
    recommendedWidth: 800,
    recommendedHeight: 800,
    usageNote: 'รูปวงกลม/สี่เหลี่ยมเล็กในหน้า Roadmap และรายการจองที่กำลังจะถึง',
  },
  {
    key: 'card',
    label: 'การ์ดคลาส',
    labelEn: 'Card',
    ratioW: 4,
    ratioH: 3,
    recommendedWidth: 800,
    recommendedHeight: 600,
    usageNote: 'การ์ดในรายการคลาส หน้า Explore และหน้าแรก',
  },
  {
    key: 'banner',
    label: 'แบนเนอร์',
    labelEn: 'Banner',
    ratioW: 16,
    ratioH: 9,
    recommendedWidth: 1200,
    recommendedHeight: 675,
    usageNote: 'แบนเนอร์หน้ารายละเอียดคลาส และหน้าต่างจองคลาส',
  },
];

export const DEFAULT_FOCAL = { focalX: 50, focalY: 50, zoom: 1 };

// Zoom is applied as a CSS transform (scale, centered on the focal point) on
// top of the object-fit: cover + object-position crop — clamp to a sane
// range so a bad value can't blow the image up to nothing visible.
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const clampZoom = (zoom: any) => {
  const n = Number(zoom);
  if (!Number.isFinite(n)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
};

export const getImageView = (key: string) => IMAGE_VIEWS.find(v => v.key === key);

// Unlike IMAGE_VIEWS above (one curated image per course per view), the
// poster gallery on the Consumer course-detail page shows EVERY uploaded
// image (thumbnail + gallery) in a swipeable 4:5 strip — so each individual
// image gets its own focal point instead of one image being assigned to
// this "view". See Course_Image_Focals table / adminController image-focals
// endpoints.
export const POSTER_VIEW = {
  key: 'poster',
  label: 'โปสเตอร์',
  labelEn: 'Poster',
  ratioW: 4,
  ratioH: 5,
  recommendedWidth: 864,
  recommendedHeight: 1080,
  usageNote: 'แกลเลอรีโปสเตอร์แบบเลื่อนดูได้ในหน้ารายละเอียดคลาส (Consumer) — ใช้ได้ทุกรูปที่อัปโหลด',
};
