// Database of Interactive Chess Courses from Mr Ong Talk (子聰學長說 Mr Ong Talk)
// Based on video transcripts, tactical analysis, and core principles taught on the channel.

export const MRONG_COURSES = [
  {
    id: 'ong-scandinavian-c4',
    name: '斯堪地那維亞防禦：3.c4 貪兵陷阱與暴力出子',
    subtitle: '子聰學長黑方絕招：以棄兵換取超越白方三倍的出子速度！',
    category: '👑 開局體系篇',
    videoId: 'wY6ZxUUAaFs',
    videoUrl: 'https://www.youtube.com/watch?v=wY6ZxUUAaFs',
    videoDuration: '14:24',
    difficulty: '高勝率實戰推薦',
    orientation: 'b',
    description: '子聰學長教學核心：傳統斯堪地那維亞走 2...Qxd5 容易被白方 3.Nc3 先手抓后。學長改良版走 2...Nf6!，若白方貪心走 3.c4 死守兵，黑方立刻以 3...c6! 棄兵強行撕開中心。白方出子嚴重滯後，黑方雙馬雙象全盤開花！',
    principles: [
      '不急著用后吃回兵（2...Nf6），避免白出馬抓后浪費步速',
      '面對白方 3.c4 貪兵，果斷以 3...c6! 棄兵撕開路線',
      '以出子速度為核心武器，雙馬與主教迅速進佔中央要衝',
      '在白王尚未易位前發起排山倒海的中心攻勢'
    ],
    moves: [
      {
        from: 'e2', to: 'e4', san: 'e4', side: 'w',
        title: '1. e4 - 白方王前兵挺進',
        explanation: '白方王兵開局，搶佔中央並打開后象通路。',
        concept: '中心控制'
      },
      {
        from: 'd7', to: 'd5', san: 'd5', side: 'b',
        title: '1... d5 - 針鋒相對的斯堪地那維亞！',
        explanation: '【子聰學長】：應對王兵開局黑方最針鋒相對的走法就是走 d5！直接挑戰白方中心，不給白方舒服佈局。',
        concept: '正統反擊'
      },
      {
        from: 'e4', to: 'd5', san: 'exd5', side: 'w',
        title: '2. exd5 - 白方順理成章吃兵',
        explanation: '白方吃掉 d5 兵。大多數人都以為黑方會用皇后吃回，但這正是陷阱的起點！',
        concept: '兵種交換'
      },
      {
        from: 'g8', to: 'f6', san: 'Nf6', side: 'b',
        title: '2... Nf6! - 學長核心改進：跳馬出子！',
        explanation: '【子聰學長】：這步棋是關鍵！傳統走法用后吃兵會被白馬抓后逃走，得不償失。我們不急著吃兵，改走 Nf6 騎士出動兼施壓 d5 兵！',
        concept: '保留先手與國王安全'
      },
      {
        from: 'c2', to: 'c4', san: 'c4', side: 'w',
        title: '3. c4? - 白方貪婪死守中兵',
        explanation: '【子聰學長】：白方若要守住這個兵，最容易走的就是 c4。但這步棋嚴重削弱了白方的白格斜線，而且浪費了出輕子的寶貴時間！',
        concept: '貪兵失速'
      },
      {
        from: 'c7', to: 'c6', san: 'c6!', side: 'b',
        title: '3... c6! - 果斷棄兵！強勢衝擊中心',
        explanation: '【子聰學長】：我們直接走 c6 迫使白方吃兵！白方若不吃，黑方三子圍攻 d5；若白方吃了，我們就能大踏步展開子力！',
        concept: '棄兵換先手'
      },
      {
        from: 'd5', to: 'c6', san: 'dxc6', side: 'w',
        title: '4. dxc6 - 白方被迫吃兵',
        explanation: '白方吃掉 c6 兵，表面上暫時領先兩個兵，但災難即將降臨。',
        concept: '陷入圈套'
      },
      {
        from: 'b8', to: 'c6', san: 'Nxc6!', side: 'b',
        title: '4... Nxc6! - 雙馬出動，局面全線貫通',
        explanation: '【子聰學長】：用馬吃回！現在分析盤面：黑方出子速度遠快於白方，雙馬生龍活虎，皇后與主教隨時出擊，黑方掌握絕對進攻主動權！',
        concept: '子力超速展開'
      },
      {
        from: 'g1', to: 'f3', san: 'Nf3', side: 'w',
        title: '5. Nf3 - 白方匆忙出馬防守',
        explanation: '白方感受到壓力，試圖出動王翼騎士穩住陣腳。',
        concept: '防守補救'
      },
      {
        from: 'e7', to: 'e5', san: 'e5!', side: 'b',
        title: '5... e5! - 搶佔大中心，開通黑格主教',
        explanation: '【子聰學長】：黑方挺進 e5，完全佔據中央要塞，同時為黑格主教打開極具威脅的攻殺斜線！',
        concept: '中心統治'
      },
      {
        from: 'd2', to: 'd3', san: 'd3', side: 'w',
        title: '6. d3 - 白方被動縮防',
        explanation: '白方不敢挺進 d4，只能走 d3 勉強護衛，陣型極其逼仄。',
        concept: '局限被動'
      },
      {
        from: 'f8', to: 'c5', san: 'Bc5!', side: 'b',
        title: '6... Bc5! - 直插 f2 致命軟肋',
        explanation: '【子聰學長】：主教進駐 c5，直接瞄準白方只有國王防守的 f2 致命弱點！白方已陷入窒息狀態。',
        concept: '精準弱點瞄準'
      },
      {
        from: 'f1', to: 'e2', san: 'Be2', side: 'w',
        title: '7. Be2 - 白方準備易位逃生',
        explanation: '白方急於短易位把國王藏入角落。',
        concept: '逃亡準備'
      },
      {
        from: 'e8', to: 'g8', san: 'O-O', side: 'b',
        title: '7... O-O! - 黑王入堡，發起全面總攻！',
        explanation: '【子聰學長】：黑方短易位完成！後續車進 d8/e8、馬跳 d4，白方在黑方排山倒海的攻勢下完全無法抵擋，黑方大勝！',
        concept: '大局底定'
      }
    ]
  },
  {
    id: 'ong-scandinavian-bb5',
    name: '斯堪地那維亞防禦：3.Bb5+ 將軍陷阱與反殺',
    subtitle: '子聰學長實戰解析：見招拆招，將白方將軍化為己方進攻跳板！',
    category: '👑 開局體系篇',
    videoId: 'wY6ZxUUAaFs',
    videoUrl: 'https://www.youtube.com/watch?v=wY6ZxUUAaFs',
    videoDuration: '14:24',
    difficulty: '進階戰術考驗',
    orientation: 'b',
    description: '白方走出 3.Bb5+ 試圖藉由將軍拖延黑方並保留兵的優勢。子聰學長示範如何冷靜墊象 3...Bd7，隨後以 4...Bg4! 強勢牽制白后，逼迫白方走出削弱王翼的 5.f3，黑方全面掌握主導權！',
    principles: [
      '面對 3.Bb5+ 冷靜以 3...Bd7 應將，不給白方得逞',
      '白象退回 c4 時，順勢走 4...Bg4! 牽制白后造成致命壓迫',
      '誘使白方走 5.f3 破壞自身王前兵型',
      '利用馬退回 b6 抽打白象，穩步收復中心失地'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 白方推進王兵', explanation: '常規開局。', concept: '開局' },
      { from: 'd7', to: 'd5', san: 'd5', side: 'b', title: '1... d5 - 斯堪地那維亞起步', explanation: '黑方立即挑戰中心。', concept: '反擊' },
      { from: 'e4', to: 'd5', san: 'exd5', side: 'w', title: '2. exd5 - 白方吃兵', explanation: '正常交換。', concept: '兌兵' },
      { from: 'g8', to: 'f6', san: 'Nf6', side: 'b', title: '2... Nf6! - 改進版出子', explanation: '不急用后吃兵，先出馬威脅 d5。', concept: '出子先手' },
      { from: 'f1', to: 'b5', san: 'Bb5+', side: 'w', title: '3. Bb5+ - 白方主教將軍騷擾', explanation: '【子聰學長】：白方試圖藉由將軍來拖延黑方節奏並維持多一兵。考驗黑方的應對！', concept: '白方將軍' },
      { from: 'c8', to: 'd7', san: 'Bd7', side: 'b', title: '3... Bd7 - 黑方沉穩墊象', explanation: '黑方以主教阻擋將軍，同時反擊白方主教。', concept: '穩健應將' },
      { from: 'b5', to: 'c4', san: 'Bc4', side: 'w', title: '4. Bc4 - 白象退守 c4 護兵', explanation: '白方捨不得交換，退守 c4 繼續護著 d5 兵。', concept: '守兵退守' },
      { from: 'd7', to: 'g4', san: 'Bg4!', side: 'b', title: '4... Bg4! - 驚艷牽制！直鎖白后', explanation: '【子聰學長】：黑象直接來到 g4 牽制白后！白方非常難受，因為白方出子嚴重受限。', concept: '絕對牽制' },
      { from: 'f2', to: 'f3', san: 'f3', side: 'w', title: '5. f3? - 白方被迫推兵趕象', explanation: '【子聰學長】：白方不得不走出 f3 來擋，但這一步嚴重削弱了白王未來的安全斜線！', concept: '弱化王翼' },
      { from: 'g4', to: 'f5', san: 'Bf5', side: 'b', title: '5... Bf5 - 黑象從容回撤繼續施壓', explanation: '黑象回撤 f5，依然精準控制 c2 格與中心。', concept: '從容退守' },
      { from: 'b1', to: 'c3', san: 'Nc3', side: 'w', title: '6. Nc3 - 白方出馬護兵', explanation: '白方出動騎士防守 d5。', concept: '出馬補防' },
      { from: 'b8', to: 'd7', san: 'Nbd7', side: 'b', title: '6... Nbd7 - 雙馬就緒', explanation: '黑方騎士來到 d7，準備跳往 b6 形成雙重打擊。', concept: '子力調配' },
      { from: 'd2', to: 'd4', san: 'd4', side: 'w', title: '7. d4 - 白方強撐中心', explanation: '白方推進 d4 試圖支撐。', concept: '中心防守' },
      { from: 'd7', to: 'b6', san: 'Nb6!', side: 'b', title: '7... Nb6! - 先手反抽白象！', explanation: '【子聰學長】：黑馬跳到 b6，同時攻擊白方 c4 主教與 d5 兵！白方顧此失彼。', concept: '先手雙重攻擊' },
      { from: 'c4', to: 'b3', san: 'Bb3', side: 'w', title: '8. Bb3 - 白象只能退縮', explanation: '白象退回 b3 保命。', concept: '被迫退守' },
      { from: 'f6', to: 'd5', san: 'Nbxd5!', side: 'b', title: '8... Nbxd5! - 收復中心，全線佔優', explanation: '【子聰學長】：黑方毫無懸念吃回 d5 兵！黑方陣容無懈可擊，白方王翼殘破，黑方輕鬆勝出。', concept: '大獲全勝' }
    ]
  },
  {
    id: 'ong-london-nc6',
    name: '倫敦體系：黑走 2...Nc6 之 4.Nb5! 致命伏擊',
    subtitle: '子聰學長白方殺招：抓住黑方阻礙 c 兵失誤，直搗黃龍！',
    category: '👑 開局體系篇',
    videoId: 'swyABYqrUvo',
    videoUrl: 'https://www.youtube.com/watch?v=swyABYqrUvo',
    videoDuration: '20:10',
    difficulty: '白方必學殺法',
    orientation: 'w',
    description: '倫敦體系是勝率極高的白方萬用武器。子聰學長指出，實戰中無數黑方棋手在 1.d4 d5 2.Bf4 後會下意識走 2...Nc6。這步看似自然，但擋住了自己的 c 兵！白方立即走出 3.Nc3 與 4.Nb5! 雙重暴擊，直接瞄準 c7 進行致命的分叉抽車！',
    principles: [
      '倫敦體系核心：后前兵 d4 起步，主教率先搶佔 f4 優越斜線',
      '黑方若走 2...Nc6，立刻識別出黑方 c 兵被阻擋的重大缺陷',
      '果斷走出 3.Nc3 與 4.Nb5! 鎖定 c7 弱點發動閃電戰',
      '藉由戰術棄馬與得子將黑方徹底擊潰'
    ],
    moves: [
      { from: 'd2', to: 'd4', san: 'd4', side: 'w', title: '1. d4 - 白方推進后兵', explanation: '【子聰學長】：我們以後兵開局，建立堅實中心。', concept: '穩健起步' },
      { from: 'd7', to: 'd5', san: 'd5', side: 'b', title: '1... d5 - 黑方對稱應對', explanation: '黑方同樣推進中兵對峙。', concept: '對稱' },
      { from: 'c1', to: 'f4', san: 'Bf4!', side: 'w', title: '2. Bf4! - 標誌性主教出動：倫敦體系！', explanation: '【子聰學長】：把主教走到 f4 格，就正式形成了 London System！它搶在 e3 兵封閉前佔領絕佳斜線。', concept: '倫敦體系核心' },
      { from: 'b8', to: 'c6', san: 'Nc6?', side: 'b', title: '2... Nc6? - 黑方常見初學者失誤', explanation: '【子聰學長】：在此局面下，黑方最自然且很多人都會走的一步是 Nc6。出子的同時看似施壓，但擋死了自己的 c 兵，已經大禍臨頭！', concept: '致命佈局盲點' },
      { from: 'b1', to: 'c3', san: 'Nc3!', side: 'w', title: '3. Nc3! - 白馬進駐，準備突襲', explanation: '【子聰學長】：我們立刻走 Nc3！黑方已經要非常小心了，但他通常意識不到危險。', concept: '伏擊準備' },
      { from: 'g8', to: 'f6', san: 'Nf6', side: 'b', title: '3... Nf6 - 黑方渾然不覺出馬', explanation: '黑方若自然出馬 Nf6，直接踩進死穴！', concept: '落入陷阱' },
      { from: 'c3', to: 'b5', san: 'Nb5!', side: 'w', title: '4. Nb5! - 雷霆一擊！鎖定 c7 弱點', explanation: '【子聰學長】：我們馬上把馬跳下去！這邊黑方徹底進陷阱了！威脅在 c7 吃兵將軍抽車！', concept: '致命威脅' },
      { from: 'e7', to: 'e5', san: 'e5', side: 'b', title: '4... e5 - 黑方唯一的防禦頑抗', explanation: '黑方唯一阻斷主教與騎士配合的方法只有衝 e5。', concept: '垂死掙扎' },
      { from: 'd4', to: 'e5', san: 'dxe5', side: 'w', title: '5. dxe5 - 白方果斷吃兵反撲', explanation: '白方吃兵，同時攻擊黑方 f6 騎士。', concept: '強勢推進' },
      { from: 'f6', to: 'h5', san: 'Nh5', side: 'b', title: '5... Nh5 - 黑馬逃竄反擊主教', explanation: '黑馬逃往邊緣試圖吃白主教。', concept: '邊緣逃竄' },
      { from: 'e2', to: 'e3', san: 'e3!', side: 'w', title: '6. e3! - 穩健鞏固防線', explanation: '白方冷靜推 e3 護衛主教，並為后打開進攻路線。', concept: '戰略支撐' },
      { from: 'a7', to: 'a6', san: 'a6', side: 'b', title: '6... a6 - 黑方慌忙驅趕白馬', explanation: '黑方以為能趕走白馬化解危機。', concept: '徒勞無功' },
      { from: 'b5', to: 'c7', san: 'Nxc7+!', side: 'w', title: '7. Nxc7+! - 棄馬突破！將軍抽車', explanation: '【子聰學長】：驚天一擊！直接吃掉 c7 兵將軍抽車！黑方后不得不吃馬。', concept: '戰術突破' },
      { from: 'd8', to: 'c7', san: 'Qxc7', side: 'b', title: '7... Qxc7 - 黑后被迫吃馬', explanation: '黑后吃掉騎士。', concept: '被迫交換' },
      { from: 'd1', to: 'h5', san: 'Qxh5!', side: 'w', title: '8. Qxh5! - 白后收割黑馬，大獲全勝', explanation: '【子聰學長】：白后直接吃掉黑方 h5 騎士！白方淨賺大子且黑方王門大開，白方輕鬆獲勝！', concept: '鎖定勝局' }
    ]
  },
  {
    id: 'ong-london-greek-gift',
    name: '倫敦體系：經典希臘祭品 10.Bxh7+!! 狂暴棄象連殺',
    subtitle: '子聰學長實戰解析：大師級棄象突破，狂風暴雨無解連將殺！',
    category: '⚡ 實戰戰術與名局',
    videoId: 'swyABYqrUvo',
    videoUrl: 'https://www.youtube.com/watch?v=swyABYqrUvo',
    videoDuration: '20:10',
    difficulty: '大師級戰術打擊',
    orientation: 'w',
    description: '子聰學長在影片中精闢演練了倫敦體系中最令人血脈賁張的殺招——「希臘祭品 (Greek Gift Sacrifice)」。當黑方短易位後，白方集中兵力，在第 10 步以 10.Bxh7+!! 震撼棄象，黑王掩體瞬間蕩然無存，白方后馬雙管齊下完成毀滅性將死！',
    principles: [
      '透過 c3-d4-e3 構築標準金字塔，騎士駐紮 e5 前哨站',
      '看準黑方王翼防守馬被驅離的瞬間，發動 10.Bxh7+!! 希臘祭品',
      '后進駐 h5、推動 h4 兵支持馬跳 g5 形成鐵壁合圍',
      '摧毀黑王所有防守格點，宣告無解將殺'
    ],
    moves: [
      { from: 'd2', to: 'd4', san: 'd4', side: 'w', title: '1. d4 - 后兵起步', explanation: '建立中心。', concept: '開局' },
      { from: 'd7', to: 'd5', san: 'd5', side: 'b', title: '1... d5 - 對稱佔據中心', explanation: '常規對抗。', concept: '中心' },
      { from: 'c1', to: 'f4', san: 'Bf4', side: 'w', title: '2. Bf4 - 倫敦主教就位', explanation: '主教來到外圍好格。', concept: '出子' },
      { from: 'g8', to: 'f6', san: 'Nf6', side: 'b', title: '2... Nf6 - 黑方正統出馬', explanation: '爭奪中心。', concept: '發展' },
      { from: 'e2', to: 'e3', san: 'e3', side: 'w', title: '3. e3 - 鞏固中心斜線', explanation: '白方構建金字塔防線。', concept: '陣型' },
      { from: 'e7', to: 'e6', san: 'e6', side: 'b', title: '3... e6 - 黑方封閉防守', explanation: '黑方同樣鞏固。', concept: '防守' },
      { from: 'g1', to: 'f3', san: 'Nf3', side: 'w', title: '4. Nf3 - 騎士進駐', explanation: '控制 e5 重要格點。', concept: '前哨準備' },
      { from: 'f8', to: 'e7', san: 'Be7', side: 'b', title: '4... Be7 - 黑方準備易位', explanation: '為易位做準備。', concept: '易位準備' },
      { from: 'f1', to: 'd3', san: 'Bd3', side: 'w', title: '5. Bd3 - 兇狠瞄準 h7 致命點', explanation: '【子聰學長】：主教進駐 d3，這是未來所有棄子殺局的槍口所在！', concept: '戰術砲台' },
      { from: 'e8', to: 'g8', san: 'O-O', side: 'b', title: '5... O-O - 黑王易位入堡', explanation: '黑王自以為安全進入堡壘。', concept: '易位' },
      { from: 'b1', to: 'd2', san: 'Nbd2', side: 'w', title: '6. Nbd2 - 完善子力協同', explanation: '騎士連接，保護 f3。', concept: '協同' },
      { from: 'c7', to: 'c5', san: 'c5', side: 'b', title: '6... c5 - 黑方反擊中心', explanation: '黑方衝擊白方中心。', concept: '反擊' },
      { from: 'c2', to: 'c3', san: 'c3', side: 'w', title: '7. c3 - 金字塔陣型完成', explanation: '堅若磐石的三角兵鏈。', concept: '鋼鐵陣型' },
      { from: 'b8', to: 'c6', san: 'Nc6', side: 'b', title: '7... Nc6 - 黑馬增援', explanation: '黑方集中子力。', concept: '加壓' },
      { from: 'f3', to: 'e5', san: 'Ne5!', side: 'w', title: '8. Ne5! - 白馬進駐前哨站', explanation: '【子聰學長】：白馬強勢空降 e5，給黑方製造巨大心理壓力！', concept: '強勢前哨' },
      { from: 'c6', to: 'e5', san: 'Nxe5', side: 'b', title: '8... Nxe5 - 黑方忍不住交換', explanation: '黑方試圖化解威脅。', concept: '交換' },
      { from: 'd4', to: 'e5', san: 'dxe5!', side: 'w', title: '9. dxe5! - 關鍵兵吃！驅逐防守馬', explanation: '【子聰學長】：一定要用兵吃！這步兵直接將防守 h7 的關鍵騎士趕走！', concept: '驅逐防衛子' },
      { from: 'f6', to: 'd7', san: 'Nd7', side: 'b', title: '9... Nd7 - 黑馬被迫撤退', explanation: '黑王身邊最後的屏障已被剝離。', concept: '防禦崩解' },
      { from: 'd3', to: 'h7', san: 'Bxh7+!!', side: 'w', title: '10. Bxh7+!! - 驚天棄象！希臘祭品震撼降臨', explanation: '【子聰學長】：這就是驚天妙手！！棄象！直接炸開黑王的大門！', concept: '希臘祭品絕殺' },
      { from: 'g8', to: 'h7', san: 'Kxh7', side: 'b', title: '10... Kxh7 - 黑王不得不吃象', explanation: '黑王被迫走到危險的 h7 格。', concept: '被迫接受' },
      { from: 'd1', to: 'h5', san: 'Qh5+', side: 'w', title: '11. Qh5+ - 白后呼嘯殺到！', explanation: '【子聰學長】：后馬配合發起總攻，下一步就威脅一步殺！', concept: '致命將軍' },
      { from: 'h7', to: 'g8', san: 'Kg8', side: 'b', title: '11... Kg8 - 黑王狼狽縮回角落', explanation: '黑王退無可退。', concept: '逼入死角' },
      { from: 'h2', to: 'h4', san: 'h4!', side: 'w', title: '12. h4! - 關鍵神步！封鎖生路與調馬', explanation: '【子聰學長】：推 h4 極具深度！為 Nf3-g5 提供支撐，黑方王翼在狂風暴雨下宣告無解！', concept: '終極殺網構建' }
    ]
  },
  {
    id: 'ong-queens-gambit-counter',
    name: '對抗后翼棄兵：大膽吃兵與 3...e5! 反棄兵破局',
    subtitle: '子聰學長黑方絕殺：撕碎白方雙兵中心，獵殺失位白王！',
    category: '👑 開局體系篇',
    videoId: 'd1gZVsDZJ5U',
    videoUrl: 'https://www.youtube.com/watch?v=d1gZVsDZJ5U',
    videoDuration: '11:29',
    difficulty: '黑方強烈推薦',
    orientation: 'b',
    description: '面對 1.d4 d5 2.c4 后翼棄兵，初學者往往膽怯不敢吃。子聰學長教你勇敢接受棄兵 2...dxc4!，當白方走 3.e4 企圖稱霸中心時，立即給出驚雷般的反擊 3...e5!!！若白方敢貪心吃兵，黑方強行兌后讓白王永久失去易位權，隨後長易位狂轟濫炸！',
    principles: [
      '打破恐懼，大膽走出 2...dxc4! 接受后翼棄兵',
      '白推 3.e4 搶佔雙兵中心時，立刻祭出 3...e5!! 反棄兵',
      '若白方 4.dxe5? 貪吃，以 4...Qxd1+ 剝奪白王易位權',
      '雙馬雙象與長易位出車連環打擊，將白王獵殺在中路'
    ],
    moves: [
      { from: 'd2', to: 'd4', san: 'd4', side: 'w', title: '1. d4 - 白方推進后兵', explanation: '白方后兵起步。', concept: '開局' },
      { from: 'd7', to: 'd5', san: 'd5', side: 'b', title: '1... d5 - 黑方中心對峙', explanation: '黑方不卑不亢。', concept: '中心' },
      { from: 'c2', to: 'c4', san: 'c4', side: 'w', title: '2. c4 - 后翼棄兵登場', explanation: '白方試圖以邊兵誘換黑方中兵。', concept: '棄兵' },
      { from: 'd5', to: 'c4', san: 'dxc4!', side: 'b', title: '2... dxc4! - 勇敢吃下棄兵！', explanation: '【子聰學長】：很多人害怕接受棄兵，但我們今天要勇敢吃掉它！主動出擊！', concept: '接受棄兵' },
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '3. e4 - 白方意圖霸佔大中心', explanation: '白方雙兵併排，自以為優勢巨大。', concept: '擴張中心' },
      { from: 'e7', to: 'e5', san: 'e5!!', side: 'b', title: '3... e5!! - 震撼反棄兵！當頭棒喝', explanation: '【子聰學長】：這是關鍵的一步！這是一個 counter-sacrifice 反棄兵！直接給白方設下嚴峻考驗！', concept: '強力反擊' },
      { from: 'd4', to: 'e5', san: 'dxe5?', side: 'w', title: '4. dxe5? - 白方犯下致命貪婪錯誤', explanation: '【子聰學長】：白方以為能白吃一兵，但他不知道自己即將迎來毀滅！', concept: '致命失誤' },
      { from: 'd8', to: 'd1', san: 'Qxd1+!', side: 'b', title: '4... Qxd1+! - 逼迫兌后！拔除易位權', explanation: '【子聰學長】：強行換后！白方必須用王吃回，這意味著白王永久失去了王車易位權！', concept: '剝奪易位權' },
      { from: 'e1', to: 'd1', san: 'Kxd1', side: 'w', title: '5. Kxd1 - 白王被迫移位吃后', explanation: '白王孤零零暴露在 d 線中央。', concept: '王位暴露' },
      { from: 'b8', to: 'c6', san: 'Nc6!', side: 'b', title: '5... Nc6! - 出馬圍剿 e5 弱兵', explanation: '【子聰學長】：出騎士施壓 e5 孤兵，黑方子力極速開展！', concept: '先手追擊' },
      { from: 'f2', to: 'f4', san: 'f4', side: 'w', title: '6. f4 - 白方頑固護兵', explanation: '白方推 f4 勉強保兵，進一步暴露白王斜線。', concept: '破綻百出' },
      { from: 'c8', to: 'g4', san: 'Bg4+', side: 'b', title: '6... Bg4+! - 出象將軍帶牽制', explanation: '【子聰學長】：出象將軍！白方只能墊子，被動至極！', concept: '出子將軍' },
      { from: 'g1', to: 'f3', san: 'Nf3', side: 'w', title: '7. Nf3 - 白馬慌忙墊將', explanation: '白馬被死死釘在原地。', concept: '絕對被釘' },
      { from: 'e8', to: 'c8', san: 'O-O-O+!', side: 'b', title: '7... O-O-O+! - 長易位絕命將軍！', explanation: '【子聰學長】：長易位同時出車將軍！白王在全盤大火力的轟炸下瞬間瓦解，黑方完勝！', concept: '長易位終結' }
    ]
  },
  {
    id: 'ong-fools-mate',
    name: '三步棋速敗！愚人將死 (Fool\'s Mate) 歷史最快將殺',
    subtitle: '子聰學長告誡新手：切忌在開局胡亂推動 f 兵與 g 兵！',
    category: '⚡ 實戰戰術與名局',
    videoId: 'fvc_grhfao8',
    videoUrl: 'https://www.youtube.com/shorts/fvc_grhfao8',
    videoDuration: 'Short (0:50)',
    difficulty: '基礎警示必看',
    orientation: 'b',
    description: '西洋棋史上最短、最不可思議的將死——「愚人將死」。白方在第 1 步與第 2 步隨意推動 f 兵與 g 兵，直接將己方國王最薄弱的 e1-h4 斜線向黑方大開。黑后一步到位 2...Qh4#，達成無可挽回的速死。',
    principles: [
      '開局最脆弱的格子是 f2 (白) 與 f7 (黑)，因為只有國王單獨防守',
      '切勿在國王易位前隨意推動 f 兵或 g 兵',
      '一旦斜線門戶洞開，對方后象將一擊必殺',
      '應將三法（吃、擋、逃）全部無效即為將死'
    ],
    moves: [
      {
        from: 'f2', to: 'f3', san: 'f3?', side: 'w',
        title: '1. f3? - 白方犯下最忌諱的開局步',
        explanation: '【子聰學長】：白方第一步推動 f 兵，不僅完全沒有控制中心，反而削弱了國王最重要的斜線安全！',
        concept: '削弱王前防禦'
      },
      {
        from: 'e7', to: 'e5', san: 'e5!', side: 'b',
        title: '1... e5 - 黑方堂堂正正佔領中心',
        explanation: '【子聰學長】：黑方把兵往前衝，開通了皇后與主教的重要出路！',
        concept: '佔領中心並開路'
      },
      {
        from: 'g2', to: 'g4', san: 'g4??', side: 'w',
        title: '2. g4?? - 致命自殺步！白王斜線徹底敞開',
        explanation: '【子聰學長】：白方走出這步棋，將白王身邊唯一的掩體徹底摧毀，白方已萬劫不復！',
        concept: '歷史級大失誤'
      },
      {
        from: 'd8', to: 'h4', san: 'Qh4#', side: 'b',
        title: '2... Qh4# - 皇后天降神兵！一擊將死',
        explanation: '【子聰學長】：順勢把后走出來將軍！黑方已經被我們將死了！因為應將的三種手段：第一吃不到后，第二無子可擋，第三王無處可逃！黑方勝！',
        concept: '愚人將死 Checkmate'
      }
    ]
  },
  {
    id: 'ong-special-castling',
    name: '三大特殊規則：王車易位 (Castling) 實戰與四大限制',
    subtitle: '子聰學長手把手教學：一步棋同時移動王與車的保命神技！',
    category: '📖 零基礎與特殊規則',
    videoId: 'cv-yCv2OWoY',
    videoUrl: 'https://www.youtube.com/shorts/cv-yCv2OWoY',
    videoDuration: 'Short (0:45)',
    difficulty: '規則必修',
    orientation: 'w',
    description: '子聰學長完整拆解王車易位（短易位與長易位）的操作流程，並精確列舉實戰中絕對不可易位的四大禁忌條件，幫助初學者徹底避開違規陷阱！',
    principles: [
      '短易位 O-O：王往角落走兩格，車越過王站到王身旁',
      '長易位 O-O-O：王往后翼走兩格，車越過王站到身旁',
      '禁忌 1：王或車曾經移動過（哪怕走回原位也不行）',
      '禁忌 2：王與車之間有任何棋子阻擋',
      '禁忌 3：國王正處於被將軍狀態，不可用易位來應將',
      '禁忌 4：國王經過或停下的格子正受到對方攻擊'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 開局', explanation: '王兵開局。', concept: '佈局' },
      { from: 'e7', to: 'e5', san: 'e5', side: 'b', title: '1... e5 - 黑應對', explanation: '對峙。', concept: '對抗' },
      { from: 'g1', to: 'f3', san: 'Nf3', side: 'w', title: '2. Nf3 - 出馬清空斜線', explanation: '移開王翼騎士。', concept: '清空' },
      { from: 'b8', to: 'c6', san: 'Nc6', side: 'b', title: '2... Nc6 - 黑出馬', explanation: '守護 e5。', concept: '防守' },
      { from: 'f1', to: 'c4', san: 'Bc4', side: 'w', title: '3. Bc4 - 出主教清空最後阻礙', explanation: '王與車之間已無任何棋子！', concept: '易位準備就緒' },
      { from: 'f8', to: 'c5', san: 'Bc5', side: 'b', title: '3... Bc5 - 黑方也出象', explanation: '黑方同樣準備。', concept: '對稱' },
      { from: 'e1', to: 'g1', san: 'O-O', side: 'w', title: '4. O-O! - 短易位！王車合璧', explanation: '【子聰學長】：把王往右走兩格，車越過王站到身旁！完成短易位，國王安全進入堡壘！', concept: '短易位完成' }
    ]
  },
  {
    id: 'ong-special-en-passant',
    name: '三大特殊規則：吃過路兵 (En Passant) 機制與即時性',
    subtitle: '子聰學長精闢詳解：最常被新手誤會為作弊的兵種特殊吃法！',
    category: '📖 零基礎與特殊規則',
    videoId: '-SUNJrtBZRM',
    videoUrl: 'https://www.youtube.com/shorts/-SUNJrtBZRM',
    videoDuration: 'Short (0:40)',
    difficulty: '規則必修',
    orientation: 'w',
    description: '吃過路兵是西洋棋中最獨特的規則。子聰學長點出關鍵：當對方的兵從初始位置一口氣前進兩格、剛好停在你的兵旁邊時，你可以像他只走了一格那樣，斜著把它吃掉！但前提是：必須在當回合立即執行，一旦走其他棋，該權利永久失效！',
    principles: [
      '前提：我方兵必須已經抵達第 5 橫行 (白) 或第 4 橫行 (黑)',
      '觸發：對方相鄰線上的兵從起點「一口氣衝兩格」停在我方兵正旁邊',
      '吃法：我方兵斜走到對方衝過的中間格，將對方的兵移出棋盤',
      '鐵律：必須在該回合立即吃，錯過就再也不能吃！'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 白方挺進', explanation: '建立中心。', concept: '起步' },
      { from: 'a7', to: 'a6', san: 'a6', side: 'b', title: '1... a6 - 黑方等待步', explanation: '示範步。', concept: '試探' },
      { from: 'e4', to: 'e5', san: 'e5!', side: 'w', title: '2. e5! - 白兵深入黑方陣地（第5橫行）', explanation: '【子聰學長】：白兵來到第 5 橫行，這是吃過路兵發生的必要前提！', concept: '兵線深挺' },
      { from: 'd7', to: 'd5', san: 'd5!', side: 'b', title: '2... d5 - 黑兵一口氣衝兩格！', explanation: '【子聰學長】：黑兵從起點走了兩格，剛好來到我們兵的旁邊！', concept: '過路兵觸發' },
      { from: 'e5', to: 'd6', san: 'exd6 (e.p.)!', side: 'w', title: '3. exd6! - 吃過路兵 En Passant！', explanation: '【子聰學長】：我們立刻斜吃！把它想像成黑兵只走了一格時正常被吃掉！記得必須當回合立刻吃！', concept: '吃過路兵執行' }
    ]
  },
  {
    id: 'ong-checkmate-stalemate',
    name: '勝負與終局：將死 (Checkmate) vs 逼和 (Stalemate) 陷阱',
    subtitle: '子聰學長血淚告誡：千萬別在大優勢時大意走成逼和痛失好局！',
    category: '📖 零基礎與特殊規則',
    videoId: 'BNwsjygJ4Wk',
    videoUrl: 'https://www.youtube.com/shorts/BNwsjygJ4Wk',
    videoDuration: 'Short (1:10)',
    difficulty: '勝負判定關鍵',
    orientation: 'w',
    description: '初學者最常犯的痛心錯誤就是「大優逼和」。子聰學長深入剖析：將死是「王被將軍且無任何解法」判負；而逼和是「王沒有被將軍，但該方輪到走棋時沒有任何合法步可走」判定為和局！學長示範如何穩健將死避免逼和悲劇。',
    principles: [
      '將軍 (Check)：用棋子攻擊對方的王',
      '應將三法：吃掉將軍者、中間墊子阻擋、國王逃離危險格',
      '將死 (Checkmate)：被將軍且上述三種應將法皆無法執行，直接獲勝',
      '逼和 (Stalemate)：未被將軍但全盤無任何合法步可走，痛失勝局判定和棋！'
    ],
    moves: [
      { from: 'e2', to: 'e4', san: 'e4', side: 'w', title: '1. e4 - 開局推進', explanation: '王兵開局。', concept: '中心' },
      { from: 'e7', to: 'e5', san: 'e5', side: 'b', title: '1... e5 - 黑方對峙', explanation: '中央應對。', concept: '平衡' },
      { from: 'd1', to: 'h5', san: 'Qh5', side: 'w', title: '2. Qh5 - 后出擊威脅 f7 與 e5', explanation: '【子聰學長】：皇后迅速出擊施壓。', concept: '施壓弱點' },
      { from: 'e8', to: 'e7', san: 'Ke7?', side: 'b', title: '2... Ke7? - 黑王走出大昏著', explanation: '黑王走動破壞自身安全。', concept: '大失誤' },
      { from: 'h5', to: 'e5', san: 'Qxe5#', side: 'w', title: '3. Qxe5# - 吃兵一擊將死！', explanation: '【子聰學長】：皇后在中央吃兵將軍！黑王身邊所有格子全被控制，無子可擋無子可吃，將死 Checkmate！', concept: '完美將殺' }
    ]
  },
  {
    id: 'ong-london-vs-london',
    name: '倫敦對局實戰：倫敦體系 vs 倫敦體系 (London vs London)',
    subtitle: '子聰學長倫敦踢館實戰：打破鏡像對稱，迅速在后翼佔據空間優勢！',
    category: '⚡ 實戰戰術與名局',
    videoId: 'OQRAzrgAkso',
    videoUrl: 'https://www.youtube.com/shorts/OQRAzrgAkso',
    videoDuration: 'Short (0:55)',
    difficulty: '實戰破局技巧',
    orientation: 'w',
    description: '子聰學長親赴英國倫敦街頭下棋，遇上同樣精通倫敦體系的當地棋友！學長示範執白如何主動以 3.c4! 打破鏡像僵局，配合 Qb3 與 c5 推進，奪取后翼壓倒性空間優勢！',
    principles: [
      '面對對手的鏡像模仿，切忌跟著對方無腦複製',
      '果斷走出 3.c4! 主動向中心黑兵發起挑戰',
      '走出 Qb3 雙重瞄準 b7 與 d5 弱點',
      '以 c5 挺進封鎖黑后，擴大后翼版圖'
    ],
    moves: [
      { from: 'd2', to: 'd4', san: 'd4', side: 'w', title: '1. d4 - 白走后兵', explanation: '倫敦體系起手。', concept: '開局' },
      { from: 'd7', to: 'd5', san: 'd5', side: 'b', title: '1... d5 - 黑應對', explanation: '對峙。', concept: '平衡' },
      { from: 'c1', to: 'f4', san: 'Bf4', side: 'w', title: '2. Bf4 - 白方主教就位', explanation: '【子聰學長】：標誌性倫敦體系！', concept: '體系核心' },
      { from: 'c8', to: 'f5', san: 'Bf5', side: 'b', title: '2... Bf5 - 黑方也走倫敦！', explanation: '【子聰學長】：沒想到對手也走了 London！怎麼辦？', concept: '鏡像挑戰' },
      { from: 'c2', to: 'c4', san: 'c4!', side: 'w', title: '3. c4! - 果斷后翼衝擊中心', explanation: '【子聰學長】：我先走個后翼棄兵，開通皇后的出路！', concept: '破鏡像招' },
      { from: 'e7', to: 'e6', san: 'e6', side: 'b', title: '3... e6 - 黑方不敢吃兵護衛', explanation: '對手不敢吃，推 e6 保兵。', concept: '防守' },
      { from: 'b1', to: 'c3', san: 'Nc3', side: 'w', title: '4. Nc3 - 白馬出動加壓', explanation: '【子聰學長】：進馬繼續攻擊中心！', concept: '加壓' },
      { from: 'c7', to: 'c6', san: 'c6', side: 'b', title: '4... c6 - 黑方鞏固兵線', explanation: '黑方建立兵鏈。', concept: '防守' },
      { from: 'd1', to: 'b3', san: 'Qb3!', side: 'w', title: '5. Qb3! - 后翼閃電突襲', explanation: '【子聰學長】：然後把后走出來，攻擊 b7 弱兵！', concept: '攻擊弱點' },
      { from: 'd8', to: 'b6', san: 'Qb6', side: 'b', title: '5... Qb6 - 黑后前來對峙', explanation: '黑后試圖兌后。', concept: '對峙' },
      { from: 'c4', to: 'c5', san: 'c5!', side: 'w', title: '6. c5! - 暴力推兵封鎖', explanation: '【子聰學長】：白方推進 c5 逼退黑后，隨後配合馬跳進去威脅 c7，輕鬆拿下勝局！', concept: '空間封鎖' }
    ]
  }
];

export function getMrOngCourseById(id) {
  return MRONG_COURSES.find(c => c.id === id) || MRONG_COURSES[0];
}


export const MRONG_ALL_VIDEOS = [
  {
    "id": "wY6ZxUUAaFs",
    "title": "一步步學會 Scandinavian Defense！高勝率黑方開局教學【西洋棋開局】",
    "type": "video",
    "url": "https://www.youtube.com/watch?v=wY6ZxUUAaFs",
    "hasTranscript": true,
    "transcriptExcerpt": "應對王兵開局黑方最針鋒相對的走法是走d5 直接挑戰白方中心 這個開局名叫Scandinavian Defense 今天我們站在黑方立場 我會一步步教你如何輕鬆贏棋 首先呢這個開局乍看之下呢是有點違背棋理的 因為後來到了一個能夠被對方的馬 直接 攻擊的點位 黑 方還得浪費步速逃走 得不償失 所以我們可以做個改進 我們不急..."
  },
  {
    "id": "d1gZVsDZJ5U",
    "title": "【国际象棋开局】一步步学会黑方视角，对抗后翼弃兵 Queen's Gambit！",
    "type": "video",
    "url": "https://www.youtube.com/watch?v=d1gZVsDZJ5U",
    "hasTranscript": true,
    "transcriptExcerpt": "This opening is called the Queen's Gambit. White's goal here is to sacrifice a Pawn first to deflect Black's center Pawn, build a strong center, and find a way ..."
  },
  {
    "id": "swyABYqrUvo",
    "title": "一步步學會 London System！勝率高的白方開局倫敦體系【西洋棋開局】",
    "type": "video",
    "url": "https://www.youtube.com/watch?v=swyABYqrUvo",
    "hasTranscript": true,
    "transcriptExcerpt": "今天我會教你如何用London System 來輕鬆贏棋 我們以後兵開局 然後把像走到f4格 就形成了London System 在此局面下 黑方最自然 且很多人都會走的一步棋呢 是馬c6出子的同時 對白方的中兵施加壓力 我們立刻走馬c3 這邊黑方已經要很小心瞭 如果說他自然地出子 例如說走馬f6 那他顯然沒有意識到危..."
  },
  {
    "id": "w4tS_T18fZM",
    "title": "11分钟零基础完整学会国际象棋！",
    "type": "video",
    "url": "https://www.youtube.com/watch?v=w4tS_T18fZM",
    "hasTranscript": true,
    "transcriptExcerpt": "这期视频 我会用大约10分钟时间 完整教会你如何下国际象棋 这是国际象棋的棋盘 由8x8=64个黑白相间的格子组成 白黑双方各有16个棋子 我们先来看如何移动每个棋子 首先呢 车的移动方式是直走或者横走 比如说我可以把它往右边走 然后再往前走 这是车的走法 象的走法呢 是斜走 比如说我可以把它往右下方走 或者斜上方走 ..."
  },
  {
    "id": "mgueyIbfxOU",
    "title": "我读医科最忙的一年，如何从全国第 40 逆袭到第 4？停止无效练棋！",
    "type": "video",
    "url": "https://www.youtube.com/watch?v=mgueyIbfxOU",
    "hasTranscript": true,
    "transcriptExcerpt": "很多人下棋 下了一段时间 却发现自己一直卡在原地 我也曾经下棋下到怀疑人生 后来我上了大学 读的是课业最繁忙的医学系 明明练棋的时间变得更少了 但我的国际象棋却反而进步得更快 我代表大学参加全国赛 2022年的时候 我只是全国第40名 过了短短一年 我的排名飙升到了全国第四名 这是我以前想都没有想过的高度 这一切都是因..."
  },
  {
    "id": "x32haSdFYp4",
    "title": "我飞了一万公里，去英国伦敦跟陌生人下棋……",
    "type": "video",
    "url": "https://www.youtube.com/watch?v=x32haSdFYp4",
    "hasTranscript": false,
    "transcriptExcerpt": "街頭實戰與對局紀錄"
  },
  {
    "id": "TTVPLuSuwIo",
    "title": "3分钟学会 Scandinavian Defense 实用开局陷阱，疯狂弃子暴力赢棋！",
    "type": "short",
    "url": "https://www.youtube.com/shorts/TTVPLuSuwIo",
    "hasTranscript": false,
    "transcriptExcerpt": "街頭實戰與對局紀錄"
  },
  {
    "id": "EZ2sdq_aY9k",
    "title": "打爆后翼弃兵 Queen's Gambit 【开局教学】【精华竖屏版】",
    "type": "short",
    "url": "https://www.youtube.com/shorts/EZ2sdq_aY9k",
    "hasTranscript": true,
    "transcriptExcerpt": "这个开局名叫 后翼弃兵 白方的目的是 引离黑方的中兵 形成强大的中心 将来有机会 再把这个兵给吃回来 作为黑方呢 我们走e5这步关键招 这是一个反弃兵 将会对白方 展开一系列的考验 首先呢 他是不能够吃兵的 因为交换了之后 白王就失去了易位的权利 黑方取得优势 同样的 他也不能够 马上把我们的c兵吃掉 因为我可以直接 ..."
  },
  {
    "id": "cq282gUVdQ4",
    "title": "一步步学会 London System 伦敦体系！",
    "type": "short",
    "url": "https://www.youtube.com/shorts/cq282gUVdQ4",
    "hasTranscript": false,
    "transcriptExcerpt": "街頭實戰與對局紀錄"
  },
  {
    "id": "QOpEf06srXE",
    "title": "弃子 Brilliant move!!",
    "type": "short",
    "url": "https://www.youtube.com/shorts/QOpEf06srXE",
    "hasTranscript": false,
    "transcriptExcerpt": "街頭實戰與對局紀錄"
  },
  {
    "id": "OQRAzrgAkso",
    "title": "伦敦体系 vs 伦敦体系",
    "type": "short",
    "url": "https://www.youtube.com/shorts/OQRAzrgAkso",
    "hasTranscript": true,
    "transcriptExcerpt": "这个开局名叫 伦敦体系 为了测试它有多厉害 我特地飞到 它的发源地 London 去下棋 没想到对手 也走了London 怎么办 我先走个后翼弃兵 开通后的路线 如果他吃掉我 我随时可以闪击 吃回这个弱兵 所以对手不敢吃 进马保兵 我也进马继续攻击 然后把后走出来 攻击b7弱兵 再把马跳进去 配合象威胁c7兵 准备将军..."
  },
  {
    "id": "YLziypT2jAA",
    "title": "伦敦踢馆系列",
    "type": "short",
    "url": "https://www.youtube.com/shorts/YLziypT2jAA",
    "hasTranscript": false,
    "transcriptExcerpt": "街頭實戰與對局紀錄"
  },
  {
    "id": "j6Tbuaf1pJ0",
    "title": "飞10000公里去输棋？",
    "type": "short",
    "url": "https://www.youtube.com/shorts/j6Tbuaf1pJ0",
    "hasTranscript": true,
    "transcriptExcerpt": "我飞了10000公里 去伦敦跟陌生人下棋 结果第一盘棋就翻车了 这里我已经输定了 而且时间只剩下10+秒 然后 我设了个陷阱 我只剩下2秒钟! 成功反败为胜..."
  },
  {
    "id": "osJRJiD0QEM",
    "title": "我被8岁小孩欺负了！",
    "type": "short",
    "url": "https://www.youtube.com/shorts/osJRJiD0QEM",
    "hasTranscript": true,
    "transcriptExcerpt": "我飞了3,000公里 去中国下棋 结果被8岁小孩欺负了 抓耳挠腮 *回退 你不想走这步吗 我要走e4 你平时走哪一个比较多 走后兵呀 那我走点特别的吧 这个你会吗 我…… 会 走这个 少见的 快进 *叹息 能不能再 偷走一个棋子啊? 你拿吧 我看到了一步战术!! *感动 我认输啦 他让我两位棋子 让我两个象 我教你一招..."
  },
  {
    "id": "cv-yCv2OWoY",
    "title": "王车易位 castling",
    "type": "short",
    "url": "https://www.youtube.com/shorts/cv-yCv2OWoY",
    "hasTranscript": true,
    "transcriptExcerpt": "王车易位 这个走法能够让我们 用一步棋 同时移动我们的王和车 它的具体操作方式呢 是我们把王往角落方向走两格 然后把车越过我们的王 站到王的旁边 完成王车易位 当然 王车易位 你不一定要往右边这边 你也可以往左边这边 王车易位 它的操作方式是一样的 我把王往左边移动两格 然后把车越过王放在旁边 完成王车易位 于是你就已..."
  },
  {
    "id": "-SUNJrtBZRM",
    "title": "吃过路兵 en passant",
    "type": "short",
    "url": "https://www.youtube.com/shorts/-SUNJrtBZRM",
    "hasTranscript": true,
    "transcriptExcerpt": "如果对方的兵 刚刚从起点走了两格 如果我们的兵 刚好在对方的兵旁边 那我们就可以立刻吃掉这个兵 吃掉了之后 我们会放在斜吃的这个位置 它听起来可能有一点复杂 但你只需要把它想象成是 就很像 当对方的兵只走了一格的时候 我们正常地把这个兵吃掉 其实是一样的 那这个吃过路兵呢 它是有一个前提条件的 就是当对方从起点走了两格..."
  },
  {
    "id": "TwPzU7n31V8",
    "title": "兵的升变",
    "type": "short",
    "url": "https://www.youtube.com/shorts/TwPzU7n31V8",
    "hasTranscript": true,
    "transcriptExcerpt": "当我方的兵 走到了对方的底线 将会升变 成为除了兵和王以外的任何棋子 包括了后啊 车啊 象啊 马 当然一般情况下 我们会选择后 因为后是威力最强大的棋子 升变的时候呢 升变的时候呢 我们是可以一边吃子一边升变的 在这个局面 我除了往前走一格 我也可以直接斜走 吃掉对方的马的同时 让我的兵升变成后 在最极端的情况呢 局面..."
  },
  {
    "id": "MPeRzqONXpA",
    "title": "练棋之道",
    "type": "short",
    "url": "https://www.youtube.com/shorts/MPeRzqONXpA",
    "hasTranscript": true,
    "transcriptExcerpt": "很多人下棋 下了一段时间 却发现自己一直卡在原地 我也曾经下棋下到怀疑人生 后来我上了大学 读的是课业最繁忙的医学系 读的是课业最繁忙的医学系 明明练棋的时间变得更少了 但我的国际象棋却反而进步得更快 我代表大学参加全国赛 2022年的时候 我只是全国第40名 过了短短一年 我的排名飙升到了全国第四名 这是我以前想都没..."
  },
  {
    "id": "fvc_grhfao8",
    "title": "三步棋速败！",
    "type": "short",
    "url": "https://www.youtube.com/shorts/fvc_grhfao8",
    "hasTranscript": true,
    "transcriptExcerpt": "作为白方 我们先走 第一步棋 我们把兵往前冲 目的是让 这个兵不再阻挡我的其他重要棋子 现在我的后 我的象都被开通了 举个例子 黑方走兵往前一格 是的 记得 每个兵的第一步棋都可以走一步 或者两步 黑方的目的是 如果我们这时候再把这个兵往前冲 黑方是可以直接吃掉的 记得 兵是斜着吃子的 所以我们不理他 我们把另一个中兵..."
  },
  {
    "id": "j3hZb3xicRc",
    "title": "如何摆棋",
    "type": "short",
    "url": "https://www.youtube.com/shorts/j3hZb3xicRc",
    "hasTranscript": true,
    "transcriptExcerpt": "我们把棋子摆上 就可以开始下棋啦！ 首先我们把车放在角落 然后是马 然后是象 哎难题来了 我们的后要放在哪一个格子呢 我们只需要记得白后放白格 黑后放黑格 白格的意思就是白色格 或者说比较浅色的格子 黑格就是深色格子 剩下的一个空位呢 我们就把王放进去 然后把兵一字排开 就完成了摆棋 这时候就已经可以开始下棋了 那下棋..."
  },
  {
    "id": "BNwsjygJ4Wk",
    "title": "将军 应将 将死 逼和",
    "type": "short",
    "url": "https://www.youtube.com/shorts/BNwsjygJ4Wk",
    "hasTranscript": true,
    "transcriptExcerpt": "一盘棋的最终目的啊 就是把对方的王将死 当我用棋子来攻击对方的王的时候 这就叫做将军 在同一个局面 我也可以用不同的方式去将军黑王 那在被将军的时候 有三种应对将军的方式 第一种呢 是直接吃掉将军的那个棋子 第二种呢 是阻挡将军 比如说 在中间的这些格子放置一个棋子 那白后就不会直接攻击黑王了 第三种方法是最简单的 就..."
  },
  {
    "id": "STd0aLjKb9I",
    "title": "0基础学会下国际象棋",
    "type": "short",
    "url": "https://www.youtube.com/shorts/STd0aLjKb9I",
    "hasTranscript": true,
    "transcriptExcerpt": "这是国际象棋的棋盘 由8x8=64个黑白相间的格子组成 白黑双方各有16个棋子 我们先来看如何移动每个棋子 首先呢 车的移动方式是直走或者横走 比如说我可以把它往右边走 比如说我可以把它往右边走 然后再往前走 象的走法呢 是斜走 比如说我可以把它往右下方走 或者斜上方走 后的走法呢 它是可以直横走或者斜走都可以 它就好..."
  },
  {
    "id": "JFC6iJVkwUo",
    "title": "下棋性价比巨高！",
    "type": "short",
    "url": "https://www.youtube.com/shorts/JFC6iJVkwUo",
    "hasTranscript": true,
    "transcriptExcerpt": "下棋还能为你带来实际的收益 现在比赛的机会是非常非常多的 仅仅是在雪隆区 可以任你选择参加 周末去下几盘棋 玩乐的同时还有机会赢奖 赚点零用钱 如果你是学生的话 那你就更应该下棋了 国际象棋是受教育部承认的正规运动 有学联赛可以参与 你可以获得 丰富履历 将来帮助升学 帮你获取巨额奖学金 而且下棋的性价比很高 它是很公..."
  },
  {
    "id": "1zX0ThG3JiY",
    "title": "少上数学课，数学反而变好了？",
    "type": "short",
    "url": "https://www.youtube.com/shorts/1zX0ThG3JiY",
    "hasTranscript": true,
    "transcriptExcerpt": "这个效果太好了 好到委内瑞拉政府直接立法 把国际象棋列为了全国学校必修课 丹麦做过一个更大胆的研究 他们把每周的其中一节数学课砍掉 换成下棋 结果呢 这班少上一节数学课的孩子 数学成绩反而提高了 这是因为 相比起枯燥的课程 学生通过下棋 用游戏的方式 来提升逻辑思维 更有趣也更有效 时至今日 全球甚至已经有了30多个国..."
  },
  {
    "id": "dAEdoZJuCqA",
    "title": "下棋能多活14年？！",
    "type": "short",
    "url": "https://www.youtube.com/shorts/dAEdoZJuCqA",
    "hasTranscript": true,
    "transcriptExcerpt": "如果我告诉你 有一项运动 不需要你流汗 却能让你比普通人 你会想要尝试吗？ 从脑科学的角度来看 下棋不仅仅是动脑那么简单 它会反复刺激大脑特定的结构 让神经之间的连接更加高效 正是基于这种机制啊 顶级医学期刊的研究就发现 在所有休闲活动当中 下棋 是预防老年痴呆最有效的方式之一 它能降低的风险高达75% 换句话说 你现..."
  }
];
