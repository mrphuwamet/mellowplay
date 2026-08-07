import React from 'react';
import { Box, Typography } from '@mui/material';
import { SignalCellularAlt, Wifi, BatteryFull, ArrowBackIosNew, AccountCircle } from '@mui/icons-material';

// A phone-frame mockup of the actual incoming-SMS look (status bar +
// Messages-app header + a real speech bubble), not just a plain text box —
// staff kept saying a plain preview "didn't feel like" what the customer
// would actually receive, so this simulates the real thing instead.
export default function SmsPreviewBubble({
  message, senderLabel = 'Mellow Play',
}: { message: string; senderLabel?: string }) {
  return (
    <Box sx={{
      width: 300, mx: 'auto', borderRadius: '32px', p: '10px',
      bgcolor: '#1c1c1e', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    }}>
      <Box sx={{ borderRadius: '22px', overflow: 'hidden', bgcolor: '#f2f2f7' }}>
        {/* Status bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1, pb: 0.5, bgcolor: '#f2f2f7' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#000' }}>9:41</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', color: '#000' }}>
            <SignalCellularAlt sx={{ fontSize: 14 }} />
            <Wifi sx={{ fontSize: 14 }} />
            <BatteryFull sx={{ fontSize: 16 }} />
          </Box>
        </Box>
        {/* Messages-app header */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 1, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <ArrowBackIosNew sx={{ fontSize: 14, color: '#007aff', position: 'absolute', left: 20 }} />
          <AccountCircle sx={{ fontSize: 32, color: '#c7c7cc' }} />
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#000', mt: 0.25 }}>{senderLabel}</Typography>
        </Box>
        {/* Message thread */}
        <Box sx={{ minHeight: 160, p: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{
            alignSelf: 'flex-start', maxWidth: '85%', bgcolor: '#e5e5ea', color: '#000',
            borderRadius: '18px', px: 1.75, py: 1, fontSize: 15, lineHeight: 1.45,
            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          }}>
            {message.trim() ? message : <Box component="span" sx={{ color: '#8e8e93' }}>(ยังไม่ได้กรอกข้อความ)</Box>}
          </Box>
          <Typography sx={{ fontSize: 11, color: '#8e8e93', pl: 0.5, mt: 0.25 }}>ตอนนี้</Typography>
        </Box>
      </Box>
    </Box>
  );
}
