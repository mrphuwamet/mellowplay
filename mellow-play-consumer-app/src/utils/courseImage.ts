import { API_BASE_URL } from './apiClient';

export interface CourseImageView {
  imageUrl: string;
  focalX: number;
  focalY: number;
  zoom?: number;
}

export type CourseImageViews = Record<string, CourseImageView>;

export const resolveImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  const cleanUrl = url.startsWith('/api/v1') ? url.replace('/api/v1', '') : url;
  return `${API_BASE_URL}${cleanUrl}`;
};

// Picks the image + focal point + zoom configured for a given display context
// (square/card/banner — see backend src/constants/imageViews.ts), falling
// back to the course thumbnail centered/unzoomed when a course hasn't set
// that view up. `style` is meant to be spread straight onto an
// object-fit: cover <img> — zoom is a CSS transform (scale) centered on the
// same focal point, no new image files are produced.
export const getCourseView = (
  course: { thumbnail_url?: string; image_views?: CourseImageViews },
  viewKey: 'square' | 'card' | 'banner',
) => {
  const view = course.image_views?.[viewKey];
  const url = view?.imageUrl || resolveImageUrl(course.thumbnail_url);
  const focalX = view?.focalX ?? 50;
  const focalY = view?.focalY ?? 50;
  const zoom = view?.zoom ?? 1;
  const objectPosition = `${focalX}% ${focalY}%`;
  return {
    url,
    objectPosition,
    zoom,
    style: { objectPosition, transform: `scale(${zoom})`, transformOrigin: objectPosition },
  };
};
