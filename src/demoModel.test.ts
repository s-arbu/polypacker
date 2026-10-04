import { describe, expect, it } from 'vitest'
import { getMockModelPath } from './demoModel'

describe('prompt-matched demo model selection', () => {
  it('matches bamboo keywords case-insensitively and gives them priority', () => {
    expect(getMockModelPath('A cute GREEN panda at the zoo')).toBe(
      '/bamboo.glb',
    )
    expect(getMockModelPath('wooden STICKS')).toBe('/bamboo.glb')
  })

  it('matches capybara keywords when no bamboo keyword is present', () => {
    expect(getMockModelPath('A CUTE animal in a zoo')).toBe('/capybara.glb')
    expect(getMockModelPath('tiny zoo keeper')).toBe('/capybara.glb')
  })

  it('uses the retro TV for unmatched prompts and keyword substrings', () => {
    expect(getMockModelPath('A futuristic vehicle')).toBe('/retro_tv.glb')
    expect(getMockModelPath('greenery and pandas nearby')).toBe(
      '/retro_tv.glb',
    )
  })
})
