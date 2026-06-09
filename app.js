const video = document.getElementById('video');
const sourceCanvas = document.getElementById('sourceCanvas');
const asciiCanvas = document.getElementById('asciiCanvas');
const effectsCanvas = document.getElementById('effectsCanvas');
const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
const asciiCtx = asciiCanvas.getContext('2d');

effectsCanvas.style.display = 'none';

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const uploadBtn = document.getElementById('uploadBtn');
const mediaUpload = document.getElementById('mediaUpload');
const controls = document.getElementById('controls');
const toggleControls = document.getElementById('toggleControls');
const resolutionInput = document.getElementById('resolution');
const charsetSelect = document.getElementById('charset');
const colorModeSelect = document.getElementById('colorMode');
const renderModeSelect = document.getElementById('renderMode');
const overlayModeSelect = document.getElementById('overlayMode');
const camcorderMask = document.getElementById('camcorderMask');
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
const MAX_DIST = 120;
const TARGET_NODE_COUNT = 40;

function resizeOutput() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  asciiCanvas.width = w * dpr;
  asciiCanvas.height = h * dpr;
  asciiCanvas.style.width = w + 'px';
  asciiCanvas.style.height = h + 'px';
  asciiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  vhsOverlay.classList.remove('active');
  camcorderMask.classList.remove('active');
  video.pause();
  video.srcObject = null;
  video.src = '';
  isPhoto = false;
  photoImage = null;
  overlay.classList.remove('hidden');
  controls.classList.add('hidden');
  toggleControls.classList.add('hidden');
  asciiCtx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
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

function distortCoord(gx, gy, cols, rows, strength) {
  if (!strength) return { x: gx, y: gy };
  const cx = cols / 2;
  const cy = rows / 2;
  const dx = gx - cx;
  const dy = gy - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const nr = r / maxR;
  const ns = nr / (1 + strength * nr * nr);
  const rs = ns * maxR;
  const ang = Math.atan2(dy, dx);
  return { x: cx + rs * Math.cos(ang), y: cy + rs * Math.sin(ang) };
}

function distortScreen(sx, sy, sw, sh, strength) {
  if (!strength) return { x: sx, y: sy };
  const scx = sw / 2;
  const scy = sh / 2;
  const scale = Math.min(sw, sh) / 2;
  const dx = (sx - scx) / scale;
  const dy = (sy - scy) / scale;
  const r = Math.sqrt(dx * dx + dy * dy);
  const nr = r / 1.42;
  const ns = nr / (1 + strength * nr * nr);
  const rs = ns * 1.42;
  const ang = Math.atan2(dy, dx);
  return { x: scx + rs * scale * Math.cos(ang), y: scy + rs * scale * Math.sin(ang) };
}

function detectEdges(data, cols, rows, padX, padY, fontSize) {
  const edges = [];
  const threshold = 40;
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = (y * cols + x) * 4;
      const bright = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const ir = (y * cols + (x + 1)) * 4;
      const ib = ((y + 1) * cols + x) * 4;
      const brightR = (data[ir] + data[ir + 1] + data[ir + 2]) / 3;
      const brightB = (data[ib] + data[ib + 1] + data[ib + 2]) / 3;
      const grad = Math.abs(bright - brightR) + Math.abs(bright - brightB);
      if (grad > threshold) {
        edges.push({
          sx: padX + x * fontSize + fontSize / 2,
          sy: padY + y * fontSize + fontSize / 2,
          gx: x, gy: y,
          brightness: bright
        });
      }
    }
  }
  return edges;
}

function updateNodes(edges, cw, ch) {
  if (!edges.length) {
    for (let n of nodes) {
      n.x += (Math.random() - 0.5) * 2;
      n.y += (Math.random() - 0.5) * 2;
    }
    return;
  }
  if (nodes.length === 0) {
    for (let i = 0; i < TARGET_NODE_COUNT; i++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      nodes.push({ x: e.sx, y: e.sy, vx: 0, vy: 0 });
    }
  }
  if (nodes.length > TARGET_NODE_COUNT) {
    nodes.length = TARGET_NODE_COUNT;
  } else if (nodes.length < TARGET_NODE_COUNT) {
    for (let i = nodes.length; i < TARGET_NODE_COUNT; i++) {
      const e = edges[Math.floor(Math.random() * edges.length)];
      nodes.push({ x: e.sx, y: e.sy, vx: 0, vy: 0 });
    }
  }
  for (let n of nodes) {
    let nearestDist = Infinity;
    let nearest = null;
    const sampleCount = Math.min(edges.length, 60);
    for (let k = 0; k < sampleCount; k++) {
      const idx = Math.floor(Math.random() * edges.length);
      const e = edges[idx];
      const dx = n.x - e.sx;
      const dy = n.y - e.sy;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = e;
      }
    }
    if (nearest && nearestDist < (150 * 150)) {
      n.vx += (nearest.sx - n.x) * 0.04;
      n.vy += (nearest.sy - n.y) * 0.04;
    } else {
      const e = edges[Math.floor(Math.random() * edges.length)];
      n.x = e.sx; n.y = e.sy; n.vx = 0; n.vy = 0;
    }
    n.vx *= 0.88;
    n.vy *= 0.88;
    n.x += n.vx;
    n.y += n.vy;
    if (n.x < 0) { n.x = 0; n.vx *= -1; }
    if (n.x > cw) { n.x = cw; n.vx *= -1; }
    if (n.y < 0) { n.y = 0; n.vy *= -1; }
    if (n.y > ch) { n.y = ch; n.vy *= -1; }
  }
}

function drawConstellation(edges, cw, ch, useFisheye) {
  const strength = useFisheye ? 0.35 : 0;
  updateNodes(edges, cw, ch);
  asciiCtx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) {
    const pA = distortScreen(nodes[i].x, nodes[i].y, cw, ch, strength);
    for (let j = i + 1; j < nodes.length; j++) {
      const pB = distortScreen(nodes[j].x, nodes[j].y, cw, ch, strength);
      const dx = pA.x - pB.x;
      const dy = pA.y - pB.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MAX_DIST) {
        asciiCtx.strokeStyle = `rgba(0, 255, 255, ${1 - dist / MAX_DIST})`;
        asciiCtx.beginPath();
        asciiCtx.moveTo(pA.x, pA.y);
        asciiCtx.lineTo(pB.x, pB.y);
        asciiCtx.stroke();
      }
    }
    asciiCtx.fillStyle = 'rgba(0, 255, 255, 0.9)';
    asciiCtx.beginPath();
    asciiCtx.arc(pA.x, pA.y, 2.5, 0, Math.PI * 2);
    asciiCtx.fill();
  }
}

function processFrame(source) {
  const cols = parseInt(resolutionInput.value, 10);
  const charSet = charsets[charsetSelect.value];
  const colorMode = colorModeSelect.value;
  const renderMode = renderModeSelect.value;
  const overlayMode = overlayModeSelect.value;
  const useFisheye = overlayMode === 'camcorder';
  const fStrength = 0.35;

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

  const dpr = window.devicePixelRatio || 1;
  const cw = asciiCanvas.width / dpr;
  const ch = asciiCanvas.height / dpr;
  const fontSize = Math.min(cw / cols, ch / rows);
  const padX = (cw - fontSize * cols) / 2;
  const padY = (ch - fontSize * rows) / 2;

  asciiCtx.fillStyle = '#0d0d0d';
  asciiCtx.fillRect(0, 0, cw, ch);

  if (renderMode !== 'constellation') {
    asciiCtx.font = `${fontSize}px 'Courier New', monospace`;
    asciiCtx.textBaseline = 'top';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = distortCoord(x, y, cols, rows, useFisheye ? fStrength : 0);
        const sx = Math.round(Math.max(0, Math.min(cols - 1, d.x)));
        const sy = Math.round(Math.max(0, Math.min(rows - 1, d.y)));
        const i = (sy * cols + sx) * 4;
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

  if (renderMode !== 'ascii') {
    const edges = detectEdges(data, cols, rows, padX, padY, fontSize);
    drawConstellation(edges, cw, ch, useFisheye);
  }
}

function renderLoop() {
  if (isPhoto) return;
  if (video.paused || video.ended) {
    animationId = requestAnimationFrame(renderLoop);
    return;
  }
  processFrame(video);
  animationId = requestAnimationFrame(renderLoop);
}

function renderPhoto() {
  if (!isPhoto || !photoImage) return;
  processFrame(photoImage);
}

function updateOverlayUI() {
  const mode = overlayModeSelect.value;
  vhsOverlay.classList.toggle('active', mode === 'camcorder');
  camcorderMask.classList.toggle('active', mode === 'camcorder');
  if (mode === 'camcorder' && (stream || isPhoto)) {
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
  if (isPhoto) renderPhoto();
});

renderModeSelect.addEventListener('change', () => {
  if (isPhoto) renderPhoto();
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
