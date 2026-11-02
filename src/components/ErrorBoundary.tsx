import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate } from '../lib/i18n';

/**
 * Last line of defence. Ordinary page failures are caught below useVault.
 * Never promise that optimistic or debounced edits have already reached disk.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { console.error('Praxisraum rendering error'); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="crash-page" role="alert">
      <h1>{translate('de', 'crashTitle')}<br/><span lang="uk">{translate('uk', 'crashTitle')}</span></h1>
      <p>{translate('de', 'crashText')}</p>
      <p lang="uk">{translate('uk', 'crashText')}</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>{translate('de', 'crashReload')} · {translate('uk', 'crashReload')}</button>
    </main>;
  }
}
