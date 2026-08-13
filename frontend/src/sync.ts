export type Mode = 'wysiwyg' | 'raw'

export interface SwitchPlan {
  /** Whether this is an actual mode change (target differs from current). */
  changed: boolean
  /** Whether the target surface must be rehydrated from the canonical string. */
  hydrateTarget: boolean
}

/**
 * Pure decision for a mode switch. A no-op when the target is already active;
 * otherwise the target surface is rehydrated from the canonical string only
 * when it is stale — i.e. an edit happened on the source since the last sync
 * (`dirty`). Side effects (serialize / hydrate / DOM) are applied by the
 * caller; this function only decides.
 */
export function planSwitch(
  current: Mode,
  target: Mode,
  dirty: boolean,
): SwitchPlan {
  if (target === current) {
    return { changed: false, hydrateTarget: false }
  }
  return { changed: true, hydrateTarget: dirty }
}
