import React from 'react';
import { Backdrop, Box, Typography } from '@mui/material';
import logo from '../assets/logo.svg';

interface LoadingOverlayProps {
  active: boolean;
  message?: string;
}

// Full-screen blocking overlay for in-progress ACTIONS (uploads, saves) —
// distinct from page-level data loads, which use skeleton placeholders.
// Blurs the background and swallows clicks underneath until `active` clears.
const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ active, message }) => (
  <Backdrop
    open={active}
    sx={{
      zIndex: (theme) => theme.zIndex.modal + 10,
      backgroundColor: 'rgba(255,255,255,0.7)',
      backdropFilter: 'blur(4px)',
      flexDirection: 'column',
      gap: 2,
    }}
  >
    <style>{`
      @keyframes mellow-dot-wave {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
        30% { transform: translateY(-9px); opacity: 1; }
      }
    `}</style>
    <Box component="img" src={logo} alt="Mellow Play" sx={{ height: 48, opacity: 0.9 }} />
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {[0, 1, 2].map(i => (
        <Box
          key={i}
          sx={{
            width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main',
            animation: `mellow-dot-wave 1s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </Box>
    {message && <Typography variant="caption" fontWeight={700} color="text.secondary">{message}</Typography>}
  </Backdrop>
);

export default LoadingOverlay;
