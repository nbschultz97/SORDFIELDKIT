import type { FC } from "react";

const LAYER_LABELS: Record<string, string> = {
  land: "Land",
  water: "Hydro",
  roads: "Routes",
  buildings: "Structures",
};

interface ControlsProps {
  onAddWaypoint: () => void;
  onExportWaypoints: () => void;
  onLayerVisibilityChange: (layer: string, visible: boolean) => void;
  layerVisibility: Record<string, boolean>;
  hasWaypoints: boolean;
  totalDistanceMeters: number;
}

export const Controls: FC<ControlsProps> = ({
  onAddWaypoint,
  onExportWaypoints,
  onLayerVisibilityChange,
  layerVisibility,
  hasWaypoints,
  totalDistanceMeters,
}) => {
  const distanceKm = totalDistanceMeters / 1000;
  return (
    <>
      <div className="fab-cluster">
        <button type="button" className="fab" onClick={onAddWaypoint}>
          + Waypoint
        </button>
        <button
          type="button"
          className="fab secondary"
          onClick={onExportWaypoints}
          disabled={!hasWaypoints}
        >
          Export
        </button>
      </div>
      <div className="layer-panel">
        <h2>Layers</h2>
        {Object.entries(LAYER_LABELS).map(([key, label]) => (
          <div className="layer-item" key={key}>
            <label htmlFor={`layer-${key}`}>
              <input
                id={`layer-${key}`}
                className="layer-toggle"
                type="checkbox"
                checked={layerVisibility[key] ?? true}
                onChange={(event) =>
                  onLayerVisibilityChange(key, event.target.checked)
                }
              />
              {label}
            </label>
          </div>
        ))}
        <div className="layer-item" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <small>
            Track: {distanceKm.toFixed(2)} km
          </small>
        </div>
      </div>
    </>
  );
};
