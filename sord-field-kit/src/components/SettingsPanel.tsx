import { useEffect, useState, type MutableRefObject } from "react";
import type { DetectionBox } from "../lib/ai/mediapipe";
import type { OfflineStatus } from "../hooks/useOffline";
import type { WebLLMProgress } from "../lib/ai/webllm";

interface ToggleProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
}

interface OfflineControls extends ToggleProps {
  status: OfflineStatus;
  progress: number;
  hasCache: boolean;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  activeUrl?: string | null;
}

interface MediaPipeControls extends ToggleProps {
  error?: string | null;
  detections: DetectionBox[];
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
}

interface WebLLMControls extends ToggleProps {
  loading: boolean;
  progress?: WebLLMProgress | null;
  response?: string;
  error?: string | null;
  onPrompt: (prompt: string) => void;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  offline: OfflineControls;
  mediapipe: MediaPipeControls;
  webllm: WebLLMControls;
}

function formatOfflineStatus(status: OfflineStatus, progress: number) {
  switch (status.phase) {
    case "downloading":
      return `Caching tiles… ${progress}% (${status.storedChunks}/${status.totalChunks || "?"})`;
    case "ready":
      return `Cache ready (${status.totalChunks || status.storedChunks} segments)`;
    case "paused":
      return `Paused at ${progress}%`;
    case "error":
      return status.error ? `Error: ${status.error}` : "Cache error";
    default:
      return "Idle";
  }
}

export function SettingsPanel({
  open,
  onClose,
  offline,
  mediapipe,
  webllm,
}: SettingsPanelProps) {
  const [prompt, setPrompt] = useState(
    "Summarize these notes into a SALUTE report"
  );

  useEffect(() => {
    if (!webllm.enabled) {
      setPrompt("Summarize these notes into a SALUTE report");
    }
  }, [webllm.enabled]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    webllm.onPrompt(prompt);
  };

  return (
    <aside className={`settings-panel ${open ? "open" : ""}`}>
      <div className="settings-header">
        <h2>Settings</h2>
        <button type="button" className="icon-button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="settings-content">
        <section className="settings-section">
          <h3>Offline Basemap</h3>
          <div className="toggle-row">
            <div>
              Offline tiles
              <small>
                Cache the active PMTiles archive for offline field ops.
              </small>
            </div>
            <span className="switch">
              <input
                type="checkbox"
                checked={offline.enabled}
                onChange={(event) => offline.onToggle(event.target.checked)}
              />
              <span className="slider" />
            </span>
          </div>
          <div className="progress-bar">
            <span style={{ width: `${offline.progress}%` }} />
          </div>
          <small>{formatOfflineStatus(offline.status, offline.progress)}</small>
          {offline.activeUrl && (
            <small>Source: {offline.activeUrl}</small>
          )}
          <div
            className="toggle-row"
            style={{ justifyContent: "flex-start", gap: "0.5rem" }}
          >
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                offline.status.phase === "downloading"
                  ? offline.onPause()
                  : offline.onResume()
              }
            >
              {offline.status.phase === "downloading" ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={offline.onClear}
              disabled={!offline.hasCache}
            >
              Clear tiles
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>MediaPipe Object Scan</h3>
          <div className="toggle-row">
            <div>
              On-device detection
              <small>Runs at ~15 fps; stay steady for best results.</small>
            </div>
            <span className="switch">
              <input
                type="checkbox"
                checked={mediapipe.enabled}
                onChange={(event) => mediapipe.onToggle(event.target.checked)}
              />
              <span className="slider" />
            </span>
          </div>
          {mediapipe.error && <div className="toast">{mediapipe.error}</div>}
          {mediapipe.enabled && (
            <>
              <div className="camera-preview">
                <video ref={mediapipe.videoRef} autoPlay muted playsInline />
                <div className="camera-overlay">
                  <canvas ref={mediapipe.canvasRef} />
                </div>
              </div>
              <small>
                Detections: {mediapipe.detections.length}
              </small>
            </>
          )}
        </section>

        <section className="settings-section">
          <h3>WebLLM Assist</h3>
          <div className="toggle-row">
            <div>
              SALUTE summarizer
              <small>
                Requires WebGPU. Generates short reports on-device when
                available.
              </small>
            </div>
            <span className="switch">
              <input
                type="checkbox"
                checked={webllm.enabled}
                onChange={(event) => webllm.onToggle(event.target.checked)}
              />
              <span className="slider" />
            </span>
          </div>
          {webllm.error && <div className="toast">{webllm.error}</div>}
          {webllm.enabled && (
            <form className="webllm-panel" onSubmit={handleSubmit}>
              {webllm.progress && (
                <small>{`${webllm.progress.percent}% - ${webllm.progress.text}`}</small>
              )}
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Paste patrol notes or bullet points here."
              />
              <button type="submit" disabled={webllm.loading}>
                {webllm.loading ? "Generating…" : "Summarize"}
              </button>
              {webllm.response && (
                <div className="webllm-response">{webllm.response}</div>
              )}
            </form>
          )}
        </section>
      </div>
    </aside>
  );
}
