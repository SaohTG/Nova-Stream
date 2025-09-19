// web/src/components/ErrorBoundary.jsx
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("UI ErrorBoundary", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="m-6 rounded-xl bg-rose-900/30 p-6 text-rose-200">
          <h2 className="mb-2 text-xl font-semibold">Oups, une erreur est survenue</h2>
          <p className="text-sm opacity-80">
            {String(this.state.error?.message || "Erreur inconnue")}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
