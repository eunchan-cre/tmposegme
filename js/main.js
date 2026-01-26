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

/**
 * 애플리케이션 초기화
 */
async function init() {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");

  startBtn.disabled = true;

  try {
    // 1. PoseEngine 초기화
    poseEngine = new PoseEngine("./my_model/");
    const { maxPredictions, webcam } = await poseEngine.init({
      size: 200,
      flip: true
    });

    // 2. Stabilizer 초기화
    stabilizer = new PredictionStabilizer({
      threshold: 0.7,
      smoothingFrames: 3
    });

    // 3. GameEngine 초기화 (선택적)
    gameEngine = new GameEngine();

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

    stopBtn.disabled = false;
    document.getElementById("gameStartBtn").disabled = false;
  } catch (error) {
    console.error("초기화 중 오류 발생:", error);
    alert("초기화에 실패했습니다. 콘솔을 확인하세요.");
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
  });

  gameEngine.setGameEndCallback((finalScore, finalLevel) => {
    console.log(`게임 종료! 최종 점수: ${finalScore}, 최종 레벨: ${finalLevel}`);
    alert(`게임 종료!\n최종 점수: ${finalScore}\n최종 레벨: ${finalLevel}`);
  });

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

    // 10 Segments
    // 1: 꽝, 2: Gun, 3: Life, 4: 꽝, 5: Gun, 6: Life, 7: 꽝, 8: Gun, 9: Life, 10: 꽝
    // Probabilities: Life (3/10), Gun (3/10), Kkwang (4/10)

    // Random spin angle (at least 3 full spins)
    const extraSpins = 360 * 5;
    const randomAngle = Math.floor(Math.random() * 360);
    const totalRotation = currentRotation + extraSpins + randomAngle;

    const wheel = document.getElementById('roulette-wheel');
    wheel.style.transform = `rotate(${totalRotation}deg)`;
    currentRotation = totalRotation;

    let segmentAngle = totalRotation % 360;
    // Wheel rotates clockwise, so pointer at top interacts with segment at (360 - angle)
    // Segments start at 0deg (3 o'clock? No, standard CSS rotation starts 12 o'clock if structured that way or right)
    // Based on CSS: rotate(calc(36deg * (var(--i) - 1)))
    // i=1 (0deg), i=2 (36deg)... i=10 (324deg)
    // Pointer is at top (0??). Wait, my CSS put pointer at top.

    // Let's rely on simple mapping based on randomAngle logic if we simplify.
    // Actually, let's just calculate which segment 'wins'.
    // 360deg / 10 = 36deg per segment.
    // If rotation is 0, segment 1 is at right? No, usually right.
    // Let's assume standard behavior: 0deg is 12 o'clock if rotated -90deg container, but here simpler.
    // Let's use a simpler logic:
    // We determine the result FIRST, then rotate TO that result.

    // Let's keep the random spin visual, and calculate result from angle.
    // Normalized angle (0-360)
    // We need to account for pointer position. Pointer at Top (Top Center).
    // Zero degrees usually points UP in these CSS implementations if we transform -90 or similar.
    // But here `segment` has `skewY(54deg)` and `rotate`. This suggests standard conic setup.
    // Usually 0deg is at 12 o'clock in conic-gradient if we specified `from 0deg`? 
    // Default conic start 12'o clock? No, usually 12 if `from 0deg` and Up.
    // Standard CSS angles: 0 is Up? No 0 is Right (3 o'clock) usually.
    // Conic gradient: 0deg is Top (12 o'clock).
    // So Segment 1 is 0-36deg (12-1ish).
    // If we rotate wheel by X deg clockwise.
    // The segment passing the TOP pointer is determined by:
    // (360 - (Rotation % 360)) % 360.

    setTimeout(() => {
      isSpinning = false;

      // Calculate Index
      // Pointer is at TOP (0 degrees relative to wheel start if wheel wasn't rotated?)
      // Conic gradient starts at Top.
      // If we rotate wheel 10 degrees Clockwise, the 350-360 part is at Top.
      // So pointer is at Angle: (360 - (totalRotation % 360)) % 360
      const actualAngle = (360 - (totalRotation % 360)) % 360;
      const segmentIndex = Math.floor(actualAngle / 36); // 0-9

      // Map index to reward
      // Order: Kkwang, Gun, Life, Kkwang, Gun, Life, Kkwang, Gun, Life, Kkwang
      // Array: ['꽝', 'Gun', 'Life', '꽝', 'Gun', 'Life', '꽝', 'Gun', 'Life', '꽝']
      const rewards = ['kkwang', 'gun', 'life', 'kkwang', 'gun', 'life', 'kkwang', 'gun', 'life', 'kkwang'];
      const reward = rewards[segmentIndex];

      let msg = "꽝! 아무 효과 없이 시작합니다.";
      if (reward === 'gun') msg = "🔫 10초간 자동 총 발사! (폭탄 파괴)";
      if (reward === 'life') msg = "❤️ 목숨 +1개 획득!";

      alert(msg);

      document.getElementById('roulette-overlay').style.display = 'none';
      startGameMode({ reward: reward });

    }, 3100); // Wait for transition (3s) + buffer
  }

  window.startGameMode = startGameMode;
  window.showRoulette = showRoulette;
  window.spinRoulette = spinRoulette;
