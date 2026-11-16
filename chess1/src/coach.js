// ============================================================================
// 戰術教練分析引擎 (Tactical Coach Analysis Engine)
// 結合 3-Ply Alpha-Beta + 靜態搜尋 + 全盤合法吃子交換驗證 (Legal SEE)，
// 提供「為什麼這樣走」、「後續戰術目的」與「1→2→3 連招推演圖解」
// ============================================================================
import {
  scoreMovesWithSearch,
  getPureMaterial,
  resolveSquareExchange,
  toAlgebraicSquare
} from './ai.js?v=2.6';

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
 * 深入分析當前局勢，回傳進攻、防守與整體最佳著法建議（含深度原因與後續連招推演）
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

  // 2. 獲取所有合法走步並透過全盤吃子交換驗證 + Depth-3 Alpha-Beta 進行評分
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

  const baseMaterial = getPureMaterial(game, currentTurn);
  const moveMap = new Map();
  const safetyMap = new Map();
  let bestWholeBoardDelta = -Infinity;

  for (const m of legalMoves) {
    const key = `${m.from}-${m.to}-${m.promotion || ''}`;
    moveMap.set(key, m);
    const safety = checkMoveSafety(game, m, currentTurn, oppColor, baseMaterial);
    safetyMap.set(key, safety);
    if (safety.wholeBoardDelta > bestWholeBoardDelta) {
      bestWholeBoardDelta = safety.wholeBoardDelta;
    }
  }

  const acceptableBoardDelta = Math.min(0, bestWholeBoardDelta) - 65;
  const skipMoveKeys = new Set();
  for (const [key, safety] of safetyMap.entries()) {
    if (safety.losesOnTarget || safety.wholeBoardDelta < acceptableBoardDelta) {
      skipMoveKeys.add(key);
    }
  }
  if (skipMoveKeys.size === legalMoves.length) {
    skipMoveKeys.clear();
  }

  const searchedMoves = scoreMovesWithSearch(game, 3, skipMoveKeys);
  const evaluatedMoves = [];

  for (const s of searchedMoves) {
    const key = `${s.from}-${s.to}-${s.promotion || ''}`;
    const verboseMove = moveMap.get(key);
    const safety = safetyMap.get(key);
    if (verboseMove && safety) {
      evaluatedMoves.push({
        move: verboseMove,
        rawScore: s.score,
        score: s.score,
        inCheck: s.inCheck,
        safety,
        isBlunder: false
      });
    }
  }

  if (evaluatedMoves.length === 0) {
    return {
      isGameOver: false,
      threats,
      attackSuggestions: [],
      defenseSuggestions: [],
      bestSuggestion: null,
      summary: '目前無任何合法著法'
    };
  }

  // 標記並重罰任何會「落點送死」或「放任全盤失子」的步數（必勝將殺除外）
  for (const item of evaluatedMoves) {
    if (item.rawScore >= 50000) continue;
    const losesMaterialOnBoard = item.safety.wholeBoardDelta < acceptableBoardDelta;
    if (item.safety.losesOnTarget || losesMaterialOnBoard) {
      item.isBlunder = true;
      const materialPenalty = Math.min(item.safety.targetExchangeDelta, item.safety.wholeBoardDelta - Math.min(0, bestWholeBoardDelta));
      item.score = item.rawScore - 1500 + materialPenalty * 3;
    }
  }

  // 重新依防漏子校正後的分數降冪排序
  evaluatedMoves.sort((a, b) => b.score - a.score);

  const bestScore = evaluatedMoves[0].score;
  const sideMultiplier = currentTurn === 'w' ? 1 : -1;

  const hasNonBlunder = evaluatedMoves.some(item => !item.isBlunder);
  for (const item of evaluatedMoves) {
    if (hasNonBlunder && item.score < bestScore - 75 && item.rawScore < 50000) {
      item.isBlunder = true;
    }
  }

  // 3. 提煉進攻建議 (Attack Suggestions)
  const attackSuggestions = findAttackSuggestions(game, evaluatedMoves, bestScore, currentTurn, oppColor, threats);

  // 4. 提煉防守建議 (Defense Suggestions)
  const defenseSuggestions = findDefenseSuggestions(game, evaluatedMoves, bestScore, baseMaterial, threats, currentTurn, oppColor);

  // 5. 提煉整體最佳走步 (Best Move)
  const bestCandidate = evaluatedMoves[0];
  const bestSuggestion = formatBestSuggestion(game, bestCandidate, currentTurn, oppColor, threats);

  // 6. 為最終選出的建議統一計算「深度原因、戰術目的與 1→2→3 後續連招推演」
  const enrichedCache = new Map();
  const enrichItem = (sug, mainColor) => {
    if (!sug || !sug.move) return;
    const key = `${sug.move.from}-${sug.move.to}-${sug.move.promotion || ''}`;
    let details = enrichedCache.get(key);
    if (!details) {
      details = buildDeepTacticalDetails(game, sug, currentTurn, oppColor, threats);
      enrichedCache.set(key, details);
    }
    sug.explanation = details.whyText;
    sug.tacticalPurpose = details.purposeText;
    sug.followUp = details.nextStepsHtml;
    sug.arrow.stepText = '1';
    sug.continuationArrows = [
      { ...sug.arrow, width: 6, stepText: '1' },
      ...details.extraArrows
    ];
  };

  if (bestSuggestion) enrichItem(bestSuggestion, '#10b981');
  attackSuggestions.forEach(s => enrichItem(s, '#ef4444'));
  defenseSuggestions.forEach(s => enrichItem(s, '#3b82f6'));

  // 7. 生成整體戰略摘要評述
  const currentAdvantage = bestCandidate.rawScore;
  const whitePerspectiveEval = currentAdvantage * sideMultiplier;
  let advantageText = '';
  if (Math.abs(currentAdvantage) < 60) {
    advantageText = '局勢勢均力敵，雙方處於平衡對峙，宜優先完成出子與搶佔中心。';
  } else if (currentAdvantage >= 60 && currentAdvantage < 200) {
    advantageText = '我方略微佔優，可積極調度子力施壓敵方弱點。';
  } else if (currentAdvantage >= 200) {
    advantageText = '我方優勢顯著，可透過優勢交換或創造捉雙突破敵方防線！';
  } else if (currentAdvantage <= -200) {
    advantageText = '目前處於劣勢，務必優先保護無防守子力並尋求反擊契機。';
  } else {
    advantageText = '局勢略微被動，需鞏固關鍵格防守並改善子力位置。';
  }

  let threatSummary = '';
  if (game.inCheck()) {
    threatSummary = '⚠️ 緊急警告：我方國王正遭受將軍，本回合必須優先解將！';
  } else if (threats.length === 0) {
    threatSummary = '🛡️ 盤面安全：目前無直接失子威脅，後方防線穩固。';
  } else {
    const highestThreat = threats[0];
    threatSummary = `⚠️ 防守警報：位於 ${highestThreat.square.toUpperCase()} 的 ${highestThreat.pieceName} 正面臨敵方 ${highestThreat.attackerName} (${highestThreat.attackerSquare.toUpperCase()}) 威脅！`;
  }

  return {
    isGameOver: false,
    evalScore: (whitePerspectiveEval / 100).toFixed(1),
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
 * 深入剖析單一建議著法的：
 * 1. 為什麼這樣走 (whyText)
 * 2. 後續戰術目的 (purposeText)
 * 3. 接下來怎麼走：對手預計應手 ② + 我方後續連招 ③ (nextStepsHtml & extraArrows)
 */
function buildDeepTacticalDetails(game, sug, currentTurn, oppColor, threatsBefore) {
  const m = sug.move;
  const safety = sug.safety || {};
  const moverName = PIECE_NAMES[m.piece];
  const moverShort = PIECE_SHORT[m.piece];
  const fromUp = m.from.toUpperCase();
  const toUp = m.to.toUpperCase();

  const oppThreatsBefore = detectThreats(game, oppColor);
  const oppThreatSquaresBefore = new Set(oppThreatsBefore.map(t => t.square));

  game.move(m);

  // A. 檢查此步化解了哪些我方原有的危機
  const myThreatsAfter = detectThreats(game, currentTurn);
  const myThreatSquaresAfter = new Set(myThreatsAfter.map(t => t.square));
  const rescuedPieces = threatsBefore.filter(t => !myThreatSquaresAfter.has(t.square) && (t.square !== m.from || !myThreatSquaresAfter.has(m.to)));

  // B. 檢查此步落子後，新落點 m.to 直接瞄準了哪些敵方棋子
  const directAttackedEnemies = [];
  const centerControlled = [];
  for (let r = 8; r >= 1; r--) {
    for (let f = 0; f < 8; f++) {
      const sq = 'abcdefgh'[f] + r;
      const isHitByMovedPiece = game.attackers(sq, currentTurn).includes(m.to);
      if (isHitByMovedPiece) {
        if (['d4', 'e4', 'd5', 'e5'].includes(sq)) {
          centerControlled.push(sq.toUpperCase());
        }
        const target = game.get(sq);
        if (target && target.color === oppColor) {
          directAttackedEnemies.push({
            square: sq.toUpperCase(),
            type: target.type,
            name: PIECE_NAMES[target.type],
            short: PIECE_SHORT[target.type],
            val: PIECE_VALUES[target.type],
            undefended: !game.isAttacked(sq, oppColor)
          });
        }
      }
    }
  }
  directAttackedEnemies.sort((a, b) => b.val - a.val);

  // C. 檢查全盤新產生的對敵威脅（含閃擊 / 打開射線後的威脅）
  const oppThreatsAfter = detectThreats(game, oppColor);
  const newlyCreatedThreats = oppThreatsAfter.filter(t => !oppThreatSquaresBefore.has(t.square));

  // D. 推演後續 2 步連招 (② 對手最佳應手 -> ③ 我方後續最佳連擊)
  let oppBestMove = null;
  let ourFollowUpMove = null;
  const extraArrows = [];

  if (!game.isGameOver()) {
    const oppScored = scoreMovesWithSearch(game, 1);
    if (oppScored.length > 0) {
      const topOpp = oppScored[0];
      const oppVerboseList = game.moves({ verbose: true });
      oppBestMove = oppVerboseList.find(
        om => om.from === topOpp.from && om.to === topOpp.to && (!topOpp.promotion || om.promotion === topOpp.promotion)
      ) || oppVerboseList[0];

      if (oppBestMove) {
        extraArrows.push({
          from: oppBestMove.from,
          to: oppBestMove.to,
          color: '#94a3b8',
          width: 4,
          dashed: true,
          opacity: 0.85,
          stepText: '2'
        });

        game.move(oppBestMove);
        if (!game.isGameOver()) {
          const ourScored = scoreMovesWithSearch(game, 1);
          if (ourScored.length > 0) {
            const topOur = ourScored[0];
            const ourVerboseList = game.moves({ verbose: true });
            ourFollowUpMove = ourVerboseList.find(
              fm => fm.from === topOur.from && fm.to === topOur.to && (!topOur.promotion || fm.promotion === topOur.promotion)
            ) || ourVerboseList[0];

            if (ourFollowUpMove) {
              extraArrows.push({
                from: ourFollowUpMove.from,
                to: ourFollowUpMove.to,
                color: '#f59e0b',
                width: 5,
                dashed: true,
                opacity: 0.92,
                stepText: '3'
              });
            }
          }
        }
        game.undo();
      }
    }
  }

  const isCheckmateNow = game.isCheckmate();
  const isCheckNow = game.inCheck();
  game.undo();

  // =========================================================================
  // 1. 組裝「為什麼這樣走 (whyText)」
  // =========================================================================
  const whyParts = [];

  // (1) 核心走步動作與子力交換計算
  if (isCheckmateNow) {
    whyParts.push(`將${moverName}移至 ${toUp} 直接將死敵方國王，一舉終結比賽！`);
  } else if (m.captured) {
    const capName = PIECE_NAMES[m.captured];
    const capVal = (PIECE_VALUES[m.captured] / 100).toFixed(0);
    if (!safety.isAttacked) {
      whyParts.push(`敵方位於 ${toUp} 的${capName}處於無防守懸空狀態，以我方${moverName} (${fromUp}→${toUp}) 吃掉可免費淨賺 +${capVal} 分子力。`);
    } else if (safety.targetExchangeDelta >= 80) {
      whyParts.push(`以${moverName} (${fromUp}→${toUp}) 吃掉敵方${capName}；雖該格有敵子盯防，但經完整交換鏈結算，我方最終可淨賺約 +${(safety.targetExchangeDelta / 100).toFixed(1)} 分優勢。`);
    } else {
      whyParts.push(`以${moverName} (${fromUp}→${toUp}) 主動兌換敵方重要${capName}，消除對手在該區域的戰術支點。`);
    }
  } else if (m.flags && (m.flags.includes('k') || m.flags.includes('q'))) {
    whyParts.push(`發動王車易位 (${m.san})，一口氣完成「隱藏國王至安全側翼兵陣」與「啟動底線城堡進入中央通道」兩大任務。`);
  } else if (rescuedPieces.length > 0) {
    const r0 = rescuedPieces[0];
    if (m.from === r0.square) {
      whyParts.push(`我方位於 ${fromUp} 的${r0.pieceName}正遭敵方${r0.attackerName} (${r0.attackerSquare.toUpperCase()}) 瞄準，移往 ${toUp} 可及時脫離險境、避免白白失子。`);
    } else {
      whyParts.push(`我方 ${r0.square.toUpperCase()} 格的${r0.pieceName}正受敵方威脅，走 ${m.san} (${fromUp}→${toUp}) 能建立協同防線，讓對手無法得手。`);
    }
  } else {
    const backRank = currentTurn === 'w' ? '1' : '8';
    if (['n', 'b'].includes(m.piece) && m.from[1] === backRank) {
      whyParts.push(`將尚未出動的后排${moverName}從 ${fromUp} 推進至前線活躍格 ${toUp}，提升子力機動性並加快開局動員。`);
    } else if (['d4', 'e4', 'd5', 'e5'].includes(m.to)) {
      whyParts.push(`以${moverName} (${fromUp}→${toUp}) 直接佔據棋盤核心中心格 ${toUp}，掌握中場空間主導權。`);
    } else {
      whyParts.push(`將${moverName}由 ${fromUp} 調度至戰略要點 ${toUp}，改善子力配置並強化攻守協調。`);
    }
  }

  // (2) 落子後對敵方目標或中心格的直接打擊
  if (!isCheckmateNow) {
    if (isCheckNow) {
      whyParts.push(`此步直接將軍敵方國王，具有最高強制性，對手本回合無法發動反擊、必須優先應對將軍。`);
    } else if (directAttackedEnemies.length >= 2) {
      const tNames = directAttackedEnemies.slice(0, 2).map(e => `${e.square} 的${e.name}`).join(' 與 ');
      whyParts.push(`進駐 ${toUp} 後形成一子雙擊（捉雙），同時直接威脅敵方 ${tNames}！`);
    } else if (directAttackedEnemies.length === 1) {
      const e0 = directAttackedEnemies[0];
      whyParts.push(`落子後直接瞄準敵方位於 ${e0.square} 的${e0.name}${e0.undefended ? '（該子目前無保護）' : ''}，施加正面壓力。`);
    } else if (centerControlled.length > 0 && !['d4', 'e4', 'd5', 'e5'].includes(m.to)) {
      whyParts.push(`同時從 ${toUp} 格輻射控制中央 ${centerControlled.join('、')} 關鍵格，限制敵方輕子切入。`);
    }
  }

  // (3) 落點安全性證明（讓玩家安心確認不會送死）
  if (!isCheckmateNow && safety.isAttacked !== undefined) {
    if (!safety.isAttacked) {
      whyParts.push(`【安全驗證】${toUp} 格目前完全不在敵方任何棋子的攻擊射程內，無被吃風險。`);
    } else if (safety.defenders && safety.defenders.length > 0 && safety.targetExchangeDelta >= 0) {
      const defList = safety.defenders.slice(0, 2).map(s => s.toUpperCase()).join('、');
      whyParts.push(`【安全驗證】${toUp} 格雖有敵子盯防，但我方有 ${defList} 格友軍提供充足保護，敵方若強行換子只會吃虧。`);
    }
  }

  // =========================================================================
  // 2. 組裝「後續戰術目的 (purposeText)」
  // =========================================================================
  let purposeText = '';
  if (isCheckmateNow) {
    purposeText = '直接完成將殺，取得對局勝利。';
  } else if (newlyCreatedThreats.length > 0) {
    const nt = newlyCreatedThreats[0];
    purposeText = `創造對敵方 ${nt.square.toUpperCase()} 格${nt.pieceName}的實質吃子威脅，迫使對手下一手陷入被動逃亡或防守，藉機奪取場上先手權（Initiative）並擴大子力優勢。`;
  } else if (directAttackedEnemies.length >= 2) {
    purposeText = `利用捉雙戰術讓對手顧此失彼，待對手移開其中一子後，於下一手穩穩吃掉另一枚敵子以贏得子力差。`;
  } else if (isCheckNow) {
    purposeText = `透過將軍破壞敵方王城陣型（或迫使敵王失去易位權利），趁對手應付將軍的空檔，為我方後續重子切入創造時間差（Tempo）。`;
  } else if (rescuedPieces.length > 0) {
    purposeText = `先穩住陣腳、消除我方陣營的失子破口，讓對手撲空並消耗其進攻動能，待防線鞏固後再伺機轉守為攻。`;
  } else if (m.flags && (m.flags.includes('k') || m.flags.includes('q'))) {
    purposeText = `徹底消除中路國王被戰術偷襲的隱憂，並在後續回合將城堡推向中央開放線（d線或e線），展開中局攻勢。`;
  } else if (['d4', 'e4', 'd5', 'e5'].includes(m.to)) {
    purposeText = `建立穩固的中心據點，將敵方子力擠壓在後排狹小空間，並作為我方後續兵鏈推進或雙翼進攻的跳板。`;
  } else {
    purposeText = `優化子力協同位置並控制關鍵線路，壓縮對手好走步的選擇空間，等待對手陣型出現弱點時立即發動戰術打擊。`;
  }

  // =========================================================================
  // 3. 組裝「接下來怎麼走 — 1→2→3 連招推演 (nextStepsHtml)」
  // =========================================================================
  const stepLines = [];
  stepLines.push(`<strong>① 本步行動：</strong>走 <code>${m.san}</code>（${moverShort} ${fromUp} → ${toUp}）`);

  if (isCheckmateNow) {
    stepLines.push(`<strong>🏁 結局：</strong>對手無任何合法解將步，直接獲勝！`);
  } else {
    if (newlyCreatedThreats.length > 0) {
      const nt = newlyCreatedThreats[0];
      stepLines.push(`<strong>⚡ 直接威脅（若對手不防備）：</strong>下回合可直接攻取敵方 <strong>${nt.square.toUpperCase()} 格的${nt.pieceName}</strong>！`);
    }

    if (oppBestMove) {
      const oppShort = PIECE_SHORT[oppBestMove.piece];
      const oppFrom = oppBestMove.from.toUpperCase();
      const oppTo = oppBestMove.to.toUpperCase();
      let oppActionDesc = '';
      if (oppBestMove.captured) {
        oppActionDesc = `（反吃 ${oppTo} 格${PIECE_SHORT[oppBestMove.captured]}）`;
      } else if (isCheckNow) {
        oppActionDesc = `（被迫應對將軍）`;
      } else if (newlyCreatedThreats.length > 0 && oppBestMove.from === newlyCreatedThreats[0].square) {
        oppActionDesc = `（逃避我方威脅）`;
      } else {
        oppActionDesc = `（對手最佳應手）`;
      }
      stepLines.push(`<strong>② 預判對手應手：</strong>對手最可能走 <code>${oppBestMove.san}</code>（${oppShort} ${oppFrom} → ${oppTo}）${oppActionDesc}`);
    }

    if (ourFollowUpMove) {
      const ourShort = PIECE_SHORT[ourFollowUpMove.piece];
      const ourFrom = ourFollowUpMove.from.toUpperCase();
      const ourTo = ourFollowUpMove.to.toUpperCase();
      let ourActionReason = '';
      if (ourFollowUpMove.captured) {
        ourActionReason = `，順勢吃掉敵方 ${ourTo} 格的${PIECE_NAMES[ourFollowUpMove.captured]}擴大戰果！`;
      } else if (ourFollowUpMove.san.includes('+')) {
        ourActionReason = `，發動連續將軍追擊敵王！`;
      } else if (['d4', 'e4', 'd5', 'e5'].includes(ourFollowUpMove.to)) {
        ourActionReason = `，繼續搶佔中心核心格強化控制！`;
      } else {
        ourActionReason = `，持續推進陣型並鞏固場面優勢！`;
      }
      stepLines.push(`<strong>③ 我方後續連招：</strong>接著我們可走 <code>${ourFollowUpMove.san}</code>（${ourShort} ${ourFrom} → ${ourTo}）${ourActionReason}`);
    }
  }

  return {
    whyText: whyParts.join(' '),
    purposeText,
    nextStepsHtml: stepLines.join('<br>'),
    extraArrows
  };
}

/**
 * 檢查走法在落子後的落點交換淨值與全盤最差失子風險
 */
function checkMoveSafety(game, move, currentTurn, oppColor, baseMaterial) {
  game.move(move);

  if (game.isCheckmate()) {
    game.undo();
    return {
      isSafe: true,
      isUncontested: true,
      isAttacked: false,
      isHanging: false,
      losesOnTarget: false,
      targetExchangeDelta: 10000,
      wholeBoardDelta: 10000,
      attackers: [],
      defenders: [],
      minAttackerVal: Infinity
    };
  }

  const attackers = game.attackers(move.to, oppColor);
  const defenders = game.attackers(move.to, currentTurn);
  const myType = move.promotion || move.piece;
  const myVal = PIECE_VALUES[myType] || 100;

  let minAttackerVal = Infinity;
  for (const atkSq of attackers) {
    const atkPiece = game.get(atkSq);
    if (atkPiece && PIECE_VALUES[atkPiece.type] < minAttackerVal) {
      minAttackerVal = PIECE_VALUES[atkPiece.type];
    }
  }

  // 1. 計算落點格 move.to 的精確合法吃子交換鏈結果 (Legal SEE)
  const matAfterTarget = resolveSquareExchange(game, move.to, currentTurn);
  const targetExchangeDelta = matAfterTarget - baseMaterial;

  // 2. 掃描對手下一手在全盤其他格點的合法吃子（每個目標格僅取最低價值攻擊子 LVA 測試一次）
  let minBoardMat = Math.min(getPureMaterial(game, currentTurn), matAfterTarget);
  const oppRawMoves = game._moves();
  const lvaBySquare = new Map();
  for (let i = 0; i < oppRawMoves.length; i++) {
    const om = oppRawMoves[i];
    if (om.captured || om.promotion) {
      const capSq = toAlgebraicSquare(om.to);
      if (capSq === move.to) continue;
      const existing = lvaBySquare.get(capSq);
      if (!existing || (PIECE_VALUES[om.piece] || 100) < (PIECE_VALUES[existing.piece] || 100)) {
        lvaBySquare.set(capSq, om);
      }
    }
  }
  for (const [capSq, om] of lvaBySquare.entries()) {
    game._makeMove(om);
    const matAfter = resolveSquareExchange(game, capSq, currentTurn);
    game._undoMove();
    if (matAfter < minBoardMat) {
      minBoardMat = matAfter;
    }
  }
  const wholeBoardDelta = minBoardMat - baseMaterial;

  game.undo();

  const isAttacked = attackers.length > 0;
  const isHanging = isAttacked && defenders.length === 0;
  const isLowerAttacker = isAttacked && minAttackerVal < myVal;

  const losesOnTarget = targetExchangeDelta <= -60 || (!move.captured && isLowerAttacker);
  const isUncontested = !losesOnTarget && (!isAttacked || (minAttackerVal > myVal + 50 && targetExchangeDelta >= 0));
  const isSafe = !losesOnTarget && wholeBoardDelta >= -60;

  return {
    isSafe,
    isUncontested,
    isAttacked,
    isHanging,
    losesOnTarget,
    targetExchangeDelta,
    wholeBoardDelta,
    attackers,
    defenders,
    minAttackerVal
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
        const isUnderDefended = attackers.length > defenders.length && minAttackerVal <= myVal;
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

  threats.sort((a, b) => b.severity - a.severity);
  return threats;
}

/**
 * 提煉進攻建議（僅從無送子風險的健全著法中挑選）
 */
function findAttackSuggestions(game, evaluatedMoves, bestScore, currentTurn, oppColor, threats) {
  const suggestions = [];
  const seenMoves = new Set();

  const soundMoves = evaluatedMoves.filter(item => !item.isBlunder);

  for (const item of soundMoves) {
    const m = item.move;
    const moveKey = `${m.from}-${m.to}`;
    if (seenMoves.has(moveKey)) continue;

    const safety = item.safety;
    const myVal = PIECE_VALUES[m.piece] || 100;

    let attackType = null;
    let title = '';
    let priority = 0;

    // 情況 A：吃子攻勢
    if (m.captured) {
      const targetVal = PIECE_VALUES[m.captured];

      if (!safety.isAttacked && safety.targetExchangeDelta >= targetVal - 20) {
        attackType = 'free-capture';
        title = `🎯 吃子斬獲：${m.san} (淨賺 ${PIECE_SHORT[m.captured]})`;
        priority = 95 + targetVal / 10;
      } else if (safety.targetExchangeDelta >= 80) {
        attackType = 'favorable-trade';
        title = `⚔️ 贏得兌換：${m.san} (吃 ${PIECE_SHORT[m.captured]})`;
        priority = 88 + safety.targetExchangeDelta / 10;
      } else if (targetVal >= myVal && safety.targetExchangeDelta >= 0 && item.score >= bestScore - 30) {
        attackType = 'equal-trade';
        title = `⚔️ 主動兌子：${m.san} (兌換 ${PIECE_SHORT[m.captured]})`;
        priority = 72;
      }
    }

    // 情況 B：捉雙 (Fork) 戰術判定
    if (!attackType && safety.isUncontested) {
      game.move(m);
      const attackedPieces = [];
      for (let r = 8; r >= 1; r--) {
        for (let f = 0; f < 8; f++) {
          const sq = 'abcdefgh'[f] + r;
          const targetPiece = game.get(sq);
          if (targetPiece && targetPiece.color === oppColor) {
            const isHit = game.attackers(sq, currentTurn).includes(m.to);
            const targetVal = PIECE_VALUES[targetPiece.type];
            if (isHit && (targetVal > myVal || targetPiece.type === 'k' || !game.isAttacked(sq, oppColor))) {
              attackedPieces.push({ square: sq, type: targetPiece.type });
            }
          }
        }
      }
      game.undo();

      if (attackedPieces.length >= 2) {
        attackType = 'fork';
        title = `🔱 捉雙戰術：${m.san} (同時攻擊雙子)`;
        priority = 90;
      }
    }

    // 情況 C：安全將軍 (Check) 攻勢
    if (!attackType && item.inCheck && (item.rawScore >= 50000 || safety.isUncontested || safety.targetExchangeDelta >= 80)) {
      attackType = 'check';
      title = `⚡ 將軍突擊：${m.san} (攻擊國王)`;
      priority = item.rawScore >= 50000 ? 120 : 85;
    }

    // 情況 D：安全爭奪核心中心格 (e4, d4, e5, d5)
    if (!attackType && !m.captured && safety.isUncontested && ['d4', 'e4', 'd5', 'e5'].includes(m.to) && ['p', 'n', 'b'].includes(m.piece)) {
      attackType = 'center-control';
      title = `🏰 爭奪中心：${m.san} (壓迫中路)`;
      priority = 65 + (item.score - bestScore) / 20;
    }

    // 情況 E：安全兵線挺進突破
    if (!attackType && !m.captured && safety.isUncontested && m.piece === 'p' && (m.to[1] === '5' || m.to[1] === '4')) {
      attackType = 'pawn-push';
      title = `🔥 兵線挺進：${m.san} (壓縮空間)`;
      priority = 55 + (item.score - bestScore) / 20;
    }

    if (attackType) {
      seenMoves.add(moveKey);
      suggestions.push({
        type: 'attack',
        attackType,
        move: m,
        safety,
        title,
        explanation: '',
        tacticalPurpose: '',
        followUp: '',
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

    if (suggestions.length >= 4) break;
  }

  suggestions.sort((a, b) => b.priority - a.priority);
  return suggestions.slice(0, 2);
}

/**
 * 提煉防守建議（僅從無送子風險且真正能化解威脅的著法中挑選）
 */
function findDefenseSuggestions(game, evaluatedMoves, bestScore, baseMaterial, threats, currentTurn, oppColor) {
  const suggestions = [];
  const seenMoves = new Set();

  const soundMoves = evaluatedMoves.filter(item => !item.isBlunder);
  const candidatePool = soundMoves.length > 0 ? soundMoves : evaluatedMoves.slice(0, 2);

  // 若當前在將軍狀態，解將為最高防守優先級
  if (game.inCheck()) {
    for (const item of candidatePool) {
      const m = item.move;
      const moveKey = `${m.from}-${m.to}`;
      if (seenMoves.has(moveKey)) continue;

      seenMoves.add(moveKey);
      suggestions.push({
        type: 'defense',
        defenseType: 'evade-check',
        move: m,
        safety: item.safety,
        title: `🛡️ 解除將軍：${m.san}`,
        explanation: '',
        tacticalPurpose: '',
        followUp: '',
        priority: 100 + (item.score - bestScore) / 20,
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

  // 若有受威脅棋子，優先尋求反吃、安全撤退或真正有效的增援
  if (threats.length > 0) {
    const highestThreat = threats[0];
    const targetSq = highestThreat.square;

    for (const item of soundMoves) {
      const m = item.move;
      const moveKey = `${m.from}-${m.to}`;
      if (seenMoves.has(moveKey)) continue;

      const safety = item.safety;

      let defenseType = null;
      let title = '';
      let priority = 0;

      // 策略 1：吃掉攻擊者
      if (m.to === highestThreat.attackerSquare && safety.targetExchangeDelta >= -20) {
        defenseType = 'eliminate-threat';
        title = `⚔️ 反擊威脅：${m.san} (拔除攻擊子)`;
        priority = 98 + highestThreat.severity / 100;
      }

      // 策略 2：受威脅棋子撤退至真正安全的格點
      if (!defenseType && m.from === targetSq && safety.isUncontested) {
        defenseType = 'retreat';
        title = `🛡️ 安全撤退：${m.san} (避開攻擊)`;
        priority = 95 + highestThreat.severity / 100;
      }

      // 策略 3：增援守護
      if (!defenseType && m.from !== targetSq && safety.isUncontested) {
        game.move(m);
        const newDefenders = game.attackers(targetSq, currentTurn);
        let targetSaved = false;
        if (newDefenders.includes(m.to)) {
          const matAfterTarget = resolveSquareExchange(game, targetSq, currentTurn);
          targetSaved = (matAfterTarget - baseMaterial) >= -30;
        }
        game.undo();

        if (targetSaved) {
          defenseType = 'reinforce';
          title = `🛡️ 增援守護：${m.san} (鞏固防線)`;
          priority = 80 + highestThreat.severity / 200;
        }
      }

      if (defenseType) {
        seenMoves.add(moveKey);
        suggestions.push({
          type: 'defense',
          defenseType,
          move: m,
          safety,
          title,
          explanation: '',
          tacticalPurpose: '',
          followUp: '',
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

  // 策略 4：王車易位 (Castling) 穩固王翼
  if (suggestions.length < 2) {
    for (const item of soundMoves) {
      const m = item.move;
      const isCastle = m.flags && (m.flags.includes('k') || m.flags.includes('q'));
      if (isCastle && !seenMoves.has(`${m.from}-${m.to}`)) {
        seenMoves.add(`${m.from}-${m.to}`);
        suggestions.push({
          type: 'defense',
          defenseType: 'castle',
          move: m,
          safety: item.safety,
          title: `🏰 王車易位：${m.san} (王城安全)`,
          explanation: '',
          tacticalPurpose: '',
          followUp: '',
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

  // 策略 5：穩健無瑕佈局走步
  if (suggestions.length === 0 && soundMoves.length > 0) {
    const safePositional = soundMoves.filter(x => x.safety.isUncontested);
    const pool = safePositional.length > 0 ? safePositional : soundMoves;
    const pick = pool.length > 1 ? pool[1] : pool[0];
    const m = pick.move;
    suggestions.push({
      type: 'defense',
      defenseType: 'positional',
      move: m,
      safety: pick.safety,
      title: `🛡️ 穩健佈局：${m.san}`,
      explanation: '',
      tacticalPurpose: '',
      followUp: '',
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
function formatBestSuggestion(game, bestItem, currentTurn, oppColor, threats) {
  if (!bestItem) return null;
  const m = bestItem.move;

  return {
    type: 'best',
    move: m,
    safety: bestItem.safety,
    san: m.san,
    title: `🏆 最佳推薦著法：${m.san}`,
    explanation: '',
    tacticalPurpose: '',
    followUp: '',
    score: (bestItem.rawScore / 100).toFixed(1),
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
