# Android Bridge APK - Build, Install, Run

Tai lieu nay huong dan cach tao APK bridge, cai tren may POS Android (bao gom may KiotViet dang chay Android), va thao tac van hanh hang ngay.

## 0) Dieu kien

1. Co source code app Android bridge (Kotlin/Gradle).
2. Cai Android Studio (ban moi), Android SDK, va JDK 17.
3. Bat USB debugging neu cai bang `adb`.

Neu hien tai ban chua co source Android bridge, repo nay moi co SPEC tai:
- `docs/android-print-bridge/README.md`
- `docs/android-print-bridge/api-contract.md`

## 1) Build APK debug (test nhanh)

Tu thu muc project Android bridge:

```bash
./gradlew assembleDebug
```

APK tao ra thuong nam o:

- `app/build/outputs/apk/debug/app-debug.apk`

## 2) Build APK release (dua cho khach hang)

### 2.1 Tao keystore (1 lan)

```bash
keytool -genkeypair -v \
  -keystore soanhang-bridge-release.jks \
  -alias soanhang-bridge \
  -keyalg RSA -keysize 2048 -validity 3650
```

### 2.2 Khai bao signing trong `app/build.gradle`

- Tao `signingConfigs.release`.
- Gan `buildTypes.release.signingConfig = signingConfigs.release`.

### 2.3 Build

```bash
./gradlew clean assembleRelease
```

APK release thuong nam o:

- `app/build/outputs/apk/release/app-release.apk`

## 3) Cai APK len may POS

Co 2 cach:

### Cach A - ADB

```bash
adb devices
adb install -r app-release.apk
```

### Cach B - Thu cong

1. Copy `app-release.apk` vao may POS.
2. Mo file APK tren may.
3. Cho phep cai app tu nguon ben ngoai (Unknown sources) neu bi hoi.
4. Cai dat.

## 4) Cau hinh ban dau tren may POS (bat buoc)

1. Mo app Bridge.
2. Dat port `15321`.
3. Neu co token, cau hinh token va luu.
4. Cap quyen USB/Bluetooth/LAN cho Bridge.
5. Bat `Auto start on boot`.
6. Tat battery optimization cho Bridge.
7. Start service, kiem tra trang thai la `Running`.

## 5) Thao tac trong web app de in on dinh

Vao trang `#print-diagnostic` va lam dung thu tu:

1. Ping bridge.
2. Lay danh sach may in.
3. Chon may in tu dropdown (uu tien printerAddress neu co).
4. Luu cau hinh in.
5. Test in that 58mm.
6. Test in that 80mm.

Neu 2 lan in test deu OK, luong in da san sang cho van hanh.

## 6) Van hanh hang ngay (cho nhan vien)

1. Bat may POS + may in.
2. Mo app Bridge (kiem tra service `Running`).
3. Mo web app production URL.
4. Soan don va bam thanh toan/in binh thuong.

## 7) Kiem tra sau khi reboot may POS

1. Reboot may.
2. Xac nhan Bridge tu chay lai (service `Running`).
3. In 1 phieu test 58mm.

Neu buoc nay dat, he thong dat muc on dinh cho cua hang.

## 8) Xu ly su co nhanh

1. Ping bridge fail:
- Bridge chua chay.
- Sai port.
- App bi he thong dong nen.

2. `/printers` rong:
- Chua cap quyen USB/BT.
- May in chua pair/chua nhan driver.

3. In timeout:
- Mang LAN/Wi-Fi yeu.
- Tang timeout len 8000-12000ms.

4. Bao sai may in:
- Chon lai may in tu danh sach bridge, roi luu cau hinh.
