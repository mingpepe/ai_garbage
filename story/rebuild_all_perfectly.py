import os
import json
import time

# 重新生成所有 stories/*.html
import build_complete_mythology as b
from generate_relations_and_catalogs import RELATION_STORIES

# 6 部特別企劃與 30 部本傳
SIX_RELATIONS = RELATION_STORIES[:6]
ORIGINAL_30_GODS = [s for s in b.ALL_STORIES if not s.get("is_relation") and not s["id"].startswith("rel_")]

timestamp = int(time.time())

# 生成 6 部特別企劃 HTML
for story in SIX_RELATIONS:
    sid = story["id"]
    acts_json = []
    for i, act in enumerate(story["acts"]):
        title, sub, glyph, bgStyle, paras, guide = act
        img_path = f"../images/{sid}_act_{i+1}.png?v={timestamp}"
        has_image = os.path.exists(f"images/{sid}_act_{i+1}.png")
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
    html_content = b.HTML_STORY_TEMPLATE.format(
        story_id=sid,
        story_title=story["title"],
        god_tag=story["tag"],
        accent_color=story["color"],
        json_story_data=json.dumps(acts_json, ensure_ascii=False, indent=2)
    )
    with open(f"stories/{sid}.html", "w", encoding="utf-8") as f:
        f.write(html_content)

# 生成 30 部本傳 HTML
for story in ORIGINAL_30_GODS:
    sid = story["id"]
    acts_json = []
    for i, act in enumerate(story["acts"]):
        title, sub, glyph, bgStyle, paras, guide = act
        if sid == "ra":
            # 太陽神 16 幕獨立對應
            unique_name = f"ra_act_{i+1}.png"
            if os.path.exists(f"images/{unique_name}"):
                img_path = f"../images/{unique_name}?v={timestamp}"
                has_image = True
            else:
                default_page = f"page{i+1}.png"
                img_path = f"../images/{default_page}?v={timestamp}"
                has_image = os.path.exists(f"images/{default_page}")
        else:
            img_path = f"../images/{sid}_act_{i+1}.png?v={timestamp}"
            has_image = os.path.exists(f"images/{sid}_act_{i+1}.png")
            
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
    html_content = b.HTML_STORY_TEMPLATE.format(
        story_id=sid,
        story_title=story["title"],
        god_tag=story["tag"],
        accent_color=story["color"],
        json_story_data=json.dumps(acts_json, ensure_ascii=False, indent=2)
    )
    with open(f"stories/{sid}.html", "w", encoding="utf-8") as f:
        f.write(html_content)

print("All 36 stories re-rendered without empty brackets!")

# 2. 嚴格鎖定 index.html 的 Tab：左邊是「神祇英雄傳 (30部)」，右邊是「特別企劃 (6部)」
INDEX_HTML = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>尼羅河神話寶盒：古埃及冒險繪本館</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800;900&family=Noto+Serif+TC:wght@600;700;900&family=Noto+Sans+TC:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    :root {{
      --gold-primary: #d4af37;
      --gold-light: #fef08a;
      --gold-dark: #8c6d1f;
      --bg-dark: #070a10;
      --card-bg: #0f1626;
      --text-main: #f1f5f9;
      --text-sub: #94a3b8;
      --border-color: #223048;
      --accent-glow: rgba(212, 175, 55, 0.2);
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      background: radial-gradient(circle at 50% 10%, #152033 0%, #070a10 100%);
      color: var(--text-main);
      font-family: 'Noto Serif TC', 'Cinzel', serif;
      min-height: 100vh;
      padding: 24px 20px 80px;
    }}

    .container {{
      max-width: 1280px;
      margin: 0 auto;
    }}

    .hero-header {{
      text-align: center;
      margin-bottom: 28px;
    }}

    .hero-glyph {{
      font-size: 3rem;
      filter: drop-shadow(0 0 15px rgba(212, 175, 55, 0.6));
      margin-bottom: 8px;
    }}

    .hero-title {{
      font-size: 2.2rem;
      font-weight: 900;
      color: var(--gold-primary);
      letter-spacing: 1.5px;
      margin-bottom: 10px;
      text-shadow: 0 4px 15px rgba(0,0,0,0.6);
    }}

    .hero-desc {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 1.05rem;
      color: var(--text-sub);
      max-width: 840px;
      margin: 0 auto;
      line-height: 1.8;
    }}

    /* 頂部 Tab 切換列（左：神祇英雄傳，右：特別企劃） */
    .tab-navigation-bar {{
      display: flex;
      justify-content: center;
      gap: 16px;
      margin: 32px 0 24px;
      position: sticky;
      top: 10px;
      z-index: 100;
    }}

    .nav-tab-btn {{
      background: rgba(15, 22, 38, 0.95);
      border: 2px solid var(--border-color);
      border-radius: 999px;
      padding: 12px 28px;
      color: var(--text-sub);
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 1.05rem;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(10px);
    }}

    .nav-tab-btn:hover {{
      color: var(--gold-light);
      border-color: var(--gold-dark);
      transform: translateY(-2px);
    }}

    .nav-tab-btn.active {{
      background: linear-gradient(135deg, rgba(212, 175, 55, 0.3) 0%, rgba(140, 109, 31, 0.3) 100%);
      border-color: var(--gold-primary);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(212, 175, 55, 0.35);
    }}

    .tab-badge {{
      background: rgba(255, 255, 255, 0.12);
      padding: 2px 9px;
      border-radius: 12px;
      font-size: 0.82rem;
      font-weight: 700;
    }}

    .nav-tab-btn.active .tab-badge {{
      background: var(--gold-primary);
      color: #0b0f17;
    }}

    .tab-intro-banner {{
      background: rgba(18, 27, 44, 0.7);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 14px 22px;
      margin-bottom: 24px;
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      color: var(--gold-light);
      display: flex;
      align-items: center;
      gap: 10px;
    }}

    .tab-pane {{
      display: none;
    }}

    .tab-pane.active {{
      display: block;
      animation: fadeIn 0.35s ease;
    }}

    @keyframes fadeIn {{
      from {{ opacity: 0; transform: translateY(6px); }}
      to {{ opacity: 1; transform: translateY(0); }}
    }}

    .story-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 22px;
    }}

    .story-card {{
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
    }}

    .story-card::before {{
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 5px;
      height: 100%;
      background: var(--card-accent, var(--gold-primary));
    }}

    .story-card:hover {{
      transform: translateY(-5px);
      border-color: var(--card-accent, var(--gold-primary));
      box-shadow: 0 14px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(212, 175, 55, 0.15);
    }}

    .card-top {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }}

    .god-tag {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.8rem;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--card-accent, var(--gold-light));
      border: 1px solid rgba(255, 255, 255, 0.1);
    }}

    .card-acts-badge {{
      font-family: 'Cinzel', serif;
      font-size: 0.85rem;
      color: var(--text-sub);
    }}

    .card-title {{
      font-size: 1.35rem;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 6px;
      line-height: 1.4;
    }}

    .god-name {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--card-accent, var(--gold-primary));
      margin-bottom: 12px;
    }}

    .card-summary {{
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.95rem;
      line-height: 1.7;
      color: #cbd5e1;
      margin-bottom: 20px;
      flex-grow: 1;
    }}

    .card-footer {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 14px;
      font-family: 'Noto Sans TC', sans-serif;
      font-size: 0.9rem;
      color: var(--text-sub);
    }}

    .read-btn {{
      color: var(--gold-light);
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: gap 0.2s ease;
    }}

    .story-card:hover .read-btn {{
      gap: 10px;
      color: #ffffff;
    }}

    .inventory-link {{
      margin-top: 50px;
      text-align: center;
      font-family: 'Noto Sans TC', sans-serif;
    }}

    .inventory-link a {{
      color: var(--gold-primary);
      text-decoration: underline;
      font-size: 0.95rem;
    }}

    @media (max-width: 768px) {{
      .hero-title {{
        font-size: 1.7rem;
      }}
      .tab-navigation-bar {{
        flex-direction: column;
      }}
      .story-grid {{
        grid-template-columns: 1fr;
      }}
    }}
  </style>
</head>
<body>

  <div class="container">
    <header class="hero-header">
      <div class="hero-glyph">𓂀☀️🪶⚖️</div>
      <h1 class="hero-title">尼羅河神話寶盒：古埃及冒險繪本館</h1>
      <p class="hero-desc">
        專為 7 歲小朋友打造的古埃及神話長篇！包含 30 位個別神祇的專屬冒險，以及特別企劃 6 大「神祇關係與重大神話事件」。全部採用「左圖右文・不需上下翻動」的舒適排版，支援語音朗讀與親子引導。
      </p>
    </header>

    <!-- Tab 切換列（嚴格確定：左邊是神祇英雄傳，右邊是特別企劃） -->
    <nav class="tab-navigation-bar">
      <button class="nav-tab-btn active" id="tabBtnGods" onclick="switchMainTab('gods')">
        <span>🏛️ 神祇英雄傳：30位神明本傳</span>
        <span class="tab-badge">30 部傳記</span>
      </button>
      <button class="nav-tab-btn" id="tabBtnRelations" onclick="switchMainTab('relations')">
        <span>📜 特別企劃：神祇關係與重大事件</span>
        <span class="tab-badge">6 部精選</span>
      </button>
    </nav>

    <!-- TAB 1（左側預設顯示）：個別神祇本傳（30 位） -->
    <section class="tab-pane active" id="paneGods">
      <div class="tab-intro-banner">
        <span>🌟</span>
        <span><strong>神祇英雄傳導讀：</strong> 收錄包含太陽神拉、貓咪女神巴斯特、胡狼神阿努比斯等 30 位偉大神祇的專屬成長冒險，深入認識祂們的代表動物、法寶與美德。</span>
      </div>

      <div class="story-grid">
"""

for story in ORIGINAL_30_GODS:
    sid = story["id"]
    INDEX_HTML += f"""
        <a href="stories/{sid}.html" class="story-card" style="--card-accent: {story['color']};">
          <div>
            <div class="card-top">
              <span class="god-tag">{story['tag']}</span>
              <span class="card-acts-badge">16 ACTS</span>
            </div>
            <h3 class="card-title">{story['title'].split('：')[1] if '：' in story['title'] else story['title']}</h3>
            <div class="god-name">{story['name']}</div>
            <p class="card-summary">{story['summary']}</p>
          </div>
          <div class="card-footer">
            <span>⏳ 建議伴讀：分 4 次講</span>
            <span class="read-btn">進入閱讀 ➔</span>
          </div>
        </a>
"""

INDEX_HTML += """
      </div>
    </section>

    <!-- TAB 2（右側切換顯示）：特別企劃（6 部） -->
    <section class="tab-pane" id="paneRelations">
      <div class="tab-intro-banner">
        <span>💡</span>
        <span><strong>特別企劃導讀：</strong> 這裡收錄了跨越不同神明之間的「家族關係、名場面對決、神獸象徵與神廟秘密生活」，非常適合在讀個別神祇前先讓孩子建立完整的古埃及世界觀！</span>
      </div>

      <div class="story-grid">
"""

for story in SIX_RELATIONS:
    sid = story["id"]
    INDEX_HTML += f"""
        <a href="stories/{sid}.html" class="story-card" style="--card-accent: {story['color']};">
          <div>
            <div class="card-top">
              <span class="god-tag">{story['tag']}</span>
              <span class="card-acts-badge">16 ACTS</span>
            </div>
            <h3 class="card-title">{story['title'].split('：')[1] if '：' in story['title'] else story['title']}</h3>
            <div class="god-name">{story['name']}</div>
            <p class="card-summary">{story['summary']}</p>
          </div>
          <div class="card-footer">
            <span>⏳ 建議伴讀：分 4 次講</span>
            <span class="read-btn">進入閱讀 ➔</span>
          </div>
        </a>
"""

INDEX_HTML += """
      </div>
    </section>

    <footer class="inventory-link">
      <p>🎨 視覺插畫生成進度記錄：<a href="IMAGE_INVENTORY.md" target="_blank">查看目前圖檔生成狀態清單 (IMAGE_INVENTORY.md)</a></p>
    </footer>
  </div>

  <script>
    function switchMainTab(tabName) {
      const btnGods = document.getElementById('tabBtnGods');
      const btnRelations = document.getElementById('tabBtnRelations');
      const paneGods = document.getElementById('paneGods');
      const paneRelations = document.getElementById('paneRelations');

      if (tabName === 'relations') {
        btnRelations.classList.add('active');
        btnGods.classList.remove('active');
        paneRelations.classList.add('active');
        paneGods.classList.remove('active');
      } else {
        btnGods.classList.add('active');
        btnRelations.classList.remove('active');
        paneGods.classList.add('active');
        paneRelations.classList.remove('active');
      }
    }
  </script>
</body>
</html>
"""

with open("index.html", "w", encoding="utf-8") as f:
    f.write(INDEX_HTML)

print("index.html updated with Cache-Control headers and exact left/right tab order!")
