import type { BundleModel } from './arcadeBundle'

const maximumGenerationWaitMs = 5 * 60_000
const pollIntervalMs = 5_000
const requestTimeoutMs = 30_000

type Hyper3dClientDependencies = {
  fetch?: typeof fetch
  now?: () => number
  wait?: (milliseconds: number) => Promise<void>
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const result: unknown = await response.json()
    if (
      typeof result === 'object' &&
      result !== null &&
      'error' in result &&
      typeof result.error === 'string'
    ) {
      return result.error
    }
  } catch {
    // Use the endpoint-specific message when the response isn't JSON.
  }
  return fallback
}

export async function generateHyper3dModel(
  prompt: string,
  dependencies: Hyper3dClientDependencies = {},
): Promise<BundleModel> {
  const fetcher = dependencies.fetch ?? fetch
  const now = dependencies.now ?? Date.now
  const waitFor = dependencies.wait ?? wait
  const createRequestOptions = () => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(requestTimeoutMs),
  })
  const submissionResponse = await fetcher('/api/hyper3d', {
    ...createRequestOptions(),
    body: JSON.stringify({ prompt }),
  })
  if (!submissionResponse.ok) {
    throw new Error(
      await readError(
        submissionResponse,
        `Hyper3D submission failed (${submissionResponse.status}).`,
      ),
    )
  }

  const submission: unknown = await submissionResponse.json()
  if (
    typeof submission !== 'object' ||
    submission === null ||
    !('taskToken' in submission) ||
    typeof submission.taskToken !== 'string' ||
    !submission.taskToken
  ) {
    throw new Error('Hyper3D returned an invalid generation task.')
  }

  const deadline = now() + maximumGenerationWaitMs
  let nextPollDelayMs = 0
  while (now() < deadline) {
    const remainingMs = deadline - now()
    await waitFor(Math.max(0, Math.min(nextPollDelayMs, remainingMs)))

    const statusResponse = await fetcher('/api/hyper3d-status', {
      ...createRequestOptions(),
      body: JSON.stringify({ taskToken: submission.taskToken }),
    })
    if (statusResponse.status === 202) {
      const retryAfterHeader = statusResponse.headers.get('Retry-After')
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN
      nextPollDelayMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? Math.min(retryAfterSeconds * 1_000, 30_000)
          : pollIntervalMs
      continue
    }
    if (!statusResponse.ok) {
      throw new Error(
        await readError(
          statusResponse,
          `Hyper3D status check failed (${statusResponse.status}).`,
        ),
      )
    }

    const blob = await statusResponse.blob()
    const filename = statusResponse.headers.get('X-Model-Filename')
    if (!blob.size || !filename || !filename.toLowerCase().endsWith('.glb')) {
      throw new Error('Hyper3D returned an invalid model file.')
    }
    return { blob, filename, source: 'Hyper3D' }
  }

  throw new Error(
    'Hyper3D generation is still processing after 5 minutes. The job may finish later; try generating again only after checking your Hyper3D account for the current task.',
  )
}
