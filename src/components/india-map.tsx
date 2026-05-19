"use client";

import { useEffect, useId } from "react";
import { Map, MapControls, useMap } from "@/components/ui/map";

// The shape of the India map component props
export interface IndiaMapProps {
  /** Array of state names to highlight, e.g. ["Andhra Pradesh", "Telangana"] */
  highlightedStates?: string[];
  /** Additional CSS classes for the map container */
  className?: string;
  /** Callback when a state is clicked */
  onStateClick?: (stateName: string) => void;
  /** Optional center coordinates for the map */
  center?: [number, number];
  /** Optional initial zoom level */
  zoom?: number;
}

function IndiaMapLayer({
  highlightedStates = [],
  onStateClick,
}: Omit<IndiaMapProps, "className" | "center" | "zoom">) {
  const { map, isLoaded } = useMap();
  const id = useId();
  // Using consistent IDs for the layer and source per component instance
  const sourceId = `india-states-source-${id}`;
  const fillLayerId = `india-states-fill-${id}`;
  const outlineLayerId = `india-states-outline-${id}`;

  useEffect(() => {
    if (!map || !isLoaded) return;

    // 1. Add source if it doesn't exist
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: "/data/india-states.geojson",
      });
    }

    // 2. Build the match expression for fill color based on highlighted states
    // The GeoJSON property for the state name is "NAME_1"
    let fillColorExpression: any = "#e2e8f0"; // Default color (slate-200)

    if (highlightedStates && highlightedStates.length > 0) {
      fillColorExpression = ["match", ["get", "NAME_1"]];
      highlightedStates.forEach((state) => {
        fillColorExpression.push(state, "#3b82f6"); // Highlight color (blue-500)
      });
      fillColorExpression.push("#e2e8f0"); // Default color fallback
    }

    // 3. Add or update fill layer
    if (!map.getLayer(fillLayerId)) {
      map.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": fillColorExpression,
          "fill-opacity": 0.7,
        },
      });
    } else {
      map.setPaintProperty(fillLayerId, "fill-color", fillColorExpression);
    }

    // 4. Add or update outline layer
    if (!map.getLayer(outlineLayerId)) {
      map.addLayer({
        id: outlineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#94a3b8", // slate-400
          "line-width": 1,
        },
      });
    }

    // 5. Setup Interaction events
    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    const handleClick = (e: any) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [fillLayerId],
      });
      if (features.length > 0) {
        const stateName = features[0].properties?.NAME_1;
        if (stateName && onStateClick) {
          onStateClick(stateName);
        }
      }
    };

    map.on("mouseenter", fillLayerId, handleMouseEnter);
    map.on("mouseleave", fillLayerId, handleMouseLeave);
    map.on("click", fillLayerId, handleClick);

    // Cleanup when component unmounts or updates
    return () => {
      map.off("mouseenter", fillLayerId, handleMouseEnter);
      map.off("mouseleave", fillLayerId, handleMouseLeave);
      map.off("click", fillLayerId, handleClick);

      try {
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch (e) {
        // Safely ignore cleanup errors if map is already destroyed
      }
    };
  }, [
    map,
    isLoaded,
    highlightedStates,
    sourceId,
    fillLayerId,
    outlineLayerId,
    onStateClick,
  ]);

  return null;
}

export function IndiaMap({
  highlightedStates = [],
  className,
  onStateClick,
  center = [78.9629, 20.5937], // Default center to India coordinates
  zoom = 3.5, // Default zoom suitable for viewing all of India
}: IndiaMapProps) {
  return (
    <div
      className={`h-[400px] w-full overflow-hidden rounded-md border ${
        className || ""
      }`}
    >
      <Map center={center} zoom={zoom}>
        <MapControls />
        <IndiaMapLayer
          highlightedStates={highlightedStates}
          onStateClick={onStateClick}
        />
      </Map>
    </div>
  );
}
