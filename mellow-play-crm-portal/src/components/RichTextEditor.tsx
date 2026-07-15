import React, { useRef, useState, useEffect } from 'react';
import { Box, IconButton, Tooltip, CircularProgress, Divider, Typography } from '@mui/material';
import {
  FormatBold, FormatItalic, FormatUnderlined, FormatListBulleted,
  FormatListNumbered, Image as ImageIcon, Link as LinkIcon, Title as HeadingIcon,
  Notes as ParagraphIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  uploadFolder?: string;
}

// Custom contentEditable-based editor (not react-quill or similar) — those
// libraries re-mount/lose cursor state under React 18 StrictMode's dev-mode
// double-invoke. document.execCommand is deprecated but still broadly
// supported in every browser this CRM targets, and is more than enough for
// simple article formatting + inline image insertion.
const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, uploadFolder = 'news-feed' }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Only write into the DOM when the prop actually diverges from current
  // content (e.g. switching which item is being edited) — writing on every
  // render would reset the cursor position mid-typing.
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== (value || '')) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const handleInput = () => {
    onChange(editorRef.current?.innerHTML || '');
  };

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
  };

  const insertImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', uploadFolder);
      const res = await axios.post(`${API_URL}/api/v1/admin/upload`, fd);
      if (res.data.success) {
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, `<img src="${res.data.url}" style="max-width:100%;border-radius:8px;margin:8px 0;display:block;" />`);
        handleInput();
      }
    } catch {
      /* upload failure just leaves the editor untouched */
    } finally {
      setUploading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, p: 0.75, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50', flexWrap: 'wrap' }}>
          <Tooltip title="ตัวหนา">
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}><FormatBold fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ตัวเอียง">
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')}><FormatItalic fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ขีดเส้นใต้">
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')}><FormatUnderlined fontSize="small" /></IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
          <Tooltip title="หัวข้อย่อย">
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec('formatBlock', '<h3>')}><HeadingIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ย่อหน้าปกติ">
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec('formatBlock', '<p>')}><ParagraphIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="บุลเลต">
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec('insertUnorderedList')}><FormatListBulleted fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="ลำดับเลข">
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec('insertOrderedList')}><FormatListNumbered fontSize="small" /></IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
          <Tooltip title="แทรกลิงก์">
            <IconButton
              size="small"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { const url = window.prompt('ใส่ URL ลิงก์'); if (url) exec('createLink', url); }}
            >
              <LinkIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="แทรกรูปภาพ">
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <CircularProgress size={16} /> : <ImageIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <input
            type="file"
            accept="image/*"
            hidden
            ref={fileInputRef}
            onChange={e => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = ''; }}
          />
        </Box>
        <Box
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleInput}
          data-placeholder={placeholder}
          sx={{
            minHeight: 180,
            maxHeight: 420,
            overflowY: 'auto',
            p: 2,
            fontSize: 14,
            lineHeight: 1.7,
            outline: 'none',
            '&:empty:before': { content: 'attr(data-placeholder)', color: 'text.disabled' },
            '& img': { maxWidth: '100%', borderRadius: 1 },
            '& h3': { fontWeight: 800, fontSize: 18, margin: '8px 0' },
            '& ul, & ol': { paddingLeft: 3 },
          }}
        />
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
        รองรับตัวหนา/เอียง/ขีดเส้นใต้ หัวข้อย่อย ลิสต์ ลิงก์ และแทรกรูปภาพในเนื้อหาได้ (ใช้สำหรับ SEO ในอนาคต)
      </Typography>
    </Box>
  );
};

export default RichTextEditor;
