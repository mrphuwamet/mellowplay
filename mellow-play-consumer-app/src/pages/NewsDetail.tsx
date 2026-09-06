import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Play, Heart, MessageCircle, Send } from 'lucide-react';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { useTranslation } from '../LanguageContext';
import { resolveImageUrl } from '../utils/courseImage';
import { formatCustomDate } from '../utils/dateFormat';
import { isPlainText } from '../utils/richText';
import { scrollToTop } from '../utils/scrollToTop';
import { useChildStore } from '../store/useChildStore';
import { isChildRole } from '../utils/familyRoles';
import HashtagText from '../components/HashtagText';
import HashtagHtml from '../components/HashtagHtml';

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const getVideoEmbed = (url: string): { type: 'youtube' | 'direct'; src: string } => {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return { type: 'youtube', src: `https://www.youtube.com/embed/${ytMatch[1]}` };
  return { type: 'direct', src: url };
};

// Full article page — reads like a real news-site thread instead of a
// modal, matching how /course/:id is a dedicated page rather than a popup.
// Used for both "ข่าวสาร" and "เรื่องน่ารู้" (news and media types) — a
// separate TikTok-style swipe feed was tried for media and reverted in
// favor of this single consistent article layout for everything.
/**
 * What the button at the foot of an article should say.
 *
 * Named by its destination rather than by the fact that it is a link: "ดูภาพ
 * กิจกรรม" tells someone what they will get, and "เปิดลิงก์" only tells them
 * that tapping does something. Both album routes are covered — the signed-in
 * one and the unlisted share link — because a post can carry either.
 */
const linkLabel = (url: string, lang: string) => {
  if (/^\/(event-albums|shared-albums)\//.test(url)) {
    return lang === 'en' ? 'View event photos' : 'ดูภาพกิจกรรม';
  }
  return lang === 'en' ? 'Open Link' : 'เปิดลิงก์';
};

const NewsDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { lang } = useTranslation();
  const [item, setItem] = useState<any>(undefined);
  const [suggested, setSuggested] = useState<any[]>([]);
  const carouselRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const isLoggedIn = !!localStorage.getItem('mellow_token');

  // Same child-profile gate as the community feed: an active child profile
  // (relation ลูก/บุตร) reads but doesn't comment.
  const { children: familyMembers, activeProfile } = useChildStore();
  const activeIsChild = activeProfile !== 'main' && isChildRole(familyMembers.find(m => m.id === activeProfile)?.relation);

  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Tapping an article in "ข่าวสารถัดไป" swaps the whole page under the
  // reader while leaving them scrolled to where that list was — i.e. at the
  // very bottom of an article they have not seen the start of.
  useEffect(() => { scrollToTop(pageRef.current); }, [id]);

  useEffect(() => {
    apiClient.get(`/news-feed/${id}`)
      .then(res => setItem(res.data.success ? res.data.item : null))
      .catch(() => setItem(null));
  }, [id]);

  useEffect(() => {
    if (!item) return;
    apiClient.get('/news-feed', { params: { type: item.type } })
      .then(res => {
        if (!res.data.success) return;
        setSuggested((res.data.items || []).filter((i: any) => i.id !== item.id).slice(0, 6));
      })
      .catch(() => {});

    apiClient.get(`/news-feed/${item.id}/comments`)
      .then(res => { if (res.data.success) setComments(res.data.comments); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const handleLike = async () => {
    if (!isLoggedIn) { navigate('/login'); return; }
    const wasLiked = item.is_liked;
    setItem((prev: any) => ({ ...prev, is_liked: !wasLiked, like_count: prev.like_count + (wasLiked ? -1 : 1) }));
    try {
      await apiClient.post(`/news-feed/${item.id}/like`);
    } catch {
      setItem((prev: any) => ({ ...prev, is_liked: wasLiked }));
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;
    if (!isLoggedIn) { navigate('/login'); return; }
    setCommentSubmitting(true);
    try {
      await apiClient.post(`/news-feed/${item.id}/comments`, { comment: commentText.trim() });
      setCommentText('');
      setCommentsLoading(true);
      const res = await apiClient.get(`/news-feed/${item.id}/comments`);
      if (res.data.success) setComments(res.data.comments);
      setItem((prev: any) => ({ ...prev, comment_count: prev.comment_count + 1 }));
    } catch {
      /* keep typed text so the user can retry */
    } finally {
      setCommentSubmitting(false);
      setCommentsLoading(false);
    }
  };

  const handleCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el || el.clientWidth === 0) return;
    setCarouselIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (item === undefined) {
    return (
      <div className="mellow-page-article bg-[#fbfaf7] min-h-screen animate-pulse">
        <div className="h-[64px] px-5 bg-white flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-slate-100" />
        </div>
        <div className="w-full aspect-[16/9] bg-slate-200" />
        <div className="p-5 space-y-3">
          <div className="h-6 w-3/4 bg-slate-200 rounded-full" />
          <div className="h-3.5 w-full bg-slate-100 rounded-full" />
          <div className="h-3.5 w-full bg-slate-100 rounded-full" />
          <div className="h-3.5 w-2/3 bg-slate-100 rounded-full" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mellow-page-article bg-[#fbfaf7] min-h-screen">
        <header className="h-[64px] px-5 bg-white flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><ChevronLeft size={24} /></button>
        </header>
        <div className="p-8 text-center text-slate-400 font-bold">
          {lang === 'en' ? 'This article was not found.' : 'ไม่พบข่าวนี้'}
        </div>
      </div>
    );
  }

  // A tag anywhere means the same thing: show me everything with this tag.
  // Explore is where that lives, so it is where a tap goes.
  const openTag = (tag: string) => navigate(`/explore?tag=${encodeURIComponent(tag)}`);

  const title = lang === 'en' && item.title_en ? item.title_en : item.title;
  const content = (lang === 'en' && item.content_en ? item.content_en : item.content) || '';
  const images: string[] = item.image_urls?.length ? item.image_urls : (item.image_url ? [item.image_url] : []);
  const videoEmbed = item.video_url ? getVideoEmbed(item.video_url) : null;

  return (
    <div className="mellow-page-article bg-white min-h-screen pb-10" ref={pageRef}>
      <header className="h-[64px] px-5 bg-white/90 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
      </header>

      {videoEmbed ? (
        <div className="w-full aspect-video bg-black">
          {videoEmbed.type === 'youtube' ? (
            <iframe
              src={videoEmbed.src}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={title}
            />
          ) : (
            <video src={item.video_url} controls className="w-full h-full" />
          )}
        </div>
      ) : images.length > 0 ? (
        <div
          className={`relative w-full aspect-[16/9] bg-slate-100 ${item.link_url ? 'cursor-pointer' : ''}`}
          onClick={() => {
            if (!item.link_url) return;
            // Internal links (e.g. an event album's /event-albums/:id) stay in
            // the app; only real external URLs open a new tab.
            if (item.link_url.startsWith('/')) navigate(item.link_url);
            else window.open(item.link_url, '_blank', 'noopener,noreferrer');
          }}
        >
          <div ref={carouselRef} onScroll={handleCarouselScroll} className="w-full h-full overflow-x-scroll snap-x snap-mandatory flex scrollbar-hide">
            {images.map((url, i) => (
              // image_position is the CRM's drag-to-frame choice for this
              // article's 16:9 hero box; it applies to every slide because the
              // framing describes the article, not one individual file.
              <img
                key={i}
                src={resolveImageUrl(url)}
                alt={title}
                className="w-full h-full object-cover shrink-0 snap-center"
                style={{ objectPosition: item.image_position || '50% 50%' }}
              />
            ))}
          </div>
          {images.length > 1 && (
            <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5 pointer-events-none">
              {images.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i === carouselIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full aspect-[16/9] bg-mellow-purple-soft flex items-center justify-center p-10 opacity-40">
          <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
        </div>
      )}

      {/* From lg: the article and the "next up" list sit side by side —
          below that they stay stacked exactly as before. The reading column
          is capped inside the grid rather than by the page, so widening the
          page for the rail does not widen the prose. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:px-5 lg:items-start">
      <div className="px-5 pt-5 lg:px-0 lg:col-start-1">
        <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-2">
          {item.type === 'news' ? (lang === 'en' ? 'News' : 'ข่าวสาร') : (lang === 'en' ? 'Fun Facts' : 'เรื่องน่ารู้')}
          {' · '}
          {formatCustomDate(item.created_at, lang, 'full')}
        </p>
        <h1 className="text-2xl font-black text-slate-800 leading-tight mb-4">
          <HashtagText text={title} onTagClick={openTag} />
        </h1>

        {/* Content is rich HTML authored via the CRM's writer tool (can
            include inline images), so it's rendered as markup rather than
            plain text — this is admin-authored content, not user input.
            HashtagHtml renders that markup and then makes the hashtags inside
            it tappable, without rewriting the HTML itself. */}
        <HashtagHtml
          className={`prose-news text-[16px] text-slate-700 leading-relaxed ${isPlainText(content) ? 'whitespace-pre-wrap' : ''}`}
          html={content || (lang === 'en' ? 'No further details.' : 'ไม่มีรายละเอียดเพิ่มเติม')}
          onTagClick={openTag}
        />

        {/* Shown whenever there is somewhere to go, including on posts that
            have a picture. The picture opens the link too, but nothing says so
            — a photo album announced with a photo looked like an article that
            simply ended, and the way in was a tap nobody knew to make. */}
        {item.link_url && (
          <a
            href={item.link_url}
            target={item.link_url.startsWith('/') ? undefined : '_blank'}
            rel="noopener noreferrer"
            onClick={e => { if (item.link_url.startsWith('/')) { e.preventDefault(); navigate(item.link_url); } }}
            className="block w-full mt-6 py-3.5 bg-slate-100 text-slate-700 rounded-xl font-black text-[15px] text-center active:scale-95 transition-transform"
          >
            {linkLabel(item.link_url, lang)}
          </a>
        )}

        {/* Like / comment count — member-only actions, guests are sent to login. */}
        <div className="flex items-center gap-4 mt-6 pt-5 border-t border-slate-100">
          <button onClick={handleLike} className="flex items-center gap-1.5 active:scale-95 transition-transform">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${item.is_liked ? 'bg-red-50' : 'bg-slate-100'}`}>
              <Heart size={18} className={item.is_liked ? 'text-red-500' : 'text-slate-400'} fill={item.is_liked ? 'currentColor' : 'none'} />
            </div>
            <span className="text-sm font-black text-slate-600">{item.like_count}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
              <MessageCircle size={18} className="text-slate-400" />
            </div>
            <span className="text-sm font-black text-slate-600">{item.comment_count}</span>
          </div>
        </div>

        {/* Comments */}
        <div className="mt-5 space-y-4">
          {commentsLoading ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-mellow-purple rounded-full animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-slate-400 text-sm font-bold py-4">
              {lang === 'en' ? 'No comments yet — be the first!' : 'ยังไม่มีคอมเมนท์ เป็นคนแรกเลย!'}
            </p>
          ) : comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                {c.avatar_url ? (
                  <img src={resolveImageUrl(c.avatar_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-black text-slate-400">{c.display_name?.[0] || '?'}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-700">{c.display_name}</p>
                <p className="text-sm text-slate-600 break-words">{c.comment_text}</p>
              </div>
            </div>
          ))}

          {activeIsChild ? (
            <p className="text-center text-slate-400 text-[13px] font-bold pt-2">
              {lang === 'en' ? 'Switch to a parent profile to comment' : 'สลับเป็นโปรไฟล์ผู้ปกครองเพื่อแสดงความคิดเห็น'}
            </p>
          ) : (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={isLoggedIn ? (lang === 'en' ? 'Add a comment...' : 'แสดงความคิดเห็น...') : (lang === 'en' ? 'Log in to comment' : 'เข้าสู่ระบบเพื่อคอมเมนท์')}
                disabled={!isLoggedIn}
                maxLength={500}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-full text-sm font-medium focus:outline-none disabled:opacity-50"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitComment(); }}
              />
              <button
                onClick={handleSubmitComment}
                disabled={commentSubmitting || !commentText.trim() || !isLoggedIn}
                className="w-10 h-10 rounded-full bg-mellow-purple text-white flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {suggested.length > 0 && (
        <div className="px-5 pt-8 mt-2 border-t border-slate-100 lg:px-0 lg:pt-5 lg:mt-0 lg:border-t-0 lg:col-start-2 lg:sticky lg:top-6">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            {item.type === 'news'
              ? (lang === 'en' ? 'More News' : 'ข่าวสารถัดไป')
              : (lang === 'en' ? 'More Fun Facts' : 'เรื่องน่ารู้ถัดไป')}
          </p>
          <div className="flex flex-col gap-3">
            {suggested.map(s => {
              const sImageUrl = resolveImageUrl(s.image_url);
              const sTitle = lang === 'en' && s.title_en ? s.title_en : s.title;
              const sContent = (lang === 'en' && s.content_en ? s.content_en : s.content) || '';
              return (
                <div
                  key={s.id}
                  onClick={() => navigate(`/news/${s.id}`)}
                  className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform flex w-full"
                >
                  <div className="w-24 h-24 bg-slate-100 relative shrink-0 overflow-hidden">
                    {sImageUrl ? (
                      <img
                        src={sImageUrl}
                        alt={sTitle}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        style={{ objectPosition: s.image_position || '50% 50%' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-3 opacity-30">
                        <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
                      </div>
                    )}
                    {s.video_url && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-7 h-7 bg-white/85 rounded-full flex items-center justify-center shadow-sm">
                          <Play size={12} className="text-mellow-blue fill-mellow-blue ml-0.5" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 p-3.5">
                    <h4 className="font-black text-[15px] text-slate-800 leading-tight mb-1 line-clamp-2">{sTitle}</h4>
                    {sContent && <p className="text-[12px] text-slate-500 line-clamp-2 leading-snug">{stripHtml(sContent)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default NewsDetail;
