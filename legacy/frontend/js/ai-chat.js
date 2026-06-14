/* ─── AI Chat Widget ─────────────────────────────────────────────────── */

let _aiOpen = false;
let _aiMessages = [];
let _aiSessionToken = null;
let _aiLoading = false;

function initAiChat() {
  const el = document.getElementById('ai-widget');
  const dismissed = localStorage.getItem('ai_chat_dismissed');
  const showBadge = !dismissed;

  el.innerHTML = `
    <button class="ai-fab gradient-primary" id="ai-fab" onclick="openAiChat()">
      <span class="ping gradient-primary"></span>
      ${icons.sparkles} <span>Ask AI</span>
      ${showBadge ? '<span class="try-badge">Try me!</span>' : ''}
    </button>
    <div class="ai-panel" id="ai-panel">
      <div class="panel-header">
        <div class="flex items-center gap-2">
          <div class="gradient-primary" style="width:2rem;height:2rem;border-radius:0.5rem;display:flex;align-items:center;justify-content:center;color:white">${icons.sparkles}</div>
          <div>
            <div class="text-sm font-semibold">AI Assistant</div>
            <div class="text-xs text-muted">Find local businesses instantly</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-icon-sm" onclick="closeAiChat()">${icons.x}</button>
      </div>
      <div class="messages scrollbar-hide" id="ai-messages"></div>
      <div class="panel-input">
        <form class="flex gap-2" id="ai-form">
          <input class="input" placeholder="Ask about local businesses..." id="ai-input" style="flex:1;height:2.25rem;font-size:0.875rem" />
          <button type="submit" class="btn btn-gradient btn-icon" style="width:2.25rem;height:2.25rem">${icons.send}</button>
        </form>
      </div>
    </div>`;

  document.getElementById('ai-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendAiMessage();
  });

  // Auto-open on first visit
  if (!dismissed) {
    setTimeout(() => {
      if (!_aiOpen) {
        openAiChat();
        _aiMessages = [{ role: 'assistant', content: "Hey! 👋 I'm your AI assistant — I can help you find great local businesses nearby. Try asking me something like \"best coffee near me\" or \"affordable dinner spots\"!" }];
        renderAiMessages();
      }
    }, 2000);
  }

  renderAiMessages();
}

function openAiChat() {
  _aiOpen = true;
  document.getElementById('ai-fab').style.display = 'none';
  document.getElementById('ai-panel').classList.add('open');
  localStorage.setItem('ai_chat_dismissed', 'true');
  renderAiMessages();
}

function closeAiChat() {
  _aiOpen = false;
  document.getElementById('ai-panel').classList.remove('open');
  document.getElementById('ai-fab').style.display = 'flex';
  // Remove try-me badge
  const badge = document.querySelector('.try-badge');
  if (badge) badge.remove();
}

function renderAiMessages() {
  const el = document.getElementById('ai-messages');
  if (!el) return;

  if (_aiMessages.length === 0) {
    el.innerHTML = `
      <div class="text-center" style="padding:2.5rem 0">
        <div class="gradient-primary" style="width:3rem;height:3rem;border-radius:1rem;display:flex;align-items:center;justify-content:center;margin:0 auto 0.75rem;opacity:0.4;color:white">${icons.messageCircle}</div>
        <p class="text-sm font-medium" style="margin-bottom:0.25rem">How can I help?</p>
        <p class="text-xs text-muted" style="margin-bottom:1rem">Ask about restaurants, shops, or services nearby.</p>
        <div class="flex justify-center gap-1-5 flex-wrap">
          ${['Best coffee', 'Cheap eats', 'Open now'].map(q => `
            <button class="chip" style="font-size:0.75rem;padding:0.25rem 0.75rem" onclick="document.getElementById('ai-input').value='${q}'">${q}</button>
          `).join('')}
        </div>
      </div>`;
    return;
  }

  el.innerHTML = _aiMessages.map(msg => {
    if (msg.role === 'user') {
      return `<div class="msg-row user">
        <div class="msg-bubble user gradient-primary">${escapeHtml(msg.content)}</div>
        <div class="msg-avatar" style="background:hsla(0,0%,100%,0.1);border:1px solid hsla(0,0%,100%,0.15)">${icons.user}</div>
      </div>`;
    }
    let suggestionsHtml = '';
    if (msg.suggestions && msg.suggestions.length > 0) {
      suggestionsHtml = '<div style="margin-top:0.5rem;display:flex;flex-direction:column;gap:0.25rem">' +
        msg.suggestions.map(s => `
          <button class="suggestion-card" onclick="navigate('business/${s.id}')">
            <div class="flex items-center justify-between gap-1">
              <span class="font-medium text-xs truncate">${s.name}</span>
              ${s.local_badge ? `<span class="badge badge-green" style="font-size:0.55rem;padding:0 0.25rem">${s.local_badge === 'verified_local' ? '✓' : '~'}</span>` : ''}
            </div>
            <div class="flex items-center gap-1-5 text-xs text-muted" style="margin-top:0.125rem">
              <span class="flex items-center gap-1">${renderStars(parseFloat(s.rating), 10)} ${s.rating}</span>
              <span>${s.distance_km}km</span>
              ${s.is_open_now != null ? `<span style="color:${s.is_open_now ? 'var(--green)' : 'var(--red)'}">${s.is_open_now ? 'Open' : 'Closed'}</span>` : ''}
            </div>
          </button>
        `).join('') + '</div>';
    }
    return `<div class="msg-row">
      <div class="msg-avatar gradient-primary" style="color:white">${icons.bot}</div>
      <div class="msg-bubble assistant"><span class="whitespace-pre-wrap leading-relaxed">${escapeHtml(msg.content)}</span>${suggestionsHtml}</div>
    </div>`;
  }).join('');

  if (_aiLoading) {
    el.innerHTML += `<div class="msg-row">
      <div class="msg-avatar gradient-primary" style="color:white">${icons.bot}</div>
      <div class="msg-bubble assistant"><div class="typing-dots"><span></span><span></span><span></span></div></div>
    </div>`;
  }

  el.scrollTop = el.scrollHeight;
}

async function sendAiMessage() {
  const input = document.getElementById('ai-input');
  const msg = input.value.trim();
  if (!msg || _aiLoading) return;

  if (!authIsAuthenticated()) {
    _aiMessages = [{ role: 'assistant', content: 'Please log in to use the AI assistant.' }];
    renderAiMessages();
    return;
  }

  input.value = '';
  _aiMessages.push({ role: 'user', content: msg });
  _aiLoading = true;
  renderAiMessages();

  try {
    const loc = locationGet();
    const data = await aiApi.chat(msg, loc?.latitude, loc?.longitude, _aiSessionToken);
    _aiSessionToken = data.sessionToken;
    _aiMessages.push({ role: 'assistant', content: data.response, suggestions: data.suggestions });
  } catch (e) {
    _aiMessages.push({ role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' });
  } finally {
    _aiLoading = false;
    renderAiMessages();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
