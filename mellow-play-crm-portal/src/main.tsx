import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import ErrorBoundary from './components/ErrorBoundary';
import './utils/axiosSetup';

const theme = createTheme({
  palette: {
    primary: {
      main: '#2e7ec4', // Mellow Blue
    },
    secondary: {
      main: '#ef4f55', // Mellow Red
    },
    background: {
      default: '#fdfdfd',
    },
  },
  typography: {
    fontFamily: '"Prompt", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h1: { fontWeight: 500 },
    h2: { fontWeight: 500 },
    h3: { fontWeight: 500 },
    h4: { fontWeight: 500 },
    h5: { fontWeight: 500 },
    h6: { fontWeight: 500 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500 },
    body1: { fontWeight: 300 },
    body2: { fontWeight: 300, fontSize: '0.875rem' }, // 14px
    button: { fontWeight: 500 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 500,
        },
        root: {
          fontWeight: 300,
        }
      }
    }
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
