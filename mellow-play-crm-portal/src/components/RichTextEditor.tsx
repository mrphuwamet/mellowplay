import React from 'react';
import EditorCore from './tiptap/EditorCore';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  uploadFolder?: string;
  /** See EditorCore — lets a host insert at the cursor (variable chips). */
  onEditorReady?: React.ComponentProps<typeof EditorCore>['onEditorReady'];
}

// Course / event / service descriptions. Now a thin wrapper over the shared
// EditorCore — this file and NewsFeedEditor.tsx were near-identical copies, and
// every capability added since (click-through image links, image rows, YouTube
// embeds, crop, alignment, paste-to-upload) belongs in both, so the copy was
// retired rather than tripled.
//
// The value/onChange/placeholder/uploadFolder API is unchanged, so
// CourseManagement.tsx needs no call-site changes. The `course` variant leaves
// out the CTA button and media card, which stay article-only as before.
const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, uploadFolder = 'course-description', onEditorReady }) => (
  <EditorCore
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    uploadFolder={uploadFolder}
    onEditorReady={onEditorReady}
    variant="course"
    contentClassName="rich-text-editor-content"
    minHeight={180}
    maxHeight={420}
    helperText="รองรับตัวหนา/เอียง/ขีดเส้นใต้ สี ขนาดและการจัดตำแหน่งข้อความ Highlight หัวข้อย่อย ลิสต์ ลิงก์ รูปภาพ (ครอบตัด/ลากมุมปรับขนาด/กดที่รูปเพื่อเปิดลิงก์) แถวรูปภาพ และวิดีโอ YouTube — วางหรือลากไฟล์รูปมาใส่ได้เลย"
  />
);

export default RichTextEditor;
