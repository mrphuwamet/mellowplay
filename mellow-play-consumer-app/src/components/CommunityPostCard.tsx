import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Send, Trash2, MapPin, Check, AlertCircle, Flag } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import { resolveImageUrl } from '../utils/courseImage';
import { formatCustomDate } from '../utils/dateFormat';
import { extractYouTubeEmbedUrl } from '../utils/youtubeEmbed';
import ResponsiveModal from './ResponsiveModal';

interface CommunityPostCardProps {
  post: any;
  onUpdate: (postId: number, patch: Record<string, any>) => void;
  onDeleted: (postId: number) => void;
}

// Comments are fetched lazily per-card (only on first expand) rather than
// eagerly for the whole feed, since a feed can hold many posts at once —
// unlike NewsDetail, which only ever shows one article's comments.
const CommunityPostCard: React.FC<CommunityPostCardProps> = ({ post, onUpdate, onDeleted }) => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const isLoggedIn = !!localStorage.getItem('mellow_token');
  const userJson = localStorage.getItem('mellow_user');
  const currentUserId = userJson ? JSON.parse(userJson)?.id : null;
  const isAuthor = isLoggedIn && currentUserId === post.user_id;

  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [comments, setComments] = React.useState<any[] | null>(null);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [commentText, setCommentText] = React.useState('');
  const [commentSubmitting, setCommentSubmitting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showReportModal, setShowReportModal] = React.useState(false);
  const [reportReason, setReportReason] = React.useState<string | null>(null);
  const [reporting, setReporting] = React.useState(false);
  const [reported, setReported] = React.useState(false);

  const youtubeEmbedUrl = React.useMemo(() => extractYouTubeEmbedUrl(post.content || ''), [post.content]);

  const handleVote = async (optionId: number) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    const options: any[] = post.poll_options || [];
    const previousOptionId = options.find((o) => o.voted_by_me)?.id;
    if (previousOptionId === optionId) return;
    const updatedOptions = options.map((o) => {
      if (o.id === optionId) return { ...o, vote_count: o.vote_count + 1, voted_by_me: true };
      if (o.id === previousOptionId) return { ...o, vote_count: o.vote_count - 1, voted_by_me: false };
      return o;
    });
    onUpdate(post.id, { poll_options: updatedOptions });
    try {
      await apiClient.post(`/community/posts/${post.id}/vote`, { optionId });
    } catch {
      onUpdate(post.id, { poll_options: options });
    }
  };

  const handleLike = async () => {
    if (!isLoggedIn) { navigate('/login'); return; }
    const wasLiked = post.is_liked;
    onUpdate(post.id, { is_liked: !wasLiked, like_count: post.like_count + (wasLiked ? -1 : 1) });
    try {
      await apiClient.post(`/community/posts/${post.id}/like`);
    } catch {
      onUpdate(post.id, { is_liked: wasLiked, like_count: post.like_count });
    }
  };

  const loadComments = async () => {
    if (comments !== null) { setCommentsOpen(open => !open); return; }
    setCommentsOpen(true);
    setCommentsLoading(true);
    try {
      const res = await apiClient.get(`/community/posts/${post.id}/comments`);
      setComments(res.data.success ? res.data.comments : []);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;
    if (!isLoggedIn) { navigate('/login'); return; }
    setCommentSubmitting(true);
    try {
      await apiClient.post(`/community/posts/${post.id}/comments`, { comment: commentText.trim() });
      setCommentText('');
      const res = await apiClient.get(`/community/posts/${post.id}/comments`);
      if (res.data.success) setComments(res.data.comments);
      onUpdate(post.id, { comment_count: post.comment_count + 1 });
    } catch {
      /* keep typed text so the user can retry */
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      await apiClient.delete(`/community/posts/${post.id}`);
      onDeleted(post.id);
    } catch {
      setDeleting(false);
    }
  };

  const REPORT_REASONS = lang === 'en'
    ? ['Spam / advertising', 'Inappropriate content', 'Bullying / harassment', 'Other']
    : ['สแปม/โฆษณา', 'เนื้อหาไม่เหมาะสม', 'กลั่นแกล้ง/คุกคาม', 'อื่นๆ'];

  const handleReport = async () => {
    if (reporting) return;
    setReporting(true);
    try {
      await apiClient.post(`/community/posts/${post.id}/report`, { reason: reportReason || undefined });
      setReported(true);
      setShowReportModal(false);
    } catch {
      /* silently fail — reporting isn't critical enough to surface an error toast */
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
          {post.author_avatar_url ? (
            <img src={resolveImageUrl(post.author_avatar_url)} alt="" loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-black text-slate-400">{post.author_name?.[0] || '?'}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-black text-slate-800 leading-tight truncate">{post.author_name}</p>
          <p className="text-[12px] text-slate-400 font-bold">{formatCustomDate(post.created_at, lang, 'short')}</p>
        </div>
        {isAuthor ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
            className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50 shrink-0"
          >
            <Trash2 size={14} />
          </button>
        ) : isLoggedIn && (
          <button
            onClick={() => { if (!reported) { setReportReason(null); setShowReportModal(true); } }}
            disabled={reported}
            className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0 ${reported ? 'text-emerald-500 bg-emerald-50' : 'bg-slate-50 text-slate-400'}`}
            title={reported ? (lang === 'en' ? 'Reported' : 'รายงานแล้ว') : (lang === 'en' ? 'Report post' : 'รายงานโพสต์')}
          >
            {reported ? <Check size={14} /> : <Flag size={14} />}
          </button>
        )}
      </div>

      <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-wrap mt-3">{post.content}</p>

      {post.image_url && (
        <div className="mt-3 rounded-2xl overflow-hidden bg-slate-50">
          <img src={resolveImageUrl(post.image_url)} alt="" loading="lazy" className="w-full max-h-[420px] object-cover" />
        </div>
      )}

      {youtubeEmbedUrl && (
        <div className="mt-3 rounded-2xl overflow-hidden bg-black aspect-video">
          <iframe
            src={youtubeEmbedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {post.location_name && (
        <a
          href={
            post.location_lat && post.location_lng
              ? `https://www.google.com/maps/search/?api=1&query=${post.location_lat},${post.location_lng}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.location_name)}`
          }
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-full bg-slate-50 text-slate-500 text-[13px] font-bold active:scale-95 transition-transform"
        >
          <MapPin size={12} />
          {post.location_name}
        </a>
      )}

      {post.post_type === 'poll' && post.poll_options?.length > 0 && (() => {
        const options: any[] = post.poll_options;
        const totalVotes = options.reduce((sum, o) => sum + (o.vote_count || 0), 0);
        const hasVoted = options.some((o) => o.voted_by_me);
        return (
          <div className="mt-3 space-y-2">
            {options.map((option) => {
              const percent = totalVotes > 0 ? Math.round(((option.vote_count || 0) / totalVotes) * 100) : 0;
              return (
                <button
                  key={option.id}
                  onClick={() => handleVote(option.id)}
                  className="relative w-full text-left rounded-2xl border border-slate-100 bg-slate-50 overflow-hidden active:scale-[0.98] transition-transform"
                >
                  {hasVoted && (
                    <div
                      className={`absolute inset-y-0 left-0 ${option.voted_by_me ? 'bg-mellow-purple/15' : 'bg-slate-200/60'}`}
                      style={{ width: `${percent}%` }}
                    />
                  )}
                  <div className="relative flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-[15px] text-slate-700 flex items-center gap-1.5">
                      {option.voted_by_me && <Check size={13} className="text-mellow-purple shrink-0" />}
                      {option.option_text}
                    </span>
                    {hasVoted && <span className="text-[13px] font-black text-slate-500 shrink-0">{percent}%</span>}
                  </div>
                </button>
              );
            })}
            <p className="text-[12px] text-slate-400 font-bold">
              {totalVotes} {lang === 'en' ? (totalVotes === 1 ? 'vote' : 'votes') : 'โหวต'}
            </p>
          </div>
        );
      })()}

      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
        <button onClick={handleLike} className="flex items-center gap-1.5 active:scale-95 transition-transform">
          <Heart size={18} className={post.is_liked ? 'text-red-500' : 'text-slate-400'} fill={post.is_liked ? 'currentColor' : 'none'} />
          <span className="text-sm font-black text-slate-600">{post.like_count}</span>
        </button>
        <button onClick={loadComments} className="flex items-center gap-1.5 active:scale-95 transition-transform">
          <MessageCircle size={18} className="text-slate-400" />
          <span className="text-sm font-black text-slate-600">{post.comment_count}</span>
        </button>
      </div>

      {commentsOpen && (
        <div className="mt-4 space-y-3">
          {commentsLoading ? (
            <div className="flex justify-center py-3">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-mellow-purple rounded-full animate-spin" />
            </div>
          ) : comments && comments.length === 0 ? (
            <p className="text-center text-slate-400 text-xs font-bold py-2">
              {lang === 'en' ? 'No comments yet — be the first!' : 'ยังไม่มีคอมเมนท์ เป็นคนแรกเลย!'}
            </p>
          ) : comments?.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                {c.avatar_url ? (
                  <img src={resolveImageUrl(c.avatar_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[11px] font-black text-slate-400">{c.display_name?.[0] || '?'}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-black text-slate-700">{c.display_name}</p>
                <p className="text-[14px] text-slate-600 break-words">{c.comment_text}</p>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={isLoggedIn ? (lang === 'en' ? 'Add a comment...' : 'แสดงความคิดเห็น...') : (lang === 'en' ? 'Log in to comment' : 'เข้าสู่ระบบเพื่อคอมเมนท์')}
              disabled={!isLoggedIn}
              maxLength={500}
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-100 rounded-full text-[14px] font-medium focus:outline-none disabled:opacity-50"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitComment(); }}
            />
            <button
              onClick={handleSubmitComment}
              disabled={commentSubmitting || !commentText.trim() || !isLoggedIn}
              className="w-9 h-9 rounded-full bg-mellow-purple text-white flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      <ResponsiveModal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} variant="dialog" size="sm" className="text-center">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="text-red-500" size={28} />
        </div>
        <h3 className="text-[17px] font-black text-slate-800 mb-2">
          {lang === 'en' ? 'Delete this post?' : 'ลบโพสต์นี้หรือไม่?'}
        </h3>
        <p className="text-[14px] text-slate-500 font-medium mb-6">
          {lang === 'en' ? 'This cannot be undone.' : 'ไม่สามารถย้อนกลับได้เมื่อลบแล้ว'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="h-[46px] bg-slate-100 text-slate-600 rounded-2xl font-bold text-[15px] active:scale-95 transition-transform"
          >
            {lang === 'en' ? 'Cancel' : 'ยกเลิก'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="h-[46px] bg-red-500 text-white rounded-2xl font-bold text-[15px] active:scale-95 transition-transform disabled:opacity-60"
          >
            {lang === 'en' ? 'Delete' : 'ลบโพสต์'}
          </button>
        </div>
      </ResponsiveModal>

      <ResponsiveModal isOpen={showReportModal} onClose={() => setShowReportModal(false)} variant="dialog" size="sm">
        <h3 className="text-[17px] font-black text-slate-800 mb-1">
          {lang === 'en' ? 'Report this post' : 'รายงานโพสต์นี้'}
        </h3>
        <p className="text-[14px] text-slate-500 font-medium mb-4">
          {lang === 'en' ? "Our team will review it — the post isn't removed automatically." : 'ทีมงานจะตรวจสอบ — โพสต์จะยังไม่ถูกลบทันที'}
        </p>
        <div className="flex flex-col gap-2 mb-5">
          {REPORT_REASONS.map(r => (
            <button
              key={r}
              onClick={() => setReportReason(r)}
              className={`text-left px-4 py-2.5 rounded-2xl text-[14px] font-bold border transition-all ${
                reportReason === r ? 'border-mellow-purple bg-mellow-purple/10 text-mellow-purple' : 'border-slate-100 bg-slate-50 text-slate-600'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowReportModal(false)}
            className="h-[46px] bg-slate-100 text-slate-600 rounded-2xl font-bold text-[15px] active:scale-95 transition-transform"
          >
            {lang === 'en' ? 'Cancel' : 'ยกเลิก'}
          </button>
          <button
            onClick={handleReport}
            disabled={reporting || !reportReason}
            className="h-[46px] bg-red-500 text-white rounded-2xl font-bold text-[15px] active:scale-95 transition-transform disabled:opacity-60"
          >
            {lang === 'en' ? 'Report' : 'รายงาน'}
          </button>
        </div>
      </ResponsiveModal>
    </div>
  );
};

export default CommunityPostCard;
