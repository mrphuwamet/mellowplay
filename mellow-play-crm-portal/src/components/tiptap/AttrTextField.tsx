import React, { useEffect, useRef, useState } from 'react';
import { TextField, TextFieldProps } from '@mui/material';

type AttrTextFieldProps = Omit<TextFieldProps, 'value' | 'onChange'> & {
  /** The value currently stored on the node attribute. */
  value: string;
  /** Called on every keystroke with the new value. */
  onCommit: (value: string) => void;
};

// A text field for editing a ProseMirror node attribute, which needs to satisfy
// two requirements that pull against each other.
//
// 1. It must commit as the user types. These panels are unmounted the moment the
//    node is deselected, and blur is never delivered to an unmounting input, so
//    an onBlur commit loses whatever was typed last.
//
// 2. The caret must stay where the user put it. Binding `value` straight to the
//    attribute fails this: each keystroke commits, ProseMirror applies a
//    transaction, the NodeView re-renders, and React writes the round-tripped
//    string back into the input — which drops the caret at the end, so editing
//    the middle of a word was impossible.
//
// The fix is to render from a local draft (so the round-trip never touches the
// input) while still committing every keystroke. `lastWritten` distinguishes the
// echo of our own commit from a genuine outside change — undo, a programmatic
// update, switching which article is loaded — and only the latter resets the
// draft.
const AttrTextField: React.FC<AttrTextFieldProps> = ({ value, onCommit, ...rest }) => {
  const [draft, setDraft] = useState(value);
  const lastWritten = useRef(value);

  useEffect(() => {
    if (value !== lastWritten.current) {
      lastWritten.current = value;
      setDraft(value);
    }
  }, [value]);

  return (
    <TextField
      {...rest}
      value={draft}
      onChange={e => {
        const next = e.target.value;
        lastWritten.current = next;
        setDraft(next);
        onCommit(next);
      }}
    />
  );
};

export default AttrTextField;
