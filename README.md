# DNVB Sosmed Tracker (`dnvb-sosmedtracker`)

Platform **social listening & analisis sentimen** milik **DNVB Indonesia** ([dnvbindonesia.com](https://dnvbindonesia.com)). Dibangun pertama untuk brand DNVB sendiri, lalu bisa menambahkan **brand klien** dan **kompetitor** tanpa batas.

Kebutuhan utama: **tahu sentimen positif / netral / negatif** di percakapan media sosial dan pemberitaan web.

| Kanal utama | Isi yang dikumpulkan |
|---|---|
| **Instagram** | Unggahan (hashtag / kata kunci / akun) + komentar di unggahan teramai |
| **TikTok** | Video dari pencarian kata kunci + komentar di video dengan komentar terbanyak |
| **Threads** | Post terbaru dari pencarian kata kunci |
| **YouTube** | Video + komentar publik di video teramai |
| **Media web** | Google News, Bing News, GDELT, RSS ratusan media, web & blog (Firecrawl / Exa) |
| Opsional | X/Twitter, Facebook, Reddit, LinkedIn (mati secara default untuk brand baru) |

## Fitur

- **Ringkasan Brand**: komparasi semua brand (sentimen per brand, share of voice, narasi otomatis, tokoh & isu lintas brand).
- **Dashboard per brand**: net sentiment (gauge), **sentimen per kanal** (Instagram, TikTok, Threads, YouTube, media web), tren harian per sentimen, komposisi, sebutan negatif terbaru, sebutan positif teratas, peringatan dini, isu teratas, tokoh & kreator.
- **Sebutan**: feed unggahan, komentar, dan berita dengan saring cepat; koreksi sentimen manual oleh analis (langsung mengubah semua grafik).
- **Isu**: 11 kategori isu brand (Produk & Kualitas, Harga & Promo, Layanan & Pengalaman Pelanggan, Konten & Kampanye, Kreator & Influencer, Event & Komunitas, Edukasi & Kelas, Bisnis & Kemitraan, Karier & Internal, Reputasi & Krisis, Lainnya) + sub-isu spesifik dari AI.
- **Laporan & AI**: ringkasan eksekutif, temuan, risiko reputasi, rekomendasi aksi, dan Tanya Data. Ekspor PDF / CSV / JSON.
- **Cek Sentimen Cepat**: cek sekali untuk kata kunci, kampanye, hashtag, atau isu apa pun; bisa disimpan sebagai brand.
- **Multi-brand**: jenis brand (Brand DNVB / Brand klien / Kompetitor), akun resmi (@handle otomatis jadi kata kunci), logo, konteks AI, query boolean, pilihan kanal.

## Analisis sentimen

1. **AI** (SumoPod / Gemini): sentimen **terhadap brand**, paham slang warganet ("mantul", "zonk", "worth it", "kapok"), sarkasme ("bagus banget ya, nunggu sebulan belum dikirim" = negatif), emoji, dan campuran Indonesia-Inggris. Juga relevansi (buang homonim/spam), skor −1..1, alasan, isu, sub-isu, tokoh/kreator, organisasi, lokasi.
2. **Leksikon cadangan** (tanpa AI): kamus pujian & keluhan bahasa warganet, penanganan **negasi** ("gak worth" = negatif, "nggak nyesel" = positif), batas kata Unicode ("top" tidak cocok di "laptop"), dan emoji.
3. **Saringan**: pagar spam judi online / iklan properti / nomor WA / domain marketplace, kata konteks wajib untuk singkatan ambigu (mis. "DNVB" sebagai istilah umum), dan saringan makna (embedding) bila `SUMOPOD_API_KEY` diisi.

Net sentiment = (positif − negatif) ÷ total × 100, per brand dan per kanal.

## Desain

Landing page (`index.html`) dan dashboard mengikuti UI/UX [dnvbindonesia.com](https://dnvbindonesia.com): Plus Jakarta Sans, pink `#F55D9E` → hover biru `#346BC8`, navy `#101820` / `#0D1420`, bentuk dekoratif resmi (bunga oranye, "D" hijau, titik), tombol panah beranimasi, reveal fade/slide-up, marquee, section gelap bersudut besar, bilah progres pink. Aset resmi ada di `public/dnvb/`. Detail di [DESIGN.md](DESIGN.md).

## Arsitektur

```
index.html            Landing page (HTML + CSS + JS mandiri, gaya dnvbindonesia.com)
dashboard.html        Aplikasi (React 19 + Vite + Tailwind 4 + Recharts)
public/dnvb/          Aset resmi dari dnvbindonesia.com (logo, panah, bentuk dekoratif)
src/
  App.tsx             Shell: sidebar brand, filter kanal & periode, bilah progres
  components/         TopicDashboard (dashboard brand), panels, charts, ui (ArrowButton, Reveal, Card, Kpi)
  pages/              GroupOverview (Ringkasan Brand), Pages (brand, cek cepat, sumber data)
  lib/                presets (brand DNVB + templat brand baru), pipeline, aggregate, narrative, store
api/                  Vercel Serverless Functions
  collect.ts          Kumpulkan sebutan per sumber (+ komentar TikTok/Instagram)
  analyze.ts          Analisis sentimen per batch (AI / leksikon)
  insight.ts          Ringkasan eksekutif & rekomendasi
  semantic.ts         Saringan makna (embedding)
  health.ts           Status konektor
  _lib/social.ts      YouTube API, Apify (Instagram/TikTok/Threads/X/FB) + komentar
  _lib/reach.ts       Jalur berurutan per sumber (Apify ▸ CLI ▸ jembatan ▸ Firecrawl ▸ Exa)
  _lib/lexicon.ts     Leksikon sentimen bahasa warganet
shared/types.ts       Tipe bersama, daftar kanal, kategori isu
tests/run.ts          Uji unit & integrasi (npm test)
```

Alur: kata kunci & akun brand → `/api/collect` (paralel per kanal × query) → komentar dari unggahan teramai → deduplikasi → baca isi artikel → saringan makna → `/api/analyze` → agregasi di browser → `/api/insight`. Hasil tersimpan di IndexedDB browser (`dnvb-sosmedtracker`).

## Jalur pengambilan data

| Kanal | Jalur (berurutan, jalur pertama yang berhasil dipakai) |
|---|---|
| Instagram | Apify ▸ OpenCLI (cari akun → unggahan terbaru) ▸ jembatan ▸ Firecrawl ▸ Exa |
| TikTok | Apify ▸ OpenCLI ▸ jembatan ▸ Firecrawl ▸ Exa |
| Threads | Apify (`headply~threads-scraper`) ▸ Firecrawl ▸ Exa |
| YouTube | Data API ▸ yt-dlp ▸ OpenCLI ▸ jembatan ▸ Firecrawl ▸ Exa |
| Komentar TikTok / Instagram | Apify (`clockworks~tiktok-comments-scraper`, `apify~instagram-comment-scraper`) |
| Web & blog | Firecrawl ▸ Exa |
| Firecrawl (crawl media) | berita + web Indonesia ▸ media bisnis/marketing/startup & gaya hidup ▸ media nasional ▸ map situs prioritas |
| RSS | penemuan feed otomatis dari ratusan media + feed pencarian WordPress |

Untuk hasil terbaik di Instagram, TikTok, dan Threads isi `APIFY_TOKEN`. Tanpa token, kanal tersebut memakai Firecrawl / Exa (hasil lebih sedikit).

## Menjalankan di laptop (Windows CMD)

```bat
cd /d "D:\Ghilman Nafadza Hakim\dnvb sosmedtracker"
npm install
copy .env.example .env.local
REM isi SUMOPOD_API_KEY, APIFY_TOKEN, YOUTUBE_API_KEY dst. di .env.local
npm run dev
```

Buka http://localhost:3000 (landing) dan http://localhost:3000/dashboard (aplikasi). `npm run dev` menjalankan frontend **dan** API sekaligus.

Uji: `npm test` · Cek tipe + build produksi: `npm run build`

## Environment variables

| Variabel | Fungsi |
|---|---|
| `SUMOPOD_API_KEY` (disarankan) atau `GEMINI_API_KEY` | Analisis sentimen AI, ringkasan, Tanya Data, saringan makna |
| `APIFY_TOKEN` | Instagram, TikTok, Threads (+ komentar), X, Facebook |
| `APIFY_COMMENTS=0` | Matikan pengambilan komentar TikTok/Instagram |
| `YOUTUBE_API_KEY` | Video + komentar YouTube |
| `FIRECRAWL_API_KEY` / `FIRECRAWL_API_URL` | Crawl media web & jalur cadangan sosmed |
| `EXA_API_KEY` | Exa dengan filter domain & tanggal (tanpa kunci memakai MCP publik) |
| `BLOB_READ_WRITE_TOKEN` | Foto tokoh/kreator permanen di Vercel Blob |

Daftar lengkap ada di `.env.example`.

## Deploy ke Vercel

1. Import repo di vercel.com (framework Vite, `vercel.json` sudah disiapkan).
2. **Settings → Environment Variables**: isi `SUMOPOD_API_KEY`, `APIFY_TOKEN`, `YOUTUBE_API_KEY` (opsional lainnya).
3. Opsional: **Storage → Blob** (public) agar foto tokoh tersimpan permanen.
4. Redeploy, lalu cek halaman **Sumber Data** di dashboard.

## Menambah brand klien

Dashboard → **Tambah brand** → isi nama, jenis (Brand klien / Kompetitor), akun resmi (tanpa @), konteks AI (apa brand ini dan apa yang BUKAN brand ini), kata kunci, kanal → **Simpan brand** → **Mulai pantau**.

## Metodologi singkat

- Sentimen dinilai **terhadap brand**, bukan nada umum unggahan.
- Rasio positif/negatif pada narasi dihitung dari sebutan berpolaritas (positif + negatif); netral dikecualikan.
- Tier media web: 1 = nasional arus utama, 2 = bisnis/marketing/startup & gaya hidup, 3 = lainnya.
- Peringatan dini: lonjakan negatif harian (≥ rata-rata + 2σ), isu dengan ≥ 40% negatif, berita negatif di Tier 1, unggahan negatif berinteraksi tinggi.
- Logo platform dari paket `simple-icons` (CC0); merek dagang milik pemiliknya, dipakai hanya untuk menandai sumber.
