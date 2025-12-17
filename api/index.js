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

        // Detect domain from URL
        let baseDomain = 'www.terabox.com';
        const domainMatch = url.match(/https?:\/\/([^\/]+)/);
        if (domainMatch) {
            baseDomain = domainMatch[1];
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

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': cookieString,
            'Referer': `https://${baseDomain}/`
        };

        // Step 1: Fetch the share page to get required parameters
        const pageUrl = `https://${baseDomain}/s/${shortUrl}`;
        console.log('Fetching page:', pageUrl);
        
        const pageRes = await axios.get(pageUrl, { 
            headers, 
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: () => true
        });
        
        const html = pageRes.data;
        if (typeof html !== 'string') {
            return res.status(400).json({ success: false, error: 'Failed to load TeraBox page' });
        }

        // Extract parameters from HTML
        const extractParam = (patterns, html) => {
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[1]) return match[1];
            }
            return null;
        };

        const jsToken = extractParam([
            /fn\s*\(\s*["']([^"']+)["']\s*\)/,
            /window\.jsToken\s*=\s*["']([^"']+)["']/,
            /"jsToken"\s*:\s*"([^"]+)"/,
            /jsToken%22%3A%22([^%]+)%22/
        ], html);

        const shareid = extractParam([
            /shareid['"]\s*[:=]\s*(\d+)/,
            /"shareid"\s*:\s*(\d+)/,
            /shareid=(\d+)/
        ], html);

        const uk = extractParam([
            /uk['"]\s*[:=]\s*(\d+)/,
            /"uk"\s*:\s*(\d+)/,
            /uk=(\d+)/
        ], html);

        const sign = extractParam([
            /sign['"]\s*[:=]\s*['"]([^'"]+)['"]/,
            /"sign"\s*:\s*"([^"]+)"/
        ], html);

        const timestamp = extractParam([
            /timestamp['"]\s*[:=]\s*(\d+)/,
            /"timestamp"\s*:\s*(\d+)/
        ], html);

        // Extract file list from page data
        let fileList = [];
        
        // Try to extract from window.locals or embedded JSON
        const listPatterns = [
            /"list"\s*:\s*(\[[\s\S]*?\])\s*,\s*"share_uk"/,
            /"list"\s*:\s*(\[[\s\S]*?\])\s*,\s*"uk"/,
            /window\.locals\.list\s*=\s*(\[[\s\S]*?\]);/
        ];

        for (const pattern of listPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                try {
                    fileList = JSON.parse(match[1]);
                    break;
                } catch (e) {
                    console.log('Parse error for pattern');
                }
            }
        }

        // Step 2: If no file list from page, try shorturlinfo API
        if (fileList.length === 0) {
            try {
                const infoUrl = `https://${baseDomain}/api/shorturlinfo?shorturl=${shortUrl}&root=1`;
                const infoRes = await axios.get(infoUrl, { headers, timeout: 15000 });
                
                if (infoRes.data && infoRes.data.errno === 0 && infoRes.data.list) {
                    fileList = infoRes.data.list;
                }
            } catch (e) {
                console.log('shorturlinfo API failed:', e.message);
            }
        }

        // Step 3: Try share/list API
        if (fileList.length === 0 && shareid && uk) {
            try {
                const listUrl = `https://${baseDomain}/share/list?shareid=${shareid}&uk=${uk}&root=1&dir=%2F`;
                const listRes = await axios.get(listUrl, { headers, timeout: 15000 });
                
                if (listRes.data && listRes.data.errno === 0 && listRes.data.list) {
                    fileList = listRes.data.list;
                }
            } catch (e) {
                console.log('share/list API failed:', e.message);
            }
        }

        if (fileList.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'No files found',
                debug: { shareid, uk, hasJsToken: !!jsToken }
            });
        }

        const file = fileList[0];
        const fsId = file.fs_id;
        const isVideo = file.category === 1;

        // Get thumbnail
        let thumbnail = null;
        if (file.thumbs) {
            thumbnail = file.thumbs.url3 || file.thumbs.url2 || file.thumbs.url1;
            if (thumbnail) thumbnail = thumbnail.replace(/\\/g, '');
        }

        // Step 4: Get download link using multiple methods
        let downloadLink = null;
        let streamingLinks = [];

        const apiHeaders = {
            ...headers,
            'Accept': 'application/json, text/plain, */*',
            'Referer': pageUrl
        };

        // Method 1: filemetas API (most reliable for download)
        if (shareid && uk && fsId && jsToken) {
            try {
                const metasUrl = `https://${baseDomain}/api/filemetas?dlink=1&origin=dlna&shareid=${shareid}&uk=${uk}&fsidlist=[${fsId}]`;
                const metasRes = await axios.get(metasUrl, { 
                    headers: {
                        ...apiHeaders,
                        'X-Requested-With': 'XMLHttpRequest'
                    }, 
                    timeout: 15000 
                });
                
                if (metasRes.data && metasRes.data.errno === 0 && metasRes.data.info) {
                    const info = metasRes.data.info[0];
                    if (info && info.dlink) {
                        downloadLink = info.dlink;
                    }
                }
            } catch (e) {
                console.log('filemetas API error:', e.message);
            }
        }

        // Method 2: share/download API
        if (!downloadLink && shareid && uk && fsId) {
            try {
                const dlUrl = `https://${baseDomain}/share/download?shareid=${shareid}&uk=${uk}&product=share&primaryid=${fsId}&fid_list=[${fsId}]&extra=%7B%22sekey%22%3A%22${encodeURIComponent(sign || '')}%22%7D`;
                const dlRes = await axios.get(dlUrl, { headers: apiHeaders, timeout: 15000 });
                
                if (dlRes.data && dlRes.data.errno === 0) {
                    downloadLink = dlRes.data.dlink || (dlRes.data.list && dlRes.data.list[0]?.dlink);
                }
            } catch (e) {
                console.log('share/download API error:', e.message);
            }
        }

        // Method 3: Use dlink from file object
        if (!downloadLink && file.dlink) {
            downloadLink = file.dlink.replace(/\\/g, '');
        }

        // Step 5: Get streaming links for videos
        if (isVideo && shareid && uk && fsId) {
            const resolutions = [
                { type: 'M3U8_AUTO_720', label: '720p HD' },
                { type: 'M3U8_AUTO_480', label: '480p' },
                { type: 'M3U8_AUTO_360', label: '360p' },
                { type: 'M3U8_FLV_264_720', label: '720p FLV' },
                { type: 'M3U8_HLS_MP4_720', label: '720p MP4' },
                { type: 'M3U8_HLS_MP4_480', label: '480p MP4' }
            ];

            for (const r of resolutions) {
                try {
                    const streamUrl = `https://${baseDomain}/share/streaming?shareid=${shareid}&uk=${uk}&fid=${fsId}&type=${r.type}`;
                    const streamRes = await axios.get(streamUrl, { headers: apiHeaders, timeout: 10000 });
                    
                    if (streamRes.data) {
                        const m3u8 = streamRes.data.m3u8_url || streamRes.data.ltime;
                        if (m3u8 && m3u8.startsWith('http')) {
                            streamingLinks.push({
                                resolution: r.label,
                                type: r.type,
                                url: m3u8
                            });
                        }
                    }
                } catch (e) {
                    // Continue to next resolution
                }
            }
        }

        // Step 6: Fallback to third-party API if nothing works
        if (!downloadLink && streamingLinks.length === 0) {
            try {
                const thirdPartyRes = await axios.post('https://ytshorts.savetube.me/api/v1/terabox-downloader', 
                    { url },
                    { 
                        headers: { 'Content-Type': 'application/json', 'User-Agent': headers['User-Agent'] },
                        timeout: 20000 
                    }
                );
                
                if (thirdPartyRes.data && thirdPartyRes.data.response) {
                    const resp = thirdPartyRes.data.response[0];
                    if (resp) {
                        if (resp.resolutions) {
                            downloadLink = resp.resolutions['Fast Download'] || resp.resolutions['HD Video'] || Object.values(resp.resolutions)[0];
                        }
                        if (!thumbnail && resp.thumbnail) {
                            thumbnail = resp.thumbnail;
                        }
                    }
                }
            } catch (e) {
                console.log('Third-party API failed:', e.message);
            }
        }

        // Format file size
        const formatSize = (bytes) => {
            if (!bytes) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        // Build response
        const response = {
            success: true,
            file: {
                name: file.server_filename || 'Unknown',
                size: file.size || 0,
                sizeFormatted: formatSize(file.size),
                category: file.category,
                isVideo: isVideo,
                fsId: fsId,
                thumbnail: thumbnail
            },
            download: {
                url: downloadLink,
                available: !!downloadLink
            },
            streaming: {
                available: streamingLinks.length > 0,
                links: streamingLinks
            },
            // For external players
            playerLinks: {
                vlc: downloadLink ? `vlc://${downloadLink}` : null,
                potplayer: downloadLink ? `potplayer://${downloadLink}` : null,
                mxplayer: downloadLink ? `intent:${downloadLink}#Intent;package=com.mxtech.videoplayer.ad;end` : null,
                m3u8: streamingLinks.length > 0 ? streamingLinks[0].url : null
            },
            debug: {
                domain: baseDomain,
                shortUrl,
                shareid,
                uk,
                hasSign: !!sign,
                hasJsToken: !!jsToken,
                hasTimestamp: !!timestamp,
                fileCount: fileList.length
            }
        };

        return res.status(200).json(response);

    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Request failed',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
