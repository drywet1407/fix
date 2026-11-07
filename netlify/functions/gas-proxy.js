

exports.handler = async function (event) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Sppd-Auth',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const gasUrl = (process.env.GAS_API_URL || '').trim();
    if (!gasUrl) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                status: 'error',
                message: 'Environment Variable GAS_API_URL belum diatur di Netlify.'
            })
        };
    }

    try {
        const method = event.httpMethod || 'GET';
        let targetUrl = gasUrl;

        if (method === 'GET') {
            const qs = event.rawQuery || new URLSearchParams(event.queryStringParameters || {}).toString();
            if (qs) {
                targetUrl += (targetUrl.includes('?') ? '&' : '?') + qs;
            }
            const response = await fetch(targetUrl, {
                method: 'GET',
                redirect: 'follow'
            });
            const text = await response.text();
            return {
                statusCode: response.status,
                headers: corsHeaders,
                body: text
            };
        }

        if (method === 'POST') {
            const response = await fetch(targetUrl, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: event.body || '{}'
            });
            const text = await response.text();
            return {
                statusCode: response.status,
                headers: corsHeaders,
                body: text
            };
        }

        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ status: 'error', message: 'Method Not Allowed' })
        };
    } catch (err) {
        return {
            statusCode: 502,
            headers: corsHeaders,
            body: JSON.stringify({
                status: 'error',
                message: 'Gagal menghubungi server Google Apps Script.',
                detail: err.message
            })
        };
    }
};
