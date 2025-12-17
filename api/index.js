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
        // Extract short URL code
        let shortUrl = url;
        if (url.includes('/s/')) {
            shortUrl = url.split('/s/')[1].split('?')[0].split('/')[0];
        } else if (url.includes('surl=')) {
            const match = url.match(/surl=([^&]+)/);
            if (match) shortUrl = match[1];
        }
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

        // Headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cookie': cookieString,
            'Referer': 'https://www.terabox.com/',
            'Origin': 'https://www.terabox.com'
        };

        // Step 1: Get file info from shorturlinfo API
        const shortUrlApi = `https://www.terabox.com/api/shorturlinfo?shorturl=${shortUrl}&root=1`;
        console.log('Fetching:', shortUrlApi);

        const apiResponse = await axios.get(shortUrlApi, {
            headers,
            timeout: 30000,
            validateStatus: () => true
        });

        const apiData = apiResponse.data;

        if (apiData.errno !== 0) {
            return res.status(400).json({
                success: false,
                error: `TeraBox API Error: ${apiData.errmsg || 'Unknown error'} (Code: ${apiData.errno})`
            });
        }

        if (!apiData.list || apiData.list.length === 0) {
            return res.status(404).json({ success: false, error: 'No files found in this share' });
        }

        const file = apiData.list[0];
        const shareid = apiData.shareid;
        const uk = apiData.uk;
        const sign = apiData.sign;
        const timestamp = apiData.timestamp;
        const fsId = file.fs_id;
        const isVideo = file.category === 1;

        // Get thumbnail
        let thumbnail = null;
        if (file.thumbs) {
            thumbnail = file.thumbs.url3 || file.thumbs.url2 || file.thumbs.url1 || file.thumbs.icon;
        }

        // Step 2: Try to get download link via filemetas API (more reliable)
        let downloadLink = null;
        let streamLink = null;
        let resolutions = [];

        try {
            // Get real download link using filemetas
            const fileMetasUrl = `https://www.terabox.com/share/filemetas?shareid=${shareid}&uk=${uk}&fid_list=[${fsId}]&sign=${sign || ''}&timestamp=${timestamp || ''}&jsToken=`;
            
            const metasResponse = await axios.get(fileMetasUrl, {
                headers,
                timeout: 30000,
                validateStatus: () => true
            });

            if (metasResponse.data && metasResponse.data.list && metasResponse.data.list[0]) {
                const metaFile = metasResponse.data.list[0];
                if (metaFile.dlink) {
                    downloadLink = metaFile.dlink;
                }
            }
        } catch (e) {
            console.log('Filemetas error:', e.message);
        }

        // Step 3: For videos, get streaming URLs with multiple resolutions
        if (isVideo) {
            const resolutionTypes = [
                { type: 'M3U8_AUTO_720', label: '720p HD' },
                { type: 'M3U8_AUTO_480', label: '480p SD' },
                { type: 'M3U8_AUTO_360', label: '360p' },
                { type: 'M3U8_FLV_264_480', label: '480p FLV' }
            ];

            for (const resType of resolutionTypes) {
                try {
                    const streamApiUrl = `https://www.terabox.com/share/streaming?shareid=${shareid}&uk=${uk}&fid=${fsId}&type=${resType.type}`;
                    
                    const streamResponse = await axios.get(streamApiUrl, {
                        headers,
                        timeout: 15000,
                        validateStatus: () => true
                    });

                    if (streamResponse.data) {
                        const streamData = streamResponse.data;
                        const streamUrl = streamData.ltime || streamData.m3u8_url || streamData.url || streamData.mlink;
                        
                        if (streamUrl && streamUrl.startsWith('http')) {
                            resolutions.push({
                                label: resType.label,
                                type: resType.type,
                                url: streamUrl
                            });
                            
                            // Set first successful as main stream link
                            if (!streamLink) {
                                streamLink = streamUrl;
                            }
                        }
                    }
                } catch (e) {
                    console.log(`Stream ${resType.type} error:`, e.message);
                }
            }

            // Try to get direct video URL if no m3u8 found
            if (!streamLink) {
                try {
                    const directUrl = `https://www.terabox.com/share/streaming?shareid=${shareid}&uk=${uk}&fid=${fsId}&type=video`;
                    const directResponse = await axios.get(directUrl, {
                        headers,
                        timeout: 15000,
                        validateStatus: () => true
                    });

                    if (directResponse.data && directResponse.data.url) {
                        streamLink = directResponse.data.url;
                    }
                } catch (e) {
                    console.log('Direct video error:', e.message);
                }
            }
        }

        // Step 4: Use dlink as fallback
        if (!downloadLink && file.dlink) {
            downloadLink = file.dlink;
        }

        // Prepare result
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
                downloadLink: downloadLink || null,
                streamLink: streamLink || null,
                resolutions: resolutions,
                thumbnail: thumbnail,
                shareid: shareid,
                uk: uk,
                sign: sign,
                timestamp: timestamp,
                rawDlink: file.dlink || null
            }
        };

        // Include all files if multiple
        if (apiData.list.length > 1) {
            result.data.files = apiData.list.map(f => ({
                filename: f.server_filename,
                size: f.size,
                sizeFormatted: formatSize(f.size),
                category: f.category,
                fsId: f.fs_id,
                isVideo: f.category === 1,
                thumbnail: f.thumbs ? (f.thumbs.url3 || f.thumbs.url2 || f.thumbs.url1) : null
            }));
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Error:', error.message);
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
