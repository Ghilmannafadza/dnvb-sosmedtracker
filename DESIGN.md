# DESIGN.md · DNVB Sosmed Tracker

Seluruh bahasa visual diturunkan dari **dnvbindonesia.com** (dibaca langsung dari CSS, DOM, dan aset produksi situs, November 2026). Tujuannya: landing page dan dashboard terasa sebagai bagian dari ekosistem DNVB.

## Token

| Peran | Nilai | Sumber di dnvbindonesia.com |
|---|---|---|
| Primer | `#F55D9E` | Tombol "Daftar", "Take your chance!", bilah nprogress |
| Sekunder | `#346BC8` | Hover tombol (`hover:bg-secondary`), badge "DNVB BUSINESS SCHOOL", pita marquee, teks testimoni |
| Teks | `#101820` | Warna teks utama |
| Teks sekunder | `#585E63` | Navigasi, keterangan |
| Garis / ubin | `#E7E8E9` | Border, ubin bento statistik |
| Navy section | `#0D1420`, `#192430` | Section "2 hours. business transformed.", membership, footer |
| Pink lembut | `#FEEFF5` | Latar sorotan |
| Dekoratif | `#FF6D00` oranye, `#1DD460` hijau, `#F4BF41` kuning | `shapes-1-1.png`, `shapes-5.png`, `Vector-2.png` |

**Sentimen** memakai warna dekoratif DNVB: positif = hijau `#1DD460`, netral = biru `#346BC8`, negatif = oranye `#FF6D00` (teks gelap `#0B7A37` / `#2A58A6` / `#C2410C` agar lolos kontras AA). Pink tetap untuk aksi, bukan data.

## Tipografi

Plus Jakarta Sans 200 sampai 800 (sama dengan situs). Judul bold 700 dengan tracking rapat; teks isi 13 sampai 16px; angka bento bobot medium.

## Komponen

- **Tombol panah** (`.btn-arrow`, `ArrowButton`): pil pink; saat hover warna jadi biru, panah kanan bergeser keluar dan panah kiri masuk (300ms ease-in-out). Diturunkan dari `.button-component-animation` di situs.
- **Eyebrow**: pil kapital biru lembut ("DNVB BUSINESS SCHOOL"), varian hitam di section gelap ("PRODUK VIDEO", "CONNECT WITH US").
- **Tab**: teks dengan garis bawah pink yang memanjang (tab "Produk Video Terbaru").
- **Section gelap**: navy dengan sudut kiri atas membulat besar (landing: kedua sudut atas).
- **Bento**: ubin abu `#E7E8E9` sudut 20px, label kecil di atas, angka besar; ubin bintang ungu & oranye.
- **Kartu**: putih, garis `#E7E8E9`, sudut 20px, judul bold.

## Motion

| Motion | Implementasi | Sumber |
|---|---|---|
| Reveal fade 400ms / slide-up 500ms "ease", berurutan | `[data-r]` + IntersectionObserver (landing), `useReveal` / `Reveal` / `Card` / `Kpi` (dashboard) | react-awesome-reveal (`animation-os2n7p`, `animation-580wcl`) |
| Judul hero per baris naik dari bawah (delay 0,01s bertahap) | `.line-mask` | kaskade judul hero |
| Marquee linear tanpa henti, berhenti saat hover | `.marquee-track` | react-fast-marquee (kartu speaker, logo, pita biru) |
| Parallax bentuk hero saat gulir | `data-px` | bentuk dekoratif hero (`will-change: transform`) |
| Bilah progres pink + glow | `#nprogress`, `.top-progress` (saat pemantauan berjalan) | nprogress |
| Tombol kembali ke atas pink bulat | `.top` | tombol kanan bawah |
| Hover kartu naik 6px | `.mcard`, `.fcard` | kartu produk |

Semua animasi dimatikan pada `prefers-reduced-motion` dan saat dicetak.

## Aset

`public/dnvb/` berisi aset resmi dari dnvbindonesia.com: `logo.png` (wordmark dnvb), `arrow-right.png`, `shape-flower.png`, `shape-d.png`. Ikon bintang dan tanda kutip digambar ulang sebagai SVG. Foto speaker dan logo brand mitra di situs **tidak** dipakai (hak milik pihak lain); kartu sebutan di landing adalah contoh ilustrasi yang diberi label jelas.

## Konten

- Bahasa Indonesia, tanpa em dash pada teks UI.
- Semua angka di dashboard berasal dari data pantauan; contoh di landing diberi label "contoh ilustrasi".
- Setiap tampilan data punya keadaan kosong, memuat, dan gagal.
