import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

// Last line of defense against exactly the class of bug that caused the
// blank-white-screen crash from an unsupported browser API (crypto.randomUUID
// missing in some LINE in-app webview contexts): without this, ANY uncaught
// render/effect error anywhere in the tree takes down the entire app with
// nothing shown at all. This can't fix the underlying incompatibility, but
// it turns "silent blank page, looks broken/hung" into a page the user can
// actually act on.
class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-[#fbfaf7]">
          <h1 className="text-lg font-black text-slate-800 mb-2">เกิดข้อผิดพลาดบางอย่าง</h1>
          <p className="text-sm font-bold text-slate-500 mb-6 leading-relaxed max-w-xs">
            แอปพลิเคชันขัดข้องไม่คาดคิด กรุณาลองโหลดหน้าใหม่อีกครั้ง
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-mellow-purple text-white rounded-2xl font-black text-sm uppercase tracking-wider active:scale-95 transition-transform"
          >
            โหลดหน้าใหม่
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
