import React, { useState } from 'react';
import { Box, TextField, Button } from '@mui/material';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';

// A styled CTA link, atom-only in the schema — while editing, a NodeView
// renders it as a real-looking pill button with an inline label/href/color
// popover; the persisted HTML (getHTML/renderHTML below) is a plain <a> tag
// with inline styles, so it renders identically via the consumer app's
// dangerouslySetInnerHTML with no supporting JS/CSS needed on that side.
const CtaButtonComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, deleteNode, editor, getPos }) => {
  const { href, label, color } = node.attrs as { href: string; label: string; color: string };
  const [localLabel, setLocalLabel] = useState(label);
  const [localHref, setLocalHref] = useState(href);
  const [localColor, setLocalColor] = useState(color);

  const commit = () => {
    updateAttributes({
      label: localLabel.trim() || 'ปุ่มกด',
      href: localHref.trim() || '#',
      color: localColor,
    });
  };

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
            outline: selected ? '2px dashed #7c3aed' : 'none', outlineOffset: 4,
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
            <TextField size="small" label="ข้อความปุ่ม" value={localLabel} onChange={e => setLocalLabel(e.target.value)} onBlur={commit} />
            <TextField size="small" label="ลิงก์ (URL)" value={localHref} onChange={e => setLocalHref(e.target.value)} onBlur={commit} placeholder="https://..." />
            <Box display="flex" alignItems="center" gap={1}>
              <input type="color" value={localColor} onChange={e => { setLocalColor(e.target.value); }} onBlur={commit} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
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
      color: { default: '#7c3aed', renderHTML: () => ({}) },
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
        color: el.style.background || el.style.backgroundColor || '#7c3aed',
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
