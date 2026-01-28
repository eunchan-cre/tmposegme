/**
 * main.js
 * 포즈 인식과 게임 로직을 초기화하고 서로 연결하는 진입점
 *
 * PoseEngine, GameEngine, Stabilizer를 조합하여 애플리케이션을 구동
 */

// 전역 변수
let poseEngine;
let gameEngine; // P1 (or Single)
let gameEngineP2; // P2 (AI)
let aiController;
let stabilizer;
let ctx;
let labelContainer;
let useKeyboard = false;

function enableKeyboardMode() {
  useKeyboard = true;
  closeRuleModal();
  document.getElementById("startBtn").textContent = "Keyboard Start";
  document.getElementById("max-prediction").textContent = "키보드 모드 대기 중...";
  alert("키보드 모드가 선택되었습니다.\n\n[조작법]\nA: 왼쪽\nS: 가운데\nD: 오른쪽\nW: 총 사용");
}
window.enableKeyboardMode = enableKeyboardMode;

/**
 * 애플리케이션 초기화 (Single Player / Default)
 */
async function init() {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  startBtn.disabled = true;

  try {
    const maxPredictionDiv = document.getElementById("max-prediction");

    // 3. GameEngine 초기화 (공통)
    let savedDevMode = false;
    if (gameEngine) {
      savedDevMode = gameEngine.devGunMode;
    }
    // Single Player: Use document as root (backwards compat)
    gameEngine = new GameEngine(document);
    gameEngine.devGunMode = savedDevMode;

    if (useKeyboard) {
      maxPredictionDiv.innerHTML = "키보드 모드 준비 완료!";
      document.getElementById("label-container").innerHTML = "📷 카메라 꺼짐";
      poseEngine = null;
      stabilizer = null;
      stopBtn.disabled = false;
      document.getElementById("gameStartBtn").disabled = false;
    } else {
      maxPredictionDiv.innerHTML = "모델 로딩 중...";
      poseEngine = new PoseEngine("./my_model/");
      const { maxPredictions, webcam } = await poseEngine.init({
        size: 200,
        flip: true
      });
      maxPredictionDiv.innerHTML = "카메라 시작 중...";
      stabilizer = new PredictionStabilizer({
        threshold: 0.7,
        smoothingFrames: 3
      });

      const canvas = document.getElementById("canvas");
      canvas.width = 200;
      canvas.height = 200;
      ctx = canvas.getContext("2d");

      labelContainer = document.getElementById("label-container");
      labelContainer.innerHTML = "";
      for (let i = 0; i < maxPredictions; i++) {
        labelContainer.appendChild(document.createElement("div"));
      }

      poseEngine.setPredictionCallback(handlePrediction);
      poseEngine.setDrawCallback(drawPose);
      poseEngine.start();
      maxPredictionDiv.innerHTML = "준비 완료!";
      stopBtn.disabled = false;
      document.getElementById("gameStartBtn").disabled = false;
    }
  } catch (error) {
    console.error("초기화 중 오류 발생:", error);
    document.getElementById("max-prediction").innerHTML = "오류 발생!";
    alert("초기화 실패!\n오류 내용: " + error.message);
    startBtn.disabled = false;
  }
}

/**
 * PVP Mode Start Logic
 */
async function startPVP() {
  // 1. Get Difficulty
  const difficultyEls = document.getElementsByName('difficulty');
  let diff = 'medium';
  for (let el of difficultyEls) {
    if (el.checked) diff = el.value;
  }

  // 2. Hide Modal & Setup UI
  closeRuleModal();
  document.getElementById('roulette-overlay').style.display = 'none';

  // Clean up single player UI
  const singleInfo = document.querySelector('.game-info');
  const singleContainer = document.getElementById('game-container');
  if (singleInfo) singleInfo.style.display = 'none';
  if (singleContainer) singleContainer.style.display = 'none';
  const heading = document.querySelector('h1');
  if (heading) heading.textContent = "⚔️ YOU  vs  AI 🤖";

  let wrapper = document.getElementById('main-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'main-wrapper';
    const ref = document.querySelector('.controls');
    ref.parentNode.insertBefore(wrapper, ref);
  }
  wrapper.innerHTML = "";

  // 3. Generate DOM
  const p1DOM = createGameDOM("Player 1 (YOU)");
  const p2DOM = createGameDOM(`AI (${diff.toUpperCase()})`);

  wrapper.appendChild(p1DOM.root);
  wrapper.appendChild(p2DOM.root);

  // 4. Initialize Engines
  gameEngine = new GameEngine(p1DOM.root);
  gameEngineP2 = new GameEngine(p2DOM.root);
  aiController = new AIEngine(gameEngineP2, diff);

  // Setup callbacks
  gameEngine.setGameEndCallback((score, level, victory, engine) => handlePVPEnd(score, true));
  gameEngineP2.setGameEndCallback((score, level, victory, engine) => handlePVPEnd(score, false));

  // 5. Setup Controls for Launch
  const gameStartBtn = document.getElementById("gameStartBtn");
  gameStartBtn.disabled = false;
  gameStartBtn.textContent = "⚔️ BATTLE START";
  gameStartBtn.onclick = launchPVP;

  // Disable main start button (Camera/Keyboard setup) as we are locked in PVP
  document.getElementById("startBtn").disabled = true;
  document.getElementById("stopBtn").disabled = false;
  document.getElementById("stopBtn").onclick = stopPVP;

  // Hint
  document.getElementById("max-prediction").textContent = "준비 완료! [BATTLE START]를 누르세요.";
}

function launchPVP() {
  document.getElementById("gameStartBtn").disabled = true;

  // Ensure Keyboard Mode if no camera
  if (!poseEngine && !useKeyboard) {
    // Auto enable keyboard if camera wasn't started
    enableKeyboardMode();
  }

  // Check if we need to hook up Camera Prediction to P1 ??
  // handlePrediction relies on global `gameEngine`.
  // We overwrote `gameEngine` with P1 instance in startPVP.
  // So if poseEngine is running, it will call gameEngine.onPoseDetected. CORRECT.

  gameEngine.start({ isInputEnabled: true, startLevel: 1 });
  gameEngineP2.start({ isInputEnabled: false, startLevel: 1 });
  aiController.start();
}


function createGameDOM(titleText) {
  const root = document.createElement('div');
  root.classList.add('game-instance');
  // Styling handled by CSS

  const html = `
     <h3 style="margin:5px 0; color:#00838f;">${titleText}</h3>
     <div class="game-info" style="scale:0.9; margin-bottom:5px;">
       <div>점수: <span class="score-value">0</span></div>
       <div>남은 시간: <span class="time-value">60</span>s</div>
       <div class="lives-container" style="color: red;">❤️❤️</div>
     </div>
     <div class="game-board">
       <div class="lane" id="lane-0"><div class="lane-label">LEFT</div></div>
       <div class="lane" id="lane-1"><div class="lane-label">CENTER</div></div>
       <div class="lane" id="lane-2"><div class="lane-label">RIGHT</div></div>
       <div class="player"></div>
       <div class="feedback-overlay"></div>
     </div>
  `;
  root.innerHTML = html;
  return { root };
}

function handlePVPEnd(score, isP1) {
  // One player died or finished.
  // Logic: If P1 dies, P2 wins. If P2 dies, P1 wins.
  // If Time Over? Compare scores.

  // Stop everyone
  if (aiController) aiController.stop();
  if (gameEngine.isGameActive) gameEngine.stop("Game Over", false);
  if (gameEngineP2.isGameActive) gameEngineP2.stop("Game Over", false);

  const p1Score = gameEngine.score;
  const p2Score = gameEngineP2.score;

  let resultMsg = "";
  if (!isP1) {
    // AI Died
    resultMsg = "YOU WIN! 🏆\n(AI Game Over)";
  } else {
    // Player Died
    resultMsg = "YOU LOSE... 💀\n(Game Over)";
  }

  // Check scores if both alive (Time Limit case?)
  // GameEngine stops itself on Time Limit.
  // If reason was Time Limit?

  // Simple alert for now
  setTimeout(() => {
    alert(resultMsg + `\n\nFinal Score:\nYOU: ${p1Score}\nAI: ${p2Score}`);
    location.reload();
  }, 500);
}

function stopPVP() {
  if (aiController) aiController.stop();
  if (gameEngine) gameEngine.stop("PVP Stopped");
  if (gameEngineP2) gameEngineP2.stop("PVP Stopped");
  location.reload();
}

/**
 * 애플리케이션 중지
 */
function stop() {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");

  if (poseEngine) {
    poseEngine.stop();
  }

  if (gameEngine && gameEngine.isGameActive) {
    gameEngine.stop();
  }

  if (stabilizer) {
    stabilizer.reset();
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
  document.getElementById("gameStartBtn").disabled = true;
}

/**
 * 예측 결과 처리 콜백
 */
function handlePrediction(predictions, pose) {
  const stabilized = stabilizer.stabilize(predictions);

  for (let i = 0; i < predictions.length; i++) {
    const classPrediction =
      predictions[i].className + ": " + predictions[i].probability.toFixed(2);
    labelContainer.childNodes[i].innerHTML = classPrediction;
  }

  const maxPredictionDiv = document.getElementById("max-prediction");
  maxPredictionDiv.innerHTML = stabilized.className || "감지 중...";

  if (gameEngine && gameEngine.isGameActive && stabilized.className) {
    gameEngine.onPoseDetected(stabilized.className);
  }
}

/**
 * 포즈 그리기 콜백
 */
function drawPose(pose) {
  if (poseEngine.webcam && poseEngine.webcam.canvas) {
    ctx.drawImage(poseEngine.webcam.canvas, 0, 0);

    if (pose) {
      const minPartConfidence = 0.5;
      tmPose.drawKeypoints(pose.keypoints, minPartConfidence, ctx);
      tmPose.drawSkeleton(pose.keypoints, minPartConfidence, ctx);
    }
  }
}

// 기존 startGameMode (Single Player)
function startGameMode(config) {
  if (!gameEngine) {
    console.warn("GameEngine이 초기화되지 않았습니다.");
    return;
  }
  gameEngine.start(config);
}

// Roulette Logic
let isSpinning = false;
let currentRotation = 0;

function showRoulette() {
  document.getElementById('roulette-overlay').style.display = 'flex';
  document.getElementById('spin-btn').disabled = false;
  document.getElementById('gameStartBtn').disabled = true;
}

function spinRoulette() {
  if (isSpinning) return;
  isSpinning = true;
  document.getElementById('spin-btn').disabled = true;

  const rand = Math.floor(Math.random() * 100);
  let targetType = 'kkwang';
  if (rand >= 90) targetType = 'gun';
  else if (rand >= 60) targetType = 'life';

  const map = {
    'kkwang': [0, 2, 4, 5, 7, 8],
    'life': [1, 3, 6],
    'gun': [9]
  };

  const candidates = map[targetType];
  const segmentIndex = candidates[Math.floor(Math.random() * candidates.length)];

  const extraSpins = 360 * 5;
  const centerAngle = segmentIndex * 36 + 18;
  const noise = Math.floor(Math.random() * 20) - 10;
  const targetRotation = (360 - centerAngle) + extraSpins + noise;

  const wheel = document.getElementById('roulette-wheel');

  wheel.style.transform = `rotate(${targetRotation}deg)`;

  setTimeout(() => {
    isSpinning = false;

    let msg = "💨 꽝! 아무 효과 없이 시작합니다.";
    let reward = 'kkwang';

    if (targetType === 'gun') {
      msg = "🔫 10초간 자동 총 발사! (폭탄 파괴)";
      reward = 'gun';
    } else if (targetType === 'life') {
      msg = "❤️ 목숨 +1개 획득!";
      reward = 'life';
    }

    alert(msg);

    document.getElementById('roulette-overlay').style.display = 'none';
    startGameMode({ reward: reward });

  }, 3100);
}

function getCurrentRotation(el) { return 0; }

window.startGameMode = startGameMode;
window.showRoulette = showRoulette;
window.spinRoulette = spinRoulette;
window.startPVP = startPVP;

// Dev Tools
async function handleTesterBtn() {
  const password = prompt("비밀번호를 입력하세요:");
  if (!password) return;

  if (!gameEngine) {
    console.log("Tester Mode: Auto-initializing GameEngine (Keyboard Mode)");
    enableKeyboardMode();
    await init();
  }

  if (!gameEngine) {
    alert("게임 초기화에 실패했습니다.");
    return;
  }

  if (password === '0011') {
    let inputLevel = prompt("이동할 레벨을 입력하세요 (1-15):", "15");
    if (!inputLevel) return;

    const targetLevel = parseInt(inputLevel);
    if (isNaN(targetLevel) || targetLevel < 1) {
      alert("유효하지 않은 레벨입니다.");
      return;
    }

    alert(`비밀번호 확인: 레벨 ${targetLevel}로 이동합니다.`);
    closeRuleModal();

    document.getElementById('roulette-overlay').style.display = 'none';

    if (!gameEngine.isGameActive) {
      gameEngine.devGunMode = true;
    }
    gameEngine.devGunMode = true;

    gameEngine.start({ startLevel: targetLevel });

    gameEngine.maxMisses = 5;
    gameEngine.updateLivesUI();
  } else if (password === '7777') {
    alert("비밀번호 확인: 무한 총 모드 활성화! (W키 사용)");
    gameEngine.devGunMode = true;
  } else {
    alert("비밀번호가 틀렸습니다.");
  }
}
window.handleTesterBtn = handleTesterBtn;

// Rule Modal Logic
let ruleTimerInterval;
let ruleTimeLeft = 20;

window.onload = function () {
  const timerSpan = document.getElementById('rule-timer');
  const modal = document.getElementById('rule-modal');

  ruleTimerInterval = setInterval(() => {
    ruleTimeLeft--;
    if (timerSpan) timerSpan.textContent = ruleTimeLeft;

    if (ruleTimeLeft <= 0) {
      closeRuleModal();
    }
  }, 1000);
};

function closeRuleModal() {
  clearInterval(ruleTimerInterval);
  document.getElementById('rule-modal').style.display = 'none';
}
window.closeRuleModal = closeRuleModal;
