import { Node, mergeAttributes } from '@tiptap/core';

// An atomic, non-editable inline "tag" for one {{key}} template variable —
// lets the SMS compose boxes show "ชื่อเด็ก" as a pill instead of the raw
// mustache token. `label` is baked into the node's own attrs at insert/parse
// time (rather than looked up live via a NodeView) so this stays a plain
// Node with no React rendering dependency — simpler, and immune to the
// available-variables list changing after the fact.
export const SmsVariableNode = Node.create({
  name: 'smsVariable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      key: { default: '' },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [{
      tag: 'span[data-sms-variable]',
      getAttrs: (el: HTMLElement) => ({
        key: el.getAttribute('data-sms-variable') || '',
        label: el.textContent || '',
      }),
    }];
  },

  renderHTML({ node }) {
    return ['span', mergeAttributes({
      'data-sms-variable': node.attrs.key,
      class: 'sms-variable-tag',
      contenteditable: 'false',
    }), node.attrs.label || node.attrs.key];
  },
});
