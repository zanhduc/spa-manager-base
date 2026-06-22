/**
 * OXU Serial popup — QR-first checkout surface (pattern giống CameraPopup).
 * Popup top-level → Web Serial hoạt động, postMessage trực tiếp về opener (app).
 */

export const OXU_INLINE_POPUP_NAME = "oxu_serial_inline";
export const OXU_COMPLETE_COMMAND = "JUMP(2);";

export function buildOxuSerialPopupHTML() {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QR OXU</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:16px}
.card{max-width:460px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:14px;padding:16px}
h1{font-size:17px;margin-bottom:4px}
.sub{font-size:12px;color:#94a3b8;line-height:1.5;margin-bottom:12px}
.qr-panel{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:12px;padding:12px;background:#0f172a;border:1px solid #334155;border-radius:12px}
.qr-panel img{max-width:100%;max-height:220px;border-radius:10px;border:1px solid #334155;background:#fff}
.qr-meta{font-size:12px;color:#94a3b8;text-align:center;line-height:1.5}
.qr-meta strong{color:#e2e8f0}
.qr-placeholder{font-size:13px;color:#64748b;text-align:center;padding:28px 12px}
.status{border-radius:10px;padding:10px;font-size:13px;margin-bottom:12px;background:#0f172a;border:1px solid #334155}
.status.ok{border-color:#10b981;color:#6ee7b7}
.status.err{border-color:#ef4444;color:#fca5a5}
.actions{display:flex;gap:8px;flex-wrap:wrap}
button{border:0;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;cursor:pointer}
.primary{background:#e11d48;color:#fff}
.secondary{background:#334155;color:#e2e8f0}
.ghost{background:transparent;border:1px solid #475569;color:#cbd5e1}
.com-panel{margin-top:12px;padding-top:12px;border-top:1px solid #334155}
.com-panel.hidden{display:none}
.com-panel p{font-size:12px;color:#94a3b8;margin-bottom:8px}
.log{margin-top:12px;max-height:96px;overflow:auto;font-size:11px;color:#94a3b8;background:#0f172a;border:1px solid #334155;border-radius:10px;padding:8px;white-space:pre-wrap}
</style>
</head>
<body>
<div class="card">
  <h1>QR thanh toán OXU</h1>
  <p class="sub">Quét mã trên popup, bấm «Gửi lên màn hình» để hiển thị trên thiết bị OXU.</p>
  <div class="qr-panel">
    <img id="qrImg" alt="VietQR" hidden>
    <div id="qrPlaceholder" class="qr-placeholder">Đang chờ mã QR từ app…</div>
    <div id="qrMeta" class="qr-meta" hidden></div>
  </div>
  <div id="status" class="status">Chưa kết nối COM.</div>
  <div class="actions">
    <button id="pushBtn" class="primary" type="button" disabled>Gửi lên màn hình</button>
    <button id="completeBtn" class="secondary" type="button">Hoàn thành</button>
  </div>
  <div id="comPanel" class="com-panel hidden">
    <p>Cần chọn cổng COM một lần để gửi lệnh lên màn hình OXU.</p>
    <button id="connectBtn" class="ghost" type="button">Chọn cổng COM</button>
  </div>
  <div id="log" class="log"></div>
</div>
<script>
(function(){
  var BAUD=115200,port=null,ready=false,pending={},storedCommand="";
  var statusEl=document.getElementById("status");
  var logEl=document.getElementById("log");
  var pushBtn=document.getElementById("pushBtn");
  var completeBtn=document.getElementById("completeBtn");
  var connectBtn=document.getElementById("connectBtn");
  var comPanel=document.getElementById("comPanel");
  var qrImg=document.getElementById("qrImg");
  var qrPlaceholder=document.getElementById("qrPlaceholder");
  var qrMeta=document.getElementById("qrMeta");
  var openerOrigin=(function(){try{return window.location.origin;}catch(_){return "*";}})();
  var debugPrefix="[OXU inline popup]";
  var COMPLETE_CMD="${OXU_COMPLETE_COMMAND.replace(/"/g, '\\"')}";

  function log(line){logEl.textContent="["+new Date().toLocaleTimeString()+"] "+line+"\\n"+logEl.textContent;}
  function debug(stage,details){try{console.log(debugPrefix,stage,details||{});}catch(_){}}
  function setStatus(t,ok){statusEl.textContent=t;statusEl.className="status"+(ok?" ok":ok===false?" err":"");}
  function showComPanel(show){comPanel.className="com-panel"+(show?"":" hidden");}
  function notify(p){
    try{
      if(window.opener&&!window.opener.closed){
        window.opener.postMessage(p,openerOrigin);
        debug("send",{type:p&&p.type||"",targetOrigin:openerOrigin,requestId:p&&p.requestId||""});
      }
    }catch(e){
      debug("send_error",{type:p&&p.type||"",targetOrigin:openerOrigin,requestId:p&&p.requestId||"",message:String(e&&e.message||e||"")});
    }
  }
  function splitCmd(c){return String(c||"").trim().split(";").map(function(x){return x.trim();}).filter(Boolean);}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
  function formatOpenError(e){
    var raw=String(e&&e.message||e||"");
    if(/Failed to open serial port/i.test(raw)){
      return "Không mở được cổng COM. Cổng có thể đang bị tab/app khác giữ. Đóng popup OXU cũ hoặc app serial khác, rút cắm lại USB, rồi chọn lại cổng COM.";
    }
    return raw||"Không mở được cổng COM.";
  }
  function renderQr(payload){
    var url=String(payload&&payload.qrImageUrl||"").trim();
    var amount=String(payload&&payload.amountLabel||"").trim();
    var bank=String(payload&&payload.bankLabel||"").trim();
    var account=String(payload&&payload.accountLabel||"").trim();
    var command=String(payload&&payload.command||"").trim();
    if(command)storedCommand=command;
    pushBtn.disabled=!storedCommand;
    if(url){
      qrImg.src=url;
      qrImg.hidden=false;
      qrPlaceholder.hidden=true;
    }else{
      qrImg.hidden=true;
      qrPlaceholder.hidden=false;
      qrPlaceholder.textContent=storedCommand?"Chưa có ảnh QR — vẫn có thể gửi payload EMVCo.":"Đang chờ mã QR từ app…";
    }
    var metaParts=[];
    if(amount)metaParts.push("<strong>"+amount+"</strong>");
    if(bank)metaParts.push(bank);
    if(account)metaParts.push(account);
    if(metaParts.length){
      qrMeta.innerHTML=metaParts.join(" · ");
      qrMeta.hidden=false;
    }else{
      qrMeta.hidden=true;
      qrMeta.textContent="";
    }
    if(storedCommand){
      setStatus("Sẵn sàng gửi QR lên màn hình OXU.",true);
    }
  }

  async function openPort(requestNew){
    if(!navigator.serial)throw new Error("Cần Chrome/Edge.");
    if(!port||requestNew){
      var granted=await navigator.serial.getPorts();
      if(!requestNew&&granted.length)port=granted[0];
      else port=await navigator.serial.requestPort();
    }
    if(!port.readable){
      try{await port.open({baudRate:BAUD});}
      catch(e){
        var old=port;port=null;ready=false;
        try{if(old&&old.readable)await old.close();}catch(_){}
        try{if(old&&typeof old.forget==="function")await old.forget();}catch(_){}
        throw new Error(formatOpenError(e));
      }
    }
    ready=true;
    showComPanel(false);
    notify({type:"OXU_BRIDGE_READY",ok:true,ready:true});
  }

  async function sendCmd(command){
    var parts=splitCmd(command);
    if(!parts.length)throw new Error("Lệnh trống");
    await openPort(false);
    var enc=new TextEncoder(),w=port.writable.getWriter();
    try{
      for(var i=0;i<parts.length;i++){
        await w.write(enc.encode(parts[i]+";\\r\\n"));
        if(i<parts.length-1)await sleep(40);
      }
    }finally{w.releaseLock();}
  }

  async function flushPending(){
    var ids=Object.keys(pending);
    for(var j=0;j<ids.length;j++){
      var job=pending[ids[j]];
      if(!job)continue;
      try{
        await sendCmd(job.command);
        notify({type:"OXU_SEND_RESULT",ok:true,requestId:job.requestId});
      }catch(e){
        notify({type:"OXU_SEND_RESULT",ok:false,message:String(e&&e.message||e),requestId:job.requestId});
      }
      delete pending[ids[j]];
    }
  }

  connectBtn.addEventListener("click",async function(){
    connectBtn.disabled=true;
    try{
      await openPort(true);
      setStatus("Đã kết nối cổng COM.",true);
      log("Kết nối OK");
      await flushPending();
    }catch(e){
      setStatus(String(e&&e.message||e),false);
      log("Lỗi: "+String(e&&e.message||e));
      showComPanel(true);
      notify({type:"OXU_BRIDGE_READY",ok:false});
    }finally{connectBtn.disabled=false;}
  });

  pushBtn.addEventListener("click",async function(){
    if(!storedCommand){
      setStatus("Chưa có lệnh QR để gửi.",false);
      return;
    }
    pushBtn.disabled=true;
    try{
      await sendCmd(storedCommand);
      setStatus("Đã gửi QR lên màn hình OXU.",true);
      log("Gửi QR OK");
      notify({type:"OXU_SEND_RESULT",ok:true,requestId:"popup-push"});
    }catch(e){
      var msg=String(e&&e.message||e||"");
      setStatus(msg,false);
      log("Lỗi gửi QR: "+msg);
      showComPanel(true);
      notify({type:"OXU_SEND_RESULT",ok:false,message:msg,requestId:"popup-push"});
    }finally{pushBtn.disabled=!storedCommand;}
  });

  completeBtn.addEventListener("click",async function(){
    completeBtn.disabled=true;
    try{
      if(navigator.serial){
        try{
          await sendCmd(COMPLETE_CMD);
          log("Đã gửi JUMP(2)");
        }catch(e){
          log("JUMP(2) lỗi: "+String(e&&e.message||e));
        }
      }
    }finally{
      completeBtn.disabled=false;
      window.close();
    }
  });

  window.addEventListener("beforeunload",function(){ready=false;notify({type:"OXU_BRIDGE_READY",ok:false});});

  window.addEventListener("message",async function(ev){
    var d=ev.data;if(!d||typeof d!=="object")return;
    if(ev.origin!==openerOrigin){
      if(String(d.type||"").indexOf("OXU_")===0)debug("receive_ignored_origin",{type:d.type,origin:ev.origin,expectedOrigin:openerOrigin,requestId:d.requestId||""});
      return;
    }
    if(window.opener&&ev.source!==window.opener){
      if(String(d.type||"").indexOf("OXU_")===0)debug("receive_ignored_source",{type:d.type,origin:ev.origin,requestId:d.requestId||""});
      return;
    }
    if(String(d.type||"").indexOf("OXU_")===0)debug("receive",{type:d.type,origin:ev.origin,requestId:d.requestId||""});
    if(d.type==="OXU_PING"){
      notify({type:"OXU_PONG",ready:ready,requestId:d.requestId||""});
      return;
    }
    if(d.type==="OXU_SET_QR"){
      renderQr(d);
      return;
    }
    if(d.type==="OXU_TRIGGER_PUSH"){
      if(storedCommand)pushBtn.click();
      return;
    }
    if(d.type!=="OXU_SEND")return;
    var rid=d.requestId||"";
    if(!ready){
      pending[rid]={command:d.command,requestId:rid};
      showComPanel(true);
      setStatus("Bấm «Chọn cổng COM» để gửi lệnh.",false);
      notify({type:"OXU_SEND_RESULT",ok:false,pending:true,needsUserGesture:true,requestId:rid,message:"Chọn cổng COM"});
      return;
    }
    try{
      await sendCmd(d.command);
      setStatus("Đã gửi lệnh COM.",true);
      log("Gửi OK");
      notify({type:"OXU_SEND_RESULT",ok:true,requestId:rid});
    }catch(e){
      setStatus(String(e&&e.message||e),false);
      showComPanel(true);
      notify({type:"OXU_SEND_RESULT",ok:false,message:String(e&&e.message||e),requestId:rid});
    }
  });

  navigator.serial.getPorts().then(function(ports){
    if(!ports.length)return;
    return openPort(false).then(function(){
      setStatus("Đã kết nối (cổng đã lưu).",true);
      log("Tự kết nối lại cổng COM.");
    });
  }).catch(function(){notify({type:"OXU_BRIDGE_READY",ok:false});});

  log("Sẵn sàng.");
})();
</script>
</body>
</html>`;
}

export function openOxuSerialPopup() {
  const html = buildOxuSerialPopupHTML();
  const width = 500;
  const height = 680;
  const left = Math.max(0, (screen.width - width) / 2);
  const top = Math.max(0, (screen.height - height) / 2);
  const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`;

  const popup = window.open("about:blank", OXU_INLINE_POPUP_NAME, features);
  if (!popup) return null;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  return popup;
}

export function recoverOxuSerialPopup() {
  // Avoid `window.open("", name)` here. In Chrome/GAS flows it can create a new
  // named about:blank popup instead of reattaching to the existing OXU window.
  // We only trust the live reference captured when the popup was originally opened.
  return null;
}
