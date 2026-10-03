import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import App from './App'

vi.mock('file-saver', () => ({ saveAs: vi.fn() }))

describe('Arcade-Ready Asset Booster', () => {
  const generatedConfig = {
    type: 'prop_explosive',
    collider: 'cylinder',
    mass: 50,
    damage_radius: 5,
    is_pickup: false,
  }
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    vi.mocked(saveAs).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('rejects an empty prompt and shows the generated Arcade config', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => generatedConfig,
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /generate asset bundle/i }))
    expect(screen.getByText(/enter an asset prompt/i)).toBeTruthy()

    const prompt = 'Explosive Cyberpunk Barrel'
    fireEvent.change(screen.getByRole('textbox', { name: /asset prompt/i }), {
      target: { value: prompt },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate asset bundle/i }))

    expect(screen.getByText(/generating arcade config/i)).toBeTruthy()
    expect(await screen.findByText('prop_explosive')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/generate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      }),
    )

    expect(screen.getByText(/mock asset/i)).toBeTruthy()
  })

  it('keeps the prompt and does not offer a ZIP when config generation fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Gemini configuration generation failed.' }),
    })
    render(<App />)
    const prompt = 'A moss-covered moon rover'
    fireEvent.change(screen.getByRole('textbox', { name: /asset prompt/i }), {
      target: { value: prompt },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate asset bundle/i }))

    expect(
      await screen.findByText('Gemini configuration generation failed.'),
    ).toBeTruthy()
    expect(
      (screen.getByRole('textbox', { name: /asset prompt/i }) as HTMLTextAreaElement)
        .value,
    ).toBe(prompt)
    expect(screen.queryByRole('button', { name: /download arcade bundle/i })).toBeNull()
    expect(screen.getByRole('button', { name: /generate asset bundle/i })).toBeTruthy()
    expect(saveAs).not.toHaveBeenCalled()
  })

  it('downloads an archive containing the mock asset, generated Arcade config, and placeholder warning', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => generatedConfig,
    })
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: /asset prompt/i }), {
      target: { value: 'A moss-covered moon rover' },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate asset bundle/i }))

    await screen.findByText('prop_explosive')
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
    expect(config).toEqual(generatedConfig)
    expect(await archive.file('barrel.glb')!.async('string')).toContain(
      'not a valid GLB',
    )
    expect(await archive.file('README.txt')!.async('string')).toContain(
      'not importable',
    )
  })
})
