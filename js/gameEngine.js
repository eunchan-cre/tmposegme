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
        this.items = [];
        this.playerPos = 1;
        
        // UI Elements
        this.container = document.getElementById('game-container');
        this.playerElement = document.getElementById('player');
        this.feedbackElement = document.getElementById('feedback-overlay');
        this.scoreElement = document.getElementById('score');
        this.timeElement = document.getElementById('time');
        
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
                this.spawnRate = 1000;
                this.baseSpeed = 4;
                this.showFeedback("Speed Up!");
            } else if (this.timeLimit === 10) {
                this.spawnRate = 500;
                this.baseSpeed = 6;
                this.showFeedback("Fever Time!");
            }

            if (this.timeLimit <= 0) {
                this.stop("Game Over!");
            }
        }, 1000);
    }

    loop() {
        if (!this.isGameActive) return;
        
        const now = Date.now();
        
        // 1. Spawn Item
        if (now - this.lastSpawnTime > this.spawnRate) {
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
            type = 'dragon'; symbol = '🐉'; score = 300; // Use Emoji if image fails
            // If image exists, we can use <img src="assets/dragon_fruit.png">
            // We'll try to check if we should use image in CSS or here.
            // For now, let's use symbol, but if type is dragon and asset is planned, use img tag
        } else {
            type = 'bomb'; symbol = '💣'; score = 0;
        }
        
        const itemEl = document.createElement('div');
        itemEl.classList.add('item');
        itemEl.style.left = (lane * 33.33 + 16.66) + '%'; // Center of lane
        itemEl.style.transform = 'translateX(-50%)'; // Center alignment
        itemEl.style.top = '-60px';
        
        if (type === 'dragon') {
             // Try to use image, fallback to emoji
             itemEl.innerHTML = `<img src="assets/dragon_fruit.png" alt="🐉" style="width:100%; height:100%; object-fit:contain;" onerror="this.outerHTML='🐉'">`;
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

    updateItems() {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            item.y += item.speed;
            item.element.style.top = item.y + 'px';
            
            // Remove if out of bounds
            if (item.y > 500) {
                item.element.remove();
                this.items.splice(i, 1);
            }
        }
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
        
        if (item.type === 'bomb') {
            this.stop("BOMB! Game Over");
            // Play sound?
        } else {
            // Score
            this.addScore(item.score);
            
            // Feedback
            const popup = document.createElement('div');
            popup.textContent = `+${item.score}`;
            popup.style.position = 'absolute';
            popup.style.left = (item.lane * 33.33 + 16.66) + '%';
            popup.style.top = '400px';
            popup.style.color = '#ffeb3b';
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
        
        if (poseLabel === 'Left') targetPos = 0;
        else if (poseLabel === 'Center') targetPos = 1;
        else if (poseLabel === 'Right') targetPos = 2;
        
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
        if(this.scoreElement) this.scoreElement.textContent = this.score;
    }
    
    updateTimeUI() {
        if(this.timeElement) this.timeElement.textContent = this.timeLimit;
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
