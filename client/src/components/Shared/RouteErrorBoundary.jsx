import { Component } from 'react';
import { useAppStrings } from '../../locales/appStrings';

class RouteErrorBoundaryInner extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[RouteErrorBoundary]', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { t } = this.props;
    const devDetail =
      import.meta.env.DEV && this.state.error
        ? String(this.state.error?.message || this.state.error)
        : '';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <h1 className="text-lg font-semibold">{t('errors.generic')}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t('errors.boundaryHint')}</p>
        {devDetail ? (
          <pre className="max-w-lg overflow-auto rounded-lg border border-border bg-muted/50 p-3 text-left text-xs text-red-600 dark:text-red-400">
            {devDetail}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          {t('common.reload')}
        </button>
      </div>
    );
  }
}

export default function RouteErrorBoundary({ children }) {
  const { t } = useAppStrings();
  return <RouteErrorBoundaryInner t={t}>{children}</RouteErrorBoundaryInner>;
}
