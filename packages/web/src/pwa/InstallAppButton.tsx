import React, { useState, useEffect, useRef } from 'react';
import { usePwaInstall } from './usePwaInstall.js';

export interface InstallAppButtonProps {
  forceShow?: boolean;
  forceIos?: boolean;
}

export const InstallAppButton: React.FC<InstallAppButtonProps> = ({
  forceShow = false,
  forceIos = false,
}) => {
  const { isIos: detectedIos, canInstall: hookCanInstall, promptInstall, deferredPrompt } = usePwaInstall();
  const [isIosTooltipOpen, setIsIosTooltipOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const isIos = forceIos || detectedIos;
  const canInstall = forceShow || hookCanInstall;

  // Dismiss iOS tooltip on outside click or ESC key
  useEffect(() => {
    if (!isIosTooltipOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsIosTooltipOpen(false);
        buttonRef.current?.focus();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsIosTooltipOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isIosTooltipOpen]);

  if (!canInstall) {
    return null;
  }

  const handleClick = async () => {
    if (isIos) {
      setIsIosTooltipOpen((open) => !open);
    } else if (deferredPrompt) {
      await promptInstall();
    }
  };

  return (
    <div className="install-app-container" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        id="pwa-install-btn"
        className="btn-install-app"
        onClick={handleClick}
        aria-label="Install App"
        aria-haspopup={isIos ? 'dialog' : undefined}
        aria-expanded={isIos ? isIosTooltipOpen : undefined}
        aria-controls={isIos && isIosTooltipOpen ? 'ios-install-tooltip' : undefined}
      >
        <span className="install-icon" aria-hidden="true">
          📲
        </span>
        <span className="install-label">Install App</span>
      </button>

      {isIosTooltipOpen && (
        <div
          id="ios-install-tooltip"
          className="ios-install-tooltip"
          role="dialog"
          aria-label="Install Stereogramer on iOS"
          aria-modal="false"
        >
          <div className="ios-tooltip-header">
            <strong className="ios-tooltip-title">Install on iOS</strong>
            <button
              type="button"
              className="btn-close-tooltip"
              aria-label="Close"
              onClick={() => {
                setIsIosTooltipOpen(false);
                buttonRef.current?.focus();
              }}
            >
              ✕
            </button>
          </div>
          <div className="ios-tooltip-content">
            <p className="ios-instruction-text">
              Tap the Share button (<span className="ios-symbol">⎋</span>) in Safari, then select{' '}
              <strong>&lsquo;Add to Home Screen&rsquo;</strong> (<span className="ios-symbol">⊕</span>).
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
