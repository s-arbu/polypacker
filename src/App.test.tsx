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
  const modelBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46])
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

  function mockConfigResponse() {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => generatedConfig,
    })
  }

  function mockHyper3dResponse(filename = 'model.glb') {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ taskToken: 'opaque-task-token' }),
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name === 'X-Model-Filename' ? filename : null,
      },
      blob: async () => new Blob([modelBytes], { type: 'model/gltf-binary' }),
    })
  }

  function enterPrompt(prompt: string) {
    fireEvent.change(screen.getByRole('textbox', { name: /asset prompt/i }), {
      target: { value: prompt },
    })
    fireEvent.click(screen.getByRole('button', { name: /generate asset bundle/i }))
  }

  it('requests a Hyper3D model after Gemini returns a valid config', async () => {
    mockConfigResponse()
    mockHyper3dResponse()
    render(<App />)
    enterPrompt('A copper airship')

    expect(await screen.findByText('prop_explosive')).toBeTruthy()
    expect(
      screen.getByRole('status', { name: 'Model source' }).textContent,
    ).toContain('Hyper3D generated model included: model.glb.')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'A copper airship' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/hyper3d',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'A copper airship' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/hyper3d-status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ taskToken: 'opaque-task-token' }),
      }),
    )
    expect(screen.getByText('HYPER3D MODEL')).toBeTruthy()
    expect(screen.getByText('model.glb')).toBeTruthy()
  })

  it('shows the Hyper3D polling stage until the server returns the model', async () => {
    mockConfigResponse()
    let finishHyper3dRequest!: (response: unknown) => void
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ taskToken: 'opaque-task-token' }),
    })
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishHyper3dRequest = resolve
      }),
    )
    render(<App />)
    enterPrompt('A silver airship')

    expect(
      await screen.findByText(/step 2: hyper3d generating your model/i),
    ).toBeTruthy()
    finishHyper3dRequest({
      ok: true,
      headers: { get: () => 'airship.glb' },
      blob: async () => new Blob([modelBytes]),
    })
    expect(await screen.findByText('airship.glb')).toBeTruthy()
  })

  it('falls back to the prompt-matched local model and keeps ZIP download working', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockConfigResponse()
    fetchMock
      .mockRejectedValueOnce(new Error('signal timed out'))
      .mockResolvedValueOnce({
        ok: true,
        blob: async () =>
          new Blob([modelBytes], { type: 'model/gltf-binary' }),
      })
    render(<App />)
    enterPrompt('A cute zoo animal')

    expect(
      await screen.findByText(/using local demo model fallback/i),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/capybara.glb')
    expect(await screen.findByText('capybara.glb', {}, { timeout: 4_000 })).toBeTruthy()
    expect(screen.getByText('DEMO MODEL')).toBeTruthy()
    expect(
      screen.getByRole('status', { name: 'Model source' }).textContent,
    ).toContain(
      'Demo fallback included: capybara.glb. This is a pre-made local model; Hyper3D did not generate a model for this run. Reason: signal timed out.',
    )
    expect(warning).toHaveBeenCalledWith(
      'Hyper3D failed; using a local demo model.',
      expect.any(Error),
    )

    fireEvent.click(screen.getByRole('button', { name: /download arcade bundle/i }))
    expect(
      await screen.findByRole('button', { name: /packaging bundle/i }),
    ).toBeTruthy()
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1))
    const savedFile = vi.mocked(saveAs).mock.calls[0]?.[0]
    if (!(savedFile instanceof Blob)) throw new Error('Expected a ZIP Blob')
    const archive = await JSZip.loadAsync(savedFile)
    expect(Object.keys(archive.files).sort()).toEqual([
      'README.txt',
      'arcade-config.json',
      'capybara.glb',
    ])
    expect(await archive.file('README.txt')!.async('string')).toContain(
      'pre-made demo model',
    )
    expect(await archive.file('README.txt')!.async('string')).toContain(
      'it was not generated by an API',
    )
    expect(
      Array.from(await archive.file('capybara.glb')!.async('uint8array')),
    ).toEqual(Array.from(modelBytes))
    expect(
      JSON.parse(await archive.file('arcade-config.json')!.async('string')),
    ).toEqual(generatedConfig)
    warning.mockRestore()
  })

  it('shows an error and blocks ZIP if the local fallback also fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockConfigResponse()
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Hyper3D timed out.' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        blob: async () => new Blob(),
      })
    render(<App />)
    enterPrompt('green sticks')

    expect(
      await screen.findByText(/could not fetch the selected demo model/i),
    ).toBeTruthy()
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/bamboo.glb')
    expect(screen.queryByRole('button', { name: /download arcade bundle/i })).toBeNull()
    expect(saveAs).not.toHaveBeenCalled()
    warning.mockRestore()
    error.mockRestore()
  })

  it('keeps the prompt and blocks ZIP when Gemini config generation fails', async () => {
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

  it('packages the Hyper3D model filename, bytes, and real Gemini config', async () => {
    mockConfigResponse()
    mockHyper3dResponse('generated-crate.glb')
    render(<App />)
    enterPrompt('A wooden crate')

    expect(await screen.findByText('generated-crate.glb')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /download arcade bundle/i }))
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1))

    const savedFile = vi.mocked(saveAs).mock.calls[0]?.[0]
    if (!(savedFile instanceof Blob)) throw new Error('Expected a ZIP Blob')
    const archive = await JSZip.loadAsync(savedFile)
    expect(Object.keys(archive.files).sort()).toEqual([
      'README.txt',
      'arcade-config.json',
      'generated-crate.glb',
    ])
    expect(
      Array.from(await archive.file('generated-crate.glb')!.async('uint8array')),
    ).toEqual(Array.from(modelBytes))
    expect(await archive.file('README.txt')!.async('string')).toContain(
      'generated with Hyper3D',
    )
    expect(
      JSON.parse(await archive.file('arcade-config.json')!.async('string')),
    ).toEqual(generatedConfig)
  })
})
