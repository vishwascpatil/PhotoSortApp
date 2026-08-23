import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })

    // Log to backend app-errors.log
    if (window.photoVault?.logError) {
      const details = `${error.stack || error.message}\nComponent Stack:${errorInfo.componentStack}`
      window.photoVault.logError('RENDERER_ERROR_BOUNDARY', details)
    }
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-primary, #0f172a)',
            color: 'var(--text-primary, #ffffff)',
            padding: '24px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          <div
            style={{
              maxWidth: '560px',
              width: '100%',
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              borderRadius: '24px',
              border: '1px solid var(--border, #334155)',
              padding: '36px',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px auto',
                color: '#ef4444'
              }}
            >
              <ShieldAlert size={36} />
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 8px 0' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary, #94a3b8)', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              PhotoSort caught an unexpected error and protected your library from crashing. Your files remain completely safe.
            </p>

            {this.state.error && (
              <div
                style={{
                  textAlign: 'left',
                  background: 'var(--bg-tertiary, #0f172a)',
                  border: '1px solid var(--border, #334155)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#f87171',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  marginBottom: '24px',
                  wordBreak: 'break-word'
                }}
              >
                {this.state.error.toString()}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleReset}
                className="btn btn-secondary"
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={15} /> Try Recovering
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="btn btn-primary"
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)'
                }}
              >
                <RefreshCw size={15} /> Reload App
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
