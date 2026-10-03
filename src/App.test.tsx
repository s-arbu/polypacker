import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import App from './App'

vi.mock('file-saver', () => ({ saveAs: vi.fn() }))

describe('Arcade-Ready Asset Booster', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(saveAs).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('rejects an empty prompt and generates a mock bundle for a non-empty prompt', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /generate asset bundle/i }))
    expect(screen.getByText(/enter an asset prompt/i)).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: /asset prompt/i }), {
      target: { value: 'Explosive Cyberpunk Barrel' },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate asset bundle/i }))

    expect(screen.getByText(/generating 3d mesh & engine metadata/i)).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(screen.getByText('prop_explosive')).toBeTruthy()
    expect(screen.getByText(/mock asset/i)).toBeTruthy()
  })

  it('downloads an archive containing the mock asset, Arcade config, and placeholder warning', async () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: /asset prompt/i }), {
      target: { value: 'A moss-covered moon rover' },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate asset bundle/i }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: /download arcade bundle/i }))
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1))

    const savedFile = vi.mocked(saveAs).mock.calls[0]?.[0]
    expect(savedFile).toBeInstanceOf(Blob)
    expect(vi.mocked(saveAs).mock.calls[0]?.[1]).toBe('asset-bundle.zip')
    if (!(savedFile instanceof Blob)) throw new Error('Expected a ZIP Blob to be saved')

    const archive = await JSZip.loadAsync(savedFile)
    expect(Object.keys(archive.files).sort()).toEqual([
      'README.txt',
      'arcade-config.json',
      'barrel.glb',
    ])

    const config = JSON.parse(
      await archive.file('arcade-config.json')!.async('string'),
    )
    expect(config).toEqual({
      type: 'prop_explosive',
      collider: 'cylinder',
      mass: 50,
      damage_radius: 5,
      is_pickup: false,
    })
    expect(await archive.file('barrel.glb')!.async('string')).toContain(
      'not a valid GLB',
    )
    expect(await archive.file('README.txt')!.async('string')).toContain(
      'not importable',
    )
  })
})
