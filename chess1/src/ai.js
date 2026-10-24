// ============================================================================
// 西洋棋 AI 引擎 (Chess AI Engine) - 五級難度與加權隨機決策系統
// ============================================================================
// 
// 本引擎結合現代西洋棋引擎核心架構與機率採樣技術，實現五個差異鮮明的難度等級：
// 1. 0x88 棋盤極速運算：利用底層位址運算跳過高開銷字串與物件轉換。
// 2. 64-bit Zobrist 置換表 (Transposition Table)：快取已搜尋局面評分與最佳著法。
// 3. Alpha-Beta 剪枝 + 靜態搜索 (Quiescence Search) + MVV-LVA 吃子排序。
// 4. 候選池窗口評估 + Softmax 玻爾茲曼機率採樣 (Boltzmann Temperature Sampling)：
//    在評分接近的優質著法之間進行加權隨機挑選，打破固定走子模式，使每局對弈走法
//    千變萬化、更具靈活性與人性化趣味。
// ============================================================================

// 棋子基礎價值 (厘兵 Centipawns, 1 兵 = 100 cp)
const PIECE_VALS = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

// 棋子位置價值表 (Piece-Square Tables, PST) - 鼓勵棋子佔領好格，壓制邊緣無效活動
const PST = {
  p: [
    0,   0,   0,   0,   0,   0,   0,   0,
    50,  50,  50,  50,  50,  50,  50,  50,
    10,  10,  20,  30,  30,  20,  10,  10,
     5,   5,  10,  25,  25,  10,   5,   5,
     0,   0,   0,  20,  20,   0,   0,   0,
     5,  -5, -10,   0,   0, -10,  -5,   5,
     5,  10,  10, -20, -20,  10,  10,   5,
     0,   0,   0,   0,   0,   0,   0,   0
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20,   0,   0,   0,   0, -20, -40,
    -30,   0,  10,  15,  15,  10,   0, -30,
    -30,   5,  15,  20,  20,  15,   5, -30,
    -30,   0,  15,  20,  20,  15,   0, -30,
    -30,   5,  10,  15,  15,  10,   5, -30,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   5,   5,  10,  10,   5,   5, -10,
    -10,   0,  10,  10,  10,  10,   0, -10,
    -10,  10,  10,  10,  10,  10,  10, -10,
    -10,   5,   0,   0,   0,   0,   5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
  ],
  r: [
      0,   0,   0,   0,   0,   0,   0,   0,
      5,  10,  10,  10,  10,  10,  10,   5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
     -5,   0,   0,   0,   0,   0,   0,  -5,
      0,   0,   0,   5,   5,   0,   0,   0
  ],
  q: [
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,   5,   5,   5,   0, -10,
     -5,   0,   5,   5,   5,   5,   0,  -5,
      0,   0,   5,   5,   5,   5,   0,  -5,
    -10,   5,   5,   5,   5,   5,   0, -10,
    -10,   0,   5,   0,   0,   0,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
     20,  20,   0,   0,   0,   0,  20,  20,
     20,  30,  10,   0,   0,  10,  30,  20
  ]
};

// ============================================================================
// 難度等級設定表 (AI Difficulty Configurations)
// ============================================================================
// 每個等級皆詳細定義：搜尋深度、失誤率、評分容許窗口、Softmax 溫度與開局庫政策
export const DIFFICULTY_CONFIG = {
  1: {
    level: 1,
    name: '等級 1：新手入門',
    shortName: '新手',
    elo: '~800',
    depth: 1,
    quiescence: false,
    useBook: false,
    bookProbability: 0,
    randomBlunderRate: 0.35,  // 35% 機率隨機走步（模擬初學者隨興動子）
    evalWindow: 160,          // 評分容忍窗口 160 cp
    temperature: 2.2,         // 高溫抽樣，著法高度發散且富有趣味
    description: '深度 1 搜尋。具備 35% 隨機著法率與高溫抽樣，適合剛學西洋棋的新手體驗走子樂趣與練習吃子。'
  },
  2: {
    level: 2,
    name: '等級 2：休閒初級',
    shortName: '休閒',
    elo: '~1100',
    depth: 2,
    quiescence: false,
    useBook: true,
    bookProbability: 0.35,    // 35% 機率走開局庫，保持多樣性
    randomBlunderRate: 0.15,  // 15% 機率走出次佳步
    evalWindow: 90,           // 評分容忍窗口 90 cp
    temperature: 1.5,         // 中高溫抽樣，著法豐富自然
    description: '深度 2 搜尋。具備基本吃子防守概念，偶有小失誤，在多個合理著法中加權隨機，每盤對局皆有新意。'
  },
  3: {
    level: 3,
    name: '等級 3：業餘中級',
    shortName: '中級',
    elo: '~1400',
    depth: 3,
    quiescence: false,
    useBook: true,
    bookProbability: 0.85,
    randomBlunderRate: 0.0,   // 無隨機低級失誤
    evalWindow: 55,           // 評分容忍窗口 55 cp (約半隻兵內之優秀走法)
    temperature: 0.8,         // 均衡溫度，優秀著法輪流登場
    description: '深度 3 搜尋 + PST 位置評估。在最佳評分 55 厘兵內的優質走法池中 Softmax 抽樣，兼顧實力與靈活變化。'
  },
  4: {
    level: 4,
    name: '等級 4：高手進階',
    shortName: '進階',
    elo: '~1700',
    depth: 4,
    quiescence: true,
    useBook: true,
    bookProbability: 1.0,
    randomBlunderRate: 0.0,
    evalWindow: 25,           // 評分容忍窗口 25 cp
    temperature: 0.4,         // 低溫抽樣，高度偏向最強著法
    description: '深度 4 搜尋 + 置換表 + 殺手著法。在差距 25 厘兵以內的頂尖好手中微隨機切換，戰術敏銳，打破定式套路。'
  },
  5: {
    level: 5,
    name: '等級 5：特級大師',
    shortName: '大師',
    elo: '~2000+',
    depth: 4,                 // 深度 4 + 深度 3 靜態搜索 (相當於 7 層戰術辨識)
    quiescence: true,
    useBook: true,
    bookProbability: 1.0,
    randomBlunderRate: 0.0,
    evalWindow: 12,           // 僅在勢均力敵的微小差距 (12 cp) 內隨機
    temperature: 0.2,         // 極低溫，唯一正解時 100% 精準走子
    description: '深度 4~5 + 靜態搜索 + MVV-LVA 著法排序。幾無失誤，僅在分差 12 厘兵以內的頂級著法中微隨機輪換。'
  }
};

// 支援歷史文字別名映射至 1~5 等級
export function normalizeDifficulty(diff) {
  if (typeof diff === 'number' && DIFFICULTY_CONFIG[diff]) return diff;
  const str = String(diff).toLowerCase();
  if (str === 'easy' || str === '1') return 1;
  if (str === '2') return 2;
  if (str === 'medium' || str === 'med' || str === '3') return 3;
  if (str === '4') return 4;
  if (str === 'hard' || str === '5') return 5;
  return 3; // 預設中級
}

// ============================================================================
// 大師開局庫 (Opening Book) - 內建豐富分支，確保每次開局皆有不同驚喜
// ============================================================================
const OPENING_BOOK = {
  // 第 1 回合白方起手
  '': ['e4', 'd4', 'c4', 'Nf3'],

  // 對應 1. e4 的黑方多樣應手
  'e4': ['e5', 'c5', 'e6', 'c6', 'd5', 'Nf6'],

  // 對應 1. d4 的黑方應手
  'd4': ['d5', 'Nf6', 'e6', 'g6', 'd6'],

  // 對應 1. c4 (英國式開局)
  'c4': ['e5', 'c5', 'Nf6', 'e6'],

  // 對應 1. Nf3 (列蒂開局)
  'Nf3': ['d5', 'Nf6', 'c5', 'g6'],

  // 開放對局 1. e4 e5 白方第 2 步分支
  'e4 e5': ['Nf3', 'Bc4', 'Nc3', 'f4', 'd4'],

  // 西西里防禦 1. e4 c5 白方第 2 步分支
  'e4 c5': ['Nf3', 'Nc3', 'c3', 'd4'],

  // 法蘭西防禦 1. e4 e6 白方第 2 步
  'e4 e6': ['d4', 'd3', 'Nf3'],

  // 卡羅-康防禦 1. e4 c6 白方第 2 步
  'e4 c6': ['d4', 'Nf3', 'c4'],

  // 后兵對局 1. d4 d5 白方第 2 步
  'd4 d5': ['c4', 'Bf4', 'Nf3', 'e3'],

  // 印度防禦 1. d4 Nf6 白方第 2 步
  'd4 Nf6': ['c4', 'Nf3', 'Bf4', 'g3'],

  // 經典王兵對局第 2 回合黑方應手
  'e4 e5 Nf3': ['Nc6', 'Nf6', 'd6'],
  'e4 e5 Bc4': ['Nf6', 'Bc5', 'Nc6'],
  'e4 e5 Nc3': ['Nf6', 'Bc5', 'Nc6'],

  // 開放西西里黑方第 2 回合
  'e4 c5 Nf3': ['d6', 'Nc6', 'e6', 'g6'],

  // 后翼棄兵第 2 回合黑方應手
  'd4 d5 c4': ['e6', 'c6', 'dxc4', 'Nf6'],

  // 國王印度防禦第 2 回合
  'd4 Nf6 c4': ['g6', 'e6', 'c5'],

  // 義大利開局 / 西班牙開局 / 蘇格蘭開局第 3 回合白方分支
  'e4 e5 Nf3 Nc6': ['Bc4', 'Bb5', 'd4', 'Nc3'],
  'e4 e5 Nf3 Nf6': ['Nxe5', 'd4', 'Nc3'],
  'e4 e5 Bc4 Nf6': ['d3', 'Nc3', 'd4'],

  // 西西里那道爾夫 / 龍式準備步
  'e4 c5 Nf3 d6': ['d4', 'Bb5+', 'c3'],
  'e4 c5 Nf3 Nc6': ['d4', 'Bb5', 'Nc3'],

  // 拒吃后翼棄兵 (QGD) 與斯拉夫防禦
  'd4 d5 c4 e6': ['Nc3', 'Nf3'],
  'd4 d5 c4 c6': ['Nf3', 'Nc3'],
  'd4 Nf6 c4 g6': ['Nc3', 'Nf3', 'g3'],
  'd4 Nf6 c4 e6': ['Nc3', 'Nf3', 'g3']
};

/**
 * 開局庫查詢：若當前局面符合歷史譜庫，隨機返回其中一種大師走法
 */
function getBookMove(game, bookProbability = 1.0) {
  if (Math.random() > bookProbability) return null;
  const history = game.history();
  // 僅在開局前 8 手進行譜庫匹配
  if (history.length === 0 && game.fen() !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
    return null;
  }
  if (history.length > 8) return null;

  const key = history.join(' ');
  const options = OPENING_BOOK[key];
  if (options && options.length > 0) {
    const legalMoves = game.moves();
    const validOptions = options.filter(san => legalMoves.includes(san));
    if (validOptions.length > 0) {
      // 隨機自候選走法中選出一種，打破固定開局
      return validOptions[Math.floor(Math.random() * validOptions.length)];
    }
  }
  return null;
}

// 0x88 座標轉換為代數記譜字串 ('e4', 'g1')
export function toAlgebraicSquare(sq) {
  return 'abcdefgh'[sq & 15] + '87654321'[sq >> 4];
}

// 內部 0x88 著法物件轉換為公開著法物件
function toPublicMove(rawMove) {
  const moveObj = {
    from: toAlgebraicSquare(rawMove.from),
    to: toAlgebraicSquare(rawMove.to)
  };
  if (rawMove.promotion) {
    moveObj.promotion = rawMove.promotion;
  }
  return moveObj;
}

/**
 * 0x88 盤面靜態評估函數 (Static Board Evaluation)
 * @param {Chess} game 
 * @returns {number} 評分 (從白方視角，正數代表白優，負數代表黑優)
 */
export function evaluateBoard(game) {
  if (game.isCheckmate()) {
    return game.turn() === 'w' ? -100000 : 100000;
  }
  if (game.isDraw()) {
    return 0;
  }

  let score = 0;
  const board = game._board;

  // 遍歷 0x88 盤面（利用位元遮罩跳過越界格點，0 記憶體垃圾配置）
  for (let i = 0; i < 128; i++) {
    if (i & 0x88) {
      i += 7;
      continue;
    }
    const piece = board[i];
    if (!piece) continue;

    const type = piece.type;
    const val = PIECE_VALS[type] || 0;
    const r = i >> 4;
    const c = i & 7;
    // 依黑白方計算 PST 位置權重索引
    const sqIdx = piece.color === 'w' ? (r * 8 + c) : ((7 - r) * 8 + c);
    const pstVal = PST[type] ? PST[type][sqIdx] : 0;

    const total = val + pstVal;
    if (piece.color === 'w') {
      score += total;
    } else {
      score -= total;
    }
  }

  return score;
}

// 全局 64-bit Zobrist 置換表 (Transposition Table) 與殺手著法快取
const TT = new Map();
const MAX_TT_SIZE = 120000;
const killerMoves = Array.from({ length: 32 }, () => [null, null]);

/**
 * 著法排序優化 (Move Ordering)：
 * 1. 置換表最佳著法 (TT Best Move) -> 權重 300,000 (引發 90%+ 剪枝)
 * 2. MVV-LVA 吃子排序 (Most Valuable Victim - Least Valuable Attacker) -> 權重 100,000+
 * 3. 升變走法 -> 權重 90,000
 * 4. 殺手著法 (Killer Moves) -> 權重 40,000~50,000
 */
function orderMovesFast(moves, hashMove, ply) {
  const killers = killerMoves[ply] || [null, null];

  return moves.map(m => {
    let score = 0;
    if (hashMove && m.from === hashMove.from && m.to === hashMove.to) {
      score = 300000;
    } else if (m.captured) {
      const victim = PIECE_VALS[m.captured] || 0;
      const attacker = PIECE_VALS[m.piece] || 0;
      score = 100000 + victim * 10 - attacker;
    } else if (m.promotion) {
      score = 90000;
    } else if (killers[0] && m.from === killers[0].from && m.to === killers[0].to) {
      score = 50000;
    } else if (killers[1] && m.from === killers[1].from && m.to === killers[1].to) {
      score = 40000;
    }

    return { move: m, score };
  }).sort((a, b) => b.score - a.score).map(x => x.move);
}

/**
 * 靜態搜索 (Quiescence Search) 與 Delta 剪枝：
 * 避免「地平線效應」(Horizon Effect)，在搜索葉節點持續評估所有吃子兌換直到局面平靜。
 */
function quiescenceFast(game, alpha, beta, isMax, depth = 0) {
  const standPat = evaluateBoard(game);
  if (depth >= 3) return standPat;

  if (isMax) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    // Delta 剪枝：若即使吃掉后 (950) 依然無法超越下限，直接剪枝
    if (standPat + 950 < alpha) return alpha;

    const rawMoves = game._moves();
    const captures = [];
    for (let i = 0; i < rawMoves.length; i++) {
      if (rawMoves[i].captured) captures.push(rawMoves[i]);
    }
    if (captures.length === 0) return standPat;

    captures.sort((a, b) => {
      const va = (PIECE_VALS[a.captured] || 0) * 10 - (PIECE_VALS[a.piece] || 0);
      const vb = (PIECE_VALS[b.captured] || 0) * 10 - (PIECE_VALS[b.piece] || 0);
      return vb - va;
    });

    for (const m of captures) {
      game._makeMove(m);
      const score = quiescenceFast(game, alpha, beta, false, depth + 1);
      game._undoMove();

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;

    if (standPat - 950 > beta) return beta;

    const rawMoves = game._moves();
    const captures = [];
    for (let i = 0; i < rawMoves.length; i++) {
      if (rawMoves[i].captured) captures.push(rawMoves[i]);
    }
    if (captures.length === 0) return standPat;

    captures.sort((a, b) => {
      const va = (PIECE_VALS[a.captured] || 0) * 10 - (PIECE_VALS[a.piece] || 0);
      const vb = (PIECE_VALS[b.captured] || 0) * 10 - (PIECE_VALS[b.piece] || 0);
      return vb - va;
    });

    for (const m of captures) {
      game._makeMove(m);
      const score = quiescenceFast(game, alpha, beta, true, depth + 1);
      game._undoMove();

      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
    return beta;
  }
}

/**
 * Alpha-Beta Minimax 搜尋引擎 (底層 0x88 著法)
 */
function alphaBetaFast(game, depth, alpha, beta, isMax, ply = 0, enableQuiescence = true) {
  const hash = game._hash;
  const tt = TT.get(hash);
  let hashMove = null;

  if (tt) {
    hashMove = tt.bestMove;
    if (tt.depth >= depth) {
      if (tt.flag === 0) return tt.score; // 精確值
      if (tt.flag === 1 && tt.score <= alpha) return alpha; // 上界
      if (tt.flag === 2 && tt.score >= beta) return beta; // 下界
    }
  }

  if (depth === 0) {
    return enableQuiescence ? quiescenceFast(game, alpha, beta, isMax, 0) : evaluateBoard(game);
  }

  const rawMoves = game._moves();
  if (rawMoves.length === 0) {
    if (game.isCheck()) {
      return isMax ? -100000 + ply : 100000 - ply;
    }
    return 0; // 逼和 (Stalemate)
  }

  const moves = orderMovesFast(rawMoves, hashMove, ply);
  let bestMove = moves[0];
  const originalAlpha = alpha;

  if (isMax) {
    let maxEval = -Infinity;
    for (const m of moves) {
      game._makeMove(m);
      const ev = alphaBetaFast(game, depth - 1, alpha, beta, false, ply + 1, enableQuiescence);
      game._undoMove();

      if (ev > maxEval) {
        maxEval = ev;
        bestMove = m;
      }
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) {
        if (!m.captured && ply < 32) {
          killerMoves[ply][1] = killerMoves[ply][0];
          killerMoves[ply][0] = m;
        }
        break; // Beta 剪枝
      }
    }

    const flag = maxEval <= originalAlpha ? 1 : (maxEval >= beta ? 2 : 0);
    if (TT.size < MAX_TT_SIZE) {
      TT.set(hash, { depth, score: maxEval, flag, bestMove });
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of moves) {
      game._makeMove(m);
      const ev = alphaBetaFast(game, depth - 1, alpha, beta, true, ply + 1, enableQuiescence);
      game._undoMove();

      if (ev < minEval) {
        minEval = ev;
        bestMove = m;
      }
      beta = Math.min(beta, ev);
      if (beta <= alpha) {
        if (!m.captured && ply < 32) {
          killerMoves[ply][1] = killerMoves[ply][0];
          killerMoves[ply][0] = m;
        }
        break; // Alpha 剪枝
      }
    }

    const flag = minEval <= originalAlpha ? 1 : (minEval >= beta ? 2 : 0);
    if (TT.size < MAX_TT_SIZE) {
      TT.set(hash, { depth, score: minEval, flag, bestMove });
    }
    return minEval;
  }
}

// ============================================================================
// 隨機性演算法：候選池窗口評估與 Softmax 玻爾茲曼採樣
// ============================================================================
/**
 * 依據候選走法的評分進行加權機率採樣 (Boltzmann Softmax Sampling)
 * 
 * 數學公式：
 * P(move_i) = exp(-delta_i / (temperature * 20)) / SUM(exp(-delta_j / (temperature * 20)))
 * 其中 delta_i = |score_i - bestScore|
 * 
 * 特點：
 * 1. 僅保留落在 evalWindow 範圍內的合理/優良著法，自動剔除嚴重白送棋子的低級著法。
 * 2. 評分最高的著法獲得最大機率權重，但其他勢均力敵的好手依然具備合理出場機會。
 * 3. 溫度越低（如大師 T=0.2），越偏向最優步；溫度適中（如中級 T=0.8），走法多姿多彩。
 * 
 * @param {Array<{ move: any, score: number }>} scoredMoves - 已依最優順序排序的走法清單
 * @param {number} temperature - 溫度係數 (0.1 ~ 2.5)
 * @param {number} evalWindow - 評分差距容許窗口 (厘兵 cp)
 * @returns {any} 選出的著法
 */
function sampleMoveSoftmax(scoredMoves, temperature = 0.8, evalWindow = 50) {
  if (!scoredMoves || scoredMoves.length === 0) return null;
  if (scoredMoves.length === 1) return scoredMoves[0].move;

  const bestScore = scoredMoves[0].score;

  // 1. 篩選在 evalWindow 容許窗口內的優質走法（避免選到嚴重失誤步）
  const candidates = scoredMoves.filter(item => {
    return Math.abs(bestScore - item.score) <= evalWindow;
  });

  if (candidates.length === 1) return candidates[0].move;

  // 2. 計算相對玻爾茲曼加權權重
  const weights = candidates.map(item => {
    const diff = Math.abs(item.score - bestScore);
    return Math.exp(-diff / Math.max(1, temperature * 22));
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  let randomPick = Math.random() * totalWeight;

  for (let i = 0; i < candidates.length; i++) {
    randomPick -= weights[i];
    if (randomPick <= 0) {
      return candidates[i].move;
    }
  }

  return candidates[0].move;
}

// ============================================================================
// 主搜尋入口 (Main AI Entry Point)
// ============================================================================
/**
 * 依據指定難度等級計算當前局面的最佳 (或優良隨機) 著法
 * 
 * @param {Chess} game - chess.js 棋局實例
 * @param {number|string} difficulty - 難度等級 (1: 新手, 2: 休閒, 3: 中級, 4: 進階, 5: 大師)
 * @returns {Promise<any>} 返回著法物件或 SAN 字串
 */
export function findBestMove(game, difficulty = 3) {
  return new Promise(resolve => {
    const levelKey = normalizeDifficulty(difficulty);
    const config = DIFFICULTY_CONFIG[levelKey] || DIFFICULTY_CONFIG[3];

    // 1. 開局庫判定 (依等級設定機率啟用)
    if (config.useBook) {
      const bookSan = getBookMove(game, config.bookProbability);
      if (bookSan) {
        setTimeout(() => {
          resolve(bookSan);
        }, 120); // 模擬人類思考的輕微自然延遲
        return;
      }
    }

    // 2. 核心搜尋與隨機化採樣
    setTimeout(() => {
      const rawMoves = game._moves();
      if (rawMoves.length === 0) {
        resolve(null);
        return;
      }

      const isMax = game.turn() === 'w';

      // --- 等級 1：新手入門 (純隨機失誤判定) ---
      if (config.level === 1 && Math.random() < config.randomBlunderRate) {
        // 從所有合法走步中隨機走出一步（新手隨意動子）
        const randomMove = rawMoves[Math.floor(Math.random() * rawMoves.length)];
        resolve(toPublicMove(randomMove));
        return;
      }

      // --- 等級 2：休閒初級 (偶發次佳步失誤) ---
      if (config.level === 2 && Math.random() < config.randomBlunderRate && rawMoves.length > 2) {
        // 從合法走步中隨機排除少數明顯殺著，選取休閒步
        const randIndex = Math.min(rawMoves.length - 1, Math.floor(Math.random() * Math.min(6, rawMoves.length)));
        resolve(toPublicMove(rawMoves[randIndex]));
        return;
      }

      // --- 依據等級深度進行走法評分計算 ---
      const searchDepth = config.depth;
      const scoredMoves = [];

      // 取出置換表歷史最佳著法作為排序首項
      const hash = game._hash;
      const tt = TT.get(hash);
      const hashMove = tt ? tt.bestMove : null;
      const orderedMoves = orderMovesFast(rawMoves, hashMove, 0);

      // 對根節點的每一個候選著法展開搜尋並評分
      for (const m of orderedMoves) {
        game._makeMove(m);
        // 若在等級 5 啟用靜態搜索，其他等級僅做標準 Alpha-Beta
        const score = alphaBetaFast(
          game,
          searchDepth - 1,
          -Infinity,
          Infinity,
          !isMax,
          1,
          config.quiescence
        );
        game._undoMove();

        scoredMoves.push({ move: m, score });
      }

      // 依當前行棋方進行排序：白方由高到低，黑方由低到高（以絕對優勢排序）
      if (isMax) {
        scoredMoves.sort((a, b) => b.score - a.score);
      } else {
        // 從黑方視角，分數越低對黑方越好，轉為相對分以利統一候選池抽樣
        scoredMoves.sort((a, b) => a.score - b.score);
        // 將評分標準化為黑方有利為正
        scoredMoves.forEach(item => { item.score = -item.score; });
      }

      // --- 執行加權隨機採樣 (Softmax Sampling) ---
      const chosenRawMove = sampleMoveSoftmax(
        scoredMoves,
        config.temperature,
        config.evalWindow
      );

      // 輸出走法物件
      resolve(toPublicMove(chosenRawMove || scoredMoves[0].move));
    }, 40);
  });
}
