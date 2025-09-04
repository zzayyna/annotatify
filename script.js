// S E T U P 

const clientId = 'f2aaaf55912942a185df5d4d7f42e78a';
const redirectUri = 'https://zzayyyna.github.io/annotatify.github.io/';
const scopes = 'playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative';


//////////////////////////////////////////////////////////////////////////////////

// Generate a random code verifier for PKCE
function generateCodeVerifier() {
    const array = new Uint8Array(64);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Generate a code challenge (SHA-256 hash of the verifier)
async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Redirect to Spotify Authorization Page
async function authorizeSpotify() {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    localStorage.setItem('code_verifier', codeVerifier); // Save verifier for token exchange

    const authUrl = `https://accounts.spotify.com/authorize?` +
        `client_id=${clientId}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `code_challenge=${codeChallenge}&` +
        `code_challenge_method=S256`;

    window.location.href = authUrl;
}

// Exchange Code for Access Token
async function getAccessToken(code) {
    const codeVerifier = localStorage.getItem('code_verifier'); // Retrieve saved verifier

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: codeVerifier,
        }),
    });

    if (!response.ok) {
        console.error('Failed to exchange code for token:', await response.text());
        return;
    }

    const data = await response.json();
    console.log('Access Token:', data.access_token);

    localStorage.setItem('access_token', data.access_token); // Store the access token
    localStorage.setItem('refresh_token', data.refresh_token); // Store the refresh token
    localStorage.setItem('token_expiry_time', Date.now() + (data.expires_in * 1000)); // Store expiry time
}


// Check if the token exists and if it's valid
async function getAccessTokenFromStorage() {
    const token = localStorage.getItem('access_token');
    if (token && !isTokenExpired()) {
        return token; // Valid token
    } else {
        console.log('Token expired, attempting to refresh...');
        await refreshToken(); // Attempt to refresh
        return localStorage.getItem('access_token'); // Return new token after refresh
    }
}


// Check if the access token is expired (you can customize expiration logic)
function isTokenExpired() {
    const expiryTime = localStorage.getItem('token_expiry_time');
    return !expiryTime || Date.now() > expiryTime;
}

//get a new token if old is expired
async function refreshToken() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
        console.error('No refresh token available. Please reauthorize.');
        authorizeSpotify(); // Redirect to reauthorize if no refresh token
        return;
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
        }),
    });

    if (!response.ok) {
        console.error('Failed to refresh token:', await response.text());
        authorizeSpotify(); // Redirect to reauthorize if refresh fails
        return;
    }

    const data = await response.json();
    console.log('Token refreshed successfully:', data);

    localStorage.setItem('access_token', data.access_token);
    if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token); // Update refresh token if new one is provided
    }
    localStorage.setItem('token_expiry_time', Date.now() + (data.expires_in * 1000)); // Update expiry time
}


// On Page Load, Handle Redirect from Spotify
window.onload = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        console.log('Code received:', code);
        await getAccessToken(code);
        window.history.replaceState({}, document.title, '/'); // Clean URL after auth
    }

    const token = await getAccessTokenFromStorage();
    if (token) {
        console.log('Using valid access token:', token);
        // enableSearch(); // Enable search after valid token
    } else {
        console.log('No valid token found. Please authorize.');
    }
};

// Start Button Listener
document.getElementById('start').addEventListener('click', () => {
    // Only initiate authorization if no valid token is found
    const token = getAccessTokenFromStorage();
    if (!token) {
        authorizeSpotify();
    } else {
        console.log('Token already exists, no need to reauthorize.');
    }
    document.getElementById('start').style.display = 'none';

    const createP = document.getElementById('create');
    const importP = document.getElementById('import');
    createP.style.display = 'block';
    importP.style.display = 'block';

    createP.addEventListener('click', () => {
        // Hide search options and playlist URL when switching
        document.getElementById('searchOption').style.display = 'none';
        document.getElementById('playlistUrl').style.display = 'none';
        enableSearch();
    })

    importP.addEventListener('click', () => {
        // Hide search options when switching to import
        document.getElementById('searchOption').style.display = 'none';
        importPlaylist();
    })
});

async function fetchWebApi(endpoint, method = 'GET', body = null) {
    const token = await getAccessTokenFromStorage(); // Get the token here
    const res = await fetch(`https://api.spotify.com/${endpoint}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        method,
        body: body ? JSON.stringify(body) : null
    });
    return await res.json();
}

// F U N S T U F F

//CREATE NEW PLAYLIST
//search for a track
function enableSearch() {
    const searchOption = document.getElementById('searchOption');
    searchOption.style.display = 'block';

    search.addEventListener('click', async () => {
        const query = document.getElementById('query').value;  // Get the search query from the input field
        if (query) {
            const accessToken = await getAccessTokenFromStorage(); // Retrieve the token properly
            searchTrack(accessToken, query);
        } else {
            alert('Please enter a search term!');
        }
    });
}

function searchTrack(accessToken, query) {
    fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&market=US&limit=10`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    })
        .then(response => response.json())
        .then(data => {
            const tracks = data.tracks.items;
            const displayElement = document.getElementById('displayTracks');
            displayElement.innerHTML = ''; // Clear any existing content

            // Loop through the tracks and display them
            tracks.forEach(track => {
                const trackElement = document.createElement('div');
                trackElement.textContent = `${track.name} - ${track.artists.map(artist => artist.name).join(', ')}`;
                trackElement.classList.add('track_item');
                displayElement.appendChild(trackElement);

                trackElement.addEventListener('click', () => {
                    addToPlaylist(track); // Add to playlist when clicked
                    trackElement.style.backgroundColor = "#ddd"; // Highlight the selected track
                });
            });
        })
        .catch(error => {
            console.error('Error displaying tracks:', error);
        });
}

const tracksUri = [];
const tracks = [];

function addToPlaylist(track) {
    const playlistElement = document.getElementById('tempPlaylist');
    const trackElement = document.createElement('div');
    trackElement.textContent = `${track.name} by ${track.artists.map(artist => artist.name).join(', ')}`;

    // Add the track to a displayed playlist
    playlistElement.appendChild(trackElement);
    tracksUri.push(track.uri);
    tracks.push(track);
    console.log(track.uri);
}

const exportButton = document.getElementById('exportP');
exportP.addEventListener('click', () => {
    createNewPlaylist(tracksUri);
});

async function createNewPlaylist(tracksUri) {
    console.log("creating playlist...");
    const { id: user_id } = await fetchWebApi('v1/me', 'GET');

    const playlist = await fetchWebApi(
        `v1/users/${user_id}/playlists`, 'POST', {
        "name": "new playlist woahhhhh",
        "description": "im losing my mind",
        "public": true
    }
    );

    await fetchWebApi(
        `v1/playlists/${playlist.id}/tracks?uris=${tracksUri.join(',')}`,
        'POST'
    );

    console.log("playlist created woohoo!");
    searchOption.style.display = "none";

    // Save the playlist to localStorage
    let playlists = JSON.parse(localStorage.getItem('playlists')) || [];
    playlists.push(playlist);
    localStorage.setItem('playlists', JSON.stringify(playlists));

    // Redirect after saving the playlist
    window.location.href = `playlists.html?playlistId=${playlist.id}`;

    return playlist;
}

// import playlist

// Function to extract playlist ID from URL
function extractPlaylistId(input) {
    input = input.trim();

    // If it's already just an ID (22 characters, alphanumeric)
    if (/^[a-zA-Z0-9]{22}$/.test(input)) {
        return input;
    }

    // Extract from Spotify URL
    const match = input.match(/spotify\.com\/playlist\/([a-zA-Z0-9]{22})/);
    return match ? match[1] : null;
}

// import playlist
function importPlaylist() {
    const findUrl = document.getElementById('playlistUrl');
    findUrl.style.display = 'block';

    // Set placeholder text when the input becomes visible
    const urlInput = document.querySelector('#playlistUrl input[type="text"]');
    urlInput.placeholder = "Enter playlist URL";

    const goButton = document.getElementById('playlistGo');
    goButton.addEventListener('click', async () => {
        const go = urlInput.value;  // Get the playlist URL from the input field

        if (go) {
            const accessToken = await getAccessTokenFromStorage(); // Retrieve the token properly
            const id = extractPlaylistId(go); // Extract the playlist ID from URL

            if (id) {
                searchPlaylist(accessToken, id);
            } else {
                alert('Invalid playlist URL!');
            }
        } else {
            alert('Please enter a playlist url!');
        }
    });
}

function searchPlaylist(accessToken, playlistId) {
    fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    })
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    alert('Playlist not found!');
                } else if (response.status === 403) {
                    alert('Playlist is private!');
                } else {
                    alert('Error accessing playlist!');
                }
                throw new Error('Playlist not accessible');
            }
            return response.json();
        })
        .then(playlist => {
            console.log('Playlist found:', playlist.name);

            // Save playlist to localStorage (like you do in createNewPlaylist)
            let playlists = JSON.parse(localStorage.getItem('playlists')) || [];
            playlists.push(playlist);
            localStorage.setItem('playlists', JSON.stringify(playlists));

            // Hide the URL input
            document.getElementById('playlistUrl').style.display = 'none';

            // Redirect to playlists.html with the playlist ID
            window.location.href = `playlists.html?playlistId=${playlistId}`;
        })
        .catch(error => {
            console.error('Error importing playlist:', error);
        });
}



async function displayPlaylist(playlistId) {
    // Get playlist info first
    const playlistInfo = await fetchWebApi(`v1/playlists/${playlistId}`);
    const playlistData = await fetchWebApi(`v1/playlists/${playlistId}/tracks`);
    const tracks = playlistData.items;

    const playlistContainer = document.getElementById('playlist');
    playlistContainer.innerHTML = ''; // Clear any existing content

    // Add playlist title and description at the top
    const playlistHeader = document.createElement('div');
    playlistHeader.innerHTML = `
        <div class="playlist-header">
            <img src="${playlistInfo.images && playlistInfo.images.length > 0 ? playlistInfo.images[0].url : ''}" alt="Playlist cover">
            <div class="txt">
            <h2>${playlistInfo.name}</h2>
            <p>${playlistInfo.description || 'No description'}</p> </div>
        </div>
    `;
    playlistContainer.appendChild(playlistHeader);

    tracks.forEach(track => {
        const imageUrl = track.track.album?.images[0]?.url || 'placeholder.jpg';
        const div = document.createElement('div');
        const textareaId = `song-${track.track.id}`;

        div.innerHTML = `
            <center><div class="stuff">
                <img src="${imageUrl}" alt="${track.track.name}" style="width: 50px; height: 50px;">
                <div id="text">
                    <p class="title">${track.track.name}</p><br><br><br>
                    <p class="artist">${track.track.artists.map(artist => artist.name).join(', ')}</p>
                </div>
                <div id="annotation">
                    <button class="toggleInputBtn">☆</button>
                    <textarea class="songInput" id="${textareaId}" style="display:none"></textarea>
                </div>
            </div></center>
        `;
        playlistContainer.appendChild(div);

        // Load saved text from localStorage
        const savedText = localStorage.getItem(textareaId);
        if (savedText) {
            document.getElementById(textareaId).value = savedText;
        }

        // Save input to localStorage on input
        document.querySelector(`#${textareaId}`).addEventListener('input', (e) => {
            localStorage.setItem(textareaId, e.target.value);
        });
    });

    // Use jQuery to handle the button click and toggle the textarea visibility
    $('.toggleInputBtn').on('click', function () {
        $(this).next('textarea').toggle(); // Toggle the textarea visibility
    });

    const playlistSpace = document.getElementById('player');
    playlistSpace.innerHTML = ` 
        <iframe
        title="Spotify Embed: Recommendation Playlist"
        src="https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0"
        width="100%"
        height="100%"
        frameborder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
    ></iframe>
    `;
}










