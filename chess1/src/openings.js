import { MRONG_COURSES } from './mrong-courses.js';
// Comprehensive Database of 12 Major Chess Openings with Step-by-Step Strategic Guides

export const OPENINGS_DATABASE = [
  {
    id: 'italian-game',
    name: '義大利開局 (Italian Game)',
    subtitle: '最經典優雅的王兵開局，強調控制中心與瞄準 f7 弱點',
    category: '開放性對局 (1. e4 e5)',
    difficulty: '適合初學者與進階者',
    description: '義大利開局是西洋棋歷史上最古老的開局之一，源自 16 世紀義大利大師。其核心理念是迅速發展王翼輕子，主教佔領具有強大壓迫力的 c4 格，直接瞄準黑方只有王守衛的脆弱 f7 點，同時準備推動 c3 與 d4 構建堅實的雙兵中心。',
    principles: [
      '佔領與控制中央 d4、e5 格點',
      '迅速發展輕子 (騎士在 f3、主教在 c4)',
      '瞄準黑方國王身邊唯一的脆弱點 f7',
      '準備王車易位確保國王安全，再伺機以 c3-d4 發動中央突破'
    ],
    moves: [
      {
        from: 'e2', to: 'e4', san: 'e4', side: 'w',
        title: '1. e4 - 開局第一步：佔領中心',
        explanation: '白方將王前兵推向中央，控制重要的 d5 和 f5 格，同時為白方皇后與王翼主教打開出路，是最具進攻性的首步。',
        concept: '中心控制與展開線路'
      },
      {
        from: 'e7', to: 'e5', san: 'e5', side: 'b',
        title: '1... e5 - 黑方針鋒相對',
        explanation: '黑方同樣將王前兵推進兩格，阻止白方進一步推 d4 兵霸佔中心，雙方在中央形成對峙。',
        concept: '對等對抗與空間爭奪'
      },
      {
        from: 'g1', to: 'f3', san: 'Nf3', side: 'w',
        title: '2. Nf3 - 出騎士並展開攻擊',
        explanation: '遵循「先出輕子、後動重子」的原則。騎士來到最佳發展格 f3，控制 d4 格並直接威脅黑方的 e5 兵。',
        concept: '發展帶先手 (攻擊目標)'
      },
      {
        from: 'b8', to: 'c6', san: 'Nc6', side: 'b',
        title: '2... Nc6 - 防守與出子兼備',
        explanation: '黑方出動后翼騎士至 c6，既穩穩保護了 e5 兵，又控制了中央 d4 格，是最標準的應手。',
        concept: '鞏固防線與子力出動'
      },
      {
        from: 'f1', to: 'c4', san: 'Bc4', side: 'w',
        title: '3. Bc4 - 標誌性的一步：義大利開局！',
        explanation: '主教進駐優質斜線，直接瞄準黑方全盤最薄弱的 f7 格（該格開局時僅有國王防守）。這一步正式進入義大利開局。',
        concept: '施壓弱點與準備易位'
      },
      {
        from: 'f8', to: 'c5', san: 'Bc5', side: 'b',
        title: '3... Bc5 - 靜謐對局 (Giuoco Piano)',
        explanation: '黑方主教同樣來到 c5 好格，控制 d4 格，阻止白方輕易下出 d4，雙方展開經典的對稱平衡陣型。',
        concept: '對等發展與防制中路'
      },
      {
        from: 'c2', to: 'c3', san: 'c3', side: 'w',
        title: '4. c3 - 籌備中央雙兵大軍',
        explanation: '極具戰略眼光的一步！白方不急於易位，而是用 c 兵支持即將到來的 d2-d4 衝擊，謀求建立 e4 + d4 的統治級中央。',
        concept: '兵型架構與中央構築'
      },
      {
        from: 'g8', to: 'f6', san: 'Nf6', side: 'b',
        title: '4... Nf6 - 黑方反擊白方中央',
        explanation: '黑方不坐以待斃，出動王翼騎士直接反擊白方缺乏保護的 e4 兵，並準備盡快短易位。',
        concept: '圍魏救趙與反制攻擊'
      },
      {
        from: 'd2', to: 'd4', san: 'd4', side: 'w',
        title: '5. d4 - 白方引爆中央！',
        explanation: '白方貫徹戰略意圖，推動 d4 兵同時攻擊黑方 c5 主教與 e5 兵，考驗黑方的戰術理解。',
        concept: '中央決戰'
      },
      {
        from: 'e5', to: 'd4', san: 'exd4', side: 'b',
        title: '5... exd4 - 黑方兌換兵力',
        explanation: '黑方別無良策，必須吃掉 d4 兵以釋放中央壓力。',
        concept: '緩解空間擠壓'
      },
      {
        from: 'c3', to: 'd4', san: 'cxd4', side: 'w',
        title: '6. cxd4 - 白方重組中央雙兵',
        explanation: '白方用 c 兵吃回，成功建立起可怕的 e4 + d4 雙兵中心，並迫使黑方 c5 主教移動。',
        concept: '中央優勢確立'
      },
      {
        from: 'c5', to: 'b4', san: 'Bb4+', side: 'b',
        title: '6... Bb4+ - 黑方關鍵的將軍反擊',
        explanation: '黑方不能後退象，必須走 Bb4+ 爭取一手先手時間（Tempo），牽制白方並為自己王翼易位贏得喘息之機！',
        concept: '先手牽制防守'
      }
    ]
  },
  {
    id: 'ruy-lopez',
    name: '西班牙開局 (Ruy Lopez)',
    subtitle: '王兵開局的試金石，大師與世界冠軍最信賴的武器',
    category: '開放性對局 (1. e4 e5)',
    difficulty: '戰略縱深極高',
    description: '西班牙開局（路易·羅培茲開局）已有逾 500 年歷史，是西洋棋史上研究最透徹、最深奧的開局。白方透過 3. Bb5 間接向保護 e5 的 c6 騎士施加壓力，謀求在長遠的中局掌控中心與空間優勢。',
    principles: [
      '以主教壓迫 c6 騎士，間接威脅 e5 兵',
      '迅速短易位確保王部安全',
      '利用 c3-d4 慢慢構築中央優勢',
      '長遠調動輕子至王翼製造攻擊'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 佔據中央', explanation: '控制中央 d5、f5 格，為后與象開道。', concept: '中心爭奪' },
      { from: 'e7', to: 'e5', san: 'e5', side: 'b', title: '1... e5 - 黑方對等應對', explanation: '阻止白方直接形成雙兵中心。', concept: '阻滯中心' },
      { from: 'g1', to: 'f3', san: 'Nf3', side: 'w', title: '2. Nf3 - 攻擊 e5 兵', explanation: '出子並威脅對手目標。', concept: '先手發展' },
      { from: 'b8', to: 'c6', san: 'Nc6', side: 'b', title: '2... Nc6 - 防守 e5', explanation: '最自然的防守手，兼顧中央控制。', concept: '子力防禦' },
      {
        from: 'f1', to: 'b5', san: 'Bb5', side: 'w',
        title: '3. Bb5 - 西班牙開局標誌！',
        explanation: '白象來到 b5，牽制與威脅黑方 c6 騎士。雖然目前還不能直接吃馬贏兵，但已在黑方陣型埋下巨大的戰略隱患。',
        concept: '間接施壓'
      },
      {
        from: 'a7', to: 'a6', san: 'a6', side: 'b',
        title: '3... a6 - 摩菲防禦 (Morphy Defence)',
        explanation: '黑方傳奇大師摩菲推廣的一步！逼問白象意圖：是要在 c6 兌換，還是後退？',
        concept: '化被動為主動'
      },
      {
        from: 'b5', to: 'a4', san: 'Ba4', side: 'w',
        title: '4. Ba4 - 白象保持壓力',
        explanation: '白方不急於兌換，後退至 a4 依然維持對 c6 騎士的斜線牽制，保留局面張力。',
        concept: '保留張力'
      },
      {
        from: 'g8', to: 'f6', san: 'Nf6', side: 'b',
        title: '4... Nf6 - 黑方反擊 e4 兵',
        explanation: '出動騎士攻擊白方 e4 兵，加速王翼發展。',
        concept: '王翼發展'
      },
      {
        from: 'e1', to: 'g1', san: 'O-O', side: 'w',
        title: '5. O-O - 白方短易位！',
        explanation: '極具氣度的一步！白方完全不在乎 e4 兵被吃（若黑走 Nxe4，白方有 Re1 奪回主動並佔領開放線）。國王迅速歸入堡壘。',
        concept: '國王安全第一'
      },
      {
        from: 'f8', to: 'e7', san: 'Be7', side: 'b',
        title: '5... Be7 - 黑方冷靜出象準備易位',
        explanation: '黑方不冒險吃兵，冷靜將主教出至 e7 解除牽制，準備下回合也進行短易位。',
        concept: '穩健部署'
      }
    ]
  },
  {
    id: 'sicilian-defense',
    name: '西西里防禦 (Sicilian Defense)',
    subtitle: '黑方勝率最高的不對稱反擊體系，戰術混戰的代名詞',
    category: '半開放對局 (1. e4 c5)',
    difficulty: '極具進攻性與戰術計算',
    description: '當白方走出 1. e4 時，1... c5 是黑方最強勁、勝率最高的回應。黑方不用對稱的 e5，而是用側翼 c 兵換取白方中央 d 兵，為自己爭取到一條半開放的 c 線，在中局擁有強大的后翼反擊潛力。',
    principles: [
      '不對稱作戰：拒絕平淡的對稱平衡',
      '用邊兵換取白方中心 d4 兵，獲得中央兵力優勢',
      '利用半開放 c 線向白方后翼發動壓迫',
      '黑方常常發起致命的戰術反擊'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 白方佔據中央', explanation: '控制 d5、f5 格，展開子力路線。', concept: '中央控制' },
      {
        from: 'c7', to: 'c5', san: 'c5', side: 'b',
        title: '1... c5 - 西西里防禦！',
        explanation: '黑方控制 d4 格。若白方走 d4，黑將用邊兵換走白方中心兵，創造不對稱的激烈動態戰局。',
        concept: '不對稱反擊'
      },
      {
        from: 'g1', to: 'f3', san: 'Nf3', side: 'w',
        title: '2. Nf3 - 準備推進 d4',
        explanation: '白方最自然的走法，為即將到來的 d2-d4 衝擊做足子力支援。',
        concept: '開局準備'
      },
      {
        from: 'd7', to: 'd6', san: 'd6', side: 'b',
        title: '2... d6 - 鞏固空間與防守 e5',
        explanation: '控制 e5 和 c5 格，為白格象打開出路，防止白兵跳進 e5。',
        concept: '格子控制'
      },
      {
        from: 'd2', to: 'd4', san: 'd4', side: 'w',
        title: '3. d4 - 開放西西里 (Open Sicilian)',
        explanation: '白方毅然推動 d4 打開局面，尋求快速出子與進攻機會。',
        concept: '打開局面'
      },
      {
        from: 'c5', to: 'd4', san: 'cxd4', side: 'b',
        title: '3... cxd4 - 黑方落實策略',
        explanation: '黑方如願以償用 c 兵換掉白方的中心 d 兵，獲得 c 線半開放優勢。',
        concept: '戰略兌換'
      },
      {
        from: 'f3', to: 'd4', san: 'Nxd4', side: 'w',
        title: '4. Nxd4 - 騎士佔據中央要塞',
        explanation: '白騎士來到 d4 核心位置，具備極佳的輻射威懾力。',
        concept: '中央佔領'
      },
      {
        from: 'g8', to: 'f6', san: 'Nf6', side: 'b',
        title: '4... Nf6 - 攻擊 e4 兵',
        explanation: '黑方出子並立刻攻擊白方懸空的 e4 兵，逼白方防守。',
        concept: '迫使回應'
      },
      {
        from: 'b1', to: 'c3', san: 'Nc3', side: 'w',
        title: '5. Nc3 - 穩健防守 e4',
        explanation: '騎士來到最佳防禦與出子格，保住 e4 兵。',
        concept: '穩固防線'
      },
      {
        from: 'a7', to: 'a6', san: 'a6', side: 'b',
        title: '5... a6 - 那道爾夫變例 (Najdorf)',
        explanation: '西西里防禦的皇冠明珠！防止白方騎士或主教跳入 b5，並為黑方在后翼推 b5 擴展空間做準備。世界冠軍 Fischer 與 Kasparov 的終身利器！',
        concept: '預防與后翼反擊'
      }
    ]
  },
  {
    id: 'french-defense',
    name: '法蘭西防禦 (French Defense)',
    subtitle: '無堅不摧的固態防禦，以強韌兵鏈抗衡白方攻勢',
    category: '半開放對局 (1. e4 e6)',
    difficulty: '考驗兵型理解與反擊時機',
    description: '法蘭西防禦由 1. e4 e6 開始，黑方第二步直接推進 2... d5 挑戰白方中央。黑方建立起極為厚實的 e6-d5 兵鏈，承受白方在王翼的壓力，隨後透過 c5 攻擊白方兵鏈根基 d4，是反客為主的經典體系。',
    principles: [
      '構建 e6 + d5 兵鏈抗衡白方中心',
      '以 c7-c5 猛烈轟擊白方兵鏈根部 d4',
      '注意解決「法蘭西壞象」(c8 白格象常被自身兵鏈封鎖)',
      '在后翼與中央發起強烈反擊'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 白方推進中央', explanation: '控制中央核心格。', concept: '空間擴展' },
      {
        from: 'e7', to: 'e6', san: 'e6', side: 'b',
        title: '1... e6 - 法蘭西防禦起手',
        explanation: '黑方準備在下一步以 d7-d5 猛烈衝擊白方中心。',
        concept: '厚積薄發'
      },
      {
        from: 'd2', to: 'd4', san: 'd4', side: 'w',
        title: '2. d4 - 白方建立完美雙兵中心',
        explanation: '黑方第一手沒佔中央，白方毫不客氣拿下 e4 + d4 雙兵核心！',
        concept: '完全控制中心'
      },
      {
        from: 'd7', to: 'd5', san: 'd5', side: 'b',
        title: '2... d5 - 黑方正面迎擊',
        explanation: '黑兵在 e6 支持下進攻 e4，立刻考驗白方對中心的處置方式。',
        concept: '正面挑戰'
      },
      {
        from: 'b1', to: 'c3', san: 'Nc3', side: 'w',
        title: '3. Nc3 - 保衛中央並出子',
        explanation: '經典變例。白方不出兵兌換，而是出動騎士保衛 e4 兵並維持張力。',
        concept: '防禦中心'
      },
      {
        from: 'g8', to: 'f6', san: 'Nf6', side: 'b',
        title: '3... Nf6 - 增加對 e4 的壓力',
        explanation: '黑方出動騎士雙重攻擊 e4 兵。',
        concept: '加壓威脅'
      },
      {
        from: 'c1', to: 'g5', san: 'Bg5', side: 'w',
        title: '4. Bg5 - 牽制黑方騎士',
        explanation: '白象走出兵鏈，牽制威脅黑方的 f6 騎士（將其釘死在 d8 皇后前）。',
        concept: '牽制先手'
      },
      {
        from: 'f8', to: 'e7', san: 'Be7', side: 'b',
        title: '4... Be7 - 解除牽制',
        explanation: '黑方將主教置於國王前方，化解 Bg5 的牽制威脅。',
        concept: '解除威脅'
      },
      {
        from: 'e4', to: 'e5', san: 'e5', side: 'w',
        title: '5. e5 - 鎖死中央兵鏈！',
        explanation: '白方將兵推進至 e5，奪取王翼巨大空間，並迫使黑方 f6 騎士後退。',
        concept: '空間優勢確立'
      },
      {
        from: 'f6', to: 'd7', san: 'Nfd7', side: 'b',
        title: '5... Nfd7 - 騎士退守反擊點',
        explanation: '騎士退守 d7，下一步黑方將發動 c5 轟擊白方 d4 兵的戰略反撲！',
        concept: '重整旗鼓'
      }
    ]
  },
  {
    id: 'caro-kann',
    name: '卡羅-康防禦 (Caro-Kann Defense)',
    subtitle: '堅如磐石的防禦之盾，完美避開壞象困局',
    category: '半開放對局 (1. e4 c6)',
    difficulty: '穩健型選手最佳選擇',
    description: '卡羅-康防禦深受防守反擊大師（如 Karpov）喜愛。與法蘭西防禦類似，黑方準備推 d5，但黑方是用 1... c6 支持，這使得黑方的 c8 白格主教不會被關在兵鏈裡面，能自由發展至 f5 或 g4，兵型架構極為健康純粹。',
    principles: [
      '以 1... c6 蓄力，在 2... d5 全力爭奪中心',
      '將白格象成功發展至兵鏈外側 (Bf5)',
      '保持無破綻的兵型結構，令白方難以找到進攻突破口',
      '在中殘局以卓越的兵型品質獲取勝機'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 白方推進中央', explanation: '控制中心核心格子。', concept: '佔中' },
      {
        from: 'c7', to: 'c6', san: 'c6', side: 'b',
        title: '1... c6 - 卡羅-康防禦起手',
        explanation: '準備下回合推進 d7-d5。關鍵優勢是保留了 c8-h3 斜線，白格象可以出入自如。',
        concept: '堅實籌備'
      },
      {
        from: 'd2', to: 'd4', san: 'd4', side: 'w',
        title: '2. d4 - 白方順勢佔中',
        explanation: '形成理想的 e4 + d4 雙兵核心。',
        concept: '擴展空間'
      },
      {
        from: 'd7', to: 'd5', san: 'd5', side: 'b',
        title: '2... d5 - 衝擊白方中心兵',
        explanation: '在 c6 兵支援下，直接威脅白方 e4 兵。',
        concept: '中心交火'
      },
      {
        from: 'b1', to: 'c3', san: 'Nc3', side: 'w',
        title: '3. Nc3 - 經典變例防守',
        explanation: '出動騎士保護 e4 兵。',
        concept: '子力保護'
      },
      {
        from: 'd5', to: 'e4', san: 'dxe4', side: 'b',
        title: '3... dxe4 - 黑方吃兵簡化',
        explanation: '黑方消除中央對峙，準備將棋局帶入自己熟悉的穩健路線。',
        concept: '局面澄清'
      },
      {
        from: 'c3', to: 'e4', san: 'Nxe4', side: 'w',
        title: '4. Nxe4 - 白騎士吃回',
        explanation: '白騎士來到中央中心點。',
        concept: '中央集結'
      },
      {
        from: 'c8', to: 'f5', san: 'Bf5', side: 'b',
        title: '4... Bf5 - 主教神勇出動！',
        explanation: '這是卡羅-康防禦的靈魂一步！黑方主教在推動 e6 之前搶先來到兵鏈外側，直接威脅白方 e4 騎士，沒有壞象之苦。',
        concept: '活躍好象'
      },
      {
        from: 'e4', to: 'g3', san: 'Ng3', side: 'w',
        title: '5. Ng3 - 騎士避讓並反擊象',
        explanation: '白方將騎士移至 g3 避開攻擊，同時威脅黑方 f5 主教。',
        concept: '先手轉移'
      },
      {
        from: 'f5', to: 'g6', san: 'Bg6', side: 'b',
        title: '5... Bg6 - 主教安然撤退',
        explanation: '主教撤至 g6 安全斜線，黑方陣營毫無破綻，準備走 e6、Nd7，陣勢固若金湯。',
        concept: '長久穩健'
      }
    ]
  },
  {
    id: 'queens-gambit',
    name: '后翼棄兵 (Queen\'s Gambit)',
    subtitle: '當代國際象棋大師的必備經典，棋后與世界棋王的最愛',
    category: '封閉性對局 (1. d4 d5)',
    difficulty: '頂級戰略素養與空間控制',
    description: '后翼棄兵是歷史上最著名的開局之一（美劇《后翼棄兵》讓其紅遍全球）。白方在 1. d4 d5 後下出 2. c4，假裝犧牲邊上的 c 兵，企圖誘使黑方放棄 d5 中心。若黑方吃兵，白方可輕易奪回並完全霸佔中心；若黑方拒吃，白方則在后翼累積強大推力。',
    principles: [
      '以 c4 兵攻擊黑方 d5 中心支柱',
      '若黑方吃兵 (QGA)，白方可用 e4 迅速奪回中心',
      '若黑方保兵 (QGD)，白方在中央享有長期主動權',
      '掌握開放 c 線與中央重兵推進'
    ],
    moves: [
      {
        from: 'd2', to: 'd4', san: 'd4', side: 'w',
        title: '1. d4 - 后兵開局',
        explanation: '推進中心 d 兵，不像 1. e4 那樣脆弱，因為 d4 兵從第一步就受到白皇后的保護。',
        concept: '穩固中心'
      },
      {
        from: 'd7', to: 'd5', san: 'd5', side: 'b',
        title: '1... d5 - 黑方寸步不讓',
        explanation: '黑方同樣推 d5 阻擋白兵並佔領中央。',
        concept: '中心制衡'
      },
      {
        from: 'c2', to: 'c4', san: 'c4', side: 'w',
        title: '2. c4 - 后翼棄兵！',
        explanation: '開局標誌！白方用邊側 c 兵換取黑方中心 d 兵。這不是真棄兵，因為白方後續隨時能透過 Qa4+ 或 e3 拿回兵力。',
        concept: '戰略誘餌'
      },
      {
        from: 'e7', to: 'e6', san: 'e6', side: 'b',
        title: '2... e6 - 拒吃后翼棄兵 (QGD)',
        explanation: '最正統大師級應手。黑方拒絕吃兵，用 e 兵牢牢釘死 d5 中心要塞。',
        concept: '中心定力'
      },
      {
        from: 'b1', to: 'c3', san: 'Nc3', side: 'w',
        title: '3. Nc3 - 加倍施壓 d5',
        explanation: '白方出動騎士，對黑方的 d5 兵形成雙重打擊。',
        concept: '增加壓力'
      },
      {
        from: 'g8', to: 'f6', san: 'Nf6', side: 'b',
        title: '3... Nf6 - 增強防守',
        explanation: '黑方出騎士保護 d5 兵，並準備王翼出子。',
        concept: '防守平衡'
      },
      {
        from: 'c1', to: 'g5', san: 'Bg5', side: 'w',
        title: '4. Bg5 - 牽制防守主力',
        explanation: '白象走出兵鏈釘死 f6 騎士，摧毀黑方對 d5 的核心防守力量。',
        concept: '削弱防禦'
      },
      {
        from: 'f8', to: 'e7', san: 'Be7', side: 'b',
        title: '4... Be7 - 解除釘死',
        explanation: '黑主教擋在國王前，解除牽制並準備短易位。',
        concept: '化解牽制'
      },
      {
        from: 'e2', to: 'e3', san: 'e3', side: 'w',
        title: '5. e3 - 鞏固中心並為白格象開路',
        explanation: '白方在主教已出動的情況下關閉兵鏈，固若金湯，準備 Bf1-d3 與短易位。',
        concept: '全盤協調'
      },
      {
        from: 'e8', to: 'g8', san: 'O-O', side: 'b',
        title: '5... O-O - 黑方率先完成短易位',
        explanation: '黑方將王移入王翼安全區，開局佈陣圓滿完成。',
        concept: '王入安全堡壘'
      }
    ]
  },
  {
    id: 'kings-gambit',
    name: '王翼棄兵 (King\'s Gambit)',
    subtitle: '19 世紀浪漫主義的熱血戰歌，向死而生的進攻風暴',
    category: '開放性對局 (1. e4 e5)',
    difficulty: '極度狂暴刺殺，容錯率低',
    description: '在西洋棋浪漫主義黃金時代，王翼棄兵是最受尊崇的戰法。白方在第 2 步大膽走出 2. f4，直接拿守護國王的 f 兵做犧牲！目的就是徹底破壞黑方中心，打開 f 線利用半開放線瘋狂進攻黑方的 f7 致命弱點。',
    principles: [
      '第二步棄 f 兵以粉碎黑方中心並開闢 f 線',
      '迅速出象至 c4 瞄準黑王致命要害 f7',
      '以空間與狂暴先手換取一個兵的劣勢',
      '追求極限戰術棄子與王翼閃電擊殺'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 佔據中心', explanation: '常規開局推進。', concept: '空間' },
      { from: 'e7', to: 'e5', san: 'e5', side: 'b', title: '1... e5 - 黑方針鋒相對', explanation: '守住中心 e5 格。', concept: '平衡' },
      {
        from: 'f2', to: 'f4', san: 'f4', side: 'w',
        title: '2. f4 - 王翼棄兵出鞘！',
        explanation: '浪漫主義的標誌！白方直接用 f 兵向黑方 e5 兵下戰帖，目標是消除黑方中心並打開 f 線進攻黑王！',
        concept: '棄兵搶攻'
      },
      {
        from: 'e5', to: 'f4', san: 'exf4', side: 'b',
        title: '2... exf4 - 接受王翼棄兵 (KGA)',
        explanation: '黑方勇敢吃兵！黑方多了一兵，但白方即將獲得極強的中心與出子動能。',
        concept: '吃下棄兵'
      },
      {
        from: 'g1', to: 'f3', san: 'Nf3', side: 'w',
        title: '3. Nf3 - 騎士關鍵封鎖！',
        explanation: '極端重要的一步！白方必須走 Nf3，防止黑皇后下到底線 Qh4+ 給予致命一擊。',
        concept: '封鎖致命將軍'
      },
      {
        from: 'g7', to: 'g5', san: 'g5', side: 'b',
        title: '3... g5 - 黑方強行護兵',
        explanation: '黑方不惜挺進王翼邊兵，誓死保住多出的 f4 兵，局面走向殊死決戰！',
        concept: '爭奪兵力'
      },
      {
        from: 'f1', to: 'c4', san: 'Bc4', side: 'w',
        title: '4. Bc4 - 奪命主教瞄準 f7',
        explanation: '白主教來到最具威懾力的位置，直線瞄準黑王最柔弱的 f7 軟肋。',
        concept: '鎖定殺招目標'
      },
      {
        from: 'g5', to: 'g4', san: 'g4', side: 'b',
        title: '4... g4 - 黑方反擊驅逐騎士',
        explanation: '黑方繼續衝擊，企圖驅逐 f3 騎士後讓皇后進入 h4 將軍！',
        concept: '極限進逼'
      },
      {
        from: 'e1', to: 'g1', san: 'O-O', side: 'w',
        title: '5. O-O - 穆齊奧棄子大祭 (Muzio Gambit)！',
        explanation: '全盤最驚心動魄的傑作！白方甚至連整隻騎士都棄掉！直接短易位，將車放在 f 線上，為全盤總攻黑方 f7 吹響號角！',
        concept: '驚天動地的戰術犧牲'
      }
    ]
  },
  {
    id: 'kings-indian',
    name: '國王印度防禦 (King\'s Indian Defense)',
    subtitle: '超現代主義的狂熱代表，Kasparov 的殺戮王牌',
    category: '印度防禦體系 (1. d4 Nf6)',
    difficulty: '極度依賴中局宏觀構思與戰術膽識',
    description: '國王印度防禦（KID）徹底顛覆了古典中心理論。黑方開局故意不搶中央，放任白方建立起 d4、c4、e4 的龐大中央；隨後黑方透過堡壘象（Fianchetto）、d6 與短易位完成深蹲，在合適時機以 e5 炸開中央，並在王翼掀起驚天動地的刺殺！',
    principles: [
      '誘敵深入：先讓白方建立龐大中央，使其兵線過度延伸',
      '王翼側翼堡壘象 (g6 + Bg7) 掌控長對角線',
      '關鍵衝擊步：以 e7-e5 或 c7-c5 爆破白方中心',
      '在王翼發動全員刺殺白王'
    ],
    moves: [
      { from: 'd2', to: 'd4', san: 'd4', side: 'w', title: '1. d4 - 白后兵開局', explanation: '控制中心空間。', concept: '白方佔領' },
      {
        from: 'g8', to: 'f6', san: 'Nf6', side: 'b',
        title: '1... Nf6 - 靈活的印度防禦起步',
        explanation: '黑方不出兵佔中心，先出騎士控制 e4 和 d5 格。',
        concept: '彈性牽制'
      },
      {
        from: 'c2', to: 'c4', san: 'c4', side: 'w',
        title: '2. c4 - 白方擴大后翼空間',
        explanation: '爭取 d5 空間，準備下一步走 Nc3 支援 e4。',
        concept: '空間壓制'
      },
      {
        from: 'g7', to: 'g6', san: 'g6', side: 'b',
        title: '2... g6 - 準備搭建側翼保壘',
        explanation: '黑方準備將主教安放在 g7，俯瞰整條 a1-h8 核心長斜線。',
        concept: '堡壘佈局'
      },
      {
        from: 'b1', to: 'c3', san: 'Nc3', side: 'w',
        title: '3. Nc3 - 準備推動 e4',
        explanation: '白方出動騎士支援中央。',
        concept: '中央支援'
      },
      {
        from: 'f8', to: 'g7', san: 'Bg7', side: 'b',
        title: '3... Bg7 - 堡壘象就位',
        explanation: '黑格象如同一門重炮，長遠威脅白方的中心與后翼。',
        concept: '長斜線控制'
      },
      {
        from: 'e2', to: 'e4', san: 'e4', side: 'w',
        title: '4. e4 - 白方龐大中央成形',
        explanation: '白方如願以償建立起 c4 + d4 + e4 的巨型中心！',
        concept: '古典中央'
      },
      {
        from: 'd7', to: 'd6', san: 'd6', side: 'b',
        title: '4... d6 - 阻止白兵進逼',
        explanation: '防止白兵推向 e5，為黑騎士和主教提供立足點。',
        concept: '限制延伸'
      },
      {
        from: 'g1', to: 'f3', san: 'Nf3', side: 'w',
        title: '5. Nf3 - 正常王翼出子',
        explanation: '白方出騎士準備易位。',
        concept: '全面發展'
      },
      {
        from: 'e8', to: 'g8', san: 'O-O', side: 'b',
        title: '5... O-O - 黑方率先短易位',
        explanation: '黑王安全進入保壘，隨後黑方將發動 e5 展開毀天滅地的中心反攻！',
        concept: '反攻前奏'
      }
    ]
  },
  {
    id: 'scandinavian-defense',
    name: '斯堪地那維亞防禦 (Scandinavian Defense)',
    subtitle: '第一步就宣戰！徹底打亂白方既定部署的直接了當戰法',
    category: '半開放對局 (1. e4 d5)',
    difficulty: '簡單清晰、適合各級棋手',
    description: '當白方走出 1. e4 時，斯堪地那維亞防禦是黑方最直接了當的挑戰！黑方直接走出 1... d5 質問白兵。白方通常吃兵，黑皇后出動，隨後退守 a5 或 d6，黑方迅速展開各路輕子，避免被白方的複雜理論所套路。',
    principles: [
      '第一手直接挑戰白方 e4 兵',
      '若白方 2. exd5，黑方迅速出子並確保皇后安全退守 (Qa5)',
      '及早開闢空間發展兩翼主教 (Bf5/Bg4)',
      '兵型整齊乾淨，容易上手理解'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 白方推進王前兵', explanation: '常規中心佔領。', concept: '空間' },
      {
        from: 'd7', to: 'd5', san: 'd5', side: 'b',
        title: '1... d5 - 斯堪地那維亞防禦！',
        explanation: '黑方不願進入白方擅長的西班牙或義大利開局，第一手直接強攻白方 e4 兵！',
        concept: '正面宣戰'
      },
      {
        from: 'e4', to: 'd5', san: 'exd5', side: 'w',
        title: '2. exd5 - 白方最佳吃兵應手',
        explanation: '白方吃掉 d5 兵，否則自身中心優勢將蕩然無存。',
        concept: '消除中心威脅'
      },
      {
        from: 'd8', to: 'd5', san: 'Qxd5', side: 'b',
        title: '2... Qxd5 - 黑皇后強勢進駐中央',
        explanation: '黑皇后及早出動吃回兵力，控制棋盤核心視野。',
        concept: '回收兵力'
      },
      {
        from: 'b1', to: 'c3', san: 'Nc3', side: 'w',
        title: '3. Nc3 - 騎士出子並攻擊黑后',
        explanation: '白方遵循「出子帶先手」原則，攻擊黑皇后迫其轉移。',
        concept: '先手出擊'
      },
      {
        from: 'd5', to: 'a5', san: 'Qa5', side: 'b',
        title: '3... Qa5 - 經典皇后安全撤退',
        explanation: '經典的撤退格！皇后在 a5 非常安全，難以被白方輕子騷擾，並沿 a5-e1 斜線維持遠程威懾。',
        concept: '安全前哨'
      },
      {
        from: 'd2', to: 'd4', san: 'd4', side: 'w',
        title: '4. d4 - 白方重奪中央優勢',
        explanation: '白方推 d4 佔據中心並為黑格象開路。',
        concept: '中央空間'
      },
      {
        from: 'g8', to: 'f6', san: 'Nf6', side: 'b',
        title: '4... Nf6 - 黑方加緊出子',
        explanation: '黑方控制 e4 格，準備後續走出 Bf5 或 Bg4。',
        concept: '平衡出動'
      }
    ]
  },
  {
    id: 'london-system',
    name: '倫敦體系 (London System)',
    subtitle: '當今業餘與大師都最愛的萬用金字塔，固若金湯的開局體系',
    category: '封閉性體系 (1. d4 體系)',
    difficulty: '極易掌握、不易犯錯',
    description: '倫敦體系是白方一套極具彈性且幾乎不受黑方著法干擾的通用體系。白方先下 1. d4，然後搶先將黑格象出至 Bf4，再用 e3、c3 構建像金字塔般堅不可摧的中心三角兵陣，隨後穩定出騎士、短易位，在中局擁有強大而穩定的進攻基礎。',
    principles: [
      '在推動 e3 前，搶先將黑格象走出 (Bf4)',
      '以 c3 + d4 + e3 築起無懈可擊的金字塔兵型',
      '將騎士安放在強力的 Ne5 中央前哨',
      '王翼具有隱蔽而致命的殺招機會'
    ],
    moves: [
      { from: 'd2', to: 'd4', san: 'd4', side: 'w', title: '1. d4 - 白方后兵推進', explanation: '控制中心核心格子。', concept: '中心起步' },
      { from: 'd7', to: 'd5', san: 'd5', side: 'b', title: '1... d5 - 黑方對應佔中', explanation: '黑方維持對稱。', concept: '穩健防守' },
      {
        from: 'c1', to: 'f4', san: 'Bf4', side: 'w',
        title: '2. Bf4 - 倫敦體系核心步！',
        explanation: '在關閉兵鏈之前，先將黑格象釋放至活躍的 f4 格，避免成為「壞象」。',
        concept: '好象先行'
      },
      {
        from: 'g8', to: 'f6', san: 'Nf6', side: 'b',
        title: '2... Nf6 - 黑方正常出騎士',
        explanation: '黑方出子控制 e4 和 d5。',
        concept: '常規出子'
      },
      {
        from: 'e2', to: 'e3', san: 'e3', side: 'w',
        title: '3. e3 - 鞏固 d4 中心兵',
        explanation: '白方用 e 兵加強 d4，並為王翼白格象打開出路。',
        concept: '構建金字塔'
      },
      {
        from: 'c7', to: 'c5', san: 'c5', side: 'b',
        title: '3... c5 - 黑方反擊白方中心',
        explanation: '黑方試圖動搖白方的 d4 中心基石。',
        concept: '挑戰陣營'
      },
      {
        from: 'c2', to: 'c3', san: 'c3', side: 'w',
        title: '4. c3 - 金字塔兵型大成！',
        explanation: '白方不吃 c5 兵，而是用 c3 完美支援 d4！形成 c3-d4-e3 鋼鐵三角，黑方任何衝擊都將化為烏有。',
        concept: '鋼鐵防線'
      },
      {
        from: 'b8', to: 'c6', san: 'Nc6', side: 'b',
        title: '4... Nc6 - 黑方加碼施壓',
        explanation: '黑方繼續向白方 d4 施壓。',
        concept: '持續加壓'
      },
      {
        from: 'b1', to: 'd2', san: 'Nd2', side: 'w',
        title: '5. Nd2 - 騎士靈活協調',
        explanation: '白騎士來到 d2 而非 c3（因為 c3 已有兵），保留了隨時支援 e4 或跳至 f3 的彈性。',
        concept: '協同支援'
      }
    ]
  },
  {
    id: 'scotch-game',
    name: '蘇格蘭開局 (Scotch Game)',
    subtitle: '第三步直接引爆中央，Kasparov 擊敗無數名宿的秘密武器',
    category: '開放性對局 (1. e4 e5)',
    difficulty: '適合喜歡開放對局與快速交火的棋手',
    description: '蘇格蘭開局是 1. e4 e5 2. Nf3 Nc6 之後，白方在第 3 步不走西班牙開局的 Bb5，也不走義大利開局的 Bc4，而是直接推進 3. d4！瞬間將局面完全炸開，強迫黑方在開放空間進行刺刀見紅的戰術對攻。',
    principles: [
      '第三手直接下 d4 炸開中央',
      '迅速將騎士居於中央 (Nxd4)',
      '創造開放局面，加快雙方子力直接接觸',
      '避免西班牙開局過於繁雜的長遠理論'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 佔據中心', explanation: '推進王前兵。', concept: '空間' },
      { from: 'e7', to: 'e5', san: 'e5', side: 'b', title: '1... e5 - 黑方防守', explanation: '黑方守護中心。', concept: '對峙' },
      { from: 'g1', to: 'f3', san: 'Nf3', side: 'w', title: '2. Nf3 - 攻擊 e5', explanation: '攻擊黑方目標。', concept: '威脅' },
      { from: 'b8', to: 'c6', san: 'Nc6', side: 'b', title: '2... Nc6 - 防守 e5', explanation: '守護兵力。', concept: '穩固' },
      {
        from: 'd2', to: 'd4', san: 'd4', side: 'w',
        title: '3. d4 - 蘇格蘭開局炸裂！',
        explanation: '白方不等第三回合佈局，直接用 d4 挑戰黑方中心！',
        concept: '中央決裂'
      },
      {
        from: 'e5', to: 'd4', san: 'exd4', side: 'b',
        title: '3... exd4 - 黑方必須吃兵',
        explanation: '黑方別無選擇，吃掉 d4 兵釋放壓力。',
        concept: '應對兌換'
      },
      {
        from: 'f3', to: 'd4', san: 'Nxd4', side: 'w',
        title: '4. Nxd4 - 白騎士稱霸中央',
        explanation: '白騎士來到 d4 核心，局面完全敞開。',
        concept: '中心佔據'
      },
      {
        from: 'f8', to: 'c5', san: 'Bc5', side: 'b',
        title: '4... Bc5 - 黑方主動出象攻擊',
        explanation: '黑方將象出到 c5，直接聯同 Nc6 雙重打擊白方 d4 騎士。',
        concept: '主動挑釁'
      },
      {
        from: 'c1', to: 'e3', san: 'Be3', side: 'w',
        title: '5. Be3 - 白象防守兼備威脅',
        explanation: '白象鞏固 d4 騎士，並暗藏 Nxe6 抽將/抽后的可怕戰術威脅！',
        concept: '暗藏戰術殺機'
      }
    ]
  },
  {
    id: 'nimzo-indian',
    name: '尼姆佐-印度防禦 (Nimzo-Indian Defense)',
    subtitle: '國際象棋最尊貴的防禦之一，以牽制摧毀白方兵型',
    category: '印度防禦體系 (1. d4 Nf6)',
    difficulty: '頂級大師必修的現代經典',
    description: '由傳奇大師尼姆佐維奇創立。當白方走出 1. d4 Nf6 2. c4 e6 3. Nc3 時，黑方立刻走出 3... Bb4！將白方騎士牢牢釘死在國王前。黑方不惜在後續以象換馬，破壞白方兵型造成 c 線疊兵，在中殘局佔盡上風。',
    principles: [
      '以 3... Bb4 牽制白方 c3 騎士，阻止白方輕易下 e4',
      '願意用主教兌換騎士 (Bxc3)，換取破壞白方兵型 (疊兵)',
      '以超現代思維用子力而非兵力控制中心',
      '黑方在殘局擁有結構性優勢'
    ],
    moves: [
      { from: 'd2', to: 'd4', san: 'd4', side: 'w', title: '1. d4 - 白方推進后兵', explanation: '建立中心。', concept: '空間' },
      { from: 'g8', to: 'f6', san: 'Nf6', side: 'b', title: '1... Nf6 - 印度防禦起步', explanation: '阻止白方立即 e4。', concept: '牽制' },
      { from: 'c2', to: 'c4', san: 'c4', side: 'w', title: '2. c4 - 擴充空間', explanation: '白方爭奪 d5 空間。', concept: '爭位' },
      {
        from: 'e7', to: 'e6', san: 'e6', side: 'b',
        title: '2... e6 - 準備出動主教',
        explanation: '為 f8 主教打開出路，準備牽制。',
        concept: '暗度陳倉'
      },
      {
        from: 'b1', to: 'c3', san: 'Nc3', side: 'w',
        title: '3. Nc3 - 準備推進 e4',
        explanation: '白方加緊部署，意圖下回合推 e4 掌控全場。',
        concept: '籌劃霸佔中心'
      },
      {
        from: 'f8', to: 'b4', san: 'Bb4', side: 'b',
        title: '3... Bb4 - 尼姆佐-印度防禦登場！',
        explanation: '黑象將白方 c3 騎士死死釘在 e1 白王前！白方無法推進 e4，戰略構想被黑方當頭棒喝。',
        concept: '絕對牽制'
      },
      {
        from: 'e2', to: 'e3', san: 'e3', side: 'w',
        title: '4. e3 - 魯賓斯坦變例 (Rubinstein)',
        explanation: '最穩健的大師應手。白方穩固中心，準備好以 Bd3 和 Ne2 發展。',
        concept: '穩中求勝'
      },
      {
        from: 'e8', to: 'g8', san: 'O-O', side: 'b',
        title: '4... O-O - 黑方迅速短易位',
        explanation: '黑王安全進入保壘，準備在后續走 d5 或 c5 正式發動全面攻勢。',
        concept: '國王安全'
      }
    ]
  }
,
  ...MRONG_COURSES
];

export function getOpeningById(id) {
  return OPENINGS_DATABASE.find(o => o.id === id) || OPENINGS_DATABASE[0];
}
