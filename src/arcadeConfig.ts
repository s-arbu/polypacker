export type ArcadeConfig = {
  type: string
  collider: string
  mass: number
  damage_radius: number
  is_pickup: boolean
}

export function isArcadeConfig(value: unknown): value is ArcadeConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const config = value as Record<string, unknown>
  const expectedKeys = [
    'type',
    'collider',
    'mass',
    'damage_radius',
    'is_pickup',
  ]

  return (
    Object.keys(config).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(config, key)) &&
    typeof config.type === 'string' &&
    config.type.trim().length > 0 &&
    typeof config.collider === 'string' &&
    config.collider.trim().length > 0 &&
    typeof config.mass === 'number' &&
    Number.isFinite(config.mass) &&
    config.mass >= 0 &&
    typeof config.damage_radius === 'number' &&
    Number.isFinite(config.damage_radius) &&
    config.damage_radius >= 0 &&
    typeof config.is_pickup === 'boolean'
  )
}
