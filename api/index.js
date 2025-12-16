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
        let shortCode = url;
        
        // Handle different TeraBox domains: terabox.com, 1024terabox.com, teraboxapp.com, etc.
        if (url.includes('/s/')) {
            shortCode = url.split('/s/')[1].split('?')[0].split('/')[0];
        } else if (url.includes('surl=')) {
            const match = url.match(/surl=([^&]+)/);
            if (match) shortCode = match[1];
        }

        // Remove any trailing characters
        shortCode = shortCode.replace(/[^a-zA-Z0-9_-]/g, '');

        if (!shortCode) {
            return res.status(400).json({ success: false, error: 'Invalid TeraBox URL format' });
        }

        // Parse cookies from various formats
        let cookieString = '';
        let parsedCookies = cookies;
        
        if (typeof cookies === 'string') {
            try {
                parsedCookies = JSON.parse(cookies);
            } catch (e) {
                // If not valid JSON, use as raw cookie string
                cookieString = cookies;
            }
        }

        if (parsedCookies && typeof parsedCookies === 'object') {
            // Handle format: { cookies: [...] } or just [...]
            const cookieArray = parsedCookies.cookies || parsedCookies;
            if (Array.isArray(cookieArray)) {
                cookieString = cookieArray.map(c => `${c.name}=${c.value}`).join('; ');
            }
        }

        // Build request headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.terabox.com/',
            'Origin': 'https://www.terabox.com',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
        };

        if (cookieString) {
            headers['Cookie'] = cookieString;
        }

        // Step 1: Get file information from TeraBox short URL API
        const apiUrl = `https://www.terabox.com/api/shorturlinfo?shorturl=${shortCode}&root=1`;
        
        console.log('Fetching:', apiUrl);
        
        const response = await axios.get(apiUrl, { 
            headers,
            timeout: 30000,
            validateStatus: () => true
        });

        const data = response.data;

        // Check for API errors
        if (data.errno !== 0) {
            let errorMessage = 'TeraBox API error';
            
            switch (data.errno) {
                case -6:
                    errorMessage = 'File not found or link expired';
                    break;
                case -9:
                    errorMessage = 'File has been deleted';
                    break;
                case -21:
                    errorMessage = 'Share link does not exist';
                    break;
                case 2:
                    errorMessage = 'Invalid parameters';
                    break;
                case 105:
                    errorMessage = 'Share link has expired';
                    break;
                case 112:
                    errorMessage = 'Page does not exist';
                    break;
                default:
                    errorMessage = data.errmsg || `Error code: ${data.errno}`;
            }
            
            return res.status(400).json({ 
                success: false, 
                error: errorMessage,
                errno: data.errno
            });
        }

        // Check if files exist
        if (!data.list || data.list.length === 0) {
            return res.status(404).json({ success: false, error: 'No files found in this share' });
        }

        const file = data.list[0];
        const uk = data.uk;
        const shareid = data.shareid;
        const sign = data.sign;
        const timestamp = data.timestamp;
        
        // Get download link
        let downloadLink = file.dlink || null;
        
        // If no direct link available, try alternative method
        if (!downloadLink && file.fs_id && uk && shareid) {
            // Construct download request
            try {
                const downloadApiUrl = `https://www.terabox.com/share/download`;
                const downloadParams = {
                    shareid: shareid,
                    uk: uk,
                    product: 'share',
                    primaryid: shareid,
                    fid_list: `[${file.fs_id}]`
                };
                
                if (sign) downloadParams.sign = sign;
                if (timestamp) downloadParams.timestamp = timestamp;
                
                const downloadResponse = await axios.get(downloadApiUrl, {
                    headers,
                    params: downloadParams,
                    timeout: 30000,
                    validateStatus: () => true
                });
                
                if (downloadResponse.data && downloadResponse.data.errno === 0 && downloadResponse.data.list) {
                    downloadLink = downloadResponse.data.list[0]?.dlink;
                }
            } catch (dlError) {
                console.error('Download link fetch error:', dlError.message);
            }
        }

        // Build response
        const result = {
            success: true,
            data: {
                filename: file.server_filename,
                size: file.size,
                sizeFormatted: formatSize(file.size),
                category: file.category,
                fsId: file.fs_id,
                md5: file.md5 || null,
                downloadLink: downloadLink,
                thumbs: file.thumbs || null,
                isDir: file.isdir === 1,
                shareid: shareid,
                uk: uk
            }
        };

        // If it's a directory, include the list of files
        if (file.isdir === 1 || data.list.length > 1) {
            result.data.files = data.list.map(f => ({
                filename: f.server_filename,
                size: f.size,
                sizeFormatted: formatSize(f.size),
                category: f.category,
                fsId: f.fs_id,
                isDir: f.isdir === 1,
                downloadLink: f.dlink || null
            }));
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Error:', error.message);
        
        // Handle specific error types
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({ 
                success: false, 
                error: 'Request timeout - TeraBox server took too long to respond'
            });
        }
        
        if (error.response) {
            return res.status(error.response.status || 500).json({ 
                success: false, 
                error: 'TeraBox server error',
                message: error.message
            });
        }
        
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to process request',
            message: error.message 
        });
    }
};

/**
 * Format bytes to human readable size
 */
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}
