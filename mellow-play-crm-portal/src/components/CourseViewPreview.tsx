import React from 'react';
import { Box, Typography } from '@mui/material';

interface CourseViewPreviewProps {
  imageUrl: string;
  ratioW: number;
  ratioH: number;
  focalX: number;
  focalY: number;
  zoom: number;
  label: string;
  /** True when this view has no saved framing and is borrowing the cover image. */
  isFallback: boolean;
  width?: number;
  onClick?: () => void;
}

// A read-only miniature of one display view, for showing on the course form what
// each size will actually look like without opening the media editor.
//
// The three CSS properties below have to match FocalPointPicker exactly
// (object-position for the focal point, scale + transform-origin for zoom), or
// the summary would promise a crop the editor does not produce.
const CourseViewPreview: React.FC<CourseViewPreviewProps> = ({
  imageUrl, ratioW, ratioH, focalX, focalY, zoom, label, isFallback, width = 96, onClick,
}) => (
  <Box sx={{ width, flexShrink: 0 }}>
    <Box
      onClick={onClick}
      sx={{
        width: '100%', aspectRatio: `${ratioW}/${ratioH}`, borderRadius: 1.5, overflow: 'hidden',
        position: 'relative', bgcolor: '#f1f5f9', border: '1px solid', cursor: onClick ? 'pointer' : 'default',
        borderColor: isFallback ? '#fbbf24' : '#e2e8f0',
        '&:hover': onClick ? { borderColor: 'primary.main' } : {},
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={label}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            objectPosition: `${focalX}% ${focalY}%`,
            transform: `scale(${zoom})`,
            transformOrigin: `${focalX}% ${focalY}%`,
            display: 'block',
          }}
        />
      ) : (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>ไม่มีรูป</Typography>
        </Box>
      )}
    </Box>
    <Typography sx={{ fontSize: 10, fontWeight: 700, mt: 0.4, textAlign: 'center', lineHeight: 1.3 }}>
      {label}
    </Typography>
    <Typography
      sx={{ fontSize: 9, textAlign: 'center', lineHeight: 1.3, color: isFallback ? 'warning.dark' : 'success.main', fontWeight: 700 }}
    >
      {isFallback ? 'ใช้รูปปก' : 'ตั้งค่าแล้ว'}
    </Typography>
  </Box>
);

export default CourseViewPreview;
