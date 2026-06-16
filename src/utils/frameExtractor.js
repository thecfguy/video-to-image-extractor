// Small comparison canvas — enough resolution for a reliable diff, fast to process
const DIFF_W = 160
const DIFF_H = 90

/**
 * Seeks a video element to a specific time and resolves when the frame is ready.
 */
function seekTo(video, time) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Seek timeout at ${time}s`)), 8000)
    const onSeeked = () => {
      clearTimeout(timeout)
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
  })
}

/**
 * Capture the current video frame onto a canvas and return a data URL.
 */
function captureFrame(video, format, quality, maxWidth) {
  const canvas = document.createElement('canvas')
  let w = video.videoWidth
  let h = video.videoHeight

  if (maxWidth > 0 && w > maxWidth) {
    h = Math.round(h * (maxWidth / w))
    w = maxWidth
  }

  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, w, h)
  return canvas.toDataURL(format, quality)
}

/**
 * Render current video frame into the shared diff canvas and return grayscale pixel array.
 */
function getGrayscalePixels(video, canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, DIFF_W, DIFF_H)
  let data
  try {
    data = ctx.getImageData(0, 0, DIFF_W, DIFF_H).data
  } catch (e) {
    if (e instanceof DOMException && e.name === 'SecurityError') {
      throw new Error('CORS_BLOCKED')
    }
    throw e
  }
  const gray = new Uint8Array(DIFF_W * DIFF_H)
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])
  }
  return gray
}

/**
 * Compute mean absolute difference between two grayscale pixel arrays.
 * Returns a value in [0, 100] where 100 means every pixel flipped black↔white.
 */
function computeDiff(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return (sum / a.length / 255) * 100
}

/**
 * Sharpness via Laplacian variance over interior pixels.
 * A blurry frame has little edge energy → low variance; a crisp frame → high.
 * Returned value is unbounded (raw), only meaningful relative to other frames
 * of the same video — we normalise to 0–100 after extraction.
 */
function sharpnessScore(gray) {
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < DIFF_H - 1; y++) {
    for (let x = 1; x < DIFF_W - 1; x++) {
      const i = y * DIFF_W + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - DIFF_W] - gray[i + DIFF_W]
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  const mean = sum / n
  return sumSq / n - mean * mean
}

/**
 * Exposure quality in [0, 1]. Penalises frames that are largely clipped
 * (blown-out windows / crushed shadows) or have an extreme average brightness.
 */
function exposureScore(gray) {
  let dark = 0
  let bright = 0
  let sum = 0
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i]
    sum += v
    if (v < 16) dark++
    else if (v > 240) bright++
  }
  const n = gray.length
  const clipped = (dark + bright) / n
  const mean = sum / n
  const centred = 1 - Math.min(1, Math.abs(mean - 128) / 128)
  return Math.max(0, (1 - clipped) * (0.5 + 0.5 * centred))
}

/**
 * Build the list of timestamps to extract based on config.
 */
function buildTimestamps(config, duration) {
  const start = config.startTime ?? 0
  const end = config.endTime > 0 ? config.endTime : duration

  if (config.mode === 'timestamps') {
    return config.timestamps
      .split(',')
      .map(t => parseFloat(t.trim()))
      .filter(t => !isNaN(t) && t >= 0 && t <= duration)
      .sort((a, b) => a - b)
  }

  if (config.mode === 'interval') {
    const times = []
    for (let t = start; t <= end + 0.001; t += config.intervalSec) {
      times.push(Math.min(t, end))
      if (t >= end) break
    }
    return times
  }

  // mode === 'count'
  const count = Math.max(1, config.frameCount)
  if (count === 1) return [start]
  const step = (end - start) / (count - 1)
  return Array.from({ length: count }, (_, i) => start + i * step)
}

/**
 * Extract frames from a video element.
 *
 * @param {HTMLVideoElement} video
 * @param {object} config
 * @param {(progress: number) => void} onProgress
 * @returns {Promise<Array<{dataUrl: string, timestamp: number, diffScore?: number, label?: string, peakDiff?: number}>>}
 */
export async function extractFrames(video, config, onProgress) {
  video.pause()

  if (config.mode === 'smart') return extractBySmart(video, config, onProgress)
  if (config.mode === 'scene') return extractBySceneChange(video, config, onProgress)
  if (config.mode === 'walkthrough') return extractByWalkthrough(video, config, onProgress)

  const duration = video.duration
  const timestamps = buildTimestamps(config, duration)
  const results = []

  for (let i = 0; i < timestamps.length; i++) {
    await seekTo(video, timestamps[i])
    const dataUrl = captureFrame(video, config.format, config.quality, config.maxWidth)
    results.push({ dataUrl, timestamp: timestamps[i] })
    onProgress(((i + 1) / timestamps.length) * 100)
  }

  return results
}

/**
 * Smart Capture — the recommended mode for property walkthroughs.
 *
 * Unifies stop-detection and scene-change into a single "visual novelty" model,
 * then picks the highest-QUALITY frame for each captured moment:
 *
 *  • Probe the video at a fine interval, scoring each frame for sharpness + exposure.
 *  • Keep a short rolling buffer of recent scored frames.
 *  • Capture when EITHER:
 *      – the camera settles after motion (a deliberate STOP), or
 *      – enough new content has entered the frame since the last keep (a panning
 *        REVEAL — e.g. sweeping across a room while still walking).
 *  • Novelty is measured against ALL previously kept frames, not just the most
 *    recent one — so panning back to a wall already photographed (or re-stopping
 *    at the same spot) does NOT produce a near-duplicate.
 *  • For each capture, grab the SHARPEST, best-exposed frame from the buffer
 *    rather than the instantaneous one, so motion blur never makes the cut.
 *
 * The result: hands-off coverage of both paused details and moving room views,
 * with consistently crisp images. Tunable with just two knobs (detail + min gap).
 */
async function extractBySmart(video, config, onProgress) {
  const duration = video.duration
  const start = config.startTime ?? 0
  const end = config.endTime > 0 ? config.endTime : duration

  const sampleRate = config.smartSampleRate
  const novelty = config.smartNovelty            // % change vs last kept frame → reveal capture
  const minGap = config.smartMinGap              // min seconds between captures
  const motionThreshold = config.smartMotionThreshold
  const settleFrames = Math.max(1, Math.ceil(config.smartSettleTime / sampleRate))

  const diffCanvas = document.createElement('canvas')
  diffCanvas.width = DIFF_W
  diffCanvas.height = DIFF_H

  const results = []
  const buffer = []                              // recent probes { t, pixels, score }
  const BUFFER_SIZE = Math.max(4, settleFrames + 3)

  let prevPixels = null
  let lastCaptureTime = -Infinity
  let stillCount = 0
  let wasMoving = false

  const keptSignatures = []          // downsampled pixels of every frame we've kept
  // A capture is suppressed if it looks too much like a STOP we already have.
  // Reveals must clear the full `novelty` bar; stops use a looser dedupe bar.
  const dedupeThreshold = novelty * 0.5

  // Smallest difference between `pixels` and ANY frame already kept (100 if none yet).
  function minDiffToKept(pixels) {
    if (!keptSignatures.length) return 100
    let min = Infinity
    for (const sig of keptSignatures) {
      const d = computeDiff(sig, pixels)
      if (d < min) min = d
    }
    return min
  }

  const totalSteps = Math.ceil((end - start) / sampleRate)
  let step = 0

  // Pick the best-scoring buffered frame newer than the last capture, grab it full-res.
  async function captureBest(label) {
    const fresh = buffer.filter(b => b.t > lastCaptureTime)
    const pool = fresh.length ? fresh : buffer
    let best = pool[0]
    for (const b of pool) if (b.score > best.score) best = b
    await seekTo(video, best.t)
    results.push({
      dataUrl: captureFrame(video, config.format, config.quality, config.maxWidth),
      timestamp: best.t,
      label,
      scoreRaw: best.score,
    })
    lastCaptureTime = best.t
    keptSignatures.push(best.pixels)
  }

  for (let t = start; t <= end + 0.001; t += sampleRate) {
    const seekTime = Math.min(t, end)
    await seekTo(video, seekTime)
    const pixels = getGrayscalePixels(video, diffCanvas)
    const score = sharpnessScore(pixels) * exposureScore(pixels)
    buffer.push({ t: seekTime, pixels, score })
    if (buffer.length > BUFFER_SIZE) buffer.shift()

    if (prevPixels === null) {
      await captureBest('first')
      prevPixels = pixels
      step++
      onProgress((step / totalSteps) * 100)
      if (seekTime >= end) break
      continue
    }

    const motion = computeDiff(prevPixels, pixels)
    const noveltyDiff = minDiffToKept(pixels)   // vs ALL kept frames, not just the last
    const gapOk = seekTime - lastCaptureTime >= minGap

    if (motion > motionThreshold) {
      wasMoving = true
      stillCount = 0
      // REVEAL: the view differs enough from everything kept (panning new content) — grab it.
      if (noveltyDiff >= novelty && gapOk) {
        await captureBest('view')
      }
    } else {
      stillCount++
      // STOP: camera settled after motion — a deliberate pause to show something.
      // Skip it if we already have a near-identical shot (re-stop at the same spot).
      if (wasMoving && stillCount >= settleFrames && gapOk && noveltyDiff >= dedupeThreshold) {
        await captureBest('stop')
        wasMoving = false
      }
    }

    prevPixels = pixels
    step++
    onProgress((step / totalSteps) * 100)
    if (seekTime >= end) break
  }

  // Normalise raw quality scores to a 0–100 badge relative to this video's sharpest frame.
  const maxScore = results.reduce((m, r) => Math.max(m, r.scoreRaw || 0), 0) || 1
  for (const r of results) {
    r.quality = Math.round((100 * (r.scoreRaw || 0)) / maxScore)
    delete r.scoreRaw
  }

  return results
}

/**
 * Scene-change detection: capture frames where the diff between consecutive
 * probes exceeds the threshold (high diff = something changed).
 */
async function extractBySceneChange(video, config, onProgress) {
  const duration = video.duration
  const start = config.startTime ?? 0
  const end = config.endTime > 0 ? config.endTime : duration
  const sampleRate = config.sceneSampleRate
  const threshold = config.sceneThreshold
  const minGap = config.sceneMinGap

  const diffCanvas = document.createElement('canvas')
  diffCanvas.width = DIFF_W
  diffCanvas.height = DIFF_H

  const results = []
  let prevPixels = null
  let lastCaptureTime = -Infinity
  const totalSteps = Math.ceil((end - start) / sampleRate)
  let step = 0

  await seekTo(video, start)
  prevPixels = getGrayscalePixels(video, diffCanvas)
  results.push({ dataUrl: captureFrame(video, config.format, config.quality, config.maxWidth), timestamp: start, diffScore: 0 })
  lastCaptureTime = start

  for (let t = start + sampleRate; t <= end + 0.001; t += sampleRate) {
    const seekTime = Math.min(t, end)
    await seekTo(video, seekTime)

    const currPixels = getGrayscalePixels(video, diffCanvas)
    const diff = computeDiff(prevPixels, currPixels)

    if (diff >= threshold && seekTime - lastCaptureTime >= minGap) {
      results.push({ dataUrl: captureFrame(video, config.format, config.quality, config.maxWidth), timestamp: seekTime, diffScore: Math.round(diff) })
      lastCaptureTime = seekTime
    }

    prevPixels = currPixels
    step++
    onProgress((step / totalSteps) * 100)
    if (seekTime >= end) break
  }

  return results
}

/**
 * Walkthrough mode: capture frames when the camera STOPS moving after a period
 * of motion. Designed for property inspection videos where a contractor walks
 * through rooms and pauses to show specific conditions.
 *
 * State machine:
 *   MOVING  — diff > motionThreshold (camera panning/walking)
 *   STILL   — diff drops below threshold for `settleFrames` consecutive probes
 *
 * Capture fires on the MOVING → STILL transition, not on high diff.
 */
async function extractByWalkthrough(video, config, onProgress) {
  const duration = video.duration
  const start = config.startTime ?? 0
  const end = config.endTime > 0 ? config.endTime : duration

  const sampleRate = config.walkthroughSampleRate
  const motionThreshold = config.walkthroughMotionThreshold
  // How many consecutive still probes are needed before we consider the camera settled
  const settleFrames = Math.max(1, Math.ceil(config.walkthroughSettleTime / sampleRate))
  const minGap = config.walkthroughMinGap

  const diffCanvas = document.createElement('canvas')
  diffCanvas.width = DIFF_W
  diffCanvas.height = DIFF_H

  const results = []
  let prevPixels = null
  let stillCount = 0
  let wasMoving = false
  let peakDiff = 0          // highest diff seen during the current motion phase
  let lastCaptureTime = -Infinity

  const totalSteps = Math.ceil((end - start) / sampleRate)
  let step = 0

  for (let t = start; t <= end + 0.001; t += sampleRate) {
    const seekTime = Math.min(t, end)
    await seekTo(video, seekTime)
    const currPixels = getGrayscalePixels(video, diffCanvas)

    if (prevPixels === null) {
      // Always capture the opening frame
      results.push({ dataUrl: captureFrame(video, config.format, config.quality, config.maxWidth), timestamp: seekTime, label: 'first' })
      lastCaptureTime = seekTime
      prevPixels = currPixels
      step++
      onProgress((step / totalSteps) * 100)
      if (seekTime >= end) break
      continue
    }

    const diff = computeDiff(prevPixels, currPixels)

    if (diff > motionThreshold) {
      // Camera is moving — track peak motion intensity
      wasMoving = true
      stillCount = 0
      peakDiff = Math.max(peakDiff, diff)
    } else {
      stillCount++

      // MOVING → STILL transition: contractor just stopped to show something
      if (wasMoving && stillCount >= settleFrames && seekTime - lastCaptureTime >= minGap) {
        results.push({
          dataUrl: captureFrame(video, config.format, config.quality, config.maxWidth),
          timestamp: seekTime,
          label: 'stop',
          peakDiff: Math.round(peakDiff),
        })
        lastCaptureTime = seekTime
        wasMoving = false
        peakDiff = 0
        stillCount = 0
      }
    }

    prevPixels = currPixels
    step++
    onProgress((step / totalSteps) * 100)
    if (seekTime >= end) break
  }

  return results
}
