import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  handleHyper3dRequest,
  handleHyper3dStatusRequest,
} from '../api/hyper3d.post'

function createRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

describe('Hyper3D generation routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('submits once and returns an opaque polling token', async () => {
    vi.stubEnv('HYPER3D_API_KEY', 'test-key')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(submittedTask, 201))

    const response = await handleHyper3dRequest(
      createRequest('/api/hyper3d', { prompt: ' A green dragon ' }),
      { fetch: fetcher },
    )

    expect(response.status).toBe(202)
    const body = await response.json()
    expect(typeof body.taskToken).toBe('string')
    expect(body.taskToken).not.toContain('subscription-123')
    expect(body.taskToken).not.toContain('task-123')
    expect(fetcher).toHaveBeenCalledTimes(1)
    const submission = fetcher.mock.calls[0]
    expect(submission?.[0]).toBe('https://api.hyper3d.com/api/v2/rodin')
    expect(
      new Headers(submission?.[1]?.headers).get('Authorization'),
    ).toContain('test-key')
    expect(submission?.[1]?.body).toBeInstanceOf(FormData)
    const form = submission?.[1]?.body as FormData
    expect(form.get('prompt')).toBe('A green dragon')
    expect(form.get('tier')).toBe('Gen-2.5-Extreme-Low')
    expect(form.get('mesh_mode')).toBe('Raw')
    expect(form.get('quality')).toBe('medium')
    expect(form.get('geometry_file_format')).toBe('glb')
  })

  it('checks status once per request and downloads the generated GLB when done', async () => {
    vi.stubEnv('HYPER3D_API_KEY', 'test-key')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(submittedTask, 201))
    const submission = await handleHyper3dRequest(
      createRequest('/api/hyper3d', { prompt: 'green dragon' }),
      { fetch: fetcher },
    )
    const { taskToken } = await submission.json()

    fetcher
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [
            { uuid: 'job-2', status: 'Done' },
            { uuid: 'job-1', status: 'Generating' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jobs: [
            { uuid: 'job-2', status: 'Done' },
            { uuid: 'job-1', status: 'Done' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          list: [
            { name: 'preview.png', url: 'https://assets.test/preview.png' },
            { name: 'model.glb', url: 'https://assets.test/model.glb' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), {
          headers: { 'Content-Type': 'model/gltf-binary' },
        }),
      )

    const firstPoll = await handleHyper3dStatusRequest(
      createRequest('/api/hyper3d-status', { taskToken }),
      { fetch: fetcher },
    )
    expect(firstPoll.status).toBe(202)
    expect(await firstPoll.json()).toEqual({ status: 'processing' })

    const secondPoll = await handleHyper3dStatusRequest(
      createRequest('/api/hyper3d-status', { taskToken }),
      { fetch: fetcher },
    )
    expect(secondPoll.status).toBe(200)
    expect(secondPoll.headers.get('X-Model-Filename')).toBe('model.glb')
    expect(
      Array.from(new Uint8Array(await secondPoll.arrayBuffer())),
    ).toEqual([0x67, 0x6c, 0x54, 0x46])
    expect(fetcher).toHaveBeenCalledTimes(5)
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

  it('honors Hyper3D Retry-After without failing a pending generation', async () => {
    vi.stubEnv('HYPER3D_API_KEY', 'test-key')
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(submittedTask, 201))
    const submission = await handleHyper3dRequest(
      createRequest('/api/hyper3d', { prompt: 'barrel' }),
      { fetch: fetcher },
    )
    const { taskToken } = await submission.json()
    fetcher.mockResolvedValueOnce(
      new Response('', {
        status: 429,
        headers: { 'Retry-After': '90' },
      }),
    )

    const response = await handleHyper3dStatusRequest(
      createRequest('/api/hyper3d-status', { taskToken }),
      { fetch: fetcher },
    )

    expect(response.status).toBe(202)
    expect(response.headers.get('Retry-After')).toBe('30')
  })

  it('rejects a tampered task token without calling Hyper3D', async () => {
    vi.stubEnv('HYPER3D_API_KEY', 'test-key')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = vi.fn<typeof fetch>()
    const response = await handleHyper3dStatusRequest(
      createRequest('/api/hyper3d-status', { taskToken: 'tampered.token' }),
      { fetch: fetcher },
    )

    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('reports missing credentials before making provider requests', async () => {
    vi.stubEnv('HYPER3D_API_KEY', '')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = vi.fn<typeof fetch>()

    const response = await handleHyper3dRequest(
      createRequest('/api/hyper3d', { prompt: 'barrel' }),
      { fetch: fetcher },
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Hyper3D is not configured on the server.',
    })
    expect(fetcher).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
