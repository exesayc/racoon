# Racoon Launcher

Electron + React ile yazılmış Minecraft: Java Edition launcher'ı.

## Komutlar

```
npm install      # ilk kurulum
npm start        # derleyip launcher'ı açar
npm run dev      # geliştirme modu (değişiklikler anında yansır)
npm run dist     # Windows kurulum dosyası üretir → release/
npm run release  # kurulum dosyasını üretip GitHub'a yeni sürüm olarak yükler
```

Görseller proje kökünde durur: `yt.jpg` (logo), `arkaplan.png` (ana ekran), `loginscreen.png` (giriş ekranı).
Değiştirdikten sonra `npm start` ile yeniden derle.

## Otomatik güncelleme (GitHub)

Kullanıcılar launcher'ı bir kez kurar; sonraki sürümleri launcher kendisi indirir ve kurar.

1. GitHub'da `Racoon` adında bir depo oluştur.
2. `package.json` → `build.publish` içindeki `GITHUB_KULLANICI_ADI` yerine GitHub kullanıcı adını yaz.
3. GitHub → Settings → Developer settings → Personal access tokens → **repo** yetkili bir token oluştur.
4. Yeni sürüm yayınlamak için:
   - `package.json` içindeki `version` değerini artır (ör. `0.1.0` → `0.2.0`).
   - PowerShell'de: `$env:GH_TOKEN="token_buraya"; npm run release`
   - GitHub'da oluşan taslak sürümü (Releases) açıp notlarını yaz ve **Publish** de.
5. Açık olan launcher'lar yeni sürümü birkaç dakika içinde bulur, indirir ve "Yeniden başlat ve güncelle" der.
   Sürüm notları launcher'daki **Güncellemeler → Racoon** sekmesinde görünür.

Not: Otomatik güncelleme yalnızca kurulum dosyasıyla yüklenmiş launcher'da çalışır; `npm start` ile açılanda kapalıdır.

## Discord Rich Presence

1. https://discord.com/developers/applications → **New Application** → adı `Racoon` yap.
2. **Rich Presence → Art Assets** bölümüne logoyu `logo` adıyla yükle.
3. **General Information** sayfasındaki **Application ID**'yi kopyala.
4. `package.json` → `Racoon.discordClientId` alanına yapıştır.

Discord açıkken launcher otomatik bağlanır; Ayarlar → Discord'dan kapatılabilir.

## Racoon sunucusu (arkadaşlar + hata bildirimi)

Arkadaş listesi ve hata bildirimleri `server/` klasöründeki küçük Node.js sunucusuyla çalışır.
Sunucu yokken arkadaşlar sayfası kapalıdır, hata bildirimi ise GitHub'da hazır doldurulmuş bir form açar.

**Yerelde denemek:**
```
cd server
npm install
npm start                      # http://localhost:8787
```
Launcher'ı bu sunucuya bağlamak için PowerShell'de: `$env:Racoon_API_URL="http://localhost:8787"; npm start`

**Herkese açmak:** sunucuyu bir VPS'e, Railway'e ya da Render'a yükle (Node 20+, `npm start`).
Sonra `package.json` → `Racoon.apiUrl` alanına adresini yaz (ör. `https://Racoon-api.up.railway.app`) ve yeni sürüm yayınla.

Sunucu ortam değişkenleri:
- `PORT`: varsayılan 8787
- `DATA_DIR`: veritabanı ve raporların tutulacağı klasör (kalıcı disk olmalı)
- `DISCORD_WEBHOOK_URL`: hata raporlarının düşeceği Discord kanalı (Kanal ayarları → Entegrasyonlar → Webhook)

Raporlar `DATA_DIR/reports/` altında JSON olarak da saklanır. Keşfet sayfasındaki sunucu listesini değiştirmek için
`DATA_DIR/discover.json` dosyası oluştur; launcher'lar güncelleme beklemeden yeni listeyi görür.

Güvenlik: kimlik doğrulama Minecraft sunucularıyla aynı Mojang oturum doğrulamasını kullanır; oyuncuların
token'ları Racoon sunucusuna hiç gönderilmez. Arkadaş listesi yalnızca Microsoft hesaplarıyla çalışır.

## Microsoft girişi

Şu an resmi launcher'ın herkese açık Live client kimliğini kullanır. Racoon'yı herkese dağıtmadan önce
Azure'da kendi uygulamanı kaydet, Mojang'dan Minecraft API onayı al ve şu ortam değişkenlerini ayarla:
`Racoon_MS_CLIENT_ID`, `Racoon_MS_REDIRECT_URI`.

## Klasör yapısı

```
electron/            ana süreç (Node.js)
  core/install.cjs   oyun, Java ve mod yükleyici kurulumu
  core/loaders.cjs   Fabric / Quilt / Forge / NeoForge
  core/modrinth.cjs  mod mağazası
  core/servers.cjs   sunucu listesi ve ping
  core/microsoft.cjs Microsoft / Xbox girişi
  core/updater.cjs   GitHub otomatik güncelleme
  core/discord.cjs   Discord Rich Presence
renderer/            arayüz (React)
```

Oyun dosyaları `%APPDATA%\.Racoon` altında tutulur; her profilin modları ve dünyaları `instances/<profil>` klasöründedir.
