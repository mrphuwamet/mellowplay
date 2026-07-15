import React, { useRef, useState } from 'react';
import { Box, Slider, Typography } from '@mui/material';
import { ZoomIn as ZoomInIcon, OpenWith as PanIcon } from '@mui/icons-material';

interface FocalPointPickerProps {
  imageUrl: string;
  ratioW: number;
  ratioH: number;
  focalX: number; // 0-100
  focalY: number; // 0-100
  zoom?: number; // 1 (no zoom) - 3
  onChange: (focalX: number, focalY: number) => void;
  onZoomChange?: (zoom: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

// Drag-to-pan photo-cropper style UI (like a typical profile-photo cropper —
// grab the photo itself and slide it around behind the fixed frame) instead
// of dragging a small target dot. Still produces only a focal point (0-100)
// + zoom for CSS object-position/transform elsewhere — no real crop/export.
const FocalPointPicker: React.FC<FocalPointPickerProps> = ({ imageUrl, ratioW, ratioH, focalX, focalY, zoom = 1, onChange, onZoomChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; focalX: number; focalY: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imageUrl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, focalX, focalY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStartRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const start = dragStartRef.current;
    // Dragging the photo right should reveal more of its left side, so the
    // focal anchor moves opposite to the pointer; dividing by zoom keeps the
    // drag feeling 1:1 with the on-screen image regardless of zoom level.
    const dxPct = ((e.clientX - start.x) / rect.width) * 100 / zoom;
    const dyPct = ((e.clientY - start.y) / rect.height) * 100 / zoom;
    const newX = Math.min(100, Math.max(0, start.focalX - dxPct));
    const newY = Math.min(100, Math.max(0, start.focalY - dyPct));
    onChange(Math.round(newX), Math.round(newY));
  };

  const stopDragging = () => {
    setDragging(false);
    dragStartRef.current = null;
  };

  return (
    <Box>
      <Box
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${ratioW}/${ratioH}`,
          borderRadius: 2,
          overflow: 'hidden',
          cursor: imageUrl ? (dragging ? 'grabbing' : 'grab') : 'default',
          border: '2px solid',
          borderColor: 'divider',
          bgcolor: '#f1f5f9',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {imageUrl ? (
          <>
            <Box
              component="img"
              src={imageUrl}
              alt=""
              draggable={false}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: `${focalX}% ${focalY}%`,
                transform: `scale(${zoom})`,
                transformOrigin: `${focalX}% ${focalY}%`,
                pointerEvents: 'none',
              }}
            />
            {!dragging && (
              <Box
                sx={{
                  position: 'absolute', bottom: 6, right: 6, bgcolor: 'rgba(0,0,0,0.45)', color: 'white',
                  borderRadius: 1.5, px: 0.75, py: 0.25, display: 'flex', alignItems: 'center', gap: 0.5,
                  pointerEvents: 'none', opacity: 0.85,
                }}
              >
                <PanIcon sx={{ fontSize: 12 }} />
                <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1 }}>ลากเพื่อเลื่อน</Typography>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="caption" color="text.disabled">ยังไม่ได้เลือกรูป</Typography>
          </Box>
        )}
      </Box>
      {onZoomChange && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <ZoomInIcon fontSize="small" color="disabled" />
          <Slider
            size="small"
            value={zoom}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            disabled={!imageUrl}
            onChange={(_, v) => onZoomChange(v as number)}
            sx={{ flex: 1 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ width: 34, textAlign: 'right' }}>
            {zoom.toFixed(1)}x
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default FocalPointPicker;
