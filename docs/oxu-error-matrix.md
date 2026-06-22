# Bang doi chieu bug OXU

| Ket qua | Ly do |
| --- | --- |
| Bam gui QR va khong mo them cua so nao, console co `send` roi co `receive` hoac `wait_resolved` | Luong `postMessage` da di va da co phan hoi hop le. Neu man hinh OXU van khong hien thi thi loi nghieng ve cong COM, lenh COM, hoac thiet bi OXU. |
| Bam gui QR va tu mo them mot cua so `about:blank` | Thuong do app co co che `window.open("", popupName)` hoac popup handle cu da mat nen browser tao named window moi. Trong ban code moi toi da bo nhanh recover nay; neu van con xay ra thi kha nang cao la tab dang chay ban build cu chua reload dung. |
| Bam gui QR va popup OXU hien dung giao dien nhung khong nhan gi | App da mo dung popup nhung popup chua nhan duoc message, hoac nhan roi nhung chua mo cong COM / chua tra phan hoi. Kiem tra tiep log `receive`, `wait_pending`, `wait_timeout`. |
| Console co `send { channel: "inline-popup-send" ... }` nhung khong co `receive`, `wait_pending`, `wait_resolved` | App da goi `postMessage` vao popup ref, nhung popup thuc te khong tra loi. Thuong do popup ref sai, popup da treo, popup da dong, hoac tab dang giu mot window handle khong con hop le. |
| Console co `send { channel: "inline-popup-send" ... }` lap lai nhieu lan voi requestId khac nhau nhung khong co dong nhan nao | App van co popup ref va van tiep tuc gui, nhung popup ben kia khong nhan/khong tra loi. Day la dau hieu popup da sai state, chay ban cu, hoac window handle khong tro dung cua so OXU dang mo. |
| Console co `receive` ngay sau `send` | Popup da nhan message tu dung `origin` cho phep. Day la dau hieu targetOrigin va kenh nhan co ban dang dung. |
| Console co `receive_ignored_origin` | Message da quay ve nhung `event.origin` khong nam trong allowlist. Thuong do relay sai domain, popup/bridge gui tu nguon khac, hoac co message gia/nhieu frame chen vao. |
| Console co `receive_ignored_source` | `origin` dung nhung `event.source` khong phai popup/window dang cho. Thuong do popup cu, cua so bi thay the, hoac app dang doi phan hoi tu sai window handle. |
| Console co `wait_pending` | Popup OXU da nhan lenh nhung chua co quyen mo cong COM. Can bam `Chon cong COM` trong popup OXU. |
| Console co `wait_timeout` | App da gui lenh nhung het thoi gian ma khong nhan duoc phan hoi hop le. Thuong do popup da dong, popup treo, relay bi chan, message tra ve sai origin/source, hoac popup khong chay cung ban code. |
| Console co `send_error` | Loi xay ra ngay luc goi `postMessage`. Thuong do popup/window da mat, window dang chuyen trang, hoac target khong con truy cap duoc. |
| Console co `OXU_BRIDGE_READY ok: true` | Popup OXU da san sang va da co quyen COM hoac da mo cong COM thanh cong. |
| Console co `OXU_BRIDGE_READY ok: false` | Popup OXU chua san sang, vua dong, hoac vua loi ket noi cong COM. Neu lap lai lien tuc thi popup dang reset state. |
| Console co `OXU_SEND_RESULT ok: false` va `needsUserGesture: true` | Browser dang ep thao tac tay truoc khi cho dung Web Serial. Phai bam nut `Chon cong COM` trong popup OXU. |
| Console co `OXU_SEND_RESULT ok: false` va message co cum `Khong mo duoc cong COM` | Cong COM dang bi tab/app khac giu, popup OXU cu chua dong, sai cong, loi USB/driver, hoac thiet bi chua san sang. |
| Popup OXU mo len nhung trang ben trong la trang trang, khong phai giao dien OXU | Thuong do popup bi mo bang `about:blank` nhung khong duoc `document.write` thanh cong, hoac popup handle dang tro vao mot cua so ten giong nhau nhung khong phai popup OXU that. |
| Tu tay mo mot URL `https://...script.googleusercontent.com/home?authuser` va thay trang Google Drive loi | Khong phai bang chung `targetOrigin` sai. `targetOrigin` chi can dung `origin`, khong can URL do mo truc tiep nhu mot trang web thuong. Day la sandbox origin cua GAS, khong phai route de user tu mo. |
| `targetOrigin` trong log la `https://...script.googleusercontent.com` | Day thuong la `origin` cua trang GAS dang chay. Neu popup inline la cung origin voi app thi gia tri nay la hop le cho `postMessage`. |
| `targetOrigin` trong log la `https://dulia.io.vn` | Day thuong la nhanh bridge popup/host relay. Neu fail thi can check them host wrapper va popup bridge. |
| Log co `relay-top` hoac `relay-parent` | App dang dua message len host/wrapper thay vi gui thang vao popup inline. Loi neu co se nam o lop relay hoac popup top-level. |
| Log co `relay-parent-fallback-star-*` | Day la fallback khi khong doc duoc origin ancestor trong GAS cross-origin. Khong phai luong ly tuong; neu thay nhieu ma khong co phan hoi thi can nghi host relay dang khong on dinh. |
| Da sua code nhung runtime van bi y het nhu truoc, ke ca `about:blank` | Kha nang cao nhat la tab dang chay bundle cu hoac deploy chua len. Can hard reload, doi cache, hoac xac nhan ban build moi da duoc Netlify/GAS phuc vu. |
| Test pass nhung runtime van loi | Test chi xac nhan logic noi bo; runtime van phu thuoc popup blocker, permission COM, cache, browser state, host wrapper, va Apps Script sandbox. |
