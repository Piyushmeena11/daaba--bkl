const axios = require('axios');

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { url, cookies } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    try {
        // Extract short URL code from various TeraBox URL formats
        let shortUrl = url;
        
        // Handle different TeraBox domains
        if (url.includes('/s/')) {
            shortUrl = url.split('/s/')[1].split('?')[0].split('/')[0];
        } else if (url.includes('surl=')) {
            const match = url.match(/surl=([^&]+)/);
            if (match) shortUrl = match[1];
        }

        // Clean the short URL
        shortUrl = shortUrl.replace(/[^a-zA-Z0-9_-]/g, '');

        if (!shortUrl) {
            return res.status(400).json({ success: false, error: 'Invalid TeraBox URL format' });
        }

        // Parse cookies
        let cookieString = '';
        let parsedCookies = cookies;
        
        if (typeof cookies === 'string') {
            try {
                parsedCookies = JSON.parse(cookies);
            } catch (e) {
                cookieString = cookies;
            }
        }

        if (parsedCookies && typeof parsedCookies === 'object') {
            const cookieArray = parsedCookies.cookies || parsedCookies;
            if (Array.isArray(cookieArray)) {
                cookieString = cookieArray.map(c => `${c.name}=${c.value}`).join('; ');
            }
        }

        // Build headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        };

        if (cookieString) {
            headers['Cookie'] = cookieString;
        }

        // Step 1: Fetch the share page HTML to extract jsToken and other params
        const pageUrl = `https://www.terabox.com/s/${shortUrl}`;
        console.log('Fetching page:', pageUrl);
        
        const pageResponse = await axios.get(pageUrl, {
            headers,
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: () => true
        });

        const html = pageResponse.data;

        // Extract jsToken from the page
        let jsToken = '';
        const jsTokenMatch = html.match(/window\.jsToken\s*=\s*['"]([^'"]+)['"]/);
        if (jsTokenMatch) {
            jsToken = jsTokenMatch[1];
        }

        // Extract other data from page - look for initial data
        let shareData = null;
        const dataMatch = html.match(/locals\.mbox\s*=\s*(\{[\s\S]*?\});/);
        if (dataMatch) {
            try {
                shareData = JSON.parse(dataMatch[1]);
            } catch (e) {}
        }

        // Try alternative data extraction
        if (!shareData) {
            const altMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
            if (altMatch) {
                try {
                    shareData = JSON.parse(altMatch[1]);
                } catch (e) {}
            }
        }

        // Step 2: Call the shorturl API
        const apiHeaders = {
            ...headers,
            'Accept': 'application/json, text/plain, */*',
            'Referer': pageUrl,
            'Origin': 'https://www.terabox.com'
        };

        const shortUrlApi = `https://www.terabox.com/api/shorturlinfo?shorturl=${shortUrl}&root=1`;
        console.log('Calling API:', shortUrlApi);

        const apiResponse = await axios.get(shortUrlApi, {
            headers: apiHeaders,
            timeout: 30000,
            validateStatus: () => true
        });

        const apiData = apiResponse.data;

        if (apiData.errno !== 0) {
            return res.status(400).json({
                success: false,
                error: `TeraBox Error: ${apiData.errmsg || 'Unknown error'}`,
                errno: apiData.errno
            });
        }

        if (!apiData.list || apiData.list.length === 0) {
            return res.status(404).json({ success: false, error: 'No files found' });
        }

        const file = apiData.list[0];
        const shareid = apiData.shareid;
        const uk = apiData.uk;
        const sign = apiData.sign;
        const timestamp = apiData.timestamp;
        const fsId = file.fs_id;

        // Step 3: Get the actual download link using the download API
        let downloadLink = null;
        let streamLink = null;

        // Try to get download link
        try {
            const dlApiUrl = `https://www.terabox.com/share/download`;
            const dlParams = new URLSearchParams({
                shareid: shareid,
                uk: uk,
                product: 'share',
                nozip: '0',
                fid_list: `[${fsId}]`,
                primaryid: shareid
            });

            if (sign) dlParams.append('sign', sign);
            if (timestamp) dlParams.append('timestamp', timestamp);

            const dlResponse = await axios.get(`${dlApiUrl}?${dlParams.toString()}`, {
                headers: apiHeaders,
                timeout: 30000,
                validateStatus: () => true
            });

            if (dlResponse.data && dlResponse.data.errno === 0 && dlResponse.data.list) {
                downloadLink = dlResponse.data.list[0]?.dlink;
            }
        } catch (e) {
            console.log('Download API error:', e.message);
        }

        // Step 4: For videos, try to get streaming link
        const isVideo = file.category === 1;
        
        if (isVideo) {
            try {
                // Try to get video streaming URL
                const streamApiUrl = `https://www.terabox.com/share/streaming`;
                const streamParams = new URLSearchParams({
                    shareid: shareid,
                    uk: uk,
                    fid: fsId,
                    type: 'M3U8_AUTO_480'
                });

                if (sign) streamParams.append('sign', sign);
                if (timestamp) streamParams.append('timestamp', timestamp);

                const streamResponse = await axios.get(`${streamApiUrl}?${streamParams.toString()}`, {
                    headers: apiHeaders,
                    timeout: 30000,
                    validateStatus: () => true
                });

                if (streamResponse.data && streamResponse.data.errno === 0) {
                    streamLink = streamResponse.data.ltime || streamResponse.data.m3u8_url;
                }

                // Alternative: Try getting direct video link
                if (!streamLink) {
                    const videoParams = new URLSearchParams({
                        shareid: shareid,
                        uk: uk,
                        fid: fsId,
                        type: 'video'
                    });

                    const videoResponse = await axios.get(`${streamApiUrl}?${videoParams.toString()}`, {
                        headers: apiHeaders,
                        timeout: 30000,
                        validateStatus: () => true
                    });

                    if (videoResponse.data) {
                        streamLink = videoResponse.data.url || videoResponse.data.ltime;
                    }
                }
            } catch (e) {
                console.log('Stream API error:', e.message);
            }
        }

        // Step 5: If still no download link, construct from dlink or try alternative
        if (!downloadLink && file.dlink) {
            downloadLink = file.dlink;
        }

        // Construct a fallback download URL if needed
        if (!downloadLink) {
            // Build manual download URL
            downloadLink = `https://www.terabox.com/share/download?shareid=${shareid}&uk=${uk}&fid_list=[${fsId}]&product=share`;
            if (sign) downloadLink += `&sign=${sign}`;
            if (timestamp) downloadLink += `&timestamp=${timestamp}`;
        }

        // Get thumbnail for videos
        let thumbnail = null;
        if (file.thumbs) {
            thumbnail = file.thumbs.url3 || file.thumbs.url2 || file.thumbs.url1 || file.thumbs.icon;
        }

        // Prepare response
        const result = {
            success: true,
            data: {
                filename: file.server_filename,
                size: file.size,
                sizeFormatted: formatSize(file.size),
                category: file.category,
                isVideo: isVideo,
                fsId: fsId,
                md5: file.md5 || null,
                downloadLink: downloadLink,
                streamLink: streamLink,
                thumbnail: thumbnail,
                shareid: shareid,
                uk: uk,
                sign: sign,
                timestamp: timestamp
            }
        };

        // Include multiple files if directory
        if (apiData.list.length > 1) {
            result.data.files = apiData.list.map(f => ({
                filename: f.server_filename,
                size: f.size,
                sizeFormatted: formatSize(f.size),
                category: f.category,
                fsId: f.fs_id,
                downloadLink: f.dlink || null,
                thumbnail: f.thumbs ? (f.thumbs.url3 || f.thumbs.url2 || f.thumbs.url1) : null
            }));
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Error:', error.message);
        
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({
                success: false,
                error: 'Request timeout'
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Failed to process request',
            message: error.message
        });
    }
};

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}
