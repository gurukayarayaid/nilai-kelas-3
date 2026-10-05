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
    let lastRemoteKey = '';

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
    async function ambilGitHub() {
        const slug = repoSlug();
        if (!slug) throw new Error('repo-belum-diatur');
        const tk = token();

        if (tk) {
            const res = await fetch(apiUrl() + '?ref=' + encodeURIComponent(cfg().branch), {
                headers: {
                    'Authorization': 'token ' + tk,
                    'Accept': 'application/vnd.github+json'
                },
                cache: 'no-store'
            });
            if (res.status === 404) throw new Error('file-belum-ada');
            if (!res.ok) throw new Error('GitHub API ' + res.status);
            const j = await res.json();
            return { text: b64ToUtf8(j.content || ''), sha: j.sha };
        }

        const res = await fetch(rawUrl(), { cache: 'no-store' });
        if (res.status === 404) throw new Error('file-belum-ada');
        if (!res.ok) throw new Error('Gagal membaca data (' + res.status + ')');
        return { text: await res.text(), sha: null };
    }

    /* Tarik data terbaru; kembalikan true bila ada perubahan */
    async function tarik(senyap) {
        if (!repoSlug()) { if (!senyap) setStatus('warn', 'Mode lokal (repo belum diatur)'); return false; }
        try {
            const r = await ambilGitHub();
            const remote = bersihkan(JSON.parse(r.text));
            const kunci = remote.updatedAt + ':' + remote.students.length + ':' + remote.grades.length;
            if (dirty) return false;                    // sedang menunggu simpan, jangan timpa
            if (remote.updatedAt > db.updatedAt || (remote.updatedAt === db.updatedAt && kunci !== lastRemoteKey)) {
                db = remote;
                lastRemoteKey = kunci;
                saveLocal(db);
                if (cbRemote) cbRemote(db);
                if (!senyap) setStatus(token() || repoSlug() ? 'ok' : 'warn', 'Tersinkron');
                return true;
            }
            if (!senyap) setStatus(token() ? 'ok' : 'warn', token() ? 'Tersinkron' : 'Baca saja (tanpa token)');
            return false;
        } catch (e) {
            if (!senyap) {
                if (String(e.message).indexOf('file-belum-ada') >= 0) setStatus('warn', 'File data belum ada di repo');
                else setStatus('err', 'Gagal ambil data: ' + e.message);
            }
            return false;
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
        db.updatedAt = Date.now();
        saveLocal(db);
        dirty = true;
        try { localStorage.setItem(LS_PENDING, '1'); } catch (e) {}
        setStatus('busy', 'Menyimpan...');
        if (!repoSlug() || !token()) {
            dirty = false;
            setStatus('warn', 'Hanya tersimpan di browser ini (token belum diisi)');
            return false;
        }
        try {
            await tulisGitHub();
            dirty = false;
            try { localStorage.removeItem(LS_PENDING); } catch (e) {}
            setStatus('ok', 'Tersinkron');
            lastRemoteKey = db.updatedAt + ':' + db.students.length + ':' + db.grades.length;
            return true;
        } catch (e) {
            dirty = false;
            setStatus('err', 'Gagal simpan: ' + e.message);
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
        tarik,
        refresh() { return tarik(false); },

        onStatus(cb) { cbStatus = cb; },
        onRemote(cb) { cbRemote = cb; },

        mulaiPolling() {
            if (timerPoll) return;
            timerPoll = setInterval(() => { tarik(false); }, cfg().pollMs || 5000);
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
            const d = JSON.parse(r.text);
            return 'OK — ' + (d.students ? d.students.length : 0) + ' murid, ' + (d.grades ? d.grades.length : 0) + ' baris nilai.';
        },

        resetCache() { localStorage.removeItem(LS_DB); location.reload(); }
    };
})();
