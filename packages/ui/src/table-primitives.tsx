'use client';

import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { BoardModel, CardModel, TablePosition, TokenModel } from './table-model.ts';

export interface BoardProps {
  model: BoardModel;
  children: ReactNode;
  className?: string;
}

/** A board surface whose geometry is driven by the renderer-neutral board model. */
export function Board({ model, children, className }: BoardProps) {
  const style = {
    '--board-columns': model.columns,
    '--board-rows': model.rows,
  } as CSSProperties;

  return (
    <section className={['table-board', className].filter(Boolean).join(' ')} aria-label={`${model.label} board`}>
      <div className="table-board__frame">
        <div className="table-board__surface" style={style} data-board-id={model.id} data-columns={model.columns} data-rows={model.rows}>
          <div className="table-board__grid-lines" aria-hidden="true">
            {Array.from({ length: Math.max(0, model.columns - 1) }, (_, index) => (
              <span className="table-board__column-line" key={`column-${index}`} style={{ left: `${((index + 1) / model.columns) * 100}%` }} />
            ))}
            {Array.from({ length: Math.max(0, model.rows - 1) }, (_, index) => (
              <span className="table-board__row-line" key={`row-${index}`} style={{ top: `${((index + 1) / model.rows) * 100}%` }} />
            ))}
          </div>
          <div className="table-board__pieces">{children}</div>
        </div>
      </div>
    </section>
  );
}

export interface BoardPieceProps {
  board: Pick<BoardModel, 'columns' | 'rows'>;
  position: TablePosition;
  children: ReactNode;
}

/** Places an arbitrary game visual at the center of its fractional row and column coordinate. */
export function BoardPiece({ board, position, children }: BoardPieceProps) {
  const left = board.columns > 0 ? `${((position.x + 0.5) / board.columns) * 100}%` : '50%';
  const top = board.rows > 0 ? `${((position.y + 0.5) / board.rows) * 100}%` : '50%';
  const style: CSSProperties = { left, top, zIndex: position.layer ?? 1 };

  return (
    <div className="table-board__piece" style={style} data-board-id={position.boardId}>
      {children}
    </div>
  );
}

export interface CardProps {
  card: CardModel;
  onSelect?: (id: string) => void;
  className?: string;
}

/** Presents a face-up or face-down card and exposes selection as an accessible button when enabled. */
export function Card({ card, onSelect, className }: CardProps) {
  const selected = Boolean(card.selected);
  const label = card.face === 'back' ? 'Face-down card' : card.title ?? 'Playing card';
  const classes = ['table-card', card.face === 'back' ? 'table-card--back' : 'table-card--front', selected && 'is-selected', className]
    .filter(Boolean)
    .join(' ');
  const content = card.face === 'back' ? (
    <span className="table-card__back-mark" aria-hidden="true">✳</span>
  ) : (
    <>
      <span className="table-card__art" aria-hidden="true">
        {card.art ? <img src={card.art} alt="" /> : <span className="table-card__suit">◇</span>}
      </span>
      <span className="table-card__title">{card.title ?? 'Playing card'}</span>
    </>
  );

  if (onSelect) {
    return (
      <button className={classes} type="button" aria-label={label} aria-pressed={selected} data-selected={selected} onClick={() => onSelect(card.id)}>
        {content}
      </button>
    );
  }

  return <article className={classes} aria-label={label} data-selected={selected}>{content}</article>;
}

export interface TokenProps {
  token: TokenModel;
  onSelect?: (id: string) => void;
  className?: string;
}

/** Presents a colored game token, with the same selection behavior used by cards. */
export function Token({ token, onSelect, className }: TokenProps) {
  const selected = Boolean(token.selected);
  const label = token.label ?? 'Game token';
  const classes = ['table-token', selected && 'is-selected', className].filter(Boolean).join(' ');
  const style = { '--token-color': token.color ?? '#af8242' } as CSSProperties;

  if (onSelect) {
    return (
      <button className={classes} style={style} type="button" aria-label={label} aria-pressed={selected} data-selected={selected} onClick={() => onSelect(token.id)}>
        <span className="table-token__mark" aria-hidden="true" />
        {token.label && <span className="table-token__label">{token.label}</span>}
      </button>
    );
  }

  return (
    <span className={classes} style={style} role="img" aria-label={label} data-selected={selected}>
      <span className="table-token__mark" aria-hidden="true" />
      {token.label && <span className="table-token__label">{token.label}</span>}
    </span>
  );
}

export interface ActionPanelProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Shared action surface; game layouts supply decision-specific controls in its content slot. */
export function ActionPanel({ id, title, description, children, className }: ActionPanelProps) {
  return (
    <section className={['table-action-panel', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-title`}>
      <div className="table-action-panel__heading">
        <h2 id={`${id}-title`}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="table-action-panel__controls">{children}</div>
    </section>
  );
}

export interface ActionButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'quiet';
  onClick?: () => void;
  disabled?: boolean;
}

/** Button primitive for layout supplied decision actions; it does not resolve or apply rules. */
export function ActionButton({ children, variant = 'primary', onClick, disabled }: ActionButtonProps) {
  return (
    <button className={`table-action-button table-action-button--${variant}`} type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
