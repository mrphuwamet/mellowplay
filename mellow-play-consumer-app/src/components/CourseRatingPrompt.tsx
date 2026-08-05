import React, { useEffect, useState } from 'react';
import { Star, Check } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';

interface CourseRatingPromptProps {
  courseId: number;
  childId: number;
  bookingId: number;
}

const CourseRatingPrompt: React.FC<CourseRatingPromptProps> = ({ courseId, childId, bookingId }) => {
  const { lang } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [existingReview, setExistingReview] = useState<any | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient.get(`/courses/${courseId}/reviews`)
      .then(res => {
        if (res.data.success) {
          const mine = res.data.reviews.find((r: any) => r.booking_id === bookingId);
          if (mine) setExistingReview(mine);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId, bookingId]);

  const handleSubmit = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post('/courses/reviews', { courseId, childId, bookingId, rating, comment: comment.trim() || undefined });
      if (res.data.success) {
        setExistingReview({ rating, comment });
      }
    } catch (err) {
      console.error('Failed to submit review:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (existingReview) {
    return (
      <div className="bg-emerald-50 rounded-2xl p-3.5">
        <div className="flex items-center gap-1.5 mb-1">
          <Check size={14} className="text-emerald-600" />
          <p className="text-[12px] font-black text-emerald-600 uppercase tracking-widest">
            {lang === 'en' ? 'Thanks for your rating' : 'ขอบคุณสำหรับคะแนน'}
          </p>
        </div>
        <div className="flex gap-0.5 mb-1">
          {[1, 2, 3, 4, 5].map(i => (
            <Star key={i} size={16} className={i <= existingReview.rating ? 'text-amber-400' : 'text-slate-200'} fill="currentColor" />
          ))}
        </div>
        {existingReview.comment && <p className="text-sm text-slate-600 font-medium">{existingReview.comment}</p>}
      </div>
    );
  }

  return (
    <div className="bg-amber-50/60 rounded-2xl p-3.5">
      <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-2">
        {lang === 'en' ? 'Rate this class' : 'ให้คะแนนคลาสนี้'}
      </p>
      <div className="flex gap-1 mb-2">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            onClick={() => setRating(i)}
            onMouseEnter={() => setHoverRating(i)}
            onMouseLeave={() => setHoverRating(0)}
            className="active:scale-90 transition-transform"
          >
            <Star size={24} className={i <= (hoverRating || rating) ? 'text-amber-400' : 'text-slate-200'} fill="currentColor" />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={lang === 'en' ? 'Any feedback? (optional)' : 'ข้อเสนอแนะเพิ่มเติม (ถ้ามี)'}
            className="w-full text-sm p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-mellow-purple mb-2 resize-none"
            rows={2}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 bg-mellow-purple text-white rounded-xl font-black text-xs disabled:opacity-50 active:scale-95 transition-transform"
          >
            {submitting ? (lang === 'en' ? 'Submitting...' : 'กำลังส่ง...') : (lang === 'en' ? 'Submit Rating' : 'ส่งคะแนน')}
          </button>
        </>
      )}
    </div>
  );
};

export default CourseRatingPrompt;
