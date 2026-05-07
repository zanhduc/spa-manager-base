/**
 * CameraPopup – Build the HTML for the camera capture popup window.
 *
 * Runs outside the GAS iframe to bypass sandbox restrictions.
 * Returns an HTML string that is written into a popup via `document.write()`.
 *
 * Usage:
 *   import { buildCameraPopupHTML, openCameraPopup } from '../components/CameraPopup';
 *   openCameraPopup();  // or use the HTML directly
 */

/**
 * Build the full HTML document string for the camera popup.
 * @param {object} [options]
 * @param {string} [options.title] – Header title (default: "Chụp ảnh sản phẩm")
 * @param {number} [options.maxSize] – Max dimension for the captured image (default: 800)
 * @param {number} [options.quality] – JPEG quality 0-1 (default: 0.7)
 * @returns {string} Complete HTML document
 */
export function buildCameraPopupHTML(options = {}) {
  const {
    title = "Chụp ảnh sản phẩm",
    maxSize = 800,
    quality = 0.7,
  } = options;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${title}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

*{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg-dark:#0a0a0f;
  --bg-panel:rgba(15,15,25,0.85);
  --bg-glass:rgba(255,255,255,0.06);
  --border-glass:rgba(255,255,255,0.08);
  --accent:#f43f5e;
  --accent-glow:rgba(244,63,94,0.35);
  --success:#10b981;
  --success-glow:rgba(16,185,129,0.35);
  --text-primary:#f1f5f9;
  --text-secondary:#94a3b8;
  --text-muted:#64748b;
}

body{
  font-family:'Inter',system-ui,-apple-system,sans-serif;
  background:var(--bg-dark);
  color:var(--text-primary);
  display:flex;flex-direction:column;
  height:100vh;height:100dvh;
  overflow:hidden;
  -webkit-user-select:none;user-select:none;
}

/* ── Header ── */
.header{
  padding:14px 16px;
  background:var(--bg-panel);
  backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border-glass);
  display:flex;align-items:center;justify-content:space-between;
  flex-shrink:0;
  z-index:20;
}
.header-title{
  display:flex;align-items:center;gap:10px;
}
.header-icon{
  width:32px;height:32px;
  border-radius:10px;
  background:linear-gradient(135deg,var(--accent),#e11d48);
  display:flex;align-items:center;justify-content:center;
  font-size:15px;
  box-shadow:0 2px 12px var(--accent-glow);
}
.header h2{
  font-size:15px;font-weight:700;
  letter-spacing:-0.01em;
}
.close-btn{
  background:var(--bg-glass);
  border:1px solid var(--border-glass);
  color:var(--text-secondary);
  border-radius:10px;
  padding:7px 14px;
  font-size:12px;font-weight:600;
  cursor:pointer;
  transition:all 0.2s;
  font-family:inherit;
  display:flex;align-items:center;gap:5px;
}
.close-btn:hover{background:rgba(255,255,255,0.1);color:var(--text-primary)}
.close-btn:active{transform:scale(0.96)}

/* ── Video area ── */
.video-wrap{
  flex:1;position:relative;overflow:hidden;
  background:var(--bg-dark);
  display:flex;align-items:center;justify-content:center;
}
video{width:100%;height:100%;object-fit:cover}
canvas{display:none}

/* ── Preview ── */
.preview-img{
  width:100%;height:100%;
  object-fit:contain;
  display:none;
  background:#000;
}

/* ── Loading / Error states ── */
.state-msg{
  padding:48px 24px;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:16px;
}
.loading-spinner{
  width:44px;height:44px;
  border:3px solid rgba(255,255,255,0.08);
  border-top-color:var(--accent);
  border-radius:50%;
  animation:spin 0.8s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}

.loading-text{color:var(--text-secondary);font-size:13px;font-weight:500}

.error-container{
  padding:40px 24px;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:12px;
}
.error-icon{
  width:56px;height:56px;border-radius:16px;
  background:rgba(239,68,68,0.12);
  display:flex;align-items:center;justify-content:center;
  font-size:24px;
}
.error-title{color:#f87171;font-size:15px;font-weight:700}
.error-detail{color:var(--text-muted);font-size:12px;line-height:1.5;max-width:280px}
.error-hint{
  margin-top:4px;
  color:var(--text-secondary);font-size:12px;
  background:var(--bg-glass);
  border:1px solid var(--border-glass);
  border-radius:10px;padding:10px 14px;
  line-height:1.5;max-width:300px;
}

/* ── Controls bar ── */
.controls{
  padding:16px 20px 20px;
  background:var(--bg-panel);
  backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);
  border-top:1px solid var(--border-glass);
  display:flex;align-items:center;justify-content:center;gap:16px;
  flex-shrink:0;
  z-index:20;
}

/* Capture button  */
.btn-capture{
  width:72px;height:72px;border-radius:50%;
  border:3px solid rgba(255,255,255,0.3);
  background:transparent;
  cursor:pointer;position:relative;
  transition:all 0.2s;
  display:none;
  padding:0;
}
.btn-capture::before{
  content:'';position:absolute;inset:-4px;
  border-radius:50%;
  border:2px solid transparent;
  transition:border-color 0.3s;
}
.btn-capture::after{
  content:'';position:absolute;inset:5px;
  border-radius:50%;
  background:linear-gradient(135deg,var(--accent),#e11d48);
  transition:all 0.15s;
  box-shadow:0 2px 16px var(--accent-glow);
}
.btn-capture:hover{border-color:rgba(255,255,255,0.5)}
.btn-capture:hover::after{filter:brightness(1.15)}
.btn-capture:active::after{transform:scale(0.82);filter:brightness(0.95)}

/* Flash animation */
.flash{
  position:absolute;inset:0;background:#fff;
  opacity:0;pointer-events:none;z-index:15;
  transition:opacity 0.08s;
}
.flash.active{opacity:0.7;transition:opacity 0.02s}

/* Use / Retake buttons */
.btn-use{
  display:none;
  background:linear-gradient(135deg,var(--success),#059669);
  color:#fff;border:none;border-radius:14px;
  padding:13px 28px;
  font-size:14px;font-weight:700;
  cursor:pointer;
  font-family:inherit;
  box-shadow:0 4px 20px var(--success-glow);
  transition:all 0.2s;
  letter-spacing:-0.01em;
}
.btn-use:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 6px 24px var(--success-glow)}
.btn-use:active{transform:translateY(0);filter:brightness(0.95)}

.btn-retake{
  display:none;
  background:var(--bg-glass);
  border:1px solid var(--border-glass);
  color:var(--text-secondary);
  border-radius:14px;
  padding:13px 20px;
  font-size:13px;font-weight:600;
  cursor:pointer;
  font-family:inherit;
  transition:all 0.2s;
}
.btn-retake:hover{background:rgba(255,255,255,0.1);color:var(--text-primary)}
.btn-retake:active{transform:scale(0.97)}

/* Switch camera button */
.switch-btn{
  position:absolute;top:14px;right:14px;
  background:rgba(0,0,0,0.45);
  backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,0.12);
  color:#fff;border-radius:12px;
  width:42px;height:42px;
  cursor:pointer;font-size:17px;
  display:none;
  align-items:center;justify-content:center;
  z-index:10;
  transition:all 0.25s;
}
.switch-btn:hover{background:rgba(0,0,0,0.65);border-color:rgba(255,255,255,0.2)}
.switch-btn:active{transform:scale(0.92) rotate(180deg)}
.switch-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

/* Viewfinder overlay */
.viewfinder{
  position:absolute;inset:0;pointer-events:none;z-index:5;
}
.viewfinder::before{
  content:'';position:absolute;inset:10%;
  border:1.5px solid rgba(255,255,255,0.12);
  border-radius:20px;
}
.vf-corner{
  position:absolute;width:24px;height:24px;
  border-color:rgba(255,255,255,0.4);
}
.vf-tl{top:calc(10% - 1px);left:calc(10% - 1px);border-top:2.5px solid;border-left:2.5px solid;border-radius:12px 0 0 0}
.vf-tr{top:calc(10% - 1px);right:calc(10% - 1px);border-top:2.5px solid;border-right:2.5px solid;border-radius:0 12px 0 0}
.vf-bl{bottom:calc(10% - 1px);left:calc(10% - 1px);border-bottom:2.5px solid;border-left:2.5px solid;border-radius:0 0 0 12px}
.vf-br{bottom:calc(10% - 1px);right:calc(10% - 1px);border-bottom:2.5px solid;border-right:2.5px solid;border-radius:0 0 12px 0}

/* Status pill */
.status-pill{
  position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.5);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,0.08);
  border-radius:20px;
  padding:6px 14px;
  font-size:11px;font-weight:600;
  color:var(--text-secondary);
  z-index:6;
  display:none;
  align-items:center;gap:6px;
  transition:opacity 0.3s;
}
.status-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}

/* Preview badge */
.preview-badge{
  position:absolute;top:14px;left:14px;
  background:rgba(0,0,0,0.5);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,0.08);
  border-radius:10px;
  padding:6px 12px;
  font-size:11px;font-weight:600;
  color:var(--success);
  z-index:6;
  display:none;
  align-items:center;gap:5px;
}
</style>
</head>
<body>

<div class="header">
  <div class="header-title">
    <div class="header-icon">📷</div>
    <h2>${title}</h2>
  </div>
  <button class="close-btn" onclick="closePopup()">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    Đóng
  </button>
</div>

<div class="video-wrap" id="videoWrap">
  <div class="state-msg" id="loadMsg">
    <div class="loading-spinner"></div>
    <span class="loading-text">Đang khởi động camera…</span>
  </div>
  <video id="video" autoplay playsinline muted></video>
  <img class="preview-img" id="previewImg" />
  <canvas id="canvas"></canvas>
  <div class="flash" id="flash"></div>

  <!-- Viewfinder overlay -->
  <div class="viewfinder" id="viewfinder" style="display:none">
    <div class="vf-corner vf-tl"></div>
    <div class="vf-corner vf-tr"></div>
    <div class="vf-corner vf-bl"></div>
    <div class="vf-corner vf-br"></div>
  </div>

  <!-- Status pill -->
  <div class="status-pill" id="statusPill">
    <span class="status-dot"></span>
    Camera đang hoạt động
  </div>

  <!-- Preview badge -->
  <div class="preview-badge" id="previewBadge">
    ✓ Xem trước ảnh
  </div>

  <button class="switch-btn" id="switchBtn" onclick="switchCamera()" title="Đổi camera">
    <svg viewBox="0 0 24 24"><path d="M16.466 7.534c.89.89.37 2.466-.79 2.466H8.324c-1.16 0-1.68-1.576-.79-2.466l3.676-3.676a1.1 1.1 0 0 1 1.58 0l3.676 3.676zM7.534 16.466c-.89-.89-.37-2.466.79-2.466h7.352c1.16 0 1.68 1.576.79 2.466l-3.676 3.676a1.1 1.1 0 0 1-1.58 0l-3.676-3.676z"/></svg>
  </button>
</div>

<div class="controls" id="controls">
  <button class="btn-capture" id="captureBtn" onclick="capture()" title="Chụp"></button>
  <button class="btn-retake" id="retakeBtn" onclick="retake()">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
    Chụp lại
  </button>
  <button class="btn-use" id="useBtn" onclick="usePhoto()">✓ Dùng ảnh này</button>
</div>

<script>
let stream=null,facingMode='environment',capturedData=null;
const video=document.getElementById('video'),
  canvas=document.getElementById('canvas'),
  previewImg=document.getElementById('previewImg'),
  captureBtn=document.getElementById('captureBtn'),
  retakeBtn=document.getElementById('retakeBtn'),
  useBtn=document.getElementById('useBtn'),
  switchBtn=document.getElementById('switchBtn'),
  loadMsg=document.getElementById('loadMsg'),
  flash=document.getElementById('flash'),
  viewfinder=document.getElementById('viewfinder'),
  statusPill=document.getElementById('statusPill'),
  previewBadge=document.getElementById('previewBadge'),
  videoWrap=document.getElementById('videoWrap');

const MAX_SIZE=${maxSize}, QUALITY=${quality};

async function startCamera(){
  loadMsg.style.display='flex';
  video.style.display='none';
  captureBtn.style.display='none';
  switchBtn.style.display='none';
  viewfinder.style.display='none';
  statusPill.style.display='none';
  previewBadge.style.display='none';
  try{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      throw new Error('Trình duyệt không hỗ trợ camera. Hãy thử dùng Safari hoặc Chrome.');
    }
    if(stream){stream.getTracks().forEach(t=>t.stop())}
    stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:facingMode,width:{ideal:1280},height:{ideal:960}},
      audio:false
    });
    video.srcObject=stream;
    await video.play();
    loadMsg.style.display='none';
    video.style.display='block';
    captureBtn.style.display='block';
    switchBtn.style.display='flex';
    viewfinder.style.display='block';
    statusPill.style.display='flex';
  }catch(err){
    loadMsg.style.display='none';
    videoWrap.innerHTML=
      '<div class="error-container">'+
      '<div class="error-icon">⚠️</div>'+
      '<div class="error-title">Không thể mở camera</div>'+
      '<div class="error-detail">'+err.message+'</div>'+
      '<div class="error-hint">💡 Hãy đóng popup này và chọn "Chọn Từ Thư Viện" để chụp ảnh từ camera hệ thống.</div>'+
      '</div>';
  }
}

function switchCamera(){
  facingMode=facingMode==='environment'?'user':'environment';
  startCamera();
}

function capture(){
  if(!stream)return;
  // Flash effect
  flash.classList.add('active');
  setTimeout(()=>flash.classList.remove('active'),120);

  const vw=video.videoWidth,vh=video.videoHeight;
  canvas.width=vw;canvas.height=vh;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(video,0,0,vw,vh);
  let w=vw,h=vh;
  if(w>MAX_SIZE||h>MAX_SIZE){
    if(w>h){h=Math.round(h*MAX_SIZE/w);w=MAX_SIZE}
    else{w=Math.round(w*MAX_SIZE/h);h=MAX_SIZE}
  }
  const c2=document.createElement('canvas');
  c2.width=w;c2.height=h;
  c2.getContext('2d').drawImage(canvas,0,0,w,h);
  capturedData=c2.toDataURL('image/jpeg',QUALITY);

  // Show preview
  video.style.display='none';
  previewImg.src=capturedData;
  previewImg.style.display='block';
  captureBtn.style.display='none';
  switchBtn.style.display='none';
  viewfinder.style.display='none';
  statusPill.style.display='none';
  previewBadge.style.display='flex';
  retakeBtn.style.display='block';
  useBtn.style.display='block';
}

function retake(){
  capturedData=null;
  previewImg.style.display='none';
  previewBadge.style.display='none';
  retakeBtn.style.display='none';
  useBtn.style.display='none';
  startCamera();
}

function usePhoto(){
  if(!capturedData)return;
  // Send data via multiple channels for reliability
  // 1. postMessage
  try{
    if(window.opener){
      window.opener.postMessage({type:'CAMERA_CAPTURE',data:capturedData},'*');
    }
  }catch(e){}
  // 2. localStorage (reliable fallback – storage event fires cross-tab)
  try{
    localStorage.setItem('__camera_capture__',capturedData);
    localStorage.setItem('__camera_capture_ts__',Date.now().toString());
  }catch(e){}
  if(stream)stream.getTracks().forEach(t=>t.stop());
  setTimeout(()=>window.close(),400);
}

function closePopup(){
  if(stream)stream.getTracks().forEach(t=>t.stop());
  window.close();
}

window.addEventListener('beforeunload',()=>{
  if(stream)stream.getTracks().forEach(t=>t.stop());
});

startCamera();
</script>
</body></html>`;
}

/**
 * Open a camera popup window and return the window reference.
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {number} [options.maxSize]
 * @param {number} [options.quality]
 * @returns {Window|null} The popup window, or null if blocked
 */
export function openCameraPopup(options = {}) {
  const html = buildCameraPopupHTML(options);
  const w = Math.min(480, screen.width);
  const h = Math.min(720, screen.height);
  const left = (screen.width - w) / 2;
  const top = (screen.height - h) / 2;

  const popup = window.open(
    "about:blank",
    "_blank",
    `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
  );

  if (!popup) return null;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();

  return popup;
}
