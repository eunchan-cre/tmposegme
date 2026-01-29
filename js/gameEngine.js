/**
 * gameEngine.js
 * Sky Fruit Catcher Game Logic
 */

class GameEngine {
  constructor(rootElement) {
    this.root = rootElement || document; // Scope

    this.score = 0;
    this.level = 1;
    this.timeLimit = 60;
    this.isGameActive = false;
    this.gameTimer = null;
    this.gameLoopId = null;

    // Game State
    this.playerPos = 1; // 0: Left, 1: Center, 2: Right
    this.items = []; // Array of { id, type, lane, y, speed, element }
    this.itemIdCounter = 0;

    // Settings
    this.lanes = [0, 1, 2];
    this.laneWidth = 200;
    this.spawnRate = 1500; // ms
    this.lastSpawnTime = 0;
    this.baseSpeed = 3; // pixels per frame

    // Callback placeholders
    this.onScoreChange = null;
    this.onGameEnd = null;

    // UI Elements (Scoped)
    // We expect the root to contain these classes/IDs.
    // Adapting for both Single (ID based in HTML) and PVP (Class based?)
    // Strategy: Try querySelector argument, fallback to ID.

    this.container = this.root.querySelector('.game-board') || this.root.getElementById('game-container');
    this.playerElement = this.root.querySelector('.player') || this.root.getElementById('player');
    this.feedbackElement = this.root.querySelector('.feedback-overlay') || this.root.getElementById('feedback-overlay');
    this.scoreElement = this.root.querySelector('.score-value') || this.root.getElementById('score');
    this.timeElement = this.root.querySelector('.time-value') || this.root.getElementById('time');
    this.livesContainer = this.root.querySelector('.lives-container') || this.root.getElementById('lives-container');

    // Dev State (Persistent across restarts)
    this.devGunMode = false;
    this.isInputEnabled = true; // For AI or Disabled Player
  }

  start(config = {}) {
    if (this.isGameActive) return;

    this.isGameActive = true;
    this.isInputEnabled = config.isInputEnabled ?? true; // Default true
    this.level = config.startLevel || 1;
    this.score = (this.level - 1) * 1000;
    this.timeLimit = 60;
    this.playerPos = 1;
    this.missedCount = 0;
    this.spawningPaused = false;
    this.bombsSpawnedInLevel = 0;

    // Adjust Speed/Rate based on start level
    const levelCap = Math.min(this.level, 9);
    this.baseSpeed = 3 + (levelCap - 1);
    this.spawnRate = 1500 - ((levelCap - 1) * 100);

    // Boss State
    this.isBossActive = false;
    this.bossHP = 15;
    this.bossMaxHP = 15;
    this.bossEntity = null;

    // Reward Logic
    this.maxMisses = 2; // Default
    this.gunActive = false;
    this.hasGun = false;
    this.gunTimer = null;

    if (config.reward === 'life') {
      this.maxMisses = 3;
      this.showFeedback("Bonus Life Active! ❤️");
    } else if (config.reward === 'gun') {
      this.hasGun = true;
      this.showFeedback("Gun Ready! Press 'W' 🔫", true);
    } else {
      // this.showFeedback(`Level ${this.level} Start!`);
    }

    // Boss Check Immediate
    if (this.level >= 15) {
      setTimeout(() => this.startBossFight(), 100);
    }

    // Input Handling (Only ONE global listener should exist or scoped?)
    // Issue: window.keydown is global. 
    // If we have 2 engines, both receive 'A'. P2 (AI) should ignore keys.
    // Solution: Check `this.isInputEnabled`.

    // Remove old listener if any to prevent duplicates?
    if (this.handleInput) window.removeEventListener('keydown', this.handleInput);

    this.handleInput = (e) => {
      if (!this.isGameActive || !this.isInputEnabled) return;

      const canUseGun = (this.hasGun || this.devGunMode) && !this.gunActive;

      if ((e.key === 'w' || e.key === 'W' || e.key === 'ㅈ') && canUseGun) {
        this.activateGun();
        if (!this.devGunMode) {
          this.hasGun = false;
        }
      }

      const key = e.key.toLowerCase();
      let targetPos = this.playerPos;

      if (key === 'a' || key === 'ㅁ') targetPos = 0;
      else if (key === 's' || key === 'ㄴ') targetPos = 1;
      else if (key === 'd' || key === 'ㅇ') targetPos = 2;

      if (targetPos !== this.playerPos) {
        this.playerPos = targetPos;
        this.updatePlayerPosition();
      }
    };
    window.addEventListener('keydown', this.handleInput);

    // Clear existing items from DOM locally
    const existingItems = this.container.querySelectorAll('.item');
    existingItems.forEach(el => el.remove());

    // Clear Boss Elements if any
    const existingBoss = this.container.querySelector('.boss-container');
    if (existingBoss) existingBoss.remove();

    // Update Initial UI
    this.updatePlayerPosition();
    this.updateScoreUI();
    this.updateTimeUI();
    this.updateLivesUI();

    // Start Timer
    this.startTimer();

    // Start Game Loop
    this.lastSpawnTime = Date.now();
    this.loop();
  }

  stop(reason = "Time's Up!", isVictory = false) {
    if (!this.isGameActive) return;

    this.isGameActive = false;
    clearInterval(this.gameTimer);
    cancelAnimationFrame(this.gameLoopId);

    // Cleanup Input
    if (this.handleInput) {
      window.removeEventListener('keydown', this.handleInput);
      this.handleInput = null;
    }

    this.showFeedback(reason, true);

    if (isVictory) {
      this.feedbackElement.style.color = "#4CAF50";
      this.feedbackElement.style.fontSize = "40px";
    }

    if (this.onGameEnd) {
      this.onGameEnd(this.score, this.level, isVictory, this); // Pass self to identify who ended
    }
  }

  startTimer() {
    this.gameTimer = setInterval(() => {
      if (!this.isBossActive) {
        this.timeLimit--;
        this.timeLimit = Math.max(0, this.timeLimit);
        this.updateTimeUI();
      }

      if (!this.isBossActive) {
        if (this.timeLimit === 30) {
          // this.triggerLevelTransition(1000, 4, "Warning: Speed Up!");
        } else if (this.timeLimit === 10) {
          // this.triggerLevelTransition(500, 6, "Warning: Fever Time!");
        }

        if (this.timeLimit <= 0) {
          this.stop("Time Over!");
        }
      }
    }, 1000);
  }

  triggerLevelTransition(newRate, newSpeed, message) {
    this.spawningPaused = true;
    this.showFeedback(message, true);

    setTimeout(() => {
      this.spawningPaused = false;
      this.spawnRate = newRate;
      this.baseSpeed = newSpeed;
      this.showFeedback("GO!!", false);
    }, 2000);
  }

  startBossFight() {
    if (this.isBossActive) return;
    this.isBossActive = true;
    this.spawningPaused = false;
    this.spawnRate = 700;
    this.baseSpeed = 11;

    this.showFeedback("BOSS FIGHT! 🐉\nCatch Rockets!", true);

    const bossContainer = document.createElement('div');
    bossContainer.classList.add('boss-container'); // Use class
    bossContainer.style.position = 'absolute';
    bossContainer.style.top = '10px';
    bossContainer.style.left = '50%';
    bossContainer.style.transform = 'translateX(-50%)';
    bossContainer.style.width = '300px';
    bossContainer.style.textAlign = 'center';
    bossContainer.style.zIndex = '10';

    const hpBar = document.createElement('div');
    hpBar.style.width = '100%';
    hpBar.style.height = '20px';
    hpBar.style.backgroundColor = 'red';
    hpBar.style.border = '2px solid white';
    hpBar.style.marginBottom = '5px';
    hpBar.style.transition = 'width 0.2s';
    bossContainer.appendChild(hpBar);

    const dragon = document.createElement('div');
    dragon.textContent = '🐉';
    dragon.style.fontSize = '80px';
    bossContainer.appendChild(dragon);

    this.container.appendChild(bossContainer);

    this.bossEntity = {
      x: 50,
      y: 0,
      direction: 1,
      element: bossContainer,
      hpElement: hpBar,
      elementDragon: dragon
    };
  }

  damageBoss() {
    if (!this.isBossActive) return;

    this.bossHP--;
    const hpPercent = (this.bossHP / this.bossMaxHP * 100);
    this.bossEntity.hpElement.style.width = hpPercent + '%';

    this.bossEntity.elementDragon.style.opacity = 0.5;
    setTimeout(() => this.bossEntity.elementDragon.style.opacity = 1, 100);

    const dmgText = document.createElement('div');
    dmgText.textContent = "💥 -1";
    dmgText.style.position = 'absolute';
    dmgText.style.top = '0';
    dmgText.style.left = '50%';
    dmgText.style.transform = 'translateX(-50%)';
    dmgText.style.color = 'red';
    dmgText.style.fontSize = '30px';
    dmgText.style.fontWeight = 'bold';
    dmgText.style.textShadow = '0 0 5px white';
    dmgText.style.transition = 'top 0.5s, opacity 0.5s';
    this.bossEntity.element.appendChild(dmgText);

    setTimeout(() => {
      dmgText.style.top = '-50px';
      dmgText.style.opacity = 0;
    }, 50);
    setTimeout(() => dmgText.remove(), 550);

    if (this.bossHP <= 0) {
      this.victory();
    }
  }

  loop() {
    if (!this.isGameActive) return;

    const now = Date.now();

    if (this.isBossActive && this.bossEntity) {
      this.updateBossMovement();
    }

    if (!this.spawningPaused && now - this.lastSpawnTime > this.spawnRate) {
      this.spawnItem();
      this.lastSpawnTime = now;
    }

    this.updateItems();
    this.checkCollisions();

    this.gameLoopId = requestAnimationFrame(() => this.loop());
  }

  updateBossMovement() {
    const speed = 0.5;
    this.bossEntity.x += this.bossEntity.direction * speed;

    if (this.bossEntity.x > 90 || this.bossEntity.x < 10) {
      this.bossEntity.direction *= -1;
    }

    this.bossEntity.element.style.left = this.bossEntity.x + '%';
  }

  spawnItem() {
    let lane, startXPercent;

    if (this.isBossActive && this.bossEntity) {
      if (this.bossEntity.x < 33) lane = 0;
      else if (this.bossEntity.x < 66) lane = 1;
      else lane = 2;
    } else {
      lane = Math.floor(Math.random() * 3);
    }

    const typeRoll = Math.random();
    let type = 'apple';
    let symbol = '🍎';
    let score = 100;

    if (this.isBossActive) {
      if (typeRoll < 0.3) {
        type = 'rocket'; symbol = '🚀'; score = 0;
      } else if (typeRoll < 0.6) {
        type = 'bomb'; symbol = '💣'; score = 0;
      } else {
        const f = Math.random();
        if (f < 0.5) { type = 'apple'; symbol = '🍎'; score = 100; }
        else if (f < 0.8) { type = 'banana'; symbol = '🍌'; score = 200; }
        else { type = 'dragon'; symbol = '🌵'; score = 300; }
      }
    } else {
      if (typeRoll < 0.5) {
        type = 'apple'; symbol = '🍎'; score = 100;
      } else if (typeRoll < 0.8) {
        type = 'banana'; symbol = '🍌'; score = 200;
      } else if (typeRoll < 0.9) {
        type = 'dragon'; symbol = '🌵'; score = 300;
      } else {
        type = 'bomb'; symbol = '💣'; score = 0;
      }
    }

    if (type === 'bomb') {
      if (this.bombsSpawnedInLevel >= 5) {
        type = 'apple'; symbol = '🍎'; score = 100;
      } else {
        this.bombsSpawnedInLevel++;
      }
    }

    const itemEl = document.createElement('div');
    itemEl.classList.add('item');

    itemEl.style.left = (lane * 33.33 + 16.66) + '%';
    itemEl.style.transform = 'translateX(-50%)';
    itemEl.style.top = this.isBossActive ? '60px' : '-60px';

    if (type === 'dragon') {
      itemEl.innerHTML = `<img src="assets/dragon_fruit.svg" alt="🐉" style="width:100%; height:100%; object-fit:contain;" onerror="this.parentElement.textContent='🐉'">`;
    } else if (type === 'rocket') {
      itemEl.style.fontSize = '40px';
      itemEl.textContent = symbol;
    } else {
      itemEl.textContent = symbol;
    }

    this.container.appendChild(itemEl);

    this.items.push({
      id: this.itemIdCounter++,
      type: type,
      lane: lane,
      y: this.isBossActive ? 60 : -60,
      speed: this.baseSpeed + Math.random(),
      element: itemEl,
      score: score
    });
  }

  activateGun() {
    this.gunActive = true;
    this.showFeedback("Auto Gun! 🔫", true);

    if (!this.gunElement) {
      this.gunElement = document.createElement('div');
      this.gunElement.textContent = "🔫";
      this.gunElement.style.position = "absolute";
      this.gunElement.style.fontSize = "30px";
      this.gunElement.style.bottom = "20px";
      this.gunElement.style.zIndex = "20";
      this.gunElement.style.transition = "left 0.1s linear";
      this.gunElement.style.left = "50%";
      this.gunElement.style.transform = "translateX(-50%)";
      this.container.appendChild(this.gunElement);
    }

    if (this.gunTimer) clearTimeout(this.gunTimer);

    this.gunTimer = setTimeout(() => {
      this.gunActive = false;
      this.showFeedback("Gun End", false);
      this.gunTimer = null;
      if (this.gunElement) {
        this.gunElement.remove();
        this.gunElement = null;
      }
    }, 10000);
  }

  updateItems() {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      if (this.gunActive && item.y > 0) {
        if (this.gunElement) {
          const laneCenter = (item.lane * 33.33 + 16.66);
          this.gunElement.style.left = `calc(${laneCenter}% - 15px)`;
        }
        this.fireBullet(item, i);
        continue;
      }

      item.y += item.speed;
      item.element.style.top = item.y + 'px';

      if (item.y > 500) {
        if (item.type !== 'bomb' && item.type !== 'rocket') {
          // If invincible, do not count miss or update lives UI
          if (!this.isInvincible) {
            this.missedCount++;
            this.updateLivesUI();
            this.showFeedback(`Missed!`);

            if (this.missedCount >= this.maxMisses) {
              this.stop(`Game Over!`);
              return;
            }
          }
        }
        item.element.remove();
        this.items.splice(i, 1);
      }
    }
  }

  fireBullet(item, index) {
    if (item.isTargeted) return;
    item.isTargeted = true;

    const bullet = document.createElement('div');
    bullet.textContent = '📍';
    bullet.style.position = 'absolute';
    bullet.style.fontSize = '20px';
    bullet.style.left = this.gunElement.style.left;
    bullet.style.bottom = '50px';
    bullet.style.zIndex = '15';
    bullet.style.transition = 'bottom 0.2s linear, left 0.2s linear';
    this.container.appendChild(bullet);

    requestAnimationFrame(() => {
      const laneCenter = (item.lane * 33.33 + 16.66);
      bullet.style.left = `calc(${laneCenter}% - 10px)`;
      bullet.style.bottom = (500 - item.y) + 'px';
    });

    setTimeout(() => {
      bullet.remove();
      const currentIdx = this.items.findIndex(it => it.id === item.id);
      if (currentIdx !== -1) {
        this.handleCollision(item, currentIdx);
      }
    }, 200);
  }

  checkCollisions() {
    const playerTop = 420;
    const playerBottom = 480;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      const itemBottom = item.y + 60;
      const itemTop = item.y;

      if (item.lane === this.playerPos) {
        if (itemBottom > playerTop + 10 && itemTop < playerBottom - 10) {
          this.handleCollision(item, i);
        }
      }
    }
  }

  handleCollision(item, index) {
    item.element.remove();
    this.items.splice(index, 1);

    if (item.type === 'rocket') {
      this.damageBoss();
      this.showFeedback("ATTACK! 💥");
    } else if (item.type === 'bomb' && !this.gunActive && !this.isInvincible) {
      this.stop("BOMB! Game Over");
    } else if (item.type === 'bomb' && this.isInvincible) {
      this.showFeedback("🛡️ BLOCKED!");
    } else {
      let points = item.score;
      let color = '#ffeb3b';

      if (item.type === 'bomb' && this.gunActive) {
        points = 200;
        color = '#448AFF';
      }

      this.addScore(points);

      const popup = document.createElement('div');
      popup.textContent = `+${points}`;
      popup.style.position = 'absolute';
      popup.style.left = (item.lane * 33.33 + 16.66) + '%';
      popup.style.top = '400px';
      popup.style.color = color;
      popup.style.fontWeight = 'bold';
      popup.style.fontSize = '24px';
      popup.style.transition = 'top 0.5s, opacity 0.5s';
      if (item.type !== 'bomb') this.container.appendChild(popup);

      setTimeout(() => {
        popup.style.top = '350px';
        popup.style.opacity = '0';
      }, 50);

      setTimeout(() => popup.remove(), 550);
    }
  }

  victory() {
    this.isGameActive = false;
    clearInterval(this.gameTimer);
    cancelAnimationFrame(this.gameLoopId);

    if (this.handleInput) {
      window.removeEventListener('keydown', this.handleInput);
      this.handleInput = null;
    }

    if (this.bossEntity) {
      this.bossEntity.element.innerHTML = "💥";
      setTimeout(() => this.bossEntity.element.remove(), 1000);
    }

    // Victory callback logic
    // We cannot assume global overlay works for 2 players cleanly yet.
    // For now, emit callback.
    if (this.onGameEnd) {
      this.onGameEnd(this.score, this.level, true, this);
    }
  }

  updatePlayerPosition() {
    if (!this.playerElement) return;
    const leftPercent = (this.playerPos * 33.33 + 16.66);
    this.playerElement.style.left = `calc(${leftPercent}% - 40px)`;
  }

  onPoseDetected(poseLabel) {
    if (!this.isGameActive) return;

    let targetPos = this.playerPos;

    if (poseLabel === 'Left' || poseLabel === '왼쪽') targetPos = 0;
    else if (poseLabel === 'Center' || poseLabel === '가운데' || poseLabel === '중앙') targetPos = 1;
    else if (poseLabel === 'Right' || poseLabel === '오른쪽') targetPos = 2;

    if (targetPos !== this.playerPos) {
      this.playerPos = targetPos;
      this.updatePlayerPosition();
    }
  }

  addScore(points) {
    this.score += points;
    const newLevel = Math.floor(this.score / 1000) + 1;

    if (newLevel > this.level) {
      this.level = newLevel;
      this.bombsSpawnedInLevel = 0;

      if (this.level <= 9) {
        this.baseSpeed += 1;
      }
      // PVP: Usually reset Level for both? Or keep leveling up independently?
      // Independent level up is fun.
      this.timeLimit = 60;

      if (this.level >= 15 && !this.isBossActive) {
        this.startBossFight();
      } else if (!this.isBossActive) {
        // this.triggerLevelTransition(this.spawnRate, this.baseSpeed, `LEVEL UP!`);
        this.updateTimeUI();

        if (this.level <= 9) {
          if (this.spawnRate > 500) this.spawnRate -= 100;
        }
      }
    }

    this.updateScoreUI();
    if (this.onScoreChange) this.onScoreChange(this.score, this.level);
  }

  updateScoreUI() {
    if (this.scoreElement) this.scoreElement.textContent = this.score;
  }

  updateTimeUI() {
    if (this.timeElement) this.timeElement.textContent = this.timeLimit;
  }

  updateLivesUI() {
    if (!this.livesContainer) return;
    const remaining = Math.max(0, this.maxMisses - this.missedCount);
    let hearts = "";
    for (let i = 0; i < remaining; i++) {
      hearts += "❤️";
    }
    this.livesContainer.textContent = hearts;
  }

  showFeedback(text, persist = false) {
    if (!this.feedbackElement) return;
    this.feedbackElement.textContent = text;
    this.feedbackElement.style.opacity = 1;
    if (!persist) {
      setTimeout(() => {
        this.feedbackElement.style.opacity = 0;
      }, 1000);
    }
  }

  setScoreChangeCallback(cb) { this.onScoreChange = cb; }
  setGameEndCallback(cb) { this.onGameEnd = cb; }

}

window.GameEngine = GameEngine;
