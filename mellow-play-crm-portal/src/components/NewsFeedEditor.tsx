import React, { useRef, useState } from 'react';
import { Box, IconButton, Tooltip, CircularProgress, Divider, Typography, Menu, MenuItem, ListItemIcon, ListItemText, GlobalStyles } from '@mui/material';
import {
  FormatBold, FormatItalic, FormatUnderlined, FormatListBulleted,
  FormatListNumbered, Image as ImageIcon, Link as LinkIcon, Title as HeadingIcon,
  Notes as ParagraphIcon, FormatColorText as ColorIcon, FormatSize as FontSizeIcon,
  SmartButton as ButtonIcon, Undo as UndoIcon, Redo as RedoIcon, Circle as SwatchIcon,
  FormatColorFill as HighlightIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import { API_URL } from '../config';
import { CtaButton } from './tiptap/extensions';

interface NewsFeedEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  uploadFolder?: string;
}

const COLOR_SWATCHES = ['#0f172a', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'];
const HIGHLIGHT_SWATCHES = ['#fff3a3', '#b9f6ca', '#a7d8ff', '#ffd1a9', '#f4b8ff', '#ff9e9e'];

const FONT_SIZES: { label: string; value: string | null }[] = [
  { label: 'เล็ก', value: '12px' },
  { label: 'ปกติ', value: null },
  { label: 'กลาง', value: '18px' },
  { label: 'ใหญ่', value: '24px' },
  { label: 'ใหญ่มาก', value: '32px' },
];

// TipTap/ProseMirror manages the contentEditable DOM directly instead of
// re-rendering it from React state on every keystroke, so it doesn't hit the
// cursor-loss issue that ruled out third-party editors for the old
// RichTextEditor — kept as its own component rather than a shared one since
// this one adds article-only extras (CtaButton) RichTextEditor doesn't need.
const NewsFeedEditor: React.FC<NewsFeedEditorProps> = ({ value, onChange, placeholder, uploadFolder = 'news-feed' }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [colorMenuAnchor, setColorMenuAnchor] = useState<HTMLElement | null>(null);
  const [highlightMenuAnchor, setHighlightMenuAnchor] = useState<HTMLElement | null>(null);
  const [fontSizeMenuAnchor, setFontSizeMenuAnchor] = useState<HTMLElement | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyleKit.configure({ fontFamily: false, backgroundColor: false, lineHeight: false }),
      Highlight.configure({ multicolor: true }),
      Image.configure({
        HTMLAttributes: { style: 'border-radius:8px;display:block;max-width:100%' },
        resize: { enabled: true, directions: ['bottom-right'], minWidth: 60, alwaysPreserveAspectRatio: true },
      }),
      CtaButton,
    ],
    content: value || '',
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Switching which item is being edited swaps `value` out from under an
  // already-mounted editor instance — sync it in without fighting the
  // cursor position on every keystroke (setContent is a no-op if the HTML
  // already matches).
  React.useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const insertImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', uploadFolder);
      const res = await axios.post(`${API_URL}/api/v1/admin/upload`, fd);
      if (res.data.success) {
        editor.chain().focus().setImage({ src: res.data.url }).run();
      }
    } catch {
      /* upload failure just leaves the editor untouched */
    } finally {
      setUploading(false);
    }
  };

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

  const insertCtaButton = () => {
    editor.chain().focus().insertContent({ type: 'ctaButton' }).run();
  };

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
          <Tooltip title="แทรกลิงก์">
            <IconButton size="small" sx={btn(editor.isActive('link'))} onClick={insertLink}><LinkIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="แทรกรูปภาพ (ลากมุมเพื่อปรับขนาดได้)">
            <IconButton size="small" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <CircularProgress size={16} /> : <ImageIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="แทรกปุ่ม CTA">
            <IconButton size="small" onClick={insertCtaButton}><ButtonIcon fontSize="small" /></IconButton>
          </Tooltip>
          <input
            type="file"
            accept="image/*"
            hidden
            ref={fileInputRef}
            onChange={e => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = ''; }}
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
              '.newsfeed-editor-content .ProseMirror': {
                minHeight: 220, maxHeight: 520, overflowY: 'auto', padding: 16,
                fontSize: 14, lineHeight: 1.7, outline: 'none',
              },
              '.newsfeed-editor-content .ProseMirror h3': { fontWeight: 800, fontSize: 18, margin: '8px 0' },
              '.newsfeed-editor-content .ProseMirror ul, .newsfeed-editor-content .ProseMirror ol': { paddingLeft: 24 },
              '.newsfeed-editor-content .ProseMirror p': { margin: '4px 0' },
              '.newsfeed-editor-content .ProseMirror a': { color: '#2563eb' },
              '.newsfeed-editor-content .ProseMirror mark': { borderRadius: 3, padding: '0 2px' },
              // TipTap's built-in image resize NodeView ships unstyled
              // ([data-resize-*] attributes only) — the handle needs its
              // own visible size/color, shown on hover so a static article
              // preview doesn't look cluttered with square handles.
              '.newsfeed-editor-content [data-resize-container]': { maxWidth: '100%' },
              '.newsfeed-editor-content [data-resize-handle]': {
                width: 14, height: 14, borderRadius: 4, background: '#7c3aed',
                border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                cursor: 'nwse-resize', opacity: 0, transition: 'opacity 0.15s',
              },
              '.newsfeed-editor-content [data-resize-wrapper]:hover [data-resize-handle]': { opacity: 1 },
              '.newsfeed-editor-content [data-resize-state="true"] [data-resize-handle]': { opacity: 1 },
            }}
          />
          <Box className="newsfeed-editor-content">
            <EditorContent editor={editor} />
          </Box>
        </Box>
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
        รองรับตัวหนา/เอียง/ขีดเส้นใต้ สีและขนาดข้อความ การเน้นข้อความ (Highlight) หัวข้อย่อย ลิสต์ ลิงก์ รูปภาพ (ลากมุมปรับขนาดได้) และปุ่ม CTA
      </Typography>
    </Box>
  );
};

export default NewsFeedEditor;
