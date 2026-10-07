/* ============================================================
   STORE — penyimpanan data + sinkronisasi GitHub
   ------------------------------------------------------------
   - Sumber data utama : data/db.json di dalam repo GitHub
   - Baca (murid/guru) : raw.githubusercontent.com (tanpa token)
                         atau API GitHub bila token tersedia
   - Tulis (guru)      : GitHub Contents API (butuh Personal Access
                         Token yang diisi di halaman Pengaturan)
   - Cadangan lokal    : localStorage browser agar tetap bisa
                         dibuka saat offline
   ============================================================ */
const Store = (function () {
    const LS_DB = 'nilai_db_v1';
    const LS_TOKEN = 'nilai_github_token';
    const LS_REPO = 'nilai_repo_override';
    const LS_PENDING = 'nilai_pending';

    let db = null;
    let dirty = false;
    let timerSimpan = null;
    let timerPoll = null;
    let cbStatus = null;
    let cbRemote = null;
    let cbSimpan = [];
    let lastRemoteKey = '';
    let sedangTarik = false;

    function umumkanSimpan(ok, pesan) {
        cbSimpan.forEach(function (fn) {
            try { fn({ ok: ok, pesan: pesan }); } catch (e) { console.error(e); }
        });
    }

    /* ---------- konfigurasi ---------- */
    const cfg = () => window.APP_CONFIG;

    function token() { return localStorage.getItem(LS_TOKEN) || ''; }

    function repoOverride() { return localStorage.getItem(LS_REPO) || ''; }

    function repoSlug() {
        const ov = repoOverride();
        if (ov) return ov;
        const c = cfg();
        if (c.repo && c.repo.indexOf('/') > 0) return c.repo;
        const h = location.hostname;
        if (h.endsWith('.github.io')) {
            const owner = h.slice(0, -('.github.io'.length));
            const seg = location.pathname.split('/').filter(Boolean);
            const repo = seg.length ? seg[0] : owner + '.github.io';
            return owner + '/' + repo;
        }
        return '';
    }

    function apiUrl() {
        return 'https://api.github.com/repos/' + repoSlug() + '/contents/' + cfg().path;
    }

    function rawUrl() {
        const ts = Date.now();
        return 'https://raw.githubusercontent.com/' + repoSlug() + '/' + cfg().branch + '/' + cfg().path + '?cb=' + ts;
    }

    /* URL same-origin ( GitHub Pages / server lokal ). Domain ini PASTI bisa
       diakses oleh HP siswa karena halaman saja sudah termuat dari sana — jadi
       tetap bisa baca data walau raw.githubusercontent.com terblokir DNS oleh
       provider seluler. */
    function pagesUrl() {
        const p = cfg().path || 'data/db.json';
        return p + (p.indexOf('?') >= 0 ? '&' : '?') + 'cb=' + Date.now();
    }

    /* Same-origin dipakai bila file data memang ikut disajikan oleh host yang
       sedang membuka halaman ini. Dihemat bila repo dipaksa lewat konfigurasi
       atau override, supaya tidak salah membaca data repo lain. */
    function bolehPakaiPages() {
        if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
        if (repoOverride()) return false;
        const dipaksa = (cfg().repo && cfg().repo.indexOf('/') > 0) ? cfg().repo : '';
        if (!dipaksa) return true;
        const h = location.hostname;
        if (h.length <= '.github.io'.length || h.slice(-('.github.io'.length)) !== '.github.io') return false;
        const pemilik = h.slice(0, -('.github.io'.length));
        return dipaksa.split('/')[0] === pemilik;
    }

    /* ---------- status ---------- */
    function setStatus(tipe, teks) { if (cbStatus) cbStatus(tipe, teks); }

    /* ---------- data ---------- */
    function dbKosong() {
        return { updatedAt: 0, config: Object.assign({}, window.DEFAULT_CONFIG), students: [], grades: [] };
    }

    function bersihkan(d) {
        d = d || {};
        d.config = Object.assign({}, window.DEFAULT_CONFIG, d.config || {});
        d.students = Array.isArray(d.students) ? d.students : [];
        d.grades = Array.isArray(d.grades) ? d.grades : [];
        d.updatedAt = +d.updatedAt || 0;
        return d;
    }

    function loadLocal() {
        try {
            const raw = localStorage.getItem(LS_DB);
            if (raw) return bersihkan(JSON.parse(raw));
        } catch (e) { console.warn('Cache lokal rusak', e); }
        return dbKosong();
    }

    function saveLocal(d) {
        try { localStorage.setItem(LS_DB, JSON.stringify(d)); }
        catch (e) { console.warn('Gagal simpan cache lokal', e); }
    }

    function utf8ToB64(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        bytes.forEach(b => bin += String.fromCharCode(b));
        return btoa(bin);
    }

    function b64ToUtf8(b64) {
        const bin = atob(b64.replace(/\s/g, ''));
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    /* ---------- ambil data dari GitHub ---------- */
    /* Semua sumber dicoba BERSAMAANAN (bersamaan) lalu data dengan updatedAt
       paling baru yang dipakai. Dengan begitu guru membaca paling segar dari
       API, murid dari raw/GitHub Pages, dan bila salah satu sumber diblokir
       jaringan tetap ada cadangan — tanpa harus menunggu timeout satu per satu. */
    async function ambilGitHub() {
        const galat = [];
        let ada404 = false;
        const det = typeof cfg().fetchTimeoutMs === 'number' ? cfg().fetchTimeoutMs : 6000;

        const slug = repoSlug();
        const adaToken = !!token();
        const sumber = [];

        if (slug && adaToken) {
            sumber.push({
                label: 'API',
                buka: function (ac) {
                    return fetch(apiUrl() + '?ref=' + encodeURIComponent(cfg().branch), {
                        headers: { 'Authorization': 'token ' + token(), 'Accept': 'application/vnd.github+json' },
                        cache: 'no-store', signal: ac && ac.signal
                    });
                },
                proses: function (t) {
                    const j = JSON.parse(t);
                    return { text: b64ToUtf8(j.content || ''), sha: j.sha };
                }
            });
        }
        if (slug) {
            sumber.push({
                label: 'raw',
                buka: function (ac) { return fetch(rawUrl(), { cache: 'no-store', signal: ac && ac.signal }); },
                proses: function (t) { return { text: t, sha: null }; }
            });
        }
        if (bolehPakaiPages()) {
            sumber.push({
                label: 'halaman',
                buka: function (ac) { return fetch(pagesUrl(), { cache: 'no-store', signal: ac && ac.signal }); },
                proses: function (t) { return { text: t, sha: null }; }
            });
        }

        async function coba(s, urut) {
            const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            let timer = null;
            if (ac) timer = setTimeout(function () { ac.abort(); }, det);
            try {
                const res = await s.buka(ac);
                if (res.status === 404) { ada404 = true; galat.push(s.label + ' 404'); return null; }
                if (!res.ok) { galat.push(s.label + ' ' + res.status); return null; }
                const r = s.proses(await res.text());
                return { urut: urut, label: s.label, obj: JSON.parse(r.text), sha: r.sha };
            } catch (e) {
                galat.push(s.label + ' ' + (e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || 'gagal'));
                return null;
            } finally {
                if (timer) clearTimeout(timer);
            }
        }

        const hasil = (await Promise.all(sumber.map(function (s, i) { return coba(s, i); })))
            .filter(Boolean);

        if (!hasil.length) {
            if (ada404) throw new Error('file-belum-ada');
            if (!slug && !bolehPakaiPages()) throw new Error('repo-belum-diatur');
            throw new Error(galat.length ? galat.join(' | ') : 'gagal-membaca-data');
        }

        let terbaik = hasil[0];
        for (let i = 1; i < hasil.length; i++) {
            const a = hasil[i], b = terbaik;
            const ua = +a.obj.updatedAt || 0, ub = +b.obj.updatedAt || 0;
            if (ua > ub || (ua === ub && a.urut < b.urut)) terbaik = a;
        }
        return { data: terbaik.obj, sha: terbaik.sha, sumber: terbaik.label };
    }

    /* Kirim ulang perubahan yang masih tertunda di browser ini
       (mis. simpanan yang tadi gagal karena token bermasalah). */
    async function kirimTunda() {
        if (dirty) return false;
        if (localStorage.getItem(LS_PENDING) !== '1') return false;
        if (!repoSlug() || !token()) return false;
        try { return !!(await simpan()); } catch (e) { return false; }
    }

    /* Tarik data terbaru; kembalikan true bila ada perubahan */
    async function tarik(senyap) {
        if (sedangTarik) return false;
        if (!repoSlug() && !bolehPakaiPages()) { if (!senyap) setStatus('warn', 'Mode lokal (repo belum diatur)'); return false; }
        sedangTarik = true;
        let berubah = false;
        try {
            const r = await ambilGitHub();
            const remote = bersihkan(r.data);
            const kunci = remote.updatedAt + ':' + remote.students.length + ':' + remote.grades.length;
            if (dirty) return false;                    // sedang menunggu simpan, jangan timpa
            if (remote.updatedAt > db.updatedAt || (remote.updatedAt === db.updatedAt && kunci !== lastRemoteKey)) {
                db = remote;
                lastRemoteKey = kunci;
                saveLocal(db);
                if (cbRemote) cbRemote(db);
                berubah = true;
                if (!senyap) setStatus(token() || repoSlug() ? 'ok' : 'warn', 'Tersinkron');
            }
            /* Server sudah menyimpan data yang sama/lebih baru daripada browser
               ini (mis. sudah dipulihkan lewat perangkat lain) — penanda
               "belum terkirim" boleh dilepas supaya tidak rewel selamanya. */
            if (localStorage.getItem(LS_PENDING) === '1' && remote.updatedAt >= db.updatedAt) {
                try { localStorage.removeItem(LS_PENDING); } catch (e) {}
            }
            if (!senyap) {
                const tertunda = localStorage.getItem(LS_PENDING) === '1';
                if (tertunda && repoSlug() && token() && remote.updatedAt < db.updatedAt) {
                    /* Data lokal lebih baru dari server = simpanan terakhir tidak sampai. */
                    setStatus('err', 'Belum terkirim ke GitHub — mengirim ulang...');
                    kirimTunda();
                } else if (tertunda) {
                    setStatus('err', token() ? 'BELUM TERKIRIM — repo belum diatur'
                                             : 'BELUM TERKIRIM — token belum diisi di Pengaturan');
                } else {
                    setStatus(token() ? 'ok' : 'warn', token() ? 'Tersinkron' : 'Baca saja (tanpa token)');
                }
            }
            return berubah;
        } catch (e) {
            if (!senyap) {
                if (String(e.message).indexOf('file-belum-ada') >= 0) setStatus('warn', 'File data belum ada di repo');
                else setStatus('err', 'Gagal ambil data: ' + e.message);
            }
            return false;
        } finally {
            sedangTarik = false;
        }
    }

    /* ---------- simpan ke GitHub ---------- */
    async function tulisGitHub() {
        const slug = repoSlug();
        const tk = token();
        if (!slug || !tk) throw new Error('token-belum-diisi');

        let sha = null;
        try {
            const res = await fetch(apiUrl() + '?ref=' + encodeURIComponent(cfg().branch), {
                headers: { 'Authorization': 'token ' + tk, 'Accept': 'application/vnd.github+json' },
                cache: 'no-store'
            });
            if (res.ok) sha = (await res.json()).sha;
        } catch (e) { /* biarkan, sha tetap null */ }

        const body = {
            message: 'perbarui data nilai ' + new Date().toISOString(),
            content: utf8ToB64(JSON.stringify(db, null, 2)),
            branch: cfg().branch
        };
        if (sha) body.sha = sha;

        const res = await fetch(apiUrl(), {
            method: 'PUT',
            headers: { 'Authorization': 'token ' + tk, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const teks = await res.text();
            throw new Error('GitHub ' + res.status + ' — ' + teks.slice(0, 160));
        }
        return true;
    }

    function jadwalSimpan() {
        clearTimeout(timerSimpan);
        timerSimpan = setTimeout(simpan, cfg().saveMs || 700);
    }

    async function simpan() {
        clearTimeout(timerSimpan);
        timerSimpan = null;
        db.updatedAt = Date.now();
        saveLocal(db);
        dirty = true;
        try { localStorage.setItem(LS_PENDING, '1'); } catch (e) {}
        setStatus('busy', 'Menyimpan...');
        if (!repoSlug() || !token()) {
            dirty = false;
            setStatus('err', 'BELUM TERKIRIM — token belum diisi di Pengaturan');
            umumkanSimpan(false, 'Belum terkirim ke GitHub — isi token di Pengaturan');
            return false;
        }
        try {
            await tulisGitHub();
            dirty = false;
            try { localStorage.removeItem(LS_PENDING); } catch (e) {}
            setStatus('ok', 'Tersinkron ✓');
            lastRemoteKey = db.updatedAt + ':' + db.students.length + ':' + db.grades.length;
            umumkanSimpan(true, 'Tersinkron ✓');
            return true;
        } catch (e) {
            dirty = false;
            setStatus('err', 'Gagal simpan: ' + e.message);
            umumkanSimpan(false, 'Gagal kirim: ' + e.message);
            return false;
        }
    }

    /* Kirim perubahan bila tab ditutup atau halaman ditinggalkan (usaha terakhir) */
    window.addEventListener('pagehide', function () {
        try {
            clearTimeout(timerSimpan);
            if (localStorage.getItem(LS_PENDING) === '1' && repoSlug() && token()) simpan();
        } catch (e) {}
    });

    /* Tab disembunyikan = guru selesai input → buru-buru kirim.
       Tab ditampilkan kembali (murid buka HP) → tarik data terbaru segera,
       jangan menunggu jadwal polling. */
    document.addEventListener('visibilitychange', function () {
        try {
            if (document.visibilityState === 'hidden') {
                clearTimeout(timerSimpan);
                if (localStorage.getItem(LS_PENDING) === '1' && repoSlug() && token()) simpan();
            } else {
                kirimTunda();
                tarik(true);
            }
        } catch (e) {}
    });

    window.addEventListener('online', function () {
        try { kirimTunda(); tarik(true); } catch (e) {}
    });

    /* ---------- API publik ---------- */
    return {
        async init() {
            db = loadLocal();
            await tarik(true);
            /* Ada perubahan yang belum terkirim saat tab terakhir ditutup? Kirim ulang. */
            try {
                if (localStorage.getItem(LS_PENDING) === '1' && repoSlug() && token()) {
                    await simpan();
                }
            } catch (e) {}
            return db;
        },
        get() { return db; },
        token,
        repoSlug,
        setToken(v) {
            if (v) localStorage.setItem(LS_TOKEN, v.trim());
            else localStorage.removeItem(LS_TOKEN);
        },
        setRepoOverride(v) {
            if (v) localStorage.setItem(LS_REPO, v.trim());
            else localStorage.removeItem(LS_REPO);
        },
        repoOverride,

        /* ubah data lalu simpan (debounce) */
        ubah(fn) {
            fn(db);
            saveLocal(db);
            try { localStorage.setItem(LS_PENDING, '1'); } catch (e) {}
            jadwalSimpan();
        },

        simpanPaksa: simpan,
        kirimTunda,
        tarik,
        refresh() { return tarik(false); },
        adaTertunda() {
            try { return localStorage.getItem(LS_PENDING) === '1'; } catch (e) { return false; }
        },

        onStatus(cb) { cbStatus = cb; },
        onRemote(cb) { cbRemote = cb; },
        onSimpan(cb) { cbSimpan.push(cb); },

        mulaiPolling() {
            if (timerPoll) return;
            timerPoll = setInterval(() => {
                kirimTunda();          /* kejar simpanan yang tertinggal */
                tarik(false);
            }, cfg().pollMs || 5000);
        },
        hentikanPolling() {
            clearInterval(timerPoll);
            timerPoll = null;
        },

        /* upload berkas (logo) ke repo */
        async uploadBerkas(path, file) {
            const tk = token();
            if (!repoSlug() || !tk) throw new Error('Token belum diisi di Pengaturan');
            const buf = await file.arrayBuffer();
            let bin = '';
            new Uint8Array(buf).forEach(b => bin += String.fromCharCode(b));
            const b64 = btoa(bin);

            let sha = null;
            const url = 'https://api.github.com/repos/' + repoSlug() + '/contents/' + path;
            try {
                const res = await fetch(url, { headers: { 'Authorization': 'token ' + tk }, cache: 'no-store' });
                if (res.ok) sha = (await res.json()).sha;
            } catch (e) { /* file mungkin belum ada */ }

            const body = { message: 'unggah ' + path, content: b64, branch: cfg().branch };
            if (sha) body.sha = sha;
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Authorization': 'token ' + tk, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error('GitHub ' + res.status + ' — ' + (await res.text()).slice(0, 160));
            return 'https://raw.githubusercontent.com/' + repoSlug() + '/' + cfg().branch + '/' + path + '?v=' + Date.now();
        },

        async ujiKoneksi() {
            const r = await ambilGitHub();
            const d = r.data || {};
            const waktu = d.updatedAt ? new Date(d.updatedAt).toLocaleString('id-ID') : '-';
            return 'OK — sumber ' + r.sumber + ', '
                + (d.students ? d.students.length : 0) + ' murid, '
                + (d.grades ? d.grades.length : 0) + ' baris nilai, data per ' + waktu + '.';
        },

        resetCache() { localStorage.removeItem(LS_DB); location.reload(); }
    };
})();
