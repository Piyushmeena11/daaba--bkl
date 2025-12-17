const axios = require('axios');

// Proxy endpoint to stream video content
module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        const decodedUrl = decodeURIComponent(url);
        
        // Forward range headers for video seeking
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Referer': 'https://www.terabox.com/',
            'Origin': 'https://www.terabox.com'
        };

        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        const response = await axios({
            method: 'GET',
            url: decodedUrl,
            headers,
            responseType: 'stream',
            timeout: 60000,
            maxRedirects: 5
        });

        // Forward response headers
        const contentType = response.headers['content-type'];
        const contentLength = response.headers['content-length'];
        const contentRange = response.headers['content-range'];
        const acceptRanges = response.headers['accept-ranges'];

        if (contentType) res.setHeader('Content-Type', contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);
        if (contentRange) res.setHeader('Content-Range', contentRange);
        if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

        // Set status code (206 for partial content)
        res.status(response.status);

        // Pipe the stream
        response.data.pipe(res);

    } catch (error) {
        console.error('Proxy error:', error.message);
        
        if (error.response) {
            return res.status(error.response.status).json({
                error: 'Failed to fetch content',
                status: error.response.status
            });
        }
        
        return res.status(500).json({
            error: 'Proxy error',
            message: error.message
        });
    }
};
