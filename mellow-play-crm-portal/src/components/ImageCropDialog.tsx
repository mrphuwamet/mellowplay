import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box,
  ToggleButton, ToggleButtonGroup, Typography, CircularProgress,
} from '@mui/material';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { blobToFile } from '../utils/imageUpload';

// Aspect presets rather than free-crop only: the two places a cropped image
// lands both have a fixed frame — the news thumbnail is rendered in a 16:9 box
// (NewsDetail.tsx) and image-row tiles are square — so cropping to the frame
// the reader will actually see is the common case. Free stays available for
// everything else.
const ASPECTS: { label: string; value: number | undefined }[] = [
  { label: 'อิสระ', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

interface ImageCropDialogProps {
  open: boolean;
  file: File | null;
  // Pre-selected aspect for the frame this image is going into; the user can
  // still change it.
  defaultAspect?: number;
  title?: string;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

const ImageCropDialog: React.FC<ImageCropDialogProps> = ({
  open, file, defaultAspect, title = 'ครอบตัดรูปภาพ', onCancel, onCropped,
}) => {
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(defaultAspect);
  const [working, setWorking] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // A blob: URL leaks for the lifetime of the document if it is never
  // revoked, and this dialog can be opened once per uploaded image.
  useEffect(() => {
    if (!file) { setObjectUrl(''); return; }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Reset per-image state whenever a different file comes in, otherwise the
  // previous image's crop rectangle is applied to the new one.
  useEffect(() => {
    setCrop(undefined);
    setCompletedCrop(undefined);
    setAspect(defaultAspect);
  }, [file, defaultAspect]);

  const centreCropFor = useCallback((width: number, height: number, ratio: number | undefined) => {
    if (!ratio) {
      // No `as Crop` here: that widens `unit` to 'px' | '%' and centerCrop's
      // overloads each require one specific literal.
      return centerCrop({ unit: '%', width: 90, height: 90, x: 0, y: 0 }, width, height);
    }
    return centerCrop(makeAspectCrop({ unit: '%', width: 90 }, ratio, width, height), width, height);
  }, []);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centreCropFor(width, height, aspect));
  };

  const changeAspect = (next: number | undefined) => {
    setAspect(next);
    const img = imgRef.current;
    if (img) setCrop(centreCropFor(img.width, img.height, next));
  };

  const confirm = async () => {
    const img = imgRef.current;
    if (!img || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) return;
    setWorking(true);
    try {
      // completedCrop is in *displayed* pixels; the canvas has to be filled
      // from the image's natural resolution or the crop would also silently
      // downscale by however much the preview was shrunk to fit the dialog.
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(completedCrop.width * scaleX);
      canvas.height = Math.round(completedCrop.height * scaleY);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0, 0, canvas.width, canvas.height,
      );

      const keepPng = file?.type === 'image/png';
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, keepPng ? 'image/png' : 'image/jpeg', keepPng ? undefined : 0.9),
      );
      if (!blob) return;
      const baseName = (file?.name || 'image').replace(/\.[^.]+$/, '');
      onCropped(blobToFile(blob, `${baseName}-crop.${keepPng ? 'png' : 'jpg'}`));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{title}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
            สัดส่วนภาพ
          </Typography>
          <ToggleButtonGroup size="small" exclusive value={aspect ?? 'free'} onChange={(_, v) => changeAspect(v === 'free' ? undefined : v)}>
            {ASPECTS.map(a => (
              <ToggleButton key={a.label} value={a.value ?? 'free'} sx={{ textTransform: 'none', fontWeight: 700, px: 1.5 }}>
                {a.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center', bgcolor: 'grey.100', borderRadius: 2, p: 1 }}>
          {objectUrl ? (
            <ReactCrop
              crop={crop}
              onChange={c => setCrop(c)}
              onComplete={c => setCompletedCrop(c)}
              aspect={aspect}
              keepSelection
            >
              <img
                ref={imgRef}
                src={objectUrl}
                alt="ครอบตัด"
                onLoad={onImageLoad}
                style={{ maxHeight: 420, maxWidth: '100%', display: 'block' }}
              />
            </ReactCrop>
          ) : (
            <CircularProgress size={28} sx={{ my: 4 }} />
          )}
        </Box>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
          ลากกรอบเพื่อเลือกส่วนที่ต้องการ — รูปจะถูกย่อและบีบอัดอัตโนมัติก่อนอัปโหลด
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} sx={{ textTransform: 'none' }}>ยกเลิก</Button>
        {/* Skipping the crop still runs the compress step on upload, so this
            is not the same as never opening the dialog. */}
        <Button onClick={() => file && onCropped(file)} sx={{ textTransform: 'none' }}>ใช้รูปเต็ม</Button>
        <Button
          variant="contained"
          onClick={confirm}
          disabled={!completedCrop || working}
          startIcon={working ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          ครอบตัดและใช้รูปนี้
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImageCropDialog;
