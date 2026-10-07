/* ============================================================
   KONFIGURASI APLIKASI
   ------------------------------------------------------------
   repo   : "username/nama-repo"  (kosongkan "" = deteksi otomatis
            dari alamat GitHub Pages, atau mode lokal/offline)
   token  : JANGAN ditulis di sini. Token disimpan lewat halaman
            Pengaturan dan hanya ada di localStorage browser guru.
   ============================================================ */
window.APP_CONFIG = {
    repo: "",              // contoh: "budianggraini/nilai-kelas-3"
    branch: "main",
    path: "data/db.json",
    teacherPassword: "alal",
    pollMs: 5000,          // interval cek data terbaru (murid & guru)
    saveMs: 700,           // tunda simpan agar tidak terlalu sering
    fetchTimeoutMs: 6000   // batas waktu ambil data per sumber
};

/* Pengaturan cetak bawaan (dipakai bila repo belum punya data) */
window.DEFAULT_CONFIG = {
    gunakan_kop: "ya",
    logo_kiri: "assets/logo-sidoarjo.png",
    instansi_1: "PEMERINTAH KABUPATEN SIDOARJO",
    instansi_2: "DINAS PENDIDIKAN DAN KEBUDAYAAN",
    nama_sekolah: "SD NEGERI SEMAMBUNG",
    alamat_sekolah: "Desa Semambung, Jabon, Sidoarjo, Jawa Timur 61276",
    email_sekolah: "sdnsemambungjabon@gmail.com",
    logo_kanan: "assets/logo-sekolah.png",
    nama_kota: "Jabon",
    jabatan_kasek: "Kepala Sekolah",
    nama_kasek: "NAMA KEPALA SEKOLAH, S.Pd",
    nip_kasek: "19800101 200501 1 001",
    jabatan_walas: "Guru Kelas III",
    nama_walas: "NAMA GURU KELAS, S.Pd",
    nip_walas: "19900202 201502 2 002"
};

window.SUBJECTS = ['PKn', 'Bahasa Indonesia', 'Matematika', 'IPAS', 'Seni Rupa', 'Bahasa Inggris', 'Basa Jawa'];
window.SEMESTERS = ['Ganjil', 'Genap'];
window.FIELDS_LABEL = {
    ph1: 'Penilaian Harian 1 (PH1)',
    ph2: 'Penilaian Harian 2 (PH2)',
    ph3: 'Penilaian Harian 3 (PH3)',
    ph4: 'Penilaian Harian 4 (PH4)',
    ats: 'Asesmen Tengah Semester (ATS)',
    aas: 'Asesmen Akhir Semester (AAS)'
};
