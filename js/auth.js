/* ============ LOGIN & SESI ============ */
const Auth = {
    role() { return sessionStorage.getItem('nilai_role') || ''; },
    studentId() { return +sessionStorage.getItem('nilai_student') || 0; },

    loginGuru(password) {
        if (password !== window.APP_CONFIG.teacherPassword) return false;
        sessionStorage.setItem('nilai_role', 'guru');
        sessionStorage.removeItem('nilai_student');
        return true;
    },

    /* Verifikasi NIS terhadap data murid */
    loginMurid(namaTerpilih, nis) {
        const db = Store.get();
        const murid = db.students.find(s => s.name === namaTerpilih);
        if (!murid) return { ok: false, msg: 'Nama murid tidak ditemukan. Muat ulang halaman.' };
        if (!murid.nis) return { ok: false, msg: 'NIS murid ini belum diisi. Hubungi guru.' };
        if (String(murid.nis).trim() !== String(nis).trim()) return { ok: false, msg: 'Nomor Induk Siswa tidak sesuai.' };
        sessionStorage.setItem('nilai_role', 'murid');
        sessionStorage.setItem('nilai_student', String(murid.id));
        return { ok: true };
    },

    logout() {
        sessionStorage.clear();
        location.href = 'index.html';
    },

    /* Penjaga halaman: panggil di awal halaman */
    wajib(peran) {
        if (this.role() !== peran) {
            location.replace('index.html');
            return false;
        }
        return true;
    },

    muridAktif() {
        const db = Store.get();
        return db.students.find(s => s.id === this.studentId()) || null;
    }
};
