import { useState } from 'react'
import {
  ArrowDownToLine,
  Box,
  Check,
  ChevronRight,
  CircleHelp,
  Cuboid,
  FileCode2,
  FileText,
  Layers3,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { saveAs } from 'file-saver'
import { createArcadeBundle } from './arcadeBundle'
import { isArcadeConfig, type ArcadeConfig } from './arcadeConfig'

type GenerationState = 'idle' | 'loading' | 'success'
const maximumPromptLength = 500

function App() {
  const [prompt, setPrompt] = useState('')
  const [arcadeConfig, setArcadeConfig] = useState<ArcadeConfig | null>(null)
  const [generationState, setGenerationState] =
    useState<GenerationState>('idle')
  const [promptError, setPromptError] = useState('')
  const [generationError, setGenerationError] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')

  async function generateBundle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!prompt.trim()) {
      setPromptError('Enter an asset prompt to get started.')
      return
    }
    if (prompt.trim().length > maximumPromptLength) {
      setPromptError(
        `Asset prompts must be ${maximumPromptLength} characters or fewer.`,
      )
      return
    }

    setPromptError('')
    setGenerationError('')
    setDownloadError('')
    setArcadeConfig(null)
    setGenerationState('loading')

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      const result: unknown = await response.json()

      if (!response.ok) {
        const message =
          typeof result === 'object' &&
          result !== null &&
          'error' in result &&
          typeof result.error === 'string'
            ? result.error
            : 'Could not generate the Arcade config. Please try again.'
        throw new Error(message)
      }
      if (!isArcadeConfig(result)) {
        throw new Error('The server returned an invalid Arcade config.')
      }

      setArcadeConfig(result)
      setGenerationState('success')
    } catch (error) {
      console.error('Unable to generate the Arcade config.', error)
      setGenerationError(
        error instanceof Error
          ? error.message
          : 'Could not generate the Arcade config. Please try again.',
      )
      setGenerationState('idle')
    }
  }

  async function downloadBundle() {
    setIsDownloading(true)
    setDownloadError('')

    try {
      if (!arcadeConfig) {
        throw new Error('No generated Arcade config is available.')
      }
      const bundle = await createArcadeBundle(arcadeConfig)
      saveAs(bundle, 'asset-bundle.zip')
    } catch (error) {
      console.error('Unable to create the Arcade asset bundle.', error)
      setDownloadError('Could not create the ZIP. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="app-shell min-h-screen overflow-hidden text-slate-100">
      <div className="ambient-glow" aria-hidden="true" />
      <header className="relative z-10 border-b border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <a href="#" className="flex items-center gap-3" aria-label="PolyPacker home">
            <span className="brand-mark">
              <Box size={21} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="text-[15px] font-semibold tracking-[0.13em] text-white">
              POLYPACKER
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-amber-200/80 sm:flex">
              <span className="size-1.5 rounded-full bg-amber-300" />
              MOCK MODEL · GEMINI CONFIG
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="About this demo"
              title="Gemini generates the Arcade config; the 3D model is a placeholder."
            >
              <CircleHelp size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <section className="mb-9 max-w-3xl sm:mb-12">
          <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-violet-300">
            <Sparkles size={14} aria-hidden="true" />
            THE ASSET PIPELINE FOR GAME BUILDERS
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.045em] text-white sm:text-5xl lg:text-[3.5rem]">
            Arcade-Ready Asset Booster
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            From a spark of an idea to a game-ready asset bundle. Generate
            gameplay metadata while your 3D model stays mocked.
          </p>
        </section>

        <section className="workspace-grid grid gap-5 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="surface-card flex flex-col p-5 sm:p-7">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">01 / DEFINE YOUR ASSET</p>
                <h2 className="mt-2 text-lg font-semibold text-white">
                  What are we making?
                </h2>
              </div>
              <span className="step-icon">
                <WandSparkles size={19} aria-hidden="true" />
              </span>
            </div>

            <form className="flex flex-1 flex-col" onSubmit={generateBundle}>
              <label
                htmlFor="asset-prompt"
                className="mb-2.5 text-xs font-medium text-slate-300"
              >
                Asset prompt
              </label>
              <textarea
                id="asset-prompt"
                aria-label="Asset prompt"
                className="prompt-input min-h-36 w-full resize-y rounded-xl p-4 text-sm leading-6 text-slate-100 placeholder:text-slate-600 focus:outline-none sm:min-h-40"
                placeholder="Explosive Cyberpunk Barrel"
                value={prompt}
                maxLength={maximumPromptLength}
                onChange={(event) => {
                  setPrompt(event.target.value)
                  if (promptError) setPromptError('')
                  if (generationError) setGenerationError('')
                }}
                disabled={generationState === 'loading'}
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>Describe the asset (up to 500 characters).</span>
                <span>{prompt.length}/500</span>
              </div>

              {promptError && (
                <p className="mt-3 text-xs text-rose-300" role="alert">
                  {promptError}
                </p>
              )}
              {generationError && (
                <p className="mt-3 text-xs text-rose-300" role="alert">
                  {generationError}
                </p>
              )}

              <button
                type="submit"
                className="generate-button mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition disabled:cursor-wait disabled:opacity-70"
                disabled={generationState === 'loading'}
              >
                {generationState === 'loading' ? (
                  <LoaderCircle
                    className="animate-spin"
                    size={17}
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles size={16} aria-hidden="true" />
                )}
                Generate Asset Bundle
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </form>

            <div className="mt-7 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-5">
              <PipelineBadge label="MODEL" value="3D asset" icon={Cuboid} />
              <PipelineBadge label="METADATA" value="Arcade config" icon={FileCode2} />
              <PipelineBadge label="DELIVERY" value="ZIP bundle" icon={Layers3} />
            </div>
          </div>

          <div className="surface-card output-card flex min-h-[440px] flex-col p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">02 / YOUR OUTPUT</p>
                <h2 className="mt-2 text-lg font-semibold text-white">
                  Asset bundle
                </h2>
              </div>
              <span className="output-status">
                <span className="size-1.5 rounded-full bg-slate-500" />
                {generationState === 'success' ? 'READY' : 'AWAITING PROMPT'}
              </span>
            </div>

            <div className="mt-6 flex flex-1 flex-col">
              {generationState === 'idle' && <IdleOutput />}
              {generationState === 'loading' && <LoadingOutput />}
              {generationState === 'success' && arcadeConfig && (
                <SuccessOutput
                  arcadeConfig={arcadeConfig}
                  isDownloading={isDownloading}
                  downloadError={downloadError}
                  onDownload={downloadBundle}
                />
              )}
            </div>
          </div>
        </section>

        <footer className="mt-7 flex flex-col items-start justify-between gap-3 border-t border-white/[0.07] pt-5 text-[11px] text-slate-500 sm:flex-row sm:items-center">
          <p className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-400/80" aria-hidden="true" />
            Gemini generates the Arcade config; the 3D model remains mocked.
          </p>
          <p className="font-semibold tracking-[0.12em] text-slate-600">
            MOCK 3D · GEMINI CONFIG
          </p>
        </footer>
      </main>
    </div>
  )
}

type PipelineBadgeProps = {
  label: string
  value: string
  icon: typeof Cuboid
}

function PipelineBadge({ label, value, icon: Icon }: PipelineBadgeProps) {
  return (
    <div className="min-w-0">
      <Icon size={15} className="mb-2 text-violet-300/80" aria-hidden="true" />
      <p className="truncate text-[9px] font-semibold tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-medium text-slate-300">
        {value}
      </p>
    </div>
  )
}

function IdleOutput() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="idle-illustration mb-6">
        <div className="idle-orbit idle-orbit-one" />
        <div className="idle-orbit idle-orbit-two" />
        <div className="idle-cube">
          <Cuboid size={39} strokeWidth={1.1} aria-hidden="true" />
        </div>
        <span className="idle-spark idle-spark-one" />
        <span className="idle-spark idle-spark-two" />
      </div>
      <p className="text-sm font-medium text-slate-300">
        Your next game asset starts here
      </p>
      <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">
        Describe an asset to see its mock model and gameplay config appear here.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[10px] tracking-wide text-slate-400">
        <span className="size-1.5 rounded-full bg-violet-300" />
        PROMPT → MODEL + METADATA → ZIP
      </div>
    </div>
  )
}

function LoadingOutput() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="loading-ring mb-6">
        <LoaderCircle
          className="animate-spin text-violet-300"
          size={34}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
      <p className="text-sm font-medium text-white">
        Generating Arcade config...
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Preparing the mock model and your gameplay metadata
      </p>
      <div className="mt-7 flex items-center gap-3">
        <span className="loading-step loading-step-active">
          <Cuboid size={13} aria-hidden="true" /> MOCK GLB
        </span>
        <span className="h-px w-8 bg-white/10" />
        <span className="loading-step">
          <FileCode2 size={13} aria-hidden="true" /> CONFIG
        </span>
        <span className="h-px w-8 bg-white/10" />
        <span className="loading-step">
          <Layers3 size={13} aria-hidden="true" /> ZIP
        </span>
      </div>
    </div>
  )
}

type SuccessOutputProps = {
  arcadeConfig: ArcadeConfig
  isDownloading: boolean
  downloadError: string
  onDownload: () => void
}

function SuccessOutput({
  arcadeConfig,
  isDownloading,
  downloadError,
  onDownload,
}: SuccessOutputProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-2 text-xs font-medium text-emerald-300">
        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-400/10">
          <Check size={12} aria-hidden="true" />
        </span>
        Bundle generated
        <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-300/15 bg-amber-300/[0.05] px-2 py-1 text-[9px] font-semibold tracking-wider text-amber-200/80">
          MOCK ASSET
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <ConfigStat label="ASSET TYPE" value={arcadeConfig.type} />
        <ConfigStat label="COLLIDER" value={arcadeConfig.collider} />
        <ConfigStat label="MASS" value={`${arcadeConfig.mass} kg`} />
      </div>

      <div className="code-panel flex-1 overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
            <FileCode2 size={14} className="text-violet-300" aria-hidden="true" />
            arcade-config.json
          </div>
          <span className="text-[9px] tracking-[0.12em] text-slate-500">JSON</span>
        </div>
        <pre className="max-h-48 overflow-auto p-4 text-[11px] leading-5 text-slate-300 sm:text-xs">
          <code>{JSON.stringify(arcadeConfig, null, 2)}</code>
        </pre>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.035] px-3 py-2.5 text-[10px] leading-4 text-amber-100/70">
        <CircleHelp size={14} className="shrink-0 text-amber-200/80" aria-hidden="true" />
        barrel.glb is a text placeholder, not a valid or importable 3D model.
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Cuboid size={13} className="text-violet-300/80" aria-hidden="true" />
          barrel.glb
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileCode2 size={13} className="text-violet-300/80" aria-hidden="true" />
          arcade-config.json
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText size={13} className="text-violet-300/80" aria-hidden="true" />
          README.txt
        </span>
      </div>

      {downloadError && (
        <p className="mt-3 text-xs text-rose-300" role="alert">
          {downloadError}
        </p>
      )}

      <button
        type="button"
        className="download-button mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-sm font-semibold text-white transition disabled:cursor-wait disabled:opacity-70"
        onClick={onDownload}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
        ) : (
          <ArrowDownToLine size={18} aria-hidden="true" />
        )}
        {isDownloading ? 'Preparing ZIP...' : 'Download Arcade Bundle (.zip)'}
      </button>
    </div>
  )
}

type ConfigStatProps = {
  label: string
  value: string
}

function ConfigStat({ label, value }: ConfigStatProps) {
  return (
    <div className="stat-card min-w-0 rounded-lg px-3 py-2.5">
      <p className="text-[9px] font-semibold tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-[11px] text-slate-200">
        {value}
      </p>
    </div>
  )
}

export default App
