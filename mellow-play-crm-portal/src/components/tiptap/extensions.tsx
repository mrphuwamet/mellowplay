import React, { useState } from 'react';
import { Box, TextField, Button, IconButton, Tooltip, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import {
  Delete as DeleteIcon, Add as AddIcon, ViewAgenda as VerticalIcon,
  ViewColumn as HorizontalIcon,
} from '@mui/icons-material';
import { Node, mergeAttributes, nodePasteRule } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';

// ---------------------------------------------------------------------------
// Shared constraint for every node in this file
//
// The consumer app renders article/description HTML through
// dangerouslySetInnerHTML with no accompanying JS and no stylesheet of its own
// (NewsDetail.tsx:188). So renderHTML output has to be self-contained: inline
// styles only, no class names, no scripts.
//
// It also has to be emitted as a SINGLE LINE. That container carries
// `whitespace-pre-wrap` (NewsDetail.tsx:189), which turns any newline in the
// stored HTML into visible blank space in the published article. Every
// renderHTML below therefore builds its style strings inline and never spans
// lines in its output.
// ---------------------------------------------------------------------------

const PURPLE = '#7c3aed';

// ===========================================================================
// CTA button (unchanged behaviour — kept as the simplest "just a button" node,
// with MediaCard below covering the image+text+button case)
// ===========================================================================

const CtaButtonComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, deleteNode, editor, getPos }) => {
  const { href, label, color } = node.attrs as { href: string; label: string; color: string };

  // Every field writes straight to the node on change, with no local mirror.
  //
  // The previous version kept the values in useState and only committed them in
  // onBlur, which lost them: this panel is rendered under `{selected && ...}`,
  // so clicking anywhere outside the node deselects it and React unmounts the
  // inputs — and blur never fires on an unmounting input. Typing a URL and then
  // clicking away discarded it silently. A local mirror also went stale on undo,
  // and the next blur would write the stale value back over it.
  //
  // Committing per keystroke is fine for the undo stack: ProseMirror's history
  // groups steps that arrive within newGroupDelay, so a burst of typing
  // collapses into one undo entry.

  // ProseMirror's implicit click-to-select doesn't reliably fire for an
  // atom node rendered through ReactNodeViewRenderer here — clicking the
  // pill just placed a text cursor in nearby content instead of selecting
  // the node. Setting the NodeSelection explicitly sidesteps that.
  const selectSelf = () => {
    const pos = getPos();
    if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
  };

  return (
    <NodeViewWrapper style={{ display: 'block', margin: '8px 0' }} data-drag-handle>
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <span
          onClick={selectSelf}
          style={{
            display: 'inline-block', background: color, color: '#fff', fontWeight: 800,
            padding: '12px 28px', borderRadius: 999, cursor: 'pointer', userSelect: 'none',
            outline: selected ? `2px dashed ${PURPLE}` : 'none', outlineOffset: 4,
          }}
        >
          {label}
        </span>
        {selected && (
          <Box
            onPointerDown={e => e.stopPropagation()}
            sx={{
              position: 'absolute', top: '100%', left: 0, mt: 1, bgcolor: 'white',
              border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 20, minWidth: 240,
              display: 'flex', flexDirection: 'column', gap: 1,
            }}
          >
            <TextField
              size="small"
              label="ข้อความปุ่ม"
              value={label}
              onChange={e => updateAttributes({ label: e.target.value })}
              onBlur={e => { if (!e.target.value.trim()) updateAttributes({ label: 'ปุ่มกด' }); }}
            />
            <TextField
              size="small"
              label="ลิงก์ (URL)"
              value={href === '#' ? '' : href}
              onChange={e => updateAttributes({ href: e.target.value.trim() || '#' })}
              placeholder="https://..."
            />
            <Box display="flex" alignItems="center" gap={1}>
              <input type="color" value={color} onChange={e => updateAttributes({ color: e.target.value })} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
              <Button size="small" color="error" onClick={deleteNode} sx={{ ml: 'auto', textTransform: 'none' }}>ลบปุ่ม</Button>
            </Box>
          </Box>
        )}
      </Box>
    </NodeViewWrapper>
  );
};

export const CtaButton = Node.create({
  name: 'ctaButton',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      href: { default: '#' },
      // renderHTML: () => ({}) on each — otherwise Tiptap's default
      // behavior renders every attribute without one as a same-named HTML
      // attribute (label="...", color="...") on top of the explicit <a>
      // this node already builds below, which is redundant and wrong.
      label: { default: 'ดูเพิ่มเติม', renderHTML: () => ({}) },
      color: { default: PURPLE, renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{
      tag: 'a[data-cta-button]',
      // Higher than the default (100) — StarterKit's Link mark also has a
      // parse rule for bare `a[href]` and would otherwise win, turning a
      // reloaded CTA button back into a plain underlined text link.
      priority: 1000,
      getAttrs: (el: HTMLElement) => ({
        href: el.getAttribute('href') || '#',
        label: el.textContent || 'ดูเพิ่มเติม',
        color: el.style.background || el.style.backgroundColor || PURPLE,
      }),
    }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const { color, label } = node.attrs;
    return ['a', mergeAttributes(HTMLAttributes, {
      'data-cta-button': 'true',
      target: '_blank',
      rel: 'noopener noreferrer',
      style: `display:inline-block;background:${color};color:#fff;font-weight:800;padding:12px 28px;border-radius:999px;text-decoration:none;margin:8px 0;`,
    }), label];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CtaButtonComponent);
  },
});

// ===========================================================================
// Image: click-through link, caption, alignment
//
// Replaces the article-level "ลิงก์ภายนอก" field that used to make the cover
// image open one single URL for the whole article. A link now belongs to the
// individual image, so one article can have several tappable images going to
// different places, and the image itself is the button — no separate
// "เปิดลิงก์" button is rendered anywhere.
//
// Extends the stock Image rather than replacing it so the built-in
// drag-corner resize NodeView keeps working.
// ===========================================================================

type ImageAlign = 'left' | 'center' | 'right' | null;

// Only wraps the <img> when there is something to wrap it for. Content saved
// before this extension existed is plain `<img style="...">`, and re-emitting
// it unchanged keeps old articles byte-identical instead of silently
// restyling every one of them on the next save.
function buildImageHtml(imgAttrs: Record<string, any>, node: any) {
  const href = node.attrs.href as string | null;
  const caption = node.attrs.caption as string | null;
  const align = node.attrs.align as ImageAlign;

  const img: any = ['img', mergeAttributes(imgAttrs)];
  const linked = href
    ? ['a', { href, target: '_blank', rel: 'noopener noreferrer', 'data-mp-image-link': 'true', style: 'display:inline-block;text-decoration:none;' }, img]
    : img;

  if (!caption && !align) return linked;

  const alignStyle = align ? `text-align:${align};` : '';
  const children: any[] = [linked];
  if (caption) {
    children.push(['figcaption', { style: 'margin-top:6px;font-size:13px;color:#64748b;line-height:1.5;' }, caption]);
  }
  return ['figure', { 'data-mp-image': 'true', style: `margin:12px 0;${alignStyle}` }, ...children];
}

export const MpImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // All three are rendered by the wrapper markup in renderHTML, so they
      // must not also leak onto the <img> as href="" / caption="" attributes.
      href: { default: null, renderHTML: () => ({}) },
      caption: { default: null, renderHTML: () => ({}) },
      align: { default: null, renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [
      // A figure wrapper carries the caption and alignment; the href (if any)
      // is on the <a> inside it.
      {
        tag: 'figure[data-mp-image]',
        priority: 1100,
        getAttrs: (el: HTMLElement) => {
          const img = el.querySelector('img');
          if (!img) return false;
          const anchor = el.querySelector('a[data-mp-image-link]');
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            width: img.getAttribute('width') || img.style.width || null,
            href: anchor?.getAttribute('href') || null,
            caption: el.querySelector('figcaption')?.textContent || null,
            align: (el.style.textAlign || null) as ImageAlign,
          };
        },
      },
      // A linked image with no caption/alignment has no figure around it.
      {
        tag: 'a[data-mp-image-link]',
        priority: 1100,
        getAttrs: (el: HTMLElement) => {
          const img = el.querySelector('img');
          if (!img) return false;
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            width: img.getAttribute('width') || img.style.width || null,
            href: el.getAttribute('href'),
          };
        },
      },
      ...(this.parent?.() || []),
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return buildImageHtml(HTMLAttributes, node) as any;
  },
});

// ===========================================================================
// Image row — two or three images sitting on one line
//
// The images are node ATTRIBUTES rather than ProseMirror child content on
// purpose. As child content, each image would render through the Image node's
// own renderHTML and there would be no way to give it the per-child
// `flex:1 1 0;min-width:0` it needs to actually share the line — a flex item
// that is a replaced element resolves `min-width:auto` to its intrinsic width
// and refuses to shrink. Owning the images lets this node write those styles.
// ===========================================================================

interface RowImage {
  src: string;
  alt?: string;
  href?: string;
}

const ImageRowComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, deleteNode, editor, getPos }) => {
  const images = (node.attrs.images || []) as RowImage[];
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const selectSelf = () => {
    const pos = getPos();
    if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
  };

  const update = (index: number, patch: Partial<RowImage>) => {
    updateAttributes({ images: images.map((im, i) => (i === index ? { ...im, ...patch } : im)) });
  };

  const removeAt = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    if (next.length === 0) deleteNode();
    else updateAttributes({ images: next });
  };

  // The upload flow lives in the toolbar (it needs the editor's uploadFolder
  // and the crop dialog), so adding an image from inside the row asks the
  // host editor to run it via a custom event rather than duplicating it.
  const requestAdd = () => {
    const pos = getPos();
    editor.view.dom.dispatchEvent(new CustomEvent('mp-image-row-add', { bubbles: true, detail: { pos } }));
  };

  return (
    <NodeViewWrapper style={{ display: 'block', margin: '12px 0' }} data-drag-handle>
      <Box
        onClick={selectSelf}
        sx={{
          display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-start',
          outline: selected ? `2px dashed ${PURPLE}` : 'none', outlineOffset: 4, borderRadius: 1,
        }}
      >
        {images.map((im, i) => (
          <Box key={i} sx={{ flex: '1 1 0', minWidth: 80, position: 'relative' }}>
            <img
              src={im.src}
              alt={im.alt || ''}
              style={{ width: '100%', display: 'block', borderRadius: 8, cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); selectSelf(); setEditingIndex(editingIndex === i ? null : i); }}
            />
            {im.href && (
              <Box sx={{ position: 'absolute', top: 4, left: 4, bgcolor: 'rgba(124,58,237,0.9)', color: 'white', fontSize: 10, fontWeight: 800, px: 0.6, py: 0.2, borderRadius: 0.75 }}>
                LINK
              </Box>
            )}
            {selected && (
              <IconButton
                size="small"
                onClick={e => { e.stopPropagation(); removeAt(i); }}
                sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.5)', color: 'white', p: 0.3, '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
              >
                <DeleteIcon sx={{ fontSize: 13 }} />
              </IconButton>
            )}
          </Box>
        ))}
        {selected && images.length < 4 && (
          <Box
            onClick={e => { e.stopPropagation(); requestAdd(); }}
            sx={{
              flex: '0 0 72px', height: 72, borderRadius: 2, border: '2px dashed #cbd5e1', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc',
              '&:hover': { borderColor: PURPLE },
            }}
          >
            <AddIcon color="disabled" />
          </Box>
        )}
      </Box>

      {selected && editingIndex !== null && images[editingIndex] && (
        <Box
          onPointerDown={e => e.stopPropagation()}
          sx={{
            mt: 1, bgcolor: 'white', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 320,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            รูปที่ {editingIndex + 1}
          </Typography>
          <TextField
            size="small"
            label="ลิงก์เมื่อกดที่รูป (ถ้ามี)"
            placeholder="https://..."
            value={images[editingIndex].href || ''}
            onChange={e => update(editingIndex, { href: e.target.value })}
          />
          <TextField
            size="small"
            label="คำอธิบายรูป (Alt) — ช่วย SEO และผู้ใช้ screen reader"
            value={images[editingIndex].alt || ''}
            onChange={e => update(editingIndex, { alt: e.target.value })}
          />
        </Box>
      )}
    </NodeViewWrapper>
  );
};

export const ImageRow = Node.create({
  name: 'imageRow',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      images: {
        default: [] as RowImage[],
        // Serialised into the child <img> tags by renderHTML, so it must not
        // also appear as an images="[object Object]" attribute on the wrapper.
        renderHTML: () => ({}),
        parseHTML: (el: HTMLElement) =>
          Array.from(el.querySelectorAll('img')).map(img => {
            const anchor = img.closest('a');
            return {
              src: img.getAttribute('src') || '',
              alt: img.getAttribute('alt') || '',
              href: anchor?.getAttribute('href') || '',
            };
          }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-mp-image-row]', priority: 1100 }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const images = (node.attrs.images || []) as RowImage[];
    // `flex:1 1 0` plus an explicit `min-width:0` is what actually lets the
    // images share the line; `object-fit:cover` with a common aspect ratio
    // keeps a portrait and a landscape photo from making the row ragged.
    const imgStyle = 'flex:1 1 0;min-width:0;width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:8px;display:block;';
    const children = images.map(im => {
      const img: any = ['img', { src: im.src, alt: im.alt || '', loading: 'lazy', style: imgStyle }];
      return im.href
        ? ['a', { href: im.href, target: '_blank', rel: 'noopener noreferrer', 'data-mp-image-link': 'true', style: 'flex:1 1 0;min-width:0;display:block;' }, img]
        : img;
    });
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-mp-image-row': 'true',
      style: 'display:flex;flex-wrap:nowrap;gap:8px;align-items:flex-start;margin:12px 0;',
    }), ...children] as any;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageRowComponent);
  },
});

// ===========================================================================
// YouTube embed
//
// Replaces "paste a YouTube link and it becomes a separate video field" with
// an embed that sits inline in the content, wherever the writer put it.
// A paste rule converts a pasted watch/share URL automatically.
//
// youtube-nocookie.com rather than youtube.com: it does not set advertising
// cookies until the reader actually presses play, which is the safer default
// for a PDPA-covered audience of parents.
// ===========================================================================

// Covers watch?v=, youtu.be/, /embed/, /shorts/ and /live/ forms, with or
// without extra query parameters.
const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function extractYoutubeId(url: string): string | null {
  const match = YOUTUBE_URL_REGEX.exec(url.trim());
  return match ? match[1] : null;
}

const YoutubeEmbedComponent: React.FC<NodeViewProps> = ({ node, selected, deleteNode, editor, getPos, updateAttributes }) => {
  const videoId = node.attrs.videoId as string;
  const [localUrl, setLocalUrl] = useState('');

  const selectSelf = () => {
    const pos = getPos();
    if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
  };

  return (
    <NodeViewWrapper style={{ display: 'block', margin: '12px 0' }} data-drag-handle>
      <Box
        sx={{
          position: 'relative', width: '100%', maxWidth: 480, borderRadius: 2, overflow: 'hidden',
          outline: selected ? `2px dashed ${PURPLE}` : 'none', outlineOffset: 4,
        }}
      >
        <Box sx={{ position: 'relative', paddingTop: '56.25%', bgcolor: '#000' }}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}`}
            title="YouTube"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
          />
          {/* An iframe inside contenteditable swallows every click, so the
              node could never be selected or deleted. This transparent layer
              takes the click for selection; it is removed once selected so
              the video can actually be played to check it is the right one. */}
          {!selected && (
            <Box
              onClick={selectSelf}
              sx={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
            />
          )}
        </Box>
        {selected && (
          <Box
            onPointerDown={e => e.stopPropagation()}
            sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, bgcolor: 'grey.100' }}
          >
            {/* Commits as soon as a valid id can be parsed rather than on blur:
                this panel unmounts when the node is deselected, and blur is not
                delivered to an unmounting input, so a pasted URL was lost. */}
            <TextField
              size="small"
              fullWidth
              label="เปลี่ยนลิงก์ YouTube"
              placeholder="https://youtu.be/..."
              value={localUrl}
              onChange={e => {
                const next = e.target.value;
                setLocalUrl(next);
                const id = extractYoutubeId(next);
                if (id && id !== videoId) updateAttributes({ videoId: id });
              }}
            />
            <Tooltip title="ลบวิดีโอ">
              <IconButton size="small" color="error" onClick={deleteNode}><DeleteIcon sx={{ fontSize: 18 }} /></IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </NodeViewWrapper>
  );
};

export const YoutubeEmbed = Node.create({
  name: 'youtubeEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      videoId: { default: '', renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-mp-youtube]',
      priority: 1100,
      getAttrs: (el: HTMLElement) => {
        const src = el.querySelector('iframe')?.getAttribute('src') || '';
        const id = /\/embed\/([A-Za-z0-9_-]{11})/.exec(src);
        return id ? { videoId: id[1] } : false;
      },
    }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const { videoId } = node.attrs;
    // padding-top:56.25% is the 16:9 box; `aspect-ratio` alone is not enough
    // because the absolutely-positioned iframe needs a sized parent in older
    // in-app browsers (LINE's webview in particular).
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-mp-youtube': 'true',
      style: 'position:relative;width:100%;padding-top:56.25%;margin:12px 0;border-radius:12px;overflow:hidden;background:#000;',
    }), ['iframe', {
      src: `https://www.youtube-nocookie.com/embed/${videoId}`,
      title: 'YouTube',
      loading: 'lazy',
      allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      allowfullscreen: 'true',
      style: 'position:absolute;top:0;left:0;width:100%;height:100%;border:0;',
    }]] as any;
  },

  // Pasting a YouTube URL on its own line turns straight into the embed —
  // this is the "ลิงก์ YouTube กลายเป็น embed" behaviour, handled at paste
  // time so nobody has to find a toolbar button for it.
  addPasteRules() {
    return [
      nodePasteRule({
        find: new RegExp(YOUTUBE_URL_REGEX.source, 'g'),
        type: this.type,
        getAttributes: match => ({ videoId: match[1] }),
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YoutubeEmbedComponent);
  },
});

// ===========================================================================
// Media card — image + text + action button as one reusable block
// ===========================================================================

const MediaCardComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, deleteNode, editor, getPos }) => {
  const attrs = node.attrs as {
    imageSrc: string; title: string; body: string;
    buttonLabel: string; buttonHref: string; buttonColor: string;
    layout: 'vertical' | 'horizontal';
  };
  // No local state mirror — see the note in CtaButtonComponent for why: this
  // panel unmounts the moment the node is deselected, and an onBlur commit is
  // never delivered to an unmounting input, so anything typed here (the button
  // URL in particular) was silently thrown away.
  const selectSelf = () => {
    const pos = getPos();
    if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
  };

  const requestImage = () => {
    editor.view.dom.dispatchEvent(new CustomEvent('mp-media-card-image', { bubbles: true }));
  };

  const horizontal = attrs.layout === 'horizontal';
  const hasHref = !!(attrs.buttonHref || '').trim();

  return (
    <NodeViewWrapper style={{ display: 'block', margin: '12px 0' }} data-drag-handle>
      <Box
        onClick={selectSelf}
        sx={{
          border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden', bgcolor: 'white',
          maxWidth: 420, outline: selected ? `2px dashed ${PURPLE}` : 'none', outlineOffset: 4,
          display: horizontal ? 'flex' : 'block', alignItems: 'stretch',
        }}
      >
        <Box
          // A click on the image used to open the file picker immediately, so
          // the card could not be selected by clicking the largest part of it
          // without a file dialog appearing. Now the first click only selects;
          // picking an image takes a second click (or the "เปลี่ยนรูป" button).
          onClick={e => {
            e.stopPropagation();
            if (selected) requestImage();
            else selectSelf();
          }}
          sx={{
            width: horizontal ? 140 : '100%', flexShrink: 0, aspectRatio: horizontal ? '1 / 1' : '16 / 9',
            bgcolor: 'grey.100', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundImage: attrs.imageSrc ? `url(${attrs.imageSrc})` : undefined,
            backgroundSize: 'cover', backgroundPosition: 'center',
          }}
        >
          {!attrs.imageSrc && (
            <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
              {selected ? 'คลิกอีกครั้งเพื่อเลือกรูป' : 'คลิกเพื่อเลือกการ์ด'}
            </Typography>
          )}
        </Box>
        <Box sx={{ p: 2, flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, mb: 0.5 }}>{attrs.title || 'หัวข้อการ์ด'}</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.6 }}>{attrs.body || 'คำอธิบายสั้นๆ'}</Typography>
          {/* The published card only carries the button when it has somewhere to
              go, so the preview has to show that state too — it previously drew
              a solid, finished-looking button whether or not a URL was set,
              which is why a card could look right in the editor and arrive in
              the article with no button at all. */}
          <Box
            sx={{
              display: 'inline-block', mt: 1.5, fontWeight: 800, fontSize: 13, px: 2.5, py: 1, borderRadius: 999,
              bgcolor: hasHref ? (attrs.buttonColor || PURPLE) : 'transparent',
              color: hasHref ? 'white' : 'text.disabled',
              border: hasHref ? 'none' : '1px dashed',
              borderColor: hasHref ? 'transparent' : 'text.disabled',
            }}
          >
            {attrs.buttonLabel || 'ดูเพิ่มเติม'}
          </Box>
          {!hasHref && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'warning.main', fontWeight: 700 }}>
              ยังไม่ได้ใส่ลิงก์ปุ่ม — ปุ่มจะไม่แสดงในบทความจนกว่าจะใส่
            </Typography>
          )}
        </Box>
      </Box>

      {selected && (
        <Box
          onPointerDown={e => e.stopPropagation()}
          sx={{
            mt: 1, bgcolor: 'white', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 420,
          }}
        >
          <ToggleButtonGroup
            size="small"
            exclusive
            value={attrs.layout}
            onChange={(_, v) => { if (v) updateAttributes({ layout: v }); }}
          >
            <ToggleButton value="vertical" sx={{ textTransform: 'none', gap: 0.5 }}>
              <VerticalIcon sx={{ fontSize: 16 }} /> รูปด้านบน
            </ToggleButton>
            <ToggleButton value="horizontal" sx={{ textTransform: 'none', gap: 0.5 }}>
              <HorizontalIcon sx={{ fontSize: 16 }} /> รูปด้านซ้าย
            </ToggleButton>
          </ToggleButtonGroup>
          <TextField size="small" label="หัวข้อ" value={attrs.title} onChange={e => updateAttributes({ title: e.target.value })} />
          <TextField size="small" label="คำอธิบาย" multiline minRows={2} value={attrs.body} onChange={e => updateAttributes({ body: e.target.value })} />
          <TextField size="small" label="ข้อความบนปุ่ม" value={attrs.buttonLabel} onChange={e => updateAttributes({ buttonLabel: e.target.value })} />
          <TextField
            size="small"
            label="ลิงก์ปุ่ม (URL) — ต้องใส่ ปุ่มจึงจะแสดงในบทความ"
            placeholder="https://..."
            value={attrs.buttonHref}
            onChange={e => updateAttributes({ buttonHref: e.target.value })}
            error={!hasHref}
          />
          <Box display="flex" alignItems="center" gap={1}>
            <input
              type="color"
              value={attrs.buttonColor || PURPLE}
              onChange={e => updateAttributes({ buttonColor: e.target.value })}
              style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }}
            />
            <Button size="small" onClick={requestImage} sx={{ textTransform: 'none' }}>เปลี่ยนรูป</Button>
            <Button size="small" color="error" onClick={deleteNode} sx={{ ml: 'auto', textTransform: 'none' }}>ลบการ์ด</Button>
          </Box>
        </Box>
      )}
    </NodeViewWrapper>
  );
};

export const MediaCard = Node.create({
  name: 'mediaCard',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      imageSrc: { default: '', renderHTML: () => ({}) },
      title: { default: '', renderHTML: () => ({}) },
      body: { default: '', renderHTML: () => ({}) },
      buttonLabel: { default: 'ดูเพิ่มเติม', renderHTML: () => ({}) },
      buttonHref: { default: '', renderHTML: () => ({}) },
      buttonColor: { default: PURPLE, renderHTML: () => ({}) },
      layout: { default: 'vertical', renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-mp-media-card]',
      priority: 1100,
      getAttrs: (el: HTMLElement) => {
        const button = el.querySelector('a[data-mp-card-button]');
        return {
          imageSrc: el.querySelector('img')?.getAttribute('src') || '',
          title: el.querySelector('[data-mp-card-title]')?.textContent || '',
          body: el.querySelector('[data-mp-card-body]')?.textContent || '',
          buttonLabel: button?.textContent || 'ดูเพิ่มเติม',
          buttonHref: button?.getAttribute('href') || '',
          buttonColor: (button as HTMLElement | null)?.style.background || PURPLE,
          layout: el.getAttribute('data-mp-card-layout') === 'horizontal' ? 'horizontal' : 'vertical',
        };
      },
    }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const { imageSrc, title, body, buttonLabel, buttonHref, buttonColor, layout } = node.attrs;
    const horizontal = layout === 'horizontal';

    const image = imageSrc
      ? ['img', {
          src: imageSrc,
          alt: title || '',
          loading: 'lazy',
          style: horizontal
            ? 'width:120px;flex:0 0 120px;aspect-ratio:1/1;object-fit:cover;display:block;'
            : 'width:100%;aspect-ratio:16/9;object-fit:cover;display:block;',
        }]
      : null;

    const textChildren: any[] = [
      ['div', { 'data-mp-card-title': 'true', style: 'font-weight:800;font-size:16px;color:#1e293b;margin-bottom:4px;' }, title || ''],
      ['div', { 'data-mp-card-body': 'true', style: 'font-size:14px;color:#475569;line-height:1.6;' }, body || ''],
    ];
    if (buttonHref) {
      textChildren.push(['a', {
        'data-mp-card-button': 'true',
        href: buttonHref,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: `display:inline-block;margin-top:12px;background:${buttonColor};color:#fff;font-weight:800;font-size:14px;padding:10px 22px;border-radius:999px;text-decoration:none;`,
      }, buttonLabel || 'ดูเพิ่มเติม']);
    }

    const bodyBlock = ['div', { style: 'padding:16px;flex:1;' }, ...textChildren];

    return ['div', mergeAttributes(HTMLAttributes, {
      'data-mp-media-card': 'true',
      'data-mp-card-layout': horizontal ? 'horizontal' : 'vertical',
      style: `display:flex;flex-direction:${horizontal ? 'row' : 'column'};align-items:stretch;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;margin:12px 0;`,
    }), ...(image ? [image] : []), bodyBlock] as any;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaCardComponent);
  },
});
