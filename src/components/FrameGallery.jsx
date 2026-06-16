import { useState, useCallback, useEffect, useRef } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

const EXT_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec % 1) * 100)
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

function FrameBadge({ frame }) {
  if (frame.label) {
    // Quality suffix (Smart mode) or peak-motion suffix (legacy walkthrough)
    const suffix = frame.quality != null ? ` · ${frame.quality}%`
      : frame.peakDiff != null ? ` (${frame.peakDiff}%)`
      : ''

    if (frame.label === 'first') {
      return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none bg-gray-700 text-gray-300">start{suffix}</span>
    }
    if (frame.label === 'view') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none bg-violet-600 text-white">
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          view{suffix}
        </span>
      )
    }
    // 'stop'
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none bg-emerald-600 text-white">
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        stop{suffix}
      </span>
    )
  }
  if (frame.diffScore != null) {
    return (
      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${
        frame.diffScore === 0 ? 'bg-gray-700 text-gray-400'
        : frame.diffScore >= 40 ? 'bg-red-600 text-white'
        : frame.diffScore >= 20 ? 'bg-amber-500 text-white'
        : 'bg-indigo-600 text-white'
      }`}>
        {frame.diffScore === 0 ? 'first' : `Δ${frame.diffScore}%`}
      </span>
    )
  }
  return null
}

function NavButton({ onClick, disabled, direction }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="absolute top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-gray-900/80 border border-gray-700 hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all flex items-center justify-center text-white backdrop-blur-sm"
      style={{ [direction === 'left' ? 'left' : 'right']: '12px' }}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d={direction === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}

function Lightbox({ frames, index, ext, onClose, onNavigate, onDownload }) {
  const frame = frames[index]
  const activeThumbRef = useRef(null)

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft')  onNavigate(index - 1)
      else if (e.key === 'ArrowRight') onNavigate(index + 1)
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, onNavigate, onClose])

  // Keep active thumbnail visible in filmstrip
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [index])

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-800"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <FrameBadge frame={frame} />
          <span className="text-xs font-mono text-gray-400">{fmtTime(frame.timestamp)}</span>
        </div>

        <span className="text-sm font-medium text-gray-400 tabular-nums">
          {index + 1} <span className="text-gray-600">/</span> {frames.length}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onDownload(frame, index)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors flex items-center justify-center"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0 px-14"
        onClick={e => e.stopPropagation()}
      >
        <NavButton direction="left"  onClick={() => onNavigate(index - 1)} disabled={index === 0} />

        <img
          key={index}
          src={frame.dataUrl}
          alt={`Frame at ${fmtTime(frame.timestamp)}`}
          className="max-h-full max-w-full object-contain rounded select-none"
          draggable={false}
        />

        <NavButton direction="right" onClick={() => onNavigate(index + 1)} disabled={index === frames.length - 1} />

        {/* Keyboard hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[10px] text-gray-700 pointer-events-none select-none">
          <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-500 font-mono">←</kbd>
          <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-500 font-mono">→</kbd>
          <span>navigate</span>
          <span className="mx-1 text-gray-800">·</span>
          <kbd className="px-1 py-0.5 rounded bg-gray-800 text-gray-500 font-mono">Esc</kbd>
          <span>close</span>
        </div>
      </div>

      {/* Filmstrip */}
      <div
        className="scrollbar-none shrink-0 h-[72px] border-t border-gray-800 bg-black/60 flex items-center gap-1.5 overflow-x-auto px-3 py-2"
        onClick={e => e.stopPropagation()}
      >
        {frames.map((f, i) => (
          <button
            key={i}
            ref={i === index ? activeThumbRef : null}
            onClick={() => onNavigate(i)}
            className={`shrink-0 h-full aspect-video rounded overflow-hidden border-2 transition-all ${
              i === index
                ? 'border-indigo-500 opacity-100 scale-105'
                : 'border-transparent opacity-40 hover:opacity-70'
            }`}
          >
            <img
              src={f.dataUrl}
              alt=""
              className="w-full h-full object-contain bg-gray-900"
              draggable={false}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 animate-pulse">
      <div className="aspect-video bg-gray-800" />
      <div className="p-2">
        <div className="h-3 bg-gray-800 rounded w-2/3" />
      </div>
    </div>
  )
}

export default function FrameGallery({ frames, extracting, progress, config }) {
  const [zipping, setZipping] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const ext = EXT_MAP[config.format] ?? 'jpg'

  const navigate = useCallback((idx) => {
    setSelectedIdx(Math.max(0, Math.min(idx, frames.length - 1)))
  }, [frames.length])

  const downloadOne = useCallback((frame, index) => {
    const a = document.createElement('a')
    a.href = frame.dataUrl
    a.download = `frame_${String(index + 1).padStart(4, '0')}_${frame.timestamp.toFixed(2)}s.${ext}`
    a.click()
  }, [ext])

  const downloadAll = useCallback(async () => {
    if (frames.length === 0) return
    setZipping(true)
    const zip = new JSZip()
    frames.forEach((frame, i) => {
      const base64 = frame.dataUrl.split(',')[1]
      zip.file(`frame_${String(i + 1).padStart(4, '0')}_${frame.timestamp.toFixed(2)}s.${ext}`, base64, { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `frames_${ext}.zip`)
    setZipping(false)
  }, [frames, ext])

  return (
    <div className="space-y-4">
      {/* Gallery header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">
            {extracting
              ? (config.mode === 'smart' || config.mode === 'walkthrough' ? 'Scanning video…' : 'Extracting frames…')
              : `${frames.length} Frame${frames.length !== 1 ? 's' : ''} Extracted`}
          </h2>
          {extracting && (
            <p className="text-xs text-gray-500 mt-0.5">{Math.round(progress)}% scanned</p>
          )}
          {!extracting && frames.length > 0 && config.mode === 'smart' && (
            <p className="text-xs text-gray-500 mt-0.5">
              {frames.filter(f => f.label === 'stop').length} stops · {frames.filter(f => f.label === 'view').length} reveals
            </p>
          )}
          {!extracting && frames.length > 0 && config.mode === 'walkthrough' && (
            <p className="text-xs text-gray-500 mt-0.5">
              {frames.filter(f => f.label === 'stop').length} stops detected
            </p>
          )}
        </div>
        {frames.length > 0 && !extracting && (
          <button
            onClick={downloadAll}
            disabled={zipping}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm font-medium text-white transition-colors border border-gray-700"
          >
            {zipping ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Zipping…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download All (.zip)
              </>
            )}
          </button>
        )}
      </div>

      {/* Thumbnail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {frames.map((frame, i) => (
          <div
            key={i}
            className="group bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-indigo-500/50 transition-colors cursor-pointer"
            onClick={() => setSelectedIdx(i)}
          >
            <div className="relative aspect-video bg-black">
              <img
                src={frame.dataUrl}
                alt={`Frame at ${fmtTime(frame.timestamp)}`}
                className="w-full h-full object-contain"
                loading="lazy"
              />
              {/* Badge */}
              <div className="absolute top-1.5 left-1.5">
                <FrameBadge frame={frame} />
              </div>
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <svg className="w-6 h-6 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </div>
            </div>
            <div className="px-2.5 py-2 flex items-center justify-between">
              <span className="text-xs text-gray-400 font-mono">{fmtTime(frame.timestamp)}</span>
              <button
                onClick={e => { e.stopPropagation(); downloadOne(frame, i) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white"
                title="Download frame"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {extracting && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)}
      </div>

      {/* Lightbox */}
      {selectedIdx !== null && (
        <Lightbox
          frames={frames}
          index={selectedIdx}
          ext={ext}
          onClose={() => setSelectedIdx(null)}
          onNavigate={navigate}
          onDownload={downloadOne}
        />
      )}
    </div>
  )
}
