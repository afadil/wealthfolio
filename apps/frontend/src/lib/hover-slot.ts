/**
 * A row control that stays out of the way until the row is hovered or focused.
 *
 * Apply to the control; the row it belongs to needs `group/row`.
 *
 * The hiding is itself gated on the device having hover, because Tailwind
 * already gates `group-hover` that way: on a touch screen the reveal can never
 * fire, so an unconditional `opacity-0` would hide the control permanently.
 * That matters between 768px and 1024px, where a tablet still gets the desktop
 * tables.
 */
export const HOVER_SLOT =
  "transition-opacity [@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100";

/**
 * A row's selection checkbox: a hover slot until anything in the list is
 * selected, then shown on every row so the selection can be read and extended
 * without hunting for it.
 *
 * The list needs `group/list` and a `data-selecting` attribute while it has a
 * selection.
 */
export const SELECTION_SLOT = `${HOVER_SLOT} group-data-[selecting]/list:opacity-100`;
