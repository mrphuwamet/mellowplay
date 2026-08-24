import React from 'react';
import { Search, X, Hash } from 'lucide-react';

/**
 * The filter row above the news feed.
 *
 * Built to the shape people already know from every news site: a segmented
 * control for the kind of thing, a search box, and a row of topic chips. No
 * dropdowns — a dropdown hides its options, and with three types and a dozen
 * tags there is nothing worth hiding.
 *
 * Order matters here. Type first because it is the coarsest cut and always
 * has an answer; tags second because they are a shortcut rather than a
 * requirement; search last because it is what people fall back to when the
 * chips did not have what they wanted.
 */

export type NewsKind = 'all' | 'news' | 'media';

const NewsFilterBar: React.FC<{
  kind: NewsKind;
  onKind: (k: NewsKind) => void;
  query: string;
  onQuery: (q: string) => void;
  tags: { tag: string; count: number }[];
  activeTag: string | null;
  onTag: (tag: string | null) => void;
  resultCount: number;
  lang: 'th' | 'en';
}> = ({ kind, onKind, query, onQuery, tags, activeTag, onTag, resultCount, lang }) => {
  const t = (th: string, en: string) => (lang === 'en' ? en : th);
  const filtering = kind !== 'all' || !!activeTag || query.trim() !== '';

  const KINDS: { id: NewsKind; label: string }[] = [
    { id: 'all', label: t('ทั้งหมด', 'All') },
    { id: 'news', label: t('ข่าวสาร', 'News') },
    { id: 'media', label: t('วิดีโอ', 'Video') },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {/* One control, three states — a segmented row rather than three
            independent toggles, because the choices are exclusive and a row of
            checkboxes would suggest otherwise. */}
        <div className="flex bg-slate-100 rounded-2xl p-1">
          {KINDS.map(k => (
            <button
              key={k.id}
              type="button"
              onClick={() => onKind(k.id)}
              className={`px-3.5 py-1.5 rounded-xl text-[13px] font-black transition-all ${
                kind === k.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder={t('ค้นหาข่าว', 'Search news')}
            className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-[13px] font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all"
          />
          {query && (
            <button type="button" onClick={() => onQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 active:text-slate-600">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-0.5">
          {/* The active tag first, so the thing being filtered on never scrolls
              out of sight — the commonest way a filter gets forgotten. */}
          {activeTag && (
            <button
              type="button"
              onClick={() => onTag(null)}
              className="flex-shrink-0 flex items-center gap-1 pl-2.5 pr-2 py-1.5 rounded-full bg-mellow-purple text-white text-[12px] font-black"
            >
              <Hash size={12} />{activeTag}
              <X size={13} className="ml-0.5" />
            </button>
          )}
          {tags.filter(x => x.tag.toLowerCase() !== activeTag?.toLowerCase()).map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTag(tag)}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white border border-slate-200 text-[12px] font-bold text-slate-600 active:scale-95 transition-transform"
            >
              <Hash size={12} className="text-slate-400" />{tag}
              <span className="text-slate-400 font-black">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Only once something is actually filtered. A count that is always there
          is furniture; one that appears when you narrow something is feedback. */}
      {filtering && (
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-bold text-slate-400">
            {resultCount === 0 ? t('ไม่พบข่าวที่ตรงกับตัวกรอง', 'Nothing matches these filters')
              : t(`พบ ${resultCount} รายการ`, `${resultCount} result${resultCount === 1 ? '' : 's'}`)}
          </p>
          <button
            type="button"
            onClick={() => { onKind('all'); onTag(null); onQuery(''); }}
            className="text-[12px] font-black text-mellow-purple active:opacity-60"
          >
            {t('ล้างตัวกรอง', 'Clear')}
          </button>
        </div>
      )}
    </div>
  );
};

export default NewsFilterBar;
