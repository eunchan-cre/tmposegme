/**
 * gameEngine.js
 * Sky Fruit Catcher Game Logic
 */

class GameEngine {
  constructor() {
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
    this.laneWidth = 200; // Approx width, used for centering if needed
    this.spawnRate = 1500; // ms
    this.lastSpawnTime = 0;
    this.baseSpeed = 3; // pixels per frame

    // Callback placeholders
    this.onScoreChange = null;
    this.onGameEnd = null;

    this.container = null;
    this.playerElement = null;
    this.feedbackElement = null;
  }

  start(config = {}) {
    if (this.isGameActive) return;

    this.isGameActive = true;
    this.score = 0;
    this.level = 1;
    this.timeLimit = config.timeLimit || 60;
    this.playerPos = 1;
    this.missedCount = 0; // Track missed fruits
    this.spawningPaused = false; // Level transition logic

    // Reward Logic
    this.maxMisses = 2; // Default
    this.gunActive = false;
    this.hasGun = false; // Stored gun
    this.gunTimer = null;

    if (config.reward === 'life') {
      this.maxMisses = 3;
      this.showFeedback("Bonus Life Active! ❤️");
    } else if (config.reward === 'gun') {
      this.hasGun = true;
      this.showFeedback("Gun Ready! Press 'W' to use 🔫", true);
    } else {
      this.showFeedback("Game Start!");
    }

    // UI Elements
    this.container = document.getElementById('game-container');
    this.playerElement = document.getElementById('player');
    this.feedbackElement = document.getElementById('feedback-overlay');
    this.scoreElement = document.getElementById('score');
    this.timeElement = document.getElementById('time');

    // Input Handling
    this.handleInput = (e) => {
      if ((e.key === 'w' || e.key === 'W' || e.key === 'ㅈ') && this.hasGun && !this.gunActive) {
        this.activateGun();
        this.hasGun = false;
        // Optionally update UI to show gun is used/gone
      }
    };
    window.addEventListener('keydown', this.handleInput);

    // Clear existing items from DOM
    const existingItems = document.querySelectorAll('.item');
    existingItems.forEach(el => el.remove());

    // Update Initial UI
    this.updatePlayerPosition();
    this.updateScoreUI();
    this.updateTimeUI();

    // Start Timer
    this.startTimer();

    // Start Game Loop
    this.lastSpawnTime = Date.now();
    this.loop();

    console.log("Game Started!");
  }

  stop(reason = "Time's Up!") {
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

    if (this.onGameEnd) {
      this.onGameEnd(this.score, this.level);
    }

    // Disable stop button, enable start button logic handles in main.js usually
    // But here we might want to just let the user see the result
  }

  startTimer() {
    this.gameTimer = setInterval(() => {
      this.timeLimit--;
      this.updateTimeUI();

      // Level up / Difficulty increase
      if (this.timeLimit === 30) {
        this.triggerLevelTransition(1000, 4, "Warning: Speed Up!");
      } else if (this.timeLimit === 10) {
        this.triggerLevelTransition(500, 6, "Warning: Fever Time!");
      }

      if (this.timeLimit <= 0) {
        this.stop("Game Over!");
      }
    }, 1000);
  }

  triggerLevelTransition(newRate, newSpeed, message) {
    this.spawningPaused = true;
    this.showFeedback(message, true); // Persist message

    setTimeout(() => {
      this.spawningPaused = false;
      this.spawnRate = newRate;
      this.baseSpeed = newSpeed;
      this.showFeedback("GO!!", false); // Clear message
    }, 2000); // 2 seconds pause
  }

  loop() {
    if (!this.isGameActive) return;

    const now = Date.now();

    // 1. Spawn Item
    if (!this.spawningPaused && now - this.lastSpawnTime > this.spawnRate) {
      this.spawnItem();
      this.lastSpawnTime = now;
    }

    // 2. Update Items
    this.updateItems();

    // 3. Collision Detection
    this.checkCollisions();

    this.gameLoopId = requestAnimationFrame(() => this.loop());
  }

  spawnItem() {
    const lane = Math.floor(Math.random() * 3);
    const typeRoll = Math.random();
    let type = 'apple';
    let symbol = '🍎';
    let score = 100;

    // Probability: 50% Apple, 30% Banana, 10% Dragon, 10% Bomb
    if (typeRoll < 0.5) {
      type = 'apple'; symbol = '🍎'; score = 100;
    } else if (typeRoll < 0.8) {
      type = 'banana'; symbol = '🍌'; score = 200;
    } else if (typeRoll < 0.9) {
      type = 'dragon'; symbol = '🌵'; score = 300; // Cactus as fallback for Dragon Fruit
    } else {
      type = 'bomb'; symbol = '💣'; score = 0;
    }

    const itemEl = document.createElement('div');
    itemEl.classList.add('item');
    itemEl.style.left = (lane * 33.33 + 16.66) + '%'; // Center of lane
    itemEl.style.transform = 'translateX(-50%)'; // Center alignment
    itemEl.style.top = '-60px';

    if (type === 'dragon') {
      // Use generated SVG
      itemEl.innerHTML = `<img src="assets/dragon_fruit.svg" alt="🐉" style="width:100%; height:100%; object-fit:contain;" onerror="this.parentElement.textContent='🐉'">`;
    } else {
      itemEl.textContent = symbol;
    }

    this.container.appendChild(itemEl);

    this.items.push({
      id: this.itemIdCounter++,
      type: type,
      lane: lane,
      y: -60,
      speed: this.baseSpeed + Math.random(), // Slight variation
      element: itemEl,
      score: score
    });
  }

  activateGun() {
    this.gunActive = true;
    this.showFeedback("Auto Gun Active! 🔫", true);

    // Create Visual Gun Element
    if (!this.gunElement) {
      this.gunElement = document.createElement('div');
      this.gunElement.textContent = "🔫";
      this.gunElement.style.position = "absolute";
      this.gunElement.style.fontSize = "30px"; // Smaller
      this.gunElement.style.bottom = "20px"; // Same line as basket
      this.gunElement.style.zIndex = "20";
      this.gunElement.style.transition = "left 0.1s linear";
      this.gunElement.style.left = "50%"; // Start center
      this.gunElement.style.transform = "translateX(-50%)"; // Center alignment specific to the element itself
      this.container.appendChild(this.gunElement);
    }

    // Clear any existing gun timer to prevent multiple timers
    if (this.gunTimer) {
      clearTimeout(this.gunTimer);
    }

    this.gunTimer = setTimeout(() => {
      this.gunActive = false;
      this.showFeedback("Gun Deactivated", false);
      this.gunTimer = null;

      // Remove visual gun
      if (this.gunElement) {
        this.gunElement.remove();
        this.gunElement = null;
      }
    }, 10000); // 10 seconds
  }

  updateItems() {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      // Gun Logic: Auto collect/destroy if visible (y > 0)
      if (this.gunActive && item.y > 0) {
        // Move Gun to this lane visually
        if (this.gunElement) {
          const laneCenter = (item.lane * 33.33 + 16.66);
          this.gunElement.style.left = `calc(${laneCenter}% - 15px)`; // Center of gun (width approx 30)
        }

        // Fire effect
        this.fireBullet(item, i);
        return; // Wait for bullet to hit before destroying? 
        // Actually, for better feel, bullet travels fast, then destroy.
        // But since we are in a loop, we need to ensure we don't fire multiple times for same item.
        // Let's add 'isTargeted' flag to item.
      }

      item.y += item.speed;
      item.element.style.top = item.y + 'px';

      // Remove if out of bounds
      if (item.y > 500) {
        // Check if it was a fruit (not a bomb)
        if (item.type !== 'bomb') {
          this.missedCount++;
          this.showFeedback(`Missed: ${this.missedCount}/${this.maxMisses}`);

          if (this.missedCount >= this.maxMisses) {
            this.stop(`Game Over! (${this.maxMisses} Misses)`);
            return; // Stop update loop
          }
        }

        item.element.remove();
        this.items.splice(i, 1);
      }
    }
  }

  fireBullet(item, index) {
    if (item.isTargeted) return;
    item.isTargeted = true; // Prevent multiple shots

    const bullet = document.createElement('div');
    bullet.textContent = '📍'; // Or '⚡', '🔴'
    bullet.style.position = 'absolute';
    bullet.style.fontSize = '20px';
    bullet.style.left = this.gunElement.style.left; // Start from gun
    bullet.style.bottom = '50px'; // Gun is at 20px bottom + size
    bullet.style.zIndex = '15';
    bullet.style.transition = 'bottom 0.2s linear, left 0.2s linear'; // Fast speed (< 1s)
    this.container.appendChild(bullet);

    // Calculate target position
    // Item y is top. We want to hit it.
    // CSS bottom is 500 - y - height? 
    // Item Y is from top. Container height 500.
    // Target Bottom = 500 - (item.y + 30); // Hit center
    // Let's uset requestAnimationFrame or setTimeout for transition trigger

    // Actually simplicity:
    // We want visual hit.
    // 0.2s is fast enough.

    // Trigger animation
    requestAnimationFrame(() => {
      const laneCenter = (item.lane * 33.33 + 16.66);
      bullet.style.left = `calc(${laneCenter}% - 10px)`; // Center of bullet
      bullet.style.bottom = (500 - item.y) + 'px'; // Fly to item
    });

    // On Hit
    setTimeout(() => {
      bullet.remove();
      // Check if item still exists (it should)
      // Handle collision logically now

      // Re-find index just in case array shifted? 
      // Array index relies on loop order. splice shifts subsequent. 
      // But since this is async, the main loop continues.
      // If we remove item HERE, we must be careful about main loop's index.
      // Safer approach: Mark item as 'destroyed' in main loop and remove it.
      // But wait, user wants bullet -> THEN destroy.

      // Let's cheat slightly: 
      // Visual destroy happens here. Logical remove from array happens here?
      // If we remove from array, main loop 'i' loop might skip next item if we don't adjust 'i' if called from loop?
      // But updateItems iterates backwards! So splicing current index 'i' acts safe for backwards loop.
      // BUT this setTimeout runs OUTSIDE the loop.

      // Find item by ID to be safe
      const currentIdx = this.items.findIndex(it => it.id === item.id);
      if (currentIdx !== -1) {
        this.handleCollision(item, currentIdx);
      }
    }, 200); // Sync with transition duration
  }

  checkCollisions() {
    // Player hitbox (approx)
    // Player y is bottom 20px, height 60px. So range: 420px to 480px (container is 500px height)
    const playerTop = 420;
    const playerBottom = 480;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      // Item y is the top position. height 60.
      const itemBottom = item.y + 60;
      const itemTop = item.y;

      // Check Lane
      if (item.lane === this.playerPos) {
        // Check Y overlap
        // If item bottom touches player top (with some buffer)
        if (itemBottom > playerTop + 10 && itemTop < playerBottom - 10) {
          this.handleCollision(item, i);
        }
      }
    }
  }

  handleCollision(item, index) {
    // Remove item
    item.element.remove();
    this.items.splice(index, 1);

    if (item.type === 'bomb' && !this.gunActive) {
      this.stop("BOMB! Game Over");
    } else {
      // Score
      let points = item.score;
      let color = '#ffeb3b'; // Default yellow

      // Special case: Bomb destroyed by Gun
      if (item.type === 'bomb' && this.gunActive) {
        points = 200;
        color = '#448AFF'; // Blue for gun effect
      }

      this.addScore(points);

      // Feedback
      const popup = document.createElement('div');
      popup.textContent = `+${points}`;
      popup.style.position = 'absolute';
      popup.style.left = (item.lane * 33.33 + 16.66) + '%';
      popup.style.top = '400px';
      popup.style.color = color;
      popup.style.fontWeight = 'bold';
      popup.style.fontSize = '24px';
      popup.style.transition = 'top 0.5s, opacity 0.5s';
      this.container.appendChild(popup);

      setTimeout(() => {
        popup.style.top = '350px';
        popup.style.opacity = '0';
      }, 50);

      setTimeout(() => popup.remove(), 550);
    }
  }

  updatePlayerPosition() {
    if (!this.playerElement) return;
    // 0 -> 16.66%, 1 -> 50%, 2 -> 83.33%
    const leftPercent = (this.playerPos * 33.33 + 16.66);
    this.playerElement.style.left = `calc(${leftPercent}% - 40px)`; // Center of player (width 80)
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
    this.updateScoreUI();
  }

  updateScoreUI() {
    if (this.scoreElement) this.scoreElement.textContent = this.score;
  }

  updateTimeUI() {
    if (this.timeElement) this.timeElement.textContent = this.timeLimit;
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

  // Callbacks
  setScoreChangeCallback(cb) { this.onScoreChange = cb; }
  setGameEndCallback(cb) { this.onGameEnd = cb; }
}

window.GameEngine = GameEngine;
