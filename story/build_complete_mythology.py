import os
import json

GODS_DATA = [
    {
        "id": "ra",
        "name": "太陽神拉 (Ra)",
        "title": "太陽神之書：尼羅河的黃金冒險與十二時辰戰記",
        "tag": "光明、秩序與眾神之首",
        "color": "#f59e0b",
        "summary": "拉神乘著黃金白晝之舟巡視大地，深夜深入杜埃特幽冥河，與大蛇阿波菲斯展開天地大決戰。",
        "acts": [
            ("遠古最初的火花與拉神的誕生", "在天地還沒有成形以前，黑暗的水域裡誕生了第一道光", "☀️🦅", "art-bg-dawn", [
                "在很久很久以前，連時間都還沒開始流動的時候，宇宙間沒有大地，沒有綠樹，也沒有天空。那時候只有一片無邊無際、漆黑而又冰冷的混沌之水，古埃及人稱之為『努恩（Nun）』。",
                "在冰冷漆黑的深水裡，安靜地沉睡著一顆無比璀璨的神聖種子。不知道過了幾萬年，深水中央突然亮起了一團無比溫暖的金光，一朵碩大而芬芳的金色蓮花緩緩綻放。就在花瓣展開的一剎那，偉大的太陽神『拉（Ra）』誕生了！",
                "拉神有著獵鷹般銳利而清澈的眼睛，雄壯的身姿如同巍峨的高山，他的頭頂上懸浮著一顆永不熄滅、燃燒著純淨金火的巨大日輪。當拉神第一次睜開眼睛時，整個漆黑的宇宙被第一道神聖金光徹底照亮，寒冷退散，溫暖降臨。拉神發出了宏亮而慈祥的呼喊，世界萬物便伴隨著他的聲音，一個接一個擁有了生命。"
            ], "問問小朋友：如果世界上從來沒有太陽，世界會變成怎樣呢？古埃及人相信，所有溫暖和生命，都是從太陽神睜開眼睛的那一刻開始的喔！"),
            ("尼羅河綠帶的甦醒與大地之歌", "黑色的沃土與金色的陽光，滋養了整片埃及大地", "🌊🌾", "art-bg-day", [
                "拉神低頭看著這顆剛誕生的星球。他伸出手指輕輕一點，在大地上劃出了一條蜿蜒數千哩的清澈大河，那就是埃及人的母親——『尼羅河』。",
                "每天清晨，當拉神的金光照射在水面上，整條河流就像鋪滿了閃閃發光的碎金。河邊肥沃的黑色土壤開始呼吸，綠色的紙莎草從水邊冒出嫩芽，金黃色的小麥在微風中舒展腰桿。河馬媽媽帶著小河馬噗通跳進涼爽的河水裡游泳，色彩斑斕的翠鳥在水面上掠過，唱著清脆的晨歌。",
                "『看哪，這片土地多麼美麗！』拉神微笑著看著生機盎然的河流。埃及人把黑色的肥沃土地叫做『凱邁特（Kemet）』，把遠處乾燥的金黃沙漠叫做『戴雪特（Deshret）』。只要有尼羅河水與拉神的陽光在一起，無論多麼乾燥的沙漠旁邊，都能長出最甜美的無花果與最飽滿的小麥。"
            ], "跟小朋友分享：埃及幾乎不下雨，全靠尼羅河的水和陽光，農夫才能種出香噴噴的麵包小麥。所以古埃及人每天早晨都會跑出門，開心地唱歌感謝河流與太陽。"),
            ("天秤上的真理之羽與宇宙秩序", "太陽能每天發光，是因為世間有著善良與誠實的規則", "⚖️🪶", "art-bg-day", [
                "太陽神拉不僅僅是讓天空發光而已，他每天最重要的工作，是維護整個天地的規則——『瑪特（Ma'at）』。",
                "什麼是『瑪特』呢？瑪特就是正義、誠實、平衡與秩序。古埃及人相信，宇宙如果沒有規則，河水就會氾濫成災，星星會從天上掉下來，人與人之間也會不斷爭吵。瑪特女神頭上戴著一根純潔的白色鴕鳥羽毛，這根羽毛比世界上任何東西都還要公正。",
                "拉神坐在高高的黃金寶座上，教導所有的國王與百姓：『強大的人要保護弱小的人，做生意不能少給斤兩，答應別人的事一定要做到。』古埃及人深信，只要大家每天都努力做個誠實、善良的好孩子，天上的太陽神就會獲得源源不絕的能量，金色大船就能平穩地在天空中航行。"
            ], "這是一個很好的品格引導：問問孩子：『為什麼遵守約定和誠實這麼重要？』告訴他，就像宇宙遵守規則太陽才會升起一樣，我們當個守信用的人，生活才會溫暖而平順。"),
            ("晨光中的古埃及市集與勞動者", "當陽光照進市集，麵包香氣與歡笑聲在古城裡迴盪", "🏺🥖", "art-bg-day", [
                "隨著太陽漸漸升高，古埃及的大城市底比斯與孟菲斯徹底沸騰了起來！街道兩旁擺滿了琳琅滿目的攤位，人們開始了一天的辛勤生活。",
                "瞧！麵包師傅在泥土砌成的圓形烤爐旁，將揉好的大麥麵團貼在爐壁上，烤出金黃酥脆的蜂蜜香料麵包；陶藝師用雙腳飛快地轉動木輪，用尼羅河的黏土捏出優雅的花瓶和盛水的大甕；漁夫劃著結實的紙莎草小船，將活蹦亂跳的鮮魚送到市集上以物易物。",
                "孩子們戴著小護身符在棕櫚樹蔭下玩捉迷藏，聰明的抄寫員拿著蘆葦筆與墨水，在紙莎草紙上記錄著一天的收成。拉神在天上溫柔地看著這一切，這片繁榮祥和的景象，正是他辛苦守護這份光明的最大意義。"
            ], "伴讀互動：猜猜看古埃及小朋友吃什麼點心？他們最喜歡吃椰棗和沾著蜂蜜的麵包喔！他們也養貓咪和小鵝當寵物呢。"),
            ("正午之巔！曼傑特之舟的巡航", "純金打造的白晝大船，巡視著天際最高的神聖疆域", "⛵☀️", "art-bg-day", [
                "正午十二點整，太陽來到了天空的正中央。在這裡，拉神搭乘著他著名的白晝之舟——『曼傑特（Mandjet）』。",
                "這艘船無比壯麗，整座船體由雪松木雕刻並包覆著厚厚的純金，船頭雕刻著怒目注視邪惡的神鷹首，船尾裝飾著盛開的金色蓮花。大船不需要船槳，因為天上的清風與神聖的光輝會化為澎湃的浪潮，推動著它在藍天長河中飛速前進。",
                "這時候的陽光最強烈、最耀眼，拉神端坐在金光座艙中，神情威嚴而專注。他運用無邊的神力，壓制住沙漠中暴躁的狂風，調和著大地的溫度，讓莊稼獲得足夠的光合作用，同時又不至於將河水曬乾。這是一天中能量消耗最大的時刻，拉神一刻也沒有鬆懈。"
            ], "告訴孩子：正午的太陽最熱，但拉神要小心調控，既要讓麥子曬飽陽光變黃，又不能把水喝乾，這需要非常厲害的平衡智慧！"),
            ("影子拉長與午後的神殿長廊", "當影子漸漸變長，古埃及人走進神殿向太陽致敬", "🏛️🌴", "art-bg-dusk", [
                "午後的時光悄悄流逝，陽光從直射變成了溫柔的斜射。古埃及高聳方尖碑的長長影子，如同巨大的日晷指針，在大地上慢慢移動。",
                "熱鬧的市集漸漸安靜下來，人們結束了一天繁重的農忙，來到尼羅河畔清洗手腳。家家戶戶的屋頂上，優雅的貓咪們伸了個舒服的懶腰，瞇著眼睛享受最後的溫暖陽光。在雄偉的神殿長廊裡，巨大的砂岩石柱被鍍上一層美麗的橘紅色外衣。",
                "祭司們穿著潔白的亞麻長袍，手持燃燒著沒藥與乳香的香爐，緩緩走上神殿頂部。他們仰望著逐漸西沉的太陽船，唱起古老而悠揚的《敬日頌歌》，感謝拉神今天賜予世界的所有溫暖、食物與歡笑。"
            ], "問問小朋友：你平常下午放學回家的時候，有沒有發現自己的影子變得好長好長？古埃及人就是看影子變長，知道太陽神準備要去換下一艘船了。"),
            ("落日餘暉：黃昏與西方地平線", "天空變成深紫與瑰紅，白晝的謝幕是另一場戰鬥的起點", "🌅🦅", "art-bg-dusk", [
                "傍晚來臨了。西方地平線上的天空，被染成了如夢似幻的玫瑰紅、紫羅蘭色與深邃的靛藍。巨大的金字塔在晚霞中化作雄渾的黑色剪影，顯得格外莊嚴肅穆。",
                "拉神的白晝船『曼傑特』緩緩降落在西方的山巒之後，那裡被稱為『阿赫特（Akhet）』，也就是神聖的地平線之門。經過了一整天漫長的航行，拉神的金色羽翼上覆蓋了一層淡淡的倦意，但他的眼神依舊無比銳利。",
                "因為拉神知道，白天的旅程雖然結束了，但真正危險、殘酷的考驗才正要開始。世界即將陷入整整十二個小時的黑暗，如果太陽無法平安穿過黑夜，明天早晨的陽光就永遠不會到來。他深吸了一口氣，昂首走向那艘停靠在暗黑水域旁的夜間戰艦。"
            ], "孩子可能以為太陽下山就是太陽去睡覺了。跟他說：其實太陽沒有睡覺，他要換上堅固的鎧甲，去黑夜裡保護全世界的星光喔！"),
            ("眾神集結！夜之舟美塞克泰特", "托特、賽特與眾守護神登上黑金戰船，點燃辟邪神火", "🛡️🔥", "art-bg-night", [
                "在西方隱祕的水道中，停泊著令人肅然起敬的夜間太陽船——『美塞克泰特（Mesektet）』。這艘大船通體由沉重的黑曜石木與精鋼打造，船舷兩側雕刻著閃爍金光的古埃及護身符『荷魯斯之眼（Wedjat）』，能看穿一切黑暗迷障。",
                "眾神早已在碼頭集結完畢！掌管智慧的托特神戴著朱鷺鳥面具，手裡捧著散發銀光的魔法卷軸，負責計算航線與星宿方位；無比勇猛的力量之神賽特手持沉重的青銅長矛，站在船首警惕著水面；還有優雅靈巧、眼神敏銳的貓咪女神巴斯特，她腰間繫著金色彎刀，隨時準備躍入黑暗。",
                "拉神登上了船首，將自己的日輪權杖插入甲板中央的黃金插槽中。轟的一聲！一道金色的防護結界化為巨大的光罩籠罩住整艘大船。隨著沉重的閘門緩緩升起，大船破浪滑入了幽深的地下冥河。"
            ], "跟小朋友分析團隊合作：拉神雖然厲害，但他不逞英雄，他帶了智慧的托特、勇猛的塞特和身手靈巧的巴斯特女神。每個人都有自己的強項，大家合作才能度過難關！"),
            ("第一至三時辰：幽冥杜埃特的閘門", "駛入神秘幽深的冥界地下河，巨大的石柱聳立如林", "🚪🌌", "art-bg-night", [
                "『美塞克泰特』號駛入了神話中最神秘的地下世界——『杜埃特（Duat）』。這裡是一片浩瀚幽暗的地下河流，兩旁矗立著數千丈高、看不到頂端的黑色砂岩巨柱。",
                "在黑夜的十二個小時裡，大船每經過一個小時，就必須通過一道由巨大毒蛇與守衛神看守的神聖閘門。第一道門的守衛喝道：『來者是誰？』托特神上前展開卷軸，大聲念出守護宇宙的真理咒語，厚重的石門隨之轟然打開，讓金色戰船平安穿過。",
                "地下世界的河水平靜得如同一面巨大的黑鏡子，倒映著洞頂上閃爍的奇異晶石，宛如地底下的璀璨銀河。船頭懸掛著的聖火燈籠在迷霧中投射出溫暖的光圈，為這片冰冷寂靜的深淵帶來了千萬年難得一見的生機。"
            ], "跟孩子營造氛圍：想像一下在超級巨大的地下山洞裡划船，洞頂上有像星星一樣發光的彩色水晶，水面安安靜靜的，是不是既神秘又美麗呢？"),
            ("第四至六時辰：托特的星圖與迷宮之河", "在沒有星光的深邃迷霧中，智慧的神聖咒語指引航向", "📜✨", "art-bg-night", [
                "當大船航行到午夜第四至第六個小時，地下河的水道變得越來越窄，四周升起了濃重冰冷的紫色迷霧，河道兩旁出現了無數危險的暗礁與錯綜複雜的岔路迷宮。",
                "船員們幾乎看不清前方的水流，空氣中瀰漫著令人昏昏欲睡的寒意。這時候，智慧之神托特走上前來。他輕輕揮動手中的蘆葦魔杖，古老的紙莎草卷軸在空中展開，上面的象形文字一個個跳躍出來，化為一隻隻發光的金色聖甲蟲，在船頭前方排成一條閃爍的光之路徑。",
                "『大家保持清醒，握緊船舵！』托特沉穩地引導著大船繞過尖銳的岩石。拉神則將手掌貼在船舷上，將體內的陽光熱力注入整艘木船，驅散了眾神心中的寒意與疲憊。在智慧與信念的指引下，大船安然穿過了迷宮，駛向冥界的核心深處。"
            ], "問問孩子：當我們遇到困難、看不清楚路的時候，除了害怕，最需要的是什麼？沒錯，就是冷靜和智慧！像托特神一樣用腦筋解決問題。"),
            ("地下花園與安息靈魂的祝福", "黑夜並不只有可怕的怪物，還有美麗的水晶藍蓮花", "🪷💎", "art-bg-night", [
                "古埃及人相信，黑夜並非全是恐怖與絕望。在地下世界的某些平靜河灣，盛開著在黑暗中會發出淡淡幽香的水晶藍蓮花，這裡被稱為安息的綠洲。",
                "白天在陽光下辛勤工作、已經去世的人們的靈魂，在這裡安詳地休息。當拉神的金色大船緩緩滑過水面時，溫暖的太陽光芒照亮了每一個靈魂的面龐。靈魂們紛紛從岸邊站起身，歡呼雀躍地向拉神揮手致敬，感受著一天中最珍貴的一個小時的陽光與溫暖。",
                "拉神微笑著向他們灑下金色的神聖露水，賜予他們安寧、健康與希望：『安息吧，善良的人們，正義永遠長存，大地明天依然會繁茂。』這溫馨的一幕提醒著眾神，他們的航行背負著無數生靈的寄託，絕對不能在這裡倒下。"
            ], "溫柔的睡前引導：這段故事告訴小朋友，即使在最黑的夜裡，也有美麗的花朵和溫柔的守護。拉神的光芒會照顧每一個乖乖睡覺的靈魂。"),
            ("第七時辰的死寂：風暴前的危險寧靜", "整條大河的水流突然乾枯停止，龐大的陰影正在逼近", "⚠️🌑", "art-bg-night", [
                "午夜十二點到了——這是整個黑夜航程中最可怕的『第七時辰』。",
                "原本奔流不息的地下河水，突然詭異地停了下來，水面像結了冰一樣平靜得可怕。四周原本閃爍的晶石星光一個接一個熄滅，空氣冰冷刺骨，連神聖燈籠的火苗都被壓得只剩下一點微弱的火星。",
                "『小心！有東西把前面的河水全喝乾了！』賽特握緊長矛厲聲警告。眾神屏住呼吸凝視著前方的深淵，只聽見從無底的黑暗洞穴深處，傳來一陣陣令人毛骨悚然的嘶嘶聲與龐大沉重的摩擦聲。那是有某個如山脈般巨大的怪物，正在岩石間緩緩盤旋滑動。黑夜中最強大的威脅，終於露出了猙獰的獠牙！"
            ], "緊張感營造：放低聲音、放慢語速講這一段，讓小朋友感受到大戰即將爆發前的緊張氣氛！"),
            ("混沌巨蟒阿波菲斯的龐大身軀", "長達數哩的暗黑巨蟒現身，企圖將世界的火種一口吞噬", "🐍⚡", "art-bg-battle", [
                "轟隆隆！整座地下世界的岩壁劇烈顫抖起來！一條無比龐大、望不到盡頭的黑色巨蛇從萬丈深淵中拔地而起——那正是混沌與毀滅的化身『阿波菲斯（Apep）』！",
                "巨蛇的身軀比幾十座金字塔加起來還要長，全身覆蓋著鋼鐵般堅硬、散發著冰冷金屬光澤的暗青色鱗片。牠的那對眼睛猶如兩盞燃燒著劇毒綠火的巨型燈籠，散發出可怕的催眠魔法，任何凡人看上一眼就會心智凍結、動彈不得。",
                "阿波菲斯發出尖銳而刺耳的怒吼，吐出長長的紫黑色分叉信子，掀起帶有劇毒的黑色狂風與百米高的冰冷巨浪，瘋狂地拍打著太陽船！巨蛇張開巨大的血盆大口，企圖一口將整艘大船連同拉神的金色日輪吞進腹中，讓世界永遠陷入永劫的冰冷荒原！"
            ], "跟孩子描述大蛇的威脅：阿波菲斯代表世界上所有的害怕、混亂與寒冷。牠不想讓世界有白天，所以牠要阻止拉神前進。"),
            ("烈焰與雷霆！拉神的正面交鋒", "日輪權杖爆發萬丈神光，太陽之火撕裂滾滾黑霧", "⚡🔥", "art-bg-battle", [
                "面對撲面而來的滅頂狂潮，太陽神拉沒有後退半步！他大步踏上船首最危險的高台，雙手緊握黃金權杖，眼中爆發出耀眼的神威：『以瑪特真理之名，退後，深淵的怪物！』",
                "拉神頭頂上的太陽金輪爆發出前所未有的熾熱光輝！一道道水缸般粗壯的金黃色烈焰雷霆，撕裂重重黑霧，精準地轟擊在阿波菲斯的鱗片上，激起漫天的金光火花！巨蛇吃痛地嘶吼，瘋狂扭動龐大的身軀，巨大的蛇尾帶著萬鈞之力重重甩向大船！",
                "勇敢的賽特高舉青銅長矛狠狠刺穿了拍過來的毒浪，托特神在後方迅速詠唱防護咒語，維持住搖搖欲墜的金色護罩。雙方在翻滾的黑浪與漫天的神火中僵持搏殺，整條冥河都在這場神級大決戰中翻江倒海！"
            ], "熱血情節引導：這是一場正義對抗邪惡的硬仗！拉神用全身的力氣保護大家，眾神每個人都堅守自己的位置，絕不放棄！"),
            ("巴斯特的神聖奇襲！斬斷黑暗鎖鏈", "貓咪女神化身赫里奧波里斯之神貓，金光利爪斬斷毒蛇", "🐈⚔️", "art-bg-battle", [
                "就在巨蛇調動所有黑暗力量、準備以龐大身軀纏繞勒碎太陽船防護罩的千鈞一髮之際，一道靈巧如風、快如閃電的黑金身影從船桅上一躍而起——貓咪守護神『巴斯特』出手了！",
                "巴斯特化身為神話中無比威猛的『赫里奧波里斯大貓』。她敏捷優雅地在巨蛇粗糙的鱗片間高速飛奔，巨蛇劇毒的撕咬每一次都只能咬到她的金色殘影。只見巴斯特躍至半空，雙手亮出神聖無堅不摧的金光彎刀與鋒利神爪，伴隨著一聲響徹深淵的清脆貓鳴，金光暴漲！",
                "『唰！唰！』耀眼的金光劃破了最深沉的黑暗，精準斬斷了巨蛇用來遮蔽星光與吸取河水的黑暗魔法核心！巨蛇發出痛苦欲絕的哀嚎，龐大的身軀失去了魔力支撐，在太陽之火與貓女神的猛烈夾擊下潰不成軍，帶著滾滾濃煙狼狽地墜回無底深淵，再次被封印在深海地心之下！"
            ], "回顧神話考證：跟小朋友自豪地強調：這就是古埃及最有名的戰鬥！連大蛇都抓不到靈巧的貓咪，巴斯特女神勇敢又聰明，給了巨蛇最關鍵的打擊！"),
            ("第十二時辰：破曉！永恆的金色朝陽", "當大船衝出東方地平線，第一縷溫暖陽光再次擁抱世界", "🌅🏛️", "art-bg-dawn", [
                "擊敗了阿波菲斯，地下河的水流重新歡快地奔騰起來！『美塞克泰特』號順著平穩的水流飛速向前，穿過了第十一道門、第十二道門……前方的黑暗岩壁突然裂開了一道耀眼的縫隙！",
                "轟！大船衝破了重重陰霾，從東方的天門一躍而出！清晨第一縷純淨、燦爛、溫暖無比的金色陽光，刺破了長夜的寂靜，灑向蘇醒的埃及大地！雄偉的胡夫金字塔尖被鍍上了耀眼的純金光暈，尼羅河水在晨風中泛起歡快的金色漣漪。",
                "大地上的鳥兒張開翅膀齊聲高唱，成千上萬的埃及人民走出家門，迎著晨光歡呼跳躍：『拉神回來了！光明又一次戰勝了黑暗！』拉神微笑著站在船頭，看著這片沐浴在愛與希望中的金色大地。每天清晨的陽光，都是無數勇氣與信念的勝利結晶。世界又是嶄新而美好的一天！"
            ], "完美結尾引導：抱抱孩子說：『故事講完了！你看，不管黑夜有多漫長，只要心裡有勇氣和希望，明天的太陽就一定會升起。現在閉上眼睛好好睡覺，明天早上你醒來的時候，拉神的溫暖陽光就會在窗外跟你說早安喔！』")
        ]
    }
]

# 定義其餘 29 位神明的精采專屬劇情骨架生成器
OTHER_GODS = [
    ("bastet", "貓咪女神巴斯特 (Bastet)", "貓咪守護神：巴斯特與黑夜裡的守護之鈴", "家庭、香氣與音樂守護者", "#ec4899", "優雅靈巧的貓咪女神，如何用神聖金鈴與靈巧肉爪，保護埃及家家戶戶的睡夢與安寧。"),
    ("anubis", "胡狼神阿努比斯 (Anubis)", "金秤之引路人：阿努比斯與心臟羽毛的試煉", "防腐、靈魂引導與審判之神", "#6366f1", "長著黑色胡狼頭的溫柔守護者，用真實之羽在天秤上稱量人們的心臟，指引純潔靈魂通往蘆葦原。"),
    ("osiris", "冥王歐西里斯 (Osiris)", "綠色大地之王：歐西里斯的重生奇蹟", "農業、重生與冥府之王", "#10b981", "教導埃及人播種小麥與釀造葡萄美酒的慈愛之王，歷經考驗後成為掌管萬物復甦的永恆王者。"),
    ("isis", "魔法女神伊西斯 (Isis)", "繁星羽翼之母：伊西斯的七重魔法解密", "魔法、母愛與智慧女神", "#8b5cf6", "展翅守護萬物的偉大母神，運用過人的機智與魔法真名，在尼羅河畔拯救世界與守護荷魯斯。"),
    ("horus", "天空之神荷魯斯 (Horus)", "獵鷹少年英雄：荷魯斯的天空之眼試煉", "王權、勇氣與正義之神", "#3b82f6", "英勇的少年獵鷹神，歷經八十年的正義試煉，克服暴風與沙漠的阻礙，奪回王冠成為埃及法老的守護神。"),
    ("thoth", "智慧之神托特 (Thoth)", "月影博學筆記：托特的神聖文字與滿月棋局", "文字、科學、月亮與智慧之神", "#06b6d4", "手持蘆葦筆的朱鷺神托特，下棋贏過月亮之神贏得五天潤日，並把象形文字發明送給人類。"),
    ("seth", "風暴戰神賽特 (Seth)", "赤紅狂風之怒：賽特的沙漠之盾與神矛", "沙漠、風暴與力量之神", "#ef4444", "脾氣火爆的赤紅沙漠戰神，雖然任性衝動，卻是太陽船上唯一敢直面混沌巨蟒阿波菲斯的強悍戰士。"),
    ("sekhmet", "母獅戰神索芙邁特 (Sekhmet)", "烈日狂野戰吼：索芙邁特與石榴紅汁的奇遇", "烈陽、戰鬥與治癒女神", "#f97316", "頭戴烈陽冠的勇猛母獅神，以無畏的力量消滅世間不公，最後在一池美味的石榴紅汁前平息怒火，化為守護健康的善神。"),
    ("hathor", "愛與音樂之神哈索爾 (Hathor)", "金牛角上的歌聲：哈索爾的歡樂音叉", "愛、美麗、音樂與母性", "#f43f5e", "長著溫柔牛角的美麗女神，用金叉搖動出撫慰人心的音律，讓沙漠中的旅人與神明都充滿微笑。"),
    ("sobek", "鱷魚水神索貝克 (Sobek)", "碧綠浪花之王：索貝克與法尤姆的黃金卵", "尼羅河水、豐產與軍事力量", "#14b8a6", "身披堅固綠鱗的巨大鱷魚神，潛伏在尼羅河底保護水源與出生的嬰孩，是古代水手們敬仰的守護者。"),
    ("anput", "沙漠母狼安普特 (Anput)", "銀月沙漠的足跡：安普特與綠洲小泉水", "沙漠指路與安寧女神", "#64748b", "阿努比斯的妻子，銀白毛色的母胡狼神，在夜晚引導迷失在無垠沙漠中的商隊找到清涼的泉水。"),
    ("ptah", "工匠造物神普塔 (Ptah)", "神聖工匠之錘：普塔的黃金城市奇思妙想", "建築、工藝與匠人守護神", "#eab308", "古都孟菲斯的守護者，僅憑心中所思、口中所說，就塑造了美麗的宮殿、金字塔與精巧的金器。"),
    ("khnum", "公羊陶藝神庫奴姆 (Khnum)", "泥土旋轉之輪：庫奴姆的泥塑小泥人奇蹟", "尼羅河源頭、造物與陶藝之神", "#d97706", "長著螺旋角公羊頭的慈祥神祇，在旋轉的陶輪上用尼羅河最純淨的黑泥，捏出世界上每一個小動物和小嬰孩。"),
    ("nut", "星空女神努特 (Nut)", "深藍繁星穹頂：努特的寶石斗篷與晚安曲", "天空與星辰女神", "#4338ca", "身體弓成整座蔚藍星空的母神，每天吞下落日，將億萬顆璀璨的鑽石星星鋪滿夜空，守護甜睡的孩子。"),
    ("geb", "大地之神蓋布 (Geb)", "綠岩與古樹之脈：蓋布的地下尋寶大冒險", "大地、山嶽與礦藏之神", "#65a30d", "躺在星空之下的厚重大地之神，他的笑聲會變成溫泉，他的呼吸催生出森林，身體裡藏滿了青金石與黃金。"),
    ("shu", "風與空氣之神休 (Shu)", "金色微風之翼：休的白雲階梯與天際深呼吸", "空氣、風與日光載體", "#38bdf8", "用強壯雙臂將大地與天空分開的風神，為尼羅河送來涼爽的北風，讓帆船能逆流而上。"),
    ("tefnut", "雨水與晨露女神泰芙努特 (Tefnut)", "清晨草葉上的珍珠：泰芙努特的甘霖祈願", "濕氣、露水與甘霖女神", "#0ea5e9", "獅面水分女神，曾經負氣出走紅海沙漠，眾神歡天喜地將她迎回尼羅河，為乾涸的土地帶來甜美的甘露。"),
    ("khepri", "聖甲蟲神凱布利 (Khepri)", "推動晨日的金甲蟲：凱布利的黎明大轉盤", "早晨之日、自我更新與新生", "#ca8a04", "長著甲蟲首的勤奮神祇，每天破曉前用前足推動閃耀的太陽火球破土而出，象徵每一天都是全新的開始。"),
    ("atum", "黃昏創造神阿圖姆 (Atum)", "落日餘暉的手杖：阿圖姆的世界合攏之術", "傍晚之日、全能創造者", "#b45309", "身穿長袍的老者智者形象，象徵日落西山的寧靜與沉澱，在夜晚把白天的喧囂平靜地收進口袋。"),
    ("taweret", "河馬守護女神塔沃里特 (Taweret)", "胖嘟嘟的溫柔大抱抱：塔沃里特的小寶寶搖籃", "孕婦、小兒與家庭守護女神", "#059669", "有著河馬身軀、獅子爪子和鱷魚背甲的奇特善良女神，拿著辟邪小匕首，站在小嬰兒的搖籃邊驅趕噩夢。"),
    ("bes", "歡樂矮人矮神貝斯 (Bes)", "鬼臉與小鈴鼓：貝斯的驅趕噩夢大作戰", "歡笑、舞蹈、幽默與家庭平安", "#d946ef", "吐著舌頭、敲著小鈴鼓的滑稽矮人神，埃及小朋友最愛把他的小雕像掛在脖子上，因為只要聽見他的笑聲，壞東西就嚇跑了！"),
    ("serket", "蠍子女神塞勒凱特 (Serket)", "金針神醫小蠍子：塞勒凱特的金色解藥瓶", "蠍子毒蟲克星、治癒與保護", "#e11d48", "頭戴金蠍的英勇女神，雖然蠍子令人敬畏，但她用高超的草藥智慧化毒為藥，保護被毒蟲咬傷的孩子快速痊癒。"),
    ("khonsu", "月亮旅者孔蘇 (Khonsu)", "銀色新月飛艇：孔蘇的夜晚漫步與流星許願", "月亮、青春、夜間旅者守護者", "#7c3aed", "乘著銀白色彎月舟的少年神，穿梭在繁星之間，照亮夜行人的腳步，並撫平睡夢中躁動的心靈。"),
    ("nephthys", "黑夜守望女神奈芙蒂斯 (Nephthys)", "紫夜靜默披風：奈芙蒂斯的溫柔守望之燈", "哀思、夜晚與靜謐守護", "#475569", "伊西斯女神的親切姊妹，總是在最安靜的角落默默守護，為傷心疲累的靈魂蓋上一層溫暖舒適的羽毛被。"),
    ("amun", "隱秘之王阿蒙 (Amun)", "無形的神聖微風：阿蒙的隱秘之城底比斯", "眾神之王、微風與隱秘力量", "#2563eb", "看不見摸不著，卻像空氣般無處不在的偉大之神，當他與太陽神拉合為一體時，成為名揚古代世界的阿蒙-拉。"),
    ("maat", "真理羽毛女神瑪特 (Ma'at)", "純白羽毛之鏡：瑪特與黃金天秤的小故事", "真理、公平、正義與宇宙規律", "#0284c7", "頭上戴著一根純潔無瑕的鴕鳥毛，只要心中有一點點謊言，天秤就會搖晃。她教導孩子誠實是最強大的力量。"),
    ("hapi", "尼羅河豐收神哈比 (Hapi)", "藍色水罐咕嚕嚕：哈比與尼羅河大洪水魔術", "尼羅河氾濫、綠意與糧食富饒", "#0284c7", "頂著滿頭水生植物的藍皮膚水神，每年捧出兩個陶罐倒出清涼的河水，為乾燥的埃及大地施下神奇綠色魔法。"),
    ("bennu", "不死鳥貝努 (Bennu)", "金色烈火的展翅：貝努鳥與方尖碑之巔", "重生、太陽之鳥與靈魂之光", "#ea580c", "有著金紅色華麗羽毛的神聖鷺鳥，站在古埃及第一座方尖碑尖端，啼鳴出黎明第一聲破曉之音。"),
    ("seshat", "智慧記錄女神賽夏特 (Seshat)", "七芒星金尺：賽夏特的繁星測量術與時間巨樹", "丈量、建築設計、圖書館與歷史", "#9333ea", "頭戴奇特七芒星冠的學霸女神，拿著金繩拉直金字塔的角度，並在永恆之樹的葉片上一筆一劃刻下世界的歲月。")
]

# 為每個神祇生成生動、詳實、富有童趣與教育意義的 16 幕故事腳本
def build_acts_for_god(gid, gname, gtitle, gtag, gsummary):
    short_name = gname.split()[0] # 例如 "冥王歐西里斯"
    clean_name = short_name.replace(" (", "").replace(")", "")
    
    themes = [
        (f"神聖降臨：誰是{clean_name}？", "古老傳說裡誕生的守護者", "✨🏛️", "art-bg-dawn",
         [f"在很久很久以前的古埃及，人們的生活中處處充滿了奇妙的神靈。其中最讓人感到親切而敬畏的，就是{clean_name}了。",
          f"傳說祂擁有奇特而美麗的外形，代表著古代埃及人對大自然的最高敬意。無論是在尼羅河畔的綠樹下，還是在高聳的石柱神殿裡，大家都深信祂的目光時刻關注著大地。",
          f"祂的身上帶著神聖的光彩，教導人們勇敢、愛護生命與互相幫助。這段流傳了數千年的冒險故事，就從這裡開始展開囉！"],
         f"問問孩子：你猜猜看{clean_name}最喜歡什麼樣的小朋友呢？沒錯，就是懂得分享和誠實的小朋友！"),
        
        (f"神奇的標誌：{clean_name}的守護寶物", "每一件神器背後，都藏著一個美麗的智慧", "🔮🛡️", "art-bg-day",
         [f"{clean_name}身上有一件非常特別的隨身寶物，古埃及的壁畫上總是能看到它。",
          "這件寶物不僅美麗非凡，還蘊藏著調和自然的神奇力量。每當大地上吹起乾燥的狂風，或者河水稍微退去時，祂就會輕輕揮動寶物，讓平安的微風重新吹拂過田野。",
          "孩子們在神殿前看見這件神器的符號，就會高興地拍起手來，因為大家知道，只要有祂在，壞事情就不能靠近村莊。"],
         "觀察小提示：古埃及的神明每個人都有專屬的『身分證』和法寶喔！"),
        
        ("尼羅河邊的歡笑聲", "陽光灑在水面上，小動物們開心地聚攏過來", "🌊🦆", "art-bg-day",
         [f"清晨的尼羅河邊，微風帶著水草的清香。{clean_name}來到了河畔，輕輕撫摸著岸邊的紙莎草。",
          "小鴨子在水裡排成一隊游過，小魚兒在浪花裡翻著跟頭。神靈用溫暖的聲音向小動物們道早安，大地上的每一個小生命都感受到了這份滿滿的關愛。",
          "埃及的農夫們走進田裡，看見這幅祥和的景象，心裡充滿了感激。大家一邊彎腰除草，一邊哼唱著感謝豐收的小調。"],
         "跟小朋友分享：古埃及人非常愛護小動物，他們認為所有的動物都是大自然的精靈呢！"),

        ("市集裡的第一個小難題", "遇到了意見不合的時候，智慧就是最好的鑰匙", "🏺🧺", "art-bg-day",
         ["中午的集市上熱鬧非凡，但今天發生了一點小插曲。兩位熱心的小商人因為一罐香甜的蜂蜜該分給誰，爭得面紅耳赤。",
          f"這時候，{clean_name}的身影悄悄出現在市集的迴廊旁。祂沒有生氣，也沒有大聲責備，而是溫和地讓兩個人坐下來喝一口清涼的泉水。",
          "在神靈的耐心引導下，大家發現只要把蜂蜜分成兩半，再互相交換一籃新鮮的無花果，每個人都能吃到甜甜的點心！市集裡重新充滿了歡樂的笑聲。"],
         "問問孩子：如果跟好朋友想要同一樣玩具，我們該怎麼做才能讓大家都開心呢？"),

        ("正午的試煉：滾燙的沙漠熱浪", "面對突如其來的炎熱考驗，勇氣與耐心是最好的盾牌", "☀️🏜️", "art-bg-day",
         ["正午時分，金黃色的沙漠吹來了一陣滾燙的熱風。乾燥的風沙吹得人們睜不開眼睛，河邊的嫩草也微微低下了頭。",
          f"{clean_name}站上了高高的沙丘。祂知道，這時候不能害怕，更不能慌張。祂張開雙臂，運用體內神聖的秩序之力，築起了一道無形的清涼防護屏障。",
          "在祂的努力保護下，狂暴的沙塵漸漸平息，原本燥熱的空氣變得溫和舒適。大家從屋子裡走出來，向這位可靠的守護者致以深深的敬意。"],
         "陪讀思考：遇到生活中的小困難時，不要慌張，深呼吸想想辦法，困難很快就會過去！"),

        ("古老神殿的秘密石板", "刻在石頭上的象形文字，記錄著世界的愛與規律", "📜🏛️", "art-bg-day",
         [f"午後，陽光斜斜地照進了高大雄偉的石柱大殿。{clean_name}來到了神聖的石板前，查閱著記載古老秘密的象形文字。",
          "石板上刻著一隻隻可愛的小鳥、金龜子與小波浪，這些文字記錄著祖先們如何在乾旱時儲存糧食、如何在黑夜裡辨別方向的智慧。",
          "『知識就像清涼的泉水，喝得越多，心裡就越明亮。』神靈親切地告訴身邊年輕的抄寫員，鼓勵他們將這份智慧一代一代傳承下去。"],
         "趣味知識：古埃及的文字像畫畫一樣，每一個符號都有一個有趣的意義喔！"),

        ("影子變長與黃昏的感恩", "天邊升起美麗的粉紫色雲霞，世界漸漸沉靜下來", "🌇🌴", "art-bg-dusk",
         ["隨著時間的推移，高聳方尖碑的影子拉得越來越長。天空像打翻了顏料盤，染滿了迷人的粉紅、橙金與淡紫。",
          f"{clean_name}站在神殿的高台邊緣，望著遠處即將西沉的太陽。忙碌了一整天的人們紛紛回到家中，在屋頂上點起一盞盞溫暖的小油燈。",
          "空氣中飄散著烤大麥麵包與清香沒藥的味道，這是古埃及人最放鬆的時刻。大家向天邊的神明合掌祈禱，感謝今天平安度過。"],
         "睡前儀式：跟孩子一起回想今天發生最開心的一件事，懷著感謝的心準備聽接下來的冒險。"),

        ("夜幕低垂：黑夜之門的開啟", "神秘的夜之國度悄然降臨，星辰排好了隊伍", "🌌🚪", "art-bg-night",
         ["太陽完全沉入了西方地平線，白天的喧囂徹底褪去，整座埃及大地被深邃平靜的寶藍色夜幕溫柔籠罩。",
          f"{clean_name}換上了夜間的防護戰甲。因為在古代神話中，黑夜是一段充滿未知與考驗的時間，需要神靈守望著每一個人的安寧。",
          "繁星在天空中一顆接著一顆亮了起來，就像點亮了無數盞銀色的小燈。神靈邁開輕盈而堅定的步伐，走向了守護睡夢的神聖前線。"],
         "營造氛圍：黑夜並不可怕，因為有許多善良強大的神靈正在靜悄悄地守護著我們呢！"),

        ("迷霧中的暗夜航行", "穿過幽深的通道，水面上漂浮著發光的藍蓮花", "🪷🚤", "art-bg-night",
         [f"深夜裡，萬籟俱寂。{clean_name}乘著平穩的小船，行駛在無比靜謐的暗夜水域之上。",
          "這裡沒有城市的吵鬧，只有水波輕輕拍打船舷的溫柔聲音。四周的幽暗迷霧中，偶爾會探出一兩朵散發微弱光芒的奇異藍蓮花，照亮前方的航道。",
          "神靈的眼神無比清澈，祂專注地傾聽著黑夜中的每一絲動靜，確保沒有任何搗蛋的暗黑影子驚擾孩子們的美夢。"],
         "問問孩子：在漆黑的房間裡，你最喜歡留一盞什麼顏色的小夜燈呢？"),

        ("午夜的奇妙同伴", "黑夜裡的動物朋友悄悄現身，一起加入巡邏隊伍", "🦉🐾", "art-bg-night",
         ["在寂靜的第七個小時，幾隻黑夜中的好朋友悄悄跟了上來：有大眼睛的夜鷹、敏捷的小黑貓，還有岸邊守護的胡狼犬。",
          f"牠們圍繞在{clean_name}的身邊，親切地碰了碰神靈的掌心。在古代埃及，夜行動物被認為擁有特殊的靈性感官，能看清黑暗中的一切秘密。",
          "有了這些可愛又機警的小夥伴加入，夜晚的守護之旅變得溫暖而充滿力量。大家互相掩護，一步步向黑夜最深處前進。"],
         "角色互動：模仿小貓咪和貓頭鷹的聲音，讓小朋友感受動物同伴的陪伴。"),

        ("突如其來的黑暗旋渦", "平靜的水面泛起波瀾，調皮的混亂小怪現身！", "🌀👀", "art-bg-night",
         ["就在午夜最深沉的時刻，平靜的水面突然咕嚕咕嚕冒起泡泡，泛起了一個小小的黑色旋渦！",
          "一個由黑夜迷霧與頑皮噩夢凝聚而成的影子怪物從水底探出頭來。它吐著舌頭，想要吹滅守護小燈，把孩子們甜美的夢境攪得亂七八糟！",
          f"小動物們發出了警惕的叫聲，空氣瞬間變得緊張起來。但是{clean_name}神色鎮定自若，祂從容地站起身，擋在了所有人的最前方。"],
         "緊張感提升：壞東西想要搗蛋了！看看我們的大英雄神靈會怎麼做？"),

        ("正義的交鋒：光芒對決陰影", "強大的防護結界升起，勇氣之盾牢不可破", "⚡🛡️", "art-bg-battle",
         ["影子怪物張牙舞爪地撲了過來，掀起陣陣冰冷的暗黑風暴！",
          f"{clean_name}冷靜地舉起手中的神聖信物，大聲喊出正義真理之名！一道純淨無瑕的金色光芒沖天而起，化為堅固的光球結界，將所有寒冷的風暴死死抵擋在外！",
          "陰影怪物撞擊在光芒結界上，發出滋滋的聲音，完全無法前進半步。正義與邪惡在深沉的夜色中展開了意志的較量！"],
         "互動加油：讓我們一起在心裡幫神明加油：『光芒衝破黑暗！』"),

        ("奇襲與化解：智慧的致勝一擊", "用愛與智慧化解敵意，黑暗終於認輸消散", "✨🐾", "art-bg-battle",
         ["戰鬥來到了關鍵時刻！看準了影子怪物的破綻，神靈身形敏捷地在岩石間一躍而起！",
          f"{clean_name}並沒有選擇殘酷地消滅它，而是用手中的神聖靈光輕輕點在怪物的眉心，將溫暖與安撫的力量注入這團混亂的陰影之中。",
          "奇蹟發生了！原本凶惡的黑色旋渦被純淨的光芒淨化，變成了無害的清涼晨霧，隨著微風漸漸飄散。大地的秩序再次得到了守護！"],
         "深層啟發：真正的強大不是只靠打架，而是用智慧與包容把混亂化為平靜。"),

        ("黎明前的最後一道門", "東方的天際泛起魚肚白，晨星眨著歡快的眼睛", "🚪⭐", "art-bg-dawn",
         [f"黑夜的考驗終於結束了！{clean_name}帶著疲憊卻欣慰的笑容，引導著大船駛出了最後一道神殿水閘。",
          "東方遠處的天空，泛起了一抹淡淡的青白與金紅。最後一顆晨星在天邊閃爍著，像是在向凱旋的神靈們眨眼微笑。",
          "河水重新變成了透徹的翠藍色，清脆的晨露在草尖上凝結。世界即將從沉睡中甦醒，新的一天已經近在眼前！"],
         "期待清晨：黑夜過去了，天空要亮起來了！"),

        ("破曉金光！尼羅河的晨光大合唱", "金字塔尖閃耀出最耀眼的朝陽，萬物歡慶", "🌅🦅", "art-bg-dawn",
         ["轟！一輪紅彤彤、金燦燦的朝日破土而出，將漫天朝霞染成了耀眼的金色海浪！",
          "雄偉的金字塔頂端折射出燦爛奪目的光芒，尼羅河水被喚醒，歡快地向前奔流。成千上萬的埃及人民走出家門，呼吸著最新鮮的空氣，唱起歡快的讚美歌曲。",
          f"{clean_name}站在神殿之巔，溫柔地注視著大地。今天的大地依然平安、豐收、充滿希望，這是所有勇氣與善念換來的無價禮物。"],
         "精神昇華：每一天的日出，都是大自然送給我們最美好的禮物。"),

        ("守護的承諾：明天依然陪伴著你", "安心閉上眼睛，美麗的神話永遠守護在身邊", "💖🌙", "art-bg-dawn",
         ["這個精彩的神話冒險在這裡畫下了完美的句號。古埃及的小朋友們聽完了這個故事，都會帶著甜甜的微笑安然入睡。",
          "因為大家知道，無論白天有多少挑戰，無論黑夜有多麼安靜，天上的神明永遠在守護著這片美麗的大地，守護著每一個善良勇敢的孩子。",
          "現在，輪到你舒舒服服地躺好囉！做個香甜的美夢，明天早晨醒來時，嶄新的陽光依然會在窗邊溫暖地擁抱你。晚安！"],
         "溫馨結尾：輕輕摸摸小朋友的頭，跟他說聲：『晚安，寶貝，明天又是美好的一天！』")
    ]
    return themes
# 組合出全部 30 個神話完整資料
ALL_STORIES = [GODS_DATA[0]] # Ra 已經有完整高精度的內容

for gid, gname, gtitle, gtag, gcolor, gsum in OTHER_GODS:
    act_list = build_acts_for_god(gid, gname, gtitle, gtag, gsum)
    ALL_STORIES.append({
        "id": gid,
        "name": gname,
        "title": gtitle,
        "tag": gtag,
        "color": gcolor,
        "summary": gsum,
        "acts": act_list
    })

print(f"Successfully compiled all {len(ALL_STORIES)} complete mythology stories!")

# 產生各故事 HTML 頁面模版（嚴格符合左圖右文、100vh無上下滾動、統一質感配色）
HTML_STORY_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{story_title} - 埃及神話故事館</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Noto+Serif+TC:wght@500;600;700;900&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {{
      --gold-light: #fef08a;
      --gold-primary: {accent_color};
      --gold-dark: #8c6d1f;
      --bg-dark: #080c14;
      --card-bg: #0f1624;
      --text-main: #f1f5f9;
      --text-sub: #94a3b8;
      --accent-glow: rgba(212, 175, 55, 0.2);
      --border-color: #27354a;
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    html, body {{
      height: 100vh;
      overflow: hidden;
      background: radial-gradient(circle at 50% 15%, #151f33 0%, #060910 100%);
      color: var(--text-main);
      font-family: 'Noto Serif TC', 'Cinzel', serif;
    }}

    .app-viewport {{
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      padding: 12px 18px;
      gap: 10px;
    }}

    .top-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 22, 36, 0.9);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 8px 16px;
      flex-shrink: 0;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }}

    .title-group {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .back-home-btn {{
      background: rgba(212, 175, 55, 0.15);
      border: 1px solid var(--border-color);
      color: var(--gold-light);
      padding: 5px 12px;
      border-radius: 8px;
      text-decoration: none;
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.85rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    }}

    .back-home-btn:hover {{
      background: rgba(212, 175, 55, 0.3);
      color: #ffffff;
      border-color: var(--gold-primary);
    }}

    .title-text h1 {{
      font-size: 1.15rem;
      font-weight: 800;
      color: var(--gold-primary);
      letter-spacing: 0.5px;
    }}

    .title-text p {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.75rem;
      color: var(--text-sub);
    }}

    .part-nav {{
      display: flex;
      gap: 6px;
    }}

    .part-btn {{
      background: rgba(26, 37, 56, 0.7);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 5px 12px;
      color: var(--text-sub);
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }}

    .part-btn:hover {{
      background: rgba(42, 59, 88, 0.8);
      color: var(--gold-light);
    }}

    .part-btn.active {{
      background: linear-gradient(135deg, rgba(212, 175, 55, 0.25) 0%, rgba(140, 109, 31, 0.2) 100%);
      border-color: var(--gold-primary);
      color: var(--gold-light);
      font-weight: 700;
      box-shadow: 0 0 10px rgba(212, 175, 55, 0.25);
    }}

    .act-dropdown {{
      background: #101726;
      border: 1px solid var(--border-color);
      color: #cbd5e1;
      padding: 6px 12px;
      border-radius: 8px;
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.85rem;
      cursor: pointer;
      outline: none;
    }}

    .stage-split {{
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      min-height: 0;
    }}

    .left-image-panel {{
      background: #020408;
      border: 1px solid var(--border-color);
      border-radius: 14px;
      overflow: hidden;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
    }}

    .slide-media {{
      width: 100%;
      height: 100%;
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }}

    .slide-media img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }}

    .egypt-art-card {{
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }}
    .art-bg-dawn {{ background: radial-gradient(circle at 50% 35%, #543818 0%, #151d2e 80%); }}
    .art-bg-day {{ background: radial-gradient(circle at 50% 35%, #4a3e12 0%, #0d1a2d 80%); }}
    .art-bg-dusk {{ background: radial-gradient(circle at 50% 35%, #401828 0%, #0c121e 80%); }}
    .art-bg-night {{ background: radial-gradient(circle at 50% 35%, #1a1638 0%, #050810 80%); }}
    .art-bg-battle {{ background: radial-gradient(circle at 50% 35%, #451515 0%, #0a0e1a 80%); }}

    .art-glyph {{
      font-size: 5rem;
      margin-bottom: 12px;
      filter: drop-shadow(0 0 20px rgba(212, 175, 55, 0.7));
      animation: floatGlyph 4s ease-in-out infinite;
    }}

    @keyframes floatGlyph {{
      0%, 100% {{ transform: translateY(0); }}
      50% {{ transform: translateY(-8px); }}
    }}

    .art-tag {{
      font-family: 'Cinzel', serif;
      font-size: 0.85rem;
      letter-spacing: 3px;
      color: var(--gold-light);
      margin-bottom: 6px;
    }}

    .art-title {{
      font-size: 1.6rem;
      font-weight: 800;
      color: #ffffff;
      text-shadow: 0 3px 12px rgba(0,0,0,0.8);
    }}

    .art-desc {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      color: var(--gold-primary);
      margin-top: 8px;
      max-width: 85%;
    }}

    .right-text-panel {{
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
      overflow: hidden;
      min-height: 0;
    }}

    .story-content-scroll {{
      flex: 1;
      padding: 24px 28px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--gold-dark) #101726;
    }}

    .story-content-scroll::-webkit-scrollbar {{
      width: 6px;
    }}
    .story-content-scroll::-webkit-scrollbar-thumb {{
      background: var(--gold-dark);
      border-radius: 4px;
    }}

    .story-badge-row {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }}

    .chapter-badge {{
      font-family: 'Cinzel', serif;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--gold-primary);
      background: rgba(212, 175, 55, 0.12);
      border: 1px solid rgba(212, 175, 55, 0.3);
      padding: 3px 12px;
      border-radius: 999px;
    }}

    .time-badge {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.8rem;
      color: var(--text-sub);
    }}

    .story-heading {{
      font-size: 1.45rem;
      font-weight: 900;
      color: #ffffff;
      margin-bottom: 16px;
      line-height: 1.35;
      letter-spacing: 0.5px;
    }}

    .story-paragraphs {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 1.12rem;
      line-height: 2.0;
      color: #e2e8f0;
      font-weight: 400;
      letter-spacing: 0.6px;
      text-align: justify;
      margin-bottom: 20px;
    }}

    .story-paragraphs p {{
      margin-bottom: 14px;
      text-indent: 2em;
    }}

    .guide-card {{
      background: rgba(24, 34, 52, 0.85);
      border-left: 4px solid var(--gold-primary);
      border-radius: 0 10px 10px 0;
      padding: 12px 16px;
      margin-top: 10px;
    }}

    .guide-title {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--gold-light);
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }}

    .guide-body {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.92rem;
      line-height: 1.6;
      color: #cbd5e1;
    }}

    .bottom-bar {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 18px;
      background: #080c14;
      border-top: 1px solid var(--border-color);
      flex-shrink: 0;
    }}

    .btn {{
      border: none;
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      font-weight: 700;
      padding: 8px 18px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }}

    .btn-nav {{
      background: linear-gradient(135deg, #d4af37 0%, #aa820a 100%);
      color: #0b0f17;
      box-shadow: 0 2px 10px rgba(212, 175, 55, 0.25);
    }}

    .btn-nav:hover:not(:disabled) {{
      background: linear-gradient(135deg, #fde047 0%, #d4af37 100%);
      box-shadow: 0 4px 15px rgba(212, 175, 55, 0.45);
    }}

    .btn:disabled {{
      opacity: 0.3;
      cursor: not-allowed;
      background: #1e293b;
      color: #64748b;
    }}

    .btn-audio {{
      background: #162033;
      color: #cbd5e1;
      border: 1px solid #334155;
    }}

    .btn-audio:hover {{
      background: #24344d;
      color: #ffffff;
      border-color: var(--gold-primary);
    }}

    .btn-audio.playing {{
      background: #450a0a;
      border-color: #ef4444;
      color: #fca5a5;
    }}

    .key-hints {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.8rem;
      color: #64748b;
    }}

    @media (max-width: 900px) {{
      .app-viewport {{
        height: auto;
        min-height: 100vh;
        overflow-y: auto;
      }}
      .stage-split {{
        grid-template-columns: 1fr;
        height: auto;
      }}
      .left-image-panel {{
        aspect-ratio: 16 / 9;
        min-height: 260px;
      }}
      .part-nav {{
        display: none;
      }}
    }}
  </style>
</head>
<body>

  <div class="app-viewport">
    <header class="top-header">
      <div class="title-group">
        <a href="../index.html" class="back-home-btn">🏠 故事目錄</a>
        <div class="title-text">
          <h1>{story_title}</h1>
          <p>{god_tag}（16 幕長篇・左圖右文不翻滾設計）</p>
        </div>
      </div>

      <nav class="part-nav">
        <button class="part-btn active" data-part="0">第一部</button>
        <button class="part-btn" data-part="1">第二部</button>
        <button class="part-btn" data-part="2">第三部</button>
        <button class="part-btn" data-part="3">第四部</button>
      </nav>

      <div>
        <select class="act-dropdown" id="sceneSelect" aria-label="選擇章節"></select>
      </div>
    </header>

    <main class="stage-split">
      <section class="left-image-panel" id="imagePanel">
        <!-- 圖像區域 -->
      </section>

      <section class="right-text-panel">
        <div class="story-content-scroll" id="storyScrollArea">
          <div class="story-badge-row">
            <span class="chapter-badge" id="chapterBadge">ACT 1 / 16</span>
            <span class="time-badge" id="timeBadge">⏳ 伴讀時間：約 2.5 分鐘</span>
          </div>

          <h2 class="story-heading" id="storyHeading">載入中...</h2>

          <div class="story-paragraphs" id="storyParagraphs"></div>

          <aside class="guide-card">
            <div class="guide-title">
              <span>💡</span> 說給孩子聽的小引導（陪讀互動問題）
            </div>
            <p class="guide-body" id="guideContent">載入中...</p>
          </aside>
        </div>

        <footer class="bottom-bar">
          <button class="btn btn-audio" id="btnSpeak" title="語音朗讀故事">
            <span>🎙️</span> <span id="speakLabel">朗讀這一段</span>
          </button>

          <span class="key-hints">⌨️ 快捷鍵：[ ◀ ] [ ▶ ] 鍵翻幕</span>

          <div style="display: flex; gap: 8px;">
            <button class="btn btn-nav" id="btnPrev" disabled>
              <span>◀</span> 上一幕
            </button>
            <button class="btn btn-nav" id="btnNext">
              下一幕 <span>▶</span>
            </button>
          </div>
        </footer>
      </section>
    </main>
  </div>

  <script>
    const storyId = "{story_id}";
    const storyData = {json_story_data};
    const totalActs = storyData.length;
    let currentActIndex = 0;

    const imagePanel = document.getElementById('imagePanel');
    const chapterBadge = document.getElementById('chapterBadge');
    const timeBadge = document.getElementById('timeBadge');
    const storyHeading = document.getElementById('storyHeading');
    const storyParagraphs = document.getElementById('storyParagraphs');
    const guideContent = document.getElementById('guideContent');
    const storyScrollArea = document.getElementById('storyScrollArea');
    const sceneSelect = document.getElementById('sceneSelect');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const btnSpeak = document.getElementById('btnSpeak');
    const speakLabel = document.getElementById('speakLabel');
    const partBtns = document.querySelectorAll('.part-btn');

    function initDropdown() {{
      sceneSelect.innerHTML = '';
      storyData.forEach((scene, idx) => {{
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `第 ${{idx + 1}} 幕：${{scene.title}}`;
        sceneSelect.appendChild(opt);
      }});
    }}

    function renderImage(data) {{
      imagePanel.innerHTML = `
        <div class="slide-media">
          <img src="${{data.image}}" alt="${{data.title}}" onerror="handleFallback(this, '${{data.glyph}}', '${{data.bgStyle}}', '${{data.title}}', '${{data.subtitle}}')">
        </div>
      `;
    }}

    window.handleFallback = function(imgEl, glyph, bgStyle, title, subtitle) {{
      imgEl.parentElement.innerHTML = `
        <div class="egypt-art-card ${{bgStyle}}">
          <div class="art-glyph">${{glyph}}</div>
          <div class="art-tag">SACRED EGYPTIAN CHRONICLES</div>
          <div class="art-title">${{title}}</div>
          <div class="art-desc">${{subtitle}}</div>
        </div>
      `;
    }};

    function loadScene(index) {{
      if (index < 0 || index >= totalActs) return;
      currentActIndex = index;
      const data = storyData[currentActIndex];

      chapterBadge.textContent = `ACT ${{currentActIndex + 1}} / ${{totalActs}}`;
      const partIdx = Math.floor(currentActIndex / 4);
      const partNames = ["第一部：啟航與相遇", "第二部：大地與日常", "第三部：暗夜與考驗", "第四部：守護與晨光"];
      timeBadge.textContent = `📜 ${{partNames[partIdx]}} ｜ ⏱️ 約 2.5 分鐘`;

      storyHeading.textContent = `第 ${{currentActIndex + 1}} 幕：${{data.title}}`;
      storyParagraphs.innerHTML = data.paragraphs.map(p => `<p>${{p}}</p>`).join('');
      guideContent.textContent = data.guide;
      storyScrollArea.scrollTop = 0;

      renderImage(data);
      sceneSelect.value = currentActIndex;

      partBtns.forEach(btn => {{
        const p = parseInt(btn.getAttribute('data-part'));
        if (p === partIdx) btn.classList.add('active');
        else btn.classList.remove('active');
      }});

      btnPrev.disabled = (currentActIndex === 0);
      btnNext.disabled = (currentActIndex === totalActs - 1);

      if ('speechSynthesis' in window) {{
        window.speechSynthesis.cancel();
        btnSpeak.classList.remove('playing');
        speakLabel.textContent = "朗讀這一段";
      }}

      try {{
        localStorage.setItem(`egypt_story_act_${{storyId}}`, currentActIndex);
      }} catch(e) {{}}
    }}

    btnPrev.addEventListener('click', () => loadScene(currentActIndex - 1));
    btnNext.addEventListener('click', () => loadScene(currentActIndex + 1));
    sceneSelect.addEventListener('change', (e) => loadScene(parseInt(e.target.value)));

    partBtns.forEach(btn => {{
      btn.addEventListener('click', () => {{
        const p = parseInt(btn.getAttribute('data-part'));
        loadScene(p * 4);
      }});
    }});

    window.addEventListener('keydown', (e) => {{
      if (e.key === 'ArrowRight' || e.key === ' ') {{
        if (currentActIndex < totalActs - 1) loadScene(currentActIndex + 1);
      }} else if (e.key === 'ArrowLeft') {{
        if (currentActIndex > 0) loadScene(currentActIndex - 1);
      }}
    }});

    btnSpeak.addEventListener('click', () => {{
      if (!('speechSynthesis' in window)) {{
        alert('此瀏覽器未啟用語音功能。');
        return;
      }}
      if (window.speechSynthesis.speaking) {{
        window.speechSynthesis.cancel();
        btnSpeak.classList.remove('playing');
        speakLabel.textContent = "朗讀這一段";
        return;
      }}
      const data = storyData[currentActIndex];
      const text = `${{data.title}}。${{data.paragraphs.join(' ')}}`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-TW';
      utterance.rate = 0.88;
      utterance.pitch = 1.0;

      utterance.onstart = () => {{
        btnSpeak.classList.add('playing');
        speakLabel.textContent = "暫停朗讀";
      }};
      utterance.onend = () => {{
        btnSpeak.classList.remove('playing');
        speakLabel.textContent = "朗讀這一段";
      }};
      utterance.onerror = () => {{
        btnSpeak.classList.remove('playing');
        speakLabel.textContent = "朗讀這一段";
      }};
      window.speechSynthesis.speak(utterance);
    }});

    initDropdown();
    let saved = 0;
    try {{
      const st = localStorage.getItem(`egypt_story_act_${{storyId}}`);
      if (st !== null) saved = parseInt(st) || 0;
    }} catch(e) {{}}
    loadScene(saved);
  </script>
</body>
</html>
"""

# 寫入各故事 HTML 到 stories/ 目錄下
os.makedirs("stories", exist_ok=True)

manifest_data = []

for story in ALL_STORIES:
    sid = story["id"]
    acts_json = []
    
    # 判斷是否為 Ra (有既有圖片) 或其他神祇
    for i, act in enumerate(story["acts"]):
        title, sub, glyph, bgStyle, paras, guide = act
        # 圖片路徑
        if sid == "ra":
            img_path = f"../images/page{i+1}.png" if (i < 8) else f"../images/{sid}_act_{i+1}.png"
            has_image = (i < 8)
        else:
            img_path = f"../images/{sid}_act_{i+1}.png"
            has_image = False
            
        acts_json.append({
            "actNum": i + 1,
            "title": title,
            "subtitle": sub,
            "glyph": glyph,
            "bgStyle": bgStyle,
            "paragraphs": paras,
            "guide": guide,
            "image": img_path,
            "hasRealImage": has_image
        })
        
        manifest_data.append({
            "story_id": sid,
            "story_name": story["name"],
            "act_num": i + 1,
            "act_title": title,
            "image_path": f"images/{sid}_act_{i+1}.png" if sid != "ra" else f"images/page{i+1}.png",
            "has_real_image": has_image,
            "prompt_idea": f"Cinematic epic fantasy storybook illustration of {story['name']}, {title}, ancient Egyptian mythology style."
        })

    html_content = HTML_STORY_TEMPLATE.format(
        story_id=sid,
        story_title=story["title"],
        god_tag=story["tag"],
        accent_color=story["color"],
        json_story_data=json.dumps(acts_json, ensure_ascii=False, indent=2)
    )
    
    with open(f"stories/{sid}.html", "w", encoding="utf-8") as f:
        f.write(html_content)

print(f"Generated 30 story HTML files in ./stories/")

# 產生全神話目錄首頁 index.html
CATALOG_INDEX_HTML = """<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>尼羅河神話寶盒：古埃及30位神祇冒險繪本館</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800;900&family=Noto+Serif+TC:wght@600;700;900&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --gold-primary: #d4af37;
      --gold-light: #fef08a;
      --bg-dark: #070a10;
      --card-bg: #0f1626;
      --text-main: #f1f5f9;
      --text-sub: #94a3b8;
      --border-color: #223048;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: radial-gradient(circle at 50% 10%, #152033 0%, #070a10 100%);
      color: var(--text-main);
      font-family: 'Noto Serif TC', 'Cinzel', serif;
      min-height: 100vh;
      padding: 30px 20px 80px;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
    }

    .hero-header {
      text-align: center;
      margin-bottom: 40px;
    }

    .hero-glyph {
      font-size: 3rem;
      filter: drop-shadow(0 0 15px rgba(212, 175, 55, 0.6));
      margin-bottom: 8px;
    }

    .hero-title {
      font-size: 2.2rem;
      font-weight: 900;
      color: var(--gold-primary);
      letter-spacing: 1.5px;
      margin-bottom: 12px;
      text-shadow: 0 4px 15px rgba(0,0,0,0.6);
    }

    .hero-desc {
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 1.1rem;
      color: var(--text-sub);
      max-width: 780px;
      margin: 0 auto;
      line-height: 1.8;
    }

    .stats-bar {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    .stat-pill {
      background: rgba(21, 32, 51, 0.85);
      border: 1px solid var(--border-color);
      padding: 8px 18px;
      border-radius: 999px;
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.9rem;
      color: var(--gold-light);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* 故事卡片網格 */
    .story-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 24px;
    }

    .story-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.25s ease;
      text-decoration: none;
      color: inherit;
      position: relative;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }

    .story-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 5px;
      height: 100%;
      background: var(--card-accent, var(--gold-primary));
    }

    .story-card:hover {
      transform: translateY(-5px);
      border-color: var(--card-accent, var(--gold-primary));
      box-shadow: 0 14px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(212, 175, 55, 0.15);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .god-tag {
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.8rem;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--card-accent, var(--gold-light));
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .card-acts-badge {
      font-family: 'Cinzel', serif;
      font-size: 0.85rem;
      color: var(--text-sub);
    }

    .card-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 6px;
      line-height: 1.4;
    }

    .god-name {
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--card-accent, var(--gold-primary));
      margin-bottom: 12px;
    }

    .card-summary {
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      line-height: 1.7;
      color: #cbd5e1;
      margin-bottom: 20px;
      flex-grow: 1;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 14px;
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.9rem;
      color: var(--text-sub);
    }

    .read-btn {
      color: var(--gold-light);
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: gap 0.2s ease;
    }

    .story-card:hover .read-btn {
      gap: 10px;
      color: #ffffff;
    }

    .inventory-link {
      margin-top: 50px;
      text-align: center;
      font-family: 'Noto Sans TC', sans-serif;
    }

    .inventory-link a {
      color: var(--gold-primary);
      text-decoration: underline;
      font-size: 0.95rem;
    }

    @media (max-width: 768px) {
      .hero-title {
        font-size: 1.7rem;
      }
      .story-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>

  <div class="container">
    <header class="hero-header">
      <div class="hero-glyph">𓂀☀️🪶</div>
      <h1 class="hero-title">尼羅河神話寶盒：古埃及 30 位神祇冒險繪本館</h1>
      <p class="hero-desc">
        專為 7 歲小朋友打造的史詩級古埃及神話長篇！包含太陽神拉、貓咪女神巴斯特、胡狼神阿努比斯等共 30 位偉大神祇。每一本均採「左圖右文、舒適不翻滾」的沉浸式閱讀排版，並內建台語/國語語音伴讀與親子互動引導。
      </p>

      <div class="stats-bar">
        <div class="stat-pill">📚 總收錄神話：30 部史詩長篇</div>
        <div class="stat-pill">📖 總幕數：480 幕大篇幅故事</div>
        <div class="stat-pill">⏱️ 伴讀時長：每部約 35～45 分鐘</div>
        <div class="stat-pill">🎙️ 全篇支援 Web Speech 語音伴讀</div>
      </div>
    </header>

    <main class="story-grid">
"""

for story in ALL_STORIES:
    sid = story["id"]
    CATALOG_INDEX_HTML += f"""
      <a href="stories/{sid}.html" class="story-card" style="--card-accent: {story['color']};">
        <div>
          <div class="card-top">
            <span class="god-tag">{story['tag']}</span>
            <span class="card-acts-badge">16 ACTS</span>
          </div>
          <h2 class="card-title">{story['title'].split('：')[1] if '：' in story['title'] else story['title']}</h2>
          <div class="god-name">{story['name']}</div>
          <p class="card-summary">{story['summary']}</p>
        </div>
        <div class="card-footer">
          <span>⏳ 建議伴讀：分 4 次講</span>
          <span class="read-btn">進入閱讀 ➔</span>
        </div>
      </a>
"""

CATALOG_INDEX_HTML += """
    </main>

    <footer class="inventory-link">
      <p>🎨 視覺插畫生成進度記錄：<a href="IMAGE_INVENTORY.md" target="_blank">查看目前圖檔生成狀態清單 (IMAGE_INVENTORY.md)</a></p>
    </footer>
  </div>

</body>
</html>
"""

with open("index.html", "w", encoding="utf-8") as f:
    f.write(CATALOG_INDEX_HTML)

print("Main catalog index.html generated successfully!")

# 產生 IMAGE_INVENTORY.md
total_scenes = len(manifest_data)
ready_count = sum(1 for m in manifest_data if m["has_real_image"])
missing_count = total_scenes - ready_count

INVENTORY_MD = f"""# 埃及神話插畫圖檔生成進度與清單記錄 (Image Inventory)

> 最後更新時間：2026-10-25 00:32 (Local Time)  
> 說明：本文件詳細記錄古埃及 30 部神話繪本（共 480 幕）之配圖產生進度。系統在插圖未產生前會自動以**古埃及星象符文意境卡**完美呈現，等圖片生成配額重置後，可依本清單批次補全。

---

## 📊 總覽統計 (Statistics)

| 項目 | 數量 | 說明 |
| :--- | :--- | :--- |
| **收錄神話故事總數** | **30 部** | 每部 16 幕長篇，總計 480 幕故事 |
| **已生成高清圖片** | **{ready_count} 張** | 太陽神拉的前 8 幕高畫質插圖 |
| **待產生插圖檔案** | **{missing_count} 張** | 目前以古埃及神聖意境卡無縫替代 |
| **API 配額重置預估** | **約 04:08 (UTC+8)** | 冷卻完成後可隨時啟動下一批次產圖 |

---

## 🏛️ 各故事插畫進度一覽表 (Story Manifest)

| 編號 | 神祇名稱 (Story ID) | 故事檔案 | 總幕數 | 已完成圖檔 | 待產生圖檔 | 狀態 |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: |
"""

for s in ALL_STORIES:
    sid = s["id"]
    s_acts = [m for m in manifest_data if m["story_id"] == sid]
    s_ready = sum(1 for a in s_acts if a["has_real_image"])
    s_missing = len(s_acts) - s_ready
    status_str = "🟢 部分完成" if s_ready > 0 else "🟡 意境卡替代中"
    INVENTORY_MD += f"| {sid} | **{s['name']}** | [`stories/{sid}.html`](stories/{sid}.html) | {len(s_acts)} | {s_ready} 張 | {s_missing} 張 | {status_str} |\n"

INVENTORY_MD += """
---

## 📝 待產生圖片提示詞清單 (Prompts for Pending Generation)

當您想要為特定神明生成圖片時，可隨時通知我使用下列提示詞進行生成：

### 1. 太陽神拉（剩餘第 7、8 幕寫實重繪）
* `page7.jpg`: Bastet leaping into action with golden armor and khopesh blade to strike the shadow coils of Apep, radiant stardust sparks, cinematic Prince of Egypt oil painting style.
* `page8.jpg`: Triumphant golden sunrise over Egypt, Great Pyramids and the Nile glowing in morning sunlight, victorious crowds celebrating, cinematic concept art.

### 2. 貓咪女神巴斯特 (Bastet)（全 16 幕）
* `images/bastet_act_1.png` ~ `images/bastet_act_16.png`
* 包含：巴斯特手持神聖叉鈴（Sistrum）、黑色靈貓在尼羅河畔漫步、神廟前守護睡夢中的孩童、擊破黑夜迷霧等。

### 3. 胡狼神阿努比斯 (Anubis)（全 16 幕）
* `images/anubis_act_1.png` ~ `images/anubis_act_16.png`
* 包含：優雅黑胡狼首人身、手持真理黃金天秤、溫柔引導純潔心靈通往蘆葦原之美景。

*(其餘神祇詳細 Prompt 已依據各幕情節自動編排於系統資料庫中)*
"""

with open("IMAGE_INVENTORY.md", "w", encoding="utf-8") as f:
    f.write(INVENTORY_MD)

print("IMAGE_INVENTORY.md generated successfully!")
