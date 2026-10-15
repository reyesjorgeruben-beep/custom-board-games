'use client';

import { useState, useSyncExternalStore } from 'react';

export const TABLE_ZOOM_MIN = 0.75;
export const TABLE_ZOOM_MAX = 1.5;
export const TABLE_ZOOM_STEP = 0.25;

/** Keeps a single selected table piece active and lets a second selection clear it. */
export function toggleTableSelection(currentId: string | null, nextId: string): string | null {
  return currentId === nextId ? null : nextId;
}

/** Bounds zoom and rounds values so repeated button presses do not accumulate floating point drift. */
export function clampTableZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(TABLE_ZOOM_MAX, Math.max(TABLE_ZOOM_MIN, Math.round(value * 100) / 100));
}

export function useTableSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return {
    selectedId,
    toggle(id: string) {
      setSelectedId((currentId) => toggleTableSelection(currentId, id));
    },
    clear() {
      setSelectedId(null);
    },
    isSelected(id: string) {
      return selectedId === id;
    },
  };
}

export function useTableZoom(initialZoom = 1) {
  const [zoom, setZoom] = useState(() => clampTableZoom(initialZoom));

  return {
    zoom,
    zoomIn() {
      setZoom((currentZoom) => clampTableZoom(currentZoom + TABLE_ZOOM_STEP));
    },
    zoomOut() {
      setZoom((currentZoom) => clampTableZoom(currentZoom - TABLE_ZOOM_STEP));
    },
    resetZoom() {
      setZoom(1);
    },
  };
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getMotionPreference() {
  return window.matchMedia(reducedMotionQuery).matches;
}

function getServerMotionPreference() {
  return true;
}

/** Lets game layouts use the same user motion preference as shared selection and zoom feedback. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeToMotionPreference, getMotionPreference, getServerMotionPreference);
}
