document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  const game = new GameEngine(canvas);

  // Explicitly connect to your live Render public server
  const SERVER_URL = 'https://infernal-gauntlet-2.onrender.com';
  const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling']
  });
  game.socket = socket;

  const hud = document.getElementById('hud');
  const menuScreen = document.getElementById('menu-screen');
  const lobbyScreen = document.getElementById('lobby-screen');
  const roundScreen = document.getElementById('round-screen');
  const victoryScreen = document.getElementById('victory-screen');
  const touchControls = document.getElementById('touch-controls');
  const btnFullscreen = document.getElementById('btn-fullscreen');

  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const btnToggleReady = document.getElementById('btn-toggle-ready');
  const btnLeaveLobby = document.getElementById('btn-leave-lobby');
  const btnNextLevel = document.getElementById('btn-next-level');
  const btnRematch = document.getElementById('btn-rematch');
  const btnRestartGame = document.getElementById('btn-restart-game');

  const joinRoomInput = document.getElementById('join-room-input');
  const displayRoomCode = document.getElementById('display-room-code');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const levelSlider = document.getElementById('level-slider');
  const levelSliderVal = document.getElementById('level-slider-val');
  const levelLockLabel = document.getElementById('level-lock-label');

  let currentRoomId = null;
  let mySlot = 1;

  // Sound Context Unlock
  window.addEventListener('click', () => window.soundFX && window.soundFX.init(), { once: true });
  window.addEventListener('touchstart', () => window.soundFX && window.soundFX.init(), { once: true });

  // FULLSCREEN HANDLER
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      const docEl = document.documentElement;
      if (!document.fullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        }
        btnFullscreen.innerText = '✕ EXIT';
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        btnFullscreen.innerText = '⛶ FULLSCREEN';
      }
    });
  }

  // 1. Create Room
  btnCreateRoom.addEventListener('click', () => {
    socket.emit('createRoom');
  });

  socket.on('roomCreated', ({ roomId, slot, roomData }) => {
    currentRoomId = roomId;
    mySlot = slot;
    game.mySlot = slot;
    game.roomId = roomId;

    displayRoomCode.innerText = roomId;
    updateLevelSliderUI(roomData.currentLevel, roomData.maxUnlockedLevel);

    showScreen(lobbyScreen);
    updateLobbyUI(roomData);
  });

  // 2. Join Room
  btnJoinRoom.addEventListener('click', () => {
    const code = joinRoomInput.value.trim().toUpperCase();
    if (code.length < 3) return alert('Enter a valid room code.');
    socket.emit('joinRoom', { roomId: code });
  });

  socket.on('joinedRoom', ({ roomId, slot, roomData }) => {
    currentRoomId = roomId;
    mySlot = slot;
    game.mySlot = slot;
    game.roomId = roomId;

    displayRoomCode.innerText = roomId;
    updateLevelSliderUI(roomData.currentLevel, roomData.maxUnlockedLevel);

    showScreen(lobbyScreen);
    updateLobbyUI(roomData);
  });

  socket.on('joinError', ({ message }) => alert(message));
  socket.on('playerJoined', ({ roomData }) => updateLobbyUI(roomData));

  // Copy Code
  btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(displayRoomCode.innerText);
    btnCopyCode.innerText = 'COPIED!';
    setTimeout(() => { btnCopyCode.innerText = 'COPY'; }, 1500);
  });

  // 3. Ready Toggle
  btnToggleReady.addEventListener('click', () => {
    socket.emit('toggleReady', { roomId: currentRoomId });
  });

  socket.on('readyChanged', ({ players }) => {
    for (const id in players) {
      const p = players[id];
      const statusEl = document.getElementById(`lobby-p${p.slot}-status`);
      if (statusEl) {
        statusEl.innerText = p.ready ? 'READY!' : 'WAITING...';
        statusEl.style.color = p.ready ? '#39ff14' : '#8899aa';
      }
    }
  });

  // Level Selection
  levelSlider.addEventListener('input', (e) => {
    socket.emit('selectLevel', { roomId: currentRoomId, level: e.target.value });
  });

  socket.on('levelUpdated', ({ level, maxUnlocked }) => {
    updateLevelSliderUI(level, maxUnlocked);
  });

  function updateLevelSliderUI(level, maxUnlocked) {
    levelSlider.max = maxUnlocked;
    levelSlider.value = level;
    levelSliderVal.innerText = `LEVEL ${level}`;
    levelLockLabel.innerText = `SELECT UNLOCKED LEVEL (1 - ${maxUnlocked}):`;
  }

  // 4. Match Start
  socket.on('matchStart', ({ level, seed, roomData }) => {
    hideAllScreens();
    hud.classList.remove('hidden');

    if (touchControls) {
      touchControls.classList.remove('hidden');
    }

    document.getElementById('p1-score').innerText = roomData.scores[1] || 0;
    document.getElementById('p2-score').innerText = roomData.scores[2] || 0;
    btnRematch.innerText = 'RESTART LEVEL';

    game.loadLevel(level, seed);
    game.start();
  });

  // 5. Multiplayer Realtime Synchronization
  socket.on('opponentSync', ({ slot, state }) => {
    if (slot !== game.mySlot) {
      const opp = game.players[slot];
      opp.x = state.x;
      opp.y = state.y;
      opp.vx = state.vx;
      opp.vy = state.vy;
      opp.hp = state.hp;
      opp.facing = state.facing;
      opp.isDashing = state.isDashing;
      opp.isDead = state.isDead;
    }
  });

  socket.on('opponentAttack', (attackData) => {
    if (attackData.type === 'bullet') {
      game.bullets.push(attackData.bullet);
      if (window.soundFX) window.soundFX.playShoot();
    } else if (attackData.type === 'slash') {
      game.slashEffects.push({
        x: attackData.slashBox.x + attackData.slashBox.w / 2,
        y: attackData.slashBox.y + attackData.slashBox.h / 2,
        facing: attackData.slashBox.x > game.players[attackData.slot].x ? 1 : -1,
        timer: 0.15,
        color: attackData.slot === 1 ? '#ff2a4b' : '#00e5ff'
      });
      if (window.soundFX) window.soundFX.playSlash();
    }
  });

  socket.on('damageApplied', ({ targetSlot, damage }) => {
    const victim = game.players[targetSlot];
    victim.hp = Math.max(0, victim.hp - damage);
    victim.isInvulnerable = true;
    victim.invulnTimer = 0.35;
    if (window.soundFX) window.soundFX.playHit();
  });

  // 6. Round Concluded
  socket.on('roundFinished', ({ winnerSlot, reason, scores, maxUnlockedLevel, nextLevel }) => {
    game.stop();
    hud.classList.add('hidden');

    if (touchControls) {
      touchControls.classList.add('hidden');
    }

    document.getElementById('round-p1-score').innerText = scores[1] || 0;
    document.getElementById('round-p2-score').innerText = scores[2] || 0;

    const winnerName = winnerSlot === 1 ? 'CRIMSON (P1)' : 'COBALT (P2)';
    document.getElementById('round-title').innerText = `${winnerName} VICTORIOUS`;
    document.getElementById('round-desc').innerText = `DEATH REASON: ${reason.replace(/_/g, ' ')}`;
    document.getElementById('btn-next-lvl-num').innerText = nextLevel;

    updateLevelSliderUI(nextLevel, maxUnlockedLevel);
    showScreen(roundScreen);
  });

  // Next Level
  btnNextLevel.addEventListener('click', () => {
    socket.emit('nextLevelReady', { roomId: currentRoomId });
  });

  // Rematch / Restart Level
  btnRematch.addEventListener('click', () => {
    btnRematch.innerText = 'WAITING FOR RIVAL...';
    socket.emit('requestRematch', { roomId: currentRoomId });
  });

  socket.on('rematchVoted', ({ count, total }) => {
    btnRematch.innerText = `RESTART (${count}/${total})`;
  });

  // 7. Campaign 100 Cleared
  socket.on('campaignCompleted', ({ scores }) => {
    game.stop();
    hud.classList.add('hidden');
    if (touchControls) touchControls.classList.add('hidden');
    const winner = scores[1] > scores[2] ? 'PLAYER 1 (CRIMSON)' : 'PLAYER 2 (COBALT)';
    document.getElementById('champion-announcement').innerText = `${winner} HAS ASCENDED AS CHAMPION!`;
    showScreen(victoryScreen);
    if (window.soundFX) window.soundFX.playVictory();
  });

  btnRestartGame.addEventListener('click', () => location.reload());
  btnLeaveLobby.addEventListener('click', () => location.reload());

  function showScreen(screenEl) {
    [menuScreen, lobbyScreen, roundScreen, victoryScreen].forEach(s => s.classList.add('hidden'));
    screenEl.classList.remove('hidden');
  }

  function hideAllScreens() {
    [menuScreen, lobbyScreen, roundScreen, victoryScreen].forEach(s => s.classList.add('hidden'));
  }

  function updateLobbyUI(room) {
    const players = Object.values(room.players);
    const p1 = players.find(p => p.slot === 1);
    const p2 = players.find(p => p.slot === 2);

    const p1Status = document.getElementById('lobby-p1-status');
    const p2Status = document.getElementById('lobby-p2-status');

    p1Status.innerText = p1 ? (p1.ready ? 'READY!' : 'CONNECTED') : 'WAITING...';
    p1Status.style.color = p1 ? (p1.ready ? '#39ff14' : '#ccddee') : '#8899aa';

    p2Status.innerText = p2 ? (p2.ready ? 'READY!' : 'CONNECTED') : 'WAITING...';
    p2Status.style.color = p2 ? (p2.ready ? '#39ff14' : '#ccddee') : '#8899aa';
  }
});