/**
 * Hybrid Machine Learning & Mathematical Baseline for Football Predictions
 * Triển khai thuật toán Logistic Regression và Mô hình Poisson/Naive Bayes bằng JS thuần
 */

// Helper: Chuyển chuỗi phong độ gần đây thành điểm số
function getFormPoints(formStr) {
  if (!formStr) return 5; // Mặc định trung bình (5 trận hòa hoặc tương đương)
  const games = formStr.split(',').map(s => s.trim().toUpperCase());
  let points = 0;
  games.forEach(g => {
    if (g === 'W') points += 3;
    else if (g === 'D') points += 1;
  });
  return points;
}

/**
 * Tính toán xác suất ML Baseline dựa trên Logistic Regression và Poisson
 * @param {Object} homeStats 
 * @param {Object} awayStats 
 * @param {boolean} isHomeAdvantage 
 */
export function calculateMLBaseline(homeStats, awayStats, isHomeAdvantage) {
  const homeElo = homeStats.elo_rating ?? 1600;
  const awayElo = awayStats.elo_rating ?? 1600;
  const homeRank = homeStats.fifa_rank ?? 50;
  const awayRank = awayStats.fifa_rank ?? 50;
  
  const homeFormPoints = getFormPoints(homeStats.recent_form);
  const awayFormPoints = getFormPoints(awayStats.recent_form);
  
  const homeAvgGoalsScored = homeStats.avg_goals_scored ?? 1.2;
  const homeAvgGoalsConceded = homeStats.avg_goals_conceded ?? 1.2;
  const awayAvgGoalsScored = awayStats.avg_goals_scored ?? 1.2;
  const awayAvgGoalsConceded = awayStats.avg_goals_conceded ?? 1.2;

  // 1. Tính toán chênh lệch (Features)
  const eloDiff = homeElo - awayElo + (isHomeAdvantage ? 50 : 0);
  const rankDiff = awayRank - homeRank; // Hạng thấp tốt hơn, nên lấy Away - Home
  const formDiff = homeFormPoints - awayFormPoints;
  const expectedGoalsDiff = (homeAvgGoalsScored - awayAvgGoalsConceded) - (awayAvgGoalsScored - homeAvgGoalsConceded);

  // 2. Tính toán Logits cho Multinomial Logistic Regression (được cân chỉnh tối ưu cho dự đoán bóng đá)
  // b_home = 0.15, w_elo = 0.0025, w_rank = 0.005, w_form = 0.03, w_goals = 0.15
  const logitHome = 0.15 + (0.0025 * eloDiff) + (0.005 * rankDiff) + (0.03 * formDiff) + (0.15 * expectedGoalsDiff);
  
  // b_away = -0.15, đối nghịch các hệ số
  const logitAway = -0.15 - (0.0025 * eloDiff) - (0.005 * rankDiff) - (0.03 * formDiff) - (0.15 * expectedGoalsDiff);
  
  // Danh mục tham chiếu: Draw (logit = 0.0)
  const logitDraw = 0.0;

  // 3. Sử dụng hàm Softmax để tính xác suất
  const expHome = Math.exp(logitHome);
  const expAway = Math.exp(logitAway);
  const expDraw = Math.exp(logitDraw);
  const sumExp = expHome + expAway + expDraw;

  const probHome = expHome / sumExp;
  const probAway = expAway / sumExp;
  const probDraw = expDraw / sumExp;

  // Chuyển thành tỷ lệ % nguyên, đảm bảo tổng bằng 100%
  let pctHome = Math.round(probHome * 100);
  let pctDraw = Math.round(probDraw * 100);
  let pctAway = 100 - pctHome - pctDraw; // Đảm bảo tổng = 100

  // 4. Ước tính bàn thắng kỳ vọng (Expected Goals xG) sử dụng Poisson Baseline
  let lambdaHome = homeAvgGoalsScored * (awayAvgGoalsConceded / 1.2);
  let lambdaAway = awayAvgGoalsScored * (homeAvgGoalsConceded / 1.2);

  if (isHomeAdvantage) {
    lambdaHome *= 1.10;
    lambdaAway *= 0.90;
  }

  // Giới hạn xG tối thiểu để tránh bất thường
  lambdaHome = Math.max(0.2, lambdaHome);
  lambdaAway = Math.max(0.2, lambdaAway);

  const totalExpectedGoals = lambdaHome + lambdaAway;

  // 5. Xác suất kèo Tài Xỉu 2.5 (Poisson: P(X >= 3) = 1 - P(0) - P(1) - P(2))
  const p0 = Math.exp(-totalExpectedGoals);
  const p1 = totalExpectedGoals * p0;
  const p2 = (Math.pow(totalExpectedGoals, 2) / 2) * p0;
  const probUnder = p0 + p1 + p2;
  const probOver = 1 - probUnder;

  const pctOver = Math.round(probOver * 100);
  const pctUnder = 100 - pctOver;

  // 6. Xác suất BTTS (Cả 2 đội ghi bàn): P(BTTS) = (1 - P_home(0)) * (1 - P_away(0))
  const pHome0 = Math.exp(-lambdaHome);
  const pAway0 = Math.exp(-lambdaAway);
  const probBTTS = (1 - pHome0) * (1 - pAway0);
  const pctBTTS = Math.round(probBTTS * 100);

  return {
    winProbability: {
      home: pctHome,
      draw: pctDraw,
      away: pctAway
    },
    expectedGoals: {
      home: parseFloat(lambdaHome.toFixed(2)),
      away: parseFloat(lambdaAway.toFixed(2)),
      total: parseFloat(totalExpectedGoals.toFixed(2))
    },
    overUnder25: {
      over: pctOver,
      under: pctUnder
    },
    btts: {
      yes: pctBTTS,
      no: 100 - pctBTTS
    }
  };
}
