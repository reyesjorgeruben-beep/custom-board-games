'use client';

import React from 'react';
import type { ReactNode } from 'react';
import { TABLE_ZOOM_MAX, TABLE_ZOOM_MIN, useReducedMotion, useTableZoom } from './table-interactions.ts';

export interface TableViewportProps {
  children: ReactNode;
  label?: string;
  initialZoom?: number;
}

/** Adds keyboard operable zoom controls around a game composed table surface. */
export function TableViewport({ children, label = 'Table view', initialZoom = 1 }: TableViewportProps) {
  const { zoom, zoomIn, zoomOut, resetZoom } = useTableZoom(initialZoom);
  const reducedMotion = useReducedMotion();

  return (
    <section className="table-viewport" aria-label={label} data-motion={reducedMotion ? 'reduced' : 'full'}>
      <div className="table-viewport__toolbar" role="group" aria-label="Table zoom controls">
        <button className="table-zoom-button" type="button" onClick={zoomOut} disabled={zoom <= TABLE_ZOOM_MIN} aria-label="Zoom out">
          <span aria-hidden="true">−</span>
        </button>
        <output className="table-zoom-level" aria-label="Zoom level" aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button className="table-zoom-button" type="button" onClick={zoomIn} disabled={zoom >= TABLE_ZOOM_MAX} aria-label="Zoom in">
          <span aria-hidden="true">+</span>
        </button>
        <button className="table-zoom-reset" type="button" onClick={resetZoom}>Reset</button>
      </div>
      <div className="table-viewport__scroller">
        <div className="table-viewport__scaled" style={{ transform: `scale(${zoom})` }}>
          {children}
        </div>
      </div>
    </section>
  );
}
