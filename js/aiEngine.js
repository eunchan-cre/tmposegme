/**
 * aiEngine.js
 * Controls a GameEngine instance for the AI player.
 */

class AIEngine {
    constructor(gameEngine, difficulty = 'medium') {
        this.game = gameEngine;
        this.difficulty = difficulty;
        this.updateInterval = null;
        this.reactionTime = 500; // ms
        this.errorRate = 0.0; // 0 to 1

        this.configureDifficulty();
    }

    configureDifficulty() {
        // defaults
        this.minSurvivorLevel = 1;

        switch (this.difficulty) {
            case 'easy': // 쉬움
                this.reactionTime = 800;
                this.errorRate = 0.3; // 30% chance to pick wrong/random lane
                this.minSurvivorLevel = 2; // 최소 레벨 2 보장
                break;
            case 'medium': // 중간
                this.reactionTime = 500;
                this.errorRate = 0.1;
                this.minSurvivorLevel = 5; // 최소 레벨 5 보장
                break;
            case 'hard': // 어려움
                this.reactionTime = 200;
                this.errorRate = 0.0;
                this.minSurvivorLevel = 8; // 최소 레벨 8 보장
                break;
            case 'hell': // 극악
                this.reactionTime = 50; // Super fast
                this.errorRate = 0.0;
                this.minSurvivorLevel = 12; // 최소 레벨 12 보장
                break;
        }
    }

    start() {
        this.stop();
        // Run AI loop
        this.updateInterval = setInterval(() => this.decideMove(), this.reactionTime);
    }

    stop() {
        if (this.updateInterval) clearInterval(this.updateInterval);
    }

    decideMove() {
        if (!this.game.isGameActive) return;

        // Apply Invincibility if below min level
        if (this.game.level < this.minSurvivorLevel) {
            this.game.isInvincible = true;
        } else {
            this.game.isInvincible = false;
        }

        // Analyze falling items
        // We want the item that is closest to catch but safe.
        // Logic: Look at items in the lower half of screen (y > 200?) or closest.

        // Sort items by Y (closest to bottom first)
        // Filter out items that are already too low (past player)
        const items = this.game.items.filter(item => item.y < 420 && item.y > 0).sort((a, b) => b.y - a.y);

        if (items.length === 0) {
            // Nothing to do, stay or move to center?
            // Advanced AI might move to center to cover more ground.
            if (this.difficulty === 'hell') this.moveTo(1);
            return;
        }

        // Identify threats and targets
        let targetLane = this.game.playerPos; // Default: stay
        let bestScore = -9999;

        // Simple analysis: Iterate all 3 lanes, see which one is "best"
        const lanes = [0, 1, 2];

        // Evaluate each lane score
        const laneScores = lanes.map(lane => {
            // Find lowest item in this lane
            const itemInLane = items.find(it => it.lane === lane);

            let score = 0;
            if (!itemInLane) {
                // Empty lane. Safe but no reward.
                // Slight penalty for moving unnecessarily?
                score = 0;
            } else {
                if (itemInLane.type === 'bomb') {
                    score = -1000; // Avoid!
                } else if (itemInLane.type === 'rocket') {
                    // Boss rocket. Damage?
                    // Assuming rocket hurts player or ends game? 
                    // In single player, rocket damages boss IF caught?
                    // Wait, catching rocket -> damageBoss.
                    // So catching rocket is GOOD!
                    score = 500;
                } else {
                    // Fruit
                    score = itemInLane.score; // 100, 200, 300
                }

                // Distance penalty (don't move too frantically for small points if far away)
                // distance = Math.abs(lane - this.game.playerPos);
                // score -= distance * 10;
            }
            return { lane, score };
        });

        // Pick best lane
        laneScores.sort((a, b) => b.score - a.score);
        let bestOption = laneScores[0];

        // Apply Error Rate (AI Mistake)
        // If Invincible, always play perfect (or standard best).
        const shouldUseError = !this.game.isInvincible && Math.random() < this.errorRate;

        if (shouldUseError) {
            // Pick a random lane instead
            targetLane = Math.floor(Math.random() * 3);
        } else {
            // If the best option is really bad (e.g. only bombs), try to stay safe.
            // If all lanes have bombs (rare), good luck.
            if (bestOption.score < -500) {
                // Panic? Stay put or random?
            } else {
                targetLane = bestOption.lane;
            }
        }

        // Gun Logic (Hell Mode only?)
        if (this.difficulty === 'hell' || this.difficulty === 'hard') {
            // If bomb is effectively unavoidable or high density, use gun?
            // Simplified: If has gun and bombs on screen, fire.
            const hasBomb = items.some(it => it.type === 'bomb');
            if (hasBomb && (this.game.hasGun || this.game.devGunMode)) {
                this.game.activateGun(); // AI cheats by spamming W if it has gun?
                // Or just activate. 
                // Note: gameEngine.activateGun() is toggle/timer based.
                if (!this.game.gunActive) this.game.activateGun();
            }
        }

        this.moveTo(targetLane);
    }

    moveTo(lane) {
        if (this.game.playerPos !== lane) {
            this.game.playerPos = lane;
            this.game.updatePlayerPosition();
        }
    }
}

window.AIEngine = AIEngine;
