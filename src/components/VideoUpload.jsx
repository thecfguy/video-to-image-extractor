import { useCallback, useState } from 'react'

export default function VideoUpload({ onVideoLoad, onVideoUrl }) {
  const [tab, setTab] = useState('upload')
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState('')
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setFileError('Please upload a valid video file.')
      return
    }
    setFileError('')
    onVideoLoad(file)
  }, [onVideoLoad])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const handleUrlSubmit = (e) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setUrlError('Enter a valid URL starting with http:// or https://')
      return
    }
    setUrlError('')
    onVideoUrl(trimmed)
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 py-12 px-6">
      <div className="w-full max-w-xl space-y-4">
        {/* Tab switcher */}
        <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
          {[
            { key: 'upload', label: 'Upload File' },
            { key: 'url',    label: 'From URL' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setFileError(''); setUrlError('') }}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                tab === t.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'upload' ? (
          <>
            <label
              htmlFor="video-input"
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              className={`w-full border-2 border-dashed rounded-2xl p-14 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
                dragging
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-gray-700 bg-gray-900 hover:border-indigo-500/60 hover:bg-gray-800/60'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center">
                <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-white">Drop your video here</p>
                <p className="text-sm text-gray-400 mt-1">or click to browse</p>
              </div>
              <p className="text-xs text-gray-600">MP4, WebM, MOV, MKV, AVI</p>
              <input id="video-input" type="file" accept="video/*" className="hidden"
                onChange={e => handleFile(e.target.files[0])} />
            </label>
            {fileError && <p className="text-sm text-red-400 text-center">{fileError}</p>}
          </>
        ) : (
          <div className="space-y-3">
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>

              <form onSubmit={handleUrlSubmit} className="space-y-3">
                <input
                  type="url"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setUrlError('') }}
                  placeholder="https://example.com/video.mp4"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
                >
                  Load Video
                </button>
              </form>

              {urlError && <p className="text-sm text-red-400 text-center">{urlError}</p>}
            </div>

            {/* What works / doesn't */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-3 space-y-1.5">
                <p className="font-semibold text-emerald-400">Works</p>
                {['Direct .mp4 / .webm links', 'S3 / GCS (CORS enabled)', 'Cloudinary, Bunny CDN', 'Dropbox (change dl=0 → dl=1)'].map(s => (
                  <p key={s} className="text-emerald-700 flex items-start gap-1">
                    <span className="mt-0.5">✓</span>{s}
                  </p>
                ))}
              </div>
              <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-3 space-y-1.5">
                <p className="font-semibold text-red-400">Won't work</p>
                {['YouTube / Vimeo links', 'HTML pages (not video files)', 'Private / login-gated URLs', 'No CORS headers on server'].map(s => (
                  <p key={s} className="text-red-800 flex items-start gap-1">
                    <span className="mt-0.5">✗</span>{s}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
