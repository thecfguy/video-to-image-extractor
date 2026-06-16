import { useState, useRef, useCallback } from 'react'
import VideoUpload from './components/VideoUpload'
import VideoPreview from './components/VideoPreview'
import ConfigPanel from './components/ConfigPanel'
import FrameGallery from './components/FrameGallery'
import { extractFrames } from './utils/frameExtractor'

export default function App() {
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [videoDuration, setVideoDuration] = useState(0)
  const [config, setConfig] = useState({
    mode: 'smart',         // 'smart' | 'count' | 'interval' | 'timestamps' | 'scene' | 'walkthrough'
    frameCount: 10,
    intervalSec: 2,
    timestamps: '',
    startTime: 0,
    endTime: 0,
    format: 'image/jpeg',
    quality: 0.92,
    maxWidth: 0,
    // Scene-change detection
    sceneSampleRate: 0.5,
    sceneThreshold: 20,
    sceneMinGap: 1,
    // Walkthrough mode
    walkthroughSampleRate: 0.25,
    walkthroughMotionThreshold: 8,
    walkthroughSettleTime: 0.75,
    walkthroughMinGap: 3,
    // Smart Capture (recommended): novelty trigger + automatic quality selection
    smartNovelty: 22,          // % visual change vs last kept frame → new capture
    smartMinGap: 1.5,          // min seconds between captures
    smartSampleRate: 0.3,      // probe interval (advanced)
    smartMotionThreshold: 8,   // % diff = camera moving (for stop detection)
    smartSettleTime: 0.6,      // stillness needed to confirm a stop
  })
  const [frames, setFrames] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [extractError, setExtractError] = useState('')
  const [videoIsUrl, setVideoIsUrl] = useState(false)
  const videoRef = useRef(null)

  const handleVideoLoad = useCallback((file) => {
    const url = URL.createObjectURL(file)
    setVideoFile(file)
    setVideoUrl(url)
    setVideoIsUrl(false)
    setFrames([])
  }, [])

  const handleVideoUrl = useCallback((url) => {
    setVideoUrl(url)
    setVideoFile(null)
    setVideoIsUrl(true)
    setFrames([])
  }, [])

  const handleDurationLoad = useCallback((duration) => {
    setVideoDuration(duration)
    setConfig(c => ({ ...c, endTime: Math.floor(duration) }))
  }, [])

  const handleExtract = useCallback(async () => {
    if (!videoRef.current) return
    setExtracting(true)
    setExtractError('')
    setProgress(0)
    setFrames([])
    try {
      const result = await extractFrames(videoRef.current, config, (p) => setProgress(p))
      setFrames(result)
    } catch (e) {
      if (e.message === 'CORS_BLOCKED') {
        setExtractError('Frame extraction blocked by CORS. The video server must send Access-Control-Allow-Origin headers. Download the video and upload it directly to work around this.')
      } else {
        setExtractError(`Extraction failed: ${e.message}`)
      }
    } finally {
      setExtracting(false)
      setProgress(0)
    }
  }, [config])

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 px-6 py-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>
        <div>
          <h1 className="text-base font-semibold leading-none text-white">VideoFrame Extractor</h1>
          <p className="text-xs text-gray-500 mt-0.5">Runs entirely in your browser — nothing is uploaded</p>
        </div>
      </header>

      {/* Body */}
      {!videoUrl ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <VideoUpload onVideoLoad={handleVideoLoad} onVideoUrl={handleVideoUrl} />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Main content — video + gallery, independently scrollable */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              <VideoPreview
                videoUrl={videoUrl}
                isUrl={videoIsUrl}
                videoRef={videoRef}
                onDurationLoad={handleDurationLoad}
                onChangeVideo={() => {
                  setVideoUrl(null)
                  setVideoFile(null)
                  setVideoIsUrl(false)
                  setFrames([])
                }}
              />

              {(extracting || frames.length > 0) && (
                <FrameGallery
                  frames={frames}
                  extracting={extracting}
                  progress={progress}
                  config={config}
                />
              )}
            </div>
          </main>

          {/* Config sidebar — right side */}
          <aside className="w-72 shrink-0 border-l border-gray-800 flex flex-col overflow-hidden">
            <ConfigPanel
              config={config}
              onChange={setConfig}
              videoDuration={videoDuration}
              onExtract={handleExtract}
              extracting={extracting}
              progress={progress}
              frameCount={frames.length}
              extractError={extractError}
            />
          </aside>

        </div>
      )}
    </div>
  )
}
