import React from 'react';
import { AlertTriangle, RefreshCw, Download } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("App crashed:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleEmergencyBackup = () => {
    try {
      const raw = localStorage.getItem('universalTimetable');
      const scenarios = localStorage.getItem('utScenarios') || '{}';
      const payload = {
        app: "ClassGrid",
        version: 4,
        exportedAt: new Date().toISOString(),
        emergencyBackup: true,
        data: raw ? JSON.parse(raw) : null,
        scenarios: JSON.parse(scenarios)
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const fileName = `classgrid-emergency-backup-${stamp}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      alert("Could not create backup: " + (e as Error).message);
    }
  };

  handleCopyError = () => {
    const err = this.state.error;
    const info = this.state.errorInfo;
    const text = [
      "ClassGrid Error Report",
      "=====================",
      "Time: " + new Date().toISOString(),
      "Message: " + (err?.message || "unknown"),
      "Stack: " + (err?.stack || "n/a"),
      "Component Stack: " + (info?.componentStack || "n/a")
    ].join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => alert("Error details copied to clipboard."),
        () => alert("Could not copy. Please screenshot instead.")
      );
    } else {
      alert("Clipboard not available. Please screenshot this screen.");
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const err = this.state.error;
    const stack = err?.stack ? String(err.stack).split("\n").slice(0, 6).join("\n") : "No stack trace.";

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-stone-100 dark:bg-stone-950">
        <div className="w-full max-w-md bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl border border-stone-200 dark:border-stone-800">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-rose-100 dark:bg-rose-950/60 rounded-2xl">
              <AlertTriangle className="w-8 h-8 text-rose-600" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-center text-stone-900 dark:text-stone-100 mb-2">
            Something went wrong
          </h2>

          <p className="text-xs text-stone-600 dark:text-stone-400 text-center leading-relaxed mb-4">
            ClassGrid hit an unexpected error. Your saved data is still on this device —
            download an emergency backup before reloading if you want to be extra safe.
          </p>

          <div className="mb-4 p-3 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-800">
            <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Error Message
            </div>
            <div className="text-xs font-mono text-rose-700 dark:text-rose-300 break-all mb-2">
              {err?.message || "Unknown error"}
            </div>
            <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
              Stack (first lines)
            </div>
            <pre className="text-[10px] font-mono text-stone-600 dark:text-stone-400 whitespace-pre-wrap break-all max-h-32 overflow-auto">
              {stack}
            </pre>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={this.handleEmergencyBackup}
              className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download Emergency Backup</span>
            </button>

            <button
              type="button"
              onClick={this.handleReload}
              className="w-full min-h-[44px] px-4 py-2.5 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-xs rounded-xl border border-stone-300 dark:border-stone-700 transition flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload App</span>
            </button>

            <button
              type="button"
              onClick={this.handleCopyError}
              className="w-full min-h-[40px] px-4 py-2 bg-transparent hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400 font-semibold text-[11px] rounded-xl transition"
            >
              Copy error details
            </button>
          </div>
        </div>
      </div>
    );
  }
}