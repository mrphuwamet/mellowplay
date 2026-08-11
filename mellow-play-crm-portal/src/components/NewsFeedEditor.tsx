import React from 'react';
import EditorCore from './tiptap/EditorCore';

interface NewsFeedEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  uploadFolder?: string;
}

// News articles and "เรื่องน่ารู้". Thin wrapper over the shared EditorCore
// (see RichTextEditor.tsx for why the two were merged) with the `article`
// variant, which adds the two button-bearing nodes course descriptions do not
// get: the standalone CTA button and the image+text+button media card.
const NewsFeedEditor: React.FC<NewsFeedEditorProps> = ({ value, onChange, placeholder, uploadFolder = 'news-feed' }) => (
  <EditorCore
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    uploadFolder={uploadFolder}
    variant="article"
    contentClassName="newsfeed-editor-content"
    minHeight={220}
    maxHeight={520}
    helperText="รองรับตัวหนา/เอียง/ขีดเส้นใต้ สี ขนาดและการจัดตำแหน่งข้อความ Highlight หัวข้อย่อย ลิสต์ ลิงก์ รูปภาพ (ครอบตัด/ลากมุมปรับขนาด/กดที่รูปเพื่อเปิดลิงก์) แถวรูปภาพ วิดีโอ YouTube ปุ่ม CTA และการ์ดรูป+ข้อความ+ปุ่ม — วางหรือลากไฟล์รูปมาใส่ได้เลย"
  />
);

export default NewsFeedEditor;
