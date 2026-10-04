import { defineHandler } from 'nitro'

const apiBaseUrl = 'https://api.hyper3d.com/api/v2'
const generationTimeoutMs = 60_000
const initialPollDelayMs = 5_000
const maximumPollDelayMs = 30_000

type Hyper3dDependencies = {
  fetch?: typeof fetch
  now?: () => number
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

type RodinSubmission = {
  uuid: string
  jobs: {
    uuids: string[]
    subscription_key: string
  }
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status })
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Hyper3D generation timed out.'))
      return
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)

    function onAbort() {
      clearTimeout(timer)
      reject(new Error('Hyper3D generation timed out.'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - now)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new Error('Hyper3D returned an invalid response.', { cause: error })
  }
}

function isRodinSubmission(value: unknown): value is RodinSubmission {
  if (!isRecord(value) || !isRecord(value.jobs)) return false
  return (
    typeof value.uuid === 'string' &&
    value.uuid.length > 0 &&
    typeof value.jobs.subscription_key === 'string' &&
    value.jobs.subscription_key.length > 0 &&
    Array.isArray(value.jobs.uuids) &&
    value.jobs.uuids.length > 0 &&
    value.jobs.uuids.every(
      (jobId) => typeof jobId === 'string' && jobId.length > 0,
    )
  )
}

function getGlbFile(value: unknown): { name: string; url: string } | null {
  if (!isRecord(value) || !Array.isArray(value.list)) return null
  const file = value.list.find(
    (item) =>
      isRecord(item) &&
      typeof item.name === 'string' &&
      item.name.toLowerCase().endsWith('.glb') &&
      typeof item.url === 'string',
  )
  if (!isRecord(file) || typeof file.name !== 'string') return null

  try {
    const url = new URL(String(file.url))
    if (url.protocol !== 'https:') return null
    const name = file.name.split(/[\\/]/).at(-1)
    if (!name || !name.toLowerCase().endsWith('.glb')) return null
    return { name, url: url.toString() }
  } catch {
    return null
  }
}

export async function handleHyper3dRequest(
  request: Request,
  dependencies: Hyper3dDependencies = {},
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonError('Method not allowed.', 405)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    console.error('Invalid JSON in Hyper3D request.', error)
    return jsonError('Send a valid JSON request body.', 400)
  }

  if (!isRecord(body) || typeof body.prompt !== 'string') {
    return jsonError('Provide an asset prompt.', 400)
  }
  const prompt = body.prompt.trim()
  if (!prompt) return jsonError('Provide an asset prompt.', 400)
  if (prompt.length > 500) {
    return jsonError('Asset prompts must be 500 characters or fewer.', 413)
  }

  const apiKey = process.env.HYPER3D_API_KEY
  if (!apiKey) {
    console.error('HYPER3D_API_KEY is not configured on the server.')
    return jsonError('Hyper3D is not configured on the server.', 500)
  }

  const fetcher = dependencies.fetch ?? fetch
  const now = dependencies.now ?? Date.now
  const waitFor = dependencies.wait ?? wait
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('Hyper3D generation exceeded the 60-second timeout.'))
    }, generationTimeoutMs)
  })
  const headers = { Authorization: `Bearer ${apiKey}` }

  async function generateModel(): Promise<Response> {
    const form = new FormData()
    form.set('prompt', prompt)
    form.set('tier', 'Gen-2.5-Extreme-Low')
    form.set('mesh_mode', 'Raw')
    form.set('quality', 'medium')
    form.set('geometry_file_format', 'glb')

    const submissionResponse = await fetcher(`${apiBaseUrl}/rodin`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    })
    if (!submissionResponse.ok) {
      throw new Error(
        `Hyper3D generation request failed (${submissionResponse.status}).`,
      )
    }

    const submission = await readJson(submissionResponse)
    if (isRecord(submission) && typeof submission.error === 'string') {
      throw new Error(
        typeof submission.message === 'string'
          ? submission.message
          : submission.error,
      )
    }
    if (!isRodinSubmission(submission)) {
      throw new Error('Hyper3D returned an invalid generation task.')
    }

    let pollDelay = initialPollDelayMs
    while (true) {
      await waitFor(pollDelay, controller.signal)
      const statusResponse = await fetcher(`${apiBaseUrl}/status`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription_key: submission.jobs.subscription_key,
        }),
        signal: controller.signal,
      })
      if (statusResponse.status === 429) {
        const retryAfter = parseRetryAfter(
          statusResponse.headers.get('Retry-After'),
          now(),
        )
        pollDelay = Math.min(
          retryAfter ?? pollDelay,
          maximumPollDelayMs,
        )
        continue
      }
      if (!statusResponse.ok) {
        throw new Error(
          `Hyper3D status check failed (${statusResponse.status}).`,
        )
      }

      const status = await readJson(statusResponse)
      if (!isRecord(status) || !Array.isArray(status.jobs)) {
        throw new Error('Hyper3D returned an invalid job status.')
      }
      const jobStatuses = status.jobs.map((job) =>
        isRecord(job) && typeof job.status === 'string' ? job.status : null,
      )
      if (
        jobStatuses.length !== submission.jobs.uuids.length ||
        jobStatuses.some((jobStatus) => jobStatus === null)
      ) {
        throw new Error('Hyper3D returned an incomplete job status.')
      }
      if (jobStatuses.includes('Failed')) {
        throw new Error('Hyper3D failed to generate the model.')
      }
      if (jobStatuses.every((jobStatus) => jobStatus === 'Done')) break
      if (
        jobStatuses.some(
          (jobStatus) =>
            jobStatus !== 'Waiting' &&
            jobStatus !== 'Generating' &&
            jobStatus !== 'Done',
        )
      ) {
        throw new Error('Hyper3D returned an unknown job status.')
      }

      pollDelay = Math.min(pollDelay * 2, maximumPollDelayMs)
    }

    const downloadResponse = await fetcher(`${apiBaseUrl}/download`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_uuid: submission.uuid }),
      signal: controller.signal,
    })
    if (!downloadResponse.ok) {
      throw new Error(
        `Hyper3D download lookup failed (${downloadResponse.status}).`,
      )
    }

    const file = getGlbFile(await readJson(downloadResponse))
    if (!file) throw new Error('Hyper3D did not return a downloadable GLB.')

    const modelResponse = await fetcher(file.url, {
      signal: controller.signal,
    })
    if (!modelResponse.ok) {
      throw new Error(
        `Hyper3D model download failed (${modelResponse.status}).`,
      )
    }
    const model = await modelResponse.arrayBuffer()
    if (model.byteLength === 0) throw new Error('Hyper3D returned an empty GLB.')

    return new Response(model, {
      headers: {
        'Content-Type':
          modelResponse.headers.get('Content-Type') ?? 'model/gltf-binary',
        'X-Model-Filename': file.name,
      },
    })
  }

  try {
    return await Promise.race([generateModel(), timeoutPromise])
  } catch (error) {
    const timedOut =
      controller.signal.aborted ||
      (error instanceof Error &&
        error.message.includes('60-second timeout'))
    console.error(
      timedOut
        ? 'Hyper3D generation exceeded the 60-second timeout.'
        : 'Hyper3D model generation failed.',
      error,
    )
    return jsonError(
      timedOut
        ? 'Hyper3D generation exceeded the 60-second timeout.'
        : error instanceof Error
          ? error.message
          : 'Hyper3D model generation failed.',
      timedOut ? 504 : 502,
    )
  } finally {
    clearTimeout(timeoutId!)
  }
}

export default defineHandler(({ req }) => handleHyper3dRequest(req))
