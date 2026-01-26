/**
 * main.js
 * 포즈 인식과 게임 로직을 초기화하고 서로 연결하는 진입점
 *
 * PoseEngine, GameEngine, Stabilizer를 조합하여 애플리케이션을 구동
 */

// 전역 변수
let poseEngine;
let gameEngine;
let stabilizer;
let ctx;
let labelContainer;
let useKeyboard = false; // Flag for keyboard mode

function enableKeyboardMode() {
  useKeyboard = true;
  closeRuleModal();
  document.getElementById("startBtn").textContent = "Keyboard Start";
  document.getElementById("max-prediction").textContent = "키보드 모드 대기 중...";
  alert("키보드 모드가 선택되었습니다.\n\n[조작법]\nA: 왼쪽\nS: 가운데\nD: 오른쪽\nW: 총 사용");
}
window.enableKeyboardMode = enableKeyboardMode;

/**
 * 애플리케이션 초기화
 */
async function init() {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");

  startBtn.disabled = true;

  try {
    const maxPredictionDiv = document.getElementById("max-prediction");

    // 3. GameEngine 초기화 (공통)
    gameEngine = new GameEngine();

    if (useKeyboard) {
      // Keyboard Mode Initialization
      maxPredictionDiv.innerHTML = "키보드 모드 준비 완료!";
      document.getElementById("label-container").innerHTML = "📷 카메라 꺼짐";

      // Skip webcam/pose setup
      poseEngine = null;
      stabilizer = null;

      // Enable Game Start directly
      stopBtn.disabled = false;
      document.getElementById("gameStartBtn").disabled = false;

    } else {
      // Normal Camera Mode Initialization
      maxPredictionDiv.innerHTML = "모델 로딩 중...";

      // 1. PoseEngine 초기화
      poseEngine = new PoseEngine("./my_model/");
      const { maxPredictions, webcam } = await poseEngine.init({
        size: 200,
        flip: true
      });

      maxPredictionDiv.innerHTML = "카메라 시작 중...";

      // 2. Stabilizer 초기화
      stabilizer = new PredictionStabilizer({
        threshold: 0.7,
        smoothingFrames: 3
      });

      // 4. 캔버스 설정
      const canvas = document.getElementById("canvas");
      canvas.width = 200;
      canvas.height = 200;
      ctx = canvas.getContext("2d");

      // 5. Label Container 설정
      labelContainer = document.getElementById("label-container");
      labelContainer.innerHTML = ""; // 초기화
      for (let i = 0; i < maxPredictions; i++) {
        labelContainer.appendChild(document.createElement("div"));
      }

      // 6. PoseEngine 콜백 설정
      poseEngine.setPredictionCallback(handlePrediction);
      poseEngine.setDrawCallback(drawPose);

      // 7. PoseEngine 시작
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
 * @param {Array} predictions - TM 모델의 예측 결과
 * @param {Object} pose - PoseNet 포즈 데이터
 */
function handlePrediction(predictions, pose) {
  // 1. Stabilizer로 예측 안정화
  const stabilized = stabilizer.stabilize(predictions);

  // 2. Label Container 업데이트
  for (let i = 0; i < predictions.length; i++) {
    const classPrediction =
      predictions[i].className + ": " + predictions[i].probability.toFixed(2);
    labelContainer.childNodes[i].innerHTML = classPrediction;
  }

  // 3. 최고 확률 예측 표시
  const maxPredictionDiv = document.getElementById("max-prediction");
  maxPredictionDiv.innerHTML = stabilized.className || "감지 중...";

  // 4. GameEngine에 포즈 전달 (게임 모드일 경우)
  if (gameEngine && gameEngine.isGameActive && stabilized.className) {
    gameEngine.onPoseDetected(stabilized.className);
  }
}

/**
 * 포즈 그리기 콜백
 * @param {Object} pose - PoseNet 포즈 데이터
 */
function drawPose(pose) {
  if (poseEngine.webcam && poseEngine.webcam.canvas) {
    ctx.drawImage(poseEngine.webcam.canvas, 0, 0);

    // 키포인트와 스켈레톤 그리기
    if (pose) {
      const minPartConfidence = 0.5;
      tmPose.drawKeypoints(pose.keypoints, minPartConfidence, ctx);
      tmPose.drawSkeleton(pose.keypoints, minPartConfidence, ctx);
    }
  }
}

// 게임 모드 시작 함수 (선택적 - 향후 확장용)
function startGameMode(config) {
  if (!gameEngine) {
    console.warn("GameEngine이 초기화되지 않았습니다.");
    return;
  }

  gameEngine.setScoreChangeCallback((score, level) => {
    console.log(`점수: ${score}, 레벨: ${level}`);
    // UI 업데이트 로직 추가 가능
    // 게임 종료 시 alert를 여기서 호출하거나, gameEngine에서 별도의 gameEndCallback을 제공하는 것이 좋습니다.
    // 현재 finalScore, finalLevel 변수는 이 스코프에 정의되어 있지 않습니다.
    // alert(`게임 종료!\n최종 점수: ${score}\n최종 레벨: ${level}`);
  });

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

  // Weighted Probabilities: Kkwang 60%, Life 30%, Gun 10%
  // 0~59: Kkwang, 60~89: Life, 90~99: Gun
  const rand = Math.floor(Math.random() * 100);
  let targetType = 'kkwang';
  if (rand >= 90) targetType = 'gun';
  else if (rand >= 60) targetType = 'life';

  // Find matching segments
  // 0:Kwang, 1:Life, 2:Kwang, 3:Life, 4:Kwang, 5:Kwang, 6:Life, 7:Kwang, 8:Kwang, 9:Gun
  const map = {
    'kkwang': [0, 2, 4, 5, 7, 8],
    'life': [1, 3, 6],
    'gun': [9]
  };

  const candidates = map[targetType];
  const segmentIndex = candidates[Math.floor(Math.random() * candidates.length)];

  // Calculate Angle to land on this segment
  // Segment i is at (i*36) ~ (i+1)*36 degrees. Center is i*36 + 18.
  // Pointer is at Top (0 deg visual).
  // To land, we need rotation R such that (R % 360) places segment at Top.
  // If Segment is at Angle A (center), we want final wheel rotation to be (360 - A) (or -A).
  // Let's add multiple full spins (5 * 360).
  // Target Angle relative to wheel 0: centerAngle = segmentIndex * 36 + 18.
  // Wheel Rotation Needed = (360 - centerAngle) + extraSpins.
  // Add small random noise (-10 to +10) for realism

  const extraSpins = 360 * 5;
  const centerAngle = segmentIndex * 36 + 18;
  const noise = Math.floor(Math.random() * 20) - 10;
  const targetRotation = (360 - centerAngle) + extraSpins + noise;

  const wheel = document.getElementById('roulette-wheel');
  // We must accumulate rotation to avoid rewinding
  // Current rotation is tracked? Actually if we just set style it might snap if we don't track.
  // But since we spin once per game usually, handled by global var in previous code?
  // Let's reset style or just set it. A fresh game reload resets JS state usually.
  // But let's assume persistent JS state if single page.

  // Adjust to add to current
  const currentRot = getCurrentRotation(wheel);
  // Just simple: 3600 + target is enough for one spin.
  // Let's use the calculated value.

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

function getCurrentRotation(el) {
  // Helper not strictly needed if we just set new value large enough
  return 0;
}

window.startGameMode = startGameMode;
window.showRoulette = showRoulette;
window.spinRoulette = spinRoulette;

// Rule Modal Logic
let ruleTimerInterval;
let ruleTimeLeft = 20;

window.onload = function () {
  // Show modal, start timer
  const timerSpan = document.getElementById('rule-timer');
  const modal = document.getElementById('rule-modal');

  // Disable camera start behind modal (visual only, z-index covers it)

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
