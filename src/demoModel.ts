const bambooKeywords = /\b(green|sticks|panda)\b/i
const capybaraKeywords = /\b(cute|animal|zoo)\b/i

export function getMockModelPath(prompt: string): string {
  if (bambooKeywords.test(prompt)) return '/bamboo.glb'
  if (capybaraKeywords.test(prompt)) return '/capybara.glb'
  return '/retro_tv.glb'
}
