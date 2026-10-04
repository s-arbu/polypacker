import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleHyper3dRequest } from '../api/hyper3d.post'

function createRequest(prompt: unknown) {
  return new Request('http://localhost/api/hyper3d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const submittedTask = {
  uuid: 'task-123',
  jobs: {
    uuids: ['job-1', 'job-2'],
    subscription_key: 'subscription-123',
  },
}

describe('Hyper3D generation route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('returns the first completed GLB and its filename', async () => {
    vi.stubEnv('HYPER3D_API_KEY', 'test-key')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(submittedTask, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [
            { uuid: 'job-1', status: 'Done' },
            { uuid: 'job-2', status: 'Generating' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [
            { uuid: 'job-1', status: 'Done' },
            { uuid: 'job-2', status: 'Done' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          list: [
            { name: 'preview.png', url: 'https://assets.test/preview.png' },
            { name: 'model.glb', url: 'https://assets.test/model.glb' },
            { name: 'second.glb', url: 'https://assets.test/second.glb' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), {
          headers: { 'Content-Type': 'model/gltf-binary' },
        }),
      )
    const wait = vi.fn(async () => {})

    const response = await handleHyper3dRequest(
      createRequest(' A green dragon '),
      { fetch: fetcher, wait },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Model-Filename')).toBe('model.glb')
    expect(response.headers.get('Content-Type')).toBe('model/gltf-binary')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      0x67, 0x6c, 0x54, 0x46,
    ])
    expect(wait).toHaveBeenNthCalledWith(1, 5_000, expect.any(AbortSignal))
    expect(wait).toHaveBeenNthCalledWith(2, 10_000, expect.any(AbortSignal))

    const submission = fetcher.mock.calls[0]
    expect(submission?.[0]).toBe('https://api.hyper3d.com/api/v2/rodin')
    expect(submission?.[1]?.headers).toEqual({
      Authorization: 'Bearer test-key',
    })
    expect(submission?.[1]?.body).toBeInstanceOf(FormData)
    const form = submission?.[1]?.body as FormData
    expect(form.get('prompt')).toBe('A green dragon')
    expect(form.get('tier')).toBe('Gen-2.5-Extreme-Low')
    expect(form.get('mesh_mode')).toBe('Raw')
    expect(form.get('quality')).toBe('medium')
    expect(form.get('geometry_file_format')).toBe('glb')
    expect(form.has('quality_override')).toBe(false)

    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://api.hyper3d.com/api/v2/status',
    )
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      subscription_key: 'subscription-123',
    })
    expect(fetcher.mock.calls[3]?.[0]).toBe(
      'https://api.hyper3d.com/api/v2/download',
    )
    expect(JSON.parse(String(fetcher.mock.calls[3]?.[1]?.body))).toEqual({
      task_uuid: 'task-123',
    })
    expect(fetcher.mock.calls[4]?.[0]).toBe('https://assets.test/model.glb')
  })

  it('returns a route error when credentials are missing', async () => {
    vi.stubEnv('HYPER3D_API_KEY', '')
    const fetcher = vi.fn<typeof fetch>()

    const response = await handleHyper3dRequest(createRequest('barrel'), {
      fetch: fetcher,
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Hyper3D is not configured on the server.',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('stops polling and reports a failed generation job', async () => {
    vi.stubEnv('HYPER3D_API_KEY', 'test-key')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(submittedTask, 201))
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [
            { uuid: 'job-1', status: 'Done' },
            { uuid: 'job-2', status: 'Failed' },
          ],
        }),
      )

    const response = await handleHyper3dRequest(createRequest('barrel'), {
      fetch: fetcher,
      wait: vi.fn(async () => {}),
    })

    expect(response.status).toBe(502)
    expect(fetcher).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })

  it('caps Retry-After polling waits at thirty seconds', async () => {
    vi.stubEnv('HYPER3D_API_KEY', 'test-key')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(submittedTask, 201))
      .mockResolvedValueOnce(
        new Response('', {
          status: 429,
          headers: { 'Retry-After': '90' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [
            { uuid: 'job-1', status: 'Done' },
            { uuid: 'job-2', status: 'Done' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          list: [
            { name: 'model.glb', url: 'https://assets.test/model.glb' },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
    const wait = vi.fn(async () => {})

    const response = await handleHyper3dRequest(createRequest('barrel'), {
      fetch: fetcher,
      wait,
    })

    expect(response.status).toBe(200)
    expect(wait).toHaveBeenNthCalledWith(1, 5_000, expect.any(AbortSignal))
    expect(wait).toHaveBeenNthCalledWith(2, 30_000, expect.any(AbortSignal))
  })

  it('returns a timeout response when the overall generation deadline expires', async () => {
    vi.useFakeTimers()
    vi.stubEnv('HYPER3D_API_KEY', 'test-key')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}))

    const responsePromise = handleHyper3dRequest(createRequest('barrel'), {
      fetch: fetcher,
    })
    await vi.advanceTimersByTimeAsync(60_000)
    const response = await responsePromise

    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({
      error: 'Hyper3D generation exceeded the 60-second timeout.',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })
})
