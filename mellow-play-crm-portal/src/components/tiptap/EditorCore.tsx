import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, IconButton, Tooltip, CircularProgress, Divider, Typography, Menu, MenuItem,
  ListItemIcon, ListItemText, GlobalStyles, Button,
} from '@mui/material';
import {
  FormatBold, FormatItalic, FormatUnderlined, FormatListBulleted,
  FormatListNumbered, Image as ImageIcon, Link as LinkIcon, Title as HeadingIcon,
  Notes as ParagraphIcon, FormatColorText as ColorIcon, FormatSize as FontSizeIcon,
  SmartButton as ButtonIcon, Undo as UndoIcon, Redo as RedoIcon, Circle as SwatchIcon,
  FormatColorFill as HighlightIcon, FormatAlignLeft, FormatAlignCenter, FormatAlignRight,
  Collections as ImageRowIcon, YouTube as YouTubeIcon, Dashboard as MediaCardIcon,
  AddPhotoAlternate as ImageSettingsIcon,
} from '@mui/icons-material';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { CtaButton, MpImage, ImageRow, YoutubeEmbed, MediaCard, extractYoutubeId } from './extensions';
import AttrTextField from './AttrTextField';
import ImageCropDialog from '../ImageCropDialog';
import { uploadEditorImage } from '../../utils/imageUpload';

const COLOR_SWATCHES = ['#0f172a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'];
const HIGHLIGHT_SWATCHES = ['#fff3a3', '#b9f6ca', '#a7d8ff', '#ffd1a9', '#f4b8ff', '#ff9e9e'];

const FONT_SIZES: { label: string; value: string | null }[] = [
  { label: 'เล็ก', value: '12px' },
  { label: 'ปกติ', value: null },
  { label: 'กลาง', value: '18px' },
  { label: 'ใหญ่', value: '24px' },
  { label: 'ใหญ่มาก', value: '32px' },
];

// Which extras a given host gets. 'article' keeps the button-bearing nodes
// (CTA button, media card) that RichTextEditor deliberately left out of course
// and service descriptions; everything else is shared by both.
export type EditorVariant = 'course' | 'article';

export interface EditorCoreProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  uploadFolder: string;
  variant: EditorVariant;
  // Kept as a prop so each host keeps its own CSS scope class and sizing,
  // exactly as the two separate components had before they were merged.
  contentClassName: string;
  minHeight: number;
  maxHeight: number;
  helperText: string;
}

// What the crop dialog should do with the file once the user is happy with it.
type PendingKind = 'inline' | 'mediaCard';

// One TipTap/ProseMirror editor shared by RichTextEditor (course, event and
// service descriptions) and NewsFeedEditor (news articles). The two used to be
// near-identical copies; every feature added since — click-through image links,
// image rows, YouTube embeds, crop, alignment, paste-to-upload — applies to
// both, so a third copy was not worth keeping. The `variant` prop carries the
// only real difference.
const EditorCore: React.FC<EditorCoreProps> = ({
  value, onChange, placeholder, uploadFolder, variant, contentClassName,
  minHeight, maxHeight, helperText,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rowInputRef = useRef<HTMLInputElement>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [colorMenuAnchor, setColorMenuAnchor] = useState<HTMLElement | null>(null);
  const [highlightMenuAnchor, setHighlightMenuAnchor] = useState<HTMLElement | null>(null);
  const [fontSizeMenuAnchor, setFontSizeMenuAnchor] = useState<HTMLElement | null>(null);
  const [imageMenuAnchor, setImageMenuAnchor] = useState<HTMLElement | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [pendingKind, setPendingKind] = useState<PendingKind>('inline');

  const isArticle = variant === 'article';

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyleKit.configure({ fontFamily: false, backgroundColor: false, lineHeight: false }),
      Highlight.configure({ multicolor: true }),
      // Only paragraphs and headings — aligning a list item moves its bullet
      // and reads as a bug rather than a feature.
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      MpImage.configure({
        HTMLAttributes: { style: 'border-radius:8px;display:block;max-width:100%' },
        resize: { enabled: true, directions: ['bottom-right'], minWidth: 60, alwaysPreserveAspectRatio: true },
      }),
      ImageRow,
      YoutubeEmbed,
      ...(isArticle ? [CtaButton, MediaCard] : []),
    ],
    content: value || '',
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      // Pasting a screenshot and dragging a file in are how images actually
      // get added in practice; before this the toolbar button was the only
      // way and a pasted image was silently dropped.
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadAndInsert(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const dt = (event as DragEvent).dataTransfer;
        const files = Array.from(dt?.files || []).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadAndInsert(files);
        return true;
      },
    },
  });

  // Switching which item is being edited swaps `value` out from under an
  // already-mounted editor instance — sync it in without fighting the cursor
  // position on every keystroke (setContent is a no-op if the HTML already
  // matches).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Upload straight through with no crop step: used for paste/drop (where the
  // user did not go looking for a dialog) and for image rows, whose tiles are
  // square-cropped by CSS anyway.
  const uploadAndInsert = useCallback(async (files: File[]) => {
    if (!editor) return;
    setUploading(true);
    try {
      for (const file of files) {
        const result = await uploadEditorImage(file, uploadFolder);
        if (result) editor.chain().focus().setImage({ src: result.url }).run();
      }
    } catch {
      /* upload failure just leaves the editor untouched */
    } finally {
      setUploading(false);
    }
  }, [editor, uploadFolder]);

  const insertRow = useCallback(async (files: File[]) => {
    if (!editor || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: { src: string }[] = [];
      for (const file of files.slice(0, 4)) {
        const result = await uploadEditorImage(file, uploadFolder);
        if (result) uploaded.push({ src: result.url });
      }
      if (uploaded.length > 0) {
        editor.chain().focus().insertContent({ type: 'imageRow', attrs: { images: uploaded } }).run();
      }
    } finally {
      setUploading(false);
    }
  }, [editor, uploadFolder]);

  // The row's own "+" tile and the media card's image slot both live inside a
  // NodeView, which has no access to the upload folder or the crop dialog.
  // They raise a DOM event instead; the node is already selected by the time
  // it fires, so the resulting attribute update targets it via
  // updateAttributes without any position bookkeeping.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onRowAdd = () => rowInputRef.current?.click();
    const onCardImage = () => cardInputRef.current?.click();
    dom.addEventListener('mp-image-row-add', onRowAdd);
    dom.addEventListener('mp-media-card-image', onCardImage);
    return () => {
      dom.removeEventListener('mp-image-row-add', onRowAdd);
      dom.removeEventListener('mp-media-card-image', onCardImage);
    };
  }, [editor]);

  const appendToSelectedRow = useCallback(async (file: File) => {
    if (!editor) return;
    setUploading(true);
    try {
      const result = await uploadEditorImage(file, uploadFolder);
      if (!result) return;
      const node = (editor.state.selection as any).node;
      const current = (node?.attrs?.images || []) as { src: string }[];
      editor.commands.updateAttributes('imageRow', { images: [...current, { src: result.url }] });
    } finally {
      setUploading(false);
    }
  }, [editor, uploadFolder]);

  const applyCropped = useCallback(async (file: File) => {
    setCropFile(null);
    if (!editor) return;
    setUploading(true);
    try {
      const result = await uploadEditorImage(file, uploadFolder);
      if (!result) return;
      if (pendingKind === 'mediaCard') {
        editor.commands.updateAttributes('mediaCard', { imageSrc: result.url });
      } else {
        editor.chain().focus().setImage({ src: result.url }).run();
      }
    } finally {
      setUploading(false);
    }
  }, [editor, uploadFolder, pendingKind]);

  if (!editor) return null;

  const insertLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('ใส่ URL ลิงก์', prev || '');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const insertYoutube = () => {
    const url = window.prompt('วางลิงก์ YouTube (จะฝังเป็นวิดีโอในเนื้อหา)', '');
    if (!url) return;
    const id = extractYoutubeId(url);
    if (!id) {
      window.alert('ไม่พบรหัสวิดีโอในลิงก์นี้ — รองรับ youtube.com/watch, youtu.be, /shorts และ /embed');
      return;
    }
    editor.chain().focus().insertContent({ type: 'youtubeEmbed', attrs: { videoId: id } }).run();
  };

  const imageSelected = editor.isActive('image');
  const imageAttrs = editor.getAttributes('image') as { href?: string; caption?: string; alt?: string };

  const btn = (active: boolean) => ({ color: active ? 'primary.main' as const : undefined, bgcolor: active ? 'primary.50' : undefined });

  return (
    <Box>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, p: 0.75, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50', flexWrap: 'wrap' }}>
          <Tooltip title="ตัวหนา">
            <IconButton size="small" sx={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}><FormatBold fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ตัวเอียง">
            <IconButton size="small" sx={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}><FormatItalic fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ขีดเส้นใต้">
            <IconButton size="small" sx={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()}><FormatUnderlined fontSize="small" /></IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
          <Tooltip title="หัวข้อย่อย">
            <IconButton size="small" sx={btn(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><HeadingIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ย่อหน้าปกติ">
            <IconButton size="small" sx={btn(editor.isActive('paragraph'))} onClick={() => editor.chain().focus().setParagraph().run()}><ParagraphIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="บุลเลต">
            <IconButton size="small" sx={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}><FormatListBulleted fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ลำดับเลข">
            <IconButton size="small" sx={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}><FormatListNumbered fontSize="small" /></IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
          <Tooltip title="จัดชิดซ้าย">
            <IconButton size="small" sx={btn(editor.isActive({ textAlign: 'left' }))} onClick={() => editor.chain().focus().setTextAlign('left').run()}><FormatAlignLeft fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="จัดกลาง">
            <IconButton size="small" sx={btn(editor.isActive({ textAlign: 'center' }))} onClick={() => editor.chain().focus().setTextAlign('center').run()}><FormatAlignCenter fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="จัดชิดขวา">
            <IconButton size="small" sx={btn(editor.isActive({ textAlign: 'right' }))} onClick={() => editor.chain().focus().setTextAlign('right').run()}><FormatAlignRight fontSize="small" /></IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

          <Tooltip title="สีข้อความ">
            <IconButton size="small" onClick={e => setColorMenuAnchor(e.currentTarget)}><ColorIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Menu anchorEl={colorMenuAnchor} open={!!colorMenuAnchor} onClose={() => setColorMenuAnchor(null)}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, py: 1, maxWidth: 180 }}>
              {COLOR_SWATCHES.map(c => (
                <Box
                  key={c}
                  onClick={() => { editor.chain().focus().setColor(c).run(); setColorMenuAnchor(null); }}
                  sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: c, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.1)' }}
                />
              ))}
            </Box>
            <MenuItem dense onClick={e => e.stopPropagation()}>
              <ListItemIcon><SwatchIcon fontSize="small" /></ListItemIcon>
              <ListItemText>
                <input
                  type="color"
                  onChange={e => { editor.chain().focus().setColor(e.target.value).run(); setColorMenuAnchor(null); }}
                  style={{ width: '100%', height: 28, border: 'none', cursor: 'pointer' }}
                />
              </ListItemText>
            </MenuItem>
            <MenuItem dense onClick={() => { editor.chain().focus().unsetColor().run(); setColorMenuAnchor(null); }}>ล้างสี (ค่าเริ่มต้น)</MenuItem>
          </Menu>

          <Tooltip title="เน้นข้อความ (Highlight)">
            <IconButton size="small" sx={btn(editor.isActive('highlight'))} onClick={e => setHighlightMenuAnchor(e.currentTarget)}><HighlightIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Menu anchorEl={highlightMenuAnchor} open={!!highlightMenuAnchor} onClose={() => setHighlightMenuAnchor(null)}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, py: 1, maxWidth: 180 }}>
              {HIGHLIGHT_SWATCHES.map(c => (
                <Box
                  key={c}
                  onClick={() => { editor.chain().focus().toggleHighlight({ color: c }).run(); setHighlightMenuAnchor(null); }}
                  sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: c, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.1)' }}
                />
              ))}
            </Box>
            <MenuItem dense onClick={e => e.stopPropagation()}>
              <ListItemIcon><SwatchIcon fontSize="small" /></ListItemIcon>
              <ListItemText>
                <input
                  type="color"
                  onChange={e => { editor.chain().focus().toggleHighlight({ color: e.target.value }).run(); setHighlightMenuAnchor(null); }}
                  style={{ width: '100%', height: 28, border: 'none', cursor: 'pointer' }}
                />
              </ListItemText>
            </MenuItem>
            <MenuItem dense onClick={() => { editor.chain().focus().unsetHighlight().run(); setHighlightMenuAnchor(null); }}>ล้างการเน้น</MenuItem>
          </Menu>

          <Tooltip title="ขนาดข้อความ">
            <IconButton size="small" onClick={e => setFontSizeMenuAnchor(e.currentTarget)}><FontSizeIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Menu anchorEl={fontSizeMenuAnchor} open={!!fontSizeMenuAnchor} onClose={() => setFontSizeMenuAnchor(null)}>
            {FONT_SIZES.map(sz => (
              <MenuItem
                key={sz.label}
                dense
                onClick={() => {
                  if (sz.value) editor.chain().focus().setFontSize(sz.value).run();
                  else editor.chain().focus().unsetFontSize().run();
                  setFontSizeMenuAnchor(null);
                }}
              >
                {sz.label}
              </MenuItem>
            ))}
          </Menu>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
          <Tooltip title="แทรกลิงก์ในข้อความ">
            <IconButton size="small" sx={btn(editor.isActive('link'))} onClick={insertLink}><LinkIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="แทรกรูปภาพ (ครอบตัดได้ก่อนอัปโหลด, ลากมุมปรับขนาด)">
            <IconButton size="small" onClick={() => { setPendingKind('inline'); fileInputRef.current?.click(); }} disabled={uploading}>
              {uploading ? <CircularProgress size={16} /> : <ImageIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="แถวรูปภาพ (เรียงบรรทัดเดียว — เลือกได้หลายไฟล์)">
            <IconButton size="small" onClick={() => rowInputRef.current?.click()} disabled={uploading}><ImageRowIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ฝังวิดีโอ YouTube (หรือวางลิงก์ในเนื้อหาได้เลย)">
            <IconButton size="small" onClick={insertYoutube}><YouTubeIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title={imageSelected ? 'ตั้งลิงก์ / คำบรรยาย / Alt ของรูปที่เลือก' : 'เลือกรูปในเนื้อหาก่อน เพื่อตั้งลิงก์และคำบรรยาย'}>
            <span>
              <IconButton size="small" disabled={!imageSelected} sx={btn(!!imageAttrs.href)} onClick={e => setImageMenuAnchor(e.currentTarget)}>
                <ImageSettingsIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {isArticle && (
            <>
              <Tooltip title="แทรกปุ่ม CTA">
                <IconButton size="small" onClick={() => editor.chain().focus().insertContent({ type: 'ctaButton' }).run()}><ButtonIcon fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="แทรกการ์ด (รูป + ข้อความ + ปุ่มกด)">
                <IconButton size="small" onClick={() => editor.chain().focus().insertContent({ type: 'mediaCard' }).run()}><MediaCardIcon fontSize="small" /></IconButton>
              </Tooltip>
            </>
          )}

          <Menu anchorEl={imageMenuAnchor} open={!!imageMenuAnchor} onClose={() => setImageMenuAnchor(null)}>
            <Box sx={{ px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 1.5, width: 300 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                กดที่รูปนี้แล้วเปิดลิงก์ (ใช้รูปเป็นปุ่มได้เลย)
              </Typography>
              {/* AttrTextField rather than a plain controlled TextField: it
                  commits every keystroke (this Menu unmounts on outside click,
                  where blur would never fire) while rendering from a local draft
                  so the attribute round-trip cannot move the caret. */}
              <AttrTextField
                size="small"
                label="ลิงก์เมื่อกดที่รูป"
                placeholder="https://..."
                value={imageAttrs.href || ''}
                onCommit={v => editor.commands.updateAttributes('image', { href: v.trim() || null })}
              />
              <AttrTextField
                size="small"
                label="คำบรรยายใต้รูป (Caption)"
                value={imageAttrs.caption || ''}
                onCommit={v => editor.commands.updateAttributes('image', { caption: v || null })}
              />
              <AttrTextField
                size="small"
                label="Alt — ข้อความแทนรูป (SEO / screen reader)"
                value={imageAttrs.alt || ''}
                onCommit={v => editor.commands.updateAttributes('image', { alt: v || null })}
              />
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {([['left', 'ซ้าย'], ['center', 'กลาง'], ['right', 'ขวา']] as const).map(([v, label]) => (
                  <Button
                    key={v}
                    size="small"
                    variant="outlined"
                    onClick={() => editor.commands.updateAttributes('image', { align: v })}
                    sx={{ textTransform: 'none', flex: 1 }}
                  >
                    {label}
                  </Button>
                ))}
              </Box>
              <Button variant="contained" size="small" onClick={() => setImageMenuAnchor(null)} sx={{ textTransform: 'none', fontWeight: 700 }}>ตกลง</Button>
            </Box>
          </Menu>

          <input
            type="file"
            accept="image/*"
            hidden
            ref={fileInputRef}
            onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingKind('inline'); setCropFile(f); } e.target.value = ''; }}
          />
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            ref={rowInputRef}
            onChange={e => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length === 0) return;
              // Adding to a row that is already selected appends to it;
              // otherwise the selection is somewhere else and this starts a
              // new row.
              if (editor.isActive('imageRow') && files.length === 1) void appendToSelectedRow(files[0]);
              else void insertRow(files);
            }}
          />
          <input
            type="file"
            accept="image/*"
            hidden
            ref={cardInputRef}
            onChange={e => { const f = e.target.files?.[0]; if (f) { setPendingKind('mediaCard'); setCropFile(f); } e.target.value = ''; }}
          />

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
          <Tooltip title="ย้อนกลับ">
            <span>
              <IconButton size="small" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><UndoIcon fontSize="small" /></IconButton>
            </span>
          </Tooltip>
          <Tooltip title="ทำซ้ำ">
            <span>
              <IconButton size="small" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><RedoIcon fontSize="small" /></IconButton>
            </span>
          </Tooltip>
        </Box>

        <Box sx={{ position: 'relative' }}>
          {editor.isEmpty && (
            <Typography
              sx={{ position: 'absolute', top: 16, left: 16, color: 'text.disabled', fontSize: 14, pointerEvents: 'none' }}
            >
              {placeholder}
            </Typography>
          )}
          <GlobalStyles
            styles={{
              [`.${contentClassName} .ProseMirror`]: {
                minHeight, maxHeight, overflowY: 'auto', padding: 16,
                fontSize: 14, lineHeight: 1.7, outline: 'none',
              },
              [`.${contentClassName} .ProseMirror h3`]: { fontWeight: 800, fontSize: 18, margin: '8px 0' },
              [`.${contentClassName} .ProseMirror ul, .${contentClassName} .ProseMirror ol`]: { paddingLeft: 24 },
              [`.${contentClassName} .ProseMirror p`]: { margin: '4px 0' },
              [`.${contentClassName} .ProseMirror a`]: { color: '#2563eb' },
              [`.${contentClassName} .ProseMirror mark`]: { borderRadius: 3, padding: '0 2px' },
              // TipTap's built-in image resize NodeView ships unstyled
              // ([data-resize-*] attributes only) — the handle needs its own
              // visible size/color, shown on hover so the content doesn't look
              // cluttered with square handles by default.
              [`.${contentClassName} [data-resize-container]`]: { maxWidth: '100%' },
              [`.${contentClassName} [data-resize-handle]`]: {
                width: 14, height: 14, borderRadius: 4, background: '#7c3aed',
                border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                cursor: 'nwse-resize', opacity: 0, transition: 'opacity 0.15s',
              },
              [`.${contentClassName} [data-resize-wrapper]:hover [data-resize-handle]`]: { opacity: 1 },
              [`.${contentClassName} [data-resize-state="true"] [data-resize-handle]`]: { opacity: 1 },
              // figcaption is emitted by the image node once a caption is set;
              // it needs matching styling inside the editor so what the writer
              // sees lines up with the published article.
              [`.${contentClassName} .ProseMirror figure`]: { margin: '12px 0' },
              [`.${contentClassName} .ProseMirror figcaption`]: { marginTop: 6, fontSize: 13, color: '#64748b' },
            }}
          />
          <Box className={contentClassName}>
            <EditorContent editor={editor} />
          </Box>
        </Box>
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
        {helperText}
      </Typography>

      <ImageCropDialog
        open={!!cropFile}
        file={cropFile}
        defaultAspect={pendingKind === 'mediaCard' ? 16 / 9 : undefined}
        onCancel={() => setCropFile(null)}
        onCropped={applyCropped}
      />
    </Box>
  );
};

export default EditorCore;
