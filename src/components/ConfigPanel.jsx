import { useMemo } from 'react'

const FORMATS = [
  { value: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { value: 'image/png', label: 'PNG', ext: 'png' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
]

const MAX_WIDTHS = [
  { value: 0, label: 'Original' },
  { value: 3840, label: '4K (3840px)' },
  { value: 1920, label: 'FHD (1920px)' },
  { value: 1280, label: 'HD (1280px)' },
  { value: 854, label: '480p (854px)' },
  { value: 640, label: '360p (640px)' },
]

function fmtDuration(sec) {
  if (!sec || isNaN(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Label({ children }) {
  return <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">{children}</label>
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</p>
      {children}
    </div>
  )
}

export default function ConfigPanel({ config, onChange, videoDuration, onExtract, extracting, progress, frameCount, extractError }) {
  const set = (key, value) => onChange(c => ({ ...c, [key]: value }))

  const estimatedFrames = useMemo(() => {
    if (config.mode === 'count') return config.frameCount
    if (config.mode === 'interval') {
      const range = (config.endTime || videoDuration) - config.startTime
      return Math.max(1, Math.floor(range / config.intervalSec) + 1)
    }
    if (config.mode === 'timestamps') {
      return config.timestamps.split(',').filter(t => t.trim() !== '').length
    }
    if (config.mode === 'scene') {
      const range = (config.endTime || videoDuration) - config.startTime
      return `≤ ${Math.ceil(range / config.sceneMinGap)}`
    }
    if (config.mode === 'walkthrough') return 'auto'
    return 0
  }, [config, videoDuration])

  const needsQuality = config.format !== 'image/png'

  return (
    <div className="flex flex-col h-full">
    {/* Scrollable settings */}
    <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-6">
      <Section title="Extraction Mode">
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5 bg-gray-800 rounded-xl p-1">
            {[
              { value: 'count', label: 'By Count' },
              { value: 'interval', label: 'By Interval' },
              { value: 'timestamps', label: 'Manual' },
              { value: 'scene', label: '⚡ Scene Change' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => set('mode', opt.value)}
                className={`text-xs font-medium py-1.5 px-2 rounded-lg transition-colors ${
                  config.mode === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Walkthrough as a full-width highlighted mode */}
          <button
            onClick={() => set('mode', 'walkthrough')}
            className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 border ${
              config.mode === 'walkthrough'
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : 'border-emerald-800/50 text-emerald-400 hover:bg-emerald-900/30'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Property Walkthrough
          </button>
        </div>

        {config.mode === 'count' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Frame Count</Label>
              <span className="text-sm font-semibold text-indigo-400">{config.frameCount}</span>
            </div>
            <input
              type="range" min={1} max={200} step={1}
              value={config.frameCount}
              onChange={e => set('frameCount', Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-gray-600">
              <span>1</span><span>50</span><span>100</span><span>200</span>
            </div>
          </div>
        )}

        {config.mode === 'interval' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Interval (seconds)</Label>
              <span className="text-sm font-semibold text-indigo-400">{config.intervalSec}s</span>
            </div>
            <input
              type="range" min={0.5} max={30} step={0.5}
              value={config.intervalSec}
              onChange={e => set('intervalSec', Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-gray-600">
              <span>0.5s</span><span>10s</span><span>20s</span><span>30s</span>
            </div>
          </div>
        )}

        {config.mode === 'timestamps' && (
          <div className="space-y-1.5">
            <Label>Timestamps (seconds, comma-separated)</Label>
            <textarea
              rows={3}
              value={config.timestamps}
              onChange={e => set('timestamps', e.target.value)}
              placeholder="e.g. 0, 5.5, 12, 30, 60"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        )}

        {config.mode === 'scene' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-indigo-950/40 border border-indigo-800/40 px-3 py-2.5 text-xs text-indigo-300 leading-relaxed">
              Probes the video at regular intervals, compares consecutive frames pixel-by-pixel,
              and captures only when significant visual change is detected.
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sample Rate</Label>
                <span className="text-sm font-semibold text-indigo-400">every {config.sceneSampleRate}s</span>
              </div>
              <input
                type="range" min={0.1} max={5} step={0.1}
                value={config.sceneSampleRate}
                onChange={e => set('sceneSampleRate', Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>0.1s (precise)</span><span>5s (fast)</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sensitivity</Label>
                <span className="text-sm font-semibold text-indigo-400">{config.sceneThreshold}% diff</span>
              </div>
              <input
                type="range" min={2} max={60} step={1}
                value={config.sceneThreshold}
                onChange={e => set('sceneThreshold', Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>2% (very sensitive)</span><span>60% (cuts only)</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Min Gap Between Captures</Label>
                <span className="text-sm font-semibold text-indigo-400">{config.sceneMinGap}s</span>
              </div>
              <input
                type="range" min={0.5} max={30} step={0.5}
                value={config.sceneMinGap}
                onChange={e => set('sceneMinGap', Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>0.5s</span><span>30s</span>
              </div>
            </div>
          </div>
        )}
        {config.mode === 'walkthrough' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/40 px-3 py-2.5 text-xs text-emerald-300 leading-relaxed">
              Captures a frame each time the camera <span className="font-semibold">stops moving</span> after motion —
              ideal for contractors who walk and pause to show room conditions.
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Motion Sensitivity</Label>
                <span className="text-sm font-semibold text-emerald-400">{config.walkthroughMotionThreshold}%</span>
              </div>
              <input
                type="range" min={2} max={30} step={1}
                value={config.walkthroughMotionThreshold}
                onChange={e => set('walkthroughMotionThreshold', Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>2% (hair-trigger)</span><span>30% (big moves only)</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Settle Time</Label>
                <span className="text-sm font-semibold text-emerald-400">{config.walkthroughSettleTime}s still</span>
              </div>
              <input
                type="range" min={0.25} max={3} step={0.25}
                value={config.walkthroughSettleTime}
                onChange={e => set('walkthroughSettleTime', Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>0.25s (quick pause)</span><span>3s (deliberate stop)</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Min Gap Between Captures</Label>
                <span className="text-sm font-semibold text-emerald-400">{config.walkthroughMinGap}s</span>
              </div>
              <input
                type="range" min={1} max={30} step={0.5}
                value={config.walkthroughMinGap}
                onChange={e => set('walkthroughMinGap', Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>1s</span><span>30s</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sample Rate</Label>
                <span className="text-sm font-semibold text-emerald-400">every {config.walkthroughSampleRate}s</span>
              </div>
              <input
                type="range" min={0.1} max={1} step={0.05}
                value={config.walkthroughSampleRate}
                onChange={e => set('walkthroughSampleRate', Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-gray-600">
                <span>0.1s (precise)</span><span>1s (faster)</span>
              </div>
            </div>
          </div>
        )}
      </Section>

      {(config.mode === 'count' || config.mode === 'interval' || config.mode === 'scene' || config.mode === 'walkthrough') && videoDuration > 0 && (
        <Section title="Time Range">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start</Label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={config.endTime - 1} step={1}
                  value={config.startTime}
                  onChange={e => set('startTime', Math.min(Number(e.target.value), config.endTime - 1))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-xs text-gray-500 shrink-0">sec</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>End</Label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={config.startTime + 1} max={Math.floor(videoDuration)} step={1}
                  value={config.endTime}
                  onChange={e => set('endTime', Math.max(Number(e.target.value), config.startTime + 1))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-xs text-gray-500 shrink-0">sec</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            Range: {fmtDuration(config.endTime - config.startTime)} of {fmtDuration(videoDuration)}
          </p>
        </Section>
      )}

      <Section title="Output Format">
        <div className="grid grid-cols-3 gap-1.5 bg-gray-800 rounded-xl p-1">
          {FORMATS.map(f => (
            <button
              key={f.value}
              onClick={() => set('format', f.value)}
              className={`text-xs font-medium py-1.5 rounded-lg transition-colors ${
                config.format === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {needsQuality && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Quality</Label>
              <span className="text-sm font-semibold text-indigo-400">{Math.round(config.quality * 100)}%</span>
            </div>
            <input
              type="range" min={0.1} max={1} step={0.01}
              value={config.quality}
              onChange={e => set('quality', Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
        )}
      </Section>

      <Section title="Resize">
        <select
          value={config.maxWidth}
          onChange={e => set('maxWidth', Number(e.target.value))}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          {MAX_WIDTHS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Section>

    </div>{/* end scrollable settings */}

    {/* Pinned footer — always visible */}
    <div className="shrink-0 border-t border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Estimated frames</span>
        <span className="font-semibold text-gray-300">{estimatedFrames}</span>
      </div>

      {extracting && (
        <div className="space-y-1.5">
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-center text-gray-500">{Math.round(progress)}%</p>
        </div>
      )}

      <button
        onClick={onExtract}
        disabled={extracting}
        className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
      >
        {extracting ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Extracting…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Extract Frames
          </>
        )}
      </button>

      {extractError && (
        <p className="text-xs text-red-400 leading-relaxed">{extractError}</p>
      )}
      {frameCount > 0 && !extracting && !extractError && (
        <p className="text-xs text-center text-gray-500">
          {frameCount} frame{frameCount !== 1 ? 's' : ''} extracted
        </p>
      )}
    </div>
    </div>
  )
}
