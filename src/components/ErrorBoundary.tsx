import React from "react";
import { remoteLog } from "@/services/remote-logger";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    remoteLog.error("React ErrorBoundary caught", {
      error: error.message,
      stack: error.stack?.slice(0, 500),
      componentStack: errorInfo.componentStack?.slice(0, 500),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", padding: "2rem",
          fontFamily: "system-ui, sans-serif", textAlign: "center",
          background: "#0f172a", color: "#e2e8f0",
        }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
            Bir hata oluştu
          </h1>
          <p style={{ color: "#94a3b8", marginBottom: "1.5rem", maxWidth: "400px" }}>
            Uygulama beklenmedik bir hata ile karşılaştı. Lütfen uygulamayı yeniden başlatın.
          </p>
          <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "1.5rem" }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => {
              // Reset error state first, then navigate to root
              this.setState({ hasError: false, error: null });
              window.location.href = "/";
            }}
            style={{
              padding: "0.75rem 1.5rem", background: "#3b82f6", color: "white",
              border: "none", borderRadius: "0.5rem", cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Yeniden Başlat
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
