import { defineHandler } from 'nitro'

const apiBaseUrl = 'https://api.hyper3d.com/api/v2'
const maximumRetryAfterMs = 30_000

type Hyper3dDependencies = {
  fetch?: typeof fetch
}

type Hyper3dTask = {
  uuid: string
  jobIds: string[]
  subscriptionKey: string
}

type RodinSubmission = {
  uuid: string
  jobs: { uuids: string[]; subscription_key: string }
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status })
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

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function getTaskTokenKey(apiKey: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(apiKey),
  )
  return crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

async function encryptTaskToken(task: Hyper3dTask, apiKey: string): Promise<string> {
  const iv = new Uint8Array(new ArrayBuffer(12))
  crypto.getRandomValues(iv)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await getTaskTokenKey(apiKey),
    new TextEncoder().encode(JSON.stringify(task)),
  )
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`
}

async function decryptTaskToken(
  token: string,
  apiKey: string,
): Promise<Hyper3dTask | null> {
  try {
    const [ivString, encryptedString, extra] = token.split('.')
    if (!ivString || !encryptedString || extra !== undefined) return null
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivString) },
      await getTaskTokenKey(apiKey),
      fromBase64Url(encryptedString),
    )
    const task: unknown = JSON.parse(new TextDecoder().decode(decrypted))
    if (
      !isRecord(task) ||
      typeof task.uuid !== 'string' ||
      typeof task.subscriptionKey !== 'string' ||
      !Array.isArray(task.jobIds) ||
      !task.jobIds.every((jobId) => typeof jobId === 'string')
    ) {
      return null
    }
    return task as Hyper3dTask
  } catch {
    return null
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
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
  try {
    const form = new FormData()
    form.set('prompt', prompt)
    form.set('tier', 'Gen-2.5-Extreme-Low')
    form.set('mesh_mode', 'Raw')
    form.set('quality', 'medium')
    form.set('geometry_file_format', 'glb')

    const response = await fetcher(`${apiBaseUrl}/rodin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    if (!response.ok) {
      throw new Error(`Hyper3D generation request failed (${response.status}).`)
    }
    const result = await readJson(response)
    if (isRecord(result) && typeof result.error === 'string') {
      throw new Error(
        typeof result.message === 'string' ? result.message : result.error,
      )
    }
    if (!isRodinSubmission(result)) {
      throw new Error('Hyper3D returned an invalid generation task.')
    }

    const taskToken = await encryptTaskToken(
      {
        uuid: result.uuid,
        jobIds: result.jobs.uuids,
        subscriptionKey: result.jobs.subscription_key,
      },
      apiKey,
    )
    return Response.json({ taskToken }, { status: 202 })
  } catch (error) {
    console.error('Hyper3D model submission failed.', error)
    return jsonError(
      error instanceof Error ? error.message : 'Hyper3D model submission failed.',
      502,
    )
  }
}

export async function handleHyper3dStatusRequest(
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
    console.error('Invalid JSON in Hyper3D status request.', error)
    return jsonError('Send a valid JSON request body.', 400)
  }
  if (
    !isRecord(body) ||
    typeof body.taskToken !== 'string' ||
    body.taskToken.length > 8_192
  ) {
    return jsonError('Provide a valid Hyper3D task token.', 400)
  }

  const apiKey = process.env.HYPER3D_API_KEY
  if (!apiKey) {
    console.error('HYPER3D_API_KEY is not configured on the server.')
    return jsonError('Hyper3D is not configured on the server.', 500)
  }
  const task = await decryptTaskToken(body.taskToken, apiKey)
  if (!task) return jsonError('The Hyper3D task token is invalid.', 400)

  const fetcher = dependencies.fetch ?? fetch
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  try {
    const statusResponse = await fetcher(`${apiBaseUrl}/status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ subscription_key: task.subscriptionKey }),
    })
    if (statusResponse.status === 429) {
      const retryAfter = Math.min(
        parseRetryAfter(statusResponse.headers.get('Retry-After')) ?? 5_000,
        maximumRetryAfterMs,
      )
      return Response.json(
        { status: 'processing' },
        { status: 202, headers: { 'Retry-After': String(retryAfter / 1_000) } },
      )
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
    const statusesById = new Map(
      status.jobs.flatMap((job) =>
        isRecord(job) &&
        typeof job.uuid === 'string' &&
        typeof job.status === 'string'
          ? [[job.uuid, job.status] as const]
          : [],
      ),
    )
    const jobStatuses = task.jobIds.map((jobId) => statusesById.get(jobId))
    if (jobStatuses.some((jobStatus) => jobStatus === undefined)) {
      throw new Error('Hyper3D returned an incomplete job status.')
    }
    if (jobStatuses.includes('Failed')) {
      throw new Error('Hyper3D failed to generate the model.')
    }
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
    if (!jobStatuses.every((jobStatus) => jobStatus === 'Done')) {
      return Response.json({ status: 'processing' }, { status: 202 })
    }

    const downloadResponse = await fetcher(`${apiBaseUrl}/download`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ task_uuid: task.uuid }),
    })
    if (!downloadResponse.ok) {
      throw new Error(
        `Hyper3D download lookup failed (${downloadResponse.status}).`,
      )
    }
    const file = getGlbFile(await readJson(downloadResponse))
    if (!file) throw new Error('Hyper3D did not return a downloadable GLB.')

    const modelResponse = await fetcher(file.url)
    if (!modelResponse.ok) {
      throw new Error(`Hyper3D model download failed (${modelResponse.status}).`)
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
  } catch (error) {
    console.error('Hyper3D model status check failed.', error)
    return jsonError(
      error instanceof Error
        ? error.message
        : 'Hyper3D model status check failed.',
      502,
    )
  }
}

export default defineHandler(({ req }) => handleHyper3dRequest(req))
