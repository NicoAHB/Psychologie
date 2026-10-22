import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence: an unexpected rendering error must never leave a blank page. Everything is stored
 * encrypted before it is shown, so reloading is safe; the text is bilingual because the dictionary may be what failed.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Praxisraum rendering error', error.message, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="crash-page" role="alert">
      <h1>Etwas ist schiefgelaufen.<br/><span lang="uk">Щось пішло не так.</span></h1>
      <p>Ihre Daten sind verschlüsselt gespeichert und nicht verloren. Bitte laden Sie die App neu und entsperren Sie sie erneut.</p>
      <p lang="uk">Ваші дані збережено в зашифрованому вигляді й не втрачено. Перезавантажте застосунок і розблокуйте його знову.</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>Neu laden · Перезавантажити</button>
    </main>;
  }
}
