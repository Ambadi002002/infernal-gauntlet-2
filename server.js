const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 1. Create Room
  socket.on('createRoom', () => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      players: {},
      currentLevel: 1,
      maxUnlockedLevel: 1,
      gameState: 'LOBBY',
      levelSeed: Math.floor(Math.random() * 1000000),
      scores: { 1: 0, 2: 0 },
      rematchVotes: new Set(),
      winner: null
    };

    rooms[roomId].players[socket.id] = {
      id: socket.id,
      slot: 1,
      ready: false,
      hp: 100,
      x: 120,
      y: 700,
      vx: 0,
      vy: 0,
      facing: 1,
      isAttacking: false,
      isDashing: false
    };

    socket.join(roomId);
    socket.emit('roomCreated', { roomId, slot: 1, roomData: rooms[roomId] });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  // 2. Join Room
  socket.on('joinRoom', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) {
      return socket.emit('joinError', { message: 'Room not found.' });
    }
    const playerCount = Object.keys(room.players).length;
    if (playerCount >= 2) {
      return socket.emit('joinError', { message: 'Room is full (2/2 players).' });
    }

    const slot = Object.values(room.players).some(p => p.slot === 1) ? 2 : 1;
    room.players[socket.id] = {
      id: socket.id,
      slot: slot,
      ready: false,
      hp: 100,
      x: slot === 1 ? 120 : 1100,
      y: 700,
      vx: 0,
      vy: 0,
      facing: slot === 1 ? 1 : -1,
      isAttacking: false,
      isDashing: false
    };

    socket.join(roomId);
    socket.emit('joinedRoom', { roomId, slot, roomData: room });
    io.to(roomId).emit('playerJoined', { slot, socketId: socket.id, roomData: room });
    console.log(`Socket ${socket.id} joined room ${roomId} as Player ${slot}`);
  });

  // 3. Ready Toggle & Match Start
  socket.on('toggleReady', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    room.players[socket.id].ready = !room.players[socket.id].ready;
    const players = Object.values(room.players);
    const bothReady = players.length === 2 && players.every(p => p.ready);

    io.to(roomId).emit('readyChanged', { players: room.players, bothReady });

    if (bothReady) {
      room.gameState = 'PLAYING';
      room.levelSeed = (room.currentLevel * 73856093) ^ 19349663;
      io.to(roomId).emit('matchStart', {
        level: room.currentLevel,
        seed: room.levelSeed,
        roomData: room
      });
      console.log(`Match started in room ${roomId} at level ${room.currentLevel}`);
    }
  });

  // 4. Select Level (Strictly locked to maxUnlockedLevel)
  socket.on('selectLevel', ({ roomId, level }) => {
    const room = rooms[roomId];
    if (room && room.gameState === 'LOBBY') {
      const targetLevel = parseInt(level) || 1;
      if (targetLevel <= room.maxUnlockedLevel) {
        room.currentLevel = Math.max(1, targetLevel);
      }
      io.to(roomId).emit('levelUpdated', {
        level: room.currentLevel,
        maxUnlocked: room.maxUnlockedLevel
      });
    }
  });

  // 5. Position & Input Synchronization
  socket.on('playerSync', ({ roomId, state }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    const p = room.players[socket.id];
    Object.assign(p, state);

    socket.to(roomId).emit('opponentSync', {
      slot: p.slot,
      state
    });
  });

  // 6. Combat Events
  socket.on('playerAttack', ({ roomId, attackData }) => {
    socket.to(roomId).emit('opponentAttack', attackData);
  });

  socket.on('playerDamaged', ({ roomId, targetSlot, damage, dealerSlot, reason }) => {
    const room = rooms[roomId];
    if (!room) return;
    io.to(roomId).emit('damageApplied', { targetSlot, damage, dealerSlot, reason });
  });

  // 7. Death & Round Finish (Unlocks Next Level)
  socket.on('playerDied', ({ roomId, victimSlot, killerSlot, reason }) => {
    const room = rooms[roomId];
    if (!room || room.gameState !== 'PLAYING') return;

    const survivingSlot = victimSlot === 1 ? 2 : 1;
    room.scores[survivingSlot] = (room.scores[survivingSlot] || 0) + 1;
    room.gameState = 'ROUND_OVER';
    room.winner = survivingSlot;
    room.rematchVotes = new Set();

    if (room.currentLevel === room.maxUnlockedLevel && room.maxUnlockedLevel < 100) {
      room.maxUnlockedLevel += 1;
    }

    io.to(roomId).emit('roundFinished', {
      winnerSlot: survivingSlot,
      victimSlot,
      reason,
      scores: room.scores,
      currentLevel: room.currentLevel,
      maxUnlockedLevel: room.maxUnlockedLevel,
      nextLevel: Math.min(100, room.currentLevel + 1)
    });
  });

  // 8. Altar Objective Claim
  socket.on('objectiveClaimed', ({ roomId, claimerSlot }) => {
    const room = rooms[roomId];
    if (!room || room.gameState !== 'PLAYING') return;

    room.scores[claimerSlot] = (room.scores[claimerSlot] || 0) + 1;
    room.gameState = 'ROUND_OVER';
    room.winner = claimerSlot;
    room.rematchVotes = new Set();

    if (room.currentLevel === room.maxUnlockedLevel && room.maxUnlockedLevel < 100) {
      room.maxUnlockedLevel += 1;
    }

    io.to(roomId).emit('roundFinished', {
      winnerSlot: claimerSlot,
      victimSlot: claimerSlot === 1 ? 2 : 1,
      reason: 'OBJECTIVE_SEALED',
      scores: room.scores,
      currentLevel: room.currentLevel,
      maxUnlockedLevel: room.maxUnlockedLevel,
      nextLevel: Math.min(100, room.currentLevel + 1)
    });
  });

  // 9. Advance to Next Level
  socket.on('nextLevelReady', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.currentLevel >= 100) {
      room.gameState = 'VICTORY';
      io.to(roomId).emit('campaignCompleted', { scores: room.scores });
      return;
    }

    room.currentLevel += 1;
    room.levelSeed = (room.currentLevel * 73856093) ^ 19349663;
    room.gameState = 'PLAYING';
    room.rematchVotes = new Set();

    Object.values(room.players).forEach(p => {
      p.ready = true;
      p.hp = 100;
    });

    io.to(roomId).emit('matchStart', {
      level: room.currentLevel,
      seed: room.levelSeed,
      roomData: room
    });
  });

  // 10. Restart / Rematch Sync
  socket.on('requestRematch', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!room.rematchVotes) room.rematchVotes = new Set();
    room.rematchVotes.add(socket.id);

    const totalInRoom = Object.keys(room.players).length;
    if (room.rematchVotes.size >= totalInRoom) {
      room.rematchVotes.clear();
      room.gameState = 'PLAYING';
      room.levelSeed = (room.currentLevel * 73856093) ^ 19349663;

      Object.values(room.players).forEach(p => {
        p.ready = true;
        p.hp = 100;
      });

      io.to(roomId).emit('matchStart', {
        level: room.currentLevel,
        seed: room.levelSeed,
        roomData: room
      });
    } else {
      io.to(roomId).emit('rematchVoted', { count: room.rematchVotes.size, total: totalInRoom });
    }
  });

  // 11. Disconnect
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        const slot = room.players[socket.id].slot;
        delete room.players[socket.id];
        io.to(roomId).emit('playerLeft', { slot, message: `Player ${slot} disconnected.` });
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId];
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Infernal Duel Server] Running on http://localhost:${PORT}`);
});