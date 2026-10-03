import JSZip from 'jszip'

export const arcadeConfig = {
  type: 'prop_explosive',
  collider: 'cylinder',
  mass: 50,
  damage_radius: 5,
  is_pickup: false,
} as const

const mockModel = `PolyPacker demo placeholder.
This is not a valid GLB file. Replace it with a generated 3D model before importing.`

const bundleReadme = `PolyPacker mock asset bundle

barrel.glb is a text placeholder, not a valid GLB file, and is not importable in a game engine.
arcade-config.json contains mocked Arcade metadata for the demo.`

export async function createArcadeBundle(): Promise<Blob> {
  const archive = new JSZip()

  archive.file('barrel.glb', mockModel)
  archive.file('arcade-config.json', JSON.stringify(arcadeConfig, null, 2))
  archive.file('README.txt', bundleReadme)

  return archive.generateAsync({ type: 'blob' })
}
