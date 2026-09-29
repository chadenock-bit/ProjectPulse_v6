import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Project Pulse crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", background: "#1B1030", color: "#fff", fontFamily: "monospace",
          padding: 30, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: "#FF8A80" }}>
            ⚠ Something crashed while rendering. Copy this and send it back:
          </div>
          <div style={{ background: "#2A1B45", padding: 16, borderRadius: 8 }}>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
