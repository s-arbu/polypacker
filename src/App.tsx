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
import { getMockModelPath } from './demoModel'

type GenerationState = 'idle' | 'loading' | 'success'
type LoadingStep = 'config' | 'model'
const maximumPromptLength = 500
const demoModelLatencyMs = 3_000

function App() {
  const [prompt, setPrompt] = useState('')
  const [arcadeConfig, setArcadeConfig] = useState<ArcadeConfig | null>(null)
  const [demoModel, setDemoModel] = useState<{
    blob: Blob
    path: string
  } | null>(null)
  const [generationState, setGenerationState] =
    useState<GenerationState>('idle')
  const [loadingStep, setLoadingStep] = useState<LoadingStep>('config')
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
    setDemoModel(null)
    setLoadingStep('config')
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

      setLoadingStep('model')
      const modelPath = getMockModelPath(prompt.trim())
      const modelFetch = fetch(modelPath)
      const minimumLatency = new Promise<void>((resolve) => {
        setTimeout(resolve, demoModelLatencyMs)
      })
      const modelResponse = await modelFetch
      if (!modelResponse.ok) {
        throw new Error(
          `Could not fetch the selected demo model (${modelResponse.status}).`,
        )
      }
      const [model] = await Promise.all([
        modelResponse.blob(),
        minimumLatency,
      ])
      if (!model || model.size === 0) {
        throw new Error('Could not fetch the selected demo model.')
      }
      setDemoModel({ blob: model, path: modelPath })

      setArcadeConfig(result)
      setGenerationState('success')
    } catch (error) {
      console.error('Unable to generate the asset bundle.', error)
      setGenerationError(
        error instanceof Error
          ? error.message
          : 'Could not generate the asset bundle. Please try again.',
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
      if (!demoModel) throw new Error('No demo model is available.')
      const modelName = demoModel.path.split('/').at(-1)
      if (!modelName) throw new Error('The selected demo model has no filename.')
      const bundle = await createArcadeBundle(
        arcadeConfig,
        demoModel.blob,
        modelName,
        demoModel.path,
      )
      saveAs(bundle, 'asset-bundle.zip')
    } catch (error) {
      console.error('Unable to create the Arcade asset bundle.', error)
      setDownloadError('Could not create the ZIP. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#090d10] text-zinc-100">
      <header className="relative z-10 border-b border-white/10 bg-[#0c1115]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="#" className="flex items-center gap-3" aria-label="PolyPacker home">
            <span className="grid size-10 place-items-center border border-cyan-300/50 bg-cyan-400 text-[#061014] shadow-[3px_3px_0_#075e68]">
              <Box size={21} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="text-sm font-black tracking-[0.16em] text-zinc-100">
              POLYPACKER
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 border border-cyan-400/25 bg-cyan-400/[0.04] px-3 py-2 font-mono text-[10px] font-medium tracking-[0.08em] text-cyan-100/80 sm:flex">
              <span className="size-1.5 bg-cyan-300" />
              DEMO MODEL / GEMINI CONFIG
            </span>
            <button
              type="button"
              className="flex size-9 items-center justify-center border border-white/10 bg-white/[0.03] text-zinc-400 transition-colors hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              aria-label="About this demo"
              title="Gemini generates the Arcade config; a prompt-matched demo model is selected locally."
            >
              <CircleHelp size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-9 sm:px-8 sm:pt-12">
        <section className="mb-9 grid gap-6 border-b border-white/10 pb-8 lg:mb-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 border border-cyan-300/30 bg-cyan-300/[0.06] px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.14em] text-cyan-200">
              <Sparkles size={13} aria-hidden="true" />
              ARCADE ASSET WORKSHOP
            </div>
            <h1 className="text-4xl font-black leading-[1.02] tracking-[-0.045em] text-zinc-100 sm:text-5xl lg:text-6xl">
              Arcade-ready
              <span className="block text-cyan-300">asset booster</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
              Turn an asset idea into an Arcade config and a bundle with a matching demo model.
            </p>
          </div>
          <div className="hidden items-center gap-3 border-l border-cyan-300/40 pl-5 lg:flex">
            <span className="font-mono text-4xl font-black leading-none text-cyan-300">01</span>
            <span className="max-w-24 font-mono text-[10px] leading-5 tracking-[0.08em] text-zinc-500">
              PROMPT IN
              <br />
              ARCADE ASSET OUT
            </span>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="arcade-panel relative flex flex-col border border-cyan-400/35 bg-[#10191d] p-5 sm:p-7">
            <div className="mb-7 flex items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-cyan-300">PLAYER INPUT</p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-100">
                  Build an asset
                </h2>
              </div>
              <span className="flex size-10 flex-none items-center justify-center border border-cyan-400/30 bg-cyan-400/[0.07] text-cyan-200">
                <WandSparkles size={19} aria-hidden="true" />
              </span>
            </div>

            <form className="flex flex-1 flex-col" onSubmit={generateBundle}>
              <label
                htmlFor="asset-prompt"
                className="mb-2.5 text-xs font-semibold text-zinc-200"
              >
                Asset prompt
              </label>
              <textarea
                id="asset-prompt"
                aria-label="Asset prompt"
                className="min-h-36 w-full resize-y border border-white/15 bg-[#090d10] p-4 text-sm leading-6 text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/20 disabled:opacity-60 sm:min-h-40"
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
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-zinc-400">
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
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 border border-cyan-200 bg-cyan-300 px-5 text-sm font-black tracking-wide text-[#071114] shadow-[3px_3px_0_#087783] transition-transform hover:-translate-y-0.5 hover:bg-cyan-200 active:translate-y-0.5 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-wait disabled:opacity-60"
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

            <div className="mt-7 grid grid-cols-3 gap-2 border-t border-white/10 pt-5">
              <PipelineBadge label="MODEL" value="3D asset" icon={Cuboid} />
              <PipelineBadge label="METADATA" value="Arcade config" icon={FileCode2} />
              <PipelineBadge label="DELIVERY" value="ZIP bundle" icon={Layers3} />
            </div>
          </div>

          <div className="arcade-panel relative flex min-h-[440px] flex-col border border-cyan-400/35 bg-[#0e1519] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-cyan-300">GAME OUTPUT</p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-100">Asset bundle</h2>
              </div>
              <span className={`inline-flex items-center gap-2 whitespace-nowrap border px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] ${generationState === 'success' ? 'border-cyan-300/40 bg-cyan-300/[0.06] text-cyan-200' : 'border-white/10 text-zinc-400'}`}>
                <span className={`size-1.5 ${generationState === 'success' ? 'bg-cyan-300' : 'bg-zinc-600'}`} />
                {generationState === 'success' ? 'READY' : 'AWAITING PROMPT'}
              </span>
            </div>

            <div className="mt-6 flex flex-1 flex-col">
              {generationState === 'idle' && <IdleOutput />}
              {generationState === 'loading' && (
                <LoadingOutput step={loadingStep} />
              )}
              {generationState === 'success' && arcadeConfig && (
                <SuccessOutput
                  arcadeConfig={arcadeConfig}
                  demoModelPath={demoModel?.path ?? ''}
                  isDownloading={isDownloading}
                  downloadError={downloadError}
                  onDownload={downloadBundle}
                />
              )}
            </div>
          </div>
        </section>

        <section className="mt-16 pt-10 sm:mt-20 sm:pt-12">
          <div className="mb-8 max-w-xl">
            <h2 className="text-2xl font-black tracking-tight text-zinc-100 sm:text-3xl">
              How PolyPacker works
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              From a quick description to a bundle you can take into your project.
            </p>
          </div>
          <div className="grid border-y border-white/10 md:grid-cols-[0.9fr_1.25fr_0.85fr]">
            <article className="py-6 pr-5 md:py-7">
              <FileText size={20} className="mb-5 text-cyan-300" aria-hidden="true" />
              <h3 className="text-base font-bold text-zinc-100">The idea</h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-400">
                Describe the game asset you want in a short text prompt.
              </p>
            </article>
            <article className="border-y border-cyan-300/35 bg-[#10191d] px-5 py-6 md:border-y-0 md:border-x md:px-7 md:py-7">
              <Layers3 size={20} className="mb-5 text-cyan-300" aria-hidden="true" />
              <h3 className="text-base font-bold text-zinc-100">Config and model</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
                Gemini creates the Arcade config. PolyPacker selects a matching pre-made model from its bundled assets.
              </p>
            </article>
            <article className="py-6 pl-5 md:py-7">
              <ArrowDownToLine size={20} className="mb-5 text-cyan-300" aria-hidden="true" />
              <h3 className="text-base font-bold text-zinc-100">Arcade ready</h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-400">
                Download a ZIP with the config, selected demo model, and README.
              </p>
            </article>
          </div>
        </section>

        <footer className="mt-7 flex flex-col items-start justify-between gap-3 border-t border-white/[0.08] pt-5 text-[11px] text-zinc-500 sm:flex-row sm:items-center">
          <p className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-zinc-500" aria-hidden="true" />
            Gemini generates the Arcade config; a matching demo model is selected locally.
          </p>
          <p className="font-medium tracking-[0.1em] text-zinc-600">
            LOCAL DEMO MODEL · GEMINI CONFIG
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
      <Icon size={15} className="mb-2 text-cyan-300/80" aria-hidden="true" />
      <p className="truncate text-[9px] font-medium tracking-[0.1em] text-zinc-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-300">
        {value}
      </p>
    </div>
  )
}

function IdleOutput() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="idle-illustration mb-6">
        <div className="absolute h-[52px] w-[132px] border border-cyan-400/15 [transform:rotate(-31deg)]" />
        <div className="absolute h-[45px] w-[108px] border border-cyan-400/10 [transform:rotate(36deg)]" />
        <div className="grid size-20 place-items-center border border-cyan-400/30 bg-[#10191d] text-cyan-200">
          <Cuboid size={39} strokeWidth={1.1} aria-hidden="true" />
        </div>
        <span className="absolute right-[19px] top-[22px] size-1 bg-cyan-300/80" />
        <span className="absolute bottom-[29px] left-[15px] size-[3px] bg-cyan-300/60" />
      </div>
      <p className="text-sm font-medium text-zinc-200">
        Your next game asset starts here
      </p>
      <p className="mt-2 max-w-xs text-xs leading-5 text-zinc-500">
        Describe an asset to generate its gameplay config and select a matching demo model.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 border border-cyan-300/20 bg-cyan-300/[0.04] px-3 py-1.5 font-mono text-[10px] tracking-wide text-zinc-300">
        <span className="size-1.5 bg-cyan-300" />
        PROMPT → MODEL + METADATA → ZIP
      </div>
    </div>
  )
}

function LoadingOutput({ step }: { step: LoadingStep }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="mb-6 grid size-[68px] place-items-center border border-cyan-400/30 bg-cyan-400/[0.05]">
        <LoaderCircle
          className="animate-spin text-cyan-300"
          size={34}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
      <p className="text-sm font-medium text-zinc-100">
        {step === 'config'
          ? 'Step 1: AI configuring game logic...'
          : 'Step 2: Preparing a matching demo model...'}
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        {step === 'config'
          ? 'Generating the Arcade config from your asset prompt'
          : 'Selecting a bundled model to match your prompt'}
      </p>
      <div className="mt-7 flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 text-[9px] font-medium tracking-[0.06em] ${
            step === 'model' ? 'text-cyan-300' : 'text-zinc-600'
          }`}
        >
          <Cuboid size={13} aria-hidden="true" /> DEMO MODEL
        </span>
        <span className="h-px w-8 bg-white/10" />
        <span
          className={`inline-flex items-center gap-1.5 text-[9px] font-medium tracking-[0.06em] ${
            step === 'config' ? 'text-cyan-300' : 'text-zinc-600'
          }`}
        >
          <FileCode2 size={13} aria-hidden="true" /> CONFIG
        </span>
        <span className="h-px w-8 bg-white/10" />
        <span className="inline-flex items-center gap-1.5 text-[9px] font-medium tracking-[0.06em] text-zinc-600">
          <Layers3 size={13} aria-hidden="true" /> ZIP
        </span>
      </div>
    </div>
  )
}

type SuccessOutputProps = {
  arcadeConfig: ArcadeConfig
  demoModelPath: string
  isDownloading: boolean
  downloadError: string
  onDownload: () => void
}

function SuccessOutput({
  arcadeConfig,
  demoModelPath,
  isDownloading,
  downloadError,
  onDownload,
}: SuccessOutputProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-emerald-200">
        <span className="flex size-5 items-center justify-center border border-emerald-300/30 bg-emerald-300/[0.08]">
          <Check size={12} aria-hidden="true" />
        </span>
        Bundle generated
        <span className="ml-auto inline-flex items-center gap-1 border border-cyan-300/20 px-2 py-1 font-mono text-[9px] font-medium tracking-wider text-cyan-100/80">
          DEMO MODEL
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <ConfigStat label="ASSET TYPE" value={arcadeConfig.type} />
        <ConfigStat label="COLLIDER" value={arcadeConfig.collider} />
        <ConfigStat label="MASS" value={`${arcadeConfig.mass} kg`} />
      </div>

      <div className="flex-1 overflow-hidden border border-cyan-400/30 bg-[#090d10]">
        <div className="flex items-center justify-between border-b border-cyan-400/20 bg-[#10191d] px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-zinc-200">
            <FileCode2 size={14} className="text-cyan-300" aria-hidden="true" />
            Generated config
          </div>
          <span className="border border-cyan-300/20 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-cyan-200">JSON</span>
        </div>
        <pre className="max-h-64 overflow-auto p-4 font-mono text-[11px] leading-6 text-cyan-100/90 sm:text-xs">
          <code>{JSON.stringify(arcadeConfig, null, 2)}</code>
        </pre>
      </div>

      <div className="mt-3 flex items-center gap-2 border-l-2 border-cyan-300/50 bg-white/[0.025] px-3 py-2.5 text-[10px] leading-4 text-zinc-400">
        <CircleHelp size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />
        This bundle uses a pre-made demo model selected to match your prompt.
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <Cuboid size={13} className="text-cyan-300/80" aria-hidden="true" />
          {demoModelPath.split('/').at(-1)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileCode2 size={13} className="text-cyan-300/80" aria-hidden="true" />
          arcade-config.json
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText size={13} className="text-cyan-300/80" aria-hidden="true" />
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
        className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2.5 border border-cyan-200 bg-cyan-300 px-5 text-sm font-black tracking-wide text-[#071114] shadow-[3px_3px_0_#087783] transition-transform hover:-translate-y-0.5 hover:bg-cyan-200 active:translate-y-0.5 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-100 disabled:cursor-wait disabled:opacity-60"
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
    <div className="min-w-0 border border-white/10 bg-[#0a1013] px-3 py-2.5">
      <p className="font-mono text-[9px] font-medium tracking-[0.1em] text-zinc-400">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-[11px] text-zinc-200">
        {value}
      </p>
    </div>
  )
}

export default App
