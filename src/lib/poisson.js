// Thuật toán toán học phân phối Poisson phục vụ dự đoán bóng đá

// Tính giai thừa
function factorial(n) {
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

// Tính xác suất Poisson: P(k; lambda) = (lambda^k * e^-lambda) / k!
function calculatePoissonProbability(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Tính toán xác suất tỉ số và kết quả trận đấu bằng phân phối Poisson
 * @param {Object} homeStats - Chỉ số đội nhà { avg_goals_scored, avg_goals_conceded }
 * @param {Object} awayStats - Chỉ số đội khách { avg_goals_scored, avg_goals_conceded }
 * @param {boolean} isHomeAdvantage - Có lợi thế sân nhà thực tế hay không (ví dụ Mexico/Canada/USA đá trên nước họ)
 */
export function calculateMatchPoisson(homeStats, awayStats, isHomeAdvantage = false) {
  // Lấy các chỉ số bàn thắng/thua trung bình mặc định nếu thiếu
  const homeScored = homeStats.avg_goals_scored ?? 1.5;
  const homeConceded = homeStats.avg_goals_conceded ?? 1.1;
  const awayScored = awayStats.avg_goals_scored ?? 1.3;
  const awayConceded = awayStats.avg_goals_conceded ?? 1.2;

  // Tính số bàn thắng kỳ vọng (xG) cơ bản
  let lambdaHome = (homeScored + awayConceded) / 2;
  let lambdaAway = (awayScored + homeConceded) / 2;

  // Áp dụng hệ số sân nhà nếu có lợi thế thực tế
  if (isHomeAdvantage) {
    lambdaHome += 0.3;
    lambdaAway = Math.max(0.2, lambdaAway - 0.1);
  }

  // Đảm bảo xG tối thiểu là 0.1 để tránh lỗi chia/mũ
  lambdaHome = Math.max(0.1, lambdaHome);
  lambdaAway = Math.max(0.1, lambdaAway);

  // Tính toán ma trận tỉ số (giới hạn tối đa 5 bàn mỗi đội)
  const maxGoals = 5;
  let probHomeWin = 0;
  let probDraw = 0;
  let probAwayWin = 0;
  
  let probUnder25 = 0;
  let probOver25 = 0;

  const scoreMatrix = [];

  for (let h = 0; h <= maxGoals; h++) {
    const pHome = calculatePoissonProbability(h, lambdaHome);
    scoreMatrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const pAway = calculatePoissonProbability(a, lambdaAway);
      const pScore = pHome * pAway;
      
      scoreMatrix[h][a] = pScore;

      // Cộng dồn xác suất kết quả
      if (h > a) {
        probHomeWin += pScore;
      } else if (h === a) {
        probDraw += pScore;
      } else {
        probAwayWin += pScore;
      }

      // Cộng dồn xác suất Tài Xỉu
      if (h + a <= 2) {
        probUnder25 += pScore;
      } else {
        probOver25 += pScore;
      }
    }
  }

  // Chuẩn hóa (Normalize) xác suất 1X2 để tổng bằng 100%
  const total1X2 = probHomeWin + probDraw + probAwayWin;
  const winProbability = {
    home: Math.round((probHomeWin / total1X2) * 100),
    draw: Math.round((probDraw / total1X2) * 100),
    away: Math.round((probAwayWin / total1X2) * 100)
  };

  // Đảm bảo tổng phần trăm tròn đúng 100
  const diff = 100 - (winProbability.home + winProbability.draw + winProbability.away);
  if (diff !== 0) {
    // Cộng sai lệch vào bên có xác suất cao nhất
    if (winProbability.home >= winProbability.away && winProbability.home >= winProbability.draw) {
      winProbability.home += diff;
    } else if (winProbability.away >= winProbability.home && winProbability.away >= winProbability.draw) {
      winProbability.away += diff;
    } else {
      winProbability.draw += diff;
    }
  }

  // Chuẩn hóa tỷ lệ Tài Xỉu 2.5
  const totalOU = probUnder25 + probOver25;
  const ouProbability = {
    under: Math.round((probUnder25 / totalOU) * 100),
    over: Math.round((probOver25 / totalOU) * 100)
  };

  const diffOU = 100 - (ouProbability.under + ouProbability.over);
  if (diffOU !== 0) {
    if (ouProbability.over >= ouProbability.under) {
      ouProbability.over += diffOU;
    } else {
      ouProbability.under += diffOU;
    }
  }

  // Lấy ra tỷ số có xác suất xuất hiện cao nhất trong ma trận
  let maxProb = -1;
  let predictedHomeScore = 1;
  let predictedAwayScore = 1;

  for (let h = 0; h <= 3; h++) { // Giới hạn dự đoán tỉ số phổ biến đến 3 bàn để thực tế hơn
    for (let a = 0; a <= 3; a++) {
      if (scoreMatrix[h][a] > maxProb) {
        maxProb = scoreMatrix[h][a];
        predictedHomeScore = h;
        predictedAwayScore = a;
      }
    }
  }

  return {
    expectedGoals: {
      home: parseFloat(lambdaHome.toFixed(2)),
      away: parseFloat(lambdaAway.toFixed(2))
    },
    winProbability,
    ouProbability,
    predictedScore: {
      home: predictedHomeScore,
      away: predictedAwayScore
    }
  };
}

// Sinh số ngẫu nhiên theo phân phối Poisson (Thuật toán Knuth)
function getPoissonRandom(lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/**
 * Mô phỏng Monte Carlo 10,000 lần để dự báo xác suất và tỉ số dựa trên Poisson
 * @param {Object} homeStats - Chỉ số đội nhà { avg_goals_scored, avg_goals_conceded }
 * @param {Object} awayStats - Chỉ số đội khách { avg_goals_scored, avg_goals_conceded }
 * @param {boolean} isHomeAdvantage - Có lợi thế sân nhà thực tế hay không
 * @param {number} iterations - Số lần mô phỏng (mặc định 10,000)
 */
export function runMonteCarloSimulation(homeStats, awayStats, isHomeAdvantage = false, iterations = 10000) {
  const homeScored = homeStats.avg_goals_scored ?? 1.5;
  const homeConceded = homeStats.avg_goals_conceded ?? 1.1;
  const awayScored = awayStats.avg_goals_scored ?? 1.3;
  const awayConceded = awayStats.avg_goals_conceded ?? 1.2;

  // Tính số bàn thắng kỳ vọng (xG) cơ bản
  let lambdaHome = (homeScored + awayConceded) / 2;
  let lambdaAway = (awayScored + homeConceded) / 2;

  // Áp dụng hệ số sân nhà nếu có lợi thế thực tế
  if (isHomeAdvantage) {
    lambdaHome += 0.3;
    lambdaAway = Math.max(0.2, lambdaAway - 0.1);
  }

  // Đảm bảo xG tối thiểu
  lambdaHome = Math.max(0.1, lambdaHome);
  lambdaAway = Math.max(0.1, lambdaAway);

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  
  let totalOver25 = 0;
  let totalUnder25 = 0;
  let bttsCount = 0;

  const scoreCounts = {};

  for (let i = 0; i < iterations; i++) {
    const hGoals = getPoissonRandom(lambdaHome);
    const aGoals = getPoissonRandom(lambdaAway);

    if (hGoals > aGoals) {
      homeWins++;
    } else if (hGoals === aGoals) {
      draws++;
    } else {
      awayWins++;
    }

    if (hGoals + aGoals > 2.5) {
      totalOver25++;
    } else {
      totalUnder25++;
    }

    if (hGoals > 0 && aGoals > 0) {
      bttsCount++;
    }

    const scoreKey = `${Math.min(hGoals, 9)}-${Math.min(aGoals, 9)}`;
    scoreCounts[scoreKey] = (scoreCounts[scoreKey] || 0) + 1;
  }

  // Chuyển đổi scoreCounts thành mảng để lấy top 5 tỉ số có xác suất cao nhất
  const topScores = Object.entries(scoreCounts)
    .map(([score, count]) => ({
      score,
      probability: parseFloat(((count / iterations) * 100).toFixed(1))
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  const winProbability = {
    home: parseFloat(((homeWins / iterations) * 100).toFixed(1)),
    draw: parseFloat(((draws / iterations) * 100).toFixed(1)),
    away: parseFloat(((awayWins / iterations) * 100).toFixed(1))
  };

  // Chuẩn hóa tổng phần trăm tròn đúng 100%
  const totalProb = winProbability.home + winProbability.draw + winProbability.away;
  if (Math.abs(totalProb - 100) > 0.01) {
    const diff = parseFloat((100 - totalProb).toFixed(1));
    if (winProbability.home >= winProbability.away && winProbability.home >= winProbability.draw) {
      winProbability.home = parseFloat((winProbability.home + diff).toFixed(1));
    } else if (winProbability.away >= winProbability.home && winProbability.away >= winProbability.draw) {
      winProbability.away = parseFloat((winProbability.away + diff).toFixed(1));
    } else {
      winProbability.draw = parseFloat((winProbability.draw + diff).toFixed(1));
    }
  }

  const ouProbability = {
    over: parseFloat(((totalOver25 / iterations) * 100).toFixed(1)),
    under: parseFloat(((totalUnder25 / iterations) * 100).toFixed(1))
  };
  
  const totalOUProb = ouProbability.over + ouProbability.under;
  if (Math.abs(totalOUProb - 100) > 0.01) {
    const diffOU = parseFloat((100 - totalOUProb).toFixed(1));
    ouProbability.over = parseFloat((ouProbability.over + diffOU).toFixed(1));
  }

  return {
    winProbability,
    ouProbability,
    bttsProbability: parseFloat(((bttsCount / iterations) * 100).toFixed(1)),
    topScores,
    simulationsCount: iterations
  };
}

