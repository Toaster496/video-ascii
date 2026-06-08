const video = document.getElementById('video');
const sourceCanvas = document.getElementById('sourceCanvas');
const asciiCanvas = document.getElementById('asciiCanvas');
const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
const asciiCtx = asciiCanvas.getContext('2d');

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const uploadBtn = document.getElementById('uploadBtn');
const mediaUpload = document.getElementById('mediaUpload');
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
}

function stopRender() {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
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

startBtn.addEventListener('click', startCamera);

uploadBtn.addEventListener('click', () => mediaUpload.click());

mediaUpload.addEventListener('change', (e) => {
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

[resolutionInput, charsetSelect, colorModeSelect].forEach(el => {
  el.addEventListener('input', () => {
    if (isPhoto) renderPhoto();
  });
  el.addEventListener('change', () => {
    if (isPhoto) renderPhoto();
  });
});

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) overlay.classList.remove('active');
});
