const axios = require('axios');

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const { url, cookies } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

    try {
        // Parse cookies
        let cookieString = '';
        if (cookies) {
            let parsed = cookies;
            if (typeof cookies === 'string') {
                try { parsed = JSON.parse(cookies); } catch (e) { cookieString = cookies; }
            }
            if (parsed && typeof parsed === 'object') {
                const arr = parsed.cookies || parsed;
                if (Array.isArray(arr)) {
                    cookieString = arr.map(c => `${c.name}=${c.value}`).join('; ');
                }
            }
        }

        // Extract short URL code
        let shortUrl = '';
        if (url.includes('/s/')) {
            shortUrl = url.split('/s/')[1].split(/[?#]/)[0];
        } else {
            shortUrl = url.split('/').pop().split(/[?#]/)[0];
        }

        if (!shortUrl) {
            return res.status(400).json({ success: false, error: 'Invalid TeraBox URL' });
        }

        // Detect domain
        let baseDomain = 'www.terabox.com';
        const domainMatch = url.match(/https?:\/\/([^\/]+)/);
        if (domainMatch) {
            baseDomain = domainMatch[1];
        }

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': cookieString,
            'Referer': `https://${baseDomain}/`
        };

        let fileInfo = null;
        let downloadLink = null;
        let streamingLinks = [];
        let thumbnail = null;

        // METHOD 1: Try third-party API first (fastest)
        console.log('Trying third-party API...');
        try {
            const thirdPartyRes = await axios.post(
                'https://ytshorts.savetube.me/api/v1/terabox-downloader',
                { url },
                { 
                    headers: { 
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 15000 
                }
            );

            if (thirdPartyRes.data && thirdPartyRes.data.response) {
                const resp = thirdPartyRes.data.response[0];
                if (resp) {
                    fileInfo = {
                        name: resp.title || 'Unknown',
                        size: 0,
                        sizeFormatted: 'N/A',
                        isVideo: true,
                        thumbnail: resp.thumbnail || null
                    };
                    thumbnail = resp.thumbnail;

                    if (resp.resolutions) {
                        downloadLink = resp.resolutions['Fast Download'] || 
                                       resp.resolutions['HD Video'] || 
                                       Object.values(resp.resolutions)[0];
                        
                        // Add all resolutions as streaming options
                        Object.entries(resp.resolutions).forEach(([key, value]) => {
                            if (value && value.startsWith('http')) {
                                streamingLinks.push({
                                    resolution: key,
                                    type: key,
                                    url: value
                                });
                            }
                        });
                    }
                }
            }
        } catch (e) {
            console.log('Third-party API failed:', e.message);
        }

        // METHOD 2: Try another third-party API
        if (!downloadLink) {
            console.log('Trying backup API...');
            try {
                const backupRes = await axios.get(
                    `https://teraboxvideodownloader.nepcoderdevs.workers.dev/api?url=${encodeURIComponent(url)}`,
                    { timeout: 15000 }
                );

                if (backupRes.data && backupRes.data.response) {
                    const resp = Array.isArray(backupRes.data.response) 
                        ? backupRes.data.response[0] 
                        : backupRes.data.response;
                    
                    if (resp) {
                        if (!fileInfo) {
                            fileInfo = {
                                name: resp.title || resp.server_filename || 'Unknown',
                                size: resp.size || 0,
                                sizeFormatted: resp.sizebytes ? formatSize(resp.sizebytes) : 'N/A',
                                isVideo: true,
                                thumbnail: resp.thumbnail || null
                            };
                        }
                        
                        if (!thumbnail) thumbnail = resp.thumbnail;
                        
                        if (resp.resolutions) {
                            if (!downloadLink) {
                                downloadLink = resp.resolutions['Fast Download'] || 
                                               resp.resolutions['HD Video'] || 
                                               Object.values(resp.resolutions)[0];
                            }
                            
                            if (streamingLinks.length === 0) {
                                Object.entries(resp.resolutions).forEach(([key, value]) => {
                                    if (value && value.startsWith('http')) {
                                        streamingLinks.push({
                                            resolution: key,
                                            type: key,
                                            url: value
                                        });
                                    }
                                });
                            }
                        }
                        
                        if (!downloadLink && resp.dlink) {
                            downloadLink = resp.dlink;
                        }
                    }
                }
            } catch (e) {
                console.log('Backup API failed:', e.message);
            }
        }

        // METHOD 3: Direct TeraBox API (if third-party fails)
        if (!downloadLink && !fileInfo) {
            console.log('Trying direct TeraBox API...');
            try {
                // Get file info from shorturlinfo
                const infoUrl = `https://${baseDomain}/api/shorturlinfo?shorturl=${shortUrl}&root=1`;
                const infoRes = await axios.get(infoUrl, { headers, timeout: 10000 });

                if (infoRes.data && infoRes.data.errno === 0 && infoRes.data.list) {
                    const file = infoRes.data.list[0];
                    
                    fileInfo = {
                        name: file.server_filename || 'Unknown',
                        size: file.size || 0,
                        sizeFormatted: formatSize(file.size),
                        category: file.category,
                        isVideo: file.category === 1,
                        fsId: file.fs_id,
                        thumbnail: file.thumbs?.url3 || file.thumbs?.url2 || null
                    };

                    if (!thumbnail && file.thumbs) {
                        thumbnail = file.thumbs.url3 || file.thumbs.url2 || file.thumbs.url1;
                    }

                    if (file.dlink) {
                        downloadLink = file.dlink;
                    }

                    // Try to get streaming links for video
                    if (file.category === 1 && infoRes.data.shareid && infoRes.data.uk) {
                        const shareid = infoRes.data.shareid;
                        const uk = infoRes.data.uk;
                        const fsId = file.fs_id;

                        const resTypes = ['M3U8_AUTO_720', 'M3U8_AUTO_480', 'M3U8_AUTO_360'];
                        for (const type of resTypes) {
                            try {
                                const streamUrl = `https://${baseDomain}/share/streaming?shareid=${shareid}&uk=${uk}&fid=${fsId}&type=${type}`;
                                const streamRes = await axios.get(streamUrl, { headers, timeout: 5000 });
                                
                                if (streamRes.data && streamRes.data.m3u8_url) {
                                    streamingLinks.push({
                                        resolution: type.replace('M3U8_AUTO_', '') + 'p',
                                        type: type,
                                        url: streamRes.data.m3u8_url
                                    });
                                }
                            } catch (e) {
                                // Continue
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('Direct API failed:', e.message);
            }
        }

        // If still nothing, return error
        if (!fileInfo && !downloadLink) {
            return res.status(404).json({
                success: false,
                error: 'Could not fetch file information. The link may be invalid, expired, or the file is private.',
                tried: ['third-party API', 'backup API', 'direct TeraBox API']
            });
        }

        // Build response
        const response = {
            success: true,
            file: fileInfo || {
                name: 'Unknown',
                size: 0,
                sizeFormatted: 'N/A',
                isVideo: true,
                thumbnail: thumbnail
            },
            download: {
                available: !!downloadLink,
                url: downloadLink || null
            },
            streaming: {
                available: streamingLinks.length > 0,
                links: streamingLinks
            },
            playerLinks: {
                vlc: downloadLink ? `vlc://${downloadLink}` : null,
                potplayer: downloadLink ? `potplayer://${downloadLink}` : null,
                iina: downloadLink ? `iina://weblink?url=${encodeURIComponent(downloadLink)}` : null,
                nplayer: downloadLink ? `nplayer-${downloadLink}` : null,
                infuse: downloadLink ? `infuse://x-callback-url/play?url=${encodeURIComponent(downloadLink)}` : null,
                m3u8: streamingLinks.length > 0 ? streamingLinks[0].url : null
            }
        };

        return res.status(200).json(response);

    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Request failed: ' + error.message
        });
    }
};

function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
