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
