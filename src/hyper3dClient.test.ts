import { describe, expect, it, vi } from 'vitest'
import { generateHyper3dModel } from './hyper3dClient'

describe('Hyper3D client', () => {
  it('retries a terminated status request without submitting a second paid job', async () => {
    const fetcher = vi.fn<typeof fetch>()
    fetcher.mockResolvedValueOnce(
      Response.json({ taskToken: 'opaque-task-token' }, { status: 202 }),
    )
    fetcher.mockResolvedValueOnce(
      Response.json({ error: 'terminated' }, { status: 502 }),
    )
    fetcher.mockResolvedValueOnce(
      new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), {
        headers: { 'X-Model-Filename': 'generated-barrel.glb' },
      }),
    )
    const wait = vi.fn(async () => {})

    const model = await generateHyper3dModel('Explosive cyberpunk barrel', {
      fetch: fetcher,
      wait,
    })

    expect(model.filename).toBe('generated-barrel.glb')
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/hyper3d')).toHaveLength(1)
    expect(
      fetcher.mock.calls.filter(([url]) => url === '/api/hyper3d-status'),
    ).toHaveLength(2)
    expect(wait).toHaveBeenCalledWith(5_000)
  })

  it('continues polling beyond sixty seconds and returns the generated GLB', async () => {
    let now = 0
    const fetcher = vi.fn<typeof fetch>()
    fetcher.mockResolvedValueOnce(
      Response.json({ taskToken: 'opaque-task-token' }, { status: 202 }),
    )
    fetcher.mockResolvedValueOnce(
      Response.json({ status: 'processing' }, { status: 202 }),
    )
    fetcher.mockResolvedValueOnce(
      new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), {
        headers: { 'X-Model-Filename': 'generated-barrel.glb' },
      }),
    )
    const wait = vi.fn(async (milliseconds: number) => {
      now += Math.max(milliseconds, 61_000)
    })

    const model = await generateHyper3dModel('Explosive cyberpunk barrel', {
      fetch: fetcher,
      now: () => now,
      wait,
    })

    expect(now).toBeGreaterThan(60_000)
    expect(model.filename).toBe('generated-barrel.glb')
    expect(model.source).toBe('Hyper3D')
    expect(Array.from(new Uint8Array(await model.blob.arrayBuffer()))).toEqual([
      0x67, 0x6c, 0x54, 0x46,
    ])
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      '/api/hyper3d',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'Explosive cyberpunk barrel' }),
      }),
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/hyper3d-status',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ taskToken: 'opaque-task-token' }),
      }),
    )
    const submissionSignal = fetcher.mock.calls[0]?.[1]?.signal
    const statusSignal = fetcher.mock.calls[1]?.[1]?.signal
    expect(submissionSignal).not.toBe(statusSignal)
    expect(submissionSignal?.aborted).toBe(false)
    expect(statusSignal?.aborted).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
