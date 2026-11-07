// assets/js/auth.js - Protected Google Authentication Portal (E-SPPD Dinas Kesehatan Kota Tangerang Selatan)
(function () {
    'use strict';

    const _K = Object.freeze({
        U: 'SPPD_AUTH_USER',
        A: 'SPPD_AUTH_LAST_ACTIVE',
        X: 'SPPD_AUTH_EXPIRED_MSG',
        C: 'SPPD_AUTH_CLIENT_ID',
        D: 'SPPD_AUTH_ALLOWED_DOMAIN',
        E: 'SPPD_AUTH_ALLOWED_EMAILS'
    });

    // Batas waktu tidak ada aktivitas: 15 Menit (900.000 ms)
    const _IDLE_LIMIT_MS = 15 * 60 * 1000;
    let _idleCheckTimer = null;
    let _lastWriteTime = 0;

    // Endpoint Auth Server Netlify (otomatis mengarah ke domain produksi saat dijalankan di Five Server lokal)
    const _IS_LOCAL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const _AUTH_API_URL = _IS_LOCAL
        ? 'https://esppddinkestangsel.netlify.app/api/auth'
        : '/api/auth';

    // Konfigurasi khusus Local Development (Five Server) yang ter-encode agar tetap aman dari Inspect Element
    const _0xLocalCid = [
        'MzM1NTcxMjY5ODc4LXFsYjdwNTZyYnNj',
        'OGRxOGpyZjM1YWJhb2RhODQ4YXViLmFw',
        'cHMuZ29vZ2xldXNlcmNvbnRlbnQuY29t'
    ];
    const _0xLocalEm = [
        104, 101, 114, 100, 105, 97, 110, 115, 121, 97, 104, 46,
        115, 117, 107, 109, 97, 110, 97, 49, 52, 64, 103, 109,
        97, 105, 108, 46, 99, 111, 109
    ];

    function _getLocalCid() {
        try {
            return atob(_0xLocalCid.join('')).trim();
        } catch (e) {
            return '';
        }
    }

    function _getLocalAllowedEmail() {
        return String.fromCharCode.apply(null, _0xLocalEm).trim().toLowerCase();
    }

    function _isLoginPage() {
        const path = (window.location.pathname || '').toLowerCase();
        return path.endsWith('/login.html') || path.endsWith('/login') || !!document.getElementById('g_id_signin_container');
    }

    function _getLastActivity() {
        const rawAct = localStorage.getItem(_K.A);
        return rawAct ? Number(rawAct) : 0;
    }

    function _touchActivity(force) {
        const now = Date.now();
        if (force || (now - _lastWriteTime > 3000)) {
            _lastWriteTime = now;
            localStorage.setItem(_K.A, String(now));
        }
    }

    function _isSessionExpired() {
        const lastAct = _getLastActivity();
        if (!lastAct) return false;
        return (Date.now() - lastAct) > _IDLE_LIMIT_MS;
    }

    function _getLoggedInUser() {
        try {
            const raw = localStorage.getItem(_K.U);
            if (!raw) return null;
            const user = JSON.parse(raw);
            if (!user || !user.email || user.isDemo || !user.verifiedByServer) {
                _removeLoggedInUser();
                return null;
            }
            if (_isSessionExpired()) {
                _removeLoggedInUser();
                sessionStorage.setItem(_K.X, '1');
                return null;
            }
            return user;
        } catch (e) {
            _removeLoggedInUser();
            return null;
        }
    }

    function _saveLoggedInUser(user) {
        const now = Date.now();
        user.lastActivity = now;
        localStorage.setItem(_K.U, JSON.stringify(user));
        localStorage.setItem(_K.A, String(now));
        sessionStorage.removeItem(_K.X);
        _lastWriteTime = now;
    }

    function _removeLoggedInUser() {
        localStorage.removeItem(_K.U);
        localStorage.removeItem(_K.A);
    }

    function _showAuthError(msg) {
        const el = document.getElementById('authErrorMessage');
        if (el) {
            el.textContent = msg;
            el.classList.remove('hidden');
        }
    }

    function _clearAuthError() {
        const el = document.getElementById('authErrorMessage');
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    function _redirectToLogin() {
        if (!_isLoginPage()) {
            window.location.replace('login.html');
        }
    }

    function _redirectToDashboard() {
        window.location.replace('index.html');
    }

    // ========================================================
    // IDLE SESSION WATCHER (AUTO LOGOUT 15 MENIT TANPA AKTIVITAS)
    // ========================================================
    async function _handleIdleExpired() {
        if (_idleCheckTimer) {
            clearInterval(_idleCheckTimer);
            _idleCheckTimer = null;
        }
        _removeLoggedInUser();
        sessionStorage.setItem(_K.X, '1');
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            google.accounts.id.disableAutoSelect();
        }
        if (!_isLoginPage()) {
            await _twAlert(
                'Sesi Berakhir (15 Menit)',
                'Sesi Anda telah berakhir secara otomatis karena tidak ada aktivitas selama 15 menit. Silakan login kembali.',
                'warning'
            );
            _redirectToLogin();
        }
    }

    function _startIdleSessionMonitor() {
        if (_isLoginPage()) return;

        // Pastikan timestamp aktivitas awal tercatat
        if (!_getLastActivity()) {
            _touchActivity(true);
        }

        const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
        const onUserActivity = function () {
            if (_isSessionExpired()) {
                _handleIdleExpired();
                return;
            }
            _touchActivity(false);
        };

        activityEvents.forEach(function (evt) {
            window.addEventListener(evt, onUserActivity, { passive: true });
        });

        // Cek saat pengguna kembali membuka tab / memfokuskan window
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && _isSessionExpired()) {
                _handleIdleExpired();
            }
        });

        // Interval pengecekan setiap 5 detik
        if (_idleCheckTimer) clearInterval(_idleCheckTimer);
        _idleCheckTimer = setInterval(function () {
            if (_isSessionExpired() || !localStorage.getItem(_K.U)) {
                _handleIdleExpired();
            }
        }, 5000);
    }

    function _updateAuthUI() {
        const user = _getLoggedInUser();

        const sidebarProfile = document.getElementById('sidebarUserProfile');
        const sidebarProfileName = document.getElementById('sidebarProfileName');
        const sidebarProfileEmail = document.getElementById('sidebarProfileEmail');
        const sidebarProfileAvatar = document.getElementById('sidebarProfileAvatar');

        const desktopHeaderUser = document.getElementById('desktopHeaderUser');
        const desktopHeaderAvatar = document.getElementById('desktopHeaderAvatar');
        const desktopHeaderName = document.getElementById('desktopHeaderName');

        const mobileHeaderAvatar = document.getElementById('mobileHeaderAvatar');

        if (user) {
            if (sidebarProfile) sidebarProfile.classList.remove('hidden');
            if (sidebarProfileName) sidebarProfileName.textContent = user.name;
            if (sidebarProfileEmail) sidebarProfileEmail.textContent = user.email;
            if (sidebarProfileAvatar) {
                sidebarProfileAvatar.src = user.picture || 'assets/images/brand/logo.png';
                sidebarProfileAvatar.alt = user.name;
            }

            if (desktopHeaderUser) desktopHeaderUser.classList.remove('hidden');
            if (desktopHeaderName) desktopHeaderName.textContent = user.name.split(' ')[0];
            if (desktopHeaderAvatar) {
                desktopHeaderAvatar.src = user.picture || 'assets/images/brand/logo.png';
                desktopHeaderAvatar.alt = user.name;
            }

            if (mobileHeaderAvatar) {
                mobileHeaderAvatar.src = user.picture || 'assets/images/brand/logo.png';
                mobileHeaderAvatar.classList.remove('hidden');
            }
        } else {
            if (sidebarProfile) sidebarProfile.classList.add('hidden');
            if (desktopHeaderUser) desktopHeaderUser.classList.add('hidden');
            if (mobileHeaderAvatar) mobileHeaderAvatar.classList.add('hidden');
        }
    }

    async function _verifyLocalGoogleToken(credential) {
        const verifyRes = await fetch(
            'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)
        );
        if (!verifyRes.ok) {
            throw new Error('Token autentikasi Google tidak valid atau sudah kedaluwarsa.');
        }
        const tokenInfo = await verifyRes.json();
        const expectedCid = _getLocalCid();
        if (expectedCid && tokenInfo.aud !== expectedCid) {
            throw new Error('Client ID pada token tidak sesuai.');
        }
        const userEmail = String(tokenInfo.email || '').trim().toLowerCase();
        const isVerified = tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true;
        if (!userEmail || !isVerified || userEmail !== _getLocalAllowedEmail()) {
            throw new Error('Akses ditolak: Akun Google Anda tidak memiliki izin untuk mengakses sistem ini.');
        }
        return {
            id: tokenInfo.sub,
            name: tokenInfo.name || userEmail,
            email: userEmail,
            picture: tokenInfo.picture || '',
            hd: tokenInfo.hd || '',
            loginTime: new Date().toISOString(),
            verifiedByServer: true,
            isDemo: false
        };
    }

    async function _handleGoogleCredentialResponse(response) {
        _clearAuthError();

        if (!response || !response.credential) {
            _showAuthError('Gagal menerima token kredensial dari Google.');
            return;
        }

        try {
            const verifyRes = await fetch(_AUTH_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential })
            });

            const data = await verifyRes.json();

            if (!verifyRes.ok || data.status !== 'success' || !data.user) {
                _showAuthError(data.message || 'Akses ditolak oleh server autentikasi.');
                if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
                    google.accounts.id.disableAutoSelect();
                }
                return;
            }

            _saveLoggedInUser(data.user);
            _redirectToDashboard();
        } catch (err) {
            // Jika dijalankan di Five Server lokal dan endpoint Netlify belum aktif, verifikasi langsung ke Google OAuth2 API
            if (_IS_LOCAL) {
                try {
                    const localUser = await _verifyLocalGoogleToken(response.credential);
                    _saveLoggedInUser(localUser);
                    _redirectToDashboard();
                    return;
                } catch (localErr) {
                    _showAuthError(localErr.message || 'Akses ditolak.');
                    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
                        google.accounts.id.disableAutoSelect();
                    }
                    return;
                }
            }
            _showAuthError('Gagal menghubungi server autentikasi Netlify. Pastikan koneksi internet aktif.');
        }
    }

    let _cachedClientId = '';

    async function _fetchClientIdFromServer() {
        if (_cachedClientId) return _cachedClientId;
        try {
            const res = await fetch(_AUTH_API_URL, { method: 'GET' });
            if (!res.ok) {
                const errData = await res.json().catch(function () { return {}; });
                throw new Error(errData.message || 'Gagal memuat konfigurasi Google Auth dari server.');
            }
            const data = await res.json();
            if (data && data.clientId) {
                _cachedClientId = String(data.clientId).trim();
                return _cachedClientId;
            }
            throw new Error('GOOGLE_CLIENT_ID kosong di server.');
        } catch (e) {
            // Jika dijalankan di Five Server lokal, otomatis gunakan konfigurasi lokal agar langsung jalan tanpa menunggu deploy Netlify
            if (_IS_LOCAL) {
                _cachedClientId = _getLocalCid();
                return _cachedClientId;
            }
            const rawMsg = String(e && e.message ? e.message : '');
            _showAuthError(rawMsg || 'Tidak dapat memuat konfigurasi autentikasi dari server Netlify.');
            return '';
        }
    }

    async function _initGoogleAuth() {
        const container = document.getElementById('g_id_signin_container');
        if (!container) return;

        const clientId = await _fetchClientIdFromServer();
        if (!clientId) return;

        function renderGsiButton() {
            if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
                google.accounts.id.initialize({
                    client_id: clientId,
                    callback: _handleGoogleCredentialResponse,
                    auto_select: false,
                    cancel_on_tap_outside: true
                });

                container.innerHTML = '';
                google.accounts.id.renderButton(container, {
                    theme: 'filled_blue',
                    size: 'large',
                    type: 'standard',
                    shape: 'pill',
                    text: 'signin_with',
                    logo_alignment: 'left',
                    width: 280
                });
                const skel = document.getElementById('gsiSkeleton');
                if (skel) {
                    setTimeout(function () {
                        skel.style.opacity = '0';
                    }, 150);
                }
            } else {
                setTimeout(renderGsiButton, 100);
            }
        }

        renderGsiButton();
    }

    // ========================================================
    // TAILWIND MODAL DIALOG ENGINE (PENGGANTI SWEETALERT / NATIVE ALERT)
    // ========================================================
    const _THEMES = {
        success: {
            icon: '✅',
            wrapClass: 'bg-emerald-50 border-2 border-emerald-200 text-emerald-600',
            btnClass: 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-emerald-900/20'
        },
        error: {
            icon: '⛔',
            wrapClass: 'bg-rose-50 border-2 border-rose-200 text-rose-600',
            btnClass: 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white shadow-rose-900/20'
        },
        warning: {
            icon: '⚠️',
            wrapClass: 'bg-amber-50 border-2 border-amber-200 text-amber-600',
            btnClass: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 shadow-amber-900/20'
        },
        question: {
            icon: '❓',
            wrapClass: 'bg-teal-50 border-2 border-teal-200 text-teal-700',
            btnClass: 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-teal-900/20'
        },
        info: {
            icon: 'ℹ️',
            wrapClass: 'bg-sky-50 border-2 border-sky-200 text-sky-600',
            btnClass: 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white shadow-sky-900/20'
        }
    };

    function _openTwModal(opts) {
        return new Promise(function (resolve) {
            const modal = document.getElementById('twModalDialog');
            const card = document.getElementById('twModalCard');
            const iconWrap = document.getElementById('twModalIconWrap');
            const iconEl = document.getElementById('twModalIcon');
            const titleEl = document.getElementById('twModalTitle');
            const msgEl = document.getElementById('twModalMessage');
            const confirmBtn = document.getElementById('twModalConfirmBtn');
            const cancelBtn = document.getElementById('twModalCancelBtn');

            if (!modal || !card) {
                resolve(true);
                return;
            }

            const type = opts.type || 'info';
            const theme = _THEMES[type] || _THEMES.info;

            iconWrap.className = 'mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center shadow-xs ' + theme.wrapClass;
            iconEl.textContent = opts.icon || theme.icon;
            titleEl.textContent = opts.title || 'Informasi';
            msgEl.textContent = (opts.message || '').replace(/^⛔\s*/, '').replace(/^⚠️\s*/, '');

            confirmBtn.textContent = opts.confirmText || 'OK';
            confirmBtn.className = 'flex-1 py-2.5 px-5 rounded-xl text-xs sm:text-sm font-bold shadow-md transition active:scale-95 ' + (opts.confirmBtnClass || theme.btnClass);

            if (opts.showCancel) {
                cancelBtn.textContent = opts.cancelText || 'Batal';
                cancelBtn.classList.remove('hidden');
            } else {
                cancelBtn.classList.add('hidden');
            }

            modal.classList.remove('hidden');
            modal.classList.add('flex');

            requestAnimationFrame(function () {
                card.classList.remove('scale-95', 'opacity-0');
                card.classList.add('scale-100', 'opacity-100');
            });

            function closeDialog(result) {
                card.classList.remove('scale-100', 'opacity-100');
                card.classList.add('scale-95', 'opacity-0');
                setTimeout(function () {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                    resolve(result);
                }, 150);
            }

            confirmBtn.onclick = function () {
                closeDialog(true);
            };
            cancelBtn.onclick = function () {
                closeDialog(false);
            };
        });
    }

    function _twAlert(title, message, type) {
        if (arguments.length === 1) {
            message = title;
            title = 'Pemberitahuan';
            type = 'info';
        }
        return _openTwModal({
            title: title,
            message: message,
            type: type || 'info',
            showCancel: false,
            confirmText: 'Mengerti'
        });
    }

    function _twConfirm(title, message, opts) {
        opts = opts || {};
        return _openTwModal({
            title: title || 'Konfirmasi',
            message: message || 'Apakah Anda yakin ingin melanjutkan?',
            type: opts.type || 'question',
            showCancel: true,
            confirmText: opts.confirmText || 'Ya, Lanjutkan',
            cancelText: opts.cancelText || 'Batal',
            confirmBtnClass: opts.danger ? _THEMES.error.btnClass : undefined
        });
    }

    async function _logoutUser() {
        const ok = await _twConfirm(
            'Keluar dari E-SPPD?',
            'Apakah Anda yakin ingin keluar dari sesi aplikasi E-SPPD Dinas Kesehatan?',
            { type: 'warning', confirmText: 'Ya, Keluar', cancelText: 'Batal', danger: true }
        );
        if (ok) {
            _removeLoggedInUser();
            if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
                google.accounts.id.disableAutoSelect();
            }
            window.location.replace('login.html');
        }
    }

    // Proteksi Inspect Element, Klik Kanan & Shortcut DevTools
    function _initAntiInspect() {
        document.addEventListener('contextmenu', function (e) {
            e.preventDefault();
        });

        document.addEventListener('keydown', function (e) {
            const key = (e.key || '').toUpperCase();
            const isF12 = e.keyCode === 123 || key === 'F12';
            const isCtrlShiftIJC = e.ctrlKey && e.shiftKey && (key === 'I' || key === 'J' || key === 'C');
            const isCtrlU = e.ctrlKey && key === 'U';
            const isCtrlS = e.ctrlKey && key === 'S';

            if (isF12 || isCtrlShiftIJC || isCtrlU || isCtrlS) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        });
    }

    // Ekspos fungsi logout dan dialog Tailwind ke global window
    Object.defineProperty(window, 'logoutUser', {
        value: _logoutUser,
        writable: false,
        configurable: false
    });
    window.twAlert = _twAlert;
    window.twConfirm = _twConfirm;
    window.alert = function (msg) {
        return _twAlert('Pemberitahuan', String(msg || ''), 'info');
    };

    // Awasi perubahan localStorage di tab/window lain
    window.addEventListener('storage', function (e) {
        if ((e.key === _K.U || e.key === _K.A) && !_getLoggedInUser() && !_isLoginPage()) {
            _redirectToLogin();
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        // Bersihkan key konfigurasi di localStorage agar tidak tampak di tab Application > Local Storage
        localStorage.removeItem(_K.C);
        localStorage.removeItem(_K.D);
        localStorage.removeItem(_K.E);

        _initAntiInspect();

        const user = _getLoggedInUser();
        if (_isLoginPage()) {
            if (user) {
                _redirectToDashboard();
            } else {
                if (sessionStorage.getItem(_K.X) === '1') {
                    sessionStorage.removeItem(_K.X);
                    _showAuthError('Sesi Anda telah berakhir karena tidak ada aktivitas selama 15 menit. Silakan login kembali.');
                }
                _initGoogleAuth();
            }
        } else {
            if (!user) {
                _redirectToLogin();
            } else {
                document.documentElement.classList.remove('auth-checking');
                _updateAuthUI();
                _startIdleSessionMonitor();
            }
        }
    });
})();
