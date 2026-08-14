import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import ErrorBoundary from './components/ErrorBoundary';
import './utils/axiosSetup';

const BODY_FONT = '"Sarabun", "Roboto", "Helvetica", "Arial", sans-serif';
const DISPLAY_FONT = '"Kanit", "Sarabun", sans-serif';

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
    fontFamily: BODY_FONT,
    fontSize: 14,
    // Headings wear the display face; everything read in bulk — tables, form
    // fields, body copy — stays in Sarabun.
    h1: { fontWeight: 500, fontFamily: DISPLAY_FONT },
    h2: { fontWeight: 500, fontFamily: DISPLAY_FONT },
    h3: { fontWeight: 500, fontFamily: DISPLAY_FONT },
    h4: { fontWeight: 500, fontFamily: DISPLAY_FONT },
    h5: { fontWeight: 500, fontFamily: DISPLAY_FONT },
    h6: { fontWeight: 500, fontFamily: DISPLAY_FONT },
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
        {/* The theme only reaches MUI components. Plain markup — the tiptap
            editor's own content, tables built by hand, anything rendering
            outside a MUI wrapper — kept whatever the browser chose, so half
            the screen changed font and half did not. This covers the document
            itself, with the same split: Sarabun to read, Kanit for headings. */}
        <GlobalStyles
          styles={{
            'html, body, #root': { fontFamily: BODY_FONT },
            'h1, h2, h3, h4, h5, h6': { fontFamily: DISPLAY_FONT },
            // A form is answered, not admired — the editor content and any
            // input keep the reading face even where they contain headings.
            'input, textarea, select, button, table, .ProseMirror, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3':
              { fontFamily: BODY_FONT },
            // Thai has no spaces between words: the browser only breaks
            // between them once the document says lang="th" (set in
            // index.html), and this evens out the resulting rag.
            'p, li, label, h1, h2, h3, h4, h5, h6': {
              wordBreak: 'normal',
              overflowWrap: 'break-word',
              textWrap: 'pretty',
            },
          }}
        />
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
