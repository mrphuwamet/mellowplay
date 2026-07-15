import React from 'react';
import { Dialog, DialogContent, DialogActions, Typography, Button, CircularProgress, Box } from '@mui/material';
import { HelpOutline as HelpIcon } from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';

type ConfirmColor = 'primary' | 'success' | 'error' | 'warning' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: ConfirmColor;
  icon?: React.ReactNode;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  confirmColor = 'primary',
  icon,
  loading = false,
  onConfirm,
  onClose,
}) => {
  const theme = useTheme();
  const mainColor = theme.palette[confirmColor].main;

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 4 } }}
    >
      <DialogContent sx={{ textAlign: 'center', pt: 4, pb: 1 }}>
        <Box
          sx={{
            width: 56, height: 56, borderRadius: '50%', mx: 'auto', mb: 2,
            bgcolor: alpha(mainColor, 0.12), color: mainColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {icon ?? <HelpIcon sx={{ fontSize: 30 }} />}
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
        {description && (
          <Typography variant="body2" color="text.secondary">{description}</Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, pt: 1, gap: 1 }}>
        <Button
          fullWidth
          variant="outlined"
          onClick={onClose}
          disabled={loading}
          sx={{ borderRadius: 2.5, fontWeight: 700 }}
        >
          {cancelLabel}
        </Button>
        <Button
          fullWidth
          variant="contained"
          color={confirmColor}
          onClick={onConfirm}
          disabled={loading}
          disableElevation
          sx={{ borderRadius: 2.5, fontWeight: 700 }}
        >
          {loading ? <CircularProgress size={20} color="inherit" /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
