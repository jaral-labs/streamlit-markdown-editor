import { describe, expect, it } from 'vitest'
import { planSwitch } from './sync'

describe('planSwitch', () => {
  it('is a no-op when the target is already active', () => {
    expect(planSwitch('wysiwyg', 'wysiwyg', false)).toEqual({
      changed: false,
      hydrateTarget: false,
    })
    expect(planSwitch('raw', 'raw', true)).toEqual({
      changed: false,
      hydrateTarget: false,
    })
  })

  it('changes mode without rehydrating when not dirty', () => {
    expect(planSwitch('wysiwyg', 'raw', false)).toEqual({
      changed: true,
      hydrateTarget: false,
    })
    expect(planSwitch('raw', 'wysiwyg', false)).toEqual({
      changed: true,
      hydrateTarget: false,
    })
  })

  it('rehydrates the target when dirty', () => {
    expect(planSwitch('wysiwyg', 'raw', true)).toEqual({
      changed: true,
      hydrateTarget: true,
    })
    expect(planSwitch('raw', 'wysiwyg', true)).toEqual({
      changed: true,
      hydrateTarget: true,
    })
  })
})
