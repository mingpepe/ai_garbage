// ============================================================================
// 戰術教練分析引擎 (Tactical Coach Analysis Engine)
// 提供局勢評估、敵方威脅偵測、進攻契機與防守解法，並生成視覺化圖解數據
// ============================================================================
import { evaluateBoard } from './ai.js';

const PIECE_NAMES = {
  p: '兵 (Pawn)',
  n: '騎士 (Knight)',
  b: '主教 (Bishop)',
  r: '城堡 (Rook)',
  q: '皇后 (Queen)',
  k: '國王 (King)'
};

const PIECE_SHORT = {
  p: '兵',
  n: '馬',
  b: '象',
  r: '車',
  q: '后',
  k: '王'
};

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

/**
 * 深入分析當前局勢，回傳進攻、防守與整體最佳著法建議
 * @param {Chess} game - chess.js 實例
 * @param {string} playerColor - 玩家執子方 ('w' 或 'b')
 * @returns {Object} 包含 threats, attackSuggestions, defenseSuggestions, bestSuggestion, summary
 */
export function analyzeCoachPosition(game, playerColor = 'w') {
  const currentTurn = game.turn();
  const oppColor = currentTurn === 'w' ? 'b' : 'w';
  const isPlayerTurn = currentTurn === playerColor;

  if (game.isGameOver()) {
    let statusText = '對局已結束';
    if (game.isCheckmate()) {
      statusText = game.turn() === playerColor ? '您已被將死' : '恭喜將死對手獲勝！';
    } else if (game.isStalemate()) {
      statusText = '盤面逼和 (Stalemate) 和局';
    } else {
      statusText = '和局已成立';
    }
    return {
      isGameOver: true,
      statusText,
      threats: [],
      attackSuggestions: [],
      defenseSuggestions: [],
      bestSuggestion: null,
      summary: statusText
    };
  }

  // 1. 偵測當前行動方受到的威脅 (Threats)
  const threats = detectThreats(game, currentTurn);

  // 2. 獲取所有合法走步並模擬評估
  const legalMoves = game.moves({ verbose: true });
  if (legalMoves.length === 0) {
    return {
      isGameOver: false,
      threats,
      attackSuggestions: [],
      defenseSuggestions: [],
      bestSuggestion: null,
      summary: '目前無任何合法著法'
    };
  }

  // 評估每個走法的局勢與戰術特徵
  const evaluatedMoves = [];
  const baseEval = evaluateBoard(game);
  const sideMultiplier = currentTurn === 'w' ? 1 : -1;

  for (const m of legalMoves) {
    game.move(m);
    const scoreAfter = evaluateBoard(game) * sideMultiplier;
    const inCheck = game.inCheck();
    game.undo();

    evaluatedMoves.push({
      move: m,
      score: scoreAfter,
      inCheck
    });
  }

  // 依相對分數降冪排序（分數越高對當前行動方越有利）
  evaluatedMoves.sort((a, b) => b.score - a.score);

  // 3. 提煉進攻建議 (Attack Suggestions)
  const attackSuggestions = findAttackSuggestions(game, evaluatedMoves, currentTurn, oppColor);

  // 4. 提煉防守建議 (Defense Suggestions)
  const defenseSuggestions = findDefenseSuggestions(game, evaluatedMoves, threats, currentTurn, oppColor);

  // 5. 提煉整體最佳走步 (Best Move)
  const bestCandidate = evaluatedMoves[0];
  const bestSuggestion = formatBestSuggestion(game, bestCandidate, currentTurn, threats);

  // 6. 生成整體戰略摘要評述
  const currentAdvantage = baseEval * sideMultiplier;
  let advantageText = '';
  if (Math.abs(currentAdvantage) < 50) {
    advantageText = '局勢勢均力敵，雙方處於平衡對峙。';
  } else if (currentAdvantage >= 50 && currentAdvantage < 200) {
    advantageText = '我方略微佔優，可積極開展子力調度。';
  } else if (currentAdvantage >= 200) {
    advantageText = '我方優勢顯著，可尋求突破並瓦解敵方防禦！';
  } else if (currentAdvantage <= -200) {
    advantageText = '目前處於劣勢，需穩固防線、避免子力失誤。';
  } else {
    advantageText = '局勢略微被動，需加強關鍵格子防守。';
  }

  let threatSummary = '';
  if (threats.length === 0) {
    threatSummary = '盤面暫無直接失子威脅，後方防線穩固。';
  } else {
    const highestThreat = threats[0];
    threatSummary = `⚠️ 注意：位於 ${highestThreat.square.toUpperCase()} 的 ${highestThreat.pieceName} 正面臨威脅！`;
  }

  return {
    isGameOver: false,
    evalScore: (baseEval / 100).toFixed(1),
    advantageText,
    threatSummary,
    threats,
    attackSuggestions,
    defenseSuggestions,
    bestSuggestion,
    isPlayerTurn
  };
}

/**
 * 偵測當前目標方所有受威脅的棋子
 */
function detectThreats(game, targetColor) {
  const oppColor = targetColor === 'w' ? 'b' : 'w';
  const threats = [];

  for (let r = 8; r >= 1; r--) {
    for (let f = 0; f < 8; f++) {
      const square = 'abcdefgh'[f] + r;
      const piece = game.get(square);
      if (!piece || piece.color !== targetColor || piece.type === 'k') continue;

      const attackers = game.attackers(square, oppColor);
      if (attackers && attackers.length > 0) {
        const defenders = game.attackers(square, targetColor);
        const myVal = PIECE_VALUES[piece.type];

        // 找出攻擊方中價值最低的棋子
        let minAttackerVal = Infinity;
        let primaryAttackerSquare = attackers[0];
        for (const atkSq of attackers) {
          const atkPiece = game.get(atkSq);
          if (atkPiece && PIECE_VALUES[atkPiece.type] < minAttackerVal) {
            minAttackerVal = PIECE_VALUES[atkPiece.type];
            primaryAttackerSquare = atkSq;
          }
        }

        const isHanging = defenders.length === 0;
        const isUnderDefended = attackers.length > defenders.length;
        const isFavorableExchange = minAttackerVal < myVal;

        if (isHanging || isUnderDefended || isFavorableExchange) {
          const atkPiece = game.get(primaryAttackerSquare);
          let reason = '';
          if (isHanging) {
            reason = `無任何己方子力保護，面臨免費被吃的危險！`;
          } else if (isFavorableExchange) {
            reason = `正被價值更低的對手 ${PIECE_SHORT[atkPiece.type]} (${primaryAttackerSquare.toUpperCase()}) 瞄準，兌換不利！`;
          } else {
            reason = `防守子力不足 (${defenders.length} 防守 vs ${attackers.length} 圍攻)，存在過載失子風險。`;
          }

          threats.push({
            square,
            pieceType: piece.type,
            pieceName: PIECE_NAMES[piece.type],
            attackerSquare: primaryAttackerSquare,
            attackerPiece: atkPiece?.type || 'p',
            attackerName: atkPiece ? PIECE_NAMES[atkPiece.type] : '敵子',
            isHanging,
            isUnderDefended,
            severity: myVal,
            reason
          });
        }
      }
    }
  }

  // 依棋子價值高低排序威脅
  threats.sort((a, b) => b.severity - a.severity);
  return threats;
}

/**
 * 提煉進攻建議（吃子、捉雙、牽制、將軍、突破中心等）
 */
function findAttackSuggestions(game, evaluatedMoves, currentTurn, oppColor) {
  const suggestions = [];
  const seenMoves = new Set();

  for (const item of evaluatedMoves) {
    const m = item.move;
    const moveKey = `${m.from}-${m.to}`;
    if (seenMoves.has(moveKey)) continue;

    let attackType = null;
    let title = '';
    let explanation = '';
    let followUp = '';
    let priority = 0;

    // 情況 A：吃子攻勢
    if (m.captured) {
      const capturedName = PIECE_NAMES[m.captured];
      const moverName = PIECE_NAMES[m.piece];
      const myVal = PIECE_VALUES[m.piece];
      const targetVal = PIECE_VALUES[m.captured];

      // 檢查吃子後目標格是否被對手保護
      game.move(m);
      const defendedByOpp = game.isAttacked(m.to, oppColor);
      game.undo();

      if (!defendedByOpp) {
        attackType = 'free-capture';
        title = `🎯 吃子斬獲：${m.san} (淨賺 ${PIECE_SHORT[m.captured]})`;
        explanation = `以 ${moverName} 斬獲對手無保護的 ${capturedName} (${m.to.toUpperCase()})，直接建立子力優勢！`;
        followUp = `吃子後該格安全無虞，可持續擴大局勢壓迫。`;
        priority = 90 + targetVal / 10;
      } else if (targetVal >= myVal) {
        attackType = 'favorable-trade';
        title = `⚔️ 有利兌子：${m.san} (吃 ${PIECE_SHORT[m.captured]})`;
        explanation = `以 ${moverName} 換取對手 ${capturedName} (${m.to.toUpperCase()})，即使被反吃亦完全不虧甚至淨賺。`;
        followUp = `順利瓦解對手防禦佈局並簡化局面。`;
        priority = 75 + (targetVal - myVal) / 10;
      }
    }

    // 情況 B：將軍 (Check) 攻勢
    if (!attackType && item.inCheck) {
      attackType = 'check';
      title = `⚡ 將軍突擊：${m.san} (攻擊國王)`;
      explanation = `將 ${PIECE_NAMES[m.piece]} 推進至 ${m.to.toUpperCase()} 直接將軍對手國王，迫使對方被動應手！`;
      followUp = `對方必須立即墊子、吃子或避王，能為我方贏得寶貴的進攻主動權。`;
      priority = 80;
    }

    // 情況 C：捉雙 (Fork) 戰術判定
    if (!attackType) {
      game.move(m);
      const attackedPieces = [];
      for (let r = 8; r >= 1; r--) {
        for (let f = 0; f < 8; f++) {
          const sq = 'abcdefgh'[f] + r;
          const targetPiece = game.get(sq);
          if (targetPiece && targetPiece.color === oppColor) {
            const isHit = game.attackers(sq, currentTurn).includes(m.to);
            if (isHit && (PIECE_VALUES[targetPiece.type] >= 300 || !game.isAttacked(sq, oppColor))) {
              attackedPieces.push({ square: sq, type: targetPiece.type });
            }
          }
        }
      }
      game.undo();

      if (attackedPieces.length >= 2) {
        attackType = 'fork';
        const p1 = PIECE_NAMES[attackedPieces[0].type];
        const p2 = PIECE_NAMES[attackedPieces[1].type];
        title = `🔱 捉雙戰術：${m.san} (同時攻擊雙子)`;
        explanation = `將 ${PIECE_NAMES[m.piece]} 走至 ${m.to.toUpperCase()}，同時威脅對手位於 ${attackedPieces[0].square.toUpperCase()} 的 ${p1} 與 ${attackedPieces[1].square.toUpperCase()} 的 ${p2}！`;
        followUp = `對手無法在一手內同時解救兩子，下回合我方必能斬獲其一！`;
        priority = 85;
      }
    }

    // 情況 D：強攻牽制或佔據核心中心格 (e4, d4, e5, d5, c4, f4)
    if (!attackType && ['d4', 'e4', 'd5', 'e5'].includes(m.to) && ['p', 'n', 'b'].includes(m.piece)) {
      attackType = 'center-control';
      title = `🏰 爭奪中心：${m.san} (壓迫中路)`;
      explanation = `將 ${PIECE_NAMES[m.piece]} 挺進中心核心格 ${m.to.toUpperCase()}，控制對手中場活動空間。`;
      followUp = `能為後續后翼或王翼子力展開提供強力的支點。`;
      priority = 60 + item.score / 50;
    }

    // 情況 E：兵鏈推進突破
    if (!attackType && m.piece === 'p' && (m.to[1] === '5' || m.to[1] === '4')) {
      attackType = 'pawn-push';
      title = `🔥 兵線挺進：${m.san} (壓縮空間)`;
      explanation = `推進兵至 ${m.to.toUpperCase()} 撕開對手兵陣結構，驅趕敵方駐守輕子。`;
      followUp = `可為我方後方重子打通開放線路。`;
      priority = 50 + item.score / 50;
    }

    if (attackType) {
      seenMoves.add(moveKey);
      suggestions.push({
        type: 'attack',
        attackType,
        move: m,
        title,
        explanation,
        followUp,
        score: item.score,
        priority,
        arrow: {
          from: m.from,
          to: m.to,
          color: '#ef4444',
          label: '進攻'
        },
        highlight: {
          square: m.to,
          type: 'attack'
        }
      });
    }

    if (suggestions.length >= 3) break;
  }

  // 排序優先順序
  suggestions.sort((a, b) => b.priority - a.priority);
  return suggestions.slice(0, 2);
}

/**
 * 提煉防守建議（撤退避險、增援守護、消除威脅、王車易位安王等）
 */
function findDefenseSuggestions(game, evaluatedMoves, threats, currentTurn, oppColor) {
  const suggestions = [];
  const seenMoves = new Set();

  // 若當前在將軍狀態，解將為最高防守優先級
  if (game.inCheck()) {
    for (const item of evaluatedMoves) {
      const m = item.move;
      const moveKey = `${m.from}-${m.to}`;
      if (seenMoves.has(moveKey)) continue;

      let title = `🛡️ 解除將軍：${m.san}`;
      let explanation = `國王目前正受威脅！透過 ${m.san} 成功化解將軍危機。`;
      let followUp = `解將後務必重新檢視防線，避免被對手連續將軍抽子。`;

      seenMoves.add(moveKey);
      suggestions.push({
        type: 'defense',
        defenseType: 'evade-check',
        move: m,
        title,
        explanation,
        followUp,
        priority: 100 + item.score / 20,
        arrow: {
          from: m.from,
          to: m.to,
          color: '#3b82f6',
          label: '解將'
        },
        highlight: {
          square: m.to,
          type: 'defense'
        }
      });

      if (suggestions.length >= 2) break;
    }
    return suggestions;
  }

  // 若有受威脅棋子，優先尋求撤退、防守或反吃
  if (threats.length > 0) {
    const highestThreat = threats[0];
    const targetSq = highestThreat.square;

    for (const item of evaluatedMoves) {
      const m = item.move;
      const moveKey = `${m.from}-${m.to}`;
      if (seenMoves.has(moveKey)) continue;

      let defenseType = null;
      let title = '';
      let explanation = '';
      let followUp = '';
      let priority = 0;

      // 策略 1：受威脅棋子撤退至安全格
      if (m.from === targetSq) {
        game.move(m);
        const stillAttacked = game.isAttacked(m.to, oppColor);
        game.undo();

        if (!stillAttacked) {
          defenseType = 'retreat';
          title = `🛡️ 安全撤退：${m.san} (避開攻擊)`;
          explanation = `將受威脅的 ${highestThreat.pieceName} 從 ${m.from.toUpperCase()} 撤移至安全的 ${m.to.toUpperCase()} 格。`;
          followUp = `成功避免 ${highestThreat.pieceName} 被白白吃掉，保全戰力。`;
          priority = 95 + highestThreat.severity / 100;
        }
      }

      // 策略 2：吃掉攻擊者 (消滅威脅根源)
      if (m.to === highestThreat.attackerSquare) {
        defenseType = 'eliminate-threat';
        title = `⚔️ 反擊威脅：${m.san} (拔除攻擊子)`;
        explanation = `主動斬獲威脅我方陣地的敵方 ${highestThreat.attackerName} (${highestThreat.attackerSquare.toUpperCase()})！`;
        followUp = `以攻為守，不僅解除危機，更奪回戰略主導權。`;
        priority = 98 + highestThreat.severity / 100;
      }

      // 策略 3：走子為受威脅格增加防守子力
      if (!defenseType && m.from !== targetSq) {
        game.move(m);
        const newDefenders = game.attackers(targetSq, currentTurn);
        game.undo();

        if (newDefenders.includes(m.to)) {
          defenseType = 'reinforce';
          title = `🛡️ 增援守護：${m.san} (建立防守)`;
          explanation = `將 ${PIECE_NAMES[m.piece]} 移至 ${m.to.toUpperCase()}，為 ${targetSq.toUpperCase()} 的 ${highestThreat.pieceName} 建立保護支援！`;
          followUp = `形成協同防守陣型，讓對手不敢輕易動手交換。`;
          priority = 75 + highestThreat.severity / 200;
        }
      }

      if (defenseType) {
        seenMoves.add(moveKey);
        suggestions.push({
          type: 'defense',
          defenseType,
          move: m,
          title,
          explanation,
          followUp,
          priority,
          arrow: {
            from: m.from,
            to: m.to,
            color: '#3b82f6',
            label: '防守'
          },
          highlight: {
            square: m.to,
            type: 'defense'
          }
        });
      }

      if (suggestions.length >= 2) break;
    }
  }

  // 策略 4：若盤面無即時威脅，尋求王車易位 (Castling) 穩固王翼
  if (suggestions.length < 2) {
    for (const item of evaluatedMoves) {
      const m = item.move;
      const isCastle = m.flags && (m.flags.includes('k') || m.flags.includes('q'));
      if (isCastle && !seenMoves.has(`${m.from}-${m.to}`)) {
        seenMoves.add(`${m.from}-${m.to}`);
        suggestions.push({
          type: 'defense',
          defenseType: 'castle',
          move: m,
          title: `🏰 王車易位：${m.san} (王城安全)`,
          explanation: `進行王車易位，將國王移至厚實的兵陣護衛內，同時將底線城堡迅速調度至中央作戰。`,
          followUp: `這是現代西洋棋最關鍵的防守里程碑，能徹底杜絕中央線被突然破陣的風險。`,
          priority: 82,
          arrow: {
            from: m.from,
            to: m.to,
            color: '#3b82f6',
            label: '易位'
          },
          highlight: {
            square: m.to,
            type: 'defense'
          }
        });
        break;
      }
    }
  }

  // 策略 5：防守型穩健走步（防護後方、防範弱點）
  if (suggestions.length === 0 && evaluatedMoves.length > 0) {
    const safest = evaluatedMoves[0];
    const m = safest.move;
    suggestions.push({
      type: 'defense',
      defenseType: 'positional',
      move: m,
      title: `🛡️ 穩健佈局：${m.san}`,
      explanation: `加強盤面結構與陣型協同，穩固陣地等待出擊契機。`,
      followUp: `防範對手潛在的偷襲與子力滲透。`,
      priority: 60,
      arrow: {
        from: m.from,
        to: m.to,
        color: '#3b82f6',
        label: '防守'
      },
      highlight: {
        square: m.to,
        type: 'defense'
      }
    });
  }

  suggestions.sort((a, b) => b.priority - a.priority);
  return suggestions.slice(0, 2);
}

/**
 * 格式化整體評估最佳走步
 */
function formatBestSuggestion(game, bestItem, currentTurn, threats) {
  if (!bestItem) return null;
  const m = bestItem.move;

  let rationale = '';
  if (m.captured) {
    rationale = `直接吃掉對手 ${PIECE_NAMES[m.captured]} (${m.to.toUpperCase()})，獲取直接淨勝子力。`;
  } else if (bestItem.inCheck) {
    rationale = `推進 ${m.san} 將軍對手，掌握主動權並壓制敵方國王。`;
  } else if (m.flags && (m.flags.includes('k') || m.flags.includes('q'))) {
    rationale = `王車易位，將國王帶入掩體並啟動城堡進攻通道。`;
  } else if (threats.length > 0 && m.from === threats[0].square) {
    rationale = `精準避開對手攻擊，及時化解失子危機。`;
  } else {
    rationale = `在攻守兩端均具備最佳戰略效益，能有效提升我方陣地控制力。`;
  }

  return {
    move: m,
    san: m.san,
    title: `🏆 最佳推薦著法：${m.san}`,
    explanation: rationale,
    score: (bestItem.score / 100).toFixed(1),
    arrow: {
      from: m.from,
      to: m.to,
      color: '#10b981',
      label: '最佳'
    },
    highlight: {
      square: m.to,
      type: 'best'
    }
  };
}
