# 📡 Fiber Map TS — Arsitektur & Dokumentasi Fitur

> **Dashboard Web Monitoring Jaringan Fiber Optik**
> Stack: React 19 + TypeScript + MapLibre GL + Zustand + Vite + Tailwind CSS v4

---

## 📁 Struktur Direktori

```
fiber-map-ts/
├── src/
│   ├── App.tsx                        # Root komponen, menyusun seluruh layout
│   ├── main.tsx                       # Entry point React
│   ├── index.css / App.css            # Global styling (dark/light tokens)
│   │
│   ├── store/
│   │   └── useAppStore.ts             # State management global (Zustand)
│   │
│   ├── utils/
│   │   └── kmzParser.ts               # Parser file .KMZ → GeoJSON
│   │
│   └── components/
│       ├── FiberMap.tsx               # Core MapLibre Map (UTAMA, 1.400+ baris)
│       ├── FiberSegmentModal.tsx      # Modal detail kabel segmen
│       ├── MapFilterLegendPanel.tsx   # Panel filter & legenda peta
│       ├── XccPanel.tsx               # Panel detail Cross Connect Cabinet
│       ├── RouteBuilderModal.tsx      # Modal Route Builder A-Z
│       ├── SearchSubmenu.tsx          # Pencarian node/segmen
│       ├── AlertDrawer.tsx            # Drawer detail alert node
│       ├── AlertToast.tsx             # Toast notifikasi alert
│       ├── StatCards.tsx              # KPI Counter (Normal/Warning/Critical)
│       ├── MultiSegmentBar.tsx        # Bar multi-select segmen kabel
│       ├── Sidebar.tsx                # Sidebar navigasi kiri
│       ├── PopDetailsModal.tsx        # Modal detail node POP
│       ├── OdpDetailsModal.tsx        # Modal detail node ODP
│       ├── ActiveRouteBanner.tsx      # Banner rute aktif A→Z
│       └── MapSelectionBanner.tsx     # Banner mode pilih segmen
│
├── public/                            # Asset statis
├── index.html                         # HTML shell
├── package.json                       # Dependencies
├── vite.config.ts                     # Vite bundler config
└── ARCHITECTURE.md                    # Dokumen ini (di folder proyek)
```

---

## 🏗️ Arsitektur Teknis

### Tech Stack

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| UI Framework | React | 19.x |
| Bahasa | TypeScript | ~6.0.2 |
| Peta / Map Engine | MapLibre GL + react-map-gl | 6.x / 8.x |
| State Management | Zustand | 5.x |
| Styling | Tailwind CSS v4 | 4.x |
| Animasi | Framer Motion | 13.x |
| Icon | Lucide React | 1.x |
| GeoData Parser | @tmcw/togeojson + jszip | 7.x / 3.x |
| Bundler | Vite | 8.x |
| Linter | oxlint | - |

### Base Map
- **Dark Mode**: `basemaps.cartocdn.com/gl/dark-matter-gl-style` (default)
- **Light Mode**: `basemaps.cartocdn.com/gl/positron-gl-style`

---

## 🗺️ State Management (Zustand — `useAppStore.ts`)

### Interface & Model Data Utama

#### `NodeData`
```typescript
{
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  status: 'normal' | 'warning' | 'critical';
  attenuation: number;
  segment: string;
  type?: 'ODC' | 'XCC' | 'POP' | 'ODP' | 'HH' | 'Tiang';
  technicianNotes?: string;
  statusHandling?: 'open' | 'in progress' | 'resolved';
}
```

#### `FiberSegmentData`
```typescript
{
  id: string;
  name: string;
  lengthKm: number;
  customerTrunk: string;
  technicalData: string;          // ex: "Kapasitas Kabel: 96 Core, 48 Core • Single-Mode G.652D"
  coreCount?: number;
  attenuationRate?: number;
  nodeA?: string;
  nodeZ?: string;
  customDrawnGreenCoords?: [number, number][]; // koordinat gambar manual
  sorFiles: SorFileRecord[];
}
```

#### `SorFileRecord`
```typescript
{
  id: string;
  name: string;
  size: string;
  uploadDate: string;
  wavelength?: string;
  fiberLengthKm?: number;
  totalLossDb?: number;
  orlDb?: number;
  eventsCount?: number;
}
```

#### `MapFilters`
```typescript
{
  pop: boolean;    // POP node markers
  xcc: boolean;    // XCC node markers
  odp: boolean;    // ODP node markers
  hh: boolean;     // Handhole node markers
  pole: boolean;   // Tiang (utility pole) markers
  kabel96: boolean; // Kabel 96 Core lines
  kabel48: boolean; // Kabel 48 Core lines
  kabel24: boolean; // Kabel 24 Core lines
  kabel12: boolean; // Kabel 12 Core lines
}
```

#### `OtdrFaultSpot`
```typescript
{
  segmentId: string;
  segmentName: string;
  eventName: string;
  eventType: 'macrobend' | 'splice' | 'connector' | 'break';
  distanceKm: number;
  lossDb: number;
  coords: [number, number];
}
```

#### `RouteBuilderState`
```typescript
{
  isOpen: boolean;
  pointA: { label: string; coords: [number, number] | null };
  pointZ: { label: string; coords: [number, number] | null };
  pickingMode: 'none' | 'pointA' | 'pointZ';
  activeDirection: 'all' | 'left' | 'right';
  activeCableName: string | null;
  candidates: RouteCandidateOption[];
  selectedCandidateIndex: number;
}
```

### State Actions Utama

| Action | Deskripsi |
|--------|-----------|
| `setNodes()` | Load nodes dari KMZ ke store + hitung KPI |
| `toggleMapFilter(key)` | Toggle tampilan layer peta real-time |
| `resetMapFilters()` | Reset semua filter ke aktif |
| `getOrCreateSegmentData()` | Lazy-create segment record |
| `updateSegmentData()` | Update data teknis segmen (nama, trunk, technicalData) |
| `addSorFileToSegment()` | Tambah file .SOR ke segmen |
| `removeSorFileFromSegment()` | Hapus file .SOR dari segmen |
| `startDrawingGreenLine()` | Aktifkan mode gambar kabel manual |
| `addGreenLinePoint()` | Tambah waypoint saat mode gambar |
| `undoGreenLinePoint()` | Undo waypoint terakhir |
| `finishDrawingGreenLine()` | Simpan hasil gambar kabel + hitung jarak |
| `cancelDrawingGreenLine()` | Batal mode gambar |
| `openRouteBuilder()` / `closeRouteBuilder()` | Modal route builder A-Z |
| `setActiveOtdrFaultSpot()` | Fly-to titik event OTDR di peta |
| `toggleMultiSelectMode()` | Mode pilih multiple segmen |
| `toggleSelectSegment()` | Tambah/hapus segmen dari selection |
| `toggleTheme()` | Switch dark/light mode |
| `calculateKpi()` | Hitung KPI Normal/Warning/Critical dari nodes |
| `updatePortConfig()` | Update konfigurasi port XCC |
| `updateTrayLabel()` | Rename label tray XCC |
| `updateTrayTarget()` | Assign tray ke node target |
| `updateNodeName()` | Rename node |

---

## 🧩 Komponen & Fitur Detail

---

### 🗺️ `FiberMap.tsx` — Core Map Engine

**Fungsi utama:**
- Import dan parse file `.KMZ` → GeoJSON → render ke MapLibre
- Tampilkan fiber cable line dengan warna berdasarkan kapasitas core
- Render node markers: POP, XCC, ODP, HH, Tiang dengan custom HTML badge
- Dynamic filter map layer berdasarkan `mapFilters` di store (real-time hide/show)
- Chaikin smoothing algorithm untuk memperhalus garis kabel
- Klik kabel → buka `FiberSegmentModal`
- Klik node POP → buka `PopDetailsModal`
- Klik node ODP → buka `OdpDetailsModal`
- Klik node XCC → buka `XccPanel`
- Gambar kabel hijau manual (drawing mode) dengan multi waypoint
- Route builder: deteksi otomatis jalur A-Z menyusuri kabel existing
- Fly-to animasi saat klik titik event OTDR di peta
- Tampilkan bending/fault spot marker di peta dengan tombol copy LatLong
- Multi-select mode segmen kabel
- Dark/Light mode toggle base map

**Layer MapLibre GL:**

| Layer ID | Tipe | Fungsi |
|----------|------|--------|
| `fiber-line-glow` | line | Efek glow warna kabel (blur, opacity 75%) |
| `fiber-line-normal` | line | Garis kabel utama |
| `fiber-line-arrows` | symbol | Tanda panah arah kabel (▶) |
| `fiber-green-line-layer` | line | Gambar manual kabel hijau |
| `route-highlight-line` | line | Rute aktif A-Z highlight |

**Algoritma Utama:**
- `smoothLineCoordinates()` — Chaikin corner-cutting untuk smooth kabel
- `sliceSubSegmentCoords()` — Potong sub-segmen antara A dan Z
- `traceWaypointsAlongExistingLines()` — Ikuti jalur kabel existing antar waypoint
- `coreCapacity` classification — Auto-assign kapasitas per feature berdasarkan `technicalData`

---

### 📋 `FiberSegmentModal.tsx` — Modal Detail Kabel Segmen

**Fitur:**
- Nama segmen editable (inline edit dengan tombol save/cancel)
- Panjang kabel (km) auto-kalkulasi
- Status badge (Normal, dB/km attenuation rate)
- Edit Pelanggan/Trunk (free text)
- Edit Data Teknis (textarea)
- **Multi-select kapasitas core kabel** — chip button 96/48/24/12 Core (bisa dipilih multiple sekaligus, auto-update `technicalData`)
- Gambar ulang kabel (Drawing Mode) — trigger mode kabel hijau di peta
- Upload file `.SOR` (OTDR measurement) multiple file
- Analisis file .SOR: grafik trace OTDR authentic (SVG), event list, splice loss, macrobend detection
- Fly-to titik event OTDR di peta + buka fault spot marker
- Simpan semua perubahan (rute, data teknis, file .SOR) dengan satu tombol
- Toast konfirmasi simpan

---

### 🔵 `MapFilterLegendPanel.tsx` — Panel Filter & Legenda

**Fitur:**
- Floating panel glassmorphism (`bg-slate-950/85 backdrop-blur-xl`) pojok kanan atas
- Collapsible accordion (chevron toggle)
- Tombol "Tampilkan/Sembunyikan Semua" dan "Reset Filter"
- Filter 9 kategori dengan ikon custom:

| Filter | Icon | Badge |
|--------|------|-------|
| POP | Emerald rotate-diamond + Radio | Jumlah unit |
| XCC | Amber rectangle + Database | Jumlah unit |
| ODP | Cyan box + Box icon | Jumlah unit |
| HH | Pink rotate-diamond + Hexagon | Jumlah unit |
| Tiang | Silver circle + SVG crossarm | Jumlah unit |
| Kabel 96 Core | Indigo thick line | Total meter (m) |
| Kabel 48 Core | Cyan medium line | Total meter (m) |
| Kabel 24 Core | Emerald thin line | Total meter (m) |
| Kabel 12 Core | Amber dashed line | Total meter (m) |

- Toggle filter langsung hides/shows elemen di peta secara real-time
- Cable meter dihitung: `sum(lengthKm) * 1000` dari `segmentStoreMap`

---

### 📦 `XccPanel.tsx` — Panel Cross Connect Cabinet (66KB)

**Fitur:**
- Detail port-level management XCC node
- Konfigurasi port per tray: status, service name, dest node, attenuation, connector type
- Edit nama tray (rename)
- Assign tray target ke node lain
- Trigger view route (fly-to & highlight) dari port ke destination node
- Map picker untuk assign source/target secara langsung dari peta

---

### 🛣️ `RouteBuilderModal.tsx` — Route Builder A-Z

**Fitur:**
- Set titik A dan titik Z via klik di peta atau input manual
- Auto-detect jalur kabel existing antara A dan Z
- Tampilkan kandidat rute dengan jarak km
- Preview rute di peta dengan highlight amber/kuning
- Arah filter: All / Left / Right
- Filter berdasarkan nama kabel

---

### 🔍 `SearchSubmenu.tsx` — Pencarian

- Cari node berdasarkan nama
- Cari segmen kabel
- Fly-to hasil pencarian di peta
- Filter berdasarkan type (POP, XCC, ODP, dll.)

---

### 🚨 `AlertDrawer.tsx` — Drawer Alert Node

- Detail info node yang bermasalah
- Status handling: open / in progress / resolved
- Catatan teknisi (editable)
- Riwayat attenuation

---

## 🎨 Sistem Warna Kabel di Peta (5 Warna Unik & Bebas Bentrok)

| Kapasitas / Status | Warna | Hex | Glow Hex | Ketebalan | Karakter |
|--------------------|-------|-----|----------|-----------|----------|
| **96 Core** | Deep Indigo / Biru Ungu | `#6366F1` | `#818CF8` | 5.0px | Kapasitas Terbesar |
| **48 Core** | Cyan Elektrik / Biru Muda | `#00E5FF` | `#00E5FF` | 4.0px | Kapasitas Menengah Tinggi |
| **24 Core** | Emerald Green / Hijau | `#10B981` | `#34D399` | 3.2px | Kapasitas Menengah |
| **12 Core** | Amber Gold / Kuning Oranye | `#F59E0B` | `#FBBF24` | 2.5px | Kapasitas Distribusi |
| **Selected / Terpilih** | **Laser Rose Magenta / Pink Neon** | `#FF007F` | `#FF007F` | 6.5px | **Highlight Kabel Aktif** |
| **Mode Gambar Kabel** | **Laser Rose Magenta / Pink Neon** | `#FF007F` / `#FF2D55` | `#FF007F` | 6.0px | **Preview Jalur Trace Gambar** |

> [!NOTE]
> Semua warna kabel di atas memiliki spektrum warna yang sepenuhnya independen (Indigo, Cyan, Green, Amber, Magenta), sehingga tidak ada satupun warna kabel yang tertukar atau mirip satu sama lain.

---

## 📊 KPI Dashboard (StatCards)

| Status | Kondisi | Warna |
|--------|---------|-------|
| Normal | `node.status === 'normal'` | Cyan |
| Warning | `node.status === 'warning'` | Amber |
| Critical | `node.status === 'critical'` | Red |

Dihitung otomatis via `calculateKpi()` setiap kali `setNodes()` dipanggil.

---

## 📝 Changelog Fitur

### v0.17 — 2026-08-10 ✅ Terkini
- **Integrasi Rute Jaringan Jalan Real Maps (Gratis via OSRM Engine)**:
  - Mengintegrasikan API perutean jaringan jalan raya gratis tanpa API key ([OSRM](https://project-osrm.org/)) di [`realRoadRouter.ts`](file:///Users/macpro/Library/CloudStorage/OneDrive-LINTASARTA/File%20Kerjaan/Program/Laravel%20Fillament/Dashboard-Web-Route-ONESEO/fiber-map-ts/src/utils/realRoadRouter.ts) sehingga jalur kabel yang digambar dari Point A ke Point Z secara otomatis menyusuri jalan raya/jalanan nyata (seperti fitur rute di Google Maps).
  - Jarak rute kabel dihitung dengan akurasi meter (`m`) berdasarkan panjang jalan raya sesungguhnya, lengkap dengan status badge `🛣️ REAL ROAD` pada toolbar dan marker Point Z.
  - Opsi rute di `RouteBuilderModal` memprioritaskan kandidat rute jalan raya dengan keterangan jarak meter dan kilometer.

### v0.16 — 2026-08-10
- **Live Meter Distance Counter Point A ke Point Z**: Menambahkan kalkulasi jarak kumulatif real-time dalam satuan meter (`m`) dan kilometer (`km`) saat menggambar rute kabel (Point A ke Point Z). Informasi jarak ditampilkan secara dinamis di **Toolbar Mode Gambar Kabel** (`📏 JARAK A ➔ Z: 14,250 m`) dan pada **Badge Marker Point Z** (`🎯 POINT Z • 📏 14,250 m`).

### v0.15 — 2026-08-10
- **Perbaikan Layout Footer Modal Kabel (`FiberSegmentModal`)**: Menyesuaikan dimensi modal menjadi `max-w-4xl max-h-[92vh] flex flex-col` dengan container body yang dapat di-scroll (`overflow-y-auto`) serta merapikan tombol footer (`shrink-0 justify-end`) sehingga tombol **`TUTUP`** dan **`SIMPAN PERUBAHAN SEGMENT`** tampil utuh, presisi, dan tidak terpotong pada berbagai resolusi layar.

### v0.14 — 2026-08-10
- **Eksklusifitas Warna Selector & Mode Gambar Kabel (Laser Rose Magenta `#FF007F`)**: Menetapkan warna kabel selector terpilih (`isSelected`) serta jalur gambar manual (`isDrawingGreenLine`) menggunakan warna **Laser Rose Magenta / Pink Neon (`#FF007F` / `#FF2D55`)** yang 100% berbeda dan bebas bentrok dari semua 4 kapasitas kabel (96 Core Indigo, 48 Core Cyan, 24 Core Emerald Green, dan 12 Core Amber Gold).

### v0.13 — 2026-08-10
- **Hapus Menu Floating Multi-Pilih Kabel**: Menghapus tombol floating `MULTI-PILIH KABEL` dari antarmuka peta (`App.tsx`) agar tampilan peta lebih bersih dan fokus.

### v0.12 — 2026-08-10
- **Full Light Mode & Dark Mode Contrast Adaptation**: Seluruh modal (`FiberSegmentModal`, `PopDetailsModal`, `OdpDetailsModal`, `RouteBuilderModal`), panel filter (`MapFilterLegendPanel`), drawer alert (`AlertDrawer`), submenu pencarian (`SearchSubmenu`), banner jumper rute (`ActiveRouteBanner`), dan multi-select bar dioptimalkan kontrasnya sehingga semua teks, header, tabel OTDR, dan badge terbaca sangat jelas di mode terang maupun gelap.
- **Base CSS Color Tokens Synchronization**: Mengganti pewarnaan dasar `body` di `index.css` menggunakan `text-text-primary` agar seluruh teks mewarisi warna kontras yang tepat saat berganti tema.
- **Badge Permanen Marker XCC di Peta**: Marker XCC di peta kini dilengkapi label badge permanen `XCC` berwarna Amber (Oranye) di sudut kanan bawah ikon server, konsisten dengan POP (Emerald) dan ODP (Cyan).

### v0.11 — 2026-08-07
- **Satuan Meter (m) pada Counter Kabel**: Badge kapasitas kabel di panel filter menampilkan total panjang dalam meter (`14,250 m`, `28,400 m`, dll.)
- **Dynamic Cable Hiding**: Toggle filter kapasitas kabel langsung menyembunyikan/menampilkan jalur kabel di peta secara real-time
- **Klasifikasi Warna Core**: Kabel diklasifikasikan otomatis ke 4 kapasitas (96/48/24/12 Core) dengan warna berbeda di peta

### v0.10 — 2026-08-07
- **Multi-Select Kapasitas Core Kabel**: Chip button 96/48/24/12 Core di modal kabel, bisa multi-select
- **Hapus keterangan label kapasitas**: Label panel filter dibersihkan dari teks dalam tanda kurung

### v0.9 — 2026-08-07
- **Live Counter Badge Kabel**: Badge counter kapasitas kabel muncul di panel filter

### v0.8 — 2026-08-07
- **Panel Filter & Legenda Peta** (`MapFilterLegendPanel.tsx`): Panel glassmorphism floating baru dengan 9 kategori filter, ikon custom, badge counter, toggle all/reset

### v0.7 — 2026-08-06
- **Warna Kabel Konsisten**: Kabel existing biru/cyan, kabel terpilih amber, menutup modal → warna kembali ke existing
- **OTDR Fault Spot di Peta**: Marker titik bending/loss di peta, tombol copy LatLong & kembali ke modal kabel
- **Metrik dB/km pada OTDR**: Mengganti `Optical Return Loss` dengan `Rata-rata Redaman (dB/km)`, grafik OTDR authentic

### v0.6 — 2026-08-06
- **Simpan Perubahan Jalur + Data Teknis + SOR**: Tombol simpan semua perubahan di modal kabel

### v0.5 — 2026-08-06
- **Upload & Analisis File .SOR OTDR**: Multi-file upload, analisis grafik trace, event detection

### v0.4 — 2026-08-05
- **Drawing Mode Kabel Hijau**: Gambar ulang jalur kabel secara manual di atas peta
- **Route Builder A-Z**: Deteksi rute otomatis menyusuri jalur kabel existing
- **Multi-Waypoint Routing**: Titik waypoint berganda untuk akurasi rute

### v0.3 — 2026-08-04
- **Import File .KMZ**: Upload file KMZ dari Google Earth, parse ke GeoJSON dan render di peta
- **Node Marker POP, XCC, ODP, HH, Tiang**: Custom HTML badge marker masing-masing tipe node
- **Modal Detail Kabel Segmen**: Klik kabel → modal informasi lengkap

### v0.2 — 2026-08-04
- **XCC Panel**: Panel manajemen port-level Cross Connect Cabinet
- **Search**: Pencarian node dan segmen kabel
- **Alert Drawer**: Drawer detail node bermasalah

### v0.1 — 2026-08-04
- **Dark/Light Mode**: Toggle tema dark/light pada peta dan UI
- **KPI StatCards**: Counter KPI Normal/Warning/Critical
- **Sidebar Navigation**: Navigasi kiri dengan ikon

---

## 📌 Catatan Developer Penting

1. **GeoJSON dari KMZ**: Semua kabel diambil dari `.kmz` yang diupload. Feature `name` property harus unik agar bisa di-match ke `segmentStoreMap`.
2. **Segment Store**: `segmentStoreMap` di Zustand adalah sumber kebenaran untuk data teknis tiap segmen. Di-index oleh `name` dan `id` sekaligus untuk lookup cepat.
3. **Filter Kabel**: Filter kapasitas kabel bekerja dengan meng-assign property `coreCapacity` (`kabel96`/`kabel48`/`kabel24`/`kabel12`) ke setiap feature GeoJSON saat `linesGeoJson` memo dihitung. Default assignment bergilir jika `technicalData` belum di-set.
4. **SOR File**: File `.SOR` disimpan sebagai `SorFileRecord[]` di `FiberSegmentData.sorFiles`. Analisis OTDR dilakukan client-side berdasarkan metadata SOR.
5. **Drawing Mode**: Saat mode gambar aktif (`isDrawingGreenLine: true`), `selectedSegment` dikosongkan sementara agar modal tidak overlap.
6. **Warna Kabel Reset**: Saat modal kabel ditutup (`setSelectedSegment(null)`), semua kabel otomatis kembali ke warna klasifikasi kapasitas masing-masing (karena `isSelected` kembali `false`).

---

## 🚀 Cara Menjalankan

```bash
# Development (hot reload)
npm run dev

# Build production
npm run build

# Preview build hasil
npm run preview

# Lint
npm run lint
```

---

*Dokumen ini perlu di-update setiap kali ada perubahan fitur atau arsitektur baru.*
*Last updated: 2026-08-07*
