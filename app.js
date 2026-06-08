const video = document.getElementById('video');
const sourceCanvas = document.getElementById('sourceCanvas');
const asciiCanvas = document.getElementById('asciiCanvas');
const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
const asciiCtx = asciiCanvas.getContext('2d');

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const uploadBtn = document.getElementById('uploadBtn');
const videoUpload = document.getElementById('videoUpload');
const controls = document.getElementById('controls');
const toggleControls = document.getElementById('toggleControls');
const resolutionInput = document.getElementById('resolution');
const charsetSelect = document.getElementById('charset');
const colorModeSelect = document.getElementById('colorMode');
const flipBtn = document.getElementById('flipBtn');
const fsBtn = document.getElementById('fsBtn');
const snapshotBtn = document.getElementById('snapshotBtn');
const stopBtn = document.getElementById('stopBtn');

const charsets = {
  standard: ' .:-=+*#%@',
  detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  binary: ' 01'
};

let stream = null;
let animationId = null;
let facingMode = 'environment';
let isVideoFile = false;
let controlsVisible = true;

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
    isVideoFile = false;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    await video.play();
    startRender();
  } catch (err) {
    alert('Camera access denied or not available: ' + err.message);
  }
}

function startRender() {
  overlay.classList.add('hidden');
  controls.classList.remove('hidden');
  toggleControls.classList.remove('hidden');
  renderLoop();
}

function stopRender() {
  if (animationId) cancelAnimationFrame(animationId);
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.pause();
  video.srcObject = null;
  video.src = '';
  overlay.classList.remove('hidden');
  controls.classList.add('hidden');
  toggleControls.classList.add('hidden');
  asciiCtx.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
}

function getCharIndex(brightness, max) {
  return Math.floor((brightness / 255) * (max - 1));
}

function renderLoop() {
  if (video.paused || video.ended) {
    animationId = requestAnimationFrame(renderLoop);
    return;
  }

  const cols = parseInt(resolutionInput.value, 10);
  const charSet = charsets[charsetSelect.value];
  const colorMode = colorModeSelect.value;

  const vWidth = video.videoWidth || video.width;
  const vHeight = video.videoHeight || video.height;
  if (!vWidth || !vHeight) {
    animationId = requestAnimationFrame(renderLoop);
    return;
  }

  const aspect = vHeight / vWidth;
  const rows = Math.floor(cols * aspect * 0.55);

  sourceCanvas.width = cols;
  sourceCanvas.height = rows;
  sourceCtx.drawImage(video, 0, 0, cols, rows);

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

      if (colorMode === 'color') {
        asciiCtx.fillStyle = `rgb(${r},${g},${b})`;
      } else if (colorMode === 'green') {
        const gval = Math.round(brightness);
        asciiCtx.fillStyle = `rgb(0,${gval},0)`;
      } else {
        const c = Math.round(brightness);
        asciiCtx.fillStyle = `rgb(${c},${c},${c})`;
      }

      asciiCtx.fillText(char, padX + x * fontSize, padY + y * fontSize);
    }
  }

  animationId = requestAnimationFrame(renderLoop);
}

startBtn.addEventListener('click', startCamera);

uploadBtn.addEventListener('click', () => videoUpload.click());

videoUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  isVideoFile = true;
  const url = URL.createObjectURL(file);
  video.srcObject = null;
  video.src = url;
  video.loop = true;
  video.play();
  startRender();
});

flipBtn.addEventListener('click', () => {
  if (isVideoFile) return;
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
  const link = document.createElement('a');
  link.download = 'ascii-art-' + Date.now() + '.png';
  link.href = asciiCanvas.toDataURL('image/png');
  link.click();
});

stopBtn.addEventListener('click', stopRender);

toggleControls.addEventListener('click', () => {
  controlsVisible = !controlsVisible;
  controls.classList.toggle('hidden', !controlsVisible);
});

// Close overlay on controls interaction if needed
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) overlay.classList.remove('active');
});
