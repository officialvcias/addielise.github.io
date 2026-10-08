import {
    acceptInvite, getUser, handleAuthCallback, login, logout, onAuthChange,
    requestPasswordRecovery, updateUser,
} from '@netlify/identity';

const element = id => document.getElementById(id);
let isAdmin = false;
let authMode = 'login';
let inviteToken;
let currentVideoIds = null;
let loadingEpisodes = null;
let savingEpisodes = false;
let previousFocus;

function message(id, text, error = false) {
    element(id).textContent = text;
    element(id).classList.toggle('error', error);
}

function savedEpisodes() {
    try {
        const saved = JSON.parse(localStorage.getItem('podcasts') || '[]');
        return Array.isArray(saved) ? [...new Set(saved.filter(videoId =>
            typeof videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(videoId)))] : [];
    } catch {
        return [];
    }
}

function updateImportButton() {
    element('import-button').hidden = !isAdmin || !savedEpisodes().length;
}

function updateAuth(user) {
    isAdmin = Boolean(user?.invitedAt && user?.confirmedAt && user?.roles?.includes('admin'));
    document.body.classList.toggle('logged-in', isAdmin);
    updateImportButton();
}

function openModal(mode = 'login') {
    previousFocus = document.activeElement;
    authMode = mode;
    const setPassword = mode !== 'login';
    element('auth-title').textContent = mode === 'invite' ? 'Accept Admin Invitation' :
        mode === 'recovery' ? 'Reset Password' : 'Admin Access';
    element('auth-description').textContent = setPassword ? 'Choose a password with at least 10 characters.' :
        'Sign in with your invited administrator account.';
    element('email').hidden = setPassword;
    element('email').required = !setPassword;
    document.querySelector('label[for="email"]').hidden = setPassword;
    element('password').value = '';
    element('password').minLength = setPassword ? 10 : 1;
    element('password').autocomplete = setPassword ? 'new-password' : 'current-password';
    element('forgot-password').hidden = setPassword;
    element('login-button').textContent = setPassword ? 'Save password' : 'Sign in';
    message('error', '');
    element('loginModal').style.display = 'flex';
    element(setPassword ? 'password' : 'email').focus();
}

function closeModal() {
    element('loginModal').style.display = 'none';
    element('password').value = '';
    previousFocus?.focus();
}

async function api(method = 'GET', body) {
    const response = await fetch('/api/episodes', {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) updateAuth(null);
        throw new Error(data?.error || 'Episodes could not be loaded. Please try again.');
    }
    if (!data) throw new Error('Episodes could not be loaded. Please try again.');
    return data;
}

function renderVideos(videoIds) {
    if (JSON.stringify(videoIds) === JSON.stringify(currentVideoIds)) return;
    currentVideoIds = videoIds;
    const list = element('video-list');
    list.replaceChildren();
    if (!videoIds.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No episodes added yet.';
        list.appendChild(empty);
        return;
    }
    for (const videoId of videoIds) {
        const card = document.createElement('div');
        card.className = 'video-item';
        const frame = document.createElement('iframe');
        frame.src = `https://www.youtube.com/embed/${videoId}`;
        frame.title = `Podcast episode ${videoId}`;
        frame.allowFullscreen = true;
        frame.loading = 'lazy';
        const remove = document.createElement('button');
        remove.className = 'remove-btn';
        remove.textContent = 'Remove Episode';
        remove.addEventListener('click', () => {
            if (isAdmin && confirm('Remove this episode for everyone?')) {
                mutate('DELETE', { videoId }, remove, 'Episode removed from the shared library.');
            }
        });
        card.append(frame, remove);
        list.appendChild(card);
    }
}

async function loadVideos(announce = false) {
    if (loadingEpisodes) return loadingEpisodes;
    if (announce) message('episode-status', 'Loading episodes…');
    loadingEpisodes = (async () => {
        try {
            const data = await api();
            if (!Array.isArray(data.videoIds) || !data.videoIds.every(videoId =>
                typeof videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(videoId))) {
                throw new Error('Episodes could not be loaded. Please try again.');
            }
            renderVideos(data.videoIds);
            element('retry-button').hidden = true;
            if (announce || element('episode-status').classList.contains('error')) message('episode-status', '');
            return true;
        } catch (error) {
            message('episode-status', error.message || 'Connection interrupted. Please try again.', true);
            element('retry-button').hidden = false;
            return false;
        } finally {
            loadingEpisodes = null;
        }
    })();
    return loadingEpisodes;
}

async function mutate(method, body, button, success) {
    if (!isAdmin || savingEpisodes) return false;
    savingEpisodes = true;
    button.disabled = true;
    message('episode-status', 'Saving changes…');
    try {
        await api(method, body);
        if (loadingEpisodes) await loadingEpisodes;
        const refreshed = await loadVideos();
        if (refreshed) message('episode-status', success);
        return true;
    } catch (error) {
        message('episode-status', error.message || 'Changes could not be saved. Please try again.', true);
        return false;
    } finally {
        savingEpisodes = false;
        button.disabled = false;
    }
}

function getVideoId(value) {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        const hostname = url.hostname.toLowerCase();
        let videoId;
        if (hostname === 'youtu.be') videoId = url.pathname.split('/')[1];
        else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(hostname)) {
            const segments = url.pathname.split('/');
            videoId = url.pathname === '/watch' ? url.searchParams.get('v') :
                ['embed', 'shorts', 'live', 'v'].includes(segments[1]) ? segments[2] : null;
        }
        return typeof videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
    } catch {
        return null;
    }
}

element('admin-button').addEventListener('click', () => {
    if (isAdmin) element('youtube-url').focus();
    else openModal(inviteToken ? 'invite' : 'login');
});
element('close-modal').addEventListener('click', closeModal);
element('loginModal').addEventListener('click', event => {
    if (event.target === element('loginModal')) closeModal();
});
element('loginModal').addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
    if (event.key !== 'Tab') return;
    const focusable = [...element('loginModal').querySelectorAll('button, input')]
        .filter(control => !control.hidden && !control.disabled);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

element('auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = element('login-button');
    if (button.disabled) return;
    button.disabled = true;
    message('error', 'Signing in…');
    let passwordSaved = false;
    try {
        let user;
        const password = element('password').value;
        if (authMode === 'invite') {
            if (!inviteToken) {
                openModal('login');
                throw new Error('The invitation link is missing. Open the full link from your invitation email, or sign in if you already saved your password.');
            }
            user = await acceptInvite(inviteToken, password);
            inviteToken = undefined;
            passwordSaved = true;
            openModal('login');
            element('email').value = user.email;
            user = await login(user.email, password);
        } else if (authMode === 'recovery') {
            user = await updateUser({ password });
            passwordSaved = true;
            openModal('login');
            element('email').value = user.email;
        } else user = await login(element('email').value.trim(), password);
        updateAuth(user);
        if (!isAdmin) {
            await logout();
            openModal('login');
            throw new Error(passwordSaved ?
                'Your password was saved, but your account does not have administrator access. Ask the site owner to add the admin role, then sign in.' :
                'Your account needs an invitation and the admin role. Contact the site owner.');
        }
        closeModal();
        message('episode-status', 'Signed in. Episode changes are shared across all devices.');
    } catch (error) {
        message('error', passwordSaved && authMode === 'login' && error.status === 401 ?
            'Your password was saved. Sign in with your email and new password.' :
            error.status === 401 ? 'Invalid email or password.' :
            error.message || 'Sign in failed. Please try again.', true);
    } finally {
        button.disabled = false;
        element('password').value = '';
    }
});

element('forgot-password').addEventListener('click', async () => {
    if (!element('email').reportValidity()) return;
    const button = element('forgot-password');
    button.disabled = true;
    try {
        await requestPasswordRecovery(element('email').value.trim());
        message('error', 'If an account exists, a password reset link has been sent. Check your email.');
    } catch {
        message('error', 'The reset email could not be requested. Please try again.', true);
    } finally {
        button.disabled = false;
    }
});

element('logout-button').addEventListener('click', async () => {
    try {
        await logout();
        message('episode-status', 'Signed out.');
    } catch {
        message('episode-status', 'Sign out could not be completed. Please try again.', true);
    } finally {
        updateAuth(null);
    }
});

element('episode-form').addEventListener('submit', async event => {
    event.preventDefault();
    const videoId = getVideoId(element('youtube-url').value.trim());
    if (!videoId) return message('episode-status', 'Please enter a valid YouTube episode link.', true);
    if (await mutate('POST', { videoIds: [videoId] }, element('add-button'), 'Episode published for everyone.')) {
        element('youtube-url').value = '';
    }
});

element('import-button').addEventListener('click', async () => {
    const videoIds = savedEpisodes();
    if (!videoIds.length || !confirm(`Publish ${videoIds.length} episodes saved on this device for everyone?`)) return;
    if (videoIds.length > 500) return message('episode-status', 'Import supports up to 500 episodes at a time.', true);
    if (await mutate('POST', { videoIds }, element('import-button'), 'Saved episodes published for everyone.')) {
        try {
            localStorage.removeItem('podcasts');
        } catch {
            message('episode-status', 'Episodes published. Local storage could not be cleared; importing again is safe.');
        }
        updateImportButton();
    }
});

element('retry-button').addEventListener('click', () => loadVideos(true));
onAuthChange((_event, user) => updateAuth(user));
setInterval(() => { if (!document.hidden) loadVideos(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadVideos(); });
window.addEventListener('focus', () => loadVideos());

async function initializeAuth() {
    try {
        const callback = await handleAuthCallback();
        updateAuth(await getUser());
        if (callback?.type === 'invite') {
            inviteToken = callback.token;
            openModal('invite');
        } else if (callback?.type === 'recovery') openModal('recovery');
    } catch {
        message('episode-status', 'The sign-in link could not be processed. Request a new invitation or reset link.', true);
    }
}

loadVideos(true);
initializeAuth();
