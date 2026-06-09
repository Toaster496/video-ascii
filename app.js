const video = document.getElementById('video');
const sourceCanvas = document.getElementById('sourceCanvas');
const asciiCanvas = document.getElementById('asciiCanvas');
const effectsCanvas = document.getElementById('effectsCanvas');
const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
const asciiCtx = asciiCanvas.getContext('2d');
const effectsCtx = effectsCanvas.getContext('2d');

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const uploadBtn = document.getElementById('uploadBtn');
const mediaUpload = document.getElementById('mediaUpload');
const controls = document.getElementById('controls');
const toggleControls = document.getElementById('toggleControls');
const resolutionInput = document.getElementById('resolution');
const charsetSelect = document.getElementById('charset');
const colorModeSelect = document.getElementById('colorMode');
const overlayModeSelect = document.getElementById('overlayMode');
const flipBtn = document.getElementById('flipBtn');
const fsBtn = document.getElementById('fsBtn');
const snapshotBtn = document.getElementById('snapshotBtn');
const stopBtn = document.getElementById('stopBtn');
const recordBtn = document.getElementById('recordBtn');
const vhsOverlay = document.getElementById('vhsOverlay');
const recDot = document.getElementById('recDot');
const hudDate = document.getElementById('hudDate');
const recordTimer = document.getElementById('recordTimer');

const charsets = {
  standard: ' .:-=+*#%@',
  detailed: " .'`^\"\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  binary: ' 01'
};

let stream = null;
let animationId = null;
let effectsRafId = null;
let facingMode = 'environment';
let isPhoto = false;
let photoImage = null;
let controlsVisible = true;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordInterval = null;
let recordStart = 0;

const nodes = [];
const NODE_COUNT = 30;
const MAX_DIST = 120;

function initNodes() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  nodes.length = 0;
  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2
    });
  }
}

function resizeOutput() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  [asciiCanvas, effectsCanvas].forEach(c => {
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = w + 'px';
    c.style.height = h + 'px';
  });
  asciiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  effectsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  initNodes();
}

window.addEventListener('resize', resizeOutput);
resizeOutput();

async function startCamera() {
  try {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    isPhoto = false;
    photoImage = null;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    video.src = '';
    video.loop = false;
    await video.play();
    showInterface();
    renderLoop();
  } catch (err) {
    alert('Camera access denied or not available: ' + err.message);
  }
}

function showInterface() {
  overlay.classList.add('hidden');
  controls.classList.remove('hidden');
  toggleControls.classList.remove('hidden');
  updateOverlayUI();
}

function stopRender() {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  stopRecording();
  stopEffectsLoop();
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  vhsOverlay.classList.remove('active');
  video.pause();
  video.srcObject = null;
  video.src = '';
  isPhoto = false;
  photoImage = null;
  overlay.classList.remove('hidden');
  controls.classList.add('hidden');
  toggleControls.classList.add('hidden');
  asciiCtx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
  effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
}

function getCharIndex(brightness, max) {
  return Math.floor((brightness / 255) * (max - 1));
}

function asciiFillStyle(r, g, b, brightness, colorMode) {
  if (colorMode === 'color') {
    return `rgb(${r},${g},${b})`;
  } else if (colorMode === 'green') {
    const gval = Math.round(brightness);
    return `rgb(0,${gval},0)`;
  } else if (colorMode === 'sepia') {
    const tr = Math.min(255, Math.round(0.393 * r + 0.769 * g + 0.189 * b));
    const tg = Math.min(255, Math.round(0.349 * r + 0.686 * g + 0.168 * b));
    const tb = Math.min(255, Math.round(0.272 * r + 0.534 * g + 0.131 * b));
    return `rgb(${tr},${tg},${tb})`;
  } else {
    const c = Math.round(brightness);
    return `rgb(${c},${c},${c})`;
  }
}

function renderAscii(source) {
  const cols = parseInt(resolutionInput.value, 10);
  const charSet = charsets[charsetSelect.value];
  const colorMode = colorModeSelect.value;

  let vWidth = source.videoWidth;
  let vHeight = source.videoHeight;
  if (!vWidth || !vHeight) {
    vWidth = source.naturalWidth || source.width;
    vHeight = source.naturalHeight || source.height;
  }
  if (!vWidth || !vHeight) return;

  const aspect = vHeight / vWidth;
  const rows = Math.floor(cols * aspect * 0.55);

  sourceCanvas.width = cols;
  sourceCanvas.height = rows;
  sourceCtx.drawImage(source, 0, 0, cols, rows);

  const imageData = sourceCtx.getImageData(0, 0, cols, rows);
  const data = imageData.data;

  const cw = asciiCanvas.width / (window.devicePixelRatio || 1);
  const ch = asciiCanvas.height / (window.devicePixelRatio || 1);
  const fontW = cw / cols;
  const fontH = ch / rows;
  const fontSize = Math.min(fontW, fontH);
  const padX = (cw - fontSize * cols) / 2;
  const padY = (ch - fontSize * rows) / 2;

  asciiCtx.fillStyle = '#0d0d0d';
  asciiCtx.fillRect(0, 0, cw, ch);
  asciiCtx.font = `${fontSize}px 'Courier New', monospace`;
  asciiCtx.textBaseline = 'top';

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
      const charIndex = getCharIndex(brightness, charSet.length);
      const char = charSet[charIndex] || charSet[charSet.length - 1];
      asciiCtx.fillStyle = asciiFillStyle(r, g, b, brightness, colorMode);
      asciiCtx.fillText(char, padX + x * fontSize, padY + y * fontSize);
    }
  }
}

function renderLoop() {
  if (isPhoto) return;
  if (video.paused || video.ended) {
    animationId = requestAnimationFrame(renderLoop);
    return;
  }
  renderAscii(video);
  animationId = requestAnimationFrame(renderLoop);
}

function renderPhoto() {
  if (!isPhoto || !photoImage) return;
  renderAscii(photoImage);
}

function drawConstellation() {
  const dpr = window.devicePixelRatio || 1;
  const w = effectsCanvas.width / dpr;
  const h = effectsCanvas.height / dpr;
  effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);

  for (let n of nodes) {
    n.x += n.vx;
    n.y += n.vy;
    if (n.x < 0 || n.x > w) n.vx *= -1;
    if (n.y < 0 || n.y > h) n.vy *= -1;
  }

  effectsCtx.fillStyle = 'rgba(0, 255, 255, 0.9)';
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MAX_DIST) {
        effectsCtx.strokeStyle = `rgba(0, 255, 255, ${1 - dist / MAX_DIST})`;
        effectsCtx.lineWidth = 1;
        effectsCtx.beginPath();
        effectsCtx.moveTo(a.x, a.y);
        effectsCtx.lineTo(b.x, b.y);
        effectsCtx.stroke();
      }
    }
    effectsCtx.beginPath();
    effectsCtx.arc(a.x, a.y, 2, 0, Math.PI * 2);
    effectsCtx.fill();
  }
}

function startEffectsLoop() {
  if (effectsRafId) return;
  function tick() {
    const mode = overlayModeSelect.value;
    if (mode === 'constellation') {
      drawConstellation();
    } else {
      effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
    }
    effectsRafId = requestAnimationFrame(tick);
  }
  effectsRafId = requestAnimationFrame(tick);
}

function stopEffectsLoop() {
  if (effectsRafId) cancelAnimationFrame(effectsRafId);
  effectsRafId = null;
  effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
}

function updateOverlayUI() {
  const mode = overlayModeSelect.value;
  vhsOverlay.classList.toggle('active', mode === 'camcorder');
  if (mode === 'camcorder' && stream) {
    recDot.classList.remove('hidden');
  } else {
    recDot.classList.add('hidden');
  }
  recordTimer.classList.toggle('hidden', !isRecording);
  asciiCanvas.style.filter = mode === 'camcorder' ? 'contrast(1.1) brightness(0.95) saturate(0.8)' : '';
}

function updateHudDate() {
  const now = new Date();
  hudDate.textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour12: false });
}

setInterval(updateHudDate, 1000);
updateHudDate();

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  const cs = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
  return `${m}:${s}.${cs}`;
}

function startRecording() {
  if (isRecording) return;
  if (!asciiCanvas.captureStream) {
    alert('Recording is not supported in this browser.');
    return;
  }

  const canvasStream = asciiCanvas.captureStream(30);
  const mimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4'
  ];
  const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

  try {
    mediaRecorder = mimeType
      ? new MediaRecorder(canvasStream, { mimeType })
      : new MediaRecorder(canvasStream);
  } catch (e) {
    alert('Recording is not supported in this browser.');
    return;
  }

  recordedChunks = [];
  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
    const ext = blob.type.endsWith('mp4') ? '.mp4' : '.webm';
    saveBlob(blob, 'ascii-video-' + Date.now(), ext);
  };

  mediaRecorder.start(100);
  isRecording = true;
  recordBtn.classList.add('recording');
  recordBtn.title = 'Stop Recording';
  recordStart = Date.now();
  recordInterval = setInterval(() => {
    recordTimer.textContent = formatTime(Date.now() - recordStart);
  }, 100);
  updateOverlayUI();
}

function stopRecording() {
  if (!isRecording) return;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  recordBtn.classList.remove('recording');
  recordBtn.title = 'Record Video';
  clearInterval(recordInterval);
  recordInterval = null;
  recordTimer.textContent = '';
  updateOverlayUI();
}

function saveBlob(blob, filenameBase, ext) {
  const filename = `${filenameBase}${ext}`;
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'ASCII Video' }).catch(() => {});
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function saveCanvasImage(canvas, filenameBase) {
  canvas.toBlob(blob => {
    if (!blob) return;
    const file = new File([blob], `${filenameBase}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'ASCII Art' }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenameBase}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, 'image/png');
}

startBtn.addEventListener('click', startCamera);

uploadBtn.addEventListener('click', () => mediaUpload.click());

mediaUpload.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const isImage = file.type.startsWith('image/');
  const url = URL.createObjectURL(file);

  if (isImage) {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.pause();
    video.srcObject = null;
    video.src = '';

    const img = new Image();
    img.onload = () => {
      isPhoto = true;
      photoImage = img;
      showInterface();
      renderPhoto();
    };
    img.src = url;
  } else {
    isPhoto = false;
    photoImage = null;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
    video.src = url;
    video.loop = true;
    video.play();
    showInterface();
    renderLoop();
  }
});

flipBtn.addEventListener('click', () => {
  if (isPhoto) return;
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  startCamera();
});

fsBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
});

snapshotBtn.addEventListener('click', () => {
  saveCanvasImage(asciiCanvas, 'ascii-art-' + Date.now());
});

recordBtn.addEventListener('click', () => {
  if (isRecording) stopRecording();
  else startRecording();
});

stopBtn.addEventListener('click', stopRender);

toggleControls.addEventListener('click', () => {
  controlsVisible = !controlsVisible;
  controls.classList.toggle('hidden', !controlsVisible);
});

overlayModeSelect.addEventListener('change', () => {
  updateOverlayUI();
  if (overlayModeSelect.value === 'constellation') {
    startEffectsLoop();
  } else {
    stopEffectsLoop();
  }
});

[resolutionInput, charsetSelect, colorModeSelect].forEach(el => {
  el.addEventListener('input', () => {
    if (isPhoto) renderPhoto();
  });
  el.addEventListener('change', () => {
    if (isPhoto) renderPhoto();
  });
});

overlay.addEventListener('click', e => {
  if (e.target === overlay) overlay.classList.remove('active');
});

const recordFormats = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4'
];
const canRecord = !!(
  asciiCanvas.captureStream &&
  typeof MediaRecorder !== 'undefined' &&
  recordFormats.some(f => MediaRecorder.isTypeSupported(f))
);
if (!canRecord) {
  recordBtn.style.display = 'none';
}
