import React, { useEffect, useMemo } from 'react';
import { Box, Chip, GlobalStyles, Stack, Typography } from '@mui/material';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SmsVariableNode } from './tiptap/smsVariableNode';

// `label` is what the toolbar chip shows (can be long/descriptive).
// `tagLabel` is what the inline pill inside the editor shows — short by
// design. Builtins set both explicitly; form fields (whose label is a real,
// meaningful CRM-authored string, not a description to trim) fall back to
// showing their full `label` as the tag too — never auto-truncated.
export interface SmsTemplateVariable { key: string; label: string; tagLabel?: string }

interface SmsTemplateEditorProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  builtins: SmsTemplateVariable[];
  formFields?: SmsTemplateVariable[];
}

const TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

// Plain string (with {{key}} tokens) -> ProseMirror doc JSON, one paragraph
// per line. Unknown keys (no match in `labelFor`) still become a tag, just
// showing the raw key as its own label — never silently dropped.
function textToDoc(text: string, labelFor: (key: string) => string) {
  const lines = (text || '').split('\n');
  return {
    type: 'doc',
    content: lines.map(line => {
      const content: any[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      const re = new RegExp(TOKEN_RE);
      while ((match = re.exec(line))) {
        if (match.index > lastIndex) content.push({ type: 'text', text: line.slice(lastIndex, match.index) });
        const key = match[1];
        content.push({ type: 'smsVariable', attrs: { key, label: labelFor(key) } });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < line.length) content.push({ type: 'text', text: line.slice(lastIndex) });
      return { type: 'paragraph', content };
    }),
  };
}

// ProseMirror doc -> plain string with {{key}} tokens — walked manually
// (rather than relying on editor.getText()) so serialization of the custom
// atomic node is guaranteed correct regardless of TipTap's own text-export
// wiring for custom nodes.
function docToText(doc: any): string {
  const lines: string[] = [];
  doc.forEach((node: any) => {
    let line = '';
    node.forEach((child: any) => {
      if (child.type.name === 'smsVariable') line += `{{${child.attrs.key}}}`;
      else if (child.isText) line += child.text;
    });
    lines.push(line);
  });
  return lines.join('\n');
}

// Compose box for SMS templates — inserted variables show as a "ชื่อเด็ก"
// pill instead of the literal "{{child_name}}" text (see smsVariableNode.ts
// for why), while still reading/writing the same plain {{key}} string the
// backend's renderSmsTemplate expects, so no backend change was needed.
const SmsTemplateEditor: React.FC<SmsTemplateEditorProps> = ({ value, onChange, placeholder, builtins, formFields = [] }) => {
  const allVariables = useMemo(() => [...builtins, ...formFields], [builtins, formFields]);
  const labelFor = (key: string) => {
    const v = allVariables.find(v => v.key === key);
    return v ? (v.tagLabel || v.label) : key;
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false, bold: false, bulletList: false, code: false, codeBlock: false,
        heading: false, horizontalRule: false, italic: false, link: false, listItem: false,
        listKeymap: false, orderedList: false, strike: false, underline: false,
      }),
      SmsVariableNode,
    ],
    content: textToDoc(value, labelFor),
    onUpdate: ({ editor: e }) => onChange(docToText(e.state.doc)),
  });

  useEffect(() => {
    if (!editor) return;
    const current = docToText(editor.state.doc);
    if (value !== current) {
      editor.commands.setContent(textToDoc(value, labelFor), { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const insertVariable = (v: SmsTemplateVariable) => {
    editor.chain().focus().insertContent({ type: 'smsVariable', attrs: { key: v.key, label: v.tagLabel || v.label } }).run();
  };

  return (
    <Box>
      <Box sx={{ position: 'relative', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
        {editor.isEmpty && (
          <Typography sx={{ position: 'absolute', top: 14, left: 16, color: 'text.disabled', fontSize: 14, pointerEvents: 'none' }}>
            {placeholder}
          </Typography>
        )}
        <GlobalStyles styles={{
          '.sms-template-editor-content .ProseMirror': {
            minHeight: 100, maxHeight: 260, overflowY: 'auto', outline: 'none', fontSize: 14, lineHeight: 1.8,
          },
          '.sms-template-editor-content .ProseMirror p': { margin: 0 },
          '.sms-variable-tag': {
            display: 'inline-block', background: '#ede9fe', color: '#6d28d9', borderRadius: 999,
            padding: '1px 10px', fontWeight: 700, fontSize: '0.85em', whiteSpace: 'nowrap', margin: '0 1px',
          },
        }} />
        <Box className="sms-template-editor-content">
          <EditorContent editor={editor} />
        </Box>
      </Box>
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
        {builtins.map(v => (
          <Chip key={v.key} size="small" label={v.label} onClick={() => insertVariable(v)} />
        ))}
        {formFields.map(f => (
          <Chip key={f.key} size="small" variant="outlined" label={f.label} onClick={() => insertVariable(f)} />
        ))}
      </Stack>
    </Box>
  );
};

export default SmsTemplateEditor;
