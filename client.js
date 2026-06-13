const socket = io();

let currentUser = null;

// تب‌ها
function showTab(tab) {
    if (tab === 'register') {
        document.getElementById('registerTab').classList.remove('hidden');
        document.getElementById('loginTab').classList.add('hidden');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.remove('active');
    } else {
        document.getElementById('registerTab').classList.add('hidden');
        document.getElementById('loginTab').classList.remove('hidden');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.remove('active');
    }
}

// ثبت نام
function register() {
    const name = document.getElementById('regName').value.trim();
    const pass = document.getElementById('regPass').value;
    const repeat = document.getElementById('regPassRepeat').value;
    
    if (!name || pass.length < 4) {
        alert('نام معتبر و رمز حداقل ۴ کاراکتر وارد کنید!');
        return;
    }
    
    if (pass !== repeat) {
        alert('رمز و تکرار آن مطابقت ندارند!');
        return;
    }
    
    socket.emit('register', { name, password: pass });
}

// ورود
function login() {
    const id = document.getElementById('loginId').value.trim();
    const pass = document.getElementById('loginPass').value;
    
    if (!id || !pass) {
        alert('شناسه و رمز را وارد کنید!');
        return;
    }
    
    socket.emit('login', { id, password: pass });
}

// خرید آیتم
function buyItem(item) {
    if (!currentUser) return;
    socket.emit('buy_item', { itemType: item });
}

// خرابکاری
function sabotage() {
    if (!currentUser) return;
    const targetId = document.getElementById('targetId').value.trim();
    if (!targetId) {
        showNotification('شناسه قربانی را وارد کنید!');
        return;
    }
    socket.emit('sabotage', { targetId });
    document.getElementById('targetId').value = '';
}

// چت
function sendChat() {
    if (!currentUser) return;
    const message = document.getElementById('chatInput').value.trim();
    if (!message) return;
    
    socket.emit('chat_message', { message });
    document.getElementById('chatInput').value = '';
}

// خروج
function logout() {
    currentUser = null;
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('gameScreen').classList.add('hidden');
}

// نمایش اعلان
function showNotification(msg, isError = false) {
    const notifArea = document.getElementById('notificationArea');
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.style.background = isError ? 'rgba(220,53,69,0.9)' : 'rgba(0,0,0,0.8)';
    notif.textContent = msg;
    notifArea.appendChild(notif);
    
    setTimeout(() => {
        notif.remove();
    }, 3000);
}

// نمایش پیام چت
function addChatMessage(sender, message, isSystem = false) {
    const chatDiv = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    
    if (isSystem) {
        msgDiv.innerHTML = `<span style="color: #ffd700;">[سیستم]</span> ${message}`;
    } else {
        msgDiv.innerHTML = `<span class="chat-sender">${sender}:</span> ${message}`;
    }
    
    chatDiv.appendChild(msgDiv);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

// آپدیت رتبه‌بندی
function updateLeaderboard(players) {
    const listDiv = document.getElementById('leaderboardList');
    listDiv.innerHTML = '';
    
    players.forEach(player => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        const isCurrent = currentUser && player.id === currentUser.id;
        item.style.background = isCurrent ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,255,0.1)';
        item.innerHTML = `
            <span>#${player.rank} ${player.name} ${isCurrent ? '(شما)' : ''}</span>
            <span>🍌 ${player.size} سانت | ⚔️ ${player.wins} برد</span>
        `;
        listDiv.appendChild(item);
    });
}

// Socket Events
socket.on('register_success', (data) => {
    showNotification(`✅ ثبت نام موفق! شناسه شما: ${data.id}`);
    document.getElementById('loginId').value = data.id;
    showTab('login');
});

socket.on('register_error', (msg) => {
    alert(msg);
});

socket.on('login_success', (data) => {
    currentUser = data;
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    
    document.getElementById('userName').textContent = data.name;
    document.getElementById('userId').textContent = data.id;
    document.getElementById('mySize').textContent = data.size;
    document.getElementById('myCoins').textContent = data.coins;
    document.getElementById('myWins').textContent = data.wins;
    
    showNotification(`🍌 به بازی خوش آمدی ${data.name}!`);
});

socket.on('login_error', (msg) => {
    alert(msg);
});

socket.on('user_update', (data) => {
    if (currentUser) {
        currentUser.size = data.size;
        currentUser.coins = data.coins;
        currentUser.wins = data.wins;
        
        document.getElementById('mySize').textContent = data.size;
        document.getElementById('myCoins').textContent = data.coins;
        document.getElementById('myWins').textContent = data.wins;
    }
});

socket.on('system_message', (msg) => {
    showNotification(msg);
    addChatMessage('سیستم', msg, true);
});

socket.on('chat_message_broadcast', (data) => {
    addChatMessage(data.sender, data.message);
});

socket.on('leaderboard', (players) => {
    updateLeaderboard(players);
});

// Enter key for chat
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChat();
        });
    }
});
