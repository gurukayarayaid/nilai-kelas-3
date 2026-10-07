/* ============ MENU & STATUS SINKRONISASI ============ */
const Header = {
    init(halamanAktif, peran) {
        peran = peran || 'guru';
        if (!Auth.wajib(peran)) return;

        const nav = document.querySelector('.nav-container');
        if (!nav) return;

        const menu = peran === 'murid'
            ? [
                { key: 'murid', label: '📊 Rekap Nilai Saya', url: 'murid.html' },
                { key: 'keluar', label: '🚪 Keluar', url: '#logout' }
              ]
            : [
                { key: 'input', label: '📝 Input Nilai Murid', url: 'input.html' },
                { key: 'rekap', label: '📊 Rekapitulasi Nilai (Per Mapel)', url: 'rekap.html' },
                { key: 'leger', label: '📑 Leger Nilai (Semua Mapel)', url: 'leger.html' },
                { key: 'kelola', label: '👥 Kelola Data Murid', url: 'kelola.html' },
                { key: 'pengaturan', label: '⚙️ Pengaturan & GitHub', url: 'pengaturan.html' },
                { key: 'keluar', label: '🚪 Keluar', url: '#logout' }
              ];

        nav.innerHTML =
            '<span class="sync-pill" id="syncPill" title="Status sinkronisasi data">…</span>' +
            '<button class="hamburger" type="button" onclick="Header.toggle()">&#9776;</button>' +
            '<div class="menu-items" id="menuItems">' +
            menu.map(m => `<a href="${m.url}" class="${m.key === halamanAktif ? 'active' : ''}" ${m.url === '#logout' ? 'onclick="Auth.logout();return false;"' : ''}>${m.label}</a>`).join('') +
            '</div>';

        Store.onStatus((tipe, teks) => {
            const pill = document.getElementById('syncPill');
            if (!pill) return;
            pill.className = 'sync-pill ' + (tipe === 'ok' ? 'ok' : tipe === 'err' ? 'err' : tipe === 'busy' ? 'busy' : 'warn');
            pill.textContent = teks;
        });

        /* Peringatan mencolok bila perubahan TIDAK sampai ke GitHub.
           Tanpa ini guru mengira semuanya tersimpan padahal HP murid tidak
           pernah menerima datanya. */
        Store.onSimpan(res => {
            if (res.ok) return;
            const esc = window.Util ? Util.esc : (s => String(s));
            let toast = document.getElementById('toastSync');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'toastSync';
                toast.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:9999;' +
                    'background:#e53e3e;color:#fff;padding:12px 18px;border-radius:8px;' +
                    'box-shadow:0 6px 18px rgba(0,0,0,.3);font-size:14px;max-width:92vw;text-align:center;line-height:1.5;';
                document.body.appendChild(toast);
            }
            toast.innerHTML = '❌ ' + esc(res.pesan) +
                ' — <a href="pengaturan.html" style="color:#fff;font-weight:bold;text-decoration:underline;">buka Pengaturan</a>';
            clearTimeout(window.__toastSyncTimer);
            window.__toastSyncTimer = setTimeout(() => { if (toast.parentNode) toast.remove(); }, 12000);
        });

        document.addEventListener('click', function (e) {
            if (!e.target.matches('.hamburger')) {
                const m = document.getElementById('menuItems');
                if (m) m.classList.remove('show');
            }
        });

        return true;
    },

    toggle() {
        const m = document.getElementById('menuItems');
        if (m) m.classList.toggle('show');
    },

    /* Lingkaran kecil di pojok untuk halaman tanpa menu (mis. halaman murid) */
    banner(container, tipe, teks) {
        const div = document.createElement('div');
        div.className = 'alert-banner alert-' + tipe;
        div.innerHTML = teks;
        container.prepend(div);
        return div;
    }
};
