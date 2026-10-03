import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleGenerateRequest } from '../api/generate.post'

const { createInteraction } = vi.hoisted(() => ({
  createInteraction: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create: createInteraction }
  },
}))

const generatedConfig = {
  type: 'prop_explosive',
  collider: 'cylinder',
  mass: 50,
  damage_radius: 5,
  is_pickup: false,
}

function createRequest(prompt: unknown) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
}

describe('Arcade config generation route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    createInteraction.mockReset()
  })

  it('requests schema-constrained JSON from the selected Gemini Flash model', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    createInteraction.mockResolvedValue({
      output_text: JSON.stringify(generatedConfig),
    })

    const response = await handleGenerateRequest(
      createRequest('A glowing explosive barrel'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(generatedConfig)
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.8-flash',
        input: expect.stringContaining(
          'Asset description: A glowing explosive barrel',
        ),
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              collider: { type: 'string' },
              mass: { type: 'number' },
              damage_radius: { type: 'number' },
              is_pickup: { type: 'boolean' },
            },
            required: [
              'type',
              'collider',
              'mass',
              'damage_radius',
              'is_pickup',
            ],
          },
        },
      }),
    )
  })

  it('returns a validated Arcade config for a valid prompt', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    const generateConfig = vi.fn().mockResolvedValue(generatedConfig)

    const response = await handleGenerateRequest(
      createRequest('  explosive barrel  '),
      generateConfig,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(generatedConfig)
    expect(generateConfig).toHaveBeenCalledWith('explosive barrel')
  })

  it('rejects blank and oversized prompts without calling Gemini', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    const generateConfig = vi.fn()

    const blankResponse = await handleGenerateRequest(
      createRequest('   '),
      generateConfig,
    )
    const oversizedResponse = await handleGenerateRequest(
      createRequest('a'.repeat(501)),
      generateConfig,
    )

    expect(blankResponse.status).toBe(400)
    expect(oversizedResponse.status).toBe(413)
    expect(generateConfig).not.toHaveBeenCalled()
  })

  it('rejects Gemini output that does not match the Arcade config contract', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    const generateConfig = vi.fn().mockResolvedValue({
      ...generatedConfig,
      mass: -1,
    })

    const response = await handleGenerateRequest(
      createRequest('explosive barrel'),
      generateConfig,
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Gemini returned an invalid Arcade config. Please try again.',
    })
  })

  it('returns an explicit error when Gemini generation fails', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    const generateConfig = vi
      .fn()
      .mockRejectedValue(new Error('upstream failure'))

    const response = await handleGenerateRequest(
      createRequest('explosive barrel'),
      generateConfig,
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Gemini configuration generation failed. Please try again.',
    })
  })
})
