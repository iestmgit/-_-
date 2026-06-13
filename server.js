const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));
app.use(express.json());

// دیتابیس درون حافظه (بعداً می‌تونید به MongoDB وصل کنید)
const users = new Map(); // key: socketId یا userId
const activeSockets = new Map(); // socketId -> userId

// ذخیره کاربران
let userDatabase = new Map(); // userId -> {id, name, password, size, wins, coins, isOnline}

function generateId() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

// رتبه‌بندی
function getLeaderboard() {
  const allUsers = Array.from(userDatabase.values());
  allUsers.sort((a, b) => b.size - a.size);
  return allUsers.map((u, index) => ({
    rank: index + 1,
    name: u.name,
    size: u.size,
    wins: u.wins,
    id: u.id
  }));
}

io.on('connection', (socket) => {
  console.log('کاربر جدید وصل شد:', socket.id);
  
  // ارسال رتبه‌بندی به همه
  io.emit('leaderboard', getLeaderboard());
  
  // ثبت نام
  socket.on('register', (data) => {
    const { name, password } = data;
    
    // بررسی تکراری نبودن نام
    let existingUser = Array.from(userDatabase.values()).find(u => u.name === name);
    if (existingUser) {
      socket.emit('register_error', 'این نام قبلاً ثبت شده است!');
      return;
    }
    
    const newId = generateId();
    const newUser = {
      id: newId,
      name: name,
      password: password,
      size: 10,
      wins: 0,
      coins: 30,
      isOnline: true
    };
    
    userDatabase.set(newId, newUser);
    socket.emit('register_success', { id: newId, name: name });
    socket.emit('system_message', `✅ ثبت نام موفق! شناسه شما: ${newId}`);
    
    // آپدیت رتبه‌بندی
    io.emit('leaderboard', getLeaderboard());
  });
  
  // ورود
  socket.on('login', (data) => {
    const { id, password } = data;
    const user = userDatabase.get(id);
    
    if (!user || user.password !== password) {
      socket.emit('login_error', 'شناسه یا رمز عبور اشتباه است!');
      return;
    }
    
    // ذخیره ارتباط سوکت با کاربر
    activeSockets.set(socket.id, id);
    user.isOnline = true;
    
    socket.emit('login_success', {
      id: user.id,
      name: user.name,
      size: user.size,
      wins: user.wins,
      coins: user.coins
    });
    
    socket.broadcast.emit('system_message', `🍌 ${user.name} وارد بازی شد!`);
    io.emit('leaderboard', getLeaderboard());
  });
  
  // خرید آیتم
  socket.on('buy_item', (data) => {
    const { itemType } = data;
    const userId = activeSockets.get(socket.id);
    if (!userId) return;
    
    const user = userDatabase.get(userId);
    if (!user) return;
    
    let cost = 0;
    let gain = 0;
    
    switch(itemType) {
      case 'water':
        cost = 5;
        gain = 2;
        break;
      case 'boost':
        cost = 12;
        gain = 5;
        break;
      default:
        return;
    }
    
    if (user.coins >= cost) {
      user.coins -= cost;
      user.size += gain;
      userDatabase.set(userId, user);
      
      socket.emit('user_update', {
        size: user.size,
        coins: user.coins,
        wins: user.wins
      });
      
      socket.emit('system_message', `🎉 خرید موفق! +${gain} سانت موز`);
      io.emit('leaderboard', getLeaderboard());
    } else {
      socket.emit('system_message', '💰 سکه کافی نیست!');
    }
  });
  
  // خرابکاری
  socket.on('sabotage', (data) => {
    const { targetId } = data;
    const userId = activeSockets.get(socket.id);
    if (!userId) return;
    
    const attacker = userDatabase.get(userId);
    const target = userDatabase.get(targetId);
    
    if (!target) {
      socket.emit('system_message', '❌ کاربر مورد نظر پیدا نشد!');
      return;
    }
    
    if (targetId === userId) {
      socket.emit('system_message', 'نمیتونی به خودت خرابکاری کنی!');
      return;
    }
    
    if (attacker.coins < 15) {
      socket.emit('system_message', '💰 برای خرابکاری ۱۵ سکه نیاز داری!');
      return;
    }
    
    // خرابکاری
    const damage = Math.floor(Math.random() * 6) + 3; // 3 تا 8
    const newTargetSize = Math.max(0, target.size - damage);
    target.size = newTargetSize;
    attacker.coins -= 15;
    attacker.wins += 1;
    
    userDatabase.set(targetId, target);
    userDatabase.set(userId, attacker);
    
    // اطلاع به همه
    io.emit('system_message', `💥 ${attacker.name} به ${target.name} خرابکاری کرد! -${damage} سانت موز`);
    
    // به مهاجم
    socket.emit('user_update', {
      size: attacker.size,
      coins: attacker.coins,
      wins: attacker.wins
    });
    
    // به هدف (اگر آنلاین باشه)
    const targetSocket = Array.from(activeSockets.entries()).find(([_, id]) => id === targetId);
    if (targetSocket) {
      io.to(targetSocket[0]).emit('user_update', {
        size: target.size,
        coins: target.coins,
        wins: target.wins
      });
      io.to(targetSocket[0]).emit('system_message', `😭 ${attacker.name} به شما خرابکاری کرد! -${damage} سانت`);
    }
    
    io.emit('leaderboard', getLeaderboard());
  });
  
  // چت
  socket.on('chat_message', (data) => {
    const { message } = data;
    const userId = activeSockets.get(socket.id);
    if (!userId) return;
    
    const user = userDatabase.get(userId);
    if (!user) return;
    
    io.emit('chat_message_broadcast', {
      sender: user.name,
      message: message,
      time: new Date().toLocaleTimeString('fa-IR')
    });
  });
  
  // قطع ارتباط
  socket.on('disconnect', () => {
    const userId = activeSockets.get(socket.id);
    if (userId) {
      const user = userDatabase.get(userId);
      if (user) {
        user.isOnline = false;
        socket.broadcast.emit('system_message', `${user.name} از بازی خارج شد`);
        io.emit('leaderboard', getLeaderboard());
      }
      activeSockets.delete(socket.id);
    }
    console.log('کاربر قطع شد:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 سرور بازی موز در حال اجرا روی پورت ${PORT}`);
  console.log(`👉 http://localhost:${PORT}`);
});
