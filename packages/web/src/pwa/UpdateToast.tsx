import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export interface UpdateToastProps {
  // Optional simulated state for testing
  forceShow?: boolean;
}

export const UpdateToast: React.FC<UpdateToastProps> = ({ forceShow = false }) => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        console.log('SW registered successfully:', r.scope);
      }
    },
    onRegisterError(error) {
      console.error('SW registration failed:', error);
    },
  });

  // Support test simulation via custom DOM event
  useEffect(() => {
    const handleSimulateUpdate = () => {
      setNeedRefresh(true);
    };
    window.addEventListener('pwa:test-update-available', handleSimulateUpdate);
    return () => {
      window.removeEventListener('pwa:test-update-available', handleSimulateUpdate);
    };
  }, [setNeedRefresh]);

  const showToast = forceShow || needRefresh;

  if (!showToast) {
    return null;
  }

  return (
    <div
      className="pwa-update-toast"
      id="pwa-update-toast"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="pwa-toast-body">
        <span className="pwa-toast-icon" aria-hidden="true">
          🔄
        </span>
        <div className="pwa-toast-text">
          <strong className="pwa-toast-title">Update Available</strong>
          <span className="pwa-toast-desc">
            New version available. Reload to update the studio.
          </span>
        </div>
      </div>
      <div className="pwa-toast-actions">
        <button
          type="button"
          id="pwa-reload-btn"
          className="btn-primary btn-sm"
          onClick={() => updateServiceWorker(true)}
        >
          Reload
        </button>
        <button
          type="button"
          id="pwa-dismiss-btn"
          className="btn-secondary btn-sm"
          aria-label="Dismiss update notification"
          onClick={() => setNeedRefresh(false)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
