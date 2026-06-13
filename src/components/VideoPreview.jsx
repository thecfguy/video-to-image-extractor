import { useEffect, useState } from 'react'

function fmtTime(sec) {
  if (!sec || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function VideoPreview({ videoUrl, isUrl, videoRef, onDurationLoad, onChangeVideo }) {
  const [corsError, setCorsError] = useState(false)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onMeta = () => {
      setDuration(el.duration)
      onDurationLoad(el.duration)
    }
    el.addEventListener('loadedmetadata', onMeta)
    if (el.readyState >= 1) onMeta()
    return () => el.removeEventListener('loadedmetadata', onMeta)
  }, [videoUrl, videoRef, onDurationLoad])

  return (
    <div className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        crossOrigin={isUrl ? 'anonymous' : undefined}
        className="w-full aspect-video object-contain bg-black"
        onLoadStart={() => setCorsError(false)}
        onError={() => isUrl && setCorsError(true)}
      />

      {corsError && (
        <div className="px-4 py-3 bg-amber-950/40 border-t border-amber-800/40 flex items-start gap-2.5">
          <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-amber-400">Video blocked by CORS policy</p>
            <p className="text-xs text-amber-700 mt-0.5">
              The server doesn't allow cross-origin access. Download the video and use "Upload File" instead.
            </p>
          </div>
        </div>
      )}

      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Duration: <span className="text-gray-300 font-medium">{duration ? fmtTime(duration) : '—'}</span>
        </span>
        <button
          onClick={onChangeVideo}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Change video
        </button>
      </div>
    </div>
  )
}
