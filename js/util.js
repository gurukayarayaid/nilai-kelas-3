/* ============ FUNGSI BANTUAN UMUM ============ */
const Util = {
    esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /* Rumus NA (rata-rata PH x 50% + ATS x 25% + AAS x 25%) */
    hitungNA(g) {
        if (!g) return 0;
        const ph1 = +g.ph1 || 0, ph2 = +g.ph2 || 0, ph3 = +g.ph3 || 0, ph4 = +g.ph4 || 0;
        const ats = +g.ats || 0, aas = +g.aas || 0;
        const rataPH = (ph1 + ph2 + ph3 + ph4) / 4;
        return (rataPH * 0.5) + (ats * 0.25) + (aas * 0.25);
    },

    nilai(db, studentId, subject, semester) {
        return db.grades.find(g =>
            g.student_id === studentId && g.subject === subject && g.semester === semester
        ) || null;
    },

    setNilai(db, studentId, subject, semester, field, value) {
        let g = Util.nilai(db, studentId, subject, semester);
        if (!g) {
            g = { student_id: studentId, subject: subject, semester: semester, ph1: 0, ph2: 0, ph3: 0, ph4: 0, ats: 0, aas: 0 };
            db.grades.push(g);
        }
        g[field] = value;
        return g;
    },

    tglIndo(d) {
        d = d || new Date();
        const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        return d.getDate() + ' ' + bulan[d.getMonth()] + ' ' + d.getFullYear();
    },

    /* Isi <select> dengan daftar pilihan */
    isiSelect(el, items, nilaiTerpilih) {
        el.innerHTML = items.map(i =>
            `<option value="${Util.esc(i)}"${i === nilaiTerpilih ? ' selected' : ''}>${Util.esc(i)}</option>`
        ).join('');
    },

    tampilNilai(v) {
        const n = +v || 0;
        return n > 0 ? n : '-';
    }
};
