<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TeraBox API - Download & Stream</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
            min-height: 100vh;
        }
        .glass {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .btn-primary:hover {
            background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
        }
        .btn-download {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        }
        .btn-download:hover {
            background: linear-gradient(135deg, #0f8a7e 0%, #32d970 100%);
        }
        .spinner {
            border: 3px solid rgba(255,255,255,0.2);
            border-top-color: #fff;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
    </style>
</head>
<body class="text-white p-4 md:p-8">
    
    <div class="max-w-4xl mx-auto">
        
        <!-- Header -->
        <header class="text-center mb-8">
            <div class="inline-flex items-center gap-3 mb-4">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <i class="fas fa-cloud-arrow-down text-xl"></i>
                </div>
                <h1 class="text-3xl font-bold">TeraBox API</h1>
            </div>
            <p class="text-gray-400">Get download links & streaming URLs for TeraBox files</p>
        </header>

        <!-- Input Section -->
        <section class="glass rounded-2xl p-6 mb-6">
            <div class="space-y-4">
                
                <!-- URL Input -->
                <div>
                    <label class="block text-sm font-medium text-gray-300 mb-2">
                        <i class="fas fa-link mr-2 text-purple-400"></i>TeraBox URL
                    </label>
                    <input type="text" id="input-url"
                        class="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
                        placeholder="https://terabox.com/s/xxxxx or https://1024terabox.com/s/xxxxx"
                        value="https://1024terabox.com/s/1NI9Ume5Ty8spIssTMC6BwA">
                </div>

                <!-- Cookies Toggle -->
                <div>
                    <button onclick="document.getElementById('cookies-section').classList.toggle('hidden')" 
                        class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition">
                        <i class="fas fa-cookie-bite text-amber-400"></i>
                        <span>Cookies (Click to expand)</span>
                        <i class="fas fa-chevron-down text-xs"></i>
                    </button>
                    <div id="cookies-section" class="hidden mt-3">
                        <textarea id="input-cookies" rows="5"
                            class="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-gray-300 placeholder-gray-500 focus:outline-none focus:border-amber-500 transition font-mono text-xs"
                            placeholder='{"cookies":[...]}'></textarea>
                    </div>
                </div>

                <!-- Submit Button -->
                <button onclick="fetchData()" id="btn-fetch"
                    class="w-full btn-primary text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition transform hover:scale-[1.02]">
                    <i class="fas fa-bolt"></i>
                    <span>Get Download Links</span>
                </button>
            </div>
        </section>

        <!-- Status -->
        <div id="status" class="hidden mb-6 rounded-xl p-4"></div>

        <!-- Results Section -->
        <section id="results" class="hidden space-y-6">
            
            <!-- File Info -->
            <div class="glass rounded-2xl p-6">
                <div class="flex items-center gap-2 mb-4">
                    <i class="fas fa-file-video text-blue-400"></i>
                    <h2 class="text-lg font-semibold">File Information</h2>
                </div>
                
                <div class="flex flex-col md:flex-row gap-4">
                    <div id="thumbnail-box" class="hidden w-32 h-20 rounded-lg overflow-hidden bg-black/50 flex-shrink-0">
                        <img id="thumbnail" src="" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1 space-y-2">
                        <p class="font-bold text-xl" id="file-name">-</p>
                        <div class="flex flex-wrap gap-4 text-sm text-gray-400">
                            <span id="file-size"><i class="fas fa-hard-drive mr-1"></i>-</span>
                            <span id="file-type"><i class="fas fa-film mr-1"></i>-</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Download Links -->
            <div class="glass rounded-2xl p-6">
                <div class="flex items-center gap-2 mb-4">
                    <i class="fas fa-download text-green-400"></i>
                    <h2 class="text-lg font-semibold">Download Link</h2>
                </div>
                
                <div id="download-section">
                    <div id="download-available" class="hidden space-y-3">
                        <a id="download-btn" href="#" target="_blank" rel="noopener"
                            class="block w-full btn-download text-white text-center font-bold py-4 rounded-xl transition transform hover:scale-[1.02]">
                            <i class="fas fa-download mr-2"></i>Download File
                        </a>
                        <div class="flex gap-2">
                            <input type="text" id="download-url" readonly
                                class="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-gray-300 text-sm font-mono">
                            <button onclick="copyToClipboard('download-url')" class="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <div id="download-unavailable" class="hidden text-center py-8 text-gray-500">
                        <i class="fas fa-exclamation-circle text-3xl mb-2"></i>
                        <p>Download link not available</p>
                    </div>
                </div>
            </div>

            <!-- Streaming Links -->
            <div id="streaming-section" class="hidden glass rounded-2xl p-6">
                <div class="flex items-center gap-2 mb-4">
                    <i class="fas fa-play-circle text-purple-400"></i>
                    <h2 class="text-lg font-semibold">Streaming Links (M3U8)</h2>
                </div>
                <p class="text-sm text-gray-400 mb-4">Use these links with external players like VLC, PotPlayer, MX Player</p>
                <div id="streaming-links" class="space-y-2"></div>
            </div>

            <!-- External Player Links -->
            <div id="player-section" class="hidden glass rounded-2xl p-6">
                <div class="flex items-center gap-2 mb-4">
                    <i class="fas fa-external-link-alt text-cyan-400"></i>
                    <h2 class="text-lg font-semibold">Open in External Player</h2>
                </div>
                <div id="player-links" class="grid grid-cols-2 md:grid-cols-4 gap-3"></div>
            </div>

            <!-- Raw API Response -->
            <div class="glass rounded-2xl p-6">
                <button onclick="document.getElementById('raw-response').classList.toggle('hidden')" 
                    class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition w-full">
                    <i class="fas fa-code"></i>
                    <span>Raw API Response</span>
                    <i class="fas fa-chevron-down text-xs ml-auto"></i>
                </button>
                <div id="raw-response" class="hidden mt-4">
                    <pre id="response-json" class="bg-black/50 rounded-lg p-4 text-xs text-green-400 overflow-x-auto max-h-96"></pre>
                </div>
            </div>

        </section>

        <!-- Recommended Players -->
        <section class="glass rounded-2xl p-6 mt-6">
            <h2 class="text-lg font-semibold mb-4">
                <i class="fas fa-star text-yellow-400 mr-2"></i>Recommended Players
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div class="bg-black/30 rounded-lg p-4">
                    <h3 class="font-semibold text-blue-400 mb-2"><i class="fas fa-desktop mr-2"></i>Desktop</h3>
                    <ul class="space-y-1 text-gray-400">
                        <li>• <a href="https://www.videolan.org/vlc/" target="_blank" class="text-white hover:text-blue-400">VLC Media Player</a> (Best for M3U8)</li>
                        <li>• <a href="https://potplayer.daum.net/" target="_blank" class="text-white hover:text-blue-400">PotPlayer</a></li>
                        <li>• <a href="https://mpv.io/" target="_blank" class="text-white hover:text-blue-400">MPV Player</a></li>
                    </ul>
                </div>
                <div class="bg-black/30 rounded-lg p-4">
                    <h3 class="font-semibold text-green-400 mb-2"><i class="fas fa-mobile-alt mr-2"></i>Mobile</h3>
                    <ul class="space-y-1 text-gray-400">
                        <li>• <a href="https://play.google.com/store/apps/details?id=com.mxtech.videoplayer.ad" target="_blank" class="text-white hover:text-green-400">MX Player</a> (Android)</li>
                        <li>• <a href="https://apps.apple.com/app/vlc-for-mobile/id650377962" target="_blank" class="text-white hover:text-green-400">VLC for iOS</a></li>
                        <li>• <a href="https://play.google.com/store/apps/details?id=org.videolan.vlc" target="_blank" class="text-white hover:text-green-400">VLC for Android</a></li>
                    </ul>
                </div>
            </div>
            <p class="text-xs text-gray-500 mt-4">
                <i class="fas fa-info-circle mr-1"></i>
                Copy the M3U8 or download URL and paste it into your player's "Open Network Stream" option.
            </p>
        </section>

        <!-- Footer -->
        <footer class="text-center mt-8 text-gray-500 text-sm">
            <p>TeraBox API • For Educational Purposes Only</p>
        </footer>

    </div>

    <script>
        // Default cookies
        const DEFAULT_COOKIES = {"url":"https://www.terabox.com","cookies":[{"domain":"www.terabox.com","hostOnly":true,"httpOnly":false,"name":"csrfToken","path":"/","sameSite":"unspecified","secure":false,"session":true,"storeId":"0","value":"gt8gMxIBAjXaGnqpKp7kTvmd"},{"domain":".terabox.com","expirationDate":1771069507.814615,"hostOnly":false,"httpOnly":false,"name":"browserid","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"6QhVuJprM2elRR2S44hdSHbQ0UTbFMdP3yQQ23fJkuFSoktSxxMIlbMgev0="},{"domain":".terabox.com","expirationDate":1768477538.120609,"hostOnly":false,"httpOnly":false,"name":"lang","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"en"},{"domain":".terabox.com","expirationDate":1800445544.448699,"hostOnly":false,"httpOnly":false,"name":"_ga","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"GA1.1.412164912.1765885513"},{"domain":".terabox.com","expirationDate":1797421529.069464,"hostOnly":false,"httpOnly":true,"name":"ndus","path":"/","sameSite":"unspecified","secure":true,"session":false,"storeId":"0","value":"YfF8bi3teHui2b2ZR2JFMDNRYtUmfedCtvQe0lve"},{"domain":".terabox.com","expirationDate":1773661536,"hostOnly":false,"httpOnly":false,"name":"_gcl_au","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"1.1.1672539397.1765885537"},{"domain":".terabox.com","expirationDate":1773661537,"hostOnly":false,"httpOnly":false,"name":"_rdt_uuid","path":"/","sameSite":"strict","secure":true,"session":false,"storeId":"0","value":"1765885537537.9cea5a38-8e1f-4e3e-9923-60396606e12b"},{"domain":".terabox.com","expirationDate":1773661538,"hostOnly":false,"httpOnly":false,"name":"_rdt_em","path":"/","sameSite":"strict","secure":true,"session":false,"storeId":"0","value":":1a68135193855528b41e250da15e38d7ab1ccb4188c7cf0ca8b54f16d9fd0736,2dfa6e90653bc791092a3aa4a05465bf12322098e77a772e814f77c95357460e"},{"domain":".terabox.com","expirationDate":1800445538.132261,"hostOnly":false,"httpOnly":false,"name":"_ga_HSVH9T016H","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"GS2.1.s1765885536$o1$g0$t1765885538$j58$l0$h0"},{"domain":"www.terabox.com","expirationDate":1781437539,"hostOnly":true,"httpOnly":false,"name":"g_state","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"{\"i_l\":0,\"i_ll\":1765885539619,\"i_b\":\"YG4tydtRv2iRqx/utXgIqEXT2UKLcNTAu9F9F7m23rg\",\"i_e\":{\"enable_itp_optimization\":0}}"},{"domain":"www.terabox.com","expirationDate":1768477541,"hostOnly":true,"httpOnly":false,"name":"ndut_fmt","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"B9BE3C2D316A95FEAD947AF03F7F90BE93453CC8B19A81736D7273AC937A587C"},{"domain":"www.terabox.com","expirationDate":1768477542.523677,"hostOnly":true,"httpOnly":false,"name":"ndut_fmv","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"259ec0b6993b5a5e98a78c0444581e5471ff93decf3f7566dbc1d0b0bfcdb65acccb85fcae680b420f8c5c29bdc9bc187434e5b0cb8e540b274667559decbdfe218eeadb9520518fb7add6714cf81fa294a59e55f58624fd4eb3dee42797fe7e6f432e49146edfa1ccb87cfe481027d9"},{"domain":".terabox.com","expirationDate":1765892745.020693,"hostOnly":false,"httpOnly":true,"name":"ab_sr","path":"/","sameSite":"no_restriction","secure":true,"session":false,"storeId":"0","value":"1.0.1_ODQwNDlkNzg3M2RkY2U5MjQyZGFhZTNiZjkwZjk5MjhmOWJjYzdlNzY3NDU5YTc0M2EyZGFhODlmMmM2NzBhMmRjMTM0ZmQwYzk3ZWE0OGI1MzFiOGYyMjdmMjlmZWYwNDhjNjhlMmIxZGVlMmE5YTI3MjFiNmRkZDkzMGZkYjQxZDUzYzg1NGFiZWE0ZWI2M2Y5ZjA0Y2M4NTcxYjgxZQ=="},{"domain":".terabox.com","hostOnly":false,"httpOnly":false,"name":"ab_ymg_result","path":"/","sameSite":"unspecified","secure":false,"session":true,"storeId":"0","value":"{\"data\":\"e03381a764728b08335cce57bf5b87b712da60cc09d95c96b96f40a5881513ba6f1b036dc0de9fb68713434419729b4e89508517a1b832f4ca94648767c98c61fad9a3fe4940fb553f0b0d4439c8f993672a1984b8ac190e8f0970f5c1d987d7688474c13b2a61f88445b73a55292232a9fb38456233b2340dce0671ff427ede\",\"key_id\":\"66\",\"sign\":\"27d27084\"}"},{"domain":".terabox.com","expirationDate":1800445574.598458,"hostOnly":false,"httpOnly":false,"name":"_ga_06ZNKL8C2E","path":"/","sameSite":"unspecified","secure":false,"session":false,"storeId":"0","value":"GS2.1.s1765885512$o1$g1$t1765885574$j60$l0$h0"}]};

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('input-cookies').value = JSON.stringify(DEFAULT_COOKIES, null, 2);
        });

        async function fetchData() {
            const url = document.getElementById('input-url').value.trim();
            const cookies = document.getElementById('input-cookies').value.trim();
            const btn = document.getElementById('btn-fetch');
            const status = document.getElementById('status');
            const results = document.getElementById('results');

            if (!url) {
                showStatus('error', 'Please enter a TeraBox URL');
                return;
            }

            // Loading state
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner"></div><span>Fetching...</span>';
            results.classList.add('hidden');
            status.classList.add('hidden');

            try {
                const response = await fetch('/api', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, cookies })
                });

                const data = await response.json();

                if (data.success) {
                    displayResults(data);
                } else {
                    showStatus('error', data.error || 'Failed to fetch data');
                }

            } catch (error) {
                console.error(error);
                showStatus('error', 'Connection failed: ' + error.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-bolt"></i><span>Get Download Links</span>';
            }
        }

        function displayResults(data) {
            const results = document.getElementById('results');
            
            // File info
            document.getElementById('file-name').textContent = data.file.name;
            document.getElementById('file-size').innerHTML = `<i class="fas fa-hard-drive mr-1"></i>${data.file.sizeFormatted}`;
            
            const typeMap = { 1: 'Video', 2: 'Audio', 3: 'Image', 4: 'Document', 5: 'Archive', 6: 'Other' };
            document.getElementById('file-type').innerHTML = `<i class="fas fa-${data.file.isVideo ? 'film' : 'file'} mr-1"></i>${typeMap[data.file.category] || 'File'}`;

            // Thumbnail
            if (data.file.thumbnail) {
                document.getElementById('thumbnail').src = data.file.thumbnail;
                document.getElementById('thumbnail-box').classList.remove('hidden');
            } else {
                document.getElementById('thumbnail-box').classList.add('hidden');
            }

            // Download section
            if (data.download.available) {
                document.getElementById('download-available').classList.remove('hidden');
                document.getElementById('download-unavailable').classList.add('hidden');
                document.getElementById('download-btn').href = data.download.url;
                document.getElementById('download-url').value = data.download.url;
            } else {
                document.getElementById('download-available').classList.add('hidden');
                document.getElementById('download-unavailable').classList.remove('hidden');
            }

            // Streaming section
            const streamingSection = document.getElementById('streaming-section');
            const streamingLinks = document.getElementById('streaming-links');
            
            if (data.streaming.available && data.streaming.links.length > 0) {
                streamingSection.classList.remove('hidden');
                streamingLinks.innerHTML = data.streaming.links.map(link => `
                    <div class="flex items-center gap-2 bg-black/30 rounded-lg p-3">
                        <span class="text-purple-400 font-medium w-24">${link.resolution}</span>
                        <input type="text" readonly value="${link.url}" 
                            class="flex-1 bg-transparent border-none text-gray-300 text-xs font-mono truncate" 
                            id="stream-${link.type}">
                        <button onclick="copyToClipboard('stream-${link.type}')" 
                            class="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm transition">
                            <i class="fas fa-copy"></i>
                        </button>
                        <a href="${link.url}" target="_blank" 
                            class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm transition">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                    </div>
                `).join('');
            } else {
                streamingSection.classList.add('hidden');
            }

            // Player links section
            const playerSection = document.getElementById('player-section');
            const playerLinks = document.getElementById('player-links');
            
            const hasPlayerLinks = data.playerLinks.vlc || data.playerLinks.m3u8;
            if (hasPlayerLinks) {
                playerSection.classList.remove('hidden');
                
                const links = [];
                if (data.playerLinks.vlc) {
                    links.push({ name: 'VLC', icon: 'play', url: data.playerLinks.vlc, color: 'orange' });
                }
                if (data.playerLinks.m3u8) {
                    links.push({ name: 'M3U8 Stream', icon: 'broadcast-tower', url: data.playerLinks.m3u8, color: 'purple' });
                }
                if (data.download.available) {
                    links.push({ name: 'Direct URL', icon: 'link', url: data.download.url, color: 'blue' });
                }
                
                playerLinks.innerHTML = links.map(link => `
                    <a href="${link.url}" target="_blank" 
                        class="flex items-center justify-center gap-2 bg-${link.color}-600 hover:bg-${link.color}-700 rounded-lg py-3 transition">
                        <i class="fas fa-${link.icon}"></i>
                        <span class="text-sm font-medium">${link.name}</span>
                    </a>
                `).join('');
            } else {
                playerSection.classList.add('hidden');
            }

            // Raw response
            document.getElementById('response-json').textContent = JSON.stringify(data, null, 2);

            results.classList.remove('hidden');
            showStatus('success', 'Data fetched successfully!');
        }

        function showStatus(type, message) {
            const status = document.getElementById('status');
            const colors = {
                error: 'bg-red-500/20 border border-red-500/30 text-red-300',
                success: 'bg-green-500/20 border border-green-500/30 text-green-300'
            };
            const icons = {
                error: 'fa-times-circle',
                success: 'fa-check-circle'
            };

            status.className = `rounded-xl p-4 flex items-center gap-3 ${colors[type]}`;
            status.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
            status.classList.remove('hidden');

            if (type === 'success') {
                setTimeout(() => status.classList.add('hidden'), 3000);
            }
        }

        function copyToClipboard(elementId) {
            const input = document.getElementById(elementId);
            if (input) {
                navigator.clipboard.writeText(input.value).then(() => {
                    // Show brief feedback
                    const originalBg = input.style.background;
                    input.style.background = 'rgba(34, 197, 94, 0.3)';
                    setTimeout(() => input.style.background = originalBg, 500);
                });
            }
        }
    </script>
</body>
</html>
