import React from 'react';

export interface AiOfflineAdvisoryProps {
  onSwitchToPresets: () => void;
  onSwitchToShapes: () => void;
}

export const AiOfflineAdvisory: React.FC<AiOfflineAdvisoryProps> = ({
  onSwitchToPresets,
  onSwitchToShapes,
}) => {
  return (
    <div
      className="ai-offline-advisory"
      id="ai-photo-offline-advisory"
      role="alert"
      aria-live="polite"
    >
      <div className="ai-offline-header">
        <span className="ai-offline-icon" aria-hidden="true">
          📡
        </span>
        <strong className="ai-offline-title">Offline Mode: AI Model Not Cached</strong>
      </div>
      <p className="ai-offline-desc">
        Monocular depth AI requires a one-time neural network model download while online.
        Procedural depth maps, shapes, and textures are 100% functional offline without an internet connection.
      </p>
      <div className="ai-offline-actions">
        <button
          type="button"
          id="btn-offline-switch-presets"
          className="btn-secondary btn-sm"
          onClick={onSwitchToPresets}
        >
          Use Procedural Presets
        </button>
        <button
          type="button"
          id="btn-offline-switch-shapes"
          className="btn-secondary btn-sm"
          onClick={onSwitchToShapes}
        >
          Use Procedural Shapes
        </button>
      </div>
    </div>
  );
};
