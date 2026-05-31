import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { ErrorOutline as ErrorIcon } from '@mui/icons-material';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh',
          bgcolor: '#f8fafc',
          p: 3
        }}>
          <Paper sx={{ p: 5, textAlign: 'center', maxWidth: 500, borderRadius: 4 }}>
            <ErrorIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>เกิดข้อผิดพลาดบางอย่าง</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              ขออภัย ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง
            </Typography>
            <Box sx={{ bgcolor: '#fff0f0', p: 2, borderRadius: 2, mb: 4, textAlign: 'left' }}>
               <code style={{ fontSize: '12px', color: '#d32f2f' }}>
                 {this.state.error?.toString()}
               </code>
            </Box>
            <Button 
              variant="contained" 
              onClick={() => window.location.reload()}
              fullWidth
            >
              โหลดหน้าเว็บใหม่
            </Button>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
