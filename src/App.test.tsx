import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const bambooBytes = new Uint8Array([0x62, 0x61, 0x6d, 0x62, 0x6f, 0x6f])
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    vi.mocked(saveAs).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function mockConfigResponse() {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => generatedConfig,
    })
  }

  function mockAssetResponse(path = '/bamboo.glb') {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob([bambooBytes], { type: 'model/gltf-binary' }),
    })
    return path
  }

  function enterPrompt(prompt: string) {
    fireEvent.change(screen.getByRole('textbox', { name: /asset prompt/i }), {
      target: { value: prompt },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate asset bundle/i }))
  }

  it('selects local models by case-insensitive whole-word keywords, with bamboo priority', async () => {
    vi.useFakeTimers()
    mockConfigResponse()
    mockAssetResponse()
    render(<App />)
    enterPrompt('A cute GREEN panda')

    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'A cute GREEN panda' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/bamboo.glb')

    expect(screen.getByText('prop_explosive')).toBeTruthy()
    expect(screen.getByText('bamboo.glb')).toBeTruthy()
  })

  it('keeps the loading state visible for the full simulated three seconds', async () => {
    vi.useFakeTimers()
    mockConfigResponse()
    let finishAssetFetch!: (response: unknown) => void
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishAssetFetch = resolve
      }),
    )
    render(<App />)
    enterPrompt('A green lantern')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/step 2: preparing a matching demo model/i)).toBeTruthy()

    finishAssetFetch({
      ok: true,
      blob: async () => new Blob([bambooBytes]),
    })
    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(2_999)
    })
    expect(screen.getByText(/step 2: preparing a matching demo model/i)).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByText('prop_explosive')).toBeTruthy()
  })

  it('keeps the prompt and does not offer a ZIP when Gemini config generation fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Gemini configuration generation failed.' }),
    })
    render(<App />)
    const prompt = 'A moss-covered moon rover'
    enterPrompt(prompt)

    expect(
      await screen.findByText('Gemini configuration generation failed.'),
    ).toBeTruthy()
    expect(
      (screen.getByRole('textbox', { name: /asset prompt/i }) as HTMLTextAreaElement)
        .value,
    ).toBe(prompt)
    expect(screen.queryByRole('button', { name: /download arcade bundle/i })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(saveAs).not.toHaveBeenCalled()
  })

  it('packages the fetched local model and real Gemini config under selected names', async () => {
    mockConfigResponse()
    const selectedPath = mockAssetResponse('/capybara.glb')
    render(<App />)
    enterPrompt('A cute animal at the zoo')

    expect(
      await screen.findByText('prop_explosive', {}, { timeout: 4_000 }),
    ).toBeTruthy()
      expect(fetchMock).toHaveBeenNthCalledWith(2, selectedPath)

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
      'capybara.glb',
    ])
    expect(
      Array.from(await archive.file('capybara.glb')!.async('uint8array')),
    ).toEqual(Array.from(bambooBytes))
    expect(
      JSON.parse(await archive.file('arcade-config.json')!.async('string')),
    ).toEqual(generatedConfig)
    expect(await archive.file('README.txt')!.async('string')).toContain(
      'demo model',
    )
    expect(await archive.file('README.txt')!.async('string')).toContain(
      selectedPath,
    )
  })

  it('shows an error and blocks ZIP when the selected local GLB cannot be fetched', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockConfigResponse()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      blob: async () => new Blob(),
    })
    render(<App />)
    enterPrompt('green sticks')

    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText(/could not fetch the selected demo model/i)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: /download arcade bundle/i })).toBeNull()
    expect(saveAs).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
