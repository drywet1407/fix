
exports.handler = async function (event) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const rawAllowedEmails = (process.env.ALLOWED_EMAILS || process.env.ALLOWED_EMAIL || '').trim();

    if (!clientId) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                status: 'error',
                message: 'Environment Variable GOOGLE_CLIENT_ID belum diatur di Netlify.'
            })
        };
    }

    // 1. GET: Kembalikan hanya Client ID untuk inisialisasi tombol Google Sign-In
    // Daftar email yang diizinkan TIDAK PERNAH dikirimkan ke browser pada saat GET
    if (event.httpMethod === 'GET') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                status: 'success',
                clientId: clientId
            })
        };
    }

    // 2. POST: Verifikasi token kredensial Google & validasi whitelist email di sisi server
    if (event.httpMethod === 'POST') {
        try {
            const body = JSON.parse(event.body || '{}');
            const credential = (body.credential || '').trim();

            if (!credential) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        status: 'error',
                        message: 'Token kredensial Google tidak ditemukan.'
                    })
                };
            }

            if (!rawAllowedEmails) {
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        status: 'error',
                        message: 'Environment Variable ALLOWED_EMAILS belum diatur di Netlify.'
                    })
                };
            }

            // Verifikasi keaslian token JWT langsung ke endpoint resmi Google OAuth2
            const verifyRes = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
            );

            if (!verifyRes.ok) {
                return {
                    statusCode: 401,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        status: 'error',
                        message: 'Token autentikasi Google tidak valid atau sudah kedaluwarsa.'
                    })
                };
            }

            const tokenInfo = await verifyRes.json();

            // Pastikan token benar-benar diterbitkan untuk GOOGLE_CLIENT_ID aplikasi ini
            if (tokenInfo.aud !== clientId) {
                return {
                    statusCode: 401,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        status: 'error',
                        message: 'Client ID pada token tidak sesuai dengan konfigurasi server.'
                    })
                };
            }

            const userEmail = String(tokenInfo.email || '').trim().toLowerCase();
            const isEmailVerified = tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true;

            // Parse daftar email yang diizinkan (bisa satu email atau beberapa email dipisah koma)
            const allowedList = rawAllowedEmails
                .split(',')
                .map((e) => e.trim().toLowerCase())
                .filter(Boolean);

            if (!userEmail || !isEmailVerified || !allowedList.includes(userEmail)) {
                return {
                    statusCode: 403,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        status: 'error',
                        message: 'Akses ditolak: Akun Google Anda tidak memiliki izin untuk mengakses sistem ini.'
                    })
                };
            }

            // Login sukses & terverifikasi oleh server Netlify
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    status: 'success',
                    user: {
                        id: tokenInfo.sub,
                        name: tokenInfo.name || userEmail,
                        email: userEmail,
                        picture: tokenInfo.picture || '',
                        hd: tokenInfo.hd || '',
                        loginTime: new Date().toISOString(),
                        verifiedByServer: true,
                        isDemo: false
                    }
                })
            };
        } catch (err) {
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({
                    status: 'error',
                    message: 'Gagal memverifikasi sesi login di server.',
                    detail: err.message
                })
            };
        }
    }

    return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ status: 'error', message: 'Method Not Allowed' })
    };
};

